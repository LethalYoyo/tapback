import { useEffect, useRef, useState } from 'react';
import { AudioLines, ArrowDownToLine, ArrowUpFromLine, Check, ChevronRight, CircleHelp, Command, Gamepad2, Hand, Headphones, Heart, Keyboard, Mic, Minus, Monitor, Music2, Orbit, Pause, Play, Plus, Radio, Settings2, ShieldCheck, Shuffle, SlidersHorizontal, Smile, Sparkles, Square, Trash2, Volume2, VolumeX, X, Zap } from 'lucide-react';
import { defaults, TapDetector, ComboCounter, isQuietNow, selectSound } from '../shared/core.mjs';
import { engine, Microphone, packs, builtins, encodeWav } from './audio';
import type { Clip, Settings, State, SensorEvent } from './types';

type Page = 'board' | 'studio' | 'tuning' | 'about';
type Draft = { buffer: AudioBuffer; name: string; start: number; end: number };
const packIcon = (id: string, size = 24) => id === 'arcade' ? <Gamepad2 size={size}/> : id === 'rubber' ? <Smile size={size}/> : id === 'cosmic' ? <Orbit size={size}/> : <Mic size={size}/>;
const format = (n: number) => n.toFixed(1) + 's';
function Waveform({ buffer, active = false, level = 0 }: { buffer?: AudioBuffer; active?: boolean; level?: number }) {
  const samples = buffer?.getChannelData(0);
  return <div className={`waveform ${active ? 'active' : ''}`} aria-hidden="true">{Array.from({ length: 80 }, (_, i) => {
    let peak = 0;
    if (samples) { const step = Math.max(1, Math.floor(samples.length / 80)); for (let j = i * step; j < Math.min(samples.length, (i + 1) * step); j += 8) peak = Math.max(peak, Math.abs(samples[j])); }
    const height = samples ? 3 + peak * 92 : active ? 5 + (Math.sin(i * 1.8 + level * 9) ** 2) * level * 85 : 4 + (Math.sin(i * 0.61) ** 2) * 22;
    return <i key={i} style={{ height: `${height}%`, animationDelay: `${i % 7 * 0.08}s` }}/>;
  })}</div>;
}
function Toggle({ label, detail, checked, onChange }: { label: string; detail: string; checked: boolean; onChange: (v: boolean) => void }) {
  return <div className="setting-row"><div><strong>{label}</strong><p>{detail}</p></div><button className={`switch ${checked ? 'on' : ''}`} role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}><span/></button></div>;
}
function Slider({ label, value, min, max, step = 1, suffix, onChange }: { label: string; value: number; min: number; max: number; step?: number; suffix: string; onChange: (v: number) => void }) {
  return <label className="slider"><span><strong>{label}</strong><b>{value}{suffix}</b></span><input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))}/></label>;
}
function Laptop({ reacting, combo }: { reacting: boolean; combo: number }) {
  return <div className={`laptop-art ${reacting ? 'reacting' : ''}`}><div className="orbit-ring one"/><div className="orbit-ring two"/><span className="spark a">✳</span><span className="spark b">+</span><span className="spark c">✦</span>
    <span className="reaction-bubble">{reacting ? combo > 2 ? `${combo}× combo!` : 'boop!' : 'oh, hey.'}</span>
    <svg viewBox="0 0 340 250" aria-label="An illustrated smiling laptop" role="img"><defs><linearGradient id="screen" x2="1" y2="1"><stop stopColor="#293c34"/><stop offset="1" stopColor="#18271f"/></linearGradient></defs>
      <ellipse cx="169" cy="222" rx="130" ry="12" fill="#23372d" opacity=".1"/>
      <path d="M71 45 Q70 31 85 30 L272 43 Q283 44 280 61 L260 187 L51 168Z" fill="#c5d2c8" stroke="#25382d" strokeWidth="3"/>
      <path d="M83 46 L265 58 L247 169 L66 155Z" fill="url(#screen)"/>
      <circle cx="174" cy="43" r="2" fill="#283d31"/>
      <path d="M51 168 L260 187 L286 211 Q288 216 278 218 L39 200 Q31 199 35 191Z" fill="#e5eadd" stroke="#25382d" strokeWidth="3"/>
      <path d="M67 175 L247 190 L258 201 L53 185Z" fill="#a8bcac"/>
      {[0,1,2].map(i => <path key={i} d={`M${64-i*3} ${178+i*3} L${248+i*3} ${192+i*3}`} stroke="#e5eadd" strokeWidth="1.5"/>)}
      <path d="M128 192 L184 197 L190 205 L122 200Z" fill="#c0cfc1"/>
      <g className="face"><path d="M132 98 Q139 87 146 98 M190 102 Q197 91 204 102" fill="none" stroke="#c8f9a9" strokeWidth="6" strokeLinecap="round"/><path d="M148 121 Q166 143 186 123" fill="none" stroke="#c8f9a9" strokeWidth="5" strokeLinecap="round"/><ellipse cx="121" cy="114" rx="9" ry="4" fill="#ef9878"/><ellipse cx="211" cy="121" rx="9" ry="4" fill="#ef9878"/></g>
    </svg><span className="art-caption"><span/> emotionally available hardware</span></div>;
}

export default function App() {
  const [page, setPage] = useState<Page>('board'), [settings, setSettings] = useState<Settings>({ ...defaults }), [clips, setClips] = useState<Clip[]>([]);
  const [info, setInfo] = useState<State | null>(null), [ready, setReady] = useState(false), [listening, setListening] = useState(false), [busy, setBusy] = useState(false);
  const [level, setLevel] = useState(0), [status, setStatus] = useState('Ready when you are.'), [notice, setNotice] = useState(''), [error, setError] = useState('');
  const [stats, setStats] = useState({ total: 0, best: 0 }), [sessionTaps, setSessionTaps] = useState(0), [combo, setCombo] = useState(0), [reacting, setReacting] = useState(false), [lastSound, setLastSound] = useState('Waiting for a little tap');
  const [recording, setRecording] = useState(false), [recordSeconds, setRecordSeconds] = useState(0), [draft, setDraft] = useState<Draft | null>(null), [saving, setSaving] = useState(false), [calibrating, setCalibrating] = useState(false);
  const mic = useRef(new Microphone()), recorder = useRef<MediaRecorder | null>(null), detector = useRef(new TapDetector()), counter = useRef(new ComboCounter()), prevSound = useRef('');
  const recordTimer = useRef<ReturnType<typeof setInterval> | null>(null), reactionTimer = useRef<ReturnType<typeof setTimeout> | null>(null), calibrationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true), fileInput = useRef<HTMLInputElement>(null), token = useRef(0), lastMeter = useRef(0), initialized = useRef(false), playToken = useRef(0);
  const current = useRef({ settings, clips, listening, recording, busy, calibrating }); current.current = { settings, clips, listening, recording, busy, calibrating };
  const actionRef = useRef<(a: string) => void>(() => {});
  const changed = (patch: Partial<Settings>) => setSettings(s => ({ ...s, ...patch }));
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));
  const notify = (message: string) => setNotice(message);
  function meter(value: number) { if (performance.now() - lastMeter.current > 45) { setLevel(value); lastMeter.current = performance.now(); } }

  async function pause() {
    token.current++; playToken.current++; current.current.listening = false; setListening(false); setBusy(false); setCalibrating(false); mic.current.close();
    if (calibrationTimer.current) clearTimeout(calibrationTimer.current);
    engine.stop(); setLevel(0); setStatus('Paused. Take your time.');
    await window.tapback.sensorStop(); await window.tapback.status(false);
  }
  function sample(rms: number, peak: number) {
    const s = current.current.settings;
    const blocked = performance.now() < engine.blockedUntil || current.current.calibrating;
    const result = detector.current.analyze(rms, peak, performance.now(), s.sensitivity, s.cooldown, blocked);
    meter(result.level);
    if (result.hit && current.current.listening) void reactToTap(result.strength);
  }
  async function start() {
    if (current.current.recording || current.current.busy) return;
    setError(''); setBusy(true); current.current.busy = true;
    const id = ++token.current, source = current.current.settings.source;
    detector.current = new TapDetector(source === 'sensor' ? 'sensor' : 'microphone');
    try {
      await engine.init();
      if (source === 'microphone') {
        setStatus('Connecting your microphone…');
        await mic.current.open(sample, () => { void pause(); setError('Microphone disconnected. Reconnect it and start again.'); });
      } else if (source === 'sensor') {
        setStatus('Checking the motion sensor…');
        const result = await window.tapback.sensorStart();
        if (result.type !== 'ready') throw new Error(result.message || 'Sensor unavailable. Choose microphone mode in Tuning.');
      }
      if (id !== token.current) return;
      current.current.listening = true; setListening(true);
      setStatus(source === 'microphone' ? 'Listening for a gentle tap. Audio stays here.' : source === 'sensor' ? 'Motion sensor connected. Ready for gentle taps.' : 'Manual mode. Use the test pad or shortcut.');
      await window.tapback.status(true);
    } catch (e) { if (id === token.current) { mic.current.close(); await window.tapback.sensorStop(); fail(e); setStatus('Choose another input in Tuning.'); } }
    finally { if (id === token.current) { setBusy(false); current.current.busy = false; } }
  }
  async function reactToTap(strength = 0.65, explicitId?: string, preview = false) {
    if (current.current.recording || current.current.busy) return;
    const s = current.current.settings;
    if (s.mute || isQuietNow(s.quiet)) { if (preview) notify(s.mute ? 'Unmute to preview a sound.' : 'Quiet hours are on until 8 AM.'); return; }
    const choices = s.pack === 'custom' ? current.current.clips.filter(c => c.enabled) : builtins.filter(c => c.pack === s.pack);
    const selected = explicitId ? [...builtins, ...current.current.clips].find(c => c.id === explicitId) : s.shuffle ? selectSound(choices, prevSound.current) : choices[0];
    if (!selected) { notify('Record or import a sound in the studio first.'); return; }
    const id = ++playToken.current;
    try {
      const builtin = builtins.find(c => c.id === selected.id);
      const buffer = builtin ? await engine.synth(builtin.pack, builtin.index) : await engine.clip(selected.id);
      if (id !== playToken.current) return;
      await engine.play(buffer, s.volume, s.pitch, s.dynamics ? 0.4 + strength * 0.6 : 1);
      prevSound.current = selected.id; setLastSound(selected.name);
      if (!preview) {
        const count = counter.current.hit(performance.now()); setCombo(count); setSessionTaps(n => n + 1);
        setStats(old => ({ total: old.total + 1, best: Math.max(old.best, count) }));
      }
      if (s.visual) { setReacting(true); if (reactionTimer.current) clearTimeout(reactionTimer.current); reactionTimer.current = setTimeout(() => setReacting(false), 650); }
    } catch (e) { fail(e); }
  }
  async function changeSource(source: string) { await pause(); changed({ source }); setStatus('Input changed. Start listening when ready.'); }
  async function record() {
    if (current.current.busy || recording) return;
    setError(''); await pause(); setBusy(true); current.current.busy = true; setDraft(null); setRecordSeconds(0);
    try {
      const stream = await mic.current.open((rms) => meter(Math.min(1, rms * 8)), () => { recorder.current?.stop(); setError('Microphone disconnected.'); });
      const mime = ['audio/webm;codecs=opus', 'audio/webm'].find(t => MediaRecorder.isTypeSupported(t));
      if (!mime) throw new Error('This system does not support audio recording. Try importing a sound.');
      const rec = new MediaRecorder(stream, { mimeType: mime }); recorder.current = rec;
      const chunks: Blob[] = [], started = performance.now();
      rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      rec.onerror = () => { setError('Recording failed. Please try again.'); if (rec.state !== 'inactive') rec.stop(); };
      rec.onstop = async () => {
        if (recordTimer.current) clearInterval(recordTimer.current);
        mic.current.close(); setRecording(false); current.current.recording = false; setLevel(0); setBusy(true);
        try {
          const buffer = await engine.decode(await new Blob(chunks, { type: mime }).arrayBuffer());
          if (buffer.duration < 0.1) throw new Error('That was too short. Record at least a tenth of a second.');
          setDraft({ buffer, name: 'My new reaction', start: 0, end: Math.min(15, buffer.duration) });
        } catch (e) { fail(e); }
        finally { setBusy(false); current.current.busy = false; }
      };
      rec.start(100); current.current.recording = true; setRecording(true);
      recordTimer.current = setInterval(() => { const seconds = (performance.now() - started) / 1000; setRecordSeconds(Math.min(seconds, 15)); if (seconds >= 15 && rec.state === 'recording') rec.stop(); }, 100);
    } catch (e) { mic.current.close(); fail(e); }
    finally { setBusy(false); current.current.busy = false; }
  }
  async function importAudio(file?: File) {
    if (!file) return;
    setError(''); if (file.size > 25 * 1024 * 1024) { fail('Choose an audio file smaller than 25 MB.'); return; }
    await pause(); setBusy(true); current.current.busy = true;
    try {
      const buffer = await engine.decode(await file.arrayBuffer());
      if (buffer.duration < 0.1) throw new Error('Choose a longer audio clip.');
      setDraft({ buffer, name: file.name.replace(/\.[^.]+$/, '').slice(0, 60), start: 0, end: Math.min(15, buffer.duration) });
      if (buffer.duration > 15) notify('Imported. Select up to 15 seconds using the trim controls.');
      setPage('studio');
    } catch { fail('Could not read that audio file. Try WAV, MP3, OGG, or WebM.'); }
    finally { setBusy(false); current.current.busy = false; if (fileInput.current) fileInput.current.value = ''; }
  }
  async function previewDraft() {
    if (!draft) return;
    if (settings.mute || isQuietNow(settings.quiet)) { notify('Turn off mute or quiet hours to preview.'); return; }
    try { const buffer = await engine.decode(new Uint8Array(encodeWav(draft.buffer, draft.start, draft.end)).buffer); await engine.play(buffer, settings.volume, settings.pitch); } catch (e) { fail(e); }
  }
  async function saveDraft() {
    if (!draft || saving) return;
    setSaving(true); setError('');
    try { const clip = await window.tapback.saveClip({ name: draft.name, duration: draft.end - draft.start }, encodeWav(draft.buffer, draft.start, draft.end)); setClips(old => [...old, clip]); changed({ pack: 'custom' }); setDraft(null); notify('Saved to Made by you. Your laptop has a new voice.'); }
    catch (e) { fail(e); } finally { setSaving(false); }
  }
  async function removeClip(clip: Clip) {
    try { await window.tapback.deleteClip(clip.id); engine.forget(clip.id); setClips(old => old.filter(c => c.id !== clip.id)); notify(`Removed “${clip.name}”.`); } catch (e) { fail(e); }
  }
  async function updateClip(clip: Clip, changes: Partial<Clip>) {
    try { const next = await window.tapback.updateClip(clip.id, changes); setClips(old => old.map(c => c.id === clip.id ? next : c)); } catch (e) { fail(e); }
  }
  async function calibrate() {
    if (current.current.recording || current.current.busy || settings.source === 'manual') return;
    if (!listening) await start();
    if (!current.current.listening) return;
    current.current.calibrating = true; setCalibrating(true); setStatus('Calibrating for 3 seconds. Leave the laptop still and keep quiet.');
    detector.current.reset();
    // Warmup samples establish the ambient floor even while triggers are blocked.
    calibrationTimer.current = setTimeout(() => { current.current.calibrating = false; setCalibrating(false); setStatus('Calibrated. Try a gentle tap; adjust sensitivity if needed.'); notify('Ambient noise calibrated.'); }, 3000);
  }

  actionRef.current = action => {
    if (action === 'tap') void reactToTap();
    if (action === 'mute') { engine.stop(); changed({ mute: !current.current.settings.mute }); }
    if (action === 'toggle') { if (current.current.listening) void pause(); else void start(); }
    if (action === 'pause') { if (recorder.current?.state === 'recording') recorder.current.stop(); void pause(); }
  };
  useEffect(() => {
    if (!window.tapback) { setError('Open TapBack as a desktop app to use recording, sound storage, and sensors.'); return; }
    mounted.current = true;
    window.tapback.state().then(state => {
      if (!mounted.current) return; setInfo(state); setSettings(state.settings); setClips(state.clips); setStats(state.stats); setReady(true);
    }).catch(fail);
    const offAction = window.tapback.on('action', action => actionRef.current(action));
    const offSensor = window.tapback.on('sensor', (data: SensorEvent) => {
      if (data.type === 'sample' && current.current.listening && current.current.settings.source === 'sensor') {
        const s = current.current.settings, result = detector.current.motion(data.x!, data.y!, data.z!, performance.now(), s.sensitivity, s.cooldown, current.current.calibrating || performance.now() < engine.blockedUntil);
        meter(result.level); if (result.hit) void reactToTap(result.strength);
      } else if (data.type === 'unavailable' && current.current.listening && current.current.settings.source === 'sensor') { void pause(); fail(data.message || 'Sensor disconnected.'); }
    });
    const tick = setInterval(() => setCombo(counter.current.current(performance.now())), 350);
    const keydown = (e: KeyboardEvent) => { if (e.code === 'Space' && !e.repeat && (e.target === document.body || (e.target as HTMLElement)?.id === 'test-pad')) { e.preventDefault(); actionRef.current('tap'); } };
    document.addEventListener('keydown', keydown);
    return () => { mounted.current = false; offAction(); offSensor(); clearInterval(tick); document.removeEventListener('keydown', keydown); mic.current.close(); };
  }, []);
  useEffect(() => {
    if (!ready) return;
    if (!initialized.current) { initialized.current = true; return; }
    const t = setTimeout(() => window.tapback.settings(settings).catch(fail), 250); return () => clearTimeout(t);
  }, [settings, ready]);
  useEffect(() => { if (ready) void window.tapback.stats(stats).catch(fail); }, [stats, ready]);
  useEffect(() => { engine.setVolume(settings.mute || isQuietNow(settings.quiet) ? 0 : settings.volume); }, [settings.volume, settings.mute, settings.quiet]);
  useEffect(() => { if (!notice) return; const t = setTimeout(() => setNotice(''), 4500); return () => clearTimeout(t); }, [notice]);
  const selectedPack = packs.find(p => p.id === settings.pack)!;
  const visibleSounds = settings.pack === 'custom' ? clips : builtins.filter(b => b.pack === settings.pack);
  const shortcutPrefix = info?.platform === 'darwin' ? '⌘' : 'Ctrl';
  const blocked = busy || recording || !ready;

  return <div className="app-shell">
    <aside className="sidebar"><div className="window-drag"/><div className="brand"><span className="brandmark"><AudioLines size={24}/></span><span>tapback<span className="brand-dot">.</span></span></div><span className="sidebar-label">MAKE SOME NOISE</span>
      <nav>{([{ id: 'board', label: 'Soundboard', icon: <AudioLines/> }, { id: 'studio', label: 'Recording studio', icon: <Mic/> }, { id: 'tuning', label: 'Tuning', icon: <SlidersHorizontal/> }] as const).map(item => <button className={page === item.id ? 'active' : ''} key={item.id} onClick={() => setPage(item.id)}>{item.icon}<span>{item.label}</span>{item.id === 'studio' && <span className="nav-plus">+</span>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="local-note"><ShieldCheck size={18}/><div><strong>Your weird stays here.</strong><span>No accounts. No uploads.</span></div></div><button className={`about-button ${page === 'about' ? 'active' : ''}`} onClick={() => setPage('about')}><CircleHelp size={17}/> The little details <span>↗</span></button><div className="version">TAPBACK <span>v{info?.version || '0.1.0'}</span></div></div>
    </aside>
    <main><div className="top-drag"/><header><div><div className="eyebrow">A LITTLE TAP. A LOT OF PERSONALITY.</div><h1>{page === 'board' ? 'Soundboard' : page === 'studio' ? 'Recording studio' : page === 'tuning' ? 'Make it your own' : 'Small app. Big feelings.'}</h1></div><div className="header-actions"><button className={`icon-button ${settings.mute ? 'muted' : ''}`} aria-label={settings.mute ? 'Unmute' : 'Mute'} onClick={() => actionRef.current('mute')}>{settings.mute ? <VolumeX size={19}/> : <Volume2 size={19}/>}</button><button className={`listen-button ${listening ? 'is-live' : ''}`} disabled={blocked} onClick={() => listening ? void pause() : void start()}>{listening ? <Pause size={15}/> : <Radio size={16}/>} {busy ? 'One moment…' : listening ? 'Listening' : 'Start listening'}</button></div></header>
      {error && <div className="error-banner" role="alert"><CircleHelp size={18}/><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError('')}><X size={16}/></button></div>}
      {page === 'board' && <>
        <section className="hero"><div className="hero-copy"><span className="little-tag"><Sparkles size={12}/> MEET YOUR COMPUTER’S ALTER EGO</span><h2>Your laptop.<br/>With a <em>personality.</em></h2><p>A gentle tap. A ridiculous reaction.<br/>Make your everyday a little less ordinary.</p><button id="test-pad" className="primary" disabled={blocked} onClick={() => void reactToTap()}><Hand size={17}/> Give it a test tap <kbd>space</kbd></button></div><Laptop reacting={reacting} combo={combo}/></section>
        <section className="pack-section"><div className="section-heading"><div><h2>Pick a personality <span>04</span></h2><p>From tiny arcade to entirely you.</p></div><button className={`text-button ${settings.shuffle ? 'selected' : ''}`} onClick={() => changed({ shuffle: !settings.shuffle })}><Shuffle size={15}/> Shuffle {settings.shuffle ? 'on' : 'off'}</button></div>
          <div className="pack-grid">{packs.map(pack => <button key={pack.id} className={`pack-card ${pack.color} ${settings.pack === pack.id ? 'selected' : ''}`} onClick={() => changed({ pack: pack.id })}><span className="pack-top"><span className="pack-icon">{packIcon(pack.id)}</span>{settings.pack === pack.id ? <span className="selected-check"><Check size={12}/></span> : <span className="pack-badge">{pack.badge}</span>}</span><strong>{pack.title}</strong><p>{pack.subtitle}</p><span className="pack-bottom">{pack.id === 'custom' ? `${clips.length} personal sounds` : '3 original sounds'}<ChevronRight size={14}/></span></button>)}</div>
        </section>
        <section className="sound-tray"><div className="sound-tray-title"><span>{packIcon(settings.pack, 16)} {selectedPack.title}</span><small>CLICK TO PREVIEW</small></div><div className="sound-chips">{visibleSounds.length ? visibleSounds.map(sound => <button key={sound.id} disabled={blocked} onClick={() => void reactToTap(0.65, sound.id, true)} className={lastSound === sound.name ? 'playing' : ''}><Play size={12} fill="currentColor"/>{sound.name}{'enabled' in sound && !sound.enabled && <small>excluded</small>}</button>) : <button className="empty-chip" onClick={() => setPage('studio')}><Plus size={15}/> Record your first reaction</button>}</div></section>
        <section className="session-strip"><div className="now-playing"><div className={`tiny-wave ${listening ? 'on' : ''}`}><i/><i/><i/><i/></div><div><small>{listening ? 'ON THE LOOKOUT' : 'CURRENT MOOD'}</small><strong>{lastSound}</strong></div></div><div className="session-stat"><b>{sessionTaps.toString().padStart(2, '0')}</b><span>session taps</span></div><div className="session-stat"><b>{combo ? `${combo}×` : '—'}</b><span>current combo</span></div><button className="mini-tune" onClick={() => setPage('tuning')}><Settings2 size={17}/></button></section>
      </>}
      {page === 'studio' && <>
        <div className="page-intro"><p>Your best impression. A dramatic sigh. A very confused cat.<br/>Give your computer a voice only you could come up with.</p><span className="privacy-badge"><ShieldCheck size={14}/> SAVED ONLY ON THIS DEVICE</span></div>
        <section className={`record-panel ${recording ? 'recording' : ''}`}><div className="record-top"><span><span className={`dot ${recording ? 'red' : ''}`}/>{recording ? 'RECORDING YOUR MASTERPIECE' : draft ? 'READY FOR ITS DEBUT' : 'THE MIC IS YOURS'}</span><b>{recording ? format(recordSeconds) : draft ? format(draft.end - draft.start) : '00:00'} <small>/ 15s max</small></b></div><Waveform buffer={draft?.buffer} active={recording} level={level}/><div className="record-actions"><button className={`record-button ${recording ? 'stop' : ''}`} disabled={busy || !ready} onClick={() => recording ? recorder.current?.stop() : void record()}>{recording ? <Square size={16} fill="currentColor"/> : <Mic size={18}/>} {recording ? 'Stop recording' : draft ? 'Record again' : 'Start recording'}</button><span>or</span><button className="record-import" disabled={busy || recording || !ready} onClick={() => fileInput.current?.click()}><ArrowUpFromLine size={16}/> Import audio</button></div><p className="record-hint">WAV, MP3, OGG or WebM · up to 25 MB · trim to 15 seconds</p></section>
        {draft && <section className="draft-editor"><div className="draft-name"><label>Give it a name<input aria-label="Sound name" value={draft.name} maxLength={60} onChange={e => setDraft({ ...draft, name: e.target.value })}/></label><button className="secondary" onClick={() => void previewDraft()}><Play size={15}/> Preview</button><button className="primary" disabled={saving || !draft.name.trim() || draft.end - draft.start < 0.1} onClick={() => void saveDraft()}><Plus size={16}/>{saving ? 'Saving…' : 'Save sound'}</button></div><div className="trim-sliders"><Slider label="Trim start" value={Number(draft.start.toFixed(2))} min={0} max={Math.max(0, draft.buffer.duration - 0.1)} step={0.01} suffix="s" onChange={v => setDraft({ ...draft, start: v, end: Math.min(draft.buffer.duration, Math.max(v + 0.1, Math.min(draft.end, v + 15))) })}/><Slider label="Trim end" value={Number(draft.end.toFixed(2))} min={draft.start + 0.1} max={Math.min(draft.buffer.duration, draft.start + 15)} step={0.01} suffix="s" onChange={v => setDraft({ ...draft, end: v })}/></div><p className="caption">Pitch in Tuning applies at playback. Original recordings stay unchanged.</p></section>}
        <section className="library"><div className="section-heading"><div><h2>Made by you <span>{clips.length.toString().padStart(2, '0')}</span></h2><p>Your personal reaction collection.</p></div><div className="button-group"><button className="text-button" disabled={blocked} onClick={() => window.tapback.importPack().then(result => { if (result) { setClips(result); notify('Sound pack imported.'); } }).catch(fail)}><ArrowDownToLine size={14}/> Import pack</button><button className="text-button" disabled={!clips.length || blocked} onClick={() => window.tapback.exportPack().then(ok => { if (ok) notify('Your sound pack is ready to share.'); }).catch(fail)}><ArrowUpFromLine size={14}/> Export pack</button></div></div>{!clips.length ? <div className="empty-library"><Music2 size={28}/><strong>A blank canvas. A very loud future.</strong><p>Your recordings and imported sounds will live here.</p></div> : <div className="clip-list">{clips.map(clip => <div className="clip-row" key={clip.id}><button aria-label={`Preview ${clip.name}`} className="clip-play" disabled={blocked} onClick={() => void reactToTap(0.6, clip.id, true)}><Play size={14}/></button><input className="clip-name" aria-label={`Rename ${clip.name}`} defaultValue={clip.name} maxLength={60} onBlur={e => { if (e.target.value.trim()) void updateClip(clip, { name: e.target.value }); else e.target.value = clip.name; }} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}/><span className="clip-duration">{format(clip.duration)}</span><button className={`in-mix ${clip.enabled ? 'included' : ''}`} onClick={() => void updateClip(clip, { enabled: !clip.enabled })} aria-label={`${clip.enabled ? 'Exclude' : 'Include'} ${clip.name}`}>{clip.enabled ? <Check size={12}/> : <Minus size={12}/>} {clip.enabled ? 'In the mix' : 'Excluded'}</button><button className="icon-button delete" aria-label={`Delete ${clip.name}`} onClick={() => void removeClip(clip)}><Trash2 size={15}/></button></div>)}</div>}</section>
      </>}
      {page === 'tuning' && <>
        <p className="page-description">Dial in the drama. Keep the taps gentle.</p><div className="tuning-grid"><section className="settings-card"><div className="card-heading"><Radio size={20}/><h2>Find your rhythm</h2></div><label className="select-label">How should TapBack listen?<select aria-label="Detection input" value={settings.source} disabled={recording || busy} onChange={e => void changeSource(e.target.value)}><option value="microphone">Microphone · broad compatibility</option><option value="sensor">Motion sensor · compatible laptops</option><option value="manual">Manual · test pad & shortcut</option></select></label><p className="helper">{settings.source === 'microphone' ? 'Detects short acoustic transients. Voices, claps, and typing can also trigger it. Nothing is recorded or saved in this mode.' : settings.source === 'sensor' ? 'Checks your built-in accelerometer. Mac access is experimental and can be restricted. Windows hardware must expose a sensor.' : 'No microphone or sensor needed. Perfect for a quick soundboard moment.'}</p><div className="input-meter"><span>LIVE INPUT</span><div><i style={{ width: `${level * 100}%` }}/></div><b>{Math.round(level * 100)}%</b></div><Slider label="Sensitivity" value={settings.sensitivity} min={1} max={100} suffix="%" onChange={v => changed({ sensitivity: v })}/><div className="range-ends"><span>Fewer triggers</span><span>Lighter taps</span></div><Slider label="Time between reactions" value={settings.cooldown} min={250} max={3000} step={50} suffix=" ms" onChange={v => changed({ cooldown: v })}/><button className="secondary full-width" disabled={blocked || calibrating || settings.source === 'manual'} onClick={() => void calibrate()}><Settings2 size={16}/>{calibrating ? 'Keep still for 3 seconds…' : 'Calibrate ambient noise'}</button></section>
          <section className="settings-card"><div className="card-heading"><Headphones size={20}/><h2>Sound & personality</h2></div><Slider label="Volume" value={settings.volume} min={0} max={100} suffix="%" onChange={v => changed({ volume: v })}/><Slider label="Pitch" value={settings.pitch} min={-12} max={12} suffix=" semitones" onChange={v => changed({ pitch: v })}/><div className="pitch-presets"><button onClick={() => changed({ pitch: -7 })}>Tiny monster</button><button onClick={() => changed({ pitch: 0 })}>Original</button><button onClick={() => changed({ pitch: 7 })}>Chipmunk</button></div><p className="helper">Pitch also changes playback speed. Lower is longer; higher is shorter.</p><Toggle label="A little surprise" detail="Shuffle sounds without repeating the last one." checked={settings.shuffle} onChange={v => changed({ shuffle: v })}/><Toggle label="Match the energy" detail="Gentle taps get softer reactions." checked={settings.dynamics} onChange={v => changed({ dynamics: v })}/><Toggle label="A happy little bounce" detail="Animate your laptop buddy on each reaction." checked={settings.visual} onChange={v => changed({ visual: v })}/></section>
          <section className="settings-card wide"><div className="card-heading"><Monitor size={20}/><h2>A good desktop citizen</h2></div><div className="desktop-settings"><div><Toggle label="Quiet hours" detail="Mute reactions from 10 PM to 8 AM, local time." checked={settings.quiet} onChange={v => changed({ quiet: v })}/><Toggle label="Open at login" detail="Start paused, ready in your menu bar or tray." checked={settings.launchAtLogin} onChange={v => changed({ launchAtLogin: v })}/></div><div className="shortcut-list"><div><span>Play a reaction</span><kbd>{shortcutPrefix} Alt T</kbd></div><div><span>Quick mute</span><kbd>{shortcutPrefix} Alt M</kbd></div><div><span>Pause / listen</span><kbd>{shortcutPrefix} Alt P</kbd></div>{info && Object.values(info.shortcuts).some(v => !v) && <p className="helper">A shortcut is in use by another app. Use the tray controls instead.</p>}</div></div></section>
        </div>
      </>}
      {page === 'about' && <><div className="about-hero"><span className="brandmark large"><AudioLines size={38}/></span><h2>A little more play<br/>in your every day.</h2><p>TapBack turns a gentle tap into an original sound effect.<br/>Made for Mac, Windows, and your particular brand of weird.</p></div><div className="about-grid"><section className="settings-card"><ShieldCheck/><h3>Private by default</h3><p>No accounts, analytics, ads, or cloud uploads. Microphone listening analyzes levels in memory; only recordings you choose to save become files.</p></section><section className="settings-card"><Hand/><h3>All you need is a gentle tap</h3><p>The name is an invitation to play, not a strength test. A light tap on the desk near your microphone works too. The test pad is always an option.</p></section><section className="settings-card"><Monitor/><h3>Hardware, honestly</h3><p>Native sensor support depends on your device and system permissions. Microphone mode works more broadly, but may react to other sharp sounds. Use Tuning to calibrate.</p></section><section className="settings-card"><Heart/><h3>Original sounds. Your rules.</h3><p>Nine playful effects are synthesized by TapBack. Record or import your own comedic reactions, then share a personal pack. No SlapMac audio is bundled.</p></section></div><div className="about-footer"><span>{stats.total} lifetime reactions · best combo {stats.best}×</span><span>TapBack v{info?.version || '0.1.0'} · MIT licensed</span></div></>}
      <footer><span className={`status-dot ${listening ? 'live' : ''}`}/><span>{recording ? 'Recording in progress. Detection is paused.' : status}</span><span className="footer-right">{settings.mute ? <><VolumeX size={12}/> MUTED</> : isQuietNow(settings.quiet) ? 'QUIET HOURS' : <><ShieldCheck size={12}/> ALL LOCAL</>}</span></footer>
    </main><input ref={fileInput} type="file" accept="audio/wav,audio/mpeg,audio/ogg,audio/webm,audio/mp4,.wav,.mp3,.ogg,.webm,.m4a" hidden onChange={e => void importAudio(e.target.files?.[0])}/>{notice && <div role="status" className="toast"><Check size={16}/>{notice}<button aria-label="Dismiss notification" onClick={() => setNotice('')}><X size={14}/></button></div>}
  </div>;
}
