import { spawn } from 'node:child_process';
import electron from 'electron';
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { stdio: 'inherit' });
let app;
function stop() { app?.kill(); vite.kill(); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
for (let i = 0; i < 100; i++) {
  try { await fetch('http://127.0.0.1:5173'); break; } catch { await new Promise(r => setTimeout(r, 100)); }
}
app = spawn(electron, ['.'], { stdio: 'inherit', env: { ...process.env, TAPBACK_DEV: '1' } });
app.on('exit', () => { vite.kill(); process.exit(); });
