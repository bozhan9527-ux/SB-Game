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
  ARPEGGIO,
  ARPEGGIO_CEILING,
  BARS_PER_PHRASE,
  BASS_BEATS,
  BEATS_PER_BAR,
  DRUM_BEATS,
  MELODY_CEILING,
  barForRealm,
  noteFrequency,
  octaveShift,
  phraseForRealm,
  rootForRealm,
  scaleNote,
} from './notes';
import { renderBassBow, renderChime, renderCrackle, renderDrum, renderDulcimer, renderErhu, renderGong, renderNoise, renderPluck, renderSnap, renderStrings, renderThud } from './synth';

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
  | 'gateHurt'
  | 'gateDanger'
  | 'bossRoar'
  | 'victory'
  | 'defeat'
  | 'breakthrough';

/**
 * 攻擊音的音色：每一種符歸到一類，同一類同一種聲音。
 * 二十種符各配一個聲音的話，玩家記不住；六類聽得出差別，也聽得出「現在是誰在打」。
 */
export type AttackVoice = 'blade' | 'thunder' | 'wind' | 'fire' | 'frost' | 'spirit';

export const ATTACK_VOICE: Readonly<Record<string, AttackVoice>> = {
  sword: 'blade', pierce: 'blade', breaker: 'blade', slayer: 'blade', myriad: 'blade',
  bolt: 'thunder', tempest: 'thunder',
  fan: 'wind', gale: 'wind',
  flame: 'fire', pyre: 'fire',
  frost: 'frost',
  soul: 'spirit', abyss: 'spirit', spirit: 'spirit', taiyi: 'spirit', grand: 'spirit', seal: 'spirit', bastion: 'spirit', fortune: 'spirit',
};

export function attackVoice(cardType: string): AttackVoice {
  return ATTACK_VOICE[cardType] ?? 'blade';
}

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
      // 小妖被打散：一團墨散開的「噗」，加一串符紙燒盡的劈啪。
      case 'mob':
        this.emit(this.buffer('noise-mob', (c) => renderNoise(c, 0.32, 1.6)), this.sfxBus, {
          gain: 0.34,
          filter: { from: 1600, to: 300 },
        });
        this.emit(this.buffer('crackle-mob', (c) => renderCrackle(c, 0.3, 120)), this.sfxBus, {
          gain: 0.14,
          filter: { from: 2600, to: 1200 },
          when: now + 0.03,
        });
        this.emit(this.buffer('thud-mob', (c) => renderThud(c, 140, 48, 0.3)), this.sfxBus, { gain: 0.38 });
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
        this.emit(this.buffer('snap', (c) => renderSnap(c)), this.sfxBus, { gain: 0.2, rate: 0.7 });
        this.emit(this.buffer('noise-hit', (c) => renderNoise(c, 0.16, 3)), this.sfxBus, {
          gain: 0.22,
          filter: { from: 3200, to: 900 },
          rate: 0.9 + Math.random() * 0.25,
        });
        this.emit(this.buffer('thud-bosshit', (c) => renderThud(c, 160, 70, 0.14)), this.sfxBus, { gain: 0.22 });
        break;
      case 'gateHurt':
        // 山門被撞：木門的悶響加一聲木頭裂開的脆響，跟符打中妖怪的聲音分得開
        this.emit(this.buffer('thud-gate', (c) => renderThud(c, 95, 42, 0.42)), this.sfxBus, { gain: 0.8 });
        this.emit(this.buffer('snap-gate', (c) => renderSnap(c, 0.07)), this.sfxBus, { gain: 0.45, filter: { from: 2400, to: 700 } });
        this.emit(this.buffer('crackle-gate', (c) => renderCrackle(c, 0.16, 70)), this.sfxBus, { gain: 0.18 });
        break;
      case 'gateDanger':
        // 山門快守不住：連敲兩下警鑼
        this.emit(this.buffer('gong-danger', (c) => renderGong(c, 330, 1.2)), this.sfxBus, { gain: 0.5 });
        this.emit(this.buffer('gong-danger', (c) => renderGong(c, 330, 1.2)), this.sfxBus, { gain: 0.42, when: (this.ctx?.currentTime ?? 0) + 0.28 });
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

  /**
   * 符籙打中的聲音，依符種分六類（見 ATTACK_VOICE）。
   *
   * 一秒會響好幾次，所以每一個都又短又輕：它的作用是「有打到」的觸感與「是誰在打」，
   * 不是提示。每一個都先疊一聲符紙的「啪」，再接那一類自己的聲音。
   * 音高每次隨機飄一點，連續打同一種符才不會像機關槍。
   */
  attack(cardType: string): void {
    const ctx = this.ctx;
    if (ctx === null || !this.enabled) return;
    const now = ctx.currentTime;
    const drift = 0.92 + Math.random() * 0.16;
    this.emit(this.buffer('snap', (c) => renderSnap(c)), this.sfxBus, { gain: 0.12, rate: drift, filter: { from: 2400, to: 1600 } });
    switch (attackVoice(cardType)) {
      case 'blade':
        // 出鞘：高頻噪音由低往高一掃，尾巴一點金屬的弦音。
        this.emit(this.buffer('noise-blade', (c) => renderNoise(c, 0.11, 3)), this.sfxBus, { gain: 0.16, rate: drift, filter: { from: 2200, to: 7200 } });
        this.emit(this.buffer('pluck-blade', (c) => renderPluck(c, noteFrequency(31), 0.14, 1)), this.sfxBus, { gain: 0.05, rate: drift, when: now + 0.02 });
        break;
      case 'thunder':
        this.emit(this.buffer('crackle-thunder', (c) => renderCrackle(c, 0.22, 260)), this.sfxBus, { gain: 0.2, rate: drift, filter: { from: 3600, to: 1400 } });
        this.emit(this.buffer('thud-thunder', (c) => renderThud(c, 110, 50, 0.16)), this.sfxBus, { gain: 0.16 });
        break;
      case 'wind':
        this.emit(this.buffer('noise-wind', (c) => renderNoise(c, 0.2, 1.4)), this.sfxBus, { gain: 0.15, rate: drift, filter: { from: 700, to: 2600 } });
        break;
      case 'fire':
        this.emit(this.buffer('noise-fire', (c) => renderNoise(c, 0.2, 2)), this.sfxBus, { gain: 0.16, rate: drift, filter: { from: 1800, to: 380 } });
        this.emit(this.buffer('crackle-fire', (c) => renderCrackle(c, 0.18, 90)), this.sfxBus, { gain: 0.1, filter: { from: 2200, to: 900 } });
        break;
      case 'frost':
        this.emit(this.buffer('pluck-frost1', (c) => renderPluck(c, noteFrequency(36), 0.18, 1)), this.sfxBus, { gain: 0.08, rate: drift });
        this.emit(this.buffer('pluck-frost2', (c) => renderPluck(c, noteFrequency(43), 0.14, 1)), this.sfxBus, { gain: 0.06, rate: drift, when: now + 0.035 });
        break;
      case 'spirit':
        // 木魚一樣的悶「篤」，加一點鑼的泛音。
        this.emit(this.buffer('pluck-spirit', (c) => renderPluck(c, noteFrequency(scaleNote(-5, 4)), 0.16, 0.2)), this.sfxBus, { gain: 0.14, rate: drift });
        this.emit(this.buffer('gong-spirit', (c) => renderGong(c, 520, 0.3)), this.sfxBus, { gain: 0.05, rate: drift });
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
   *
   * 編制（2026-10-22 換過一輪）：弦樂的持續和聲、揚琴琶音、革胡低音、二胡主旋律、堂鼓與編鐘。
   * 譜（和弦、琶音、旋律）沒有動，只換樂器。
   */
  private scheduleBar(): void {
    const ctx = this.ctx;
    const realm = this.musicRealm;
    if (ctx === null || realm === null || !this.enabled) return;

    const root = rootForRealm(realm);
    const bar = barForRealm(realm, this.musicBar % BARS_PER_PHRASE);
    this.musicBar += 1;
    const start = Math.max(this.nextBarTime, ctx.currentTime + 0.05);
    const barSeconds = BEATS_PER_BAR * BEAT_SECONDS;

    // 音域用整段去算，不是只看這一小節——否則每個小節會各自被移到不同的八度，樂句就斷成好幾截。
    const melodyShift = octaveShift(Math.max(...phraseForRealm(realm).map((degree) => scaleNote(root + 12, degree))), MELODY_CEILING);
    const arpTop = root + 9 + Math.max(...ARPEGGIO.map((step) => step ?? 0));
    const arpShift = octaveShift(arpTop, ARPEGGIO_CEILING);

    // 弦樂：根音加五度，整小節鋪著，稍微長一點和下一小節疊上，才不會一節一節斷開。
    for (const [interval, gain] of [[0, 0.2], [7, 0.13]] as const) {
      const frequency = noteFrequency(root + bar.chordRoot + interval);
      this.emit(
        this.buffer(`music-strings-${Math.round(frequency)}`, (c) => renderStrings(c, frequency, barSeconds * 1.15)),
        this.musicBus,
        { gain, when: start },
      );
    }

    for (let beat = 0; beat < BEATS_PER_BAR; beat += 1) {
      const when = start + beat * BEAT_SECONDS;

      // 揚琴琶音：每拍一顆，小節頭重一點。
      const step = ARPEGGIO[beat] ?? null;
      if (step !== null) {
        const frequency = noteFrequency(root + bar.chordRoot + step + arpShift);
        this.emit(
          this.buffer(`music-dulcimer-${Math.round(frequency)}`, (c) => renderDulcimer(c, frequency, 0.9)),
          this.musicBus,
          { gain: beat === 0 ? 0.26 : 0.17, when },
        );
      }

      // 低音：革胡短弓，根音與五度。
      const bass = BASS_BEATS[beat] ?? null;
      if (bass !== null) {
        const frequency = noteFrequency(root - 12 + bar.chordRoot + bass);
        this.emit(
          this.buffer(`music-bassbow-${Math.round(frequency)}`, (c) => renderBassBow(c, frequency, BEAT_SECONDS * 1.8)),
          this.musicBus,
          { gain: beat === 0 ? 0.42 : 0.3, when },
        );
      }

      // 堂鼓：兩個正拍加一個切分，悶悶的，墊在底下。
      if (DRUM_BEATS.includes(beat)) {
        this.emit(
          this.buffer('music-drum', (c) => renderDrum(c)),
          this.musicBus,
          { gain: beat === 0 ? 0.34 : 0.2, when },
        );
      }
    }

    // 二胡：照譜拉，每個音拉滿它的拍數（稍微短一點，換弓）。
    for (const note of bar.notes) {
      const frequency = noteFrequency(scaleNote(root + 12, note.degree) + melodyShift);
      const seconds = note.beats * BEAT_SECONDS * 0.94;
      this.emit(
        this.buffer(`music-erhu-${Math.round(frequency)}-${note.beats}`, (c) => renderErhu(c, frequency, seconds)),
        this.musicBus,
        { gain: note.at === 0 ? 0.36 : 0.3, when: start + note.at * BEAT_SECONDS },
      );
    }

    // 編鐘：兩小節一響，標出樂句的段落；敲在這一小節和弦的根音上。
    if (bar.bell) {
      const frequency = noteFrequency(root + 12 + bar.chordRoot);
      this.emit(
        this.buffer(`music-chime-${Math.round(frequency)}`, (c) => renderChime(c, frequency, 2.4)),
        this.musicBus,
        { gain: 0.16, when: start },
      );
    }

    this.nextBarTime = start + barSeconds;
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
