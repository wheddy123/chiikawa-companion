import { app, BrowserWindow, screen } from 'electron';
import type { MascotConfig, NotifyPayload } from '../../types';

export class MacPlatformHandler {
  private window: BrowserWindow;
  private config: MascotConfig;
  private width: number;
  private height: number;
  private hasCustomPosition = false;

  constructor(window: BrowserWindow, config: MascotConfig) {
    this.window = window;
    this.config = config;
    this.width = config.windowWidth;
    this.height = config.windowHeight;

    this.init();
  }

  private init(): void {
    // 1. Hide from Dock (runs as Menu Bar companion)
    if (app.dock) {
      app.dock.hide();
    }

    // 2. Set window properties: floating above other windows & visible on all spaces
    this.window.setAlwaysOnTop(true, 'screen-saver');
    this.window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    // 3. Position at bottom of screen
    this.repositionToBottom();

    // 4. Show window
    this.window.showInactive();
    this.window.webContents.send('mascot:visibility', true);

    // 5. Reposition when screen metrics change (if not dragged to custom spot)
    screen.on('display-metrics-changed', () => {
      if (!this.hasCustomPosition) {
        this.repositionToBottom();
      }
    });

    // 6. Friendly greeting on startup
    setTimeout(() => {
      this.window.webContents.send('mascot:notify', {
        state: 'success',
        message: 'Chào sếp! Em đứng ở góc này canh chừng cho sếp nhé 🐾',
        source: 'chiikawa',
        duration_ms: 5000,
      });
    }, 600);
  }

  public repositionToBottom(): void {
    if (this.window.isDestroyed()) return;

    const primary = screen.getPrimaryDisplay();
    const workArea = primary.workArea; // accounts for Dock and Menu Bar

    // Bottom-right position, resting directly on bottom of work area
    const x = Math.round(workArea.x + workArea.width - this.width - 24);
    const y = Math.round(workArea.y + workArea.height - this.height);

    this.window.setBounds({
      x,
      y,
      width: this.width,
      height: this.height,
    });
    this.hasCustomPosition = false;
  }

  public handleNotification(payload: NotifyPayload): void {
    if (this.window.isDestroyed()) return;

    // Ensure window is visible
    if (!this.window.isVisible()) {
      this.window.showInactive();
      this.window.webContents.send('mascot:visibility', true);
    }
  }

  public onNotificationComplete(): void {
    // Mascot stays at the bottom in idle state
  }

  public toggleMascot(): void {
    if (this.window.isDestroyed()) return;

    if (this.window.isVisible()) {
      this.window.hide();
      this.window.webContents.send('mascot:visibility', false);
    } else {
      this.window.showInactive();
      this.window.webContents.send('mascot:visibility', true);
    }
  }

  public setCustomPosition(): void {
    this.hasCustomPosition = true;
  }

  public destroy(): void {
    // Cleanup if needed
  }
}
