import os from 'os';
import type { SystemTelemetry } from '../types';

export class TelemetryManager {
  private prevCpus: os.CpuInfo[] = [];
  private timer: NodeJS.Timeout | null = null;
  private onTelemetryCallback: (data: SystemTelemetry) => void;
  private latestTelemetry: SystemTelemetry = {
    cpuUsagePercent: 0,
    memUsagePercent: 0,
    loadAvg: [0, 0, 0],
    cores: os.cpus().length,
  };

  constructor(onTelemetry: (data: SystemTelemetry) => void) {
    this.onTelemetryCallback = onTelemetry;
    this.prevCpus = os.cpus();
  }

  public start(intervalMs: number = 2000): void {
    if (this.timer) return;

    this.timer = setInterval(() => {
      this.sample();
    }, intervalMs);
    // Initial sample
    this.sample();
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public getLatest(): SystemTelemetry {
    return this.latestTelemetry;
  }

  private sample(): void {
    try {
      const currentCpus = os.cpus();
      let totalDiff = 0;
      let idleDiff = 0;

      for (let i = 0; i < currentCpus.length; i++) {
        const curTimes = currentCpus[i].times;
        const prevTimes = this.prevCpus[i]?.times || curTimes;

        const curTotal = curTimes.user + curTimes.nice + curTimes.sys + curTimes.idle + curTimes.irq;
        const prevTotal = prevTimes.user + prevTimes.nice + prevTimes.sys + prevTimes.idle + prevTimes.irq;

        totalDiff += Math.max(0, curTotal - prevTotal);
        idleDiff += Math.max(0, curTimes.idle - prevTimes.idle);
      }

      this.prevCpus = currentCpus;

      const busyDiff = Math.max(0, totalDiff - idleDiff);
      const cpuUsagePercent = totalDiff > 0 ? Math.min(100, Math.round((busyDiff / totalDiff) * 100)) : 0;

      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const memUsagePercent = Math.min(100, Math.round(((totalMem - freeMem) / totalMem) * 100));

      const loadAvg = os.loadavg();

      this.latestTelemetry = {
        cpuUsagePercent,
        memUsagePercent,
        loadAvg,
        cores: currentCpus.length,
      };

      this.onTelemetryCallback(this.latestTelemetry);
    } catch (e) {
      // Ignore transient sampling errors
    }
  }
}
