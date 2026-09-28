import { execFileSync } from 'node:child_process';
if (process.platform === 'darwin') {
  const sdk = process.env.SDKROOT ? ['-isysroot', process.env.SDKROOT] : [];
  execFileSync('clang', [...sdk, '-O2', '-Wall', '-Wextra', '-arch', 'arm64', '-arch', 'x86_64', '-mmacosx-version-min=12.0', 'native/mac-sensor.c', '-framework', 'IOKit', '-framework', 'CoreFoundation', '-o', 'native/tapback-sensor'], { stdio: 'inherit' });
  execFileSync('codesign', ['--force', '--sign', '-', 'native/tapback-sensor'], { stdio: 'inherit' });
}
