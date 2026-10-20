// Chiikawa Sound Design Manager
// Pure Earshot Procedural SFX Suite (Subtle, normalized, non-fatiguing UI sounds)

export interface VoiceClip {
  id: string;
  character: string;
  label: string;
  eventId: string;
  filename: string;
}

export const VOICE_CLIPS: VoiceClip[] = [
  // --- Earshot Procedural UI Sound Effects ---
  { id: 'ui_pop', character: 'UI', label: 'Bubble Pop', eventId: 'ui_pop', filename: 'ui_pop.wav' },
  { id: 'ui_hover', character: 'UI', label: 'Micro Button Hover', eventId: 'ui_hover', filename: 'ui_hover.wav' },
  { id: 'ui_complete', character: 'UI', label: 'Task Success Chime', eventId: 'ui_complete', filename: 'ui_complete.wav' },
  { id: 'sleep_gentle', character: 'UI', label: 'Lofi Bedtime Chime', eventId: 'sleep_chime', filename: 'sleep_gentle.wav' },
];

export class SoundManager {
  private enabled: boolean = true;
  private volume: number = 0.20;
  private audioCache: Map<string, HTMLAudioElement> = new Map();
  private lastPlayedTime: number = 0;
  private readonly MIN_INTERVAL_MS = 150; // prevent overlapping spam

  constructor(enabled: boolean = true, volume: number = 0.20) {
    this.enabled = enabled;
    this.volume = volume;
    this.preloadClips();
  }

  public stopAll(): void {
    this.audioCache.forEach((audio) => {
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch (err) {
        // ignore
      }
    });
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.stopAll();
    }
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    this.audioCache.forEach((audio) => {
      audio.volume = this.volume;
    });
  }

  private preloadClips(): void {
    for (const clip of VOICE_CLIPS) {
      try {
        const audio = new Audio(`./sounds/${clip.filename}`);
        audio.preload = 'auto';
        audio.volume = this.volume;
        this.audioCache.set(clip.id, audio);
        this.audioCache.set(clip.eventId, audio);
      } catch (err) {
        console.warn(`[SoundManager] Could not preload ${clip.filename}:`, err);
      }
    }
  }

  public play(identifier: string): void {
    if (!this.enabled) return;

    const now = Date.now();
    if (now - this.lastPlayedTime < this.MIN_INTERVAL_MS) {
      return;
    }
    this.lastPlayedTime = now;

    // 1. Check direct cache by clip.id or clip.eventId
    let audio = this.audioCache.get(identifier);

    // 2. Map legacy voice identifiers gracefully to Earshot sounds
    if (!audio) {
      const lower = identifier.toLowerCase();
      if (lower.includes('complete') || lower.includes('success') || lower.includes('yaha')) {
        audio = this.audioCache.get('ui_complete');
      } else if (lower.includes('sleep') || lower.includes('bedtime')) {
        audio = this.audioCache.get('sleep_gentle');
      } else if (lower.includes('hover') || lower.includes('think')) {
        audio = this.audioCache.get('ui_hover');
      } else {
        // Default gentle fallback is ui_pop
        audio = this.audioCache.get('ui_pop');
      }
    }

    if (!audio) {
      return;
    }

    try {
      audio.currentTime = 0;
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((error) => {
          console.warn(`[SoundManager] Autoplay prevented or error playing ${identifier}:`, error);
        });
      }
    } catch (err) {
      console.warn('[SoundManager] Error playing sound:', identifier, err);
    }
  }

  /**
   * Play appropriate Earshot sound for mascot state
   */
  public playForState(state: string, customSoundOrEvent?: string): void {
    if (customSoundOrEvent) {
      this.play(customSoundOrEvent);
      return;
    }

    switch (state) {
      case 'thinking':
        this.playUiHover();
        break;
      case 'success':
        this.play('ui_complete');
        break;
      case 'alert':
      case 'error':
      case 'struggle':
        this.playUiPop();
        break;
      case 'idle':
        // No sound on normal idle transition
        break;
      default:
        this.playUiPop();
        break;
    }
  }

  /**
   * Play subtle reaction sound (e.g. when poked/dragged/clicked)
   */
  public playRandomReaction(): void {
    this.playUiPop();
  }

  public playUiPop(): void {
    this.play('ui_pop');
  }

  public playUiHover(): void {
    this.play('ui_hover');
  }

  public playSleepChime(): void {
    this.play('sleep_gentle');
  }
}
