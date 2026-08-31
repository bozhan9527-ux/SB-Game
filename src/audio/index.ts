/**
 * 音效與配樂。
 *
 * 沒有任何音檔：全部用 WebAudio 即時合成（見 synth.ts）。好處是零下載體積、
 * 可以隨境界改變音高，缺點是音色偏簡樸——這個題材反而合適。
 *
 * 瀏覽器規定 AudioContext 必須在使用者操作之後才能出聲，因此第一次點擊／按鍵前
 * 整個模組都是靜默的，unlock() 由 main.ts 掛的一次性事件觸發。
 */
import {
  BARS_PER_PHRASE,
  BASS_BEATS,
  BEATS_PER_BAR,
  DRUM_BEATS,
  MELODY_CEILING,
  PENTATONIC,
  SPARKLE_CEILING,
  barForRealm,
  noteFrequency,
  octaveShift,
  phraseForRealm,
  rootForRealm,
  scaleNote,
} from './notes';
import { renderGong, renderNoise, renderPluck, renderThud } from './synth';

export type SfxName =
  | 'ui'
  | 'swipe'
  | 'gateGood'
  | 'gateTrap'
  | 'gold'
  | 'mob'
  | 'hit'
  | 'bossHit'
  | 'bossAttack'
  | 'bossRoar'
  | 'victory'
  | 'defeat'
  | 'breakthrough';

const MASTER_GAIN = 0.9;
const MUSIC_GAIN = 0.22;
const SFX_GAIN = 0.5;
/**
 * 每拍秒數。
 *
 * 原本是 0.42（約 70 BPM 的從容感），但這個遊戲的節奏是「一直在動手」——
 * 配樂比玩家慢，整體就顯得沉。0.30 大約 100 BPM，跟得上手上的動作。
 */
const BEAT_SECONDS = 0.3;

type AudioContextCtor = new () => AudioContext;

function resolveAudioContext(): AudioContextCtor | null {
  if (typeof globalThis === 'undefined') return null;
  const scope = globalThis as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return scope.AudioContext ?? scope.webkitAudioContext ?? null;
}

function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0, value));
}

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private readonly cache = new Map<string, AudioBuffer>();

  private musicRealm: number | null = null;
  private musicTimer: ReturnType<typeof setTimeout> | null = null;
  private nextBarTime = 0;
  /** 目前排到整段四小節裡的第幾節。 */
  private musicBar = 0;
  private enabled = true;
  /**
   * 兩軌各自的音量（0～1）。
   *
   * 和總開關是兩層，實際增益 = 總開關 × 該軌音量。分開的理由寫在
   * SettingsState：會膩的是配樂，不是音效，只給一個開關會讓玩家為了關掉
   * 其中一個而連另一個一起關掉。
   */
  private sfxVolume = 1;
  private musicVolume = 1;

  /** 使用者是否開著音效。關閉時不只靜音，也停掉配樂排程。 */
  get soundEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(value: boolean): void {
    this.enabled = value;
    if (this.master !== null) this.master.gain.value = value ? MASTER_GAIN : 0;
    if (!value) this.stopMusic();
  }

  setSfxVolume(value: number): void {
    this.sfxVolume = clampVolume(value);
    if (this.sfxBus !== null) this.sfxBus.gain.value = SFX_GAIN * this.sfxVolume;
  }

  /**
   * 配樂音量。歸零時停掉排程而不只是靜音——排程會一直往前算拍點，
   * 靜音只是聽不見，機器仍在做完全沒有用的工作。
   */
  setMusicVolume(value: number): void {
    this.musicVolume = clampVolume(value);
    if (this.musicBus !== null) this.musicBus.gain.value = MUSIC_GAIN * this.musicVolume;
    if (this.musicVolume <= 0) this.stopMusic();
  }

  /** 一次套用存檔裡的三個設定。開場與改設定都走這裡，不必記得呼叫三次。 */
  applySettings(settings: { sound: boolean; sfxVolume: number; musicVolume: number }): void {
    this.setSfxVolume(settings.sfxVolume);
    this.setMusicVolume(settings.musicVolume);
    this.setEnabled(settings.sound);
  }

  /** 必須在使用者手勢中呼叫，否則瀏覽器不給發聲。重複呼叫安全。 */
  unlock(): void {
    if (this.ctx !== null) {
      void this.ctx.resume();
      return;
    }
    const Ctor = resolveAudioContext();
    if (Ctor === null) return;

    try {
      const ctx = new Ctor();
      const master = ctx.createGain();
      master.gain.value = this.enabled ? MASTER_GAIN : 0;
      master.connect(ctx.destination);

      const music = ctx.createGain();
      music.gain.value = MUSIC_GAIN * this.musicVolume;
      music.connect(master);

      const sfx = ctx.createGain();
      sfx.gain.value = SFX_GAIN * this.sfxVolume;
      sfx.connect(master);

      this.ctx = ctx;
      this.master = master;
      this.musicBus = music;
      this.sfxBus = sfx;
      void ctx.resume();
    } catch {
      // 沒有音訊裝置時就安靜跑，不影響遊戲。
      this.ctx = null;
    }
  }

  private buffer(key: string, make: (ctx: AudioContext) => AudioBuffer): AudioBuffer | null {
    const ctx = this.ctx;
    if (ctx === null) return null;
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;
    const created = make(ctx);
    this.cache.set(key, created);
    return created;
  }

  private emit(
    buffer: AudioBuffer | null,
    bus: GainNode | null,
    options: { gain?: number; when?: number; rate?: number; filter?: { from: number; to: number } } = {},
  ): void {
    const ctx = this.ctx;
    if (ctx === null || buffer === null || bus === null || !this.enabled) return;

    const when = options.when ?? ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = options.rate ?? 1;

    const gain = ctx.createGain();
    gain.gain.value = options.gain ?? 1;

    if (options.filter !== undefined) {
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = 1.2;
      filter.frequency.setValueAtTime(options.filter.from, when);
      filter.frequency.exponentialRampToValueAtTime(options.filter.to, when + buffer.duration);
      source.connect(filter);
      filter.connect(gain);
    } else {
      source.connect(gain);
    }

    gain.connect(bus);
    source.start(when);
  }

  play(name: SfxName): void {
    const ctx = this.ctx;
    if (ctx === null || !this.enabled) return;
    const now = ctx.currentTime;

    switch (name) {
      case 'ui':
        this.emit(this.buffer('pluck-ui', (c) => renderPluck(c, noteFrequency(7), 0.35, 0.8)), this.sfxBus, { gain: 0.35 });
        break;
      case 'swipe':
        this.emit(this.buffer('noise-swipe', (c) => renderNoise(c, 0.22, 2.5)), this.sfxBus, {
          gain: 0.28,
          filter: { from: 500, to: 3400 },
        });
        break;
      case 'gateGood':
        // 兩個音往上，聽起來像「拿到東西」。
        this.emit(this.buffer('pluck-g1', (c) => renderPluck(c, noteFrequency(scaleNote(-5, 2)), 0.7)), this.sfxBus, { gain: 0.5 });
        this.emit(this.buffer('pluck-g2', (c) => renderPluck(c, noteFrequency(scaleNote(-5, 4)), 0.8)), this.sfxBus, {
          gain: 0.42,
          when: now + 0.09,
        });
        break;
      case 'gateTrap':
        this.emit(this.buffer('thud-trap', (c) => renderThud(c, 180, 55, 0.45)), this.sfxBus, { gain: 0.6 });
        this.emit(this.buffer('noise-trap', (c) => renderNoise(c, 0.3, 1.6)), this.sfxBus, {
          gain: 0.25,
          filter: { from: 1800, to: 300 },
        });
        break;
      case 'gold':
        this.emit(this.buffer('pluck-gold', (c) => renderPluck(c, noteFrequency(19), 0.6, 0.9)), this.sfxBus, { gain: 0.4 });
        this.emit(this.buffer('pluck-gold2', (c) => renderPluck(c, noteFrequency(24), 0.5, 0.9)), this.sfxBus, {
          gain: 0.3,
          when: now + 0.07,
        });
        break;
      case 'mob':
        this.emit(this.buffer('noise-mob', (c) => renderNoise(c, 0.5, 1.1)), this.sfxBus, {
          gain: 0.42,
          filter: { from: 2600, to: 420 },
        });
        this.emit(this.buffer('thud-mob', (c) => renderThud(c, 140, 48, 0.4)), this.sfxBus, { gain: 0.45 });
        break;
      // 一般命中。這個聲音一秒會響好幾次，所以刻意做得又短又輕——
      // 它的作用是「有打到」的觸感，不是提示，音量一大就變成噪音。
      case 'hit':
        this.emit(this.buffer('noise-hit-lite', (c) => renderNoise(c, 0.07, 5)), this.sfxBus, {
          gain: 0.16,
          filter: { from: 2800, to: 1200 },
        });
        break;
      // 首領登場：低頻長鳴壓在鑼聲底下，比單獨一聲鑼更像「有東西來了」。
      case 'bossRoar':
        this.emit(this.buffer('gong-roar', (c) => renderGong(c, 62, 2.6)), this.sfxBus, { gain: 0.8 });
        this.emit(this.buffer('thud-roar', (c) => renderThud(c, 90, 26, 1.5)), this.sfxBus, {
          gain: 0.8,
          when: now + 0.06,
        });
        this.emit(this.buffer('noise-roar', (c) => renderNoise(c, 1.1, 0.8)), this.sfxBus, {
          gain: 0.26,
          filter: { from: 900, to: 180 },
          when: now + 0.04,
        });
        break;
      case 'bossHit':
        this.emit(this.buffer('noise-hit', (c) => renderNoise(c, 0.16, 3)), this.sfxBus, {
          gain: 0.22,
          filter: { from: 3200, to: 900 },
          rate: 0.9 + Math.random() * 0.25,
        });
        break;
      case 'bossAttack':
        this.emit(this.buffer('thud-boss', (c) => renderThud(c, 120, 38, 0.6)), this.sfxBus, { gain: 0.75 });
        break;
      case 'victory':
        this.emit(this.buffer('gong-win', (c) => renderGong(c, 150, 3.2)), this.sfxBus, { gain: 0.7 });
        for (let i = 0; i < 5; i += 1) {
          this.emit(
            this.buffer(`pluck-win-${i}`, (c) => renderPluck(c, noteFrequency(scaleNote(-5, i + 2)), 1.1)),
            this.sfxBus,
            { gain: 0.4, when: now + 0.16 + i * 0.13 },
          );
        }
        break;
      case 'defeat':
        this.emit(this.buffer('gong-lose', (c) => renderGong(c, 88, 3.4)), this.sfxBus, { gain: 0.6 });
        for (let i = 0; i < 3; i += 1) {
          this.emit(
            this.buffer(`pluck-lose-${i}`, (c) => renderPluck(c, noteFrequency(scaleNote(-12, 2 - i)), 1.2)),
            this.sfxBus,
            { gain: 0.32, when: now + 0.2 + i * 0.22 },
          );
        }
        break;
      case 'breakthrough':
        this.emit(this.buffer('gong-break', (c) => renderGong(c, 220, 3.6)), this.sfxBus, { gain: 0.55 });
        for (let i = 0; i < 7; i += 1) {
          this.emit(
            this.buffer(`pluck-break-${i}`, (c) => renderPluck(c, noteFrequency(scaleNote(0, i)), 1.4, 0.9)),
            this.sfxBus,
            { gain: 0.3, when: now + i * 0.1 },
          );
        }
        break;
    }
  }

  /** 切換配樂。同一個境界重複呼叫不會重來。 */
  playMusic(realmIndex: number): void {
    // 音量歸零時不排程。靜音只是聽不見，但排拍點的工作照做——那是純粹的浪費，
    // 而且玩家把配樂關掉的意思本來就是「別再做這件事」。
    if (!this.enabled || this.musicVolume <= 0 || this.ctx === null) return;
    if (this.musicRealm === realmIndex && this.musicTimer !== null) return;

    this.stopMusic();
    this.musicRealm = realmIndex;
    this.musicBar = 0;
    this.nextBarTime = this.ctx.currentTime + 0.1;
    this.scheduleBar();
  }

  stopMusic(): void {
    if (this.musicTimer !== null) {
      clearTimeout(this.musicTimer);
      this.musicTimer = null;
    }
    this.musicRealm = null;
  }

  /**
   * 一次排一個小節的音，快結束時再排下一節。
   * 用 AudioContext 的時間軸而非 setInterval，掉幀時節奏不會亂。
   */
  private scheduleBar(): void {
    const ctx = this.ctx;
    const realm = this.musicRealm;
    if (ctx === null || realm === null || !this.enabled) return;

    const root = rootForRealm(realm);
    const bar = barForRealm(realm, this.musicBar % BARS_PER_PHRASE);
    this.musicBar += 1;
    const start = Math.max(this.nextBarTime, ctx.currentTime + 0.05);

    // 音域用整段四小節去算，不是只看這一小節——否則四個小節會各自被移到不同的八度，
    // 樂句就斷成四截了。
    const allNotes = phraseForRealm(realm).map((degree) => scaleNote(root + 12, degree));
    const melodyShift = octaveShift(Math.max(...allNotes), MELODY_CEILING);
    const allSparkle = phraseForRealm(realm).map((degree) =>
      scaleNote(root + 24, degree % PENTATONIC.length),
    );
    const sparkleShift = octaveShift(Math.max(...allSparkle), SPARKLE_CEILING);

    for (let beat = 0; beat < BEATS_PER_BAR; beat += 1) {
      const when = start + beat * BEAT_SECONDS;
      const degree = bar.degrees[beat] ?? 0;

      // 主旋律。衰減 0.9 秒：拖太長會把相鄰的音糊成一片持續音，
      // 聽起來像鋪底而不是旋律，快起來之後更明顯。
      if (bar.rhythm[beat] === true) {
        const frequency = noteFrequency(scaleNote(root + 12, degree) + melodyShift);
        this.emit(
          this.buffer(`music-${Math.round(frequency)}`, (c) => renderPluck(c, frequency, 0.9, 0.72)),
          this.musicBus,
          { gain: beat === 0 ? 0.52 : 0.36, when },
        );
      } else {
        // 休止的拍子改在半拍後點一個高八度的輕音。
        // 留白不等於空白——這一點是整段「活起來」的地方。
        const sparkle = noteFrequency(
          scaleNote(root + 24, degree % PENTATONIC.length) + sparkleShift,
        );
        this.emit(
          this.buffer(`music-hi-${Math.round(sparkle)}`, (c) => renderPluck(c, sparkle, 0.5, 0.9)),
          this.musicBus,
          { gain: 0.16, when: when + BEAT_SECONDS * 0.5 },
        );
      }

      // 低音跟著**當下的和弦**走，不是一直釘在主音上。
      // 這是第一版最缺的一塊：沒有和聲進行，速度與節奏再怎麼調都只是原地打轉。
      const bassDegree = BASS_BEATS[beat] ?? null;
      if (bassDegree !== null) {
        const bass = noteFrequency(scaleNote(root - 12 + bar.chordRoot, bassDegree));
        this.emit(
          this.buffer(`music-bass-${Math.round(bass)}`, (c) => renderPluck(c, bass, 1.4, 0.28)),
          this.musicBus,
          { gain: beat % 4 === 0 ? 0.44 : 0.3, when },
        );
      }

      // 鼓點：兩個正拍加一個切分。音量壓得很低，它是律動不是節拍器。
      if (DRUM_BEATS.includes(beat)) {
        this.emit(
          this.buffer('music-drum', (c) => renderThud(c, 96, 44, 0.22)),
          this.musicBus,
          { gain: beat === 0 ? 0.3 : 0.19, when },
        );
      }
    }

    this.nextBarTime = start + BEATS_PER_BAR * BEAT_SECONDS;
    const delayMs = Math.max(50, (this.nextBarTime - ctx.currentTime - 0.4) * 1000);
    this.musicTimer = setTimeout(() => this.scheduleBar(), delayMs);
  }
}

export const audio = new AudioEngine();

/** 掛一次性的解鎖事件。瀏覽器要求先有使用者手勢才能播放聲音。 */
export function installAudioUnlock(onUnlocked?: () => void): void {
  if (typeof window === 'undefined') return;
  const unlock = (): void => {
    audio.unlock();
    onUnlocked?.();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);
}
