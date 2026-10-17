export type MascotState = 'idle' | 'thinking' | 'success' | 'alert' | 'error';

export interface NotifyPayload {
  state: MascotState;
  message: string;
  source?: string;
  duration_ms?: number;
  sticky?: boolean;
  sound?: string;
  event?: string;
}

export interface CursorPosition {
  x: number;
  y: number;
}

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MascotConfig {
  port: number;
  token: string;
  windowWidth: number;
  windowHeight: number;
  soundEnabled: boolean;
  macNotificationPosition: 'top-center' | 'bottom-right';
}
