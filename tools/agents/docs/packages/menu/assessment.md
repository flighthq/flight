---
package: '@flighthq/menu'
updated: 2026-06-24
basedOn: ./review.md
---

# menu — Assessment

Sorts the gaps in `review.md` and the absorbed `reviews/maturation/depth/menu.md` roadmap into sweep-safe `Recommended` and parked `Backlog`. The maturation roadmap predates the `builder-67dc46d64` pass: most of its Bronze and Silver tiers have **already landed** (mutable-state mutators, handle model, open `MenuItemRole`, `MenuItemSelectEvent`, signals group, six standard builders, structural edits, the real DOM context-menu renderer). What remains is the Gold tier plus the confidence/conformance gaps the review names. The roadmap is now fully absorbed and can be removed.

`Approved` is intentionally empty — approval is the user's verbal gate.

## Recommended

Within `@flighthq/menu` (and its colocated tests), no cross-package coupling, no breaking change, no open design decision. Safe to bless as a set.

- **Functional/visual test for the web context-menu renderer.** Add a `tests/functional/menu-context` scene (per the `functional-test` skill) capturing the DOM popup — separators, checkmark/radio-dot, submenu `▶` expansion, accelerator column — with a screenshot baseline. This is the single biggest confidence gap (review §Gaps): ~200 lines of DOM/CSS/keyboard logic with real visual output and no baseline. Within-package, no design decision — the renderer already exists.
- **jsdom unit tests for the web context-menu render + keyboard-nav paths.** The existing jsdom tests cover the no-`document` early-return path, not actual rendering. Add coverage for the DOM build (viewport clamping, separators, checkmark/radio markup, submenu nodes) and the keyboard contract (Arrow/Enter/Space/Escape, `onMenuItemHighlight` on focus). Closes the test deduction; within-package.
- **Incremental menu diffing on `setApplicationMenu` re-call.** Today every re-submit is a full rebuild that re-collects callbacks (review §Gaps; status perf note). Mutate only changed items instead of replacing the whole menu. No public-surface change, no design decision — a pure internal optimization in the web/Electron entry struct.
- **Regenerate the stale `WellKnownMenuItemRole.d.ts.map`.** The sourcemap for the new role file is stale (status §deferred); a full build self-corrects it. Mechanical cleanup, no API change.

## Backlog

Parked: cross-package coordination, larger scope, or waiting on an Open direction. Reason per item.

- **Accelerator semantics + `@flighthq/menu-formats` neighbor** (parse / validate / normalize / chord format, `AcceleratorChord`/`AcceleratorModifier` in `@flighthq/types`). Blocked on the `menu`↔ `shortcut` dispatch-ownership decision (Open direction #1). The `-formats` triad cell is correctly _withheld_ under the plurality guard until that line is agreed — do not pre-create it.
- **Platform-correct accelerator display in the web backend** (⌘⌥⇧ on macOS vs Ctrl+Alt+Shift on Win/Linux). Cross-package: needs `@flighthq/platform` for OS detection, and the display transform belongs with the accelerator-chord format work above. Parked with that seam.
- **Icon rendering in the web backend.** The `icon` field is inert in the web renderer. Whether this is a real gap or a non-goal depends on the web-backend-fidelity ruling (Open direction #4: production-grade vs reference fallback). Also needs image-loading-pipeline integration. Parked on the fidelity decision.
- **RTL layout + theming hooks in the web backend.** Same gate as icons — settled by the web-backend-fidelity ruling (Open direction #4). Parked.
- **Radio-group semantics** (explicit group id + sibling auto-exclusivity). This is a descriptor-model design choice (Open direction #5: group-id model vs per-item `checked`), not sweep-safe additive work. Parked on that ruling.
- **Deep-tree / path-addressed structural edits.** `appendMenuItem`/`insertMenuItemBefore` operate on the top-level array only (review §Gaps). A nested-submenu insert introduces a new path-addressing public API shape — a deliberate API choice, not a blind additive sweep. Parked for a design pass.
- **Tray/app/dock shared menu descriptor.** Cross-package (`@flighthq/tray` `setTrayContextMenu`, `@flighthq/app` dock menu); the shared seam would live in `@flighthq/types` and touch three packages' surface (Open direction #2). Surface as a proposal before acting.
- **Rust crate catch-up / conformance posture.** `crates/flighthq-menu` is a Bronze stub far behind TS (~7 vs 28 exports, no handles/mutators/signals/templates) and its `set_application_menu -> bool` seam now _contradicts_ the TS `setApplicationMenu(): MenuHandle | null` (review §Contract drift). Resolving this is either an accepted, recorded divergence in the conformance map **or** a catch-up target (Open direction #3) — a conformance-map decision, not in-package work. Parked.

## Approved

_None. Frozen here only on the user's verbal approval._

## Notes for the charter (Open directions — do not edit the charter here)

The review surfaced five questions the charter is still silent on; route them to `charter.md › Open directions` for a direction session:

1. The `menu`↔`shortcut` accelerator-dispatch boundary — who turns a `MenuItemTemplate.accelerator` into a live OS hotkey, and how double-binding is prevented. Gates `menu-formats` and accelerator display.
2. A shared menu descriptor across surfaces (`menu` bar / context / `tray` / `app` dock) — keep per-surface APIs over a shared `MenuItemTemplate`, or unify behind one handle. Cross-package.
3. Rust conformance posture for `menu` — accepted recorded divergence vs catch-up target (the seams already disagree on `set_application_menu`'s return).
4. Web-backend fidelity scope — production-grade (icons, RTL, theming, platform accelerator glyphs) vs reference fallback with a native host expected for richer output. Sets whether the icon/RTL/theming gaps are real gaps or non-goals.
5. Radio-group model — explicit radio-group id with sibling exclusivity vs per-item `checked`.
