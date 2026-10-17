// Chiikawa Voice Lines Manager
// Starter Pack with 16 authentic community soundboard audio clips

export interface VoiceClip {
  id: string;
  character: string;
  label: string;
  eventId: string;
  filename: string;
}

export const VOICE_CLIPS: VoiceClip[] = [
  { id: 'usagi_una', character: 'Usagi', label: 'Una', eventId: 'assistant_start', filename: 'usagi_una.mp3' },
  { id: 'usagi_yaha', character: 'Usagi', label: 'Yaha / Yahaaaa', eventId: 'task_complete', filename: 'usagi_yaha.mp3' },
  { id: 'usagi_una_na_yaha', character: 'Usagi', label: 'U-una-na-ya-ha', eventId: 'loading_or_busy', filename: 'usagi_una_na_yaha.mp3' },
  { id: 'usagi_huh', character: 'Usagi', label: 'Huh', eventId: 'unexpected_result', filename: 'usagi_huh.mp3' },
  { id: 'usagi_haaa', character: 'Usagi', label: 'Haaaa?!', eventId: 'attention_surprise', filename: 'usagi_haaa.mp3' },
  { id: 'usagi_wula', character: 'Usagi', label: 'Wula!', eventId: 'notification', filename: 'usagi_wula.mp3' },
  { id: 'hachiware_oi', character: 'Hachiware', label: 'Oi', eventId: 'need_attention', filename: 'hachiware_oi.mp3' },
  { id: 'momonga_silly', character: 'Momonga', label: 'Silly noise', eventId: 'idle_random', filename: 'momonga_silly.mp3' },
  { id: 'momonga_crying', character: 'Momonga', label: 'Crying', eventId: 'error_or_sad_state', filename: 'momonga_crying.mp3' },
  { id: 'nani_nani', character: 'Chiikawa', label: 'Nani nani?', eventId: 'question_prompt', filename: 'nani_nani.mp3' },
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
  private readonly MIN_INTERVAL_MS = 300; // prevent overlapping spam

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
      const clip = VOICE_CLIPS.find(
        (c) => c.id === identifier || c.eventId === identifier || c.filename === identifier
      );
      if (clip) {
        audio = this.audioCache.get(clip.id);
      }
    }

    // 3. Fallback: try loading directly
    if (!audio) {
      try {
        const filename = identifier.endsWith('.mp3') ? identifier : `${identifier}.mp3`;
        audio = new Audio(`./sounds/${filename}`);
        audio.volume = this.volume;
        this.audioCache.set(identifier, audio);
      } catch (e) {
        console.warn('[SoundManager] Failed to create audio for', identifier, e);
        return;
      }
    }

    try {
      audio.currentTime = 0;
      audio.volume = this.volume;
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          // In some browsers autoplay may be suppressed before user gesture
          console.debug('[SoundManager] Playback blocked or interrupted:', err);
        });
      }
    } catch (err) {
      console.warn('[SoundManager] Error playing sound:', identifier, err);
    }
  }

  /**
   * Play appropriate sound for a mascot state
   */
  public playForState(state: string, customSoundOrEvent?: string): void {
    if (customSoundOrEvent) {
      this.play(customSoundOrEvent);
      return;
    }

    switch (state) {
      case 'thinking':
        this.play('loading_or_busy'); // usagi_una_na_yaha
        break;
      case 'success':
        // Alternate between yaha and yaha_alt
        this.play(Math.random() > 0.4 ? 'task_complete' : 'task_complete_alt'); // usagi_yaha
        break;
      case 'alert':
        this.play(Math.random() > 0.5 ? 'need_attention' : 'attention_surprise'); // hachiware_oi or usagi_haaa
        break;
      case 'error':
        this.play('error_or_sad_state'); // momonga_crying
        break;
      case 'idle':
        // do not play sound on normal idle transitions
        break;
      default:
        this.play('notification'); // usagi_wula
        break;
    }
  }

  /**
   * Play random reaction sound (e.g. when poked/dragged/clicked)
   */
  public playRandomReaction(): void {
    const reactions = [
      'una_yaha_curry',
      'usagi_iyaha',
      'usagi_ulaulaula',
      'momonga_silly',
      'usagi_una',
      'usagi_wula',
    ];
    const pick = reactions[Math.floor(Math.random() * reactions.length)];
    this.play(pick);
  }
}
