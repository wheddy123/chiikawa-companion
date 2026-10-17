import type { NotifyPayload } from '../types';

export class SpeechBubbleManager {
  private container: HTMLElement;
  private queue: NotifyPayload[] = [];
  private activeItem: NotifyPayload | null = null;
  private timer: number | null = null;
  private onStateChange: (payload: NotifyPayload) => void;
  private onBubbleVisibilityChange?: (hasBubble: boolean) => void;

  constructor(
    container: HTMLElement,
    onStateChange: (payload: NotifyPayload) => void,
    onBubbleVisibilityChange?: (hasBubble: boolean) => void
  ) {
    this.container = container;
    this.onStateChange = onStateChange;
    this.onBubbleVisibilityChange = onBubbleVisibilityChange;
  }

  public enqueue(notification: NotifyPayload): void {
    // If queue length reaches 5, drop the oldest pending items
    if (this.queue.length >= 5) {
      this.queue.shift();
    }

    if (!this.activeItem) {
      this.show(notification);
    } else {
      // If alert, alert takes immediate priority over non-alert
      if (notification.state === 'alert' && this.activeItem.state !== 'alert') {
        this.clearTimer();
        this.queue.unshift(this.activeItem); // push current back to front of queue
        this.show(notification);
      } else {
        this.queue.push(notification);
        this.updateBadge();
      }
    }
  }

  public hasActiveBubble(): boolean {
    return this.activeItem !== null;
  }

  public getActiveBubbleElement(): HTMLElement | null {
    return this.container.querySelector('.bubble');
  }

  private show(item: NotifyPayload): void {
    this.clearTimer();
    this.activeItem = item;
    this.onStateChange(item);

    this.container.innerHTML = '';

    const bubble = document.createElement('div');
    bubble.className = `bubble state-${item.state}`;

    const header = document.createElement('div');
    header.className = 'bubble-header';

    const sourceEl = document.createElement('span');
    sourceEl.className = 'bubble-source';
    sourceEl.textContent = item.source || 'agent';
    header.appendChild(sourceEl);

    if (this.queue.length > 0) {
      const badge = document.createElement('span');
      badge.className = 'bubble-queue-badge';
      badge.textContent = `+${this.queue.length}`;
      header.appendChild(badge);
    }

    const textEl = document.createElement('div');
    textEl.className = 'bubble-text';
    textEl.textContent = item.message;

    bubble.appendChild(header);
    bubble.appendChild(textEl);

    // Dismiss on click
    bubble.addEventListener('click', (e) => {
      e.stopPropagation();
      this.dismiss();
    });

    this.container.appendChild(bubble);

    if (this.onBubbleVisibilityChange) {
      this.onBubbleVisibilityChange(true);
    }

    // Auto-dismiss logic:
    // If state === 'alert' or item.sticky === true, hold until user clicks
    const isSticky = item.state === 'alert' || item.sticky === true;
    if (!isSticky) {
      const duration = item.duration_ms && item.duration_ms > 0 ? item.duration_ms : 5000;
      this.timer = window.setTimeout(() => {
        this.dismiss();
      }, duration);
    }
  }

  private updateBadge(): void {
    const badge = this.container.querySelector('.bubble-queue-badge');
    if (this.queue.length > 0) {
      if (badge) {
        badge.textContent = `+${this.queue.length}`;
      } else {
        const header = this.container.querySelector('.bubble-header');
        if (header) {
          const newBadge = document.createElement('span');
          newBadge.className = 'bubble-queue-badge';
          newBadge.textContent = `+${this.queue.length}`;
          header.appendChild(newBadge);
        }
      }
    } else if (badge) {
      badge.remove();
    }
  }

  public dismiss(): void {
    this.clearTimer();
    const bubble = this.container.querySelector('.bubble');
    if (bubble) {
      bubble.classList.add('dismissing');
      setTimeout(() => {
        this.next();
      }, 180);
    } else {
      this.next();
    }
  }

  private next(): void {
    this.container.innerHTML = '';
    this.activeItem = null;

    if (this.queue.length > 0) {
      const nextItem = this.queue.shift()!;
      this.show(nextItem);
    } else {
      if (this.onBubbleVisibilityChange) {
        this.onBubbleVisibilityChange(false);
      }
      // Revert to idle state
      this.onStateChange({
        state: 'idle',
        message: '',
      });
      if ((window as any).electronAPI?.notifyDismissed) {
        (window as any).electronAPI.notifyDismissed();
      }
    }
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
