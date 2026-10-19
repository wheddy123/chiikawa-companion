import * as THREE from 'three';
import type { MascotState, CursorPosition, WindowBounds, SystemTelemetry } from '../types';

export interface BoneRotations {
  head: THREE.Euler;
  body: THREE.Euler;
  earL: THREE.Euler;
  earR: THREE.Euler;
  handL: THREE.Euler;
  handR: THREE.Euler;
  footL: THREE.Euler;
  footR: THREE.Euler;
}

export interface BonePositions {
  body: THREE.Vector3;
}

function easeInOutCubic(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

export class ProceduralAnimator {
  private currentState: MascotState = 'idle';
  private targetState: MascotState = 'idle';
  private stateTime: number = 0;
  private transitionAlpha: number = 1.0;
  private transitionDuration: number = 0.35; // crossfade duration in seconds

  // Base transform
  private basePosition = new THREE.Vector3(0, 0, 0);
  private baseScale = new THREE.Vector3(1, 1, 1);

  // Current calculated offsets
  public currentPosition = new THREE.Vector3();
  public currentRotation = new THREE.Euler(0, 0, 0, 'YXZ');
  public currentScale = new THREE.Vector3(1, 1, 1);

  // Bone articulation transforms (relative to bone rest pose)
  public hasBones: boolean = false;
  public boneRotations: BoneRotations = {
    head: new THREE.Euler(0, 0, 0, 'YXZ'),
    body: new THREE.Euler(0, 0, 0, 'YXZ'),
    earL: new THREE.Euler(0, 0, 0, 'YXZ'),
    earR: new THREE.Euler(0, 0, 0, 'YXZ'),
    handL: new THREE.Euler(0, 0, 0, 'YXZ'),
    handR: new THREE.Euler(0, 0, 0, 'YXZ'),
    footL: new THREE.Euler(0, 0, 0, 'YXZ'),
    footR: new THREE.Euler(0, 0, 0, 'YXZ'),
  };
  public bonePositions: BonePositions = {
    body: new THREE.Vector3(0, 0, 0),
  };

  // Shy glance away when cursor approaches closely
  private isShy: boolean = false;
  private shyTimer: number = 0;
  private shyCooldown: number = 0;
  private shyDirection: number = 1; // -1 for left, 1 for right
  private wasCursorClose: boolean = false;

  // Inactivity & sitting flat posture
  private timeSinceLastInteraction: number = 0;
  private isSitting: boolean = false;
  private sitTransitionAlpha: number = 0.0;
  private sitCooldown: number = 0;
  private readonly idleSitThreshold: number = 45; // 45s of inactivity

  // Organic ear twitching
  private earTwitchTimer: number = 7.0;
  private earTwitchActiveTime: number = 0;
  private earTwitchType: 'left' | 'right' | 'both' = 'left';

  // Target values for crossfade
  private fromPos = new THREE.Vector3();
  private fromRot = new THREE.Euler();
  private fromScale = new THREE.Vector3(1, 1, 1);

  // Cursor tracking with exponential spring filter
  private cursorTargetRotY: number = 0;
  private cursorTargetRotX: number = 0;
  private currentCursorRotY: number = 0;
  private currentCursorRotX: number = 0;
  private lastCursorX: number = -9999;
  private lastCursorY: number = -9999;

  // Living Mascot Hardware Telemetry modulation
  private targetCpuLoad: number = 0.15; // 0.0 to 1.0
  private currentCpuLoad: number = 0.15;
  private memPressure: number = 0.50; // 0.0 to 1.0

  // Reduced motion preference
  private reducedMotion: boolean = false;

  // Drag squish & gentle dangling physics
  private isDragging: boolean = false;
  private dragVelocity = new THREE.Vector2(0, 0);
  private smoothedDragVelocity = new THREE.Vector2(0, 0);
  private releaseSpringTime: number = 999;

  // Band-aid Muted struggle state
  private isMuted: boolean = false;
  private struggleTimer: number = 0;

  // Head petting / nựng nựng interaction
  private pettingIntensity: number = 0;
  private pettingStrokeX: number = 0;
  public onPettingTrigger?: () => void;

  constructor() {
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => {
      this.reducedMotion = e.matches;
    });
  }

  public setHasBones(has: boolean): void {
    this.hasBones = has;
  }

  public notifyInteraction(): void {
    this.timeSinceLastInteraction = 0;
    if (this.isSitting) {
      this.isSitting = false;
      this.sitCooldown = 30.0; // 30s cooldown before sitting down again
    }
  }

  public getIsSitting(): boolean {
    return this.isSitting;
  }

  public forceSit(sit: boolean = true): void {
    this.isSitting = sit;
    if (sit) {
      this.sitCooldown = 0;
      this.timeSinceLastInteraction = 999;
    } else {
      this.notifyInteraction();
    }
  }

  public getIsShy(): boolean {
    return this.isShy;
  }

  public feedPetting(speed: number, movementX: number): void {
    if (this.reducedMotion) return;
    this.notifyInteraction();
    this.pettingIntensity = Math.min(1.0, this.pettingIntensity + speed * 0.06);
    this.pettingStrokeX = THREE.MathUtils.clamp(this.pettingStrokeX + movementX * 0.04, -0.4, 0.4);
    if (this.pettingIntensity > 0.65 && this.onPettingTrigger) {
      this.onPettingTrigger();
    }
  }

  public getPettingIntensity(): number {
    return this.pettingIntensity;
  }

  public setTelemetry(telemetry: SystemTelemetry): void {
    this.targetCpuLoad = Math.max(0, Math.min(1, telemetry.cpuUsagePercent / 100));
    this.memPressure = Math.max(0, Math.min(1, telemetry.memUsagePercent / 100));
  }

  public getCpuLoad(): number {
    return this.currentCpuLoad;
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (muted) {
      // Brief 1.6s comical protest struggle, then calm down
      this.struggleTimer = 1.6;
    } else {
      this.struggleTimer = 0;
    }
  }

  public triggerStruggle(duration: number = 1.0): void {
    if (this.isMuted) {
      this.struggleTimer = duration;
    }
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public setBaseTransform(position: THREE.Vector3, scale: THREE.Vector3): void {
    this.basePosition.copy(position);
    this.baseScale.copy(scale);
    this.currentPosition.copy(position);
    this.currentScale.copy(scale);
  }

  public setState(state: MascotState): void {
    if (this.currentState === state && this.targetState === state) return;

    // Snapshot current state for crossfade
    this.fromPos.copy(this.currentPosition);
    this.fromRot.copy(this.currentRotation);
    this.fromScale.copy(this.currentScale);

    this.targetState = state;
    this.transitionAlpha = 0.0;
    this.stateTime = 0;
  }

  public getState(): MascotState {
    return this.currentState;
  }

  public isIdle(): boolean {
    return this.currentState === 'idle' && this.targetState === 'idle';
  }

  public updateCursor(cursor: CursorPosition, winBounds: WindowBounds): void {
    if (this.reducedMotion) {
      this.cursorTargetRotX = 0;
      this.cursorTargetRotY = 0;
      return;
    }

    // Mascot center in screen coordinates (center of eyes/forehead)
    const mascotCenterX = winBounds.x + winBounds.width / 2;
    const mascotCenterY = winBounds.y + winBounds.height * 0.52;

    const dx = cursor.x - mascotCenterX;
    const dy = cursor.y - mascotCenterY;
    const dist = Math.hypot(dx, dy);

    // Only register user interaction when cursor actually moves nearby
    const moveDist = Math.hypot(cursor.x - this.lastCursorX, cursor.y - this.lastCursorY);
    if (moveDist > 4.0) {
      this.lastCursorX = cursor.x;
      this.lastCursorY = cursor.y;
      if (dist < 280) {
        this.notifyInteraction();
      }
    }

    // Shy glance away when cursor approaches closely (< 190px)
    if (dist < 190) {
      if (!this.wasCursorClose) {
        this.wasCursorClose = true;
        if (
          this.shyCooldown <= 0 &&
          this.isIdle() &&
          !this.isDragging &&
          !this.isMuted &&
          !this.isSitting &&
          Math.random() < 0.40
        ) {
          this.isShy = true;
          this.shyTimer = 2.6;
          this.shyCooldown = 22.0; // 22s cooldown
          // Turn head away from cursor: if cursor is to the left, look right; else look left
          this.shyDirection = dx < 0 ? 1 : -1;
        }
      }
    } else if (dist > 250) {
      this.wasCursorClose = false;
    }

    // Full 360-degree desktop tracking without blind spots
    // Expressive head angles (28 deg yaw, 24 deg pitch)
    const maxAngleX = THREE.MathUtils.degToRad(24);
    const maxAngleY = THREE.MathUtils.degToRad(28);

    // Responsive smooth-saturating look response:
    // dx and dy gracefully track across desktop without dead zones
    const factorX = THREE.MathUtils.clamp(dx / 320, -1.0, 1.0);
    const factorY = THREE.MathUtils.clamp(dy / 220, -1.0, 1.0);

    this.cursorTargetRotY = factorX * maxAngleY;
    this.cursorTargetRotX = factorY * maxAngleX;
  }

  public setDragging(dragging: boolean, vx: number = 0, vy: number = 0): void {
    if (this.isDragging && !dragging) {
      this.releaseSpringTime = 0;
      this.dragVelocity.set(0, 0);
    }
    this.isDragging = dragging;
    if (dragging) {
      this.dragVelocity.set(vx, vy);
      this.notifyInteraction();
    }
  }

  public update(delta: number): void {
    this.stateTime += delta;
    this.timeSinceLastInteraction += delta;
    this.shyCooldown = Math.max(0, this.shyCooldown - delta);
    this.sitCooldown = Math.max(0, this.sitCooldown - delta);

    // Advance crossfade transition
    if (this.transitionAlpha < 1.0) {
      this.transitionAlpha += delta / this.transitionDuration;
      if (this.transitionAlpha >= 1.0) {
        this.transitionAlpha = 1.0;
        this.currentState = this.targetState;
      }
    }

    // Exponential spring filter for liquid-smooth organic cursor tracking with natural subtle lag
    const smoothDamp = 1.0 - Math.exp(-7.5 * delta);
    this.currentCursorRotY += (this.cursorTargetRotY - this.currentCursorRotY) * smoothDamp;
    this.currentCursorRotX += (this.cursorTargetRotX - this.currentCursorRotX) * smoothDamp;

    // Smooth CPU load transitions for Living Mascot
    const cpuDamp = 1.0 - Math.exp(-2.5 * delta);
    this.currentCpuLoad += (this.targetCpuLoad - this.currentCpuLoad) * cpuDamp;

    // Handle shy glance timer
    if (this.isShy) {
      this.shyTimer -= delta;
      if (this.shyTimer <= 0) {
        this.isShy = false;
      }
    }

    // Handle long idle sitting flat posture
    if (
      this.isIdle() &&
      !this.isDragging &&
      !this.isMuted &&
      !this.isSitting &&
      this.sitCooldown <= 0
    ) {
      if (this.timeSinceLastInteraction > this.idleSitThreshold) {
        this.isSitting = true;
      }
    }

    if (this.isSitting) {
      this.sitTransitionAlpha = Math.min(1.0, this.sitTransitionAlpha + delta / 0.85);
    } else {
      this.sitTransitionAlpha = Math.max(0.0, this.sitTransitionAlpha - delta / 0.50);
    }
    const sitWeight = easeInOutCubic(this.sitTransitionAlpha);

    // Handle organic ear twitching
    this.earTwitchTimer -= delta;
    if (this.earTwitchTimer <= 0) {
      this.earTwitchActiveTime = 0.38;
      const r = Math.random();
      this.earTwitchType = r < 0.45 ? 'left' : r < 0.85 ? 'right' : 'both';
      this.earTwitchTimer =
        (this.isSitting ? 4.5 : 8.0) + Math.random() * (this.isSitting ? 4.0 : 7.0);
    }

    let earFlutter = 0;
    if (this.earTwitchActiveTime > 0) {
      this.earTwitchActiveTime -= delta;
      const prog = 1.0 - this.earTwitchActiveTime / 0.38;
      const decay = Math.exp(-prog * 4.5);
      earFlutter = Math.sin(prog * Math.PI * 7.0) * decay * 0.22;
    }

    if (this.reducedMotion) {
      this.currentPosition.copy(this.basePosition);
      this.currentScale.copy(this.baseScale);
      this.currentRotation.set(0, 0, 0);
      return;
    }

    // Calculate pose for targetState
    const targetPose = this.calculateStatePose(this.targetState, this.stateTime);

    if (this.transitionAlpha < 1.0) {
      // Crossfade from previous pose
      this.currentPosition.lerpVectors(this.fromPos, targetPose.pos, this.transitionAlpha);
      this.currentScale.lerpVectors(this.fromScale, targetPose.scale, this.transitionAlpha);
      if (!this.hasBones) {
        this.currentRotation.x =
          THREE.MathUtils.lerp(this.fromRot.x, targetPose.rot.x, this.transitionAlpha) + this.currentCursorRotX;
        this.currentRotation.y =
          THREE.MathUtils.lerp(this.fromRot.y, targetPose.rot.y, this.transitionAlpha) + this.currentCursorRotY;
      } else {
        this.currentRotation.x = THREE.MathUtils.lerp(this.fromRot.x, targetPose.rot.x, this.transitionAlpha);
        this.currentRotation.y = THREE.MathUtils.lerp(this.fromRot.y, targetPose.rot.y, this.transitionAlpha);
      }
      this.currentRotation.z = THREE.MathUtils.lerp(this.fromRot.z, targetPose.rot.z, this.transitionAlpha);
    } else {
      this.currentPosition.copy(targetPose.pos);
      this.currentScale.copy(targetPose.scale);
      if (!this.hasBones) {
        this.currentRotation.x = targetPose.rot.x + this.currentCursorRotX;
        this.currentRotation.y = targetPose.rot.y + this.currentCursorRotY;
      } else {
        this.currentRotation.x = targetPose.rot.x;
        this.currentRotation.y = targetPose.rot.y;
      }
      this.currentRotation.z = targetPose.rot.z;
    }

    // Articulate bones when rigged model is active
    if (this.hasBones) {
      // 1. Calculate Cursor Tracking for Head & Body
      let targetHeadRotY = this.currentCursorRotY * 0.75;
      let targetHeadRotX = this.currentCursorRotX * 0.75;
      let targetHeadRotZ = 0;

      let targetBodyRotY = this.currentCursorRotY * 0.25;
      let targetBodyRotX = this.currentCursorRotX * 0.25;

      // 2. Shy Glance Away Override
      if (this.isShy) {
        let shyBlend = 1.0;
        if (this.shyTimer > 2.2) {
          shyBlend = (2.6 - this.shyTimer) / 0.4;
        } else if (this.shyTimer < 0.5) {
          shyBlend = this.shyTimer / 0.5;
        }

        // Head turns away shyly, tilts down slightly
        targetHeadRotY =
          this.shyDirection * 0.52 * shyBlend + this.currentCursorRotY * 0.75 * (1.0 - shyBlend * 0.8);
        targetHeadRotX =
          0.10 * shyBlend + this.currentCursorRotX * 0.75 * (1.0 - shyBlend * 0.8);
        targetHeadRotZ = -this.shyDirection * 0.08 * shyBlend;

        // Body turns slightly in same direction
        targetBodyRotY =
          this.shyDirection * 0.16 * shyBlend + this.currentCursorRotY * 0.25;
      }

      this.boneRotations.head.set(targetHeadRotX, targetHeadRotY, targetHeadRotZ, 'YXZ');
      this.boneRotations.body.set(targetBodyRotX, targetBodyRotY, 0, 'YXZ');
      this.bonePositions.body.set(0, 0, 0);

      // 3. Sitting Flat Posture (matching reference plushie photo: flat bottom, feet forward, paws on tummy)
      if (sitWeight > 0.001) {
        // Lower body down flat to ledge
        this.bonePositions.body.y = -0.06 * sitWeight;
        this.boneRotations.body.x += -0.05 * sitWeight;

        // Both legs/feet stretch forward and splay outwards like the cute plushie!
        // Negative X rotates feet forward towards the camera (+Z)
        this.boneRotations.footL.x = -1.25 * sitWeight;
        this.boneRotations.footL.z = 0.25 * sitWeight;
        this.boneRotations.footL.y = 0.10 * sitWeight;

        this.boneRotations.footR.x = -1.25 * sitWeight;
        this.boneRotations.footR.z = -0.25 * sitWeight;
        this.boneRotations.footR.y = -0.10 * sitWeight;

        // Little intermittent feet wiggles every ~8-12 seconds while sitting
        const wigglePhase = (this.stateTime * 0.25) % 1.0;
        if (wigglePhase < 0.22) {
          const footWiggle = Math.sin(this.stateTime * 14.0) * 0.10 * sitWeight;
          this.boneRotations.footL.x += footWiggle;
          this.boneRotations.footR.x -= footWiggle;
        }

        // Both paws folded together over tummy/chest like the plushie!
        this.boneRotations.handL.x = -0.65 * sitWeight;
        this.boneRotations.handL.y = 0.25 * sitWeight;
        this.boneRotations.handL.z = 0.70 * sitWeight;

        this.boneRotations.handR.x = -0.65 * sitWeight;
        this.boneRotations.handR.y = -0.25 * sitWeight;
        this.boneRotations.handR.z = -0.70 * sitWeight;

        // Deep peaceful breathing while sitting
        const sitBreath = Math.sin(this.stateTime * 1.4) * 0.025 * sitWeight;
        this.boneRotations.head.x += 0.04 * sitWeight + sitBreath;
        this.boneRotations.earL.z -= 0.06 * sitWeight;
        this.boneRotations.earR.z += 0.06 * sitWeight;
      } else {
        this.boneRotations.footL.set(0, 0, 0, 'YXZ');
        this.boneRotations.footR.set(0, 0, 0, 'YXZ');
        this.boneRotations.handL.set(0, 0, 0, 'YXZ');
        this.boneRotations.handR.set(0, 0, 0, 'YXZ');
      }

      // 4. Ear Twitching Flutter
      if (earFlutter !== 0) {
        if (this.earTwitchType === 'left' || this.earTwitchType === 'both') {
          this.boneRotations.earL.z = earFlutter;
          this.boneRotations.earL.x = earFlutter * 0.35;
        } else {
          this.boneRotations.earL.set(0, 0, 0, 'YXZ');
        }

        if (this.earTwitchType === 'right' || this.earTwitchType === 'both') {
          this.boneRotations.earR.z = -earFlutter;
          this.boneRotations.earR.x = earFlutter * 0.35;
        } else {
          this.boneRotations.earR.set(0, 0, 0, 'YXZ');
        }
      } else {
        this.boneRotations.earL.set(0, 0, 0, 'YXZ');
        this.boneRotations.earR.set(0, 0, 0, 'YXZ');
      }

      // 5. Head Petting / Nựng nựng interaction
      if (this.pettingIntensity > 0.001) {
        this.pettingIntensity = Math.max(0, this.pettingIntensity - delta * 1.5);
        this.pettingStrokeX *= Math.exp(-6.0 * delta);
        const p = this.pettingIntensity;

        // Soft squishy purring compression (nhún cả người nựng nựng)
        const petSquish = Math.sin(this.stateTime * 14.0) * 0.03 * p;
        this.currentScale.y *= (1.0 - 0.08 * p + petSquish);
        this.currentScale.x *= (1.0 + 0.05 * p - petSquish * 0.5);
        this.currentPosition.y -= (0.05 * p);

        // Head tilts towards hand + nuzzles
        this.boneRotations.head.z += this.pettingStrokeX * 0.35 + Math.sin(this.stateTime * 10.0) * 0.07 * p;
        this.boneRotations.head.x -= 0.16 * p; // lifts chin blissfully
        this.bonePositions.body.y -= 0.04 * p; // snuggle down

        // Ears flatten cutely and flutter
        this.boneRotations.earL.z -= 0.22 * p;
        this.boneRotations.earR.z += 0.22 * p;
        const flutter = Math.sin(this.stateTime * 22.0) * 0.08 * p;
        this.boneRotations.earL.x += flutter;
        this.boneRotations.earR.x += flutter;

        // Paws fold up to chest happily
        this.boneRotations.handL.z -= 0.18 * p;
        this.boneRotations.handR.z += 0.18 * p;
        this.boneRotations.handL.x -= 0.15 * p;
        this.boneRotations.handR.x -= 0.15 * p;
      }

      // 6. State-specific Bone Expressions
      if (this.targetState === 'thinking') {
        this.boneRotations.head.z += Math.sin(this.stateTime * 1.6) * 0.14;
        this.boneRotations.earL.x -= 0.06;
        this.boneRotations.earR.x -= 0.06;
      } else if (this.targetState === 'success') {
        this.boneRotations.head.z += Math.sin(this.stateTime * 14.0) * 0.08;
        this.boneRotations.handL.z -= 0.35;
        this.boneRotations.handR.z += 0.35;
        this.boneRotations.handL.x -= 0.15;
        this.boneRotations.handR.x -= 0.15;
      } else if (this.targetState === 'alert') {
        this.boneRotations.head.x -= 0.06;
        this.boneRotations.earL.z -= 0.08;
        this.boneRotations.earR.z += 0.08;
      } else if (this.targetState === 'error') {
        this.boneRotations.head.x += 0.18;
        this.boneRotations.earL.z += 0.10;
        this.boneRotations.earR.z -= 0.10;
      }

      // 7. Muted protest struggle with limbs
      if (this.isMuted && this.struggleTimer > 0) {
        const intensity = Math.min(1.0, this.struggleTimer / 0.8);
        this.boneRotations.handL.z += Math.sin(this.stateTime * 20.0) * (0.25 * intensity);
        this.boneRotations.handR.z -= Math.sin(this.stateTime * 20.0) * (0.25 * intensity);
        this.boneRotations.footL.x += Math.cos(this.stateTime * 18.0) * (0.20 * intensity);
        this.boneRotations.footR.x += Math.sin(this.stateTime * 18.0) * (0.20 * intensity);
      }
    }

    // 🩹 Brief comical struggle animation when muted ("vung tay vung chân")
    if (this.isMuted && !this.isDragging) {
      if (this.struggleTimer > 0) {
        this.struggleTimer = Math.max(0, this.struggleTimer - delta);
        const intensity = Math.min(1.0, this.struggleTimer / 0.8);
        const struggleTime = this.stateTime;

        // Cute comical protest wiggles
        this.currentRotation.z += Math.sin(struggleTime * 18.0) * (0.05 * intensity);
        this.currentRotation.x += Math.cos(struggleTime * 14.0) * (0.03 * intensity);
        this.currentRotation.y += Math.sin(struggleTime * 12.0) * (0.04 * intensity);

        // Soft squish
        const squish = 1.0 + Math.sin(struggleTime * 14.0) * (0.04 * intensity);
        this.currentScale.y *= squish;
        this.currentScale.x /= Math.sqrt(squish);

        // Tiny cute hops
        this.currentPosition.y += Math.abs(Math.sin(struggleTime * 10.0)) * (0.03 * intensity);
      } else {
        // Settled into calm posture with bandage on: gentle pout offset preserving mouse cursor tracking
        this.currentRotation.x -= 0.02;
      }
    }

    // 🐾 Apply soft mochi squishy drag & articulated dangling
    if (this.isDragging) {
      // Exponential smoothing on drag velocity for liquid motion
      const velDamp = 1.0 - Math.exp(-12.0 * delta);
      this.smoothedDragVelocity.lerp(this.dragVelocity, velDamp);
      this.dragVelocity.multiplyScalar(Math.exp(-8.0 * delta));

      const speed = this.smoothedDragVelocity.length();

      // Lift off desk while carried
      this.currentPosition.y += 0.08;

      // Soft dough stretch based on drag speed
      const stretch = 1.04 + Math.min(0.09, speed * 0.006);
      this.currentScale.y *= stretch;
      this.currentScale.x /= Math.sqrt(stretch);
      this.currentScale.z /= Math.sqrt(stretch);

      // Smooth subtle inertia tilt trailing cursor motion
      const tiltZ = -THREE.MathUtils.clamp(this.smoothedDragVelocity.x * 0.014, -0.22, 0.22);
      const tiltX = THREE.MathUtils.clamp(this.smoothedDragVelocity.y * 0.012, -0.16, 0.16);
      this.currentRotation.z += tiltZ;
      this.currentRotation.x += tiltX;

      // Gentle, calm dangling sway
      const gentleDangle = Math.sin(this.stateTime * 6.0) * 0.04;
      this.currentRotation.z += gentleDangle;
      this.currentPosition.x += Math.sin(this.stateTime * 5.0) * 0.015;

      // Articulate limbs dangling in air:
      if (this.hasBones) {
        // Hands dangle and sway like pendulum
        this.boneRotations.handL.z = -0.22 + gentleDangle * 1.5 - tiltZ * 0.8;
        this.boneRotations.handR.z = 0.22 - gentleDangle * 1.5 - tiltZ * 0.8;
        this.boneRotations.handL.x = tiltX * 0.8;
        this.boneRotations.handR.x = tiltX * 0.8;

        // Feet dangle down and lag behind
        this.boneRotations.footL.x = tiltX * 0.9 + gentleDangle * 0.6;
        this.boneRotations.footR.x = tiltX * 0.9 - gentleDangle * 0.6;
        this.boneRotations.footL.z = -0.08 - tiltZ * 0.6;
        this.boneRotations.footR.z = 0.08 - tiltZ * 0.6;

        // Comical flailing when dragged quickly!
        if (speed > 7.0) {
          const flailIntensity = Math.min(1.0, (speed - 7.0) * 0.06);
          const flail = Math.sin(this.stateTime * 22.0) * flailIntensity;
          this.boneRotations.handL.z += flail * 0.30;
          this.boneRotations.handR.z -= flail * 0.30;
          this.boneRotations.footL.x += flail * 0.25;
          this.boneRotations.footR.x -= flail * 0.25;
          this.boneRotations.head.z += flail * 0.12;
        }
      }
    } else {
      this.smoothedDragVelocity.set(0, 0);

      if (this.releaseSpringTime < 0.65) {
        // Soft jello spring rebound upon landing back on desk ("nhún cả người")
        this.releaseSpringTime += delta;
        const t = this.releaseSpringTime;
        const spring = Math.sin(t * 15.0) * Math.exp(-t * 7.5) * 0.18;
        this.currentScale.y *= 1.0 - spring;
        this.currentScale.x *= 1.0 + spring * 0.55;
        this.currentScale.z *= 1.0 + spring * 0.55;

        if (this.hasBones) {
          // Head bobs up and down with spring
          this.boneRotations.head.x += spring * 0.75;
          // Body squishes down on impact
          this.bonePositions.body.y -= Math.max(0, spring * 0.25);
          // Hands spring outward for balance
          this.boneRotations.handL.z -= spring * 0.45;
          this.boneRotations.handR.z += spring * 0.45;
          // Feet compress
          this.boneRotations.footL.x += spring * 0.35;
          this.boneRotations.footR.x += spring * 0.35;
          // Ears bounce
          this.boneRotations.earL.z -= spring * 0.6;
          this.boneRotations.earR.z += spring * 0.6;
        }
      }
    }
  }

  private calculateStatePose(state: MascotState, t: number): {
    pos: THREE.Vector3;
    rot: THREE.Euler;
    scale: THREE.Vector3;
  } {
    const pos = this.basePosition.clone();
    const scale = this.baseScale.clone();
    const rot = new THREE.Euler(0, 0, 0, 'YXZ');

    switch (state) {
      case 'idle': {
        // Rock-steady tranquil idle: subtle living breath, zero restless sway
        const breathe = Math.sin(t * 0.9);
        const breatheAmp = 0.003;

        scale.y *= 1 + breathe * breatheAmp;
        scale.x *= 1 - breathe * (breatheAmp * 0.4);
        scale.z *= 1 - breathe * (breatheAmp * 0.4);

        rot.x = -0.02; // gentle face-up towards user
        rot.y = 0;
        rot.z = 0;
        break;
      }

      case 'thinking': {
        // Cute inquisitive puppy head tilt to the side while sitting
        const sway = Math.sin(t * 1.6);
        rot.z = sway * 0.14; // head tilt
        rot.y = Math.sin(t * 1.1) * 0.12;
        rot.x = -0.06 + Math.sin(t * 1.4) * 0.025; // looking up curiously
        scale.y *= 1 + Math.sin(t * 2.4) * 0.018;
        break;
      }

      case 'success': {
        // Joyful seated hop: bounces happily on its bottom
        const bouncePeriod = 0.48;
        const phase = (t % bouncePeriod) / bouncePeriod;
        const jump = Math.sin(phase * Math.PI);
        pos.y += jump * 0.14;

        if (jump > 0.2) {
          scale.y *= 1 + jump * 0.12;
          scale.x *= 1 - jump * 0.06;
          scale.z *= 1 - jump * 0.06;
        } else {
          const squash = (1 - jump / 0.2) * 0.09;
          scale.y *= 1 - squash;
          scale.x *= 1 + squash * 0.5;
          scale.z *= 1 + squash * 0.5;
        }

        // Happy little head shake
        rot.z = Math.sin(t * 14.0) * 0.09;
        rot.x = -0.05;
        break;
      }

      case 'alert': {
        // Perked attentive posture (calm alertness, no jackhammer tremor)
        rot.x = -0.05;
        pos.y += 0.02;
        const alertBreath = Math.sin(t * 3.5) * 0.006;
        pos.y += alertBreath;
        scale.y *= 1 + alertBreath * 0.03;
        break;
      }

      case 'error': {
        // Disappointed slouch: head drops down softly
        const droop = Math.min(1.0, t * 1.8);
        pos.y -= droop * 0.03;
        scale.y *= 1 - droop * 0.05;
        scale.x *= 1 + droop * 0.03;
        scale.z *= 1 + droop * 0.03;

        rot.x = droop * 0.14; // head lowered
        rot.y = Math.sin(t * 3.2) * (0.12 * droop); // gentle disappointed shake
        break;
      }
    }

    return { pos, rot, scale };
  }
}
