import { app, Tray, Menu, nativeImage, clipboard, shell, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';
import type { ConfigManager } from './config';
import type { WindowsPlatformHandler } from './platform/win';
import type { MacPlatformHandler } from './platform/mac';

export class TrayManager {
  private tray: Tray | null = null;
  private configManager: ConfigManager;
  private window: BrowserWindow;
  private winHandler?: WindowsPlatformHandler;
  private macHandler?: MacPlatformHandler;

  constructor(
    configManager: ConfigManager,
    window: BrowserWindow,
    winHandler?: WindowsPlatformHandler,
    macHandler?: MacPlatformHandler
  ) {
    this.configManager = configManager;
    this.window = window;
    this.winHandler = winHandler;
    this.macHandler = macHandler;

    this.init();
  }

  private init(): void {
    const icon = this.createTrayIcon();
    this.tray = new Tray(icon);
    this.tray.setToolTip('Chiikawa Companion');

    this.updateContextMenu();
  }

  private createTrayIcon(): Electron.NativeImage {
    // Generate a simple circular mascot icon or load from assets
    const iconPath = path.join(app.getAppPath(), 'assets', 'tray.png');
    if (fs.existsSync(iconPath)) {
      const img = nativeImage.createFromPath(iconPath);
      img.setTemplateImage(true);
      return img;
    }

    // Fallback: 16x16 transparent PNG with cute dot
    // A 16x16 1-bit or RGBA PNG buffer
    const size = 16;
    const canvas = nativeImage.createEmpty();
    // Using a base64 encoded cute 16x16 circle icon
    const base64Icon =
      'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAHBJREFUOE+lk8ERwCAIA13GUTpKh3CUDmEc0wOxgdZ+3p8eCYGQUgD9e9+iXWsdzrlSCSil1Frb4zjnkFJCKbX3704YwxgDgGma/hNSSiClhOM4Pg2MMTDGvA1SSgAALMsylFJK3d29tVYq/Uwp5XFk4g/r7w/5d0g0HAAAAABJRU5ErkJggg==';
    const img = nativeImage.createFromBuffer(Buffer.from(base64Icon, 'base64'));
    img.setTemplateImage(true);
    return img;
  }

  public updateContextMenu(): void {
    if (!this.tray) return;

    const config = this.configManager.getConfig();
    const isWin = process.platform === 'win32';
    const isAutoStart = isWin
      ? this.winHandler?.isAutoStartEnabled() ?? false
      : app.getLoginItemSettings().openAtLogin;

    const isVisible = this.window.isVisible();

    const contextMenu = Menu.buildFromTemplate([
      {
        label: isVisible ? 'Ẩn mascot' : 'Hiện mascot',
        click: () => {
          if (this.macHandler) {
            this.macHandler.toggleMascot();
          } else {
            if (this.window.isVisible()) {
              this.window.hide();
              this.window.webContents.send('mascot:visibility', false);
            } else {
              this.window.show();
              this.window.webContents.send('mascot:visibility', true);
            }
          }
          this.updateContextMenu();
        },
      },
      {
        label: 'Đặt lại vị trí góc dưới',
        click: () => {
          if (this.macHandler) {
            this.macHandler.repositionToBottom();
          } else if (this.winHandler) {
            this.winHandler.repositionToTaskbarCorner();
          }
        },
      },
      {
        type: 'separator',
      },
      {
        label: config.soundEnabled ? 'Tắt tiếng' : 'Bật tiếng',
        click: () => {
          const next = !config.soundEnabled;
          this.configManager.updateConfig({ soundEnabled: next });
          if (!this.window.isDestroyed()) {
            this.window.webContents.send('mascot:sound-enabled', next);
          }
          this.updateContextMenu();
        },
      },
      {
        label: 'Sao chép token',
        click: () => {
          clipboard.writeText(config.token);
        },
      },
      {
        label: 'Mở thư mục cấu hình',
        click: () => {
          shell.openPath(this.configManager.getUserDataPath());
        },
      },
      {
        label: 'Khởi động cùng máy',
        type: 'checkbox',
        checked: isAutoStart,
        click: (menuItem) => {
          const enable = menuItem.checked;
          if (isWin && this.winHandler) {
            this.winHandler.setAutoStart(enable);
          } else {
            app.setLoginItemSettings({ openAtLogin: enable });
          }
        },
      },
      {
        type: 'separator',
      },
      {
        label: 'Thoát',
        click: () => {
          app.quit();
        },
      },
    ]);

    this.tray.setContextMenu(contextMenu);
  }

  public updateSoundState(_enabled: boolean): void {
    this.updateContextMenu();
  }

  public destroy(): void {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }
}
