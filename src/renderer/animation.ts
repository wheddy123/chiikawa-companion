import * as THREE from 'three';
import type { MascotState, CursorPosition, WindowBounds } from '../types';

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

  // Target values for crossfade
  private fromPos = new THREE.Vector3();
  private fromRot = new THREE.Euler();
  private fromScale = new THREE.Vector3(1, 1, 1);

  // Cursor tracking
  private cursorTargetRotY: number = 0;
  private cursorTargetRotX: number = 0;
  private currentCursorRotY: number = 0;
  private currentCursorRotX: number = 0;

  // Reduced motion preference
  private reducedMotion: boolean = false;

  // Drag squish & squirm physics
  private isDragging: boolean = false;
  private dragVelocity = new THREE.Vector2(0, 0);
  private releaseSpringTime: number = 999;

  constructor() {
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => {
      this.reducedMotion = e.matches;
    });
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

    // Mascot center approximate in screen coordinates
    const mascotCenterX = winBounds.x + winBounds.width / 2;
    const mascotCenterY = winBounds.y + winBounds.height * 0.7;

    const dx = (cursor.x - mascotCenterX) / Math.max(winBounds.width, 300);
    const dy = (cursor.y - mascotCenterY) / Math.max(winBounds.height, 300);

    // Clamp tracking angle to natural subtle look range (~20 degrees max)
    const maxAngleX = THREE.MathUtils.degToRad(18);
    const maxAngleY = THREE.MathUtils.degToRad(25);

    this.cursorTargetRotY = THREE.MathUtils.clamp(dx * maxAngleY, -maxAngleY, maxAngleY);
    this.cursorTargetRotX = THREE.MathUtils.clamp(dy * maxAngleX, -maxAngleX, maxAngleX);
  }

  public setDragging(dragging: boolean, vx: number = 0, vy: number = 0): void {
    if (this.isDragging && !dragging) {
      this.releaseSpringTime = 0;
    }
    this.isDragging = dragging;
    this.dragVelocity.set(vx, vy);
  }

  public update(delta: number): void {
    this.stateTime += delta;

    // Advance crossfade transition
    if (this.transitionAlpha < 1.0) {
      this.transitionAlpha += delta / this.transitionDuration;
      if (this.transitionAlpha >= 1.0) {
        this.transitionAlpha = 1.0;
        this.currentState = this.targetState;
      }
    }

    // Smooth cursor tracking damp
    const cursorDamp = Math.min(1.0, delta * 8.0);
    this.currentCursorRotY = THREE.MathUtils.lerp(this.currentCursorRotY, this.cursorTargetRotY, cursorDamp);
    this.currentCursorRotX = THREE.MathUtils.lerp(this.currentCursorRotX, this.cursorTargetRotX, cursorDamp);

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
      this.currentRotation.x = THREE.MathUtils.lerp(this.fromRot.x, targetPose.rot.x, this.transitionAlpha) + this.currentCursorRotX;
      this.currentRotation.y = THREE.MathUtils.lerp(this.fromRot.y, targetPose.rot.y, this.transitionAlpha) + this.currentCursorRotY;
      this.currentRotation.z = THREE.MathUtils.lerp(this.fromRot.z, targetPose.rot.z, this.transitionAlpha);
    } else {
      this.currentPosition.copy(targetPose.pos);
      this.currentScale.copy(targetPose.scale);
      this.currentRotation.x = targetPose.rot.x + this.currentCursorRotX;
      this.currentRotation.y = targetPose.rot.y + this.currentCursorRotY;
      this.currentRotation.z = targetPose.rot.z;
    }

    // 🐾 Apply squishy drag deformation and frantic squirming/dangling
    if (this.isDragging) {
      const speed = Math.hypot(this.dragVelocity.x, this.dragVelocity.y);
      // Soft dough mochi stretching effect
      const stretch = 1.0 + Math.min(0.3, speed * 0.012 + 0.15);
      this.currentScale.y *= stretch;
      this.currentScale.x /= Math.sqrt(stretch);
      this.currentScale.z /= Math.sqrt(stretch);

      // Inertia tilt lagging against mouse motion
      this.currentRotation.z -= THREE.MathUtils.clamp(this.dragVelocity.x * 0.025, -0.3, 0.3);
      this.currentRotation.x += THREE.MathUtils.clamp(this.dragVelocity.y * 0.02, -0.25, 0.25);

      // Frantic cute squirming / dangling feet while being held up in the air!
      const squirm = Math.sin(this.stateTime * 32.0) * 0.16;
      this.currentRotation.z += squirm;
      this.currentPosition.y += Math.abs(Math.sin(this.stateTime * 24.0)) * 0.09;
      this.currentPosition.x += Math.sin(this.stateTime * 26.0) * 0.04;
    } else if (this.releaseSpringTime < 0.5) {
      // Jello spring rebound after release
      this.releaseSpringTime += delta;
      const spring = Math.sin(this.releaseSpringTime * 22.0) * Math.exp(-this.releaseSpringTime * 8.5) * 0.22;
      this.currentScale.y *= (1.0 - spring);
      this.currentScale.x *= (1.0 + spring * 0.5);
      this.currentScale.z *= (1.0 + spring * 0.5);
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
        // Subtle breathing rhythm (~2.2 rad/s)
        const breathe = Math.sin(t * 2.2);
        scale.y *= 1 + breathe * 0.025;
        scale.x *= 1 - breathe * 0.015;
        scale.z *= 1 - breathe * 0.015;
        pos.y += breathe * 0.03;
        rot.z = Math.sin(t * 1.1) * 0.02; // very gentle sway
        break;
      }

      case 'thinking': {
        // Slow tilt side-to-side with curious floating
        const sway = Math.sin(t * 2.0);
        rot.z = sway * 0.12;
        rot.y = Math.sin(t * 1.2) * 0.15;
        rot.x = -0.05 + Math.sin(t * 1.5) * 0.04; // slight tilt up
        pos.y += Math.sin(t * 3.0) * 0.025;
        scale.y *= 1 + Math.sin(t * 3.0) * 0.02;
        break;
      }

      case 'success': {
        // Joyful double bounce / jumping + squash & stretch
        const bouncePeriod = 0.55;
        const phase = (t % bouncePeriod) / bouncePeriod; // 0 to 1
        // Parabolic jump arc
        const jumpHeight = 0.22;
        const jump = Math.sin(phase * Math.PI);
        pos.y += jump * jumpHeight;

        if (jump > 0.2) {
          // Stretch upwards during jump
          scale.y *= 1 + jump * 0.15;
          scale.x *= 1 - jump * 0.08;
          scale.z *= 1 - jump * 0.08;
        } else {
          // Squash on ground landing
          const squash = (1 - jump / 0.2) * 0.12;
          scale.y *= 1 - squash;
          scale.x *= 1 + squash * 0.6;
          scale.z *= 1 + squash * 0.6;
        }

        // Happy wiggle
        rot.z = Math.sin(t * 14.0) * 0.14;
        break;
      }

      case 'alert': {
        // Nervous jitter / trembling + startled hops
        const tremor = Math.sin(t * 38.0) * 0.02;
        pos.x += tremor;
        rot.z = Math.sin(t * 32.0) * 0.06;

        // Anxious rapid small jumps
        const hop = Math.abs(Math.sin(t * 8.0)) * 0.08;
        pos.y += hop;
        scale.y *= 1 + hop * 0.1;
        break;
      }

      case 'error': {
        // Sad droop / slumping down + slow disappointed head shake
        const droop = Math.min(1.0, t * 2.0);
        pos.y -= droop * 0.06;
        scale.y *= 1 - droop * 0.07;
        scale.x *= 1 + droop * 0.04;
        scale.z *= 1 + droop * 0.04;

        rot.x = droop * 0.18; // head down
        rot.y = Math.sin(t * 3.5) * (0.16 * droop); // head shake no
        break;
      }
    }

    return { pos, rot, scale };
  }
}
