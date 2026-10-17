import * as THREE from 'three';
import type { MascotState, CursorPosition, WindowBounds, SystemTelemetry } from '../types';

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

  // Cursor tracking with exponential spring filter
  private cursorTargetRotY: number = 0;
  private cursorTargetRotX: number = 0;
  private currentCursorRotY: number = 0;
  private currentCursorRotX: number = 0;

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

  constructor() {
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => {
      this.reducedMotion = e.matches;
    });
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

    // Mascot center in screen coordinates
    const mascotCenterX = winBounds.x + winBounds.width / 2;
    const mascotCenterY = winBounds.y + winBounds.height * 0.72;

    const dx = (cursor.x - mascotCenterX) / Math.max(winBounds.width, 320);
    const dy = (cursor.y - mascotCenterY) / Math.max(winBounds.height, 320);

    // Natural head rotation angles for a seated character looking at cursor
    const maxAngleX = THREE.MathUtils.degToRad(12);
    const maxAngleY = THREE.MathUtils.degToRad(16);

    this.cursorTargetRotY = THREE.MathUtils.clamp(dx * maxAngleY, -maxAngleY, maxAngleY);
    this.cursorTargetRotX = THREE.MathUtils.clamp(dy * maxAngleX, -maxAngleX, maxAngleX);
  }

  public setDragging(dragging: boolean, vx: number = 0, vy: number = 0): void {
    if (this.isDragging && !dragging) {
      this.releaseSpringTime = 0;
      this.dragVelocity.set(0, 0);
    }
    this.isDragging = dragging;
    if (dragging) {
      this.dragVelocity.set(vx, vy);
    }
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

    // Exponential spring filter for liquid-smooth cursor tracking without stepping
    const smoothDamp = 1.0 - Math.exp(-12.0 * delta);
    this.currentCursorRotY += (this.cursorTargetRotY - this.currentCursorRotY) * smoothDamp;
    this.currentCursorRotX += (this.cursorTargetRotX - this.currentCursorRotX) * smoothDamp;

    // Smooth CPU load transitions for Living Mascot
    const cpuDamp = 1.0 - Math.exp(-2.5 * delta);
    this.currentCpuLoad += (this.targetCpuLoad - this.currentCpuLoad) * cpuDamp;

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
      this.currentRotation.x =
        THREE.MathUtils.lerp(this.fromRot.x, targetPose.rot.x, this.transitionAlpha) + this.currentCursorRotX;
      this.currentRotation.y =
        THREE.MathUtils.lerp(this.fromRot.y, targetPose.rot.y, this.transitionAlpha) + this.currentCursorRotY;
      this.currentRotation.z = THREE.MathUtils.lerp(this.fromRot.z, targetPose.rot.z, this.transitionAlpha);
    } else {
      this.currentPosition.copy(targetPose.pos);
      this.currentScale.copy(targetPose.scale);
      this.currentRotation.x = targetPose.rot.x + this.currentCursorRotX;
      this.currentRotation.y = targetPose.rot.y + this.currentCursorRotY;
      this.currentRotation.z = targetPose.rot.z;
    }

    // 🩹 Cute muffled struggle animation when muted ("vung tay vung chân" / panicked flailing)
    if (this.isMuted && !this.isDragging) {
      const struggleTime = this.stateTime;
      // High-frequency frantic wobbling
      this.currentRotation.z += Math.sin(struggleTime * 26.0) * 0.12;
      this.currentRotation.x += Math.cos(struggleTime * 22.0) * 0.08;
      this.currentRotation.y += Math.sin(struggleTime * 18.0) * 0.09;

      // Panicked squishing and stretching
      const squish = 1.0 + Math.sin(struggleTime * 20.0) * 0.09;
      this.currentScale.y *= squish;
      this.currentScale.x /= Math.sqrt(squish);

      // Frantic little hops & horizontal jitter
      this.currentPosition.y += Math.abs(Math.sin(struggleTime * 14.0)) * 0.12;
      this.currentPosition.x += Math.sin(struggleTime * 28.0) * 0.04;
    }

    // 🐾 Apply soft mochi squishy drag & gentle cute dangling
    if (this.isDragging) {
      // Exponential smoothing on drag velocity for liquid motion
      const velDamp = 1.0 - Math.exp(-12.0 * delta);
      this.smoothedDragVelocity.lerp(this.dragVelocity, velDamp);
      // Decay instantaneous input velocity when mouse is stationary
      this.dragVelocity.multiplyScalar(Math.exp(-8.0 * delta));

      const speed = this.smoothedDragVelocity.length();

      // Lift slightly off desk while carried
      this.currentPosition.y += 0.06;

      // Soft dough stretch based on drag speed (max 10% stretch)
      const stretch = 1.03 + Math.min(0.08, speed * 0.005);
      this.currentScale.y *= stretch;
      this.currentScale.x /= Math.sqrt(stretch);
      this.currentScale.z /= Math.sqrt(stretch);

      // Smooth subtle inertia tilt trailing cursor motion
      const tiltZ = -THREE.MathUtils.clamp(this.smoothedDragVelocity.x * 0.012, -0.16, 0.16);
      const tiltX = THREE.MathUtils.clamp(this.smoothedDragVelocity.y * 0.010, -0.12, 0.12);
      this.currentRotation.z += tiltZ;
      this.currentRotation.x += tiltX;

      // Gentle, calm dangling sway (relaxed pendulum instead of chaotic jitter)
      const gentleDangle = Math.sin(this.stateTime * 6.0) * 0.035;
      this.currentRotation.z += gentleDangle;
      this.currentPosition.x += Math.sin(this.stateTime * 5.0) * 0.015;
    } else {
      // Smoothly reset smoothed velocity when not dragging
      this.smoothedDragVelocity.set(0, 0);

      if (this.releaseSpringTime < 0.45) {
        // Soft jello spring rebound upon landing back on desk
        this.releaseSpringTime += delta;
        const spring = Math.sin(this.releaseSpringTime * 16.0) * Math.exp(-this.releaseSpringTime * 9.0) * 0.10;
        this.currentScale.y *= 1.0 - spring;
        this.currentScale.x *= 1.0 + spring * 0.5;
        this.currentScale.z *= 1.0 + spring * 0.5;
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
        // Living Mascot: Breathing frequency modulates from 1.2Hz (chill/cool) up to 3.8Hz (heavy CPU load)
        const breatheFreq = 1.2 + this.currentCpuLoad * 2.6;
        const breatheAmp = 0.012 + this.currentCpuLoad * 0.018;
        const breathe = Math.sin(t * breatheFreq);

        scale.y *= 1 + breathe * breatheAmp;
        scale.x *= 1 - breathe * (breatheAmp * 0.6);
        scale.z *= 1 - breathe * (breatheAmp * 0.6);

        // High CPU load panting / working hard reaction (> 65% CPU)
        if (this.currentCpuLoad > 0.65) {
          const effortHop = Math.abs(Math.sin(t * breatheFreq)) * (this.currentCpuLoad - 0.65) * 0.05;
          pos.y += effortHop;
          rot.x = -0.08 + Math.sin(t * 2.2) * 0.02; // focused forward tilt
        } else {
          // Cool & relaxed idle head sway
          rot.x = -0.04 + Math.sin(t * 1.2) * 0.012;
          rot.z = Math.sin(t * 0.9) * 0.02;
        }

        // Memory pressure alert subtle tremble (> 90% RAM)
        if (this.memPressure > 0.90) {
          pos.x += Math.sin(t * 28.0) * 0.008;
        }
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
        // Sits up with perked ears and rapid anxious breath
        rot.x = -0.09; // heads up
        const tremor = Math.sin(t * 36.0) * 0.012;
        pos.x += tremor;
        rot.z = Math.sin(t * 30.0) * 0.035;

        const rapidBreath = Math.abs(Math.sin(t * 9.0)) * 0.03;
        pos.y += rapidBreath;
        scale.y *= 1 + rapidBreath * 0.08;
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
