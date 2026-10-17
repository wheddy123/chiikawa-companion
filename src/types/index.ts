export type MascotState = 'idle' | 'thinking' | 'success' | 'alert' | 'error';

export interface NotifyOption {
  id?: string;
  label: string;
  style?: 'primary' | 'danger' | 'secondary' | 'neutral';
  sound?: string;
}

export interface NotifyPayload {
  id?: string;
  state: MascotState;
  message?: string;
  source?: string;
  duration_ms?: number;
  sticky?: boolean;
  sound?: string;
  event?: string;
  options?: Array<string | NotifyOption>;
  interactive?: boolean;
  choices?: string[];
}

export interface UserChoice {
  id: string;
  label: string;
  questionId?: string;
  source?: string;
  timestamp: number;
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

export interface SystemTelemetry {
  cpuUsagePercent: number; // 0 to 100
  memUsagePercent: number; // 0 to 100
  loadAvg: number[];
  cores: number;
}

