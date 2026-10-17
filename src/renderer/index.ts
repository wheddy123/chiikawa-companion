import { ProceduralAnimator } from './animation';
import { MascotScene } from './scene';
import { SpeechBubbleManager } from './bubble';
import { SoundManager } from './audio';
import type { ElectronAPI } from '../preload';
import type { CursorPosition, WindowBounds, NotifyPayload, NotifyOption, UserChoice } from '../types';

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
  const soundManager = new SoundManager();

  // Initialize SpeechBubbleManager with quick-action decision buttons
  let currentNotificationState: string = 'idle';

  const bubbleManager = new SpeechBubbleManager(
    bubbleContainer,
    (payload: NotifyPayload) => {
      currentNotificationState = payload.state;
      animator.setState(payload.state);
      soundManager.playForState(payload.state, payload.sound || payload.event);
    },
    (opt: NotifyOption, item: NotifyPayload) => {
      // 1. Play feedback sound matching decision
      if (opt.sound) {
        soundManager.play(opt.sound);
      } else if (opt.style === 'primary') {
        soundManager.play('task_complete'); // usagi_yaha
        animator.setState('success');
      } else if (opt.style === 'danger') {
        soundManager.play('attention_surprise'); // usagi_haaa
        animator.setState('alert');
      } else {
        soundManager.play('quick_notification'); // usagi_yaha_short
      }

      // 2. Post human decision back to local server / agent queue
      const choice: UserChoice = {
        id: opt.id || opt.label,
        label: opt.label,
        questionId: item.id,
        source: item.source,
        timestamp: Date.now(),
      };

      fetch('http://127.0.0.1:7788/action/choice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(choice),
      }).catch((err) => console.warn('[Renderer] Failed to post choice:', err));
    }
  );

  // Load Chiikawa 3D GLB model (seated desk-companion pose)
  try {
    await scene.loadModel('./chiikawa_sitting.glb');
  } catch (err) {
    console.warn('Fallback loading ./chiikawa.glb...', err);
    try {
      await scene.loadModel('./chiikawa.glb');
    } catch (err2) {
      console.error('All model load attempts failed:', err2);
    }
  }

  // Start rendering
  scene.startRenderLoop();

  // Mouse hit-testing state tracking
  let isMouseHovering = false;

  const updateHitTest = (cursor: CursorPosition, winBounds: WindowBounds) => {
    // Check if cursor is over speech bubble (including quick-choice buttons)
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
        window.electronAPI.setIgnoreMouseEvents(!isHit, true);
      }
    }
  };

  // Drag and click handling for Chiikawa mascot with squish physics
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let hasMoved = false;

  window.addEventListener('mousedown', (e: MouseEvent) => {
    // Check if clicked on speech bubble
    const bubbleEl = bubbleManager.getActiveBubbleElement();
    if (bubbleEl && bubbleEl.contains(e.target as Node)) {
      return;
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
        // 🐾 Trigger squishy stretching and squirming!
        animator.setDragging(true, dx * 1.8, dy * 1.8);
      }
    }
  });

  window.addEventListener('mouseup', () => {
    if (isDragging) {
      // 🐾 Release jello spring rebound
      animator.setDragging(false);

      if (!hasMoved) {
        // Clicked on mascot without dragging: playful happy hop + random cute reaction sound!
        animator.setState('success');
        soundManager.playRandomReaction();
        setTimeout(() => {
          if (!bubbleManager.hasActiveBubble()) {
            animator.setState('idle');
          }
        }, 1500);
      }
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

    window.electronAPI.onSoundEnabled((enabled: boolean) => {
      soundManager.setEnabled(enabled);
    });

    window.electronAPI.onPlaySound((clipOrEvent: string) => {
      soundManager.play(clipOrEvent);
    });

    // Notify main that renderer is ready
    window.electronAPI.rendererReady();
  }
}

window.addEventListener('DOMContentLoaded', init);
