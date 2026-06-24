---
package: '@flighthq/shortcut'
updated: 2026-06-24
basedOn: ./review.md
---

# Assessment: @flighthq/shortcut

The Bronze/Silver/Gold roadmap (`reviews/maturation/depth/shortcut.md`) is substantially **delivered** — the accelerator model, parse/normalize/validate, platform display, enumeration, conflict detection, enable/disable/suspend, normalized equality, and the opt-in signal group are all built and tested (96 colocated tests, 26 exports). What remains is the residue: a handful of within-package sharp edges the review found, one additive observability gap, the deferred Rust crate, and a cluster of design forks that need the charter to speak. The roadmap is fully absorbed here and can be removed as seed.

`Recommended` below is strictly sweep-safe: each item is within `@flighthq/shortcut`, additive, non-breaking, and carries no open design decision. The canonical-form fork (preserve vs resolve `CommandOrControl`) is **not** in Recommended — only the input-independent tie-break that is correct under either ruling.

## Recommended

- **Remove the dead `'Enter'` display entry.** `_keyDisplayNames` maps `'Enter' → '↵'`, but `enter` aliases to the canonical key `'Return'` (also mapped), so a parsed key is never the string `'Enter'` and the entry is unreachable. Delete it (or, if a future spelling could surface `'Enter'`, add a test that proves the path) so the display table is honest. Pure dead-data cleanup, no behavior change. — review.md#gaps (dead display data)

- **Make `getRegisteredGlobalShortcuts` honest with a normalize pass.** It casts the backend's `readonly string[]` to `readonly Accelerator[]` assuming the registry already holds normalized strings. That holds for the web/Electron path today, but a native backend populating the registry directly could return non-normalized strings, and the cast hides it. Run `normalizeAccelerator` over the list (dropping any that fail to parse) so the `Accelerator` type is earned, not asserted. Within-package, no API-shape change. — review.md#gaps (trust cast)

- **Break the `CommandOrControl` sort tie deterministically.** `_modifierOrder` maps `CommandOrControl` onto `Control`'s index (0), so a chord containing both `Control` and `CommandOrControl` sorts to a tie and the normalized order between them is input-dependent. Give `CommandOrControl` its own ordinal in `_modifierOrder` so the canonical form is fully canonical for every input. This is the ordering fix only — it is correct whether the charter later rules that `normalizeAccelerator` _preserves_ or _resolves_ `CommandOrControl` (the resolve-vs-preserve choice is an Open direction, below). — review.md#gaps (`CommandOrControl` sort tie)

- **Add registration-change observability to the existing signal group.** The signal group is already built and opt-in; `onTrigger` is the only signal. The status doc and review both call for registered/unregistered notifications so a conflict-detection UI can react to the live registry. Add `onRegister` / `onUnregister` signals to `ShortcutSignals` (one concept per file; the payload is the `Accelerator`), fired from `registerGlobalShortcut` / `unregisterGlobalShortcut` / `unregisterAllGlobalShortcuts` behind the same `_signals === null` zero-cost guard. Additive, opt-in, non-breaking, within-package — the Gold roadmap already named "registration-change notifications" as part of the signal group. — review.md#gaps (no registration-change observability)

## Backlog

- **Build the `flighthq-shortcut` Rust crate.** `charter.crate` declares it; the port is explicitly deferred. The parse/normalize/format/validate core is exactly the value-typed, GPU-free, headlessly-fingerprintable leaf the Rust map flags as the best first conformance target — but it is a separate worktree (`crates/`), a different toolchain, and a cross-tree effort, so it is parked out of the within-package sweep. Carries a conformance-divergence note: TS `ShortcutSignals.onTrigger` is `Signal<(event) => void>` (function-typed) while the Rust map specifies `Signal<ShortcutEvent>` (payload-typed); record that as an intentional mapping when the crate is built. — review.md#gaps (no Rust crate), review.md#contract-fit (Rust-conformance seam note)

## Approved

_None. Approval is the user's verbal gate._

---

## Notes for the charter (Open directions — do not edit the charter from here)

The charter is still all `TODO` stubs; these are the decisions the review had to assume and that block turning the residue into in-package work. They are surfaced here for an explicit conversation, **not** placed in Recommended.

- **Thin-by-design vs. fully built-out.** `structural-forks.md` fork F still cites `shortcut` as the canonical "blessed-as-intentionally-minimal" stub, but pass-2 took it to a full hotkey library. The charter should rule whether the accelerator model (parse/normalize/format/validate) is permanently in scope here or was scope creep. Fork F's citation should then be revisited — `shortcut` is now a worked example of an _under-built stub that got the push_, not of a thin-by-design one.

- **Who owns the accelerator display vocabulary across `shortcut` / `menu` / `tray` / `input`?** `formatAcceleratorForDisplay` and the key-name table are the obvious shared source. Decide the dependency direction: do `menu`/`tray` depend on `shortcut`, or does the vocabulary live in `@flighthq/types` with all three depending only on the header? And should `ShortcutKeyName` and `@flighthq/input`'s key names be one shared `types` table to avoid two spellings of one physical key? Cross-package — a ruling, not autonomous work.

- **`CommandOrControl` in the canonical form.** Should `normalizeAccelerator` _resolve_ `CommandOrControl` to the concrete platform modifier (normalized string becomes platform-specific) or _preserve_ it (chord stays portable)? The current code preserves it. The Recommended tie-break above is correct either way, but which behavior is canonical is a charter call.

- **Platform detection strategy.** The package reads `navigator.platform` directly to avoid a `@flighthq/platform` dependency (and circular-dependency risk). Is dependency-freedom a North-star value for this cell, or should it consume the `platform` seam once stable? The `platform?: string` override is a clean escape hatch either way.

- **Native (non-Electron) backends.** The seam is host-agnostic but only Electron fills it. Is a `host-winit` / `host-sdl` global-hotkey backend part of this package's definition of "done," or is it owned entirely by the host crates?

- **Doc revision (Package Map).** `tools/agents/docs/index.md` still reads "`@flighthq/shortcut`: global OS hotkeys (native host required)" — that described the 28/100 stub. The package now owns the accelerator vocabulary, parsing/normalization, display formatting, and conflict detection; the one-liner should note it is the accelerator-domain owner (the formatter `menu`/`tray` consume).
