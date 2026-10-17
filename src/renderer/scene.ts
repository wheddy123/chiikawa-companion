import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ProceduralAnimator } from './animation';
import type { CursorPosition, WindowBounds } from '../types';

export class MascotScene {
  private container: HTMLElement;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private animator: ProceduralAnimator;
  private modelRoot: THREE.Group | null = null;
  private meshes: THREE.Mesh[] = [];

  // Raycaster for hit testing
  private raycaster = new THREE.Raycaster();
  private mouseVec = new THREE.Vector2();

  // Animation mixer if GLTF has embedded animations
  private mixer: THREE.AnimationMixer | null = null;

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

          // Extract meshes for hit testing and configure materials
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
          });

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
          const initialPos = new THREE.Vector3(0, -1.30, 0);
          this.modelRoot.position.copy(initialPos);

          this.modelRoot.add(gltf.scene);
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

    this.renderer.render(this.scene, this.camera);
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
