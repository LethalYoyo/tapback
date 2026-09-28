import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TapDetector, ComboCounter, cleanSettings, selectSound, isQuietNow } from '../shared/core.mjs';

function warm(detector, energy = 0.002) { for (let i = 0; i < 100; i++) detector.analyze(energy, energy * 1.4, i * 10); }
test('microphone rejects stationary noise and ordinary low-crest tone', () => {
  const d = new TapDetector(); warm(d);
  for (let i = 100; i < 200; i++) assert.equal(d.analyze(0.003, 0.004, i * 10).hit, false);
  assert.equal(d.analyze(0.15, 0.21, 2100).hit, false);
});
test('short sharp transient fires; ringing is debounced', () => {
  const d = new TapDetector(); warm(d);
  assert.equal(d.analyze(0.12, 0.6, 1200).hit, true);
  d.analyze(0.001, 0.002, 1300);
  assert.equal(d.analyze(0.13, 0.6, 1450).hit, false);
  d.analyze(0.001, 0.002, 1900);
  assert.equal(d.analyze(0.13, 0.6, 2100).hit, true);
});
test('playback guard blocks feedback for the whole sound and release tail', () => {
  const d = new TapDetector(); warm(d);
  assert.equal(d.analyze(0.4, 0.95, 3000, 55, 650, true).hit, false);
  d.analyze(0.001, 0.002, 3200);
  assert.equal(d.analyze(0.3, 0.95, 4100, 55, 650, false).hit, true);
});
test('calibration warmup learns ambient noise while triggers are blocked', () => {
  const d = new TapDetector();
  for (let i = 0; i < 60; i++) d.analyze(0.05, 0.1, i * 10, 55, 650, true);
  assert.ok(d.floor > 0.04);
  assert.equal(d.analyze(0.08, 0.4, 3000).hit, false);
});
test('accelerometer removes stationary gravity and detects a sharp impulse', () => {
  const d = new TapDetector('sensor');
  for (let i = 0; i < 120; i++) assert.equal(d.motion(0, 0, 1, i * 10, 55, 650).hit, false);
  assert.equal(d.motion(0.3, 0.05, 1.1, 2000, 55, 650).hit, true);
  assert.equal(d.motion(NaN, 0, 1, 3000, 55, 650).hit, false);
  assert.equal(d.motion(0, 0, 1000, 3000, 55, 650).hit, false);
});
test('sensitivity changes the minimum transient threshold', () => {
  const low = new TapDetector(), high = new TapDetector(); warm(low); warm(high);
  assert.equal(low.analyze(0.02, 0.1, 2000, 1).hit, false);
  assert.equal(high.analyze(0.02, 0.1, 2000, 100).hit, true);
});
test('no-repeat shuffle handles empty and one-sound libraries', () => {
  assert.equal(selectSound([], ''), null);
  assert.equal(selectSound([{ id: 'a' }], 'a').id, 'a');
  assert.equal(selectSound([{ id: 'a' }, { id: 'b' }], 'a', () => 0).id, 'b');
});
test('combos expire while best persists', () => {
  const combo = new ComboCounter(); assert.equal(combo.hit(0), 1); assert.equal(combo.hit(1000), 2); assert.equal(combo.current(3300), 0); assert.equal(combo.hit(3400), 1); assert.equal(combo.best, 2);
});
test('settings validation clamps unsafe values and rejects wrong types', () => {
  const s = cleanSettings({ volume: 400, pitch: -100, cooldown: -1, pack: '../secret', source: 'camera', mute: 'false', sensitivity: NaN });
  assert.equal(s.volume, 100); assert.equal(s.pitch, -12); assert.equal(s.cooldown, 250); assert.equal(s.pack, 'arcade'); assert.equal(s.source, 'microphone'); assert.equal(s.mute, false); assert.equal(s.sensitivity, 55);
});
test('quiet hours cross midnight and end at exactly 8 AM', () => {
  const date = hour => new Date(2026, 8, 28, hour, 0, 0);
  assert.equal(isQuietNow(true, date(22)), true); assert.equal(isQuietNow(true, date(7)), true); assert.equal(isQuietNow(true, date(8)), false); assert.equal(isQuietNow(false, date(23)), false);
});
