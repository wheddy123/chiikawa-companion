import { ProceduralAnimator } from './animation';
import { MascotScene } from './scene';
import { SpeechBubbleManager } from './bubble';
import { SoundManager } from './audio';
import { Gesture } from './gesture';
import type { ElectronAPI } from '../preload';
import type { CursorPosition, WindowBounds, NotifyPayload, NotifyOption, UserChoice, SystemTelemetry } from '../types';

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

  // Load original pristine Chiikawa 3D model
  try {
    await scene.loadModel('./chiikawa.glb');
  } catch (err) {
    console.error('Failed to load chiikawa.glb:', err);
  }

  // Start rendering
  scene.startRenderLoop();

  // Mouse hit-testing & full-screen drag tracking
  let isMouseHovering = false;
  let isDragging = false;
  let dragGrabOffsetX = 0;
  let dragGrabOffsetY = 0;
  let lastDragScreenX = 0;
  let lastDragScreenY = 0;
  let hasMoved = false;
  let latestBounds: WindowBounds = { x: 0, y: 0, width: 280, height: 320 };
  let latestCursor: CursorPosition = { x: 0, y: 0 };

  const updateHitTest = (cursor: CursorPosition, winBounds: WindowBounds) => {
    // When actively dragging, NEVER ignore mouse events or interrupt drag!
    if (isDragging) {
      return;
    }

    // Check if cursor is over speech bubble (including quick-choice buttons & tail buffer)
    const bubbleEl = bubbleManager.getActiveBubbleElement();
    let hitBubble = false;
    if (bubbleEl && !bubbleEl.classList.contains('dismissing')) {
      const rect = bubbleEl.getBoundingClientRect();
      const localX = cursor.x - winBounds.x;
      const localY = cursor.y - winBounds.y;
      hitBubble =
        localX >= rect.left - 2 &&
        localX <= rect.right + 2 &&
        localY >= rect.top &&
        localY <= rect.bottom + 14;
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

  // Drag movement handler: pins mascot precisely to cursor at grab offset anywhere on desktop
  const handleDragMove = (screenX: number, screenY: number) => {
    if (!isDragging) return;

    const dx = screenX - lastDragScreenX;
    const dy = screenY - lastDragScreenY;

    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
      hasMoved = true;
      lastDragScreenX = screenX;
      lastDragScreenY = screenY;

      // Absolute target coordinates on screen
      const targetX = Math.round(screenX - dragGrabOffsetX);
      const targetY = Math.round(screenY - dragGrabOffsetY);

      latestBounds.x = targetX;
      latestBounds.y = targetY;

      window.electronAPI?.moveWindowTo(targetX, targetY);
      animator.setDragging(true, dx * 1.2, dy * 1.2);
    }
  };

  let lastToggleTime = 0;
  const toggleMute = () => {
    const now = performance.now();
    // 150ms re-entry guard for safety
    if (now - lastToggleTime < 150) {
      return;
    }
    lastToggleTime = now;
    window.electronAPI?.toggleSound();
  };

  const gesture = new Gesture({
    onSingle: () => {
      if (animator.isIdle() && !bubbleManager.hasActiveBubble()) {
        animator.setState('success');
        if (soundManager.isEnabled()) {
          soundManager.playRandomReaction();
        }
        setTimeout(() => {
          if (!bubbleManager.hasActiveBubble()) {
            animator.setState('idle');
          }
        }, 1200);
      }
    },
    onDouble: () => {
      toggleMute();
    },
    onDragStart: () => {
      isDragging = true;
      hasMoved = true;
      window.electronAPI?.setIgnoreMouseEvents(false);
      animator.setDragging(true, 0, 0);
    },
  });

  const endDrag = () => {
    if (!isDragging) return;
    isDragging = false;
    animator.setDragging(false);
    updateHitTest(latestCursor, latestBounds);
  };

  window.addEventListener('mousedown', (e: MouseEvent) => {
    // Check if clicked on speech bubble
    const bubbleEl = bubbleManager.getActiveBubbleElement();
    if (bubbleEl && bubbleEl.contains(e.target as Node)) {
      return;
    }

    if (isMouseHovering || scene.hitTestClient(e.clientX, e.clientY)) {
      hasMoved = false;
      dragGrabOffsetX = e.clientX;
      dragGrabOffsetY = e.clientY;
      lastDragScreenX = e.screenX;
      lastDragScreenY = e.screenY;
      gesture.pointerDown(e.screenX, e.screenY, performance.now());
    }
  });

  window.addEventListener('mousemove', (e: MouseEvent) => {
    if (e.buttons === 0) {
      if (isDragging) {
        endDrag();
      }
      return;
    }
    gesture.pointerMove(e.screenX, e.screenY);
    if (isDragging) {
      handleDragMove(e.screenX, e.screenY);
    }
  });

  window.addEventListener('mouseup', (e: MouseEvent) => {
    gesture.pointerUp(e.screenX, e.screenY, performance.now());
    if (isDragging) {
      endDrag();
    }
  });

  // IPC listeners from preload
  if (window.electronAPI) {
    window.electronAPI.onNotify((payload: NotifyPayload) => {
      bubbleManager.enqueue(payload);
    });

    window.electronAPI.onCursor((pos: CursorPosition, winBounds: WindowBounds) => {
      latestCursor = pos;
      if (!isDragging) {
        latestBounds = winBounds;
      }

      animator.updateCursor(pos, winBounds);

      if (!isDragging) {
        updateHitTest(pos, winBounds);
      } else {
        // Feed OS-level cursor position into drag movement as well
        handleDragMove(pos.x, pos.y);
      }
    });

    window.electronAPI.onVisibility((visible: boolean) => {
      if (visible) {
        scene.startRenderLoop();
      } else {
        scene.stopRenderLoop();
      }
    });

    let initialSoundStateSet = false;
    window.electronAPI.onSoundEnabled((enabled: boolean) => {
      const prevEnabled = soundManager.isEnabled();
      soundManager.setEnabled(enabled);
      scene.setMuted(!enabled);
      animator.setMuted(!enabled);

      if (!initialSoundStateSet) {
        initialSoundStateSet = true;
        return;
      }

      if (prevEnabled !== enabled) {
        if (!enabled) {
          bubbleManager.enqueue({
            state: 'alert',
            message: 'Mmmph!! Mmph-yaaa!! 🩹\n(Chiikawa đã bị dán băng keo bịt mồm & tắt tiếng. Nhấn đúp để gỡ!)',
            source: 'chiikawa',
            duration_ms: 3200,
            sticky: false,
          });
        } else {
          bubbleManager.enqueue({
            state: 'success',
            message: 'Haaa~! Thoát rồi! Đã gỡ băng keo & bật lại âm thanh 🎵',
            source: 'chiikawa',
            sound: 'usagi_yaha',
            duration_ms: 2800,
            sticky: false,
          });
        }
      }
    });

    window.electronAPI.onPlaySound((clipOrEvent: string) => {
      soundManager.play(clipOrEvent);
    });

    window.electronAPI.onTelemetry((telemetry: SystemTelemetry) => {
      animator.setTelemetry(telemetry);
    });

    // Notify main that renderer is ready
    window.electronAPI.rendererReady();

    // Expose debug interface strictly when in debug mode
    const isDebug =
      new URLSearchParams(window.location.search).get('debug') === '1' ||
      Boolean((window.electronAPI as any)?.isDebug);

    if (isDebug) {
      (window as any).__chiikawa = {
        getState: () => {
          const bState = bubbleManager.getDebugState();
          const bandaidScreenPx = scene.projectBandaidToScreen();
          const bandaidWorldPos = scene.getBandaidWorldPosition();
          const bandaidVis = scene.isBandaidVisible();
          const bubbleEl = bubbleManager.getActiveBubbleElement();
          const hasCountdownBar = Boolean(bubbleEl?.querySelector('.bubble-countdown-bar'));
          const hasInteractiveBadge = Boolean(bubbleEl?.querySelector('.bubble-badge-interactive'));
          const isThinkingShimmer = Boolean(bubbleEl?.querySelector('.thinking-shimmer'));
          const bubbleRect = bubbleEl ? bubbleEl.getBoundingClientRect() : null;
            return {
              muted: !soundManager.isEnabled(),
              bubble: {
                visible: bubbleManager.hasActiveBubble(),
                text: bState.text,
                shownAt: bState.shownAt,
                hideAt: bState.hideAt,
                queueLen: bState.queueLen,
                sticky: bState.sticky,
                hasCountdownBar,
                hasInteractiveBadge,
                isThinkingShimmer,
                width: bubbleRect ? bubbleRect.width : 0,
                height: bubbleRect ? bubbleRect.height : 0,
              },
            mascot: {
              rootPos: animator.currentPosition.toArray(),
              rootRot: [animator.currentRotation.x, animator.currentRotation.y, animator.currentRotation.z],
              rootScale: animator.currentScale.toArray(),
            },
            camera: scene.getCameraDebug(),
            bandaid: {
              visible: bandaidVis,
              worldPos: bandaidWorldPos,
              screenPx: bandaidScreenPx,
            },
            mouthAnchor: (scene as any).getMouthAnchor?.() || null,
          };
        },
        projectToScreen: (v3: [number, number, number]) => scene.projectPointToScreen(v3),
        setBandaidVisible: (vis: boolean) => scene.setBandaidVisible(vis),
        placeBandaidAtScreen: (px: number, py: number) => scene.placeBandaidAtScreen(px, py),
        scene,
        animator,
        bubbleManager,
      };
    }
  }
}

window.addEventListener('DOMContentLoaded', init);
