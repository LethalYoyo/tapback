# TapBack 0.1.0 — first preview

A little tap. A lot of personality. TapBack is a local-first sound toy for macOS and Windows, with custom recording and original effects.

## Included

- Nine synthesized effects in three themed sound packs.
- Record, import, trim, preview, rename, and organize personal reactions.
- Import/export portable sound packs.
- Microphone transient detection, experimental native accelerometer adapters, and manual triggers.
- No-repeat shuffle, pitch presets, intensity-sensitive volume, animated reactions, and combo counters.
- Menu bar/system tray controls, global shortcuts, quiet hours, and optional login launch.
- Complete source, research notes, tests, and a Mac/Windows build workflow.

## Downloads

- `TapBack-0.1.0-mac-universal.zip`: macOS 13+, Apple Silicon and Intel. Extract and open `TapBack.app`.
- `TapBack-0.1.0-win-x64.zip`: Windows 10/11 x64. Extract the entire archive and open `TapBack.exe`.
- `TapBack-source.zip`: standalone source archive, including documentation and tests.
- `SHA256SUMS.txt`: checksums for the supplied archives.

These are development builds: the Mac app is ad-hoc signed and not notarized; Windows is unsigned. The operating system may require explicit approval to open them.

## Verification and limits

13 automated tests and 16 packaged Mac desktop checks passed. Live Mac accelerometer streaming was verified. Recording tests used a synthetic microphone. Windows was cross-built but has not been run on a Windows machine, and Intel Mac execution has not been tested. Physical tap accuracy across devices remains unverified.

Native sensing depends on hardware and permissions. Microphone mode can react to voices, claps, or keyboard noise. Start with a gentle desk tap, adjust sensitivity, or use the manual pad. No accounts, telemetry, uploads, or proprietary SlapMac sounds are included.

See `docs/VALIDATION.md` and `docs/RESEARCH.md` for the evidence and remaining production-release work.
