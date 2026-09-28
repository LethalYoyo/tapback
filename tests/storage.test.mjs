import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const { Storage, validateWav } = createRequire(import.meta.url)('../electron/storage.cjs');
function wav(seconds = 0.1) {
  const size = Math.floor(48000 * seconds) * 2, b = Buffer.alloc(44 + size);
  b.write('RIFF'); b.writeUInt32LE(b.length - 8, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(48000, 24); b.writeUInt32LE(96000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(size, 40); return b;
}
test('WAV validation rejects oversized durations, malformed frames, and non-audio input', () => {
  assert.equal(validateWav(wav()).duration, 0.1);
  assert.throws(() => validateWav(Buffer.from('<script>bad</script>')));
  assert.throws(() => validateWav(wav(16)));
  const invalid = wav(); invalid.writeUInt32LE(100, 40); assert.throws(() => validateWav(invalid));
});
test('save, rename, exclude, reload, export/import, and delete preserve audio', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tapback-test-'));
  try {
    const store = new Storage(root); await store.init();
    const clip = await store.add({ name: 'My reaction', duration: 99 }, wav());
    assert.equal(clip.duration, 0.1); assert.deepEqual(Buffer.from(await store.read(clip.id)), wav());
    await store.update(clip.id, { name: 'A better name', enabled: false });
    const reloaded = new Storage(root); await reloaded.init(); assert.equal(reloaded.clips[0].name, 'A better name'); assert.equal(reloaded.clips[0].enabled, false);
    const pack = await store.exportPack(); await store.importPack(pack); assert.equal(store.clips.length, 2); assert.notEqual(store.clips[0].id, store.clips[1].id);
    await store.remove(clip.id); assert.equal(store.clips.length, 1); await assert.rejects(store.read(clip.id));
    await assert.rejects(store.read('../../etc/passwd'));
    const saved = JSON.parse(await readFile(path.join(root, 'library.json'), 'utf8')); assert.equal(saved.length, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('malformed pack import is all-or-nothing, including metadata', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tapback-pack-'));
  try {
    const store = new Storage(root); await store.init();
    await assert.rejects(store.importPack({ format: 'tapback-pack', version: 1, sounds: [{ name: 'valid', audio: wav().toString('base64') }, { name: '', audio: wav().toString('base64') }] }));
    assert.equal(store.clips.length, 0);
    await assert.rejects(store.importPack({ format: 'tapback-pack', version: 2, sounds: [] }));
  } finally { await rm(root, { recursive: true, force: true }); }
});
