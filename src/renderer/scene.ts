import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ProceduralAnimator } from './animation';
import { MOUTH_ANCHOR } from './mouth-anchor';
import type { CursorPosition, WindowBounds } from '../types';

export interface MascotBones {
  head: THREE.Bone | null;
  body: THREE.Bone | null;
  earL: THREE.Bone | null;
  earR: THREE.Bone | null;
  handL: THREE.Bone | null;
  handR: THREE.Bone | null;
  footL: THREE.Bone | null;
  footR: THREE.Bone | null;
}

interface BoneRestTransform {
  quaternion: THREE.Quaternion;
  position: THREE.Vector3;
}

export class MascotScene {
  private container: HTMLElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private animator: ProceduralAnimator;
  private modelRoot: THREE.Group | null = null;
  private meshes: THREE.Mesh[] = [];

  // Articulated bone hierarchy
  private bones: MascotBones = {
    head: null,
    body: null,
    earL: null,
    earR: null,
    handL: null,
    handR: null,
    footL: null,
    footR: null,
  };
  private boneRestTransforms: Partial<Record<keyof MascotBones, BoneRestTransform>> = {};

  // Raycaster for hit testing
  private raycaster = new THREE.Raycaster();
  private mouseVec = new THREE.Vector2();

  // Animation mixer if GLTF has embedded animations
  private mixer: THREE.AnimationMixer | null = null;

  // Band-aid mesh for mute state
  private bandaidMesh: THREE.Mesh | null = null;

  // Render loop control
  private isRendering = false;
  private animationFrameId: number | null = null;
  private lastFrameTime = 0;
  private clock = new THREE.Clock();

  constructor(container: HTMLElement, animator: ProceduralAnimator) {
    this.container = container;
    this.animator = animator;

    // 1. Scene
    this.scene = new THREE.Scene();

    // 2. Camera: eye-level portrait perspective matching reference figurine
    const width = container.clientWidth || 280;
    const height = container.clientHeight || 200;
    this.camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 100);
    this.camera.position.set(0, 0.20, 5.0);
    this.camera.lookAt(0, -0.30, 0);

    // 3. Renderer with absolute transparency and antialiasing for crisp round curves
    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'low-power',
    });
    this.renderer.setClearColor(0x000000, 0);
    // Support crisp Retina displays
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2.0);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height);
    container.appendChild(this.renderer.domElement);

    // 4. Soft studio lighting matching collectible toy photo
    this.setupLighting();

    // 5. Handle resize
    window.addEventListener('resize', this.onResize);
  }

  private setupLighting(): void {
    // Soft warm ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.25);
    this.scene.add(ambientLight);

    // Key light (soft front-top-right)
    const keyLight = new THREE.DirectionalLight(0xfff8ee, 1.45);
    keyLight.position.set(2, 3.5, 3.5);
    this.scene.add(keyLight);

    // Subtle cool fill light from opposite side
    const fillLight = new THREE.DirectionalLight(0xedf4ff, 0.65);
    fillLight.position.set(-2.2, 1.2, 2.8);
    this.scene.add(fillLight);

    // Upward warm bounce light from desk / ledge below (illuminates chubby cheeks and folded paws)
    const bounceLight = new THREE.DirectionalLight(0xffeedd, 0.35);
    bounceLight.position.set(0, -2, 2);
    this.scene.add(bounceLight);
  }

  public async loadModel(url: string): Promise<void> {
    const loader = new GLTFLoader();

    return new Promise<void>((resolve, reject) => {
      loader.load(
        url,
        (gltf) => {
          this.modelRoot = new THREE.Group();
          this.modelRoot.name = 'MascotRoot';

          // Reset bone references
          this.bones = {
            head: null,
            body: null,
            earL: null,
            earR: null,
            handL: null,
            handR: null,
            footL: null,
            footR: null,
          };
          this.boneRestTransforms = {};

          // Extract meshes for hit testing and identify articulated bones
          gltf.scene.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              const mesh = child as THREE.Mesh;
              this.meshes.push(mesh);

              // Apply smooth vinyl / matte collectible figurine material
              if (mesh.material) {
                const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                mats.forEach((m: any) => {
                  m.transparent = true;
                  if (m.roughness !== undefined) m.roughness = 0.62;
                  if (m.metalness !== undefined) m.metalness = 0.04;
                  m.needsUpdate = true;
                });
              }
            }

            if ((child as THREE.Bone).isBone) {
              const bone = child as THREE.Bone;
              if (bone.name === 'Head') this.bones.head = bone;
              else if (bone.name === 'Body') this.bones.body = bone;
              else if (bone.name === 'Ear_L') this.bones.earL = bone;
              else if (bone.name === 'Ear_R') this.bones.earR = bone;
              else if (bone.name === 'Hand_L') this.bones.handL = bone;
              else if (bone.name === 'Hand_R') this.bones.handR = bone;
              else if (bone.name === 'Foot_L') this.bones.footL = bone;
              else if (bone.name === 'Foot_R') this.bones.footR = bone;
            }
          });

          const hasBones = Boolean(this.bones.head && this.bones.body);
          this.animator.setHasBones(hasBones);

          // Store initial rest transforms for clean relative offsets
          for (const key of Object.keys(this.bones) as (keyof MascotBones)[]) {
            const bone = this.bones[key];
            if (bone) {
              this.boneRestTransforms[key] = {
                quaternion: bone.quaternion.clone(),
                position: bone.position.clone(),
              };
            }
          }

          // Check if GLTF has embedded animations
          if (gltf.animations && gltf.animations.length > 0) {
            this.mixer = new THREE.AnimationMixer(gltf.scene);
            const action = this.mixer.clipAction(gltf.animations[0]);
            action.play();
          }

          // Center and normalize model bounds
          const box = new THREE.Box3().setFromObject(gltf.scene);
          const size = new THREE.Vector3();
          box.getSize(size);
          const center = new THREE.Vector3();
          box.getCenter(center);

          // Center X and Z, align bottom of seated pose to y=0
          gltf.scene.position.x = -center.x;
          gltf.scene.position.y = -box.min.y;
          gltf.scene.position.z = -center.z;

          // Scale to fit comfortably in viewport
          const targetHeight = 1.68;
          const scale = targetHeight / Math.max(size.y, 0.001);
          this.modelRoot.scale.set(scale, scale, scale);

          // Position mascot resting cleanly on bottom ledge with feet fully visible
          const initialPos = new THREE.Vector3(0, -1.02, 0);
          this.modelRoot.position.copy(initialPos);

          this.modelRoot.add(gltf.scene);

          // Create Band-Aid mesh for mute state (sticker covering Chiikawa's mouth)
          const bandaidTex = new THREE.TextureLoader().load('./bandaid.png');
          bandaidTex.colorSpace = THREE.SRGBColorSpace;
          const bandaidGeo = new THREE.PlaneGeometry(0.48, 0.36);
          const bandaidMat = new THREE.MeshBasicMaterial({
            map: bandaidTex,
            transparent: true,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -4,
            polygonOffsetUnits: -4,
            toneMapped: false,
            side: THREE.DoubleSide,
          });
          this.bandaidMesh = new THREE.Mesh(bandaidGeo, bandaidMat);
          this.bandaidMesh.name = 'BandaidMouth';
          this.bandaidMesh.renderOrder = 10;
          // Positioned precisely on Chiikawa's mouth via measured MOUTH_ANCHOR
          this.bandaidMesh.position.set(MOUTH_ANCHOR.pLocal[0], MOUTH_ANCHOR.pLocal[1], MOUTH_ANCHOR.pLocal[2]);
          this.bandaidMesh.quaternion.set(MOUTH_ANCHOR.qLocal[0], MOUTH_ANCHOR.qLocal[1], MOUTH_ANCHOR.qLocal[2], MOUTH_ANCHOR.qLocal[3]);
          this.bandaidMesh.visible = false;
          gltf.scene.add(this.bandaidMesh);

          // If Head bone is present, attach bandaid to Head bone so it rotates organically with the head!
          if (this.bones.head) {
            this.bandaidMesh.updateMatrixWorld(true);
            this.bones.head.attach(this.bandaidMesh);
          }

          this.scene.add(this.modelRoot);

          // Configure animator with base transform
          this.animator.setBaseTransform(initialPos, new THREE.Vector3(scale, scale, scale));

          resolve();
        },
        undefined,
        (err) => {
          console.error('Failed to load mascot model:', err);
          reject(err);
        }
      );
    });
  }

  public startRenderLoop(): void {
    if (this.isRendering) return;
    this.isRendering = true;
    this.clock.start();
    this.lastFrameTime = performance.now();
    this.tick();
  }

  public stopRenderLoop(): void {
    this.isRendering = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private tick = (): void => {
    if (!this.isRendering) return;

    this.animationFrameId = requestAnimationFrame(this.tick);

    const now = performance.now();
    // Silky smooth 60fps rendering (no 30fps stutter)
    const frameInterval = 1000 / 60;
    const elapsed = now - this.lastFrameTime;

    if (elapsed < frameInterval) {
      return;
    }
    this.lastFrameTime = now - (elapsed % frameInterval);

    const delta = Math.min(this.clock.getDelta(), 0.05);

    // Update animations
    if (this.mixer) {
      this.mixer.update(delta);
    }
    this.animator.update(delta);

    // Apply procedural transforms
    if (this.modelRoot) {
      this.modelRoot.position.copy(this.animator.currentPosition);
      this.modelRoot.rotation.copy(this.animator.currentRotation);
      this.modelRoot.scale.copy(this.animator.currentScale);
    }

    // Apply articulated bone transforms
    this.applyBoneTransforms();

    this.renderer.render(this.scene, this.camera);
  };

  private applyBoneTransforms(): void {
    if (!this.bones.head) return;

    const rot = this.animator.boneRotations;
    const pos = this.animator.bonePositions;

    const applyBone = (
      key: keyof MascotBones,
      euler: THREE.Euler,
      posOffset?: THREE.Vector3
    ) => {
      const bone = this.bones[key];
      const rest = this.boneRestTransforms[key];
      if (!bone || !rest) return;

      const qOffset = new THREE.Quaternion().setFromEuler(euler);
      bone.quaternion.copy(rest.quaternion).multiply(qOffset);

      if (posOffset) {
        bone.position.copy(rest.position).add(posOffset);
      } else {
        bone.position.copy(rest.position);
      }
    };

    applyBone('head', rot.head);
    applyBone('body', rot.body, pos.body);
    applyBone('earL', rot.earL);
    applyBone('earR', rot.earR);
    applyBone('handL', rot.handL);
    applyBone('handR', rot.handR);
    applyBone('footL', rot.footL);
    applyBone('footR', rot.footR);
  };

  public hitTest(screenX: number, screenY: number, winBounds: WindowBounds): boolean {
    if (this.meshes.length === 0) return false;

    // Convert screen coordinates to canvas-relative coordinates
    const canvasRect = this.renderer.domElement.getBoundingClientRect();
    const localX = screenX - winBounds.x - canvasRect.left;
    const localY = screenY - winBounds.y - canvasRect.top;

    if (
      localX < 0 ||
      localX > canvasRect.width ||
      localY < 0 ||
      localY > canvasRect.height
    ) {
      return false;
    }

    // Normalized Device Coordinates (-1 to +1)
    this.mouseVec.x = (localX / canvasRect.width) * 2 - 1;
    this.mouseVec.y = -(localY / canvasRect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouseVec, this.camera);
    const intersects = this.raycaster.intersectObjects(this.meshes, false);

    return intersects.length > 0;
  }

  public hitTestClient(clientX: number, clientY: number): boolean {
    if (this.meshes.length === 0) return false;

    const canvasRect = this.renderer.domElement.getBoundingClientRect();
    const localX = clientX - canvasRect.left;
    const localY = clientY - canvasRect.top;

    if (
      localX < 0 ||
      localX > canvasRect.width ||
      localY < 0 ||
      localY > canvasRect.height
    ) {
      return false;
    }

    this.mouseVec.x = (localX / canvasRect.width) * 2 - 1;
    this.mouseVec.y = -(localY / canvasRect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouseVec, this.camera);

    if (this.bandaidMesh && this.bandaidMesh.visible) {
      const hits = this.raycaster.intersectObject(this.bandaidMesh, false);
      if (hits.length > 0) return true;
    }

    const intersects = this.raycaster.intersectObjects(this.meshes, false);
    return intersects.length > 0;
  }

  public setMuted(muted: boolean): void {
    if (this.bandaidMesh) {
      this.bandaidMesh.visible = muted;
      if (muted) {
        // Cute spring pop-in
        this.bandaidMesh.scale.set(0.6, 0.6, 0.6);
        let s = 0.6;
        const popTimer = setInterval(() => {
          s += 0.1;
          if (s >= 1.0) {
            s = 1.0;
            clearInterval(popTimer);
          }
          this.bandaidMesh?.scale.set(s, s, s);
        }, 16);
      }
    }
  }

  public isBandaidVisible(): boolean {
    return this.bandaidMesh?.visible ?? false;
  }

  public setBandaidVisible(vis: boolean): void {
    if (this.bandaidMesh) {
      this.bandaidMesh.visible = vis;
      if (vis) {
        this.bandaidMesh.scale.set(1.0, 1.0, 1.0);
      }
    }
  }

  public getBandaidWorldPosition(): [number, number, number] {
    if (!this.bandaidMesh) return [0, 0, 0];
    const v = new THREE.Vector3();
    this.bandaidMesh.getWorldPosition(v);
    return [v.x, v.y, v.z];
  }

  public projectPointToScreen(pt: [number, number, number] | THREE.Vector3): [number, number] {
    const v = pt instanceof THREE.Vector3 ? pt.clone() : new THREE.Vector3(pt[0], pt[1], pt[2]);
    v.project(this.camera);
    const canvasRect = this.renderer.domElement.getBoundingClientRect();
    return [
      canvasRect.left + (v.x * 0.5 + 0.5) * canvasRect.width,
      canvasRect.top + (-v.y * 0.5 + 0.5) * canvasRect.height,
    ];
  }

  public projectBandaidToScreen(): [number, number] {
    if (!this.bandaidMesh) return [0, 0];
    const v = new THREE.Vector3();
    this.bandaidMesh.getWorldPosition(v);
    return this.projectPointToScreen(v);
  }

  public getCameraDebug() {
    return {
      pos: [this.camera.position.x, this.camera.position.y, this.camera.position.z] as [number, number, number],
      fov: this.camera.fov,
      aspect: this.camera.aspect,
    };
  }

  public placeBandaidAtScreen(px: number, py: number) {
    if (!this.bandaidMesh || !this.modelRoot) return null;
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((px - r.left) / r.width) * 2 - 1, -((py - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObject(this.modelRoot, true);
    const hit = hits.find((h) => h.object !== this.bandaidMesh && h.face);
    if (!hit || !hit.face) return null;

    const nW = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize();
    const pW = hit.point.clone().addScaledVector(nW, 0.012);
    const parent = this.bandaidMesh.parent!;
    const pLocal = parent.worldToLocal(pW.clone());

    const qW = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), nW);
    const rollQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -0.08);
    qW.multiply(rollQuat);

    const pq = new THREE.Quaternion();
    parent.getWorldQuaternion(pq);
    const qLocal = pq.invert().multiply(qW);

    this.bandaidMesh.position.copy(pLocal);
    this.bandaidMesh.quaternion.copy(qLocal);

    return {
      pointWorld: hit.point.toArray(),
      normalWorld: nW.toArray(),
      uv: hit.uv ? hit.uv.toArray() : null,
      pLocal: [pLocal.x, pLocal.y, pLocal.z] as [number, number, number],
      qLocal: [qLocal.x, qLocal.y, qLocal.z, qLocal.w] as [number, number, number, number],
      screenPx: this.projectBandaidToScreen(),
    };
  }

  public getMouthAnchor() {
    return MOUTH_ANCHOR;
  }

  public hitTestMouth(screenX: number, screenY: number, winBounds: WindowBounds): boolean {
    if (!this.modelRoot || !this.bandaidMesh) return false;

    const canvasRect = this.renderer.domElement.getBoundingClientRect();
    const localX = screenX - winBounds.x - canvasRect.left;
    const localY = screenY - winBounds.y - canvasRect.top;

    if (
      localX < 0 ||
      localX > canvasRect.width ||
      localY < 0 ||
      localY > canvasRect.height
    ) {
      return false;
    }

    // 1. If bandaid is visible, clicking on the bandaid is a direct hit
    if (this.bandaidMesh.visible) {
      this.mouseVec.x = (localX / canvasRect.width) * 2 - 1;
      this.mouseVec.y = -(localY / canvasRect.height) * 2 + 1;
      this.raycaster.setFromCamera(this.mouseVec, this.camera);
      const hits = this.raycaster.intersectObject(this.bandaidMesh, false);
      if (hits.length > 0) return true;
    }

    // 2. Proximity test using projected MOUTH_ANCHOR (radius ~ sticker half-size + 10px = 32px)
    const [anchorX, anchorY] = this.projectBandaidToScreen();
    const dist = Math.hypot(localX - anchorX, localY - anchorY);
    return dist <= 32;
  }

  public getHeadScreenPosition(): [number, number] | null {
    if (!this.bones.head) return null;
    const v = new THREE.Vector3();
    this.bones.head.getWorldPosition(v);
    v.y += 0.26; // Center of forehead
    return this.projectPointToScreen(v);
  }

  public hitTestHead(clientX: number, clientY: number): boolean {
    const headScreen = this.getHeadScreenPosition();
    if (!headScreen) {
      const r = this.renderer.domElement.getBoundingClientRect();
      return Math.hypot(clientX - (r.left + r.width / 2), clientY - (r.top + r.height * 0.48)) < 55;
    }
    return Math.hypot(clientX - headScreen[0], clientY - headScreen[1]) < 62;
  }

  private onResize = (): void => {
    const width = this.container.clientWidth || 280;
    const height = this.container.clientHeight || 200;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  public dispose(): void {
    this.stopRenderLoop();
    window.removeEventListener('resize', this.onResize);
    this.renderer.dispose();
    this.meshes.forEach((m) => {
      m.geometry.dispose();
      if (Array.isArray(m.material)) {
        m.material.forEach((mat) => mat.dispose());
      } else {
        m.material.dispose();
      }
    });
  }
}
