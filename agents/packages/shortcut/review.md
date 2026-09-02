---
package: '@flighthq/shortcut'
status: solid
score: 82
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - source
  - tests
  - public API
  - types surface
  - host-electron
  - host-tauri
  - host-web
  - host-capacitor
---

# shortcut — Review

## Verdict

**Solid -- 82/100.** The package is two cleanly separated halves: a pure accelerator value library
(parse, normalize, compare, validate, display) and an explicit, awaited global-hotkey registration
lifecycle built on `Host.shortcut.trigger` and `Host.shortcut.query` providers. The 2026-08-30
rewrite deleted enumeration, enable/suspend emulation, ambient backend selection, diagnostic guards,
sentinels, and all module-level backend state -- replacing them with an Entity-based
`GlobalShortcut` whose attach/detach is awaited, origin-pinned, and serialized per chord. Twenty
exported functions, 26 focused test cases across two colocated test files, `sideEffects: false`,
two-lane exports (`.` and `./contract`), and all shared types in `@flighthq/types`. The remaining
depth is at the edges: module-scoped registration state for same-chord serialization, the
unresolved key vocabulary split with `@flighthq/input`, and a display function no consumer imports
yet.

## Present capabilities

### Value half (shortcut.ts -- 13 exports)

- `parseAccelerator` / `parseAcceleratorDetailed`: parse into a caller-owned `ParsedAccelerator`
  out-parameter, refilling the modifiers array in place rather than replacing it. The detailed
  variant returns typed `AcceleratorParseError` with five distinct reasons (`empty`, `missing-key`,
  `unknown-key`, `unknown-modifier`, `duplicate-modifier`).
- `normalizeAccelerator`: canonical modifier order (`Control < Alt < Shift < Meta < Super <
  CommandOrControl`), canonical key name, `+` separator. `CommandOrControl` carries its own sort
  ordinal so a chord mixing it with `Control` has a single deterministic form. Returns `null` on
  parse failure.
- `equalsAccelerator` / `findAcceleratorConflict`: normalized-form comparison. `findAcceleratorConflict`
  is the binding-list conflict probe, distinct from `queryGlobalShortcutConflict` which queries
  the OS.
- `formatAcceleratorForDisplay` / `getAcceleratorModifierLabel` / `getAcceleratorKeyLabel`:
  platform-specific display. macOS produces symbol glyphs without separator; Windows/Linux produces
  text labels with `+`. Platform is an explicit `PlatformName` parameter, not ambient detection.
- `getAcceleratorKey` / `getAcceleratorModifiers`: accessor extraction from an accelerator string.
- `isAcceleratorValid` / `makeParsedAccelerator` / `resolveCommandOrControlModifier`: utility.
- Tokenizer handles `+` and `-` as both separator and key name: a separator only separates when it
  terminates a token, so `CommandOrControl++` and `CommandOrControl+-` parse correctly.
- Key alias map covers all 95 `ShortcutKeyName` values plus Electron short-form aliases (`num0`,
  `pgdn`, `esc`, `del`, etc.) and bare symbol characters (`+`, `-`, `/`, etc.).

### Resource half (shortcutExplicitDependency.ts -- 7 exports)

- `createGlobalShortcut`: allocates a `GlobalShortcut` Entity with the normalized accelerator and
  an `onTrigger` signal. Parses before allocating; malformed input returns an `unparseable` outcome
  with the parse error, never reaching a provider.
- `attachGlobalShortcut`: awaits the `Host.shortcut.trigger` provider's `subscribe`. Explicit
  outcomes for native refusal, same-chord collision (already-registered), same-chord in-progress
  (serialized via `_pendingAccelerators`), and provider fault. A successful registration records
  the origin provider and opaque subscription token.
- `detachGlobalShortcut`: unsubscribes via the origin provider, not the current Host -- a
  replacement Host cannot redirect a release. Failed releases remain attached for exact retry.
- `disposeGlobalShortcut`: clears consumer signal listeners even when detach fails, preserving
  the failed native release for retry via `detachGlobalShortcut`.
- `destroyShortcutTrigger`: awaits the provider's `destroy`, which owns all native registrations
  whose tokens were not yet successfully unsubscribed.
- `queryGlobalShortcutConflict` / `queryGlobalShortcutRegistration`: parse before querying the
  `Host.shortcut.query` provider; distinguish registered/not-registered/query-provider-failed/
  unparseable outcomes.

### Host adapters (verified in host packages)

- **Electron**: `createElectronShortcutTriggerBackend` lifts the synchronous `globalShortcut.register`
  into the awaited subscription contract. `createElectronShortcutQueryBackend` wraps `isRegistered`.
  Both operate against the `ElectronApi` type, not a direct Electron import.
- **Tauri**: `createTauriShortcutTriggerBackend` awaits the async plugin Promise natively; pending
  registrations are tracked so `destroy` can `Promise.allSettled` them. Trigger fires only on
  `'Pressed'` state and only while the subscription is live.
- **Web / Capacitor**: provide `shortcut: {}` -- both `trigger` and `query` are structurally absent.
  `HostShortcutCapabilities` makes both optional, so this is correct structural absence, not a
  sentinel.

### Type surface (in @flighthq/types)

`Accelerator`, `AcceleratorParseError`, `AcceleratorParseErrorReason`, `ParsedAccelerator`,
`ShortcutKeyName` (union of 9 sub-unions, 95 keys), `ShortcutModifier` (6 values),
`GlobalShortcut`, `ShortcutTriggerSubscription`, `ShortcutTriggerBackend`, `ShortcutQueryBackend`,
`CreateGlobalShortcutOutcome`, `GlobalShortcutAttachOutcome`, `GlobalShortcutDetachOutcome`,
`GlobalShortcutQueryOutcome`, `ShortcutTriggerSubscribeOutcome`,
`ShortcutTriggerUnsubscribeOutcome`, `HasShortcutTrigger`, `HasShortcutQuery`,
`HostShortcutCapabilities`. All present in both the `.` and `./contract` lanes of `@flighthq/types`.

### Package shape

- `sideEffects: false` declared. No top-level registration, no listeners, no timers.
- Dependencies: `@flighthq/entity`, `@flighthq/signals`, `@flighthq/types` -- all correct.
- Two export lanes: `.` (index.ts, 20 curated public exports) and `./contract` (contract.ts,
  re-exports both source files).
- Source files: `shortcut.ts` (pure value), `shortcutExplicitDependency.ts` (resource lifecycle).
- Tests: `shortcut.test.ts` (13 tests, 13 describe blocks), `shortcutExplicitDependency.test.ts`
  (13 tests, 7 describe blocks). All describe blocks alphabetized.

## Gaps

1. **Module-scoped mutable state for registration tracking.** `shortcutExplicitDependency.ts`
   declares `_attachments` (WeakMap), `_attachedByAccelerator` (Map), and `_pendingAccelerators`
   (Set) at module scope. These are the implicit shared state that `attachGlobalShortcut`,
   `detachGlobalShortcut`, and `disposeGlobalShortcut` reach for without explicit arguments. The
   design constraints say "no module-scoped mutable state that functions reach for" -- same-chord
   serialization structurally requires shared tracking, but the convention is to pass it as an
   argument or attach it to the Host/provider rather than hiding it in the module. The charter's
   2026-08-30 decision is silent on where this state lives.

2. **`formatAcceleratorForDisplay` has no consumer.** Exported and tested, designed for `@flighthq/menu`
   and `@flighthq/tray` to render chords in OS-native style, but neither imports `@flighthq/shortcut`
   today. The dependency direction (menu/tray -> shortcut) is an open charter question.

3. **Key vocabulary split with `@flighthq/input`.** `ShortcutKeyName` is a string union;
   `@flighthq/input` addresses keys as a numeric `KeyCode`. One SDK, two representations for
   physical keys. The charter and status both note this as an unresolved cross-package ruling.

4. **`index.ts` export ordering.** `queryGlobalShortcutConflict` and `isAcceleratorValid` are
   out of alphabetical order in the export list (line 14 `queryGlobalShortcutConflict` precedes
   line 15 `isAcceleratorValid`). Minor, likely caught by `npm run order`.

5. **`queryGlobalShortcutConflict` is an alias.** The function body is a single call to
   `queryGlobalShortcutRegistration`. Both are exported from the public lane with distinct names
   for the same behavior. The intent may be to give the binding-UI consumer a semantically precise
   name, but the two names point to one code path with no conflict-specific logic.

## Charter contradictions

None found. The live code matches every ratified charter decision:

- The 2026-08-30 decision deleted enumeration, enable/suspend, guards, sentinels, and ambient
  backend state. The code has none of these.
- `Host.shortcut.trigger` and `Host.shortcut.query` are the explicit, independently optional
  provider slots. `HasShortcutTrigger` and `HasShortcutQuery` narrow the Host to exactly the slot
  each function needs.
- `createGlobalShortcut` parses before any provider is consulted; the `unparseable` outcome
  carries the structured parse error.
- Attach outcomes cover native refusal, same-chord collision, in-progress serialization, and
  provider fault -- all named in the charter.
- Detach uses the origin provider, not a replacement Host; failed releases remain attached for
  retry.
- Electron and Tauri provide both `trigger` and `query`; Web and Capacitor provide exact empty
  groups.
- The tokenizer handles `+`/`-` as key names per the 2026-07-30 separator decision.
- The dead `'Enter'` display entry is absent (2026-07-02 decision, confirmed done).

## Contract & docs fit

- All exported types reside in `@flighthq/types`, not in the package -- satisfies the type-home
  rule.
- Imports use `@flighthq/types/contract`, `@flighthq/entity/contract`, `@flighthq/signals/contract`
  -- intra-SDK contract lane convention is satisfied.
- `sideEffects: false` is declared and accurate. No import side effects, no top-level
  registration.
- Exported function names include full unabbreviated type names (`GlobalShortcut`, `Accelerator`,
  `ShortcutTrigger`). No abbreviation.
- `parseAccelerator` uses an out-parameter and refills the modifiers array in place rather than
  replacing it, matching the out-parameter conventions.
- `makeParsedAccelerator` is the explicit allocation verb for the parse value.
- Failure returns are sentinel values (`null`, frozen outcome objects) -- no exceptions on expected
  paths.
- Provider method faults are caught and mapped to explicit outcomes -- no unhandled rejections
  escape.
- The value half is fully deterministic and platform-injectable (no ambient OS detection).
- Test files are colocated, one per source file, with alphabetized describe blocks mirroring
  exported names.

## Candidate open directions

1. **Relocate registration state from module scope to an explicit context.** A `ShortcutRegistry`
   value (or a slot on the Host's shortcut group) passed to attach/detach/dispose would eliminate
   the module-scoped Maps/Set and align with the explicit-dependency model. This is a design
   question: the charter's 2026-08-30 decision authorizes the lifecycle but does not dictate where
   the shared tracking state lives.

2. **Resolve the key vocabulary ownership.** The charter's open direction 1 (`ShortcutKeyName`
   ownership across shortcut/menu/tray/input) and the status's open item about the `KeyCode` split
   are the same question. A ruling would unify or explicitly delineate the two representations.

3. **Connect `formatAcceleratorForDisplay` to `@flighthq/menu` / `@flighthq/tray`.** The
   dependency direction (menu/tray -> shortcut vs. shared vocabulary in types) is the open charter
   question. Until resolved, the display function is tested but unused.

4. **Shifted-punctuation glyph key names.** Charter open direction 3: Electron accepts `~ ! @ #`
   etc. as accelerator key codes. Admitting them means deciding whether a key name is a physical
   key or a layout-dependent glyph -- a vocabulary design decision, not an alias to add.
