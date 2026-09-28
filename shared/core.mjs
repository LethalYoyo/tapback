export const defaults = Object.freeze({
  volume: 65, sensitivity: 55, cooldown: 650, pitch: 0, shuffle: true,
  dynamics: true, visual: true, pack: 'arcade', source: 'microphone',
  quiet: false, launchAtLogin: false, mute: false
});
export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
export function cleanSettings(value) {
  const s = { ...defaults };
  if (!value || typeof value !== 'object') return s;
  for (const [key, min, max] of [['volume', 0, 100], ['sensitivity', 1, 100], ['cooldown', 250, 3000], ['pitch', -12, 12]]) {
    if (Number.isFinite(value[key])) s[key] = clamp(value[key], min, max);
  }
  for (const key of ['shuffle', 'dynamics', 'visual', 'quiet', 'launchAtLogin', 'mute']) {
    if (typeof value[key] === 'boolean') s[key] = value[key];
  }
  if (['arcade', 'rubber', 'cosmic', 'custom'].includes(value.pack)) s.pack = value.pack;
  if (['microphone', 'sensor', 'manual'].includes(value.source)) s.source = value.source;
  return s;
}
export function isQuietNow(enabled, date = new Date()) {
  return enabled && (date.getHours() >= 22 || date.getHours() < 8);
}
export function selectSound(items, previousId, random = Math.random) {
  if (!items.length) return null;
  const choices = items.length > 1 ? items.filter(x => x.id !== previousId) : items;
  return choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))];
}
export class ComboCounter {
  count = 0; best = 0; last = -Infinity;
  hit(now) {
    this.count = now - this.last <= 2200 ? this.count + 1 : 1;
    this.last = now; this.best = Math.max(this.best, this.count);
    return this.count;
  }
  current(now) { return now - this.last > 2200 ? 0 : this.count; }
}

// Transient detector: adaptive floor + sharp onset + peak/RMS crest factor.
// Acoustic detection is a heuristic: claps, speech plosives, and knocks can overlap.
export class TapDetector {
  constructor(kind = 'microphone') { this.kind = kind; this.reset(); }
  reset() { this.floor = 0.003; this.previous = 0; this.last = -Infinity; this.frames = 0; this.gravity = null; }
  analyze(rms, peak, now, sensitivity = 55, cooldown = 650, blocked = false) {
    if (![rms, peak, now].every(Number.isFinite) || rms < 0 || peak < 0) return { level: 0, hit: false, strength: 0 };
    const sensor = this.kind === 'sensor';
    const threshold = sensor ? 0.11 * Math.pow(0.08, clamp(sensitivity, 1, 100) / 100) : 0.12 * Math.pow(0.065, clamp(sensitivity, 1, 100) / 100);
    const gate = Math.max(threshold, this.floor * (sensor ? 4 : 3.2));
    const onset = rms > this.previous * (sensor ? 1.3 : 1.65);
    const crest = sensor || peak / Math.max(rms, 0.00001) > 1.8;
    const warm = this.frames++ < (sensor ? 50 : 60);
    const hit = !warm && !blocked && now - this.last >= cooldown && rms > gate && onset && crest;
    // Do not teach the noise estimator our own playback or large impacts.
    if (warm || (!blocked && rms < gate)) this.floor += (rms - this.floor) * (warm ? 0.08 : 0.012);
    this.previous = rms;
    if (hit) this.last = now;
    return { hit, level: clamp(rms / Math.max(gate * 2, 0.001), 0, 1), strength: clamp(rms / Math.max(gate * 4, 0.001), 0.2, 1), threshold: gate };
  }
  motion(x, y, z, now, sensitivity, cooldown, blocked = false) {
    if (![x, y, z].every(Number.isFinite) || Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) > 32) return { hit: false, level: 0, strength: 0 };
    if (!this.gravity) this.gravity = [x, y, z];
    const v = [x, y, z];
    const energy = Math.hypot(...v.map((n, i) => n - this.gravity[i]));
    v.forEach((n, i) => { this.gravity[i] += 0.12 * (n - this.gravity[i]); });
    return this.analyze(energy, energy, now, sensitivity, cooldown, blocked);
  }
}

export function validClipMetadata(value) {
  if (!value || typeof value !== 'object') throw new Error('Invalid sound.');
  const name = typeof value.name === 'string' ? value.name.trim().slice(0, 60) : '';
  if (!name) throw new Error('Give your sound a name.');
  if (!Number.isFinite(value.duration) || value.duration <= 0 || value.duration > 15.05) throw new Error('Sounds must be between 0 and 15 seconds.');
  return { name, duration: value.duration, enabled: value.enabled !== false };
}
