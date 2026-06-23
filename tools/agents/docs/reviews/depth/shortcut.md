# Depth Review: @flighthq/shortcut

**Domain**: Global OS hotkey (system-wide accelerator) registration.

**Verdict**: stub — completeness **28/100**.

`@flighthq/shortcut` is a thin command-style platform seam: 7 free functions over a 4-method `ShortcutBackend` interface (`register` / `unregister` / `unregisterAll` / `isRegistered`), with a web no-op default and a native host adapter (`createElectronShortcutBackend`). It is a faithful, correctly-shaped _seam_, but it is not, by itself, an authoritative hotkey library — it owns no domain logic at all. Every accelerator is an opaque `string` passed straight through to the backend.

## Present capabilities

- `registerGlobalShortcut(accelerator, handler): boolean` — register a system hotkey, sentinel `false` when unsupported (web) or on failure.
- `unregisterGlobalShortcut(accelerator): boolean` — unregister one accelerator.
- `unregisterAllGlobalShortcuts(): void` — clear all.
- `isGlobalShortcutRegistered(accelerator): boolean` — query registration state.
- Backend seam: `getShortcutBackend` / `setShortcutBackend(backend | null)` / `createWebShortcutBackend`, matching the platform-suite command-capability pattern. Web backend guards every call and returns sentinels (`false` / no-op) instead of throwing.
- The `ShortcutBackend` contract lives in `@flighthq/types` (correct header-layer placement); `@flighthq/host-electron` provides the real `globalShortcut` adapter.
- Tests cover all seven functions plus the web-sentinel behavior — colocated and alphabetized.

This is the complete register/unregister/query/clear quartet, which is the _minimum_ viable surface (and matches Electron's `globalShortcut` surface almost 1:1). For pure delegation it is correct and well-documented.

## Gaps vs an authoritative hotkey library

The accelerator itself — the heart of the domain — is entirely unmodeled. A mature, canonical hotkey library is expected to own the accelerator vocabulary and the logic around it:

- **Accelerator parsing / normalization.** No `parseAccelerator` / `normalizeAccelerator` to turn `"Ctrl+Shift+K"`, `"control+shift+k"`, `"Cmd-K"` into one canonical form. Two strings that mean the same chord are treated as distinct keys. This is the single biggest gap — the library has no notion of _what an accelerator is_, only that it is a string.
- **Accelerator structure / type.** No `Accelerator` type or `ParsedAccelerator { modifiers, key }` — no `Modifier` enum (Ctrl/Cmd/Alt/Shift/Meta/Super) and no key-name vocabulary. Everything is `string`.
- **Validation.** No `isValidAccelerator` / `isAcceleratorValid`. Callers cannot tell a malformed accelerator from an unsupported one before registering; both just return `false`.
- **Platform resolution & display.** No `CmdOrCtrl` resolution helper and no `formatAcceleratorForDisplay` / `getAcceleratorLabel` to render a chord for menus per-platform (⌘⇧K on macOS vs Ctrl+Shift+K on Windows). Menu/tray integration in the suite needs exactly this.
- **Conflict / collision detection.** No `hasAcceleratorConflict` / `getRegisteredShortcuts` — cannot enumerate what is registered or detect that a chord is already taken (only a yes/no probe of one known string).
- **Enable / disable / suspend.** No way to temporarily disable a shortcut or suspend/resume all global shortcuts (common when a modal/textfield has focus) without fully unregistering and losing the handler.
- **Event payload.** The handler is a bare `() => void`. No `ShortcutEvent { accelerator, ... }`, so a single handler bound to several accelerators cannot tell which fired.
- **Sequence / chord shortcuts.** No multi-key sequences (`"g then i"`) — beyond OS-level scope but part of an exhaustive hotkey library; reasonably _out of scope_ for a _global OS_ hotkey seam.
- **Application-scoped (non-global) hotkeys.** In-app key-binding maps belong to `@flighthq/input`, not here — correctly **missing-by-design**.

Of these, parsing/normalization, validation, an `Accelerator`/modifier type, display formatting, and conflict/enumeration are missing-by-omission and are what separate a stub from an authoritative library. Sequence chords and in-app bindings are arguably missing-by-design for an OS-global seam.

## Naming / API-shape notes

- Function names are correct per the project rules: full unabbreviated type word (`registerGlobalShortcut`, not `register`), globally self-identifying, alphabetized, command-capability seam (`get*`/`set*`/`createWeb*Backend`) consistent with siblings.
- `accelerator: string` is the weak spot: the canonical name is right, but its _type_ should be a modeled `Accelerator` (or at least have parse/validate/format helpers) defined in `@flighthq/types`. As written, the type system gives no help with the actual content of a hotkey.
- The web sentinel discipline (`false` / no-op, never throw) is exactly right.
- No `dispose*`; the unregister-all path is the teardown, which is appropriate here.

## Recommendation

Treat the register/unregister/query/clear seam as done and keep it — that part is solid. To reach AAA depth for this domain, add the accelerator-logic layer that the seam currently lacks: a `Accelerator` / `Modifier` model and `parseAccelerator` / `normalizeAccelerator` / `isValidAccelerator` / `formatAcceleratorForDisplay` (with `CmdOrCtrl` resolution) in `@flighthq/types` + this package, plus `getRegisteredGlobalShortcuts` enumeration and a `ShortcutEvent` payload so one handler can serve several accelerators. Optionally an enable/disable (suspend) pair. Sequence chords and in-app bindings can stay out of scope. Until the accelerator is more than an opaque string, this is an authoritative _seam_ but a stub of a _library_.
