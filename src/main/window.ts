import { BrowserWindow, screen, ipcMain, app } from 'electron';
import path from 'path';
import type { MascotConfig } from '../types';

export class WindowManager {
  private window: BrowserWindow | null = null;
  private config: MascotConfig;
  private cursorPollTimer: NodeJS.Timeout | null = null;
  private isIgnoringMouseEvents = true;
  public onBubbleDismissed?: () => void;
  public onWindowMoved?: () => void;
  public onSoundToggled?: (enabled: boolean) => void;

  constructor(config: MascotConfig) {
    this.config = config;
  }

  public createWindow(): BrowserWindow {
    const isMac = process.platform === 'darwin';

    this.window = new BrowserWindow({
      width: this.config.windowWidth,
      height: this.config.windowHeight,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      hasShadow: false,
      focusable: true,
      enableLargerThanScreen: true,
      show: false, // will be shown by platform handler
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        devTools: process.env.NODE_ENV === 'development',
      },
    });

    // Default to click-through
    this.window.setIgnoreMouseEvents(true, { forward: true });

    // Multi-desktop / fullscreen visibility
    this.window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    // Console logging in dev mode
    this.window.webContents.on('console-message', (_event, _level, message) => {
      console.log(`[Renderer] ${message}`);
    });

    // Load renderer HTML
    const rendererPath = path.join(__dirname, '../renderer/index.html');
    const isDebug = process.env.CHIIKAWA_DEBUG === '1';
    this.window.loadFile(rendererPath, { query: isDebug ? { debug: '1' } : {} });

    // Setup IPC handlers
    this.setupIPC();

    // Start cursor tracking loop (~30Hz = 33ms)
    this.startCursorPolling();

    this.window.on('closed', () => {
      this.stopCursorPolling();
      this.window = null;
    });

    return this.window;
  }

  public getWindow(): BrowserWindow | null {
    return this.window;
  }

  private setupIPC(): void {
    ipcMain.on('window:set-ignore-mouse-events', (_event, ignore: boolean, forward: boolean = true) => {
      if (this.window && !this.window.isDestroyed()) {
        if (this.isIgnoringMouseEvents !== ignore) {
          this.isIgnoringMouseEvents = ignore;
          this.window.setIgnoreMouseEvents(ignore, { forward });
        }
      }
    });

    ipcMain.on('window:move-by', (_event, dx: number, dy: number) => {
      if (this.window && !this.window.isDestroyed()) {
        const bounds = this.window.getBounds();
        this.window.setBounds({
          x: Math.round(bounds.x + dx),
          y: Math.round(bounds.y + dy),
          width: bounds.width,
          height: bounds.height,
        });
        if (this.onWindowMoved) {
          this.onWindowMoved();
        }
      }
    });

    ipcMain.on('window:move-to', (_event, x: number, y: number) => {
      if (this.window && !this.window.isDestroyed()) {
        this.window.setBounds({
          x: Math.round(x),
          y: Math.round(y),
          width: this.config.windowWidth,
          height: this.config.windowHeight,
        });
        if (this.onWindowMoved) {
          this.onWindowMoved();
        }
      }
    });

    ipcMain.on('window:focus', () => {
      if (this.window && !this.window.isDestroyed()) {
        if (process.platform === 'darwin') {
          app.focus({ steal: true });
        }
        this.window.focus();
        this.window.webContents.focus();
      }
    });

    ipcMain.on('window:blur', () => {
      if (this.window && !this.window.isDestroyed()) {
        this.window.blur();
      }
    });

    ipcMain.on('mascot:bubble-dismissed', () => {
      if (this.onBubbleDismissed) {
        this.onBubbleDismissed();
      }
    });

    ipcMain.on('mascot:toggle-sound', () => {
      this.config.soundEnabled = !this.config.soundEnabled;
      if (this.onSoundToggled) {
        this.onSoundToggled(this.config.soundEnabled);
      }
      if (this.window && !this.window.isDestroyed()) {
        this.window.webContents.send('mascot:sound-enabled', this.config.soundEnabled);
      }
    });

    ipcMain.on('mascot:set-sound-enabled', (_event, enabled: boolean) => {
      this.config.soundEnabled = enabled;
      if (this.onSoundToggled) {
        this.onSoundToggled(enabled);
      }
      if (this.window && !this.window.isDestroyed()) {
        this.window.webContents.send('mascot:sound-enabled', enabled);
      }
    });

    ipcMain.on('renderer:ready', () => {
      console.log('[WindowManager] Renderer ready');
      if (this.window && !this.window.isDestroyed()) {
        this.window.webContents.send('mascot:sound-enabled', this.config.soundEnabled);
      }
    });
  }

  private startCursorPolling(): void {
    if (this.cursorPollTimer) return;

    // 60Hz polling interval (16ms) for liquid-smooth dragging and cursor tracking
    this.cursorPollTimer = setInterval(() => {
      if (!this.window || this.window.isDestroyed() || !this.window.isVisible()) {
        return;
      }

      try {
        const cursor = screen.getCursorScreenPoint();
        const bounds = this.window.getBounds();
        this.window.webContents.send('mascot:cursor', cursor, bounds);
      } catch (e) {
        // Window might be destroyed during poll
      }
    }, 16);
  }

  private stopCursorPolling(): void {
    if (this.cursorPollTimer) {
      clearInterval(this.cursorPollTimer);
      this.cursorPollTimer = null;
    }
  }

  public destroy(): void {
    this.stopCursorPolling();
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy();
      this.window = null;
    }
  }
}
