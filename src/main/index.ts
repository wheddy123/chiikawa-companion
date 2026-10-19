import { app, BrowserWindow } from 'electron';
import { ConfigManager } from './config';
import { WindowManager } from './window';
import { NotifyServer } from './server';
import { TrayManager } from './tray';
import { WindowsPlatformHandler } from './platform/win';
import { MacPlatformHandler } from './platform/mac';
import { TelemetryManager } from './telemetry';
import { HealthScheduler } from './scheduler';
import { MediaManager } from './media';
import type { NotifyPayload, UserChoice } from '../types';

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
let telemetryManager: TelemetryManager;
let trayManager: TrayManager;
let healthScheduler: HealthScheduler;
let mediaManager: MediaManager;
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

  windowManager.onSoundToggled = (enabled: boolean) => {
    configManager.updateConfig({ soundEnabled: enabled });
    trayManager?.updateContextMenu();
  };

  // Tray / Menu Bar setup
  trayManager = new TrayManager(configManager, win, winHandler, macHandler);

  // Initialize Telemetry Manager for Living Mascot
  telemetryManager = new TelemetryManager((telemetry) => {
    if (!win.isDestroyed()) {
      win.webContents.send('mascot:telemetry', telemetry);
    }
  });
  telemetryManager.start(2000);

  // Initialize Health Scheduler
  healthScheduler = new HealthScheduler(configManager, {
    sendNotification: (payload: NotifyPayload) => {
      if (!win.isDestroyed()) {
        win.webContents.send('mascot:notify', payload);
      }
      if (macHandler) {
        macHandler.handleNotification(payload);
      }
    },
    playSound: (clip: string) => {
      if (!win.isDestroyed()) {
        win.webContents.send('mascot:play-sound', clip);
      }
    },
  });
  healthScheduler.start();

  // Initialize Native Media Manager (Now Playing stream & controls)
  mediaManager = new MediaManager({
    onRaycastVisible: () => {
      if (macHandler) {
        macHandler.repositionToBottom();
      }
    },
    getBrowserWindow: () => win,
  });
  if (config.mediaEnabled !== false) {
    mediaManager.start();
  }

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
    onChoice: (choice: UserChoice) => {
      healthScheduler?.handleChoice(choice);
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
    onToggleSound: () => {
      configManager.updateConfig({ soundEnabled: !configManager.config.soundEnabled });
      if (!win.isDestroyed()) {
        win.webContents.send('mascot:sound-enabled', configManager.config.soundEnabled);
      }
      trayManager?.updateContextMenu();
    },
    getTelemetry: () => telemetryManager.getLatest(),
    getBrowserWindow: () => win,
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
  if (healthScheduler) {
    healthScheduler.stop();
  }
  if (mediaManager) {
    mediaManager.destroy();
  }
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
