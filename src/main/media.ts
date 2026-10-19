import { app, BrowserWindow, ipcMain } from 'electron';
import { spawn, ChildProcess, exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import type { MediaState } from '../types';

export interface MediaManagerCallbacks {
  onRaycastVisible?: (visible: boolean, bounds?: any) => void;
  getBrowserWindow?: () => BrowserWindow | null;
}

export class MediaManager {
  private helperProcess: ChildProcess | null = null;
  private callbacks: MediaManagerCallbacks;
  private currentState: MediaState = {
    isPlaying: false,
    title: '',
    artist: '',
  };
  private isDestroyed = false;

  constructor(callbacks: MediaManagerCallbacks) {
    this.callbacks = callbacks;
    this.setupIpc();
  }

  public start(): void {
    if (process.platform !== 'darwin') {
      console.log('[MediaManager] Non-macOS platform, native media remote disabled.');
      return;
    }

    const helperPath = this.resolveHelperPath();
    if (!helperPath || !fs.existsSync(helperPath)) {
      console.warn('[MediaManager] Native helper not found at:', helperPath);
      return;
    }

    try {
      console.log('[MediaManager] Spawning native helper:', helperPath);
      this.helperProcess = spawn(helperPath, [], {
        stdio: ['pipe', 'pipe', 'ignore'],
      });

      let buffer = '';
      this.helperProcess.stdout?.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf-8');
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          this.handleHelperLine(trimmed);
        }
      });

      this.helperProcess.on('error', (err) => {
        console.warn('[MediaManager] Helper process error:', err.message);
      });

      this.helperProcess.on('exit', (code, signal) => {
        if (!this.isDestroyed) {
          console.log(`[MediaManager] Helper exited with code ${code}, signal ${signal}. Respawning in 3s...`);
          setTimeout(() => {
            if (!this.isDestroyed) this.start();
          }, 3000);
        }
      });
    } catch (e: any) {
      console.error('[MediaManager] Failed to start native helper:', e.message);
    }
  }

  private resolveHelperPath(): string | null {
    const candidates = [
      path.join(app.getAppPath(), 'dist/main/platform/desktop-helper'),
      path.join(app.getAppPath(), 'dist/main/platform/raycast-watcher'),
      path.join(process.resourcesPath || '', 'raycast-watcher'),
      path.join(__dirname, 'platform/desktop-helper'),
      path.join(__dirname, 'platform/raycast-watcher'),
    ];

    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
    return null;
  }

  private handleHelperLine(line: string): void {
    try {
      const data = JSON.parse(line);
      if (data.type === 'media') {
        const newState: MediaState = {
          isPlaying: Boolean(data.isPlaying),
          title: String(data.title || ''),
          artist: String(data.artist || ''),
        };

        this.currentState = newState;
        this.broadcastMediaState(newState);
      } else if (data.type === 'raycast' || typeof data.visible === 'boolean') {
        if (this.callbacks.onRaycastVisible) {
          this.callbacks.onRaycastVisible(data.visible, data);
        }
      }
    } catch (e) {
      // Non-json output or parse error
    }
  }

  public broadcastMediaState(state: MediaState): void {
    const win = this.callbacks.getBrowserWindow?.();
    if (win && !win.isDestroyed()) {
      win.webContents.send('mascot:media-state', state);
    }
  }

  public getCurrentState(): MediaState {
    return { ...this.currentState };
  }

  public sendCommand(cmd: 'play_pause' | 'next' | 'prev' | 'play' | 'pause'): void {
    console.log('[MediaManager] Executing media command:', cmd);

    // 1. Send via stdin to native Swift helper if running
    if (this.helperProcess && this.helperProcess.stdin && !this.helperProcess.stdin.destroyed) {
      try {
        this.helperProcess.stdin.write(cmd + '\n');
      } catch (err) {
        console.warn('[MediaManager] Failed to write to helper stdin:', err);
      }
    }

    // Command is handled cleanly and natively by desktop-helper via stdin
  }

  private setupIpc(): void {
    ipcMain.on('media:command', (_event, cmd: 'play_pause' | 'next' | 'prev') => {
      this.sendCommand(cmd);
    });

    ipcMain.handle('media:get-state', () => {
      return this.getCurrentState();
    });
  }

  public destroy(): void {
    this.isDestroyed = true;
    if (this.helperProcess) {
      try {
        this.helperProcess.kill('SIGTERM');
      } catch {}
      this.helperProcess = null;
    }
  }
}
