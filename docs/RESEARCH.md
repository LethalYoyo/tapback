# TapBack: research and implementation decisions

Research date: September 28, 2026. Marketing claims about universal sensor compatibility were not treated as engineering guarantees.

## What makes a SlapMac-like app possible?

SlapMac and related apps turn an impact signal into a sound reaction. The difficult cross-platform part is obtaining a trustworthy input signal; playback and customization are straightforward.

The original [apple-silicon-accelerometer project](https://github.com/olvvier/apple-silicon-accelerometer) documents an undocumented Apple SPU HID path. Its README describes vendor usage page `0xFF00`, accelerometer usage `3`, and a 22-byte report with signed Q16 acceleration at offsets 6, 10, and 14. It explicitly describes restricted access, limited tested hardware, and incompatible machines. This is experimental hardware access, not a supported public macOS accelerometer API. TapBack's small C adapter implements that documented report format and declines access cleanly when the OS blocks it. It does not make universal MacBook claims.

On Windows, Microsoft's [Accelerometer.GetDefault documentation](https://learn.microsoft.com/en-us/uwp/api/windows.devices.sensors.accelerometer.getdefault?view=winrt-26100) says the method can return null when no integrated sensor exists. Its [accelerometer guide](https://learn.microsoft.com/en-us/windows/apps/develop/devices-sensors/use-the-accelerometer) describes report intervals and reading acceleration values. TapBack's adapter requests the available reporting rate and checks for stale data. Our inference: native accelerometers alone cannot provide a generally usable Windows product, so a microphone fallback is necessary.

## Why microphone and manual modes?

Microphones are much more broadly available. Short percussive sounds tend to have sharp onsets and high peak-to-average ratios, so TapBack uses those features together with an adaptive ambient floor and cooldown. This is a transparent heuristic, not trained AI, and it cannot reliably distinguish every slap from speech, clapping, keyboard noise, or other transients. Users can adjust sensitivity and calibrate in their room. The manual pad provides an immediate, deterministic interaction and lets users enjoy the app without microphone access.

An AudioWorklet sends low-volume RMS/peak statistics instead of copying continuous audio into the UI. AudioWorklet runs on the audio rendering thread; see [MDN's AudioWorklet documentation](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet). This choice avoids depending on visual animation callbacks that can be throttled when a window is hidden. Only explicit recording keeps audio samples for a user-authored clip.

## Recording and sound ownership

[MediaRecorder](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder) supplies the capture API. TapBack records a short local take, decodes it for waveform preview and trimming, and stores a normalized PCM container format. Sound effects are nine independently synthesized arcade/cartoon/space reactions. Users can record their own comedic sighs, voices, or other reactions; no competitor sound library is copied. The saved sound remains at original pitch; pitch presets are playback effects.

## Desktop architecture

Electron offers [tray/menu bar integration](https://www.electronjs.org/docs/latest/api/tray) across both target platforms and lets the shared UI use the same audio engine. Its cost is a larger package and higher baseline memory use than native Swift/C# apps. This tradeoff makes a consistent, testable first version practical. Native sensor helpers remain narrow and replaceable.

The app applies [Electron's security guidance](https://www.electronjs.org/docs/latest/tutorial/security): isolated preload, sandboxed renderer, no Node access in the UI, constrained permissions, IPC sender validation, local assets, navigation restrictions, and a dedicated application protocol. [Electron's systemPreferences API](https://www.electronjs.org/docs/latest/api/system-preferences) supplies the macOS microphone permission request. The app does not browse remote content or execute user-supplied scripts.

## Designed extras

1. **Your own voice first:** record, import, trim, preview, rename, and include/exclude clips.
2. **Portable packs:** export one file; validate an entire import before mutating the library.
3. **Variety:** no-repeat shuffle, pitch presets, and volume that follows relative tap strength.
4. **Playful feedback:** a reactive laptop character, session counts, expiring combos, and lifetime best.
5. **Good background behavior:** tray controls, optional login launch, sleep/lock pause, quiet hours, and global quick mute.
6. **Feedback suppression:** block the detector during playback and a release tail; respect cooldown.
7. **Honest capability reporting:** identify permission denial and absent sensors instead of presenting a simulated sensor as working hardware.

## Remaining work before a public production release

- Test the Windows build on actual Windows 10/11 hardware, with and without sensors; verify managed-device script policies.
- Collect opt-in labeled recordings and accelerometer traces across devices and rooms to quantify false-positive/false-negative rates. No accuracy percentage is claimed today.
- If reliable privileged Mac sensor access is required, design and audit a separately signed, narrowly scoped helper using Apple's service-management system. This build intentionally does not install one.
- Developer ID signing/notarization on Mac and Authenticode signing on Windows; installation, upgrade, and uninstall testing.
- Measure background CPU, memory, battery consumption, and wake/sleep behavior on supported machines.
- Verify real microphone permission prompts, denied permissions, device disconnects, audio routing, Bluetooth devices, and OS privacy settings on each platform.

The final packaged Mac test verified live SPU readings (138 readings in 1.2 seconds), in addition to the application workflows. An earlier restricted-shell probe exercised access denial. This release is a functional first version, with Windows packaging provided for validation. It is not a universal hardware-compatibility or production-readiness claim.
