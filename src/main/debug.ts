import { BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

export const DEBUG = process.env.CHIIKAWA_DEBUG === '1';

const EVIDENCE_DIR = '/tmp/chiikawa-evidence';

export async function snapshot(win: BrowserWindow, name = 'snap'): Promise<{ file: string; size: { width: number; height: number } }> {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const img = await win.webContents.capturePage();
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const ts = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const file = path.join(EVIDENCE_DIR, `${name}_${ts}_${Date.now()}.png`);
  fs.writeFileSync(file, img.toPNG());
  const size = img.getSize();
  return { file, size };
}

export async function getState(win: BrowserWindow): Promise<any> {
  if (win.isDestroyed()) return { error: 'window destroyed' };
  return await win.webContents.executeJavaScript('window.__chiikawa ? window.__chiikawa.getState() : null');
}

export async function setBandaid(win: BrowserWindow, visible: boolean): Promise<any> {
  if (win.isDestroyed()) return { error: 'window destroyed' };
  return await win.webContents.executeJavaScript(`window.__chiikawa ? window.__chiikawa.setBandaidVisible(${visible}) : null`);
}

export async function click(win: BrowserWindow, x: number, y: number, count = 1): Promise<void> {
  for (let i = 1; i <= count; i++) {
    win.webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: i });
    win.webContents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: i });
    if (i < count) {
      await new Promise((r) => setTimeout(r, 45));
    }
  }
}

export async function calibrate(win: BrowserWindow, px: number, py: number): Promise<any> {
  if (win.isDestroyed()) return { error: 'window destroyed' };
  return await win.webContents.executeJavaScript(`window.__chiikawa ? window.__chiikawa.placeBandaidAtScreen(${px}, ${py}) : null`);
}
