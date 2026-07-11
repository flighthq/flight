---
package: '@flighthq/shortcut'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# shortcut — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/shortcut

**Session dates**: 2026-06-24 (pass 1), 2026-06-24 (pass 2) **Starting score**: 28/100 (stub) **Estimated score after pass 2**: 93/100 (gold)

## Implemented APIs

### Types added to `@flighthq/types/src/Shortcut.ts`

- `Accelerator` (type alias `string`) — normalized accelerator string; documented as always normalized.
- `ShortcutModifier` (union type) — `'Alt' | 'CommandOrControl' | 'Control' | 'Meta' | 'Shift' | 'Super'`
- `ShortcutKeyName` (union type) — exhaustive named-key vocabulary: letters, digits, F1–F24, arrows, navigation, editing, numpad, punctuation/symbols, media, lock/utility. Documented as shared with `@flighthq/input`.
- `ParsedAccelerator` interface — `{ readonly key: string; readonly modifiers: readonly ShortcutModifier[] }`
- `AcceleratorParseError` interface — `{ readonly reason: ...; readonly token: string }` with reasons: `duplicate-modifier | empty | missing-key | unknown-key | unknown-modifier`
- `ShortcutEvent` interface — `{ readonly accelerator: Accelerator }` — fired on trigger, enables single-handler-for-multiple-accelerators pattern.
- `ShortcutBackend` extended with: `getRegistered()`, `setEnabled(accelerator, enabled)`, `setAllEnabled(enabled)`. Handler signature: `(event: Readonly<ShortcutEvent>) => void`.

### Types added to `@flighthq/types/src/ShortcutSignals.ts` (pass 2)

- `ShortcutSignals` interface — `{ onTrigger: Signal<(event: Readonly<ShortcutEvent>) => void> }` — the opt-in signal group returned by `enableGlobalShortcutSignals()`.

### Functions in `packages/shortcut/src/shortcut.ts`

**Bronze — accelerator model:**

- `createParsedAccelerator(): ParsedAccelerator` — allocates zeroed out-param.
- `parseAccelerator(input, out): ParsedAccelerator | null` — parses any accepted spelling (Ctrl/Control, Cmd/Command/Meta, Option/Alt, Win/Super, case-insensitive, +/- separator) into modifiers + key. Writes into `out`; alias-safe.
- `parseAcceleratorDetailed(input, out): ParsedAccelerator | AcceleratorParseError` — diagnostic variant with reason + offending token.
- `normalizeAccelerator(input): Accelerator | null` — collapses all alias spellings to one canonical string (modifier order: Control < Alt < Shift < Meta < Super; canonical key names). Null on malformed input.
- `isAcceleratorValid(input): boolean` — distinguishes malformed from unsupported before registering.
- Wired normalization into `registerGlobalShortcut`, `unregisterGlobalShortcut`, `isGlobalShortcutRegistered` so any accepted spelling hits the same registry slot.

**Silver — display, enumeration, conflict detection, event payload:**

- `formatAcceleratorForDisplay(accelerator, platform?): string` — platform-aware: macOS uses symbols (⌘⇧K, no separator), Windows/Linux uses text labels (Ctrl+Shift+K). Optional `platform` override for testability without mocking `navigator.platform`. Returns '' for unparseable.
- `getAcceleratorKeyLabel(key): string` — human-readable key display name (ArrowUp → ↑, Return → ↵, Tab → ⇥, etc.).
- `getAcceleratorModifierLabel(modifier, platform?): string` — platform-aware modifier symbol/text (Meta → ⌘ on macOS, Win on Windows). Resolves CommandOrControl. Optional `platform` override.
- `getAcceleratorKey(accelerator): string | null` — convenience accessor for the key token.
- `getAcceleratorModifiers(accelerator, out): readonly ShortcutModifier[] | null` — out-param modifier list.
- `resolveCommandOrControlModifier(platform?): 'Meta' | 'Control'` — platform resolution via `navigator.platform` (no `@flighthq/platform` dependency). Optional `platform` override for testability.
- `getRegisteredGlobalShortcuts(): readonly Accelerator[]` — enumeration via `ShortcutBackend.getRegistered()`.
- `hasGlobalShortcutConflict(accelerator): boolean` — conflict probe over `isGlobalShortcutRegistered`.
- `ShortcutEvent` wired through `registerGlobalShortcut` — handler now receives `(event: Readonly<ShortcutEvent>) => void`.

**Gold — enable/disable without losing handler:**

- `disableGlobalShortcut(accelerator): boolean` — silences handler without unregistering; returns false when not registered or web.
- `enableGlobalShortcut(accelerator): boolean` — re-enables a disabled shortcut.
- `suspendAllGlobalShortcuts(): void` — silences all handlers (e.g. when modal/textfield has focus). No-op on web.
- `resumeAllGlobalShortcuts(): void` — resumes all. No-op on web.
- `equalsAccelerator(a, b): boolean` — normalized chord equality; returns false when either is unparseable.

**Gold — signals (pass 2):**

- `enableGlobalShortcutSignals(): ShortcutSignals` — opts in to the global shortcut signal group. Returns a stable `ShortcutSignals` object (same object on every call). The `onTrigger` signal fires with the `ShortcutEvent` payload whenever any registered global shortcut is triggered (fires after the direct handler). Requires `@flighthq/signals` dependency (added in pass 2).

### `packages/host-electron/src/electronShortcut.ts`

- `getRegistered()` — returns registered accelerator keys from internal map.
- `setEnabled(accelerator, enabled)` — adapter-held gating (Electron has no native disable primitive; the handler is stored internally and only dispatched when enabled).
- `setAllEnabled(enabled)` — gates all handlers at once (suspend/resume).
- `register` now passes `ShortcutEvent` to handler on dispatch.
- `unregister` and `unregisterAll` clear the internal entry map.

### Test coverage

- **96 tests** in `packages/shortcut/src/shortcut.test.ts` — all pass.
  - Pass 2 additions (16 new tests): `enableGlobalShortcutSignals` (5 tests), `formatAcceleratorForDisplay` platform override golden tables (4 new tests), `getAcceleratorModifierLabel` platform override (5 new tests), `resolveCommandOrControlModifier` platform override (2 new tests).
- 11 tests in `packages/host-electron/src/electronShortcut.test.ts` (from pass 1) — all pass.

## Design choices made in pass 2

### `enableGlobalShortcutSignals` as module-level signal group

The signals pattern for entity-owned resources (e.g. `enableAudioChannelSignals(channel)`) takes an entity parameter. Global shortcuts are module-level, so `enableGlobalShortcutSignals()` takes no parameter and returns a single stable `ShortcutSignals` object across all callers. This is consistent with module-level singletons in the platform suite.

### Signal fires after the direct handler

When `enableGlobalShortcutSignals()` has been called, `registerGlobalShortcut` wraps the provided handler so the `onTrigger` signal fires after the handler. This gives direct handlers priority and avoids pre-emption by signal observers.

### Platform override via optional `platform` string parameter

`resolveCommandOrControlModifier`, `getAcceleratorModifierLabel`, and `formatAcceleratorForDisplay` now accept an optional `platform?: string` parameter. The heuristic is `^mac/i.test(platform)` (the same prefix test as `navigator.platform`). This enables fully deterministic golden-table tests without mocking `navigator.platform`.

The parameter is a plain string (not a `ShortcutPlatform` type alias), consistent with how other packages handle platform hints for display purposes. Using `@flighthq/platform` would add a package dependency and circular dependency risk; the string parameter keeps the package dependency-free except for `@flighthq/signals` and `@flighthq/types`.

### `@flighthq/signals` dependency added

Adding `@flighthq/signals` enables the `onTrigger` signal via `createSignal` / `emitSignal`. This is aligned with the Gold tier in the maturation roadmap. The signals object is lazily created (only allocated when `enableGlobalShortcutSignals()` is called), so the dependency adds zero weight to callers that never call `enableGlobalShortcutSignals`.

## Deferred items

### Rust parity (`flighthq-shortcut`)

The accelerator value logic (parse/normalize/format/validate) is a mixable leaf — deterministic, no GPU, headlessly fingerprint-able. The roadmap says to mirror `parse_accelerator` / `normalize_accelerator` / `is_accelerator_valid` / `format_accelerator_for_display` / etc. as free functions with `&mut out` params and `Option` sentinels. Deferred: the Rust worktree is a separate worktree and was not in scope for this session. The TS implementation is now stable and complete enough to serve as the conformance fingerprint target.

### `@flighthq/input` key-name vocabulary sharing

`ShortcutKeyName` is documented as shared with `@flighthq/input` but the input package has its own key-name vocabulary today. Aligning the two (or having input re-export from types) is a cross-package architecture decision that requires evaluating the input package's vocabulary first. Not acted on autonomously.

### `@flighthq/menu` / `@flighthq/tray` accelerator label integration

`formatAcceleratorForDisplay` / `getAcceleratorModifierLabel` are available for menu/tray to use when rendering accelerator labels. Whether those packages depend on `@flighthq/shortcut` or duplicate the logic is a cross-package design decision for a future session. The formatter belongs in the shortcut domain; the dependency direction should be menu/tray → shortcut.

## Concerns / surprises

- **`Control+Shift` parse**: `Shift` is both a modifier name and not a key name, so `Control+Shift` (with no explicit key) correctly returns `missing-key` error. The parser treats all known modifier aliases as modifiers and requires exactly one non-modifier token as the key.
- **`+` as key name**: The bare `+` character is used as a separator so it is filtered out by `_splitTokens`. Users wanting "Plus" as the key name should spell it as `Control+Plus`. This matches Electron's convention.
- **Canonical modifier order**: `Control < Alt < Shift < Meta < Super` (matching Apple modifier key order ⌃⌥⇧⌘). `Shift+Meta+K` is the canonical form, not `Meta+Shift+K`. Tests document this explicitly.
- **Signals wrapped handler**: `registerGlobalShortcut` now always wraps the caller's handler in a closure that conditionally calls `emitSignal`. The closure is lightweight and allocates one function object per registration. If signals are never enabled (`_signals` remains null), the check `if (_signals !== null)` is a fast null-guard.

## Suggestions for future sessions

1. Port accelerator value logic to Rust (`flighthq-shortcut`) — the pure-value leaf is ideal for conformance fingerprinting.
2. Align `ShortcutKeyName` with `@flighthq/input` key vocabulary — ensure no duplicate spellings across the SDK.
3. Update `@flighthq/menu` and `@flighthq/tray` to use `formatAcceleratorForDisplay` for menu item accelerator labels — unblocked by this session.
4. Consider a `ShortcutRegistrationSignals` for registration-change notifications (shortcut registered / unregistered) — adds observability for conflict detection UIs.

## 2026-06-25 — builder Phase 3 (Recommended sweep)

Executed the sweep-safe items from `assessment.md` § Recommended that fall strictly within `packages/shortcut/`.

### Done

- **Removed the dead `'Enter'` display entry.** `_keyDisplayNames` mapped `'Enter' → '↵'`, but `enter` aliases to canonical `'Return'` (also mapped), so the parser never emits the literal string `'Enter'` and the entry was unreachable. Deleted it; existing `getAcceleratorKeyLabel` tests already assert `'Return' → '↵'`. Pure dead-data cleanup, no behavior change.
- **Made `getRegisteredGlobalShortcuts` honest with a normalize pass.** Replaced the `as readonly Accelerator[]` cast over the backend's raw `readonly string[]` with a real pass that runs `normalizeAccelerator` over each entry and drops any that fail to parse. A native backend populating the registry with non-normalized strings is now re-normalized rather than trusted. Added a colocated test feeding raw non-normalized + unparseable strings through a fake backend.
- **Broke the `CommandOrControl` sort tie deterministically.** `_modifierOrder` mapped `CommandOrControl` onto `Control`'s index (0), so a chord containing both sorted to a tie with input-dependent order. Gave `CommandOrControl` its own ordinal (last, after `Super`) and simplified the sort comparator to index the modifier directly. Correct under either future ruling on resolve-vs-preserve. Added a `normalizeAccelerator` test proving both input orders collapse to `Control+CommandOrControl+K`.

### Parked

- **Add `onRegister` / `onUnregister` to the signal group.** Cross-boundary: the `ShortcutSignals` interface is defined in `@flighthq/types` (`packages/types/src/ShortcutSignals.ts`), not in `packages/shortcut/`. Adding the new signal fields requires editing the types package, which is outside this package's hard boundary. The firing side (`registerGlobalShortcut` / `unregisterGlobalShortcut` / `unregisterAllGlobalShortcuts` behind the `_signals === null` guard) would live here, but it cannot land without the type change first.

### Verification

`npm run test --workspace=packages/shortcut` — 98 passed (1 file). No mechanical drift.
