import { app, BrowserWindow } from 'electron';
import { ConfigManager } from './config';
import { WindowManager } from './window';
import { NotifyServer } from './server';
import { TrayManager } from './tray';
import { WindowsPlatformHandler } from './platform/win';
import { MacPlatformHandler } from './platform/mac';
import type { NotifyPayload } from '../types';

// Enforce single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log('[App] Another instance is already running. Quitting.');
  app.quit();
  process.exit(0);
}

let configManager: ConfigManager;
let windowManager: WindowManager;
let notifyServer: NotifyServer;
let trayManager: TrayManager;
let winHandler: WindowsPlatformHandler | undefined;
let macHandler: MacPlatformHandler | undefined;

async function bootstrap() {
  configManager = new ConfigManager();
  const config = configManager.getConfig();

  windowManager = new WindowManager(config);
  const win = windowManager.createWindow();

  // Platform branching
  if (process.platform === 'win32') {
    winHandler = new WindowsPlatformHandler(win, config.windowWidth, config.windowHeight);
  } else if (process.platform === 'darwin') {
    macHandler = new MacPlatformHandler(win, config);
  }

  windowManager.onBubbleDismissed = () => {
    if (macHandler) {
      macHandler.onNotificationComplete();
    }
  };

  windowManager.onWindowMoved = () => {
    if (macHandler) {
      macHandler.setCustomPosition();
    }
  };

  // Tray / Menu Bar setup
  trayManager = new TrayManager(configManager, win, winHandler, macHandler);

  // Initialize and start HTTP Notify Server
  notifyServer = new NotifyServer(config.port, config.token, {
    onNotify: (payload: NotifyPayload) => {
      if (!win.isDestroyed()) {
        win.webContents.send('mascot:notify', payload);
      }
      if (macHandler) {
        macHandler.handleNotification(payload);
      }
    },
    onToggleRaycast: () => {
      if (macHandler) {
        macHandler.repositionToBottom();
      }
    },
    onPlaySound: (clipOrEvent: string) => {
      if (!win.isDestroyed()) {
        win.webContents.send('mascot:play-sound', clipOrEvent);
      }
    },
  });

  try {
    await notifyServer.start();
  } catch (err: any) {
    console.error(`[App] Failed to start notify server on port ${config.port}:`, err.message);
  }

  app.on('second-instance', () => {
    if (macHandler) {
      macHandler.toggleMascot();
    } else if (win) {
      if (!win.isVisible()) win.show();
    }
  });
}

app.whenReady().then(bootstrap);

// Prevent app quitting when all windows are hidden (macOS menu bar app behavior)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  if (notifyServer) {
    await notifyServer.stop();
  }
  if (macHandler) {
    macHandler.destroy();
  }
  if (trayManager) {
    trayManager.destroy();
  }
  if (windowManager) {
    windowManager.destroy();
  }
});
