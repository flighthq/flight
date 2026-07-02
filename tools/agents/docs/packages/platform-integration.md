# Platform Integration Suite — Shared Charter Principles

Blessed 2026-07-02. These apply to every package in the platform integration suite unless a per-package charter overrides.

## Pattern

Flat free functions over a swappable `*Backend`. Web backend is always available as the default; native hosts replace via `set*Backend`.

- **Command capabilities**: `get*Backend` / `set*Backend` / `createWeb*Backend`.
- **Event capabilities**: signal entity with `create*` / `attach*` / `detach*` / `dispose*`.
- Web backends return sentinels rather than throwing.
- `"sideEffects": false` — no registration at import.

## Shared decisions

- **[2026-07-02] TS is the spec; Rust conforms in parity passes later.** Global posture.
- **[2026-07-02] Signal opt-in convention should be enforced.** Use `enable*Signals` gates — do not eagerly allocate signals in `create*` functions. Packages violating this should be fixed.
- **[2026-07-02] Naming matches the subject, not the package.** Function names use the full, unabbreviated subject name. If the subject is "geolocation," use `Geolocation*`, not `Geo*`. If the subject is "shell," use `Shell*` consistently.
- **[2026-07-02] Types are present (false alarm pattern).** The depth reviews scored low (30-58) because they ran against a stale integration branch missing types. The types are present in current `@flighthq/types`. Review scores should be re-evaluated.

## Packages in the suite

OS/device: platform, screen, device, storage, network, power, lifecycle, keyboard, sensors. UI/shell: clipboard, dialog, filesystem, notification, shell, menu, tray, shortcut, share, haptics. Location/media: geolocation, webcam, statusbar. App/process: app, protocol, updater, ipc. Host: host-electron. Utility: useragent (pure parsing, no backend).
