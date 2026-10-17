import { ProceduralAnimator } from './animation';
import { MascotScene } from './scene';
import { SpeechBubbleManager } from './bubble';
import type { ElectronAPI } from '../preload';
import type { CursorPosition, WindowBounds, NotifyPayload } from '../types';

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

async function init() {
  const bubbleContainer = document.getElementById('bubble-container')!;
  const canvasContainer = document.getElementById('canvas-container')!;

  const animator = new ProceduralAnimator();
  const scene = new MascotScene(canvasContainer, animator);

  // Initialize SpeechBubbleManager
  let currentNotificationState: string = 'idle';

  const bubbleManager = new SpeechBubbleManager(
    bubbleContainer,
    (payload: NotifyPayload) => {
      currentNotificationState = payload.state;
      animator.setState(payload.state);
    }
  );

  // Load Chiikawa 3D GLB model
  try {
    // In dev and prod, chiikawa.glb is in assets/chiikawa.glb copied to dist/renderer/chiikawa.glb or relative
    await scene.loadModel('./chiikawa.glb');
  } catch (err) {
    console.warn('Fallback loading ../assets/chiikawa.glb...', err);
    try {
      await scene.loadModel('../assets/chiikawa.glb');
    } catch (err2) {
      console.error('All model load attempts failed:', err2);
    }
  }

  // Start rendering
  scene.startRenderLoop();

  // Mouse hit-testing state tracking
  let isMouseHovering = false;

  const updateHitTest = (cursor: CursorPosition, winBounds: WindowBounds) => {
    // Check if cursor is over speech bubble
    const bubbleEl = bubbleManager.getActiveBubbleElement();
    let hitBubble = false;
    if (bubbleEl) {
      const rect = bubbleEl.getBoundingClientRect();
      const localX = cursor.x - winBounds.x;
      const localY = cursor.y - winBounds.y;
      hitBubble =
        localX >= rect.left &&
        localX <= rect.right &&
        localY >= rect.top &&
        localY <= rect.bottom;
    }

    // Check if cursor hits 3D mascot mesh
    const hitMesh = scene.hitTest(cursor.x, cursor.y, winBounds);

    const isHit = hitBubble || hitMesh;

    if (isHit !== isMouseHovering) {
      isMouseHovering = isHit;
      if (window.electronAPI) {
        // When hovered, do not ignore mouse events so clicks reach bubble/mascot
        // When not hovered, ignore mouse events and forward to desktop/windows behind
        window.electronAPI.setIgnoreMouseEvents(!isHit, true);
      }
    }
  };

  // Drag and click handling for Chiikawa mascot
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let hasMoved = false;

  window.addEventListener('mousedown', (e: MouseEvent) => {
    // Check if clicked on bubble
    const bubbleEl = bubbleManager.getActiveBubbleElement();
    if (bubbleEl && bubbleEl.contains(e.target as Node)) {
      return; // let bubble handle its own click
    }

    if (isMouseHovering) {
      isDragging = true;
      hasMoved = false;
      dragStartX = e.screenX;
      dragStartY = e.screenY;
    }
  });

  window.addEventListener('mousemove', (e: MouseEvent) => {
    if (isDragging) {
      const dx = e.screenX - dragStartX;
      const dy = e.screenY - dragStartY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        hasMoved = true;
        dragStartX = e.screenX;
        dragStartY = e.screenY;
        window.electronAPI?.moveWindowBy(dx, dy);
      }
    }
  });

  window.addEventListener('mouseup', () => {
    if (isDragging && !hasMoved) {
      // Clicked on mascot without dragging: playful happy hop!
      animator.setState('success');
      setTimeout(() => {
        if (!bubbleManager.hasActiveBubble()) {
          animator.setState('idle');
        }
      }, 1500);
    }
    isDragging = false;
  });

  // IPC listeners from preload
  if (window.electronAPI) {
    window.electronAPI.onNotify((payload: NotifyPayload) => {
      bubbleManager.enqueue(payload);
    });

    window.electronAPI.onCursor((pos: CursorPosition, winBounds: WindowBounds) => {
      animator.updateCursor(pos, winBounds);
      updateHitTest(pos, winBounds);
    });

    window.electronAPI.onVisibility((visible: boolean) => {
      if (visible) {
        scene.startRenderLoop();
      } else {
        scene.stopRenderLoop();
      }
    });

    // Notify main that renderer is ready
    window.electronAPI.rendererReady();
  }
}

window.addEventListener('DOMContentLoaded', init);
