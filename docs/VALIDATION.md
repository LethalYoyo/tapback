# Validation record

Date: September 28, 2026. Version: 0.1.0.

## Passed locally

- TypeScript validation and Vite production build.
- C sensor helper built as a universal arm64/x86_64 binary.
- 13 automated unit/integration tests covering detector noise rejection, impulse detection, sensitivity, cooldown, playback suppression, calibration, gravity removal, shuffle, combos, quiet hours, settings validation, WAV validation, persistence, and atomic pack import.
- Packaged universal Mac app launched successfully under the ordinary user account.
- 16 desktop smoke checks: application load, manual reaction, pack selection, sound preview, audio import, trimmed WAV save, include/exclude controls, recording, saved recordings, pack export/import through IPC, microphone start/pause, hidden-window microphone processing, ambient calibration, native capability response, mute, and settings written to disk.
- Recording tests used Chromium's synthetic audio device. Saved PCM contained nonzero audio (observed peak 32,731); no personal microphone audio was captured for automated tests.
- Native Mac sensor helper returned a sustained stream: 138 readings over a 1.2-second check. This used the real sensor, not a mock. A restricted-shell invocation separately demonstrated the unavailable/permission-denied path.
- No renderer exceptions during the packaged smoke run.
- Mac app signature passed `codesign --verify --deep --strict`. The signature is ad-hoc, not Developer ID/notarized.
- Windows x64 ZIP assembled successfully on Mac. It contains a PE executable, Electron resources, frontend bundle, preload/main code, and the PowerShell sensor adapter.

## Not validated

- Running on an actual Windows machine or an Intel Mac.
- Actual physical-tap accuracy, false-positive rates, or sensor coverage across models.
- Real microphone permission prompts or live room audio quality; tests used a synthetic audio device and bypassed the OS permission prompt in the test process only.
- Windows motion sensors or enterprise PowerShell policy.
- Login launch, all sleep/lock combinations, long-duration battery use, Bluetooth routing, or all global-shortcut conflicts.
- Notarization, trusted-publisher signing, automatic updates, or distribution through app stores.

The included CI workflow can build on Mac and Windows when placed in a GitHub repository. It was not uploaded or run remotely during this task.

Machine-readable packaged smoke results are in `smoke-report.json`. They are evidence for this particular run, not a promise of compatibility on other devices.
