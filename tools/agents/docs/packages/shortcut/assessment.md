---
package: '@flighthq/shortcut'
updated: 2026-06-25
basedOn: ./review.md
---

# Assessment: @flighthq/shortcut

This assessment is written as a **merge gate** over the integration `b2824e3d8` delta against the approved baseline `origin/main` (`eb73c3d74`). The headline: the delta **must not merge as-is** — the integration tree does not type-check because the package was merged without its `@flighthq/types` header (see `review.md`). The merge-blocking restoration is **not** a within-package sweep — it lands in `@flighthq/types` and is the integration worker's job, so it routes to the dispatch brief (`outgoing/integration/shortcut.md`), not into `Recommended` here. `Recommended` below holds only the genuinely sweep-safe, within-`@flighthq/shortcut`, additive cleanups that the review surfaced and that are correct under either charter ruling.

## Recommended

- **Remove the dead `'Enter'` display entry.** `_keyDisplayNames` maps `'Enter' → '↵'` (`shortcut.ts:446`), but `enter` aliases to canonical `'Return'` (`:360`, also mapped at `:458`), and `_parse` only ever emits canonical keys — so `'Enter'` is never looked up. Delete the entry (or, if a future spelling could surface `'Enter'`, add a test that proves the path). Pure dead-data cleanup, no behavior change. — review.md › Sharp edges (dead display data)

- **Make `getRegisteredGlobalShortcuts` honest with a normalize pass.** `shortcut.ts:133` casts the backend's `readonly string[]` to `readonly Accelerator[]`, trusting the registry to already hold normalized strings. Run `normalizeAccelerator` over the list (dropping entries that fail to parse) so the `Accelerator` type is earned, not asserted — a native backend populating the registry by another path can otherwise leak non-normalized strings through the cast. Within-package, no API-shape change. — review.md › Sharp edges (trust cast)

- **Break the `CommandOrControl` sort tie deterministically.** `_modifierOrder` (`:256`) maps `CommandOrControl` onto `Control`'s index (0), so a chord with both ties and its canonical order is input-dependent (`:553-557`). Give `CommandOrControl` its own ordinal so the canonical form is fully canonical for every input. This is the ordering fix only — correct whether the charter later rules that `normalizeAccelerator` _preserves_ or _resolves_ `CommandOrControl` (that resolve-vs-preserve choice is an Open direction, not this item). — review.md › Sharp edges (`CommandOrControl` sort tie)

## Backlog

- **The `@flighthq/types` header restoration is a cross-package merge fix, parked out of the sweep.** Restoring `Accelerator` / `AcceleratorParseError` / `ParsedAccelerator` / `ShortcutEvent` / `ShortcutModifier` / `ShortcutKeyName`, the extended 7-method `ShortcutBackend`, and the new `ShortcutSignals` file is what unblocks the build — but it edits `@flighthq/types` (and the `host-electron` adapter), which is outside `@flighthq/shortcut`. It is the integration worker's action and lives in the dispatch brief; recorded here only so the cell's knowledge tree shows why the merge was rejected. — review.md › Blocking

- **Build the `flighthq-shortcut` Rust crate.** `charter.crate` declares it; the port is explicitly deferred. The parse/normalize/format/validate core is exactly the value-typed, GPU-free, headlessly-fingerprintable leaf the Rust map flags as the best first conformance target — but it is a separate worktree (`crates/`), a different toolchain, and a cross-tree effort, so it is parked out of the within-package sweep. Carries a conformance-divergence note: TS `ShortcutSignals.onTrigger` is function-typed (`Signal<(event) => void>`) while the Rust map specifies payload-typed (`Signal<ShortcutEvent>`); record that as an intentional mapping when the crate is built. — review.md › Diagnosis; rust/index conformance

- **Add registration-change observability to the signal group.** The status doc and prior depth review both call for `onRegister` / `onUnregister` signals (payload `Accelerator`) so a conflict-detection UI can react to the live registry. Additive and opt-in behind the same `_signals === null` guard — but it extends `ShortcutSignals` in `@flighthq/types`, so it cannot land until the header itself is restored (it is blocked behind the Backlog header item above), and it overlaps a charter Open direction. Parked until the merge is healthy and the charter speaks. — review.md › (referenced from builder docs)

## Approved

_None. Approval is the user's verbal gate. Nothing is moved here until the user blesses it in a direction session; this file's `Approved` ledger is append-only._

---

## Notes for the charter's Open directions (do not edit the charter from here)

These are decisions the review had to assume; they are forks for an explicit conversation, not autonomous work, and several gate the Backlog items above.

- **Thin-by-design vs. fully built-out (structural fork F).** `structural-forks.md` still cites `shortcut` as the canonical "blessed-as-intentionally-minimal" stub, but the build-out took it to a full accelerator library. The charter should rule whether the accelerator value model (parse/normalize/format/validate) is permanently in scope here or was scope creep — and fork F's citation should be revisited (`shortcut` is now an under-built-stub-that-got-the-push, not a thin-by-design example).

- **Who owns the accelerator display vocabulary across `shortcut` / `menu` / `tray` / `input`?** `formatAcceleratorForDisplay` and the key-name table are the obvious shared source. Decide the dependency direction (menu/tray → shortcut, or the vocabulary in `@flighthq/types` with all three depending only on the header), and whether `ShortcutKeyName` and `@flighthq/input`'s key names are one shared `types` table. Cross-package — a ruling, not autonomous work.

- **`CommandOrControl` in the canonical form.** Should `normalizeAccelerator` _resolve_ `CommandOrControl` to the concrete platform modifier (platform-specific normalized string) or _preserve_ it (portable chord)? Current code preserves. The Recommended tie-break above is correct either way; which behavior is canonical is a charter call.

- **Platform detection strategy.** The package reads `navigator.platform` directly to avoid a `@flighthq/platform` dependency (and circular-dependency risk). Is dependency-freedom a North-star value, or should it consume the `platform` seam once stable? The `platform?: string` override is a clean escape hatch either way.

- **Native (non-Electron) backends.** The seam is host-agnostic but only Electron fills it (and even that adapter is absent from this integration). Is a `host-winit` / `host-sdl` global-hotkey backend part of this package's "done," or owned entirely by the host crates?

- **Merge-integrity process (raised by this gate).** This delta merged the package + its status doc but lost the `@flighthq/types` and `host-electron` commits, yielding an unbuildable tree — the same failure as `@flighthq/clipboard` this cycle. Should a types-first feature be required to merge its `@flighthq/types` change atomically with the implementing package?

- **Doc revision (Package Map).** `tools/agents/docs/index.md` still reads "`@flighthq/shortcut`: global OS hotkeys (native host required)" — that described the 28/100 stub. Once the build is restored, the one-liner should note it owns the accelerator vocabulary, parsing/normalization, display formatting, and conflict detection (the formatter `menu`/`tray` consume).
