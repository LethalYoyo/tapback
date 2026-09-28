import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
if (process.platform !== 'darwin') throw new Error('Mac packaging requires macOS.');
const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const app = 'release/mac-universal/TapBack.app';
// Development-only ad-hoc signing. For distribution, replace this with Developer
// ID signing + hardened runtime + notarization using your own credentials.
execFileSync('codesign', ['--force', '--deep', '--options=0', '--entitlements', 'native/entitlements.mac.plist', '--sign', '-', app], { stdio: 'inherit' });
execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
execFileSync('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', app, `release/TapBack-${version}-mac-universal.zip`], { stdio: 'inherit' });
