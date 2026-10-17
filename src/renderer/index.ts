import { ProceduralAnimator } from './animation';
import { MascotScene } from './scene';
import { SpeechBubbleManager } from './bubble';
import { SoundManager } from './audio';
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
  const soundManager = new SoundManager();

  // Initialize SpeechBubbleManager
  let currentNotificationState: string = 'idle';

  const bubbleManager = new SpeechBubbleManager(
    bubbleContainer,
    (payload: NotifyPayload) => {
      currentNotificationState = payload.state;
      animator.setState(payload.state);
      soundManager.playForState(payload.state, payload.sound || payload.event);
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

  // Chat box elements
  const chatContainer = document.getElementById('chat-container')!;
  const chatInput = document.getElementById('chat-input') as HTMLInputElement;
  const chatSendBtn = document.getElementById('chat-send')!;
  const chatCloseBtn = document.getElementById('chat-close')!;
  const chatToggleBtn = document.getElementById('chat-toggle-btn')!;

  let isChatOpen = false;

  const openChat = () => {
    isChatOpen = true;
    chatContainer.classList.remove('hidden');
    window.electronAPI?.setIgnoreMouseEvents(false);
    window.electronAPI?.focusWindow();
    setTimeout(() => {
      chatInput.focus();
      chatInput.select();
    }, 40);
    soundManager.play('question_prompt');
  };

  const closeChat = () => {
    isChatOpen = false;
    chatContainer.classList.add('hidden');
    chatInput.blur();
    window.electronAPI?.blurWindow();
    if (window.electronAPI) {
      window.electronAPI.setIgnoreMouseEvents(true, true);
    }
  };

  const sendPrompt = () => {
    const text = chatInput.value.trim();
    if (!text) return;
    chatInput.value = '';
    closeChat();

    // Show prompt in speech bubble
    bubbleManager.enqueue({
      state: 'thinking',
      message: text,
      source: 'sếp',
      duration_ms: 6000,
    });

    // Send prompt to local server / pending agent queue
    fetch('http://127.0.0.1:7788/chat/input', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: text, timestamp: Date.now() }),
    }).catch(() => {});

    // Chiikawa cute acknowledgment after thinking for a moment
    setTimeout(() => {
      bubbleManager.enqueue({
        state: 'success',
        message: 'Chiikawa đã ghi nhận rồi sếp ơi! Đang chuyển tiếp cho Agent xử lý 🐾',
        source: 'chiikawa',
        duration_ms: 4500,
      });
    }, 2400);
  };

  chatToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isChatOpen) {
      closeChat();
    } else {
      openChat();
    }
  });

  chatCloseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeChat();
  });

  chatSendBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    sendPrompt();
  });

  chatInput.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    window.electronAPI?.setIgnoreMouseEvents(false);
    window.electronAPI?.focusWindow();
  });

  chatInput.addEventListener('focus', () => {
    window.electronAPI?.focusWindow();
  });

  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      sendPrompt();
    } else if (e.key === 'Escape') {
      closeChat();
    }
  });

  const updateHitTest = (cursor: CursorPosition, winBounds: WindowBounds) => {
    if (isChatOpen) {
      if (window.electronAPI && isMouseHovering !== true) {
        isMouseHovering = true;
        window.electronAPI.setIgnoreMouseEvents(false);
      }
      return;
    }

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

    // Check if cursor is over chat toggle button
    const toggleRect = chatToggleBtn.getBoundingClientRect();
    const localX = cursor.x - winBounds.x;
    const localY = cursor.y - winBounds.y;
    const hitToggle =
      localX >= toggleRect.left &&
      localX <= toggleRect.right &&
      localY >= toggleRect.top &&
      localY <= toggleRect.bottom;

    // Check if cursor hits 3D mascot mesh
    const hitMesh = scene.hitTest(cursor.x, cursor.y, winBounds);

    const isHit = hitBubble || hitMesh || hitToggle;

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
    // If chat is open and clicked outside of chat, close it
    if (isChatOpen) {
      if (!chatContainer.contains(e.target as Node) && !chatToggleBtn.contains(e.target as Node)) {
        closeChat();
        return;
      }
    }

    // Check if clicked on bubble or chat
    const bubbleEl = bubbleManager.getActiveBubbleElement();
    if (bubbleEl && bubbleEl.contains(e.target as Node)) {
      return;
    }
    if (chatContainer.contains(e.target as Node) || chatToggleBtn.contains(e.target as Node)) {
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
