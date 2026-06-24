---
package: '@flighthq/shortcut'
status: solid
score: 88
updated: 2026-06-24
ingested:
  - status.md
  - reviews/depth/shortcut.md
  - reviews/maturation/depth/shortcut.md
  - source
  - incoming/builder-67dc46d64 (changes.patch + head tree)
---

# Review: @flighthq/shortcut

## Verdict

`solid — 88/100`. The accelerator-logic layer the prior depth review (28/100) called the single biggest gap is now built and the seam is genuinely a hotkey _library_, not just a delegating shim: 26 alphabetized free functions over a swappable `ShortcutBackend`, a `@flighthq/types`-first accelerator model (`Accelerator`, `ParsedAccelerator`, `ShortcutModifier`, `ShortcutKeyName`, `ShortcutEvent`, `AcceleratorParseError`), platform-aware display formatting, enumeration/conflict detection, enable/disable/suspend, normalized-equality, and an opt-in signal group — all backed by 96 colocated tests. The status doc's "93/100 gold" self-estimate is optimistic against the AAA bar (no Rust crate yet, a few dead-data and trust-boundary sharp edges), but the work is real and verified against the diff. This supersedes the 28/100 depth review.

## Status-doc verification (AS-CLAIMED → verified against `changes.patch` + head tree)

- **96 tests, all 26 exports covered** — VERIFIED. `head/packages/shortcut/src/shortcut.test.ts` has exactly 96 `it()` and 26 alphabetized `describe` blocks, one per exported function (1:1 with the 26 `export function`s in `shortcut.ts`).
- **Base was 54 lines / 7 functions; head is 572 lines / 26 functions** — VERIFIED against `base/packages/shortcut/src/shortcut.ts` (the 4-method backend + register/unregister/query/clear). This is a from-stub rebuild, not an incremental tweak.
- **Types added to `@flighthq/types`** — VERIFIED. `Shortcut.ts` carries all six types; the `ShortcutBackend` interface grew from 4 methods (base) to 7 (`getRegistered`, `setEnabled`, `setAllEnabled` added). `ShortcutSignals.ts` is a separate file (one-concept-per-file, correct).
- **host-electron adapter extended** — VERIFIED (`head/packages/host-electron/src/electronShortcut.ts`): adapter-held enable/disable gating (Electron has no native disable primitive), `getRegistered`, `ShortcutEvent` dispatch, entry-map clearing.
- **Minor claim drift**: status says "11 tests in `electronShortcut.test.ts`"; the head tree has **9** `it()`/`test()` cases. Does not affect the shortcut package itself; noting for accuracy.

## Present capabilities

Accelerator model (`@flighthq/types/src/Shortcut.ts`): `Accelerator` (normalized string alias), `ParsedAccelerator { key, modifiers }`, `ShortcutModifier` (6-member union incl. `CommandOrControl`), `ShortcutKeyName` (exhaustive named-key union — letters, digits, F1–F24, arrows, nav, editing, numpad, punctuation, media, lock/utility), `ShortcutEvent { accelerator }`, `AcceleratorParseError`.

Value logic (`shortcut.ts`, all alias-insensitive: Ctrl/Control, Cmd/Command/Meta, Option/Alt, Win/Super, `+`/`-` separators):

- Parse/normalize: `parseAccelerator(input, out)` (alias-safe out-param), `parseAcceleratorDetailed` (returns `AcceleratorParseError` with a `reason` from a closed 5-member set instead of `null`), `normalizeAccelerator`, `createParsedAccelerator`, `isAcceleratorValid`.
- Accessors: `getAcceleratorKey`, `getAcceleratorModifiers(out)`, `areAcceleratorsEqual` (normalized chord equality).
- Display: `formatAcceleratorForDisplay` (macOS symbols `⌘⇧K` no-separator vs `Ctrl+Shift+K`), `getAcceleratorKeyLabel`, `getAcceleratorModifierLabel`, `resolveCommandOrControlModifier` — each takes an optional `platform?: string` override for deterministic golden tests without mocking `navigator.platform`.
- Registration over the seam: `registerGlobalShortcut` / `unregisterGlobalShortcut` / `unregisterAllGlobalShortcuts` / `isGlobalShortcutRegistered`, all normalizing input first so any accepted spelling maps to one registry slot; `getRegisteredGlobalShortcuts`, `hasGlobalShortcutConflict`.
- Enable/disable: `disableGlobalShortcut` / `enableGlobalShortcut` (preserve handler) + `suspendAllGlobalShortcuts` / `resumeAllGlobalShortcuts`.
- Signals: `enableGlobalShortcutSignals(): ShortcutSignals` — lazily allocates a stable object; `registerGlobalShortcut` wraps the handler so `onTrigger` fires _after_ the direct handler (direct handler has priority). Zero cost when never enabled (`_signals === null` fast guard).
- Backend seam: `getShortcutBackend` / `setShortcutBackend(null→web)` / `createWebShortcutBackend` (every method a sentinel: `false` / `[]` / no-op — never throws). Correct command-capability shape.

## Gaps

- **No Rust crate.** `charter.crate: flighthq-shortcut` is declared but the port is explicitly deferred (status "Deferred items"). The parse/normalize/format/validate core is exactly the value-typed mixable leaf the Rust map flags as the best first conformance target (deterministic, no GPU, headlessly fingerprintable). This is the largest single distance from AAA/gold.
- **Dead display data.** `_keyDisplayNames` maps `'Enter' → '↵'` (line 446), but `enter` aliases to the canonical key `'Return'` (also mapped, line 458), so the `'Enter'` entry is unreachable — a parsed key is never the string `'Enter'`. Harmless, but it is dead data in a table presented as the display source of truth.
- **`CommandOrControl` sort tie.** `_modifierOrder` has 5 entries; the sort maps `CommandOrControl` onto `Control`'s index (0), so a chord containing both `Control` and `CommandOrControl` sorts to a tie and normalized order between them is input-dependent. A pathological input (you would not normally combine the two), but the canonical form is then not fully canonical.
- **`getRegisteredGlobalShortcuts` trust cast.** It casts the backend's `readonly string[]` to `readonly Accelerator[]` assuming the registry already holds normalized strings. That holds today because `registerGlobalShortcut` normalizes before `backend.register`, but a backend populated by another path (a native host registering directly) could return non-normalized strings; the cast hides that. A `normalizeAccelerator`-over-the-list pass would make the type honest.
- **No registration-change observability.** The status doc itself suggests a `ShortcutRegistrationSignals` (registered/unregistered) for conflict-detection UIs; `onTrigger` is the only signal today.
- **Out-of-scope-by-design (correctly absent):** multi-key sequence chords (`"g then i"`) and in-app key-binding maps (belong to `@flighthq/input`). The depth review and roadmap both park these; no need to build.

## Charter contradictions

None — the charter (`North star`, `Boundaries`, `Decisions`, `Open directions`) is still all `TODO` stubs, so there is nothing concrete to contradict. The "What it is" line ("Global OS hotkey registration") is matched by the code. The absence of a charter is itself the finding (see Candidate open directions). Judged against the fallback codebase-map AAA standard, the package is in good standing; the gaps above are completeness/quality, not violations.

## Contract & docs fit

Lives up to the contract well:

- **`@flighthq/types`-first**: all cross-package types are in `types`; nothing cross-package is defined inline. `ShortcutSignals` is its own file (one-concept-per-file). ✓
- **Full unabbreviated names**: every export carries the full type word (`registerGlobalShortcut`, `getAcceleratorModifierLabel`, not `register`/`getModLabel`). ✓
- **Out-params + alias-safety**: `parseAccelerator` / `parseAcceleratorDetailed` / `getAcceleratorModifiers` write into `out`, read inputs into locals first, and the test file exercises distinct-and-aliased cases. ✓
- **Sentinels not throws**: `null` for unparseable, `false`/`[]`/no-op web sentinels, `AcceleratorParseError` returned (not thrown) as a sentinel-companion. No error-wrapping types thrown. ✓
- **Single root export / `sideEffects: false`**: `index.ts` is `export * from './shortcut'`; manifest declares `sideEffects: false`; no module-top-level registration (signals lazily allocated). ✓
- **Signals discipline**: opt-in via `enableGlobalShortcutSignals`, defined in the owning package, cost assumed only on opt-in. ✓
- **Alphabetization**: exports and `describe` blocks both alphabetized and mirrored 1:1. ✓

Candidate doc revisions (the user's gate, not mine):

- **Package Map line is now stale-by-understatement.** `tools/agents/docs/index.md` still reads "`@flighthq/shortcut`: global OS hotkeys (native host required)." That described the 28/100 stub; the package now owns the accelerator vocabulary, parsing/normalization, display formatting, and conflict detection. The one-liner could note it is the accelerator-domain owner (the formatter that `menu`/`tray` should consume).
- **`structural-forks.md` fork F** lists `shortcut` as the canonical example of "blessed-as-intentionally-minimal (the domain is genuinely thin)." That framing predates this build-out — the package is no longer thin. Fork F's `shortcut` citation should be revisited: it is now a worked example of an _under-built stub that got the push_, not of a thin-by-design stub.
- **Rust-conformance seam note**: `ShortcutSignals.onTrigger` is `Signal<(event) => void>` (function-typed), while the Rust map specifies `Signal<T>` parameterized by _payload_ (`Signal<ShortcutEvent>`). This is the established TS signal convention, so it is contract-correct on the TS side; flag it for the conformance divergence map when `flighthq-shortcut` is built so the payload-vs-function shape is a recorded, intentional mapping rather than a surprise.

## Candidate open directions (charter is silent — these are assumptions I had to make)

1. **Is `shortcut` thin-by-design or fully built-out?** Fork F parks it as intentionally-minimal, but pass-2 took it to a full library. The charter should settle which intent governs: is the accelerator model (parse/normalize/format/validate) permanently in scope here, or was that scope creep? My review assumes in-scope-and-good; confirm.
2. **Who owns the accelerator display vocabulary across `shortcut` / `menu` / `tray` / `input`?** `formatAcceleratorForDisplay` and the key-name table are the obvious shared source. The status doc and roadmap both flag this as a cross-package decision: do `menu`/`tray` depend on `shortcut` (dependency direction menu/tray → shortcut), or does the vocabulary live in `@flighthq/types` and all three depend only on the header? And should `ShortcutKeyName` and `@flighthq/input`'s key names be one shared `types` table to avoid two spellings of the same physical key? Needs a ruling.
3. **`CommandOrControl` in the canonical form.** Should `normalizeAccelerator` _resolve_ `CommandOrControl` to the concrete platform modifier (making the normalized string platform-specific), or preserve it (keeping the chord portable but leaving the sort-tie above)? The current code preserves it; the charter should bless one.
4. **Platform detection strategy.** The package deliberately reads `navigator.platform` directly to avoid a `@flighthq/platform` dependency (and circular-dependency risk). Is dependency-freedom a North-star value for this cell, or should it use the `platform` seam once that is stable? The `platform?: string` override is a clean escape hatch either way.
5. **Native (non-Electron) backends.** The seam is host-agnostic but only Electron fills it today. Is a `host-winit`/`host-sdl` global-hotkey backend in scope for this package's definition of "done," or is that owned entirely by the host crates?
