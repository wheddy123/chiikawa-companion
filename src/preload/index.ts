import { contextBridge, ipcRenderer } from 'electron';
import type { NotifyPayload, CursorPosition, WindowBounds, SystemTelemetry, MediaState } from '../types';

export interface ElectronAPI {
  onNotify: (callback: (payload: NotifyPayload) => void) => () => void;
  onCursor: (callback: (pos: CursorPosition, winBounds: WindowBounds) => void) => () => void;
  onTelemetry: (callback: (data: SystemTelemetry) => void) => () => void;
  onVisibility: (callback: (visible: boolean) => void) => () => void;
  onSoundEnabled: (callback: (enabled: boolean) => void) => () => void;
  onPlaySound: (callback: (clipOrEvent: string) => void) => () => void;
  onMediaState: (callback: (state: MediaState) => void) => () => void;
  sendMediaCommand: (cmd: 'play_pause' | 'next' | 'prev') => void;
  toggleSound: () => void;
  setSoundEnabled: (enabled: boolean) => void;
  setIgnoreMouseEvents: (ignore: boolean, forward?: boolean) => void;
  moveWindowBy: (dx: number, dy: number) => void;
  moveWindowTo: (x: number, y: number) => void;
  focusWindow: () => void;
  blurWindow: () => void;
  notifyDismissed: () => void;
  rendererReady: () => void;
  isDebug: boolean;
}

const api: ElectronAPI = {
  isDebug: process.env.CHIIKAWA_DEBUG === '1',
  onNotify: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: NotifyPayload) => callback(payload);
    ipcRenderer.on('mascot:notify', handler);
    return () => ipcRenderer.removeListener('mascot:notify', handler);
  },
  onCursor: (callback) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      pos: CursorPosition,
      winBounds: WindowBounds
    ) => callback(pos, winBounds);
    ipcRenderer.on('mascot:cursor', handler);
    return () => ipcRenderer.removeListener('mascot:cursor', handler);
  },
  onTelemetry: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, data: SystemTelemetry) => callback(data);
    ipcRenderer.on('mascot:telemetry', handler);
    return () => ipcRenderer.removeListener('mascot:telemetry', handler);
  },
  onVisibility: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, visible: boolean) => callback(visible);
    ipcRenderer.on('mascot:visibility', handler);
    return () => ipcRenderer.removeListener('mascot:visibility', handler);
  },
  onSoundEnabled: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, enabled: boolean) => callback(enabled);
    ipcRenderer.on('mascot:sound-enabled', handler);
    return () => ipcRenderer.removeListener('mascot:sound-enabled', handler);
  },
  onPlaySound: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, clipOrEvent: string) => callback(clipOrEvent);
    ipcRenderer.on('mascot:play-sound', handler);
    return () => ipcRenderer.removeListener('mascot:play-sound', handler);
  },
  onMediaState: (callback) => {
    const handler = (_event: Electron.IpcRendererEvent, state: MediaState) => callback(state);
    ipcRenderer.on('mascot:media-state', handler);
    return () => ipcRenderer.removeListener('mascot:media-state', handler);
  },
  sendMediaCommand: (cmd) => {
    ipcRenderer.send('media:command', cmd);
  },
  toggleSound: () => {
    ipcRenderer.send('mascot:toggle-sound');
  },
  setSoundEnabled: (enabled: boolean) => {
    ipcRenderer.send('mascot:set-sound-enabled', enabled);
  },
  setIgnoreMouseEvents: (ignore: boolean, forward: boolean = true) => {
    ipcRenderer.send('window:set-ignore-mouse-events', ignore, forward);
  },
  moveWindowBy: (dx: number, dy: number) => {
    ipcRenderer.send('window:move-by', dx, dy);
  },
  moveWindowTo: (x: number, y: number) => {
    ipcRenderer.send('window:move-to', x, y);
  },
  focusWindow: () => {
    ipcRenderer.send('window:focus');
  },
  blurWindow: () => {
    ipcRenderer.send('window:blur');
  },
  notifyDismissed: () => {
    ipcRenderer.send('mascot:bubble-dismissed');
  },
  rendererReady: () => {
    ipcRenderer.send('renderer:ready');
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);
