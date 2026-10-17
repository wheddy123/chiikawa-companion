export interface GestureCbs {
  onSingle(): void;
  onDouble(): void;
  onDragStart(): void;
}

/**
 * Pure gesture state machine managing single-click, double-click, and drag gestures.
 * Prevents race conditions between native dblclick and click timers.
 */
export class Gesture {
  private down: { x: number; y: number; t: number } | null = null;
  private dragging = false;
  private lastUp: { x: number; y: number; t: number } | null = null;
  private singleTimer: any = null;

  constructor(
    private cb: GestureCbs,
    private slop = 6,
    private gap = 350,
    private dist = 14,
    private singleDelay = 280
  ) {}

  public pointerDown(sx: number, sy: number, t: number): void {
    this.down = { x: sx, y: sy, t };
    this.dragging = false;
  }

  public pointerMove(sx: number, sy: number): void {
    if (!this.down || this.dragging) return;
    if (Math.hypot(sx - this.down.x, sy - this.down.y) > this.slop) {
      this.dragging = true;
      if (this.singleTimer !== null) {
        clearTimeout(this.singleTimer);
        this.singleTimer = null;
      }
      this.lastUp = null;
      this.cb.onDragStart();
    }
  }

  public pointerUp(sx: number, sy: number, t: number): void {
    if (!this.down) return;
    const wasDrag = this.dragging;
    this.down = null;
    this.dragging = false;

    if (wasDrag) return; // drag is not a click

    const prev = this.lastUp;
    if (prev && t - prev.t <= this.gap && Math.hypot(sx - prev.x, sy - prev.y) <= this.dist) {
      if (this.singleTimer !== null) {
        clearTimeout(this.singleTimer);
        this.singleTimer = null;
      }
      this.lastUp = null;
      this.cb.onDouble(); // Exactly one double click
    } else {
      this.lastUp = { x: sx, y: sy, t };
      if (this.singleTimer !== null) {
        clearTimeout(this.singleTimer);
      }
      this.singleTimer = setTimeout(() => {
        this.lastUp = null;
        this.singleTimer = null;
        this.cb.onSingle();
      }, this.singleDelay);
    }
  }

  public cancel(): void {
    if (this.singleTimer !== null) {
      clearTimeout(this.singleTimer);
      this.singleTimer = null;
    }
    this.down = null;
    this.dragging = false;
    this.lastUp = null;
  }
}
