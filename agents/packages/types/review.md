---
package: '@flighthq/types'
status: solid
score: 88
updated: 2026-07-13
ingested:
  - charter.md
  - status.md
  - source (live tree, structural sample of 545 files)
  - prior review.md (integration-b2824e3d8 merge gate, 2026-06-25)
  - conventions/types-layout.md
---

# types — Review (live tree, structural)

Re-review of the live tree after ~83 commits since the 2026-06-25 merge-gate review. With 545 source files this is a **structural** survey — organization, coverage, naming symmetry, and drift — sampled, not enumerated.

## Verdict

`solid — 88/100`. The header layer is structurally healthy and delivers its defining promise: 544 concept files + a complete barrel (544 `export *` lines, zero orphans, verified mechanically), zero runtime dependencies, no `@flighthq/*` imports anywhere in source (self-contained), `sideEffects: false`. The filters→adjustments/effects dissolution left **no orphaned filter types** — `BitmapFilter` and the filters-era surface are cleanly gone, and the `Adjustment` family (base contract + per-variant files) is textbook layout. All five 2026-07-02 Approved items verified landed. What keeps it from higher: two **orphaned signal types** documenting an API that does not exist, a **casing split between sibling codec vocabularies**, and lowercase Flight-owned kind vocabularies in newer files.

## Present capabilities (structural evidence)

- **Barrel completeness — mechanically verified.** Every non-test source file is re-exported from `index.ts`; no dead files.
- **Entity quartets intact.** Sampled `Bitmap.ts` (`BitmapData`/`BitmapRuntime`/`Bitmap`/`BitmapKind` in one file), `Rectangle.ts` (`Rectangle extends Entity` + `RectangleLike = EntityWithoutRuntime<Rectangle>`). Quartets are never split.
- **Open contracts + string kinds.** 68 files export `*Kind` constants; ~90 variant files across the Effect/Material/Adjustment families, each 1:1 per-concept; 52 capability `*Backend` seam files. `SpritesheetFormatKind = string` with PascalCase built-ins remains the fork-B exemplar. `BlendMode` was converted to a const namespace + open string (d6927f58) per the types-layout casing rule.
- **Coverage of new packages is complete.** Every recent package has a header home: `Spring.ts`, `Camera2D.ts`, `Flow.ts`, `Snapshot.ts`, `Spatial.ts`, `Collision.ts`, `Assets.ts`, `GlyphSource`, `MotionPath`, `Clock`, `BinPack`, plus the text-stack additions (`TextDirection.ts`, textbidi, textsegment, markup). The "navigable from types alone" promise holds on sampling.
- **Contract tests.** 10 type-level test files (`Entity`, `Material`, `RenderEffect`, `Signal`, `Node`, `PartialNode`, `MethodsOf`, `ParticleForce`, `Adjustment`, `Bitmap`) encoding the load-bearing structural invariants — exactly the posture Decision #2 blesses.
- **Approved items all landed** (verified in source): notification `id` seam; ParticleForce/ParticleCollider "Closed by design" rationale comments; Dom PascalCase filenames; `TextDirection` extracted to its own file (now also `'TopToBottom'`) and referenced from `ShapedRun`/`TextShaper`; `glyphCount` documented ("glyphs may be over-allocated as a reusable buffer").

## Gaps / drift

1. **Orphaned `SignalConnection.ts` + `SignalScope.ts`.** Zero consumers anywhere in `packages/*/src` outside types itself. Worse than dead weight: their doc comments describe behavior the live `@flighthq/signals` does not have — "A handle returned by `connectSignal` and `connectSignalOnce`" (live `connectSignal` returns `void`; `connectSignalOnce` does not exist). These are residue of the never-landed builder-67dc46d64 handle/scope surface. The header now **lies about the API**. Either the signals package grows handles (a signals charter question) or these files go.
2. **Sibling codec vocabularies disagree on casing.** `SpritesheetFormatKind*` uses PascalCase values (`'Aseprite'`, `'Starling'`) while `TextureAtlasFormatKind*` uses lowercase (`'aseprite'`, `'starling'`) — the *same external formats* spelled two ways in two neighboring vocabularies. Per types-layout, a Flight-owned enum concept is PascalCase; the lowercase family is the drift.
3. **Lowercase Flight-owned kind vocabularies in newer files.** `CollisionShapeKind = 'circle' | 'aabb' | 'obb' | …`, `MessageDialogKind = 'info' | …`, `PlatformKind = 'desktop' | …`, `AppPathKind`, `FileSystemPathKind`, `AppLaunchKind`, `SoftKeyboardEasing*Kind` (`'ease'`, `'easeIn'`). Some may pass the "relaying a foreign string" test (a few map to web-platform vocabularies), but `CollisionShapeKind` at least is unambiguously Flight-owned and should be PascalCase per the convention. A per-vocabulary enum-type-vs-string-value adjudication sweep is due.
4. **Domain-file grouping in the game headers.** `Flow.ts`, `Collision.ts` (84 lines: kind + six shape types + union + manifold), `Spatial.ts`, `Assets.ts` group a whole package's header into one file rather than one concept per file. Defensible under the "finite vocabulary / capability home" allowances and each is well-documented — but `Collision.ts` is at the boundary where the convention would split (each shape is a variant-like concept). An observation, not a violation; worth a ruling before the pattern spreads.
5. **`RenderViewport2D` Rectangle-duplicate still standing.** Exact `{x, y, width, height}` shape, unchanged since Decision #3 named it consolidation debt. `SurfaceRegion` (+`surface`) and `TextSelectionRectangle` (+`lineIndex`) add fields so they are legitimate under the Decision — though they re-declare the four fields rather than `extends Rectangle`, likely because `Rectangle extends Entity` and these are plain data; the Decision's "extends" prescription doesn't account for the entity/plain-data split.
6. **`CollisionObb` abbreviated fields.** `halfW`/`halfH` — the only abbreviated field names found in sampling; the codebase spells out `halfExtents`/`width` elsewhere.

## Charter contradictions

None found. The five North-star principles are honored on sampling; Decisions #1–#6 are all realized in source (notification `id`, closed particle unions; the Rectangle posture is *acknowledged debt*, not contradiction). One nuance: Decision #3's "add fields → `extends Rectangle`" is structurally impossible for plain-data (non-entity) region types since `Rectangle extends Entity` — the Decision's prescription needs a footnote, not the code.

## Contract & docs fit

- **Contract:** zero deps, single `.` export, `sideEffects: false`, no impl leaks (grep-verified no `@flighthq/` imports), filename=type on sampling (apparent mismatches — `Tilemap.ts` leading with `TilemapData`, `Net.ts` with `NetMethod` — are the quartet/capability-home patterns, not violations). Strong fit.
- **Candidate doc revisions:** (a) the charter says "~478 source files" — now 545; (b) charter Open direction #2 (TextDirection) is done and can be retired; (c) the types-layout doc could record the domain-file allowance boundary the game headers are testing (finding 4).

## Candidate open directions

1. **Signal handle surface: build or delete.** `SignalConnection`/`SignalScope` must stop describing a phantom API. This is really a *signals* charter fork (does the lean core grow handles/scopes?) with a types-side consequence either way.
2. **Kind-casing adjudication sweep.** Decide per-vocabulary (finding 3) which lowercase unions are Flight-owned enums (→ PascalCase, e.g. `CollisionShapeKind`, one of the two atlas-format vocabularies) vs foreign-string relays (→ keep source form). These are serialized values — a sweep is cheap now and expensive after shipping.
3. **Domain-file vs per-concept ruling for game headers.** Bless or split the `Flow.ts`/`Collision.ts`/`Spatial.ts`/`Assets.ts` grouping style before more packages copy it.
4. **Amend Decision #3 for plain-data regions.** Record that non-entity region types re-declare the four fields (cannot `extends Rectangle`), so future reviewers don't flag `SurfaceRegion` as debt.
