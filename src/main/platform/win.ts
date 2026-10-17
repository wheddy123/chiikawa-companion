import { screen, BrowserWindow, app } from 'electron';

export class WindowsPlatformHandler {
  private window: BrowserWindow;
  private width: number;
  private height: number;

  constructor(window: BrowserWindow, width: number, height: number) {
    this.window = window;
    this.width = width;
    this.height = height;

    this.init();
  }

  private init(): void {
    // Set position initially
    this.repositionToTaskbarCorner();

    // Listen to display changes (resolution change, DPI scaling change, taskbar move)
    screen.on('display-metrics-changed', () => {
      this.repositionToTaskbarCorner();
    });

    // Keep always on top above taskbar
    this.window.setAlwaysOnTop(true, 'screen-saver');

    // Windows shows window by default
    this.window.show();
  }

  public repositionToTaskbarCorner(): void {
    if (this.window.isDestroyed()) return;

    const primaryDisplay = screen.getPrimaryDisplay();
    const workArea = primaryDisplay.workArea; // already accounts for taskbar position & scale

    const x = Math.round(workArea.x + workArea.width - this.width);
    const y = Math.round(workArea.y + workArea.height - this.height);

    this.window.setBounds({
      x,
      y,
      width: this.width,
      height: this.height,
    });
  }

  public setAutoStart(enable: boolean): void {
    app.setLoginItemSettings({
      openAtLogin: enable,
      path: process.execPath,
      args: ['--autostart'],
    });
  }

  public isAutoStartEnabled(): boolean {
    return app.getLoginItemSettings().openAtLogin;
  }
}
