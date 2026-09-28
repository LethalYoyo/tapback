import { clamp } from '../shared/core.mjs';

export const packs = [
  { id: 'arcade', title: 'Pocket arcade', subtitle: 'Tiny sounds. High scores.', badge: '8-BIT', color: 'mint', icon: 'gamepad', clips: ['Coin op', 'Level up', 'Little laser'] },
  { id: 'rubber', title: 'Rubber room', subtitle: 'Delightfully unserious.', badge: 'CARTOON', color: 'peach', icon: 'smile', clips: ['Boing!', 'Squeaky clean', 'Bubble trouble'] },
  { id: 'cosmic', title: 'Space oddity', subtitle: 'A very close encounter.', badge: 'COSMIC', color: 'lavender', icon: 'orbit', clips: ['UFO hello', 'Moon drop', 'Cosmic wobble'] },
  { id: 'custom', title: 'Made by you', subtitle: 'Your voice. Your weird.', badge: 'PERSONAL', color: 'yellow', icon: 'mic', clips: [] }
];
export const builtins = packs.flatMap(p => p.clips.map((name, index) => ({ id: `${p.id}-${index}`, name, pack: p.id, index })));
export class AudioEngine {
  context: AudioContext | null = null;
  master: GainNode | null = null;
  compressor: DynamicsCompressorNode | null = null;
  active: AudioBufferSourceNode | null = null;
  blockedUntil = 0;
  private buffers = new Map<string, AudioBuffer>();
  async init() {
    if (!this.context) {
      this.context = new AudioContext({ latencyHint: 'interactive', sampleRate: 48000 });
      this.master = this.context.createGain(); this.compressor = this.context.createDynamicsCompressor();
      this.compressor.threshold.value = -6; this.compressor.knee.value = 6; this.compressor.ratio.value = 12;
      this.master.connect(this.compressor).connect(this.context.destination);
    }
    if (this.context.state === 'suspended') await this.context.resume();
    return this.context;
  }
  stop() { try { this.active?.stop(); } catch { /* Already ended. */ } this.active = null; this.blockedUntil = performance.now() + 250; }
  setVolume(volume: number) { this.master?.gain.setTargetAtTime(clamp(volume, 0, 100) / 100 * 0.75, this.context!.currentTime, 0.02); }
  async decode(data: ArrayBuffer) { const ctx = await this.init(); return ctx.decodeAudioData(data.slice(0)); }
  async clip(id: string) {
    if (!this.buffers.has(id)) { const bytes = await window.tapback.readClip(id); this.buffers.set(id, await this.decode(new Uint8Array(bytes).buffer)); }
    return this.buffers.get(id)!;
  }
  forget(id: string) { this.buffers.delete(id); }
  async play(buffer: AudioBuffer, volume: number, pitch = 0, strength = 1) {
    const ctx = await this.init(); this.stop();
    this.setVolume(volume);
    const source = ctx.createBufferSource(), gain = ctx.createGain();
    source.buffer = buffer; source.playbackRate.value = 2 ** (pitch / 12);
    gain.gain.value = Math.max(0.15, strength); source.connect(gain).connect(this.master!);
    const duration = buffer.duration / source.playbackRate.value;
    this.blockedUntil = performance.now() + duration * 1000 + 350;
    this.active = source; source.start();
    source.onended = () => { source.disconnect(); gain.disconnect(); if (this.active === source) this.active = null; };
    return duration;
  }
  async synth(pack: string, variant: number) {
    const ctx = await this.init(), id = pack + variant;
    if (this.buffers.has(id)) return this.buffers.get(id)!;
    const duration = pack === 'arcade' ? 0.4 + variant * 0.12 : 0.75 + variant * 0.1;
    const buffer = ctx.createBuffer(1, Math.floor(duration * ctx.sampleRate), ctx.sampleRate);
    const out = buffer.getChannelData(0); let phase = 0;
    for (let i = 0; i < out.length; i++) {
      const t = i / ctx.sampleRate, u = t / duration;
      let frequency, value;
      if (pack === 'arcade') {
        const notes = variant === 0 ? [660, 990, 1320] : variant === 1 ? [523, 659, 784, 1047] : [1200, 750, 400, 200];
        frequency = notes[Math.min(notes.length - 1, Math.floor(u * notes.length))];
        phase += frequency / ctx.sampleRate; value = Math.sin(phase * Math.PI * 2) > 0 ? 0.3 : -0.3;
      } else if (pack === 'rubber') {
        frequency = (variant === 0 ? 160 : variant === 1 ? 850 : 350) * (1 + 1.8 * Math.exp(-t * 8)) + Math.sin(t * (35 + variant * 12)) * 80 * (1 - u);
        phase += frequency / ctx.sampleRate; value = Math.sin(phase * Math.PI * 2) * 0.7 + Math.sin(phase * Math.PI * 4) * 0.12;
      } else {
        frequency = 240 + variant * 130 + Math.sin(t * 15) * 160 + u * 300;
        phase += frequency / ctx.sampleRate; value = Math.sin(phase * Math.PI * 2) * Math.sin(t * 24) * 0.55;
      }
      out[i] = value * Math.min(1, t / 0.006) * Math.pow(1 - u, 1.7) * Math.min(1, (duration - t) / 0.025);
    }
    this.buffers.set(id, buffer); return buffer;
  }
}
export const engine = new AudioEngine();
export function encodeWav(buffer: AudioBuffer, start = 0, end = buffer.duration) {
  const from = Math.floor(clamp(start, 0, buffer.duration) * buffer.sampleRate);
  const to = Math.min(buffer.length, Math.floor(clamp(end, start, buffer.duration) * buffer.sampleRate));
  const length = Math.max(0, to - from), bytes = new ArrayBuffer(44 + length * 2), view = new DataView(bytes);
  const str = (offset: number, text: string) => [...text].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  str(0, 'RIFF'); view.setUint32(4, bytes.byteLength - 8, true); str(8, 'WAVE'); str(12, 'fmt '); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, buffer.sampleRate, true); view.setUint32(28, buffer.sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); str(36, 'data'); view.setUint32(40, length * 2, true);
  for (let i = 0; i < length; i++) {
    let sample = 0; for (let c = 0; c < buffer.numberOfChannels; c++) sample += buffer.getChannelData(c)[from + i] / buffer.numberOfChannels;
    const fade = Math.min(1, i / (buffer.sampleRate * 0.005), (length - 1 - i) / (buffer.sampleRate * 0.005));
    view.setInt16(44 + i * 2, Math.round(clamp(sample * fade, -1, 1) * 32767), true);
  }
  return new Uint8Array(bytes);
}
export class Microphone {
  stream: MediaStream | null = null; node: AudioWorkletNode | null = null; source: MediaStreamAudioSourceNode | null = null;
  private loaded = false; private generation = 0;
  async open(onLevel: (rms: number, peak: number) => void, onEnded?: () => void) {
    const generation = ++this.generation;
    if (!await window.tapback.microphone()) throw new Error('Microphone access is off. Enable TapBack in your system privacy settings, then try again.');
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false });
    if (generation !== this.generation) { stream.getTracks().forEach(t => t.stop()); throw new Error('Microphone request canceled.'); }
    this.stream = stream;
    try {
      const ctx = await engine.init();
      if (!this.loaded) { await ctx.audioWorklet.addModule(new URL('tap-meter.js', document.baseURI).href); this.loaded = true; }
      if (generation !== this.generation) throw new Error('Microphone request canceled.');
      this.source = ctx.createMediaStreamSource(stream);
      this.node = new AudioWorkletNode(ctx, 'tap-meter', { numberOfOutputs: 0 });
      this.node.port.onmessage = e => onLevel(e.data.rms, e.data.peak);
      this.source.connect(this.node);
      stream.getTracks().forEach(track => { track.onended = () => onEnded?.(); });
      return stream;
    } catch (error) { this.close(); throw error; }
  }
  close() {
    this.generation++; this.node?.disconnect(); this.source?.disconnect();
    if (this.node) { this.node.port.onmessage = null; this.node.port.close(); }
    this.stream?.getTracks().forEach(t => { t.onended = null; t.stop(); }); this.stream = null; this.node = null; this.source = null;
  }
}
