import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { MascotConfig } from '../types';

const CONFIG_FILE = 'chiikawa-config.json';

const DEFAULT_CONFIG: MascotConfig = {
  port: 7788,
  token: '',
  windowWidth: 320,
  windowHeight: 420,
  soundEnabled: true,
  macNotificationPosition: 'top-center',
};

export class ConfigManager {
  private configPath: string;
  public config: MascotConfig;

  constructor() {
    const userDataPath = app.getPath('userData');
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }
    this.configPath = path.join(userDataPath, CONFIG_FILE);

    // Backward compatibility: copy legacy token/config if fresh install under new name
    if (!fs.existsSync(this.configPath)) {
      try {
        const appData = app.getPath('appData');
        const legacyPath = path.join(appData, 'chiikawa-companion', CONFIG_FILE);
        if (fs.existsSync(legacyPath)) {
          fs.copyFileSync(legacyPath, this.configPath);
        }
      } catch {}
    }

    this.config = this.loadConfig();
  }

  public getConfig(): MascotConfig {
    return { ...this.config };
  }

  public getConfigPath(): string {
    return this.configPath;
  }

  public getUserDataPath(): string {
    return app.getPath('userData');
  }

  public updateConfig(partial: Partial<MascotConfig>): void {
    this.config = { ...this.config, ...partial };
    this.saveConfig();
  }

  private loadConfig(): MascotConfig {
    let cfg = { ...DEFAULT_CONFIG };

    if (fs.existsSync(this.configPath)) {
      try {
        const raw = fs.readFileSync(this.configPath, 'utf-8');
        const parsed = JSON.parse(raw);
        cfg = { ...cfg, ...parsed };
        // Ensure adequate height and width for speech bubble & buttons
        cfg.windowWidth = Math.max(cfg.windowWidth || 0, 320);
        cfg.windowHeight = Math.max(cfg.windowHeight || 0, 420);
      } catch (e) {
        console.warn('Failed to parse config file, creating fresh config:', e);
      }
    }

    // Ensure secure token exists
    if (!cfg.token || cfg.token.trim().length === 0) {
      cfg.token = crypto.randomBytes(24).toString('hex');
      try {
        fs.writeFileSync(this.configPath, JSON.stringify(cfg, null, 2), 'utf-8');
      } catch (err) {
        console.error('Failed to write initial config file:', err);
      }
    }

    return cfg;
  }

  private saveConfig(): void {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8');
      // Keep legacy path in sync for external scripts and MCP tools
      const appData = app.getPath('appData');
      const legacyDir = path.join(appData, 'chiikawa-companion');
      if (fs.existsSync(legacyDir)) {
        fs.writeFileSync(path.join(legacyDir, CONFIG_FILE), JSON.stringify(this.config, null, 2), 'utf-8');
      }
    } catch (err) {
      console.error('Failed to save config:', err);
    }
  }
}
