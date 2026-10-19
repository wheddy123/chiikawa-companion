// Chiikawa Voice Lines & Sound Design Manager
// Authentic Chiikawa Voice Suite (Aoki Haruka toddler acoustic profile) + Earshot UI SFX Suite

export interface VoiceClip {
  id: string;
  character: string;
  label: string;
  eventId: string;
  filename: string;
}

export const VOICE_CLIPS: VoiceClip[] = [
  // --- Authentic Chiikawa Core Vocalizations (Aoki Haruka Profile) ---
  { id: 'chiikawa_wah', character: 'Chiikawa', label: 'Wah (Toddler Babbling)', eventId: 'chiikawa_babble', filename: 'chiikawa_wah.mp3' },
  { id: 'chiikawa_fuwa', character: 'Chiikawa', label: 'Fuwa~ (Curious Wonder)', eventId: 'chiikawa_thinking', filename: 'chiikawa_fuwa.mp3' },
  { id: 'chiikawa_ya', character: 'Chiikawa', label: 'Ya! (Joyful Chirp)', eventId: 'chiikawa_success', filename: 'chiikawa_ya.mp3' },
  { id: 'chiikawa_haa', character: 'Chiikawa', label: 'Haa... (Gentle Relief)', eventId: 'chiikawa_sigh', filename: 'chiikawa_haa.mp3' },
  { id: 'chiikawa_puka', character: 'Chiikawa', label: 'Puka Puka (Contented Babble)', eventId: 'chiikawa_petting', filename: 'chiikawa_puka.mp3' },
  { id: 'chiikawa_iya', character: 'Chiikawa', label: 'Iya! (Struggle / Reject)', eventId: 'chiikawa_struggle', filename: 'chiikawa_iya.mp3' },
  { id: 'chiikawa_crying', character: 'Chiikawa', label: 'U-u-waa... (Cute Crying)', eventId: 'chiikawa_crying', filename: 'chiikawa_crying.mp3' },
  { id: 'nani_nani', character: 'Chiikawa', label: 'Nani nani?', eventId: 'question_prompt', filename: 'nani_nani.mp3' },

  // --- Earshot Procedural UI Sound Effects ---
  { id: 'ui_pop', character: 'UI', label: 'Bubble Pop', eventId: 'ui_pop', filename: 'ui_pop.wav' },
  { id: 'ui_hover', character: 'UI', label: 'Micro Button Hover', eventId: 'ui_hover', filename: 'ui_hover.wav' },
  { id: 'ui_complete', character: 'UI', label: 'Task Success Chime', eventId: 'ui_complete', filename: 'ui_complete.wav' },
  { id: 'sleep_gentle', character: 'UI', label: 'Lofi Bedtime Chime', eventId: 'sleep_chime', filename: 'sleep_gentle.wav' },

  // --- Secondary / Companion Soundboard Clips (Preserved for compatibility) ---
  { id: 'usagi_una', character: 'Usagi', label: 'Una', eventId: 'assistant_start', filename: 'usagi_una.mp3' },
  { id: 'usagi_yaha', character: 'Usagi', label: 'Yaha / Yahaaaa', eventId: 'task_complete', filename: 'usagi_yaha.mp3' },
  { id: 'usagi_una_na_yaha', character: 'Usagi', label: 'U-una-na-ya-ha', eventId: 'loading_or_busy', filename: 'usagi_una_na_yaha.mp3' },
  { id: 'usagi_huh', character: 'Usagi', label: 'Huh', eventId: 'unexpected_result', filename: 'usagi_huh.mp3' },
  { id: 'usagi_haaa', character: 'Usagi', label: 'Haaaa?!', eventId: 'attention_surprise', filename: 'usagi_haaa.mp3' },
  { id: 'usagi_wula', character: 'Usagi', label: 'Wula!', eventId: 'notification', filename: 'usagi_wula.mp3' },
  { id: 'hachiware_oi', character: 'Hachiware', label: 'Oi', eventId: 'need_attention', filename: 'hachiware_oi.mp3' },
  { id: 'momonga_silly', character: 'Momonga', label: 'Silly noise', eventId: 'idle_random', filename: 'momonga_silly.mp3' },
  { id: 'momonga_crying', character: 'Momonga', label: 'Crying', eventId: 'error_or_sad_state', filename: 'momonga_crying.mp3' },
  { id: 'una_yaha_curry', character: 'Usagi', label: 'Una yaha - curry', eventId: 'random_reaction', filename: 'una_yaha_curry.mp3' },
  { id: 'usagi_iyaha', character: 'Usagi', label: 'IYAHA', eventId: 'high_energy_reaction', filename: 'usagi_iyaha.mp3' },
  { id: 'usagi_ulaulaula', character: 'Usagi', label: 'Ulaulaula', eventId: 'random_reaction_2', filename: 'usagi_ulaulaula.mp3' },
  { id: 'usagi_pyjamas_party', character: 'Usagi', label: 'Pyjamas Party', eventId: 'special_notification', filename: 'usagi_pyjamas_party.mp3' },
  { id: 'usagi_yaha_alt', character: 'Usagi', label: 'Yaha (alt)', eventId: 'task_complete_alt', filename: 'usagi_yaha_alt.mp3' },
  { id: 'usagi_yaha_short', character: 'Usagi', label: 'Yaha (short)', eventId: 'quick_notification', filename: 'usagi_yaha_short.mp3' },
];

export class SoundManager {
  private enabled: boolean = true;
  private volume: number = 0.20;
  private audioCache: Map<string, HTMLAudioElement> = new Map();
  private lastPlayedTime: number = 0;
  private readonly MIN_INTERVAL_MS = 250; // prevent overlapping spam

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

    // 2. If not found, check if it matches a filename or clip id loosely
    if (!audio) {
      for (const [key, cachedAudio] of this.audioCache.entries()) {
        if (key.toLowerCase().includes(identifier.toLowerCase())) {
          audio = cachedAudio;
          break;
        }
      }
    }

    if (!audio) {
      console.warn(`[SoundManager] Clip not found for identifier: ${identifier}`);
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
   * Play appropriate authentic voice sound for a mascot state
   */
  public playForState(state: string, customSoundOrEvent?: string): void {
    if (customSoundOrEvent) {
      this.play(customSoundOrEvent);
      return;
    }

    switch (state) {
      case 'thinking':
        this.play('chiikawa_fuwa');
        break;
      case 'success':
        this.play('chiikawa_ya');
        break;
      case 'alert':
        this.play(Math.random() > 0.5 ? 'nani_nani' : 'chiikawa_wah');
        break;
      case 'error':
        this.play('chiikawa_crying');
        break;
      case 'struggle':
        this.play('chiikawa_iya');
        break;
      case 'idle':
        // No sound on normal idle transition
        break;
      default:
        this.play('chiikawa_wah');
        break;
    }
  }

  /**
   * Play authentic random Chiikawa toddler reaction sound (e.g. when poked/dragged/clicked)
   */
  public playRandomReaction(): void {
    const reactions = [
      'chiikawa_wah',
      'chiikawa_ya',
      'chiikawa_fuwa',
      'chiikawa_puka',
      'chiikawa_haa',
      'nani_nani',
    ];
    const pick = reactions[Math.floor(Math.random() * reactions.length)];
    this.play(pick);
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
