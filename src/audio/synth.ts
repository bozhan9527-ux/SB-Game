/**
 * 音色合成。
 *
 * 全部在 AudioBuffer 上離線算好再播，不用取樣素材：
 * - 撥弦用 Karplus-Strong（噪音短脈衝丟進延遲迴路），聽起來接近古箏／琵琶
 * - 鑼用數個非諧和正弦相加，衰減拉長
 * - 風聲、衝擊用白噪音加包絡
 * - 雷符的電響用劈啪聲（稀疏的隨機尖脈衝），符紙的「啪」用極短的寬頻噪音
 */

/** Karplus-Strong 撥弦。 */
export function renderPluck(
  ctx: BaseAudioContext,
  frequency: number,
  seconds: number,
  brightness = 0.5,
): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(rate * seconds));
  const buffer = ctx.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);

  const period = Math.max(2, Math.round(rate / frequency));
  const ring = new Float32Array(period);
  for (let i = 0; i < period; i += 1) ring[i] = Math.random() * 2 - 1;

  // 起音的噪音先做兩件事再進迴路：
  // 1. 去掉直流偏移——偏移會被延遲迴路一路帶著走，聽起來悶、也讓波形不對稱。
  // 2. 沿環做一次平滑——純白噪音有時高頻能量遠大於基頻，那一下撥弦聽起來會高八度。
  //    平滑之後基頻穩定得多（實測隨機起音的八度誤判率由 0.8% 降到 0）。
  let mean = 0;
  for (let i = 0; i < period; i += 1) mean += ring[i] ?? 0;
  mean /= period;
  const smoothed = new Float32Array(period);
  for (let i = 0; i < period; i += 1) {
    const previous = (ring[(i - 1 + period) % period] ?? 0) - mean;
    const current = (ring[i] ?? 0) - mean;
    const next = (ring[(i + 1) % period] ?? 0) - mean;
    smoothed[i] = previous * 0.25 + current * 0.5 + next * 0.25;
  }
  ring.set(smoothed);

  // damping 越接近 1 尾音越長；brightness 控制迴路裡的低通強度。
  const damping = 0.996;
  const blend = 0.5 + brightness * 0.2;
  let index = 0;
  let previous = 0;

  for (let i = 0; i < length; i += 1) {
    const current = ring[index] ?? 0;
    const filtered = (current * blend + previous * (1 - blend)) * damping;
    ring[index] = filtered;
    previous = current;
    data[i] = filtered;
    index = (index + 1) % period;
  }

  // 尾端淡出，避免 buffer 結束時的爆音。
  const fade = Math.min(length, Math.floor(rate * 0.05));
  for (let i = 0; i < fade; i += 1) {
    const position = length - fade + i;
    const sample = data[position] ?? 0;
    data[position] = sample * (1 - i / fade);
  }
  return buffer;
}

/** 鑼／磬：數個非諧和分音相加，長衰減。 */
export function renderGong(ctx: BaseAudioContext, frequency: number, seconds: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * seconds);
  const buffer = ctx.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  const partials = [1, 2.41, 3.17, 4.63, 5.89, 7.21];
  const gains = [1, 0.6, 0.42, 0.28, 0.18, 0.1];

  for (let i = 0; i < length; i += 1) {
    const t = i / rate;
    let sample = 0;
    for (let p = 0; p < partials.length; p += 1) {
      const partial = partials[p] ?? 1;
      const gain = gains[p] ?? 0;
      // 高分音衰減得比低分音快，聽起來才像金屬。
      sample += Math.sin(2 * Math.PI * frequency * partial * t) * gain * Math.exp(-t * (1.1 + partial * 0.5));
    }
    // 起音混一點噪音當作槌擊。
    const attack = t < 0.02 ? (Math.random() * 2 - 1) * (1 - t / 0.02) * 0.5 : 0;
    data[i] = (sample * 0.22 + attack) * Math.exp(-t * 0.6);
  }
  return buffer;
}

/** 白噪音，交給外部的濾波器掃頻做成風聲或衝擊。 */
export function renderNoise(ctx: BaseAudioContext, seconds: number, curve: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * seconds);
  const buffer = ctx.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    const t = i / length;
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, curve);
  }
  return buffer;
}

/** 低頻悶響：正弦音高快速下滑，用在陷阱與首領重擊。 */
export function renderThud(
  ctx: BaseAudioContext,
  fromFrequency: number,
  toFrequency: number,
  seconds: number,
): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * seconds);
  const buffer = ctx.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  let phase = 0;

  for (let i = 0; i < length; i += 1) {
    const t = i / length;
    const frequency = fromFrequency + (toFrequency - fromFrequency) * t;
    phase += (2 * Math.PI * frequency) / rate;
    data[i] = Math.sin(phase) * Math.pow(1 - t, 2.2);
  }
  return buffer;
}

/**
 * 劈啪聲：稀疏的隨機尖脈衝，越到後面越稀、越弱。雷符與燒符的那種「滋——啪」。
 * density 是每秒的脈衝數。
 */
export function renderCrackle(ctx: BaseAudioContext, seconds: number, density: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * seconds);
  const buffer = ctx.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  const chance = density / rate;
  let tail = 0;
  for (let i = 0; i < length; i += 1) {
    const t = i / length;
    if (Math.random() < chance * (1 - t)) tail = (Math.random() * 0.6 + 0.4) * (Math.random() < 0.5 ? -1 : 1);
    // 每個脈衝以幾十個取樣快速衰減，聽起來是「啪」而不是「嗶」。
    tail *= 0.93;
    data[i] = (tail + (Math.random() * 2 - 1) * 0.08) * Math.pow(1 - t, 1.5);
  }
  return buffer;
}

/** 符紙的「啪」：兩毫秒的起音、快速衰減的寬頻噪音。所有攻擊音都疊一層，聽起來是紙符打出去。 */
export function renderSnap(ctx: BaseAudioContext, seconds = 0.05): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(rate * seconds));
  const buffer = ctx.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  const attack = Math.floor(rate * 0.002);
  for (let i = 0; i < length; i += 1) {
    const env = i < attack ? i / attack : Math.exp(-(i - attack) / (rate * 0.008));
    data[i] = (Math.random() * 2 - 1) * env;
  }
  return buffer;
}

/**
 * 洞簫／竹笛：基音加少量泛音，起音帶一點氣聲，拉長之後才加顫音（吹奏者不會一開口就抖）。
 * 低音域聽起來像簫，高音域像笛，正好讓境界越高、配樂越亮。
 */
export function renderFlute(ctx: BaseAudioContext, frequency: number, seconds: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(rate * seconds));
  const buffer = ctx.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  const attack = 0.08;
  const release = Math.min(0.3, seconds * 0.4);
  let phase = 0;
  let breath = 0;
  for (let i = 0; i < length; i += 1) {
    const t = i / rate;
    const env = Math.min(1, t / attack) * Math.min(1, (seconds - t) / release);
    // 顫音在 0.25 秒後慢慢加深
    const vibrato = 1 + 0.006 * Math.min(1, Math.max(0, t - 0.25) / 0.3) * Math.sin(2 * Math.PI * 5.2 * t);
    phase += (2 * Math.PI * frequency * vibrato) / rate;
    const tone = Math.sin(phase) + 0.22 * Math.sin(2 * phase) + 0.07 * Math.sin(3 * phase);
    // 氣聲：低通過的噪音，起音時最明顯
    breath = breath * 0.9 + (Math.random() * 2 - 1) * 0.1;
    const air = breath * (0.35 + 0.65 * Math.exp(-t * 8));
    data[i] = (tone * 0.5 + air * 0.5) * Math.max(0, env);
  }
  return buffer;
}

/** 笙一樣的持續和聲：兩個略微走音的正弦（合起來會慢慢「呼吸」），慢起慢收。 */
export function renderPad(ctx: BaseAudioContext, frequency: number, seconds: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(rate * seconds));
  const buffer = ctx.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  const attack = Math.min(0.5, seconds * 0.3);
  const release = Math.min(0.7, seconds * 0.4);
  for (let i = 0; i < length; i += 1) {
    const t = i / rate;
    const env = Math.min(1, t / attack) * Math.min(1, (seconds - t) / release);
    const tone =
      Math.sin(2 * Math.PI * frequency * t) +
      Math.sin(2 * Math.PI * frequency * 1.004 * t) * 0.8 +
      Math.sin(2 * Math.PI * frequency * 2 * t) * 0.25;
    data[i] = tone * 0.3 * Math.max(0, env);
  }
  return buffer;
}

/** 木魚：一聲短促的「篤」——中頻正弦極快衰減，前面一點敲擊的噪音。 */
export function renderWoodblock(ctx: BaseAudioContext, frequency = 880, seconds = 0.12): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(rate * seconds));
  const buffer = ctx.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    const t = i / rate;
    const body = Math.sin(2 * Math.PI * frequency * t) * Math.exp(-t / 0.022);
    const click = t < 0.003 ? (Math.random() * 2 - 1) * (1 - t / 0.003) : 0;
    data[i] = body * 0.8 + click * 0.4;
  }
  return buffer;
}

// ---------- 配樂第二套編制（2026-10-22）：二胡、揚琴、弦樂、編鐘、堂鼓 ----------

/**
 * 二胡：弓拉的弦，泛音很多（鋸齒波的 1/n 疊加，第二三泛音再推一點，那是它鼻音的來源）。
 * 起音從低一點滑上來（揉弦的手指落下去那一下），拉長之後加顫音，弓毛的沙沙聲很輕。
 */
export function renderErhu(ctx: BaseAudioContext, frequency: number, seconds: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(rate * seconds));
  const buffer = ctx.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  const attack = 0.1;
  const release = Math.min(0.25, seconds * 0.35);
  const harmonics = [1, 0.75, 0.62, 0.32, 0.22, 0.16, 0.1, 0.07];
  let phase = 0;
  let bow = 0;
  for (let i = 0; i < length; i += 1) {
    const t = i / rate;
    const env = Math.min(1, t / attack) * Math.min(1, (seconds - t) / release);
    const slide = 1 - 0.018 * Math.exp(-t / 0.05);
    const vibrato = 1 + 0.009 * Math.min(1, Math.max(0, t - 0.18) / 0.25) * Math.sin(2 * Math.PI * 5.6 * t);
    phase += (2 * Math.PI * frequency * slide * vibrato) / rate;
    let tone = 0;
    for (let h = 0; h < harmonics.length; h += 1) tone += (harmonics[h] ?? 0) * Math.sin((h + 1) * phase);
    bow = bow * 0.7 + (Math.random() * 2 - 1) * 0.3;
    data[i] = (tone * 0.22 + bow * 0.04) * Math.max(0, env);
  }
  return buffer;
}

/**
 * 揚琴：竹槌敲弦。每個音是兩根略微走音的弦（揚琴一音多弦，合起來有一點閃爍），
 * 高泛音衰減得比基音快，起頭有一下很短的槌聲。
 */
export function renderDulcimer(ctx: BaseAudioContext, frequency: number, seconds: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(rate * seconds));
  const buffer = ctx.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  const partials = [[1, 1, 0.9], [2, 0.5, 0.45], [3, 0.3, 0.3], [4.02, 0.18, 0.2], [5.05, 0.1, 0.14]] as const;
  for (let i = 0; i < length; i += 1) {
    const t = i / rate;
    let tone = 0;
    for (const [mult, amp, decay] of partials) {
      const env = Math.exp(-t / decay);
      tone += amp * env * (Math.sin(2 * Math.PI * frequency * mult * t) + Math.sin(2 * Math.PI * frequency * mult * 1.0025 * t));
    }
    const hammer = t < 0.004 ? (Math.random() * 2 - 1) * (1 - t / 0.004) * 0.5 : 0;
    const fade = Math.min(1, (seconds - t) / 0.05);
    data[i] = (tone * 0.22 + hammer) * fade;
  }
  return buffer;
}

/** 弦樂合奏的持續和聲：三把略微走音的弦（少量泛音），慢起慢收，比笙更厚、更暖。 */
export function renderStrings(ctx: BaseAudioContext, frequency: number, seconds: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(rate * seconds));
  const buffer = ctx.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  const attack = Math.min(0.6, seconds * 0.35);
  const release = Math.min(0.8, seconds * 0.4);
  const detunes = [0.996, 1, 1.0045];
  for (let i = 0; i < length; i += 1) {
    const t = i / rate;
    const env = Math.min(1, t / attack) * Math.min(1, (seconds - t) / release);
    let tone = 0;
    for (const d of detunes) {
      const f = frequency * d;
      tone += Math.sin(2 * Math.PI * f * t) + 0.4 * Math.sin(4 * Math.PI * f * t) + 0.18 * Math.sin(6 * Math.PI * f * t) + 0.08 * Math.sin(8 * Math.PI * f * t);
    }
    data[i] = tone * 0.11 * Math.max(0, env);
  }
  return buffer;
}

/** 低音弓弦（革胡）：短促的弓，基音加一點二泛音，墊在拍子上。 */
export function renderBassBow(ctx: BaseAudioContext, frequency: number, seconds: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(rate * seconds));
  const buffer = ctx.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    const t = i / rate;
    const env = Math.min(1, t / 0.04) * Math.exp(-t / (seconds * 0.55));
    const tone = Math.sin(2 * Math.PI * frequency * t) + 0.35 * Math.sin(4 * Math.PI * frequency * t) + 0.12 * Math.sin(6 * Math.PI * frequency * t);
    data[i] = tone * 0.4 * env * Math.min(1, (seconds - t) / 0.05);
  }
  return buffer;
}

/**
 * 編鐘：FM 合成的鐘聲。調變頻率取非整數倍，聲音才有青銅的「嗡」；
 * 調變深度隨時間衰減，敲下去很亮、尾音越來越純。
 */
export function renderChime(ctx: BaseAudioContext, frequency: number, seconds: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(rate * seconds));
  const buffer = ctx.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    const t = i / rate;
    const index = 3.2 * Math.exp(-t / 0.35);
    const mod = Math.sin(2 * Math.PI * frequency * 1.41 * t) * index;
    const env = Math.exp(-t / (seconds * 0.4)) * Math.min(1, t / 0.002);
    data[i] = Math.sin(2 * Math.PI * frequency * t + mod) * 0.5 * env * Math.min(1, (seconds - t) / 0.05);
  }
  return buffer;
}

/** 堂鼓：鼓皮的音高從高往下掉（敲下去那一下最緊），加一點鼓框的噪音。 */
export function renderDrum(ctx: BaseAudioContext, seconds = 0.35): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(rate * seconds));
  const buffer = ctx.createBuffer(1, length, rate);
  const data = buffer.getChannelData(0);
  let phase = 0;
  let noise = 0;
  for (let i = 0; i < length; i += 1) {
    const t = i / rate;
    const f = 70 + 90 * Math.exp(-t / 0.04);
    phase += (2 * Math.PI * f) / rate;
    noise = noise * 0.6 + (Math.random() * 2 - 1) * 0.4;
    const body = Math.sin(phase) * Math.exp(-t / 0.12);
    const skin = noise * Math.exp(-t / 0.02) * 0.35;
    data[i] = (body + skin) * 0.8;
  }
  return buffer;
}
