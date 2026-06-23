# Maturation Roadmap: @flighthq/shortcut

**Current verdict**: stub — completeness 28/100. A correct, well-shaped command-style platform seam (register/unregister/query/clear over a swappable `ShortcutBackend`), but it owns no domain logic: every accelerator is an opaque `string` passed straight through.

The seam itself (`registerGlobalShortcut` / `unregisterGlobalShortcut` / `unregisterAllGlobalShortcuts` / `isGlobalShortcutRegistered`, plus `get*`/`set*`/`createWeb*Backend`) is done and should be kept. Maturation is entirely about adding the **accelerator-logic layer** the seam currently lacks, plus enumeration, eventing, and platform display. The three tiers below are cumulative and target the accelerator model first because nearly everything else depends on it.

## Bronze

The minimum genuinely-useful version: model the accelerator so the type system describes a hotkey, and stop treating two strings that mean the same chord as distinct keys.

Define types in `@flighthq/types` first (`Shortcut.ts`):

- `ShortcutModifier` — `*Kind`-style string identifiers, one per file-local const: `'Control'`, `'Alt'`, `'Shift'`, `'Meta'`, `'Super'`, plus the platform-resolving `'CommandOrControl'`. These are plain string constants (vendor-prefixable later), not an enum.
- `Accelerator` — the canonical string form (kept as the wire/registry/serialized type, e.g. `'Control+Shift+K'`), documented as "always normalized".
- `ParsedAccelerator { readonly modifiers: readonly ShortcutModifier[]; readonly key: string }` — the structured form. Plain data, `Readonly`.

Functions in `@flighthq/shortcut` (free functions, alphabetized):

- `parseAccelerator(accelerator: string, out: ParsedAccelerator): ParsedAccelerator | null` — parse `"Ctrl+Shift+K"`, `"control+shift+k"`, `"Cmd-K"` into modifiers + key. Returns `null` (sentinel) on malformed input; writes into `out` (explicit allocation discipline). Provide `createParsedAccelerator()` for the `out` value.
- `normalizeAccelerator(accelerator: string): Accelerator | null` — collapse the variants above to one canonical string (fixed modifier order, canonical key casing/names). Returns `null` when unparseable. This is the single highest-value addition: it makes registration and the registry key consistent.
- `isAcceleratorValid(accelerator: string): boolean` — distinguish a malformed accelerator from an unsupported one _before_ registering (today both just return `false`).
- Wire normalization into `registerGlobalShortcut` / `unregisterGlobalShortcut` / `isGlobalShortcutRegistered` so callers can pass any accepted spelling and hit the same registry slot.

Effort: small–moderate. No backend changes, no host changes. Pure value logic + tests. The bulk is the modifier/key-name vocabulary table and round-trip tests (parse→normalize→parse).

## Silver

Competitive with a good hotkey library: platform-correct display, enumeration, conflict detection, and an event payload so one handler can serve several chords.

Types in `@flighthq/types`:

- `ShortcutEvent { readonly accelerator: Accelerator }` — passed to the handler so a handler bound to multiple accelerators can tell which fired. Change the handler signature to `(event: Readonly<ShortcutEvent>) => void` and thread it through `ShortcutBackend.register`.
- Extend `ShortcutBackend` with `getRegistered(): readonly string[]` (enumeration) so the seam can report what is actually held, not just yes/no probe one known string.

Functions in `@flighthq/shortcut`:

- `formatAcceleratorForDisplay(accelerator: string, out?: ...): string` — render a chord per-platform for menus/tray (`⌘⇧K` on macOS, `Ctrl+Shift+K` on Windows/Linux). Drives the existing `@flighthq/menu` / `@flighthq/tray` accelerator labels.
- `getAcceleratorModifierLabel(modifier: ShortcutModifier): string` and `getAcceleratorKeyLabel(key: string): string` — the per-token building blocks `formatAcceleratorForDisplay` composes (also reusable by menu/tray directly).
- `resolveCommandOrControlModifier(): ShortcutModifier` — resolve `'CommandOrControl'` to `'Meta'` on macOS, `'Control'` elsewhere (reads `@flighthq/platform`). Used by both normalize and display.
- `getRegisteredGlobalShortcuts(): readonly Accelerator[]` — enumerate everything registered (over the new backend method).
- `hasGlobalShortcutConflict(accelerator: string): boolean` — true when the (normalized) chord is already registered. Cheap layer over enumeration; the honest answer to "is this taken" that the single-probe `isRegistered` can't give for unknown chords.

Backend/host:

- Implement `getRegistered` + the `ShortcutEvent` handler in `createWebShortcutBackend` (still all sentinels: `[]`, no fire) and in `createElectronShortcutBackend` (`@flighthq/host-electron`).

Effort: moderate. `formatAcceleratorForDisplay` + the macOS symbol table is the largest piece; the `ShortcutEvent` change is a one-time backend-contract churn (do it before host-electron grows more callers). Depends on `@flighthq/platform` for OS detection.

## Gold

Authoritative for the OS-global-hotkey domain: every edge case, enable/disable without losing the handler, full key-name coverage, robust validation diagnostics, and 1:1 Rust parity.

Types in `@flighthq/types`:

- `ShortcutKeyName` vocabulary — the canonical, exhaustive named-key set (function keys `F1`–`F24`, `Plus`, `Space`, `Tab`, `Escape`, arrows, `PageUp`/`PageDown`, `Home`/`End`, numpad keys, media keys `MediaPlayPause`/`MediaNextTrack`/`VolumeUp`, etc.), each a string const, vendor-prefixable for custom keys. Documented as the single source of key spellings shared with `@flighthq/input`.
- `AcceleratorParseError` as a returned sentinel-companion (not a thrown type): `parseAcceleratorDetailed(accelerator, out): ParsedAccelerator | AcceleratorParseError` reporting _why_ (`'unknown-modifier'` / `'unknown-key'` / `'empty'` / `'duplicate-modifier'`) — keeping the plain `parseAccelerator` returning `null` for the common path.

Functions in `@flighthq/shortcut`:

- `enableGlobalShortcut(accelerator): boolean` / `disableGlobalShortcut(accelerator): boolean` / `suspendAllGlobalShortcuts(): void` / `resumeAllGlobalShortcuts(): void` — temporarily silence a shortcut (modal/textfield focus) without unregistering and losing the handler. Requires `ShortcutBackend.setEnabled(accelerator, enabled)` + `setAllEnabled(enabled)` and host support (Electron has no native disable, so the adapter holds the handler and gates dispatch).
- `getAcceleratorModifiers(accelerator, out): readonly ShortcutModifier[] | null` and `getAcceleratorKey(accelerator): string | null` — convenience accessors over the parsed form for menu/tray and conflict UIs.
- `areAcceleratorsEqual(a: string, b: string): boolean` — normalized chord equality (the precise primitive `hasGlobalShortcutConflict` and dedup should use).
- `enableGlobalShortcutSignals()` (`@flighthq/signals`) — opt-in signal group emitting `ShortcutEvent` on every trigger and registration-change notifications, for consumers that want loose multi-listener dispatch on top of the direct handler.

Quality / coverage:

- Exhaustive parse/normalize/format tests across all modifiers + the full key-name table, including alias spellings (`Cmd`/`Command`/`Meta`, `Ctrl`/`Control`, `Option`/`Alt`, `Win`/`Super`), order-insensitivity, and aliased `out` cases for every out-param function.
- `formatAcceleratorForDisplay` golden tables for macOS / Windows / Linux.
- A `@flighthq/host-electron` integration path test (fake `globalShortcut`) covering enable/disable gating and `getRegistered`.

Rust parity (`flighthq-shortcut`, crate already exists):

- Mirror `ShortcutModifier` (const `KindId`-style), `ParsedAccelerator`, `ShortcutEvent`, and `parse_accelerator` / `normalize_accelerator` / `is_accelerator_valid` / `format_accelerator_for_display` / `get_registered_global_shortcuts` / `has_global_shortcut_conflict` as free functions with `&mut out` params and `Option` sentinels. The accelerator _value logic_ is a mixable, headlessly-testable leaf (no GPU, no graph) and should be conformance-fingerprinted against the TS implementation. The backend seam stays native-host-supplied (winit/SDL global hotkeys), web is sentinel-only.

Effort: moderate–large, dominated by the exhaustive key-name table + cross-platform display goldens and the enable/disable host plumbing (which has no native Electron primitive).

## Sequencing & effort

1. **Bronze first, in order: `@flighthq/types` model → parse/normalize/validate → wire normalization into the existing four functions.** This is the keystone — silver and gold conflict detection, display, and enumeration all assume a canonical accelerator. Self-contained; no host or backend changes; ship independently.
2. **Silver `ShortcutEvent` handler-signature change before host-electron accrues more callers.** It is a `ShortcutBackend` contract churn touching `@flighthq/types`, both backends, and the host adapter — cheapest to do early. Pair it with the `getRegistered` backend method so enumeration/conflict land together.
3. **Silver display (`formatAcceleratorForDisplay` + `resolveCommandOrControlModifier`)** after the model exists; it unblocks accelerator labels in `@flighthq/menu` and `@flighthq/tray`, which today have no way to render a chord per-platform.
4. **Gold enable/disable + signals + Rust parity last**, once the value layer is stable and worth fingerprinting.

Cross-package dependencies:

- **`@flighthq/platform`** — needed by `resolveCommandOrControlModifier` and `formatAcceleratorForDisplay` for OS detection (Silver). Confirm `platform` exposes an OS/macOS query before starting Silver.
- **`@flighthq/menu` / `@flighthq/tray`** — consumers of `formatAcceleratorForDisplay` / `getAcceleratorModifierLabel`. Decide whether those packages call shortcut's formatter or duplicate it; the formatter belongs here (shortcut owns the accelerator domain). **Surface as a design decision**: shortcut would then be a (light) dependency of menu/tray, or the key-name vocabulary moves to `@flighthq/types` and both depend only on the header layer.
- **`@flighthq/input`** — shares the key-name vocabulary. Surface whether `ShortcutKeyName` (Gold) and input's key names should be one shared `@flighthq/types` table to avoid two spellings of the same physical key. This is an architecture decision, not autonomous work.
- **`@flighthq/host-electron`** — must implement the extended `ShortcutBackend` (`getRegistered`, `ShortcutEvent`, `setEnabled`). Electron has no native per-shortcut disable, so enable/disable is adapter-held gating; flag this expectation.

Out of scope (missing-by-design, do not build): multi-key **sequence chords** (`"g then i"`) and **application-scoped / in-app key-binding maps** — the latter belong to `@flighthq/input`, not this OS-global seam.
