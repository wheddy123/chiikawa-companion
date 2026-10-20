import { ConfigManager } from './config';
import type { NotifyPayload, UserChoice } from '../types';

export interface SchedulerCallbacks {
  sendNotification: (payload: NotifyPayload) => void;
  playSound?: (clip: string) => void;
}

export class HealthScheduler {
  private configManager: ConfigManager;
  private callbacks: SchedulerCallbacks;

  private waterTimer: NodeJS.Timeout | null = null;
  private sleepCheckTimer: NodeJS.Timeout | null = null;
  private snoozeTimer: NodeJS.Timeout | null = null;

  private lastSleepTriggerDate: string = '';
  private sleepDismissedToday: boolean = false;

  constructor(configManager: ConfigManager, callbacks: SchedulerCallbacks) {
    this.configManager = configManager;
    this.callbacks = callbacks;
  }

  public start(): void {
    this.resetWaterTimer();
    this.startSleepCheck();
  }

  public stop(): void {
    if (this.waterTimer) clearInterval(this.waterTimer);
    if (this.sleepCheckTimer) clearInterval(this.sleepCheckTimer);
    if (this.snoozeTimer) clearTimeout(this.snoozeTimer);
    this.waterTimer = null;
    this.sleepCheckTimer = null;
    this.snoozeTimer = null;
  }

  // --- Water Reminder Logic ---
  public resetWaterTimer(): void {
    if (this.waterTimer) clearInterval(this.waterTimer);
    const intervalMin = this.configManager.config.waterIntervalMin || 45;
    const intervalMs = Math.max(1, intervalMin) * 60 * 1000;

    this.waterTimer = setInterval(() => {
      this.triggerWaterReminder();
    }, intervalMs);
  }

  public triggerWaterReminder(): void {
    console.log('[HealthScheduler] Triggering Water Reminder');
    this.callbacks.sendNotification({
      id: 'water_reminder_' + Date.now(),
      state: 'thinking',
      message: 'Uống nước đi sếp! 💧',
      options: [
        {
          id: 'water_drank',
          label: 'Đã uống 💧',
          style: 'primary',
          sound: 'ui_complete',
        },
      ],
      sound: 'ui_pop',
      duration_ms: 0, // sticky until acknowledged
      sticky: true,
      source: 'health_scheduler',
    });
  }

  // --- Sleep Reminder Logic ---
  private startSleepCheck(): void {
    if (this.sleepCheckTimer) clearInterval(this.sleepCheckTimer);

    // Check every 30 seconds
    this.sleepCheckTimer = setInterval(() => {
      this.checkSleepTime();
    }, 30000);

    this.checkSleepTime();
  }

  private checkSleepTime(): void {
    const target = this.configManager.config.sleepTargetTime || '22:30';
    const now = new Date();
    const currentHHmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const todayStr = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;

    // Reset daily dismiss at noon
    if (this.lastSleepTriggerDate !== todayStr && now.getHours() >= 12) {
      this.sleepDismissedToday = false;
    }

    if (currentHHmm === target && this.lastSleepTriggerDate !== todayStr && !this.sleepDismissedToday) {
      this.lastSleepTriggerDate = todayStr;
      this.triggerSleepAlert();
    }
  }

  public triggerSleepAlert(): void {
    console.log('[HealthScheduler] Triggering Sleep Alert');
    this.callbacks.sendNotification({
      id: 'sleep_alert_' + Date.now(),
      state: 'alert',
      message: 'Đến giờ đi ngủ rồi sếp ơi! 🌙',
      options: [
        { id: 'sleep_now', label: 'Đi ngủ luôn 🛌', style: 'primary' },
        { id: 'snooze_5m', label: 'Cố thêm 5 phút ⏰', style: 'secondary' },
      ],
      sound: 'sleep_gentle',
      sticky: true,
      source: 'health_scheduler',
    });
  }

  // --- Choice Interception (Snooze State Machine) ---
  public handleChoice(choice: UserChoice): boolean {
    if (!choice || !choice.id) return false;

    if (choice.id === 'water_drank') {
      console.log('[HealthScheduler] User drank water, resetting timer');
      this.resetWaterTimer();
      return true;
    }

    if (choice.id === 'snooze_5m') {
      console.log('[HealthScheduler] Sleep snoozed for 5 minutes (300,000ms)');
      if (this.snoozeTimer) clearTimeout(this.snoozeTimer);
      // Exactly 5 minutes (300,000 ms)
      this.snoozeTimer = setTimeout(() => {
        console.log('[HealthScheduler] 5m Snooze expired, firing sleep alert again');
        this.triggerSleepAlert();
      }, 5 * 60 * 1000);
      return true;
    }

    if (choice.id === 'sleep_now') {
      console.log('[HealthScheduler] User chosen to sleep now. Suspending alerts until tomorrow.');
      if (this.snoozeTimer) clearTimeout(this.snoozeTimer);
      this.snoozeTimer = null;
      this.sleepDismissedToday = true;

      // Friendly good night message
      setTimeout(() => {
        this.callbacks.sendNotification({
          state: 'success',
          message: 'Chúc sếp ngủ thật ngon nha! ✨🐾',
          sound: 'ui_complete',
          duration_ms: 4000,
          source: 'health_scheduler',
        });
      }, 800);
      return true;
    }

    return false;
  }
}
