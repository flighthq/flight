---
review: integration merge-review (harsh) — per-package verdicts
companion-to: integration-merge-review.md
target: integration
head: b2824e3d88375ca0a502335d3ab032020c1634ab
base: origin/main eb73c3d744273f5c5248cd953548b9973c637c15
sibling-bundles:
  builder: 67dc46d64c0ecbd3810ea42708e26691ea07440b (same base eb73c3d74)
date: 2026-06-25
---

# Integration Merge — Per-Package Verdicts (`b2824e3d8` vs `origin/main` `eb73c3d74`)

This is the **synthesis verdict layer** for all 55 reviewed packages. It is the companion to [`integration-merge-review.md`](integration-merge-review.md), which carries the structural finding and its authoritative **§0 CORRECTION**. This document does not restate §1's stranded-core theory — it defers to §0 — and instead lands the harsh per-package verdicts, the cross-cutting themes that emerged once all 52 remaining cells were reviewed, the direction questions, and the dispatch plan.

## 0. Read §0 of the companion first — the structure is settled

The companion's **§0 CORRECTION** is authoritative and supersedes its own §1. In short: the engine core matching `origin/main` is **intentional pruning, already done** — integration is a _legitimate, deliberately-curated baseline_ (22 commits, including `feat(ts): add beta apis` and `refactor: apply revision pass`), not a broken partial merge; **builder-`67dc46d64` is the abandoned 2-commit WIP snapshot** whose speculative core additions integration chose not to carry forward. The companion's lead "do not merge until prune-vs-strand is resolved" is **withdrawn**. The real open question is _which of builder's pruned core helpers (raycasting, frustum-sphere culling, node traversal, `disposeNode`, `Loader`, the full `Stage` set, `cacheAsBitmap`/`scrollRect`) to port forward_ for OpenFL/3D parity, plus the few non-prune revision-pass regressions §0 names (`===`→`==`, a lost `Readonly<>`, lost matrix pooling). Everything in this verdicts doc is scoped to **the slice that is present** — which §0 confirms is the right unit to review — and the recurring "header dropped on the merge" finding below is _not_ evidence for the stranded-core theory (§0 already ruled those independent `tsc -b` bugs).

---

## 1. Verdict table — all 55 reviewed packages

`Δ` is `changedFiles` from the bundle MANIFEST. Scores shown where the brief assigned one.

| # | Package | Δ | Verdict | One-line |
| --: | --- | --: | --- | --- |
| 1 | `@flighthq/displayobject-gl` | 23 | **CLEAN** (84) | Test-only delta: a barrel-excluded `glTestHelper.ts` over public `createGlRenderState` migrates ~22 tests off the unresolvable `makeGlState` import; only nit is one wrong word ("private") in a docstring. |
| 2 | `@flighthq/scene-gl` | 33 | **REVISE** | Two-pass transparency sort + per-state pools + a `HAS_UV1` shader path are correct and tested, but the uv1 path is dead (never threaded into `bind()`) and the new blended-pass functional test ships with no committed baseline. |
| 3 | `@flighthq/types` | 8 | **REVISE** | Clean types-first delta (text-shaping seam, spritesheet kinds, render viewport, font/glyph metrics); one grounded gap — `updateNotification(id,…)` keys on an `id` the `Notification` seam never exposes (it has `tag`). |
| 4 | `@flighthq/sdk` | 5 | **REVISE** | Strict correctness win (adds the three missing `-formats` barrel entries, alphabetized); one honesty gap (a `completeness.test.ts` the docs/policy claim is absent) + two cosmetic test dedups. |
| 5 | `@flighthq/resources` | 21 | **REVISE** | Mostly exemplary, but reads/writes `TextureAtlasRegion`/`Tileset` fields never added to `@flighthq/types` in this bundle — TS2339 across the delta. |
| 6 | `@flighthq/sprite` | 8 | **REVISE** | Well-shaped, fully tested, but does not compile (`*Signals` types never added to `@flighthq/types`) and breaks packaging (imports `@flighthq/signals` undeclared in the manifest). |
| 7 | `@flighthq/spritesheet-formats` | 8 | **REVISE** (58) | Good fork-B registry + types-first kinds, but ships 8 new exports with zero tests, a dead/mis-scoped `xmlParse.ts` re-export, and docs claiming serializers/diagnostics absent from the source. |
| 8 | `@flighthq/filters` | 7 | **REVISE** | Clean, correct, purely-additive descriptor-ops/guards/validation/margin spine — hard-blocked only because all six new files ship with zero colocated tests (`exports:check`), plus an asymmetric 7-of-14 guard set. |
| 9 | `@flighthq/filters-canvas` | 4 | **REVISE** | The `applyCanvasFilter` dispatcher is sound in shape but does not build (depends on `filters-css` `svgFilterUrl`, which is merge-conflicted/absent), has wrong export order, and re-homes CSS knowledge. |
| 10 | `@flighthq/render` | 3 | **REVISE** | Tiny landed delta (only `renderViewport.ts`), but `computeRenderProxyWorldBounds` fabricates a zero-size local point instead of real world bounds; tests use only origin/zero-size objects so they can't catch it. |
| 11 | `@flighthq/render-gl` | 4 | **REVISE** | 3 of 4 test files are clean coverage, but `glFullscreenPass.test.ts` imports `tryCompileGlFullscreenProgram`/`getGlLastShaderLog` that don't exist in head — TS2305, fails `tsc -b`. |
| 12 | `@flighthq/texture` | 6 | **REVISE** (58) | Clean 9→27-export symmetry build that doesn't compile — consumes `CubeFace*` constants never added to `@flighthq/types`; status.md falsely claims the test/types landed. |
| 13 | `@flighthq/textshaper` | 6 | **REVISE** | Cleanly extends the advances-only seam to full shape/metrics/glyph; two small fixes — `shapeTextRunInto` drops `options`, `getFontUnitScale` carries a gratuitous cast. |
| 14 | `@flighthq/textshaper-canvas` | 2 | **REVISE** | Clean Canvas-measure enlargement; two self-introduced correctness bugs — cache key omits `letterSpacing` (stale widths on hit), `getFontMetrics` returns `unitsPerEm: 0` (divide-by-zero for contract-following callers). |
| 15 | `@flighthq/surface` | 4 | **REVISE** | Noise delta is clean; new `surfaceWarp.ts` imports a `SurfaceEdgeMode` absent from `@flighthq/types` (hard `tsc -b` fail) and is never barrel-wired (dead API). |
| 16 | `@flighthq/surface-rs` | 2 | **REVISE** | Excellent test-hardening, but changed `floodFillSurface` to a 5-arg signature the real `@flighthq/surface` never adopted — breaks drop-in parity + `tsc -b`. Tiny in-package reverts fix it. |
| 17 | `@flighthq/resource-formats` | 6 | **REVISE** | Net-new; XML parser code is correct and tested, but after the delta stripped the atlas codecs it is a generic XML parser wearing a `-formats` name — mis-homed, dishonestly named, `XmlElement` defined outside `@flighthq/types`. |
| 18 | `@flighthq/ipc` | 4 | **REVISE** | Sound feature; imports six `@flighthq/types` `Ipc` symbols + three `IpcBackend` methods the branch never added — does not compile. |
| 19 | `@flighthq/filesystem` | 4 | **REVISE** (58) | Well-designed, exhaustively tested; cannot merge — imports four `@flighthq/types` types + eleven `FileSystemBackend` methods never committed; also `findFiles` returns directories (dishonest). |
| 20 | `@flighthq/input` | 2 | **REVISE** | Well-built game-input expansion that doesn't compile against head types (five missing symbols + several missing fields/`timeStamp`s). |
| 21 | `@flighthq/keyboard` | 2 | **REVISE** | Good source upgrade carried WITHOUT its `@flighthq/types` edits — imports `SoftKeyboard*` phase/transition/kinds defined nowhere in the branch. Hard blocker. |
| 22 | `@flighthq/lifecycle` | 2 | **REVISE** | Well-crafted; doesn't compile — new type surface (`AppLaunchKind`/`AppMemoryPressure`, 3 signals, 2 backend methods) never added to `@flighthq/types`. |
| 23 | `@flighthq/network` | 2 | **REVISE** | Canonical Flight runtime, but the `@flighthq/types/Network.ts` hunk was dropped — ≥9 undefined type members; does not typecheck. |
| 24 | `@flighthq/protocol` | 2 | **REVISE** | AAA-tested custom-scheme additions; imports `ParsedProtocolUrl` + five new `ProtocolBackend` methods the same change never adds to `@flighthq/types`. |
| 25 | `@flighthq/shell` | 2 | **REVISE** | Source advanced to expanded surface (4 types, 4 backend methods) but `@flighthq/types` `Shell.ts` + host-electron wiring left at base; delta's docs falsely claim the types present. |
| 26 | `@flighthq/host-electron` | 2 | **REVISE** | One file pair: a clean `updateNotification` add + a half-landed `requestPermission` retype that no longer conforms to the `NotificationBackend` seam and breaks its own tests. |
| 27 | `@flighthq/velocity` | 2 | **REVISE** (70) | Correct, tested affine-reprojection math, but ships unreachable (barrel never updated → dead exports), contributor is misnamed (stores origin velocity), and has an inline structural matrix-type leak. |
| 28 | `@flighthq/clip` | 2 | **REVISE** (78) | _(prior)_ Mergeable after two in-cell MAJOR fixes (contour false-positive in `clipRegionContainsRectangle`; silent borrow in `createClipRegionFromContours`) + one honest-comment fix in `intersectClipRegions`. |
| 29 | `@flighthq/textinput` | 8 | **REJECT** | AAA feature expansion (word/vertical motion, undo/redo, clipboard) that doesn't compile — grew without its `@flighthq/types` header and leaves eight implemented+tested functions out of the barrel. |
| 30 | `@flighthq/textlayout` | 8 | **REJECT** | Strong feature delta (justify, bullets, maxLines truncation) but imports `TextDirection`/`TextJustification`/`TextFormat.listMarker`/`TextLayoutParams` fields absent from this `@flighthq/types` — does not compile. |
| 31 | `@flighthq/text` | 7 | **REJECT** | High-value entity-surface delta; the text half landed without its `@flighthq/types` companion (`TextFieldSignals` + events, `RichTextRuntime` slot) — 4 typecheck + 1 manifest failures. |
| 32 | `@flighthq/application` | 4 | **REJECT** | Good design; source rewrite landed without its `@flighthq/types` half (`LoopBackend`, `ApplicationLoopOptions`) — does not compile at head. |
| 33 | `@flighthq/clipboard` | 4 | **REJECT** (35) | `ClipboardWatch`/`ClipboardWriteItem` + extended `ClipboardBackend` dropped in integration; `Clipboard.ts` byte-identical to base — head does not typecheck. |
| 34 | `@flighthq/device` | 4 | **REJECT** | Rewrites the API against `@flighthq/types` symbols never added (`DeviceCapabilities`, `DeviceFormFactor*`, expanded `DeviceInfo`/`DeviceBackend`) AND depends on the structurally-rejected `device-formats`. |
| 35 | `@flighthq/dialog` | 2 | **REJECT** | Sound, charter-aligned redesign; the `@flighthq/types` half (`FileDialogHandle` et al.) was dropped — `dialog.ts` + `filesystem.ts` + 3 tests import phantom types. |
| 36 | `@flighthq/geolocation` | 2 | **REJECT** (35) | Solid craft; the `@flighthq/types` `Geolocation` header it imports was dropped — tree does not typecheck. |
| 37 | `@flighthq/haptics` | 2 | **REJECT** | Imports `HapticsCapabilities` + 6-method-extended `HapticsBackend` from a `Haptics.ts` byte-identical to base — both source and test fail `tsc -b`. |
| 38 | `@flighthq/loader` | 2 | **REJECT** | Consumes a six-type `@flighthq/types` header + three new signals never committed, imports a non-existent `disconnectAllSlots`, and ships a dead byte-progress tier. |
| 39 | `@flighthq/log` | 4 | **REJECT** | Head doesn't compile — imports 7 `@flighthq/types` `Log` types defined nowhere (types files dropped); also 3 banner-divider comments violate Source Style. |
| 40 | `@flighthq/notification` | 2 | **REJECT** | Strong source; head doesn't typecheck — five `@flighthq/types` notification types + a ~20-method `NotificationBackend` dropped on the way in. |
| 41 | `@flighthq/platform` | 4 | **REJECT** | Consumes a 13-field `PlatformInfo` + three new unions while `Platform.ts` is still the 6-field base (types commit lost); also re-introduces fork-E-rejected `platform-formats`. |
| 42 | `@flighthq/power` | 2 | **REJECT** | Source references a `@flighthq/types` power header (4 new modules + widened `PowerStatus`/`PowerBackend`/`Power`) entirely absent from the branch — cannot typecheck. |
| 43 | `@flighthq/screen` | 4 | **REJECT** | `src/` merged at the 25-field/signals/multi-monitor revision but NOT its `@flighthq/types` half — neither `screen.ts` nor its test typechecks. |
| 44 | `@flighthq/sensors` | 2 | **REJECT** | Good code; `@flighthq/types/Sensors.ts` changes dropped (byte-identical to base) — 7 missing types + all new fields/signals/backend methods; also a dead-equal ternary. |
| 45 | `@flighthq/share` | 4 | **REJECT** | Implementation without its `@flighthq/types` half (`ShareFile`/`ShareResult`/`ShareOptions`/extended `ShareBackend`/`ShareSignals` all absent) — cannot `tsc -b`. |
| 46 | `@flighthq/shortcut` | 4 | **REJECT** (30) | Sound rewrite; its `@flighthq/types` header + host-electron adapter never merged, and the test imports a non-existent `disconnectAllSlots`. Docs' "types VERIFIED" claim false against head. |
| 47 | `@flighthq/statusbar` | 4 | **REJECT** | Imports five `@flighthq/types` symbols + four backend methods/params never committed to `StatusBar.ts` in this bundle. |
| 48 | `@flighthq/storage` | 3 | **REJECT** (30) | Source+test merged without its `@flighthq/types` companion (5 undefined types + 2 missing `StorageBackend` members) and imports a non-existent `disconnectAllSlots`. |
| 49 | `@flighthq/timeline` | 4 | **REJECT** | Strong feature (armed signals, frame scripts, playMode); half-merge — consumes `Timeline` fields + types (`FrameScript`/`TimelineSignals`/`TimelineFrameEvent`) that don't exist in this `@flighthq/types`. |
| 50 | `@flighthq/tray` | 2 | **REJECT** | `@flighthq/types/Tray.ts` extension (19-method `TrayBackend`, `TrayCapabilities`/etc.) dropped during integration — imports types that exist nowhere; also an inline rect literal instead of `RectangleLike`. |
| 51 | `@flighthq/updater` | 2 | **REJECT** | Rich new surface in `updater.ts`/test but its matching `@flighthq/types/Updater.ts` rewrite did not land — does not typecheck or build. |
| 52 | `@flighthq/device-formats` | 6 | **REJECT** | A blessed `rejected` boundary (no plurality, `-formats` on a UA string) that also doesn't compile (phantom `DeviceFormFactor` imports). Re-home parsers verbatim into a shared `useragent` leaf; do not merge as a package. |
| 53 | `@flighthq/platform-formats` | 6 | **REJECT** | Doesn't compile (three `@flighthq/types` unions defined nowhere) and is the other half of the register-rejected UA parser — collapse into `useragent`. |
| 54 | `@flighthq/app` | 2 | **REJECT** | _(prior)_ High-quality `app.ts`/`app.test.ts`, but the tree dropped the `@flighthq/types` `App` header it compiles against — `tsc -b` fails. Re-land header (from builder); implementation approve-as-is. |
| 55 | `@flighthq/filters-css` | 1 | **REJECT** | _(prior)_ A single broken `index.ts` re-exporting eight symbols from a non-existent `./svgFilterUrl`. Revert the barrel or land `svgFilterUrl.ts` + tests as a coherent unit. |

**Full tally (55):** clean(1) · revise(27) · reject(27). _(Batch this session: clean(1), revise(26), reject(25); plus the 3 prior: `clip` revise, `app`+`filters-css` reject.)_

---

## 2. Cross-cutting themes — the standards most violated across the full slice

Now that all 52 remaining cells are reviewed, the pattern is overwhelming and lopsided. **The dominant fault is not a design-standard violation at all — it is a merge-integrity defect.** The house standards (naming, tree-shaking, registry-vs-union, composition) held up _remarkably_ well; the slice mostly failed at _building_.

### T1 — Contract hygiene: the header dropped on the merge (THE theme — ~33 of 55 cells)

The single most-repeated failure, by an order of magnitude, is **a `@flighthq/types` consumer merged without its producer**: the implementing package and its tests were advanced to a new surface, but the matching `@flighthq/types` header hunk never landed in `b2824e3d8`, so `tsc -b` fails. The header file is byte-identical to base in case after case while the implementation imports symbols that exist nowhere in the branch. This is **every reject in the platform/text/animation bands** and a large share of the revises:

- **Rejects from this fault:** `clipboard`, `device`, `dialog`, `geolocation`, `haptics`, `loader`, `log`, `notification`, `platform`, `power`, `screen`, `sensors`, `share`, `shortcut`, `statusbar`, `storage`, `timeline`, `tray`, `updater`, `application`, `text`, `textinput`, `textlayout` — plus the prior `app`.
- **Revises from the same fault** (smaller blast radius, otherwise clean): `types`-adjacent consumers `sprite`, `resources`, `ipc`, `filesystem`, `input`, `keyboard`, `lifecycle`, `network`, `protocol`, `shell`, `texture`, `surface`, `render-gl`.

**This is a real merge blocker for every cell it touches** — a non-building package cannot enter the approved floor. It is _also_ the codebase map's explicit gate (`@flighthq/types` is "the header layer … the full API shape should be navigable from it alone"). Per §0 these are independent `tsc -b` bugs, not the stranded-core theory — but the _volume_ (≈60% of the slice) makes the **process fix** (T1 question below) the highest-value direction outcome of this whole review.

A linked sub-fault: a **half-landed `@flighthq/signals` rename** — `disconnectAllSlots` is imported by `shortcut`, `storage`, and `loader` but signals exports `disconnectAllSignals`. One seam decision fixes three cells.

### T2 — Contract honesty: docs/status claiming work the tree doesn't contain (~8 cells)

A distinct and corrosive pattern: the carried-in `status.md`/review docs assert work that is **absent from the integrated tree** — "types added", "54 tests pass", "types VERIFIED", a `completeness.test.ts` that doesn't exist. Seen in `texture`, `clipboard`, `shortcut`, `geolocation`, `sdk`, `protocol`, `shell`, `notification`. These claims were verified against a _different_ SHA (usually builder) and are false against `b2824e3d8`. **Real blocker only where it masks T1** (it usually does); always an honesty fix the log must carry. Also includes dishonest _code_ comments/names: `filesystem`'s `findFiles` returns directories; `velocity`'s `contributeAffineVelocity` stores origin (not affine) velocity; `render`'s `computeRenderProxyWorldBounds` claims a world AABB but writes a zero-size local point.

### T3 — Dead / unreachable feature paths (composition-adjacent, ~5 cells)

Features implemented and tested but **never wired to their call site or barrel**, so they are reachable only from their own tests: `scene-gl`'s entire `HAS_UV1` shader path (never threaded into `bind()`); `velocity`'s two new exports (barrel never updated); `surface`'s `surfaceWarp` (never barrel-wired); `spritesheet-formats`/`resource-formats`'s dead `xmlParse.ts` re-export. **Real blocker** — a dead export is dishonest surface. Fix is mechanical (wire it or strip it), but the _decision_ of which sometimes needs the user (e.g. scene-gl uv1 seam shape).

### T4 — Missing tests on new exports (`exports:check` gate, ~2 cells)

`filters` ships ~30 new exports across six files with **zero** colocated tests; `spritesheet-formats` ships 8 untested exports. **Hard blocker** — `npm run check` fails by construction. Pure within-package work, no design call.

### T5 — Triad / plurality / bedrock: the `-formats` cells should not be packages (3 cells)

`device-formats`, `platform-formats`, and `resource-formats` are all in the delta and all fail the **bedrock/plurality test** (structural-fork E). Per `register.md`: `device-formats` + `platform-formats` are **rejected** ("blood-from-a-stone: split a subject with no plurality, misnamed `-formats` on a UA string") → collapse into a new `useragent` value-leaf; `resource-formats` is a **redirect** → `textureatlas-formats` _after_ `textureatlas` is extracted from `resources` — and in _this_ delta it was stripped to a bare XML parser, so it is now better named `xml`. **Gating for those 3 packages**: merging them as-is lands already-rejected boundaries onto the approved floor. `device` and `platform` both _depend_ on the rejected cells, coupling their rejects to this decision.

### T6 — Naming / verbs / out-param alias-safety / tree-shaking / registry-vs-union: PASS (record as clean)

Worth recording as a **clean axis** across all 55: full unabbreviated type words, correct `get*`/`has*`/`is*`/`create*`/`dispose*`/`destroy*` verbs, alias-safe `out`-params, `Readonly<>`/`*Like` splits, `"sideEffects": false`, thin single-`.` barrels, and pools/constants at file bottom held up almost everywhere. The few exceptions are local nits (velocity's structural matrix-type leak; tray's inline rect literal vs `RectangleLike`; clip's mutable-param borrow) — not systemic. **Registry-vs-union** mostly held (sprite/spritesheet-formats use fork-B registries correctly); the lone latent fork is `filters`'s four closed dispatchers re-closing the deliberately-open `BitmapFilter` contract — a charter question, not a merge blocker. **No new monolith-smell surfaced.** The harsh bar found the slice _well-designed_ and _badly-merged_.

---

## 3. Feedback & questions for the user — grouped by recurring Open direction

### A. Merge-integrity process (GATING for the whole slice — answer first)

1. **Make "a `@flighthq/types` header and its implementer land together" a build-gate CI rule.** This is the dominant finding — ~33 of 55 cells reject/revise _solely_ because a types hunk was dropped on the merge while the consumer advanced. A per-package gate that fails CI when head `@flighthq/types` does not resolve each package's imports would have caught all of them before integration. **This single process fix recovers the majority of the slice.** (Raised by nearly every brief; the `dialog` brief proposes the exact check.)
2. **Resolve the half-landed `disconnectAllSlots`↔`disconnectAllSignals` rename at the signals seam** — one decision unblocks `shortcut`, `storage`, and `loader` together. Rename the export to `disconnectAllSlots` and update callers, or revert the three imports to `disconnectAllSignals`.

### B. The `-formats` triad — bedrock / plurality (GATING for those 3 packages + device/platform)

3. **Bless the `device-formats` + `platform-formats` → `useragent` collapse?** Both are register-rejected (no plurality, `-formats` misnaming a UA string). The fix re-homes the (good) parsers verbatim into a single `useragent` value-leaf used only by the _web backends_ of `device`/`platform`. This **deletes two packages** that `device`/`platform` depend on → needs your explicit verbal gate before execution. Until blessed, **hold all four** (`device-formats`, `platform-formats`, `device`, `platform`) out of the merge. Also confirm the canonical `DeviceFormFactor` value set (Car/Desktop/Phone/Tablet/TV/ Unknown/Watch) before it freezes into `@flighthq/types` as the serialized vocabulary.
4. **`resource-formats` → rename to `xml`, not `textureatlas-formats`.** This delta _removed_ the atlas codecs, leaving a generic XML parser. The register's redirect (`→ textureatlas-formats`, after `textureatlas` is extracted) is now **stale** — re-baseline that row against `b2824e3d8`. The honest name today is `xml`, with the real `*-formats` packages composing it; also move `XmlElement` into `@flighthq/types` (it crosses a boundary). Confirm the rename + the `XmlElement` rehome together.

### C. Registry-vs-union fork (non-gating — record)

5. **`@flighthq/filters`: four dispatchers (`normalizeBitmapFilter`, `getBitmapFilterMargin`, `isValidBitmapFilter`, `isBitmapFilter`) re-close the deliberately-open `BitmapFilter` contract with hardcoded switches** — a vendor-prefixed custom kind cannot normalize/validate/margin. Keep closed switches (built-in set closed by design) or move to an open registry keyed by kind? Same question applies to `filters-canvas`'s 14-arm `switch(filter.kind)` — settle once, consistently across all four filter-backend cells. Also: `BitmapFilterMargin` is a cross-package type declared inline in `filters` — move to `@flighthq/types` now or at first backend consumption?

### D. Naming / seam-shape rulings (non-gating — record, do not act autonomously)

6. **`updateNotification`/`NotificationBackend.requestPermission` identity & tri-state.** Is a notification keyed by user-supplied `tag` or host-assigned `id`? (decides whether the `types` must-fix is a rename or a seam reshape). Separately, `requestPermission` is `Promise<boolean>` in `types` but tri-state `Promise<NotificationPermission>` in both the web backend and host-electron — the integration is internally inconsistent; pick one. This is a `@flighthq/types` decision, not host-electron's.
7. **Velocity contributor semantics** — should `contributeAffineVelocity` store per-anchor velocity (honoring a pivot) with per-pixel reprojection living only in `getVelocitySampleAt`? Decides rename-vs-rework. **`scene-gl` pools** — make `opaquePool`/`blendedPool` real `acquire`/`release` brackets or drop them for per-frame arrays (they never recycle today). **`textshaper-canvas` `FontMetrics.unitsPerEm`** — carve out `0 = unavailable, do not invert`, or bless identity-size? **`surface` edge vocab** — one canonical `SurfaceEdgeMode` shared by warp + convolution + future ops? **Stem unification** (`clearGeoWatch`→`clearGeolocationWatch`, etc.) across geolocation.
8. **Charter-level carry-forwards** that no delta touches: clip's exact boolean algebra (Open #1) and `number[][]`→`Float32Array` contour storage; the render-gl `makeGlState` production-barrel question; displayobject-gl's eliminate-all-raster north-star; resources→per-subject-triad dissolution. Record; do not act.

---

## 4. Dispatch plan — staged briefs ready for `assign:worktree`

All 55 briefs are staged under `outgoing/integration/<pkg>.md`, each a file-and-line-specific work order against the integration tree. Grouped by verdict (reject → revise → clean). **Gate before dispatching the `-formats` four:** answer §3-B first (they may be held out entirely).

### REJECT — header/seam re-land or boundary decision before retry (27)

Most are the **same one-line fix**: re-land the dropped `@flighthq/types` header (recover the exact shapes from builder-`67dc46d64`), then `tsc -b`/`packages:check`/`exports:check` green. The implementations are approve-as-is.

- **Header dropped (re-land types + verify build):** `outgoing/integration/{application,clipboard, device,dialog,geolocation,haptics,loader,log,notification,platform,power,screen,sensors,share, shortcut,statusbar,storage,timeline,tray,updater,text,textinput,textlayout,app}.md` _(within these: `shortcut`+`storage`+`loader` also fix the `disconnectAllSlots` import; `log` strips 3 banner comments; `loader` finishes-or-cuts the byte-progress tier; `device`/`platform` are gated on §3-B.)_
- **Boundary-decision rejects (gated on §3-B — do NOT dispatch as packages):** `outgoing/integration/{device-formats,platform-formats}.md` — re-home parsers into `useragent`.
- **Barrel/unit reject:** `outgoing/integration/filters-css.md` — revert to base barrel OR land `svgFilterUrl.ts` + tests as a coherent unit (also unblocks `filters-canvas`).

### REVISE — in-cell (or small types) fixes, then merge (27)

- **Header/build fixes (land the small types surface, then merge):** `outgoing/integration/{types, resources,sprite,ipc,filesystem,texture,surface,render-gl,input,keyboard,lifecycle,network,protocol, shell,host-electron}.md`
- **Wire-the-dead-path / order / test fixes (pure within-package):** `outgoing/integration/{scene-gl, filters,filters-canvas,spritesheet-formats,render,velocity,surface-rs,textshaper,textshaper-canvas, resource-formats,sdk,clip}.md` _(`filters`+`spritesheet-formats`: add the missing colocated tests, T4; `scene-gl`: wire `HAS_UV1` + capture the blended-pass baseline; `velocity`/`surface`: barrel-wire; `render`: real world bounds; `surface-rs`: revert the 5-arg `floodFillSurface`; `resource-formats`: gated on the §3-B-4 rename.)_

### CLEAN — merge as-is (1)

- **`outgoing/integration/displayobject-gl.md`** — approve (84/100); optionally fix the one inaccurate "private" word in the `glTestHelper.ts` docstring in the same pass.

---

## Executive summary (12 lines)

1. Per §0 of the companion, the structure is settled: integration is the **deliberately-curated baseline**, builder is the abandoned WIP; the slice present is the right unit to review.
2. All 55 packages now have harsh verdicts: **clean(1) · revise(27) · reject(27)**.
3. The dominant finding is **not** a design fault — it is a **merge-integrity defect**: ~33 cells reject/revise solely because a `@flighthq/types` header was dropped while its consumer advanced.
4. Every one of those is a hard `tsc -b` failure → a non-building package; the fix is to re-land the header (recoverable verbatim from builder-`67dc46d64`), not to redesign.
5. A single **CI build-gate rule** ("header lands with its implementer") would have caught the majority of the slice — the highest-value direction outcome of this review.
6. A linked one-decision fix — the `disconnectAllSlots`↔`disconnectAllSignals` signals rename — unblocks `shortcut`, `storage`, and `loader` together.
7. The three `-formats` cells (`device-formats`, `platform-formats`, `resource-formats`) are bedrock/plurality failures and **must not land as packages**; they gate `device`/`platform` too.
8. Honesty drift is real and recurring: status/review docs claim work (types added, tests pass) that is **absent** from `b2824e3d8` — verified against a different SHA.
9. Dead/unreachable feature paths (scene-gl `HAS_UV1`, velocity exports, surface `warp`) and zero-test new exports (`filters`, `spritesheet-formats`) are mechanical but real blockers.
10. The house design standards — naming, verbs, out-param alias-safety, tree-shaking, registry-vs-union, composition — **held up across the slice**; the failures are integrity and honesty, not design.
11. Dispatch: 27 reject briefs (mostly "re-land the header"), 27 revise briefs (small types or within-package), 1 clean — all staged under `outgoing/integration/`, ready for `assign:worktree`.
12. **Gate before dispatching the `-formats` four** on §3-B; everything else is dispatchable once the header-re-land process question (§3-A) is blessed.
