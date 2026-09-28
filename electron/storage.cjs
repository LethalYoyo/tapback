const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const MAX_BYTES = 3 * 1024 * 1024;
const MAX_LIBRARY = 40 * 1024 * 1024;
const validId = id => typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id);
function validateWav(input) {
  const b = Buffer.from(input);
  if (b.length < 46 || b.length > MAX_BYTES || b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE' || b.toString('ascii', 12, 16) !== 'fmt ' || b.readUInt32LE(16) !== 16 || b.readUInt16LE(20) !== 1 || b.readUInt16LE(34) !== 16 || b.toString('ascii', 36, 40) !== 'data') throw new Error('Use a valid PCM WAV sound.');
  const channels = b.readUInt16LE(22), rate = b.readUInt32LE(24), size = b.readUInt32LE(40);
  if (![1, 2].includes(channels) || rate < 8000 || rate > 48000 || size !== b.length - 44 || size % (channels * 2) || b.readUInt32LE(4) !== b.length - 8 || b.readUInt32LE(28) !== rate * channels * 2 || b.readUInt16LE(32) !== channels * 2) throw new Error('Invalid WAV audio format.');
  const duration = size / (rate * channels * 2);
  if (duration < 0.05 || duration > 15.05) throw new Error('Choose a sound between 0.05 and 15 seconds.');
  return { bytes: b, duration };
}
class Storage {
  constructor(root) { this.root = root; this.clips = []; this.queue = Promise.resolve(); }
  async init() {
    await fs.mkdir(path.join(this.root, 'sounds'), { recursive: true });
    try { const clips = JSON.parse(await fs.readFile(path.join(this.root, 'library.json'), 'utf8')); this.clips = Array.isArray(clips) ? clips.filter(c => validId(c.id) && typeof c.name === 'string' && Number.isFinite(c.duration)).slice(0, 50) : []; } catch { this.clips = []; }
    const existing = await Promise.all(this.clips.map(async c => { try { await fs.access(this.clipPath(c.id)); return c; } catch { return null; } }));
    this.clips = existing.filter(Boolean);
  }
  clipPath(id) { if (!validId(id)) throw new Error('Invalid sound ID.'); return path.join(this.root, 'sounds', id + '.wav'); }
  async json(name, value) { const file = path.join(this.root, name + '.json'); await fs.writeFile(file + '.tmp', JSON.stringify(value, null, 2)); await fs.rename(file + '.tmp', file); }
  serial(fn) { const job = this.queue.then(fn); this.queue = job.catch(() => {}); return job; }
  async add(value, bytes) {
    const { validClipMetadata } = await import('../shared/core.mjs');
    const audio = validateWav(bytes), metadata = validClipMetadata({ ...value, duration: audio.duration });
    if (this.clips.length >= 50) throw new Error('Your library is full (50 sounds). Remove a sound first.');
    const sizes = await Promise.all(this.clips.map(c => fs.stat(this.clipPath(c.id)).then(s => s.size).catch(() => 0)));
    if (sizes.reduce((a, b) => a + b, audio.bytes.length) > MAX_LIBRARY) throw new Error('Your sound library is full (40 MB).');
    const clip = { ...metadata, id: randomUUID(), createdAt: new Date().toISOString() };
    await fs.writeFile(this.clipPath(clip.id), audio.bytes);
    this.clips.push(clip);
    try { await this.json('library', this.clips); } catch (e) { this.clips.pop(); await fs.unlink(this.clipPath(clip.id)).catch(() => {}); throw e; }
    return clip;
  }
  async read(id) { if (!this.clips.some(c => c.id === id)) throw new Error('Sound not found.'); return new Uint8Array(await fs.readFile(this.clipPath(id))); }
  async update(id, changes) {
    const item = this.clips.find(c => c.id === id); if (!item) throw new Error('Sound not found.');
    if (typeof changes.name === 'string' && changes.name.trim()) item.name = changes.name.trim().slice(0, 60);
    if (typeof changes.enabled === 'boolean') item.enabled = changes.enabled;
    await this.json('library', this.clips); return item;
  }
  async remove(id) {
    const previous = this.clips;
    this.clips = this.clips.filter(c => c.id !== id);
    try { await this.json('library', this.clips); } catch (e) { this.clips = previous; throw e; }
    await fs.unlink(this.clipPath(id)).catch(() => {});
  }
  async exportPack() {
    return { format: 'tapback-pack', version: 1, sounds: await Promise.all(this.clips.map(async c => ({ name: c.name, enabled: c.enabled, audio: Buffer.from(await this.read(c.id)).toString('base64') }))) };
  }
  async importPack(pack) {
    if (!pack || pack.format !== 'tapback-pack' || pack.version !== 1 || !Array.isArray(pack.sounds) || !pack.sounds.length || this.clips.length + pack.sounds.length > 50) throw new Error('Invalid pack or library limit exceeded (50 sounds).');
    const { validClipMetadata } = await import('../shared/core.mjs');
    const prepared = pack.sounds.map(s => {
      if (typeof s.audio !== 'string' || s.audio.length > MAX_BYTES * 1.4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(s.audio)) throw new Error('Invalid audio in sound pack.');
      const audio = validateWav(Buffer.from(s.audio, 'base64'));
      return { ...validClipMetadata({ ...s, duration: audio.duration }), id: randomUUID(), bytes: audio.bytes, createdAt: new Date().toISOString() };
    });
    const existing = await Promise.all(this.clips.map(c => fs.stat(this.clipPath(c.id)).then(s => s.size).catch(() => 0)));
    if (existing.reduce((a, b) => a + b, 0) + prepared.reduce((a, b) => a + b.bytes.length, 0) > MAX_LIBRARY) throw new Error('Pack exceeds the 40 MB library limit.');
    const previous = [...this.clips];
    try {
      for (const { bytes, ...clip } of prepared) { await fs.writeFile(this.clipPath(clip.id), bytes); this.clips.push(clip); }
      await this.json('library', this.clips);
    } catch (e) {
      this.clips = previous;
      await Promise.all(prepared.map(c => fs.unlink(this.clipPath(c.id)).catch(() => {})));
      throw e;
    }
    return this.clips;
  }
}
module.exports = { Storage, validateWav };
