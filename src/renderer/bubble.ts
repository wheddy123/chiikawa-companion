import type { NotifyPayload, NotifyOption } from '../types';

export class SpeechBubbleManager {
  private container: HTMLElement;
  private queue: NotifyPayload[] = [];
  private activeItem: NotifyPayload | null = null;
  private timer: number | null = null;
  private shownAt: number = 0;
  private hideAt: number = 0;
  private onStateChange: (payload: NotifyPayload) => void;
  private onOptionClick?: (opt: NotifyOption, item: NotifyPayload) => void;
  private onBubbleVisibilityChange?: (hasBubble: boolean) => void;

  constructor(
    container: HTMLElement,
    onStateChange: (payload: NotifyPayload) => void,
    onOptionClick?: (opt: NotifyOption, item: NotifyPayload) => void,
    onBubbleVisibilityChange?: (hasBubble: boolean) => void
  ) {
    this.container = container;
    this.onStateChange = onStateChange;
    this.onOptionClick = onOptionClick;
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
      // If alert or has interactive options, prioritize over normal items
      const isPriority = notification.state === 'alert' || (notification.options && notification.options.length > 0);
      const isCurrentPriority = this.activeItem.state === 'alert' || (this.activeItem.options && this.activeItem.options.length > 0);

      if (isPriority && !isCurrentPriority) {
        this.clearTimer();
        this.queue.unshift(this.activeItem);
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
    const hasOptions = item.options && item.options.length > 0;
    bubble.className = `bubble state-${item.state}${hasOptions ? ' has-options' : ''}`;

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

    // Render interactive quick action buttons if provided
    if (hasOptions) {
      const optionsContainer = document.createElement('div');
      optionsContainer.className = 'bubble-options';

      item.options!.forEach((rawOpt) => {
        const opt: NotifyOption =
          typeof rawOpt === 'string'
            ? {
                id: rawOpt,
                label: rawOpt,
                style: this.inferOptionStyle(rawOpt),
              }
            : {
                id: rawOpt.id || rawOpt.label,
                label: rawOpt.label,
                style: rawOpt.style || this.inferOptionStyle(rawOpt.label),
                sound: rawOpt.sound,
              };

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `bubble-btn bubble-btn-${opt.style || 'secondary'}`;
        btn.textContent = opt.label;

        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.handleOptionSelection(btn, opt, item, textEl);
        });

        optionsContainer.appendChild(btn);
      });

      bubble.appendChild(optionsContainer);
    }

    // Dismiss on click background of bubble (if not clicking buttons)
    bubble.addEventListener('click', (e) => {
      e.stopPropagation();
      this.dismiss();
    });

    this.container.appendChild(bubble);

    if (this.onBubbleVisibilityChange) {
      this.onBubbleVisibilityChange(true);
    }

    // Auto-dismiss logic:
    // Auto-advance with dynamic reading time (~2s base + word calculation) and allow instant click-to-advance
    // Only stay sticky if item.sticky === true
    const isSticky = item.sticky === true;
    this.shownAt = performance.now();
    if (!isSticky) {
      const words = (item.message || '').trim().split(/\s+/).filter(Boolean).length;
      let duration = Math.max(2500, 2000 + words * 180);

      if (item.duration_ms && item.duration_ms > 0) {
        duration = item.duration_ms;
      }

      // If multiple items are waiting in the queue, cap duration to keep messages advancing
      if (this.queue.length > 0) {
        duration = Math.min(duration, 3000);
      }

      this.hideAt = this.shownAt + duration;
      this.timer = window.setTimeout(() => {
        this.dismiss();
      }, duration);
    } else {
      this.hideAt = 0;
    }
  }

  public getDebugState() {
    return {
      text: this.activeItem?.message || '',
      shownAt: this.shownAt,
      hideAt: this.hideAt,
      queueLen: this.queue.length,
      sticky: this.activeItem?.sticky ?? false,
    };
  }

  private handleOptionSelection(
    clickedBtn: HTMLButtonElement,
    opt: NotifyOption,
    item: NotifyPayload,
    textEl: HTMLElement
  ): void {
    this.clearTimer();

    // Disable all buttons in options container
    const container = clickedBtn.parentElement;
    if (container) {
      container.querySelectorAll('button').forEach((b) => {
        b.disabled = true;
        if (b !== clickedBtn) {
          b.style.opacity = '0.35';
          b.style.transform = 'scale(0.95)';
        }
      });
    }

    clickedBtn.classList.add('selected');
    textEl.textContent = `✓ Đã chọn: ${opt.label}`;

    if (this.onOptionClick) {
      this.onOptionClick(opt, item);
    }

    // Brief confirmation animation before moving to next item
    setTimeout(() => {
      this.dismiss();
    }, 1100);
  }

  private inferOptionStyle(label: string): 'primary' | 'danger' | 'secondary' {
    const l = label.toLowerCase();
    if (/đồng ý|ok|tiếp tục|duyệt|chấp nhận|yes|approve|continue|proceed|retry|thử lại/i.test(l)) {
      return 'primary';
    }
    if (/từ chối|hủy|không|dừng|cancel|reject|abort|stop|no/i.test(l)) {
      return 'danger';
    }
    return 'secondary';
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
    this.hideAt = 0;
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
