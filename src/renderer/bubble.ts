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
      const isPriority =
        notification.state === 'alert' ||
        Boolean(notification.interactive) ||
        Boolean(notification.choices && notification.choices.length > 0) ||
        Boolean(notification.options && notification.options.length > 0);
      const isCurrentPriority =
        this.activeItem.state === 'alert' ||
        Boolean(this.activeItem.interactive) ||
        Boolean(this.activeItem.choices && this.activeItem.choices.length > 0) ||
        Boolean(this.activeItem.options && this.activeItem.options.length > 0);

      const isCurrentThinking = this.activeItem.state === 'thinking';

      if (isCurrentThinking) {
        this.clearTimer();
        this.show(notification);
      } else if (isPriority && !isCurrentPriority) {
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

    // If item.choices is provided and no options, map choices to options
    if (item.choices && (!item.options || item.options.length === 0)) {
      item.options = item.choices.map((c) => ({ id: c, label: c }));
    }

    const isInteractive = Boolean(
      item.interactive || (item.choices && item.choices.length > 0) || (item.options && item.options.length > 0)
    );
    const isThinking = item.state === 'thinking';
    const hasOptions = Boolean(item.options && item.options.length > 0);

    const bubble = document.createElement('div');
    bubble.className = `bubble state-${item.state}${hasOptions ? ' has-options' : ''}${isInteractive ? ' is-interactive' : ''}`;

    // Mini Agent Badge & Color Theme (OpenCode: oc, Antigravity: agy)
    if (item.agent) {
      const agentKey = String(item.agent).toLowerCase();
      const badgeText = agentKey === 'oc' ? 'OC' : agentKey === 'agy' ? 'AGY' : item.agent.toUpperCase();
      bubble.classList.add(`theme-${agentKey}`);

      const agentBadge = document.createElement('div');
      agentBadge.className = 'bubble-agent-badge';
      agentBadge.textContent = badgeText;
      bubble.appendChild(agentBadge);
    }

    const header = document.createElement('div');
    header.className = 'bubble-header';

    const sourceEl = document.createElement('span');
    sourceEl.className = 'bubble-source';
    sourceEl.textContent = item.source || (isThinking ? 'thinking' : 'agent');
    header.appendChild(sourceEl);

    const badgesContainer = document.createElement('div');
    badgesContainer.className = 'bubble-header-badges';

    // Interactive "!?" indicator badge
    if (isInteractive) {
      const interactiveBadge = document.createElement('span');
      interactiveBadge.className = 'bubble-badge-interactive';
      interactiveBadge.textContent = '!?';
      interactiveBadge.title = 'Chờ phản hồi';
      badgesContainer.appendChild(interactiveBadge);
    }

    // Queue count badge
    if (this.queue.length > 0) {
      const queueBadge = document.createElement('span');
      queueBadge.className = 'bubble-queue-badge';
      queueBadge.textContent = `+${this.queue.length}`;
      badgesContainer.appendChild(queueBadge);
    }

    header.appendChild(badgesContainer);
    bubble.appendChild(header);

    // Text container: animated thinking text or standard text
    const textEl = document.createElement('div');
    if (isThinking) {
      textEl.className = 'bubble-text bubble-text-thinking';
      const shimmerEl = document.createElement('span');
      shimmerEl.className = 'thinking-shimmer';
      shimmerEl.textContent =
        item.message && item.message.trim().length > 0 ? item.message : '...đang nghĩ ngợi...';
      textEl.appendChild(shimmerEl);
    } else {
      textEl.className = 'bubble-text';
      textEl.textContent = item.message || '';
    }
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

    // Dismiss on click background of bubble (only for non-sticky, non-interactive, non-thinking notifications)
    bubble.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!item.sticky && !isInteractive && !isThinking) {
        this.dismiss();
      }
    });

    this.container.appendChild(bubble);

    if (this.onBubbleVisibilityChange) {
      this.onBubbleVisibilityChange(true);
    }

    this.shownAt = performance.now();

    // Auto-dismiss and countdown bar logic:
    // Strictly disabled for interactive items, thinking states, and sticky items
    const shouldAutoDismiss = !isInteractive && !isThinking && !item.sticky;

    if (shouldAutoDismiss) {
      const words = (item.message || '').trim().split(/\s+/).filter(Boolean).length;
      let duration = Math.min(12000, Math.max(2500, 2000 + words * 180));

      if (item.duration_ms && item.duration_ms > 0) {
        duration = item.duration_ms;
      }

      // If multiple items are waiting in the queue, cap duration to keep messages advancing
      if (this.queue.length > 0) {
        duration = Math.min(duration, 3000);
      }

      // Inject slim 2.5px countdown progress line anchored at the bottom edge
      const countdownBar = document.createElement('div');
      countdownBar.className = 'bubble-countdown-bar';
      bubble.appendChild(countdownBar);

      // Trigger smooth GPU-accelerated CSS transition from scaleX(1) to scaleX(0)
      requestAnimationFrame(() => {
        countdownBar.getBoundingClientRect(); // force reflow
        countdownBar.style.transition = `transform ${duration}ms linear`;
        countdownBar.style.transform = 'scaleX(0)';
      });

      this.hideAt = this.shownAt + duration;
      this.timer = window.setTimeout(() => {
        this.dismiss();
      }, duration);
    } else {
      this.hideAt = 0;
    }
  }

  public getDebugState() {
    const text =
      this.activeItem?.state === 'thinking' && (!this.activeItem.message || !this.activeItem.message.trim())
        ? '...đang nghĩ ngợi...'
        : this.activeItem?.message || '';
    return {
      text,
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
    let badgesContainer = this.container.querySelector('.bubble-header-badges');
    const badge = this.container.querySelector('.bubble-queue-badge');
    if (this.queue.length > 0) {
      if (badge) {
        badge.textContent = `+${this.queue.length}`;
      } else {
        if (!badgesContainer) {
          const header = this.container.querySelector('.bubble-header');
          if (header) {
            badgesContainer = document.createElement('div');
            badgesContainer.className = 'bubble-header-badges';
            header.appendChild(badgesContainer);
          }
        }
        if (badgesContainer) {
          const newBadge = document.createElement('span');
          newBadge.className = 'bubble-queue-badge';
          newBadge.textContent = `+${this.queue.length}`;
          badgesContainer.appendChild(newBadge);
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
