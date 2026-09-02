---
package: '@flighthq/types'
status: solid
score: 89
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - assessment.md
  - source (live tree, 957 concept files)
  - prior review.md (structural survey, 2026-07-13)
  - conventions/types-layout.md
---

# types — Review (live tree, structural)

Re-review of the live tree after significant growth since the 2026-07-13 structural review. The package nearly doubled from 545 to 957 concept files. With 957 source files this is a **structural** survey -- organization, lane compliance, naming symmetry, and drift -- sampled, not enumerated.

## Verdict

`solid -- 89/100`. The header layer is structurally healthy and continues to deliver its defining promise: 957 concept files, a complete two-lane barrel (922 public `export *` lines in `index.ts`, 958 contract `export *` lines in `contract.ts`, 36 contract-only types, zero orphans in either lane -- verified mechanically), zero runtime dependencies (only `@webgpu/types` as peer), no `@flighthq/*` imports anywhere in source (self-contained), `sideEffects: false`. The biggest gap from the prior review -- `SignalConnection` and `SignalScope` describing a phantom API -- is **resolved**: `connectSignalTracked`, `createSignalScope`, and `disconnectSignalScope` all exist in `@flighthq/signals` with tests. What keeps it from higher: a **persistent casing split** across kind vocabularies that has had two months to spread without a sweep, a **665-line domain file** (`Collision.ts`) that has grown far past the convention's split threshold with no ruling, and the continuing `RenderViewport2D` Rectangle-duplicate debt.

## Present capabilities (structural evidence)

- **Barrel completeness -- mechanically verified.** Every non-test source file is re-exported from `contract.ts` (958 lines for 957 concept files). `index.ts` carries 922 of these in the public lane; the remaining 36 are contract-only, primarily render internals (`RenderProxy`, `RenderQueue`, `GlContextState`, `WgpuDeviceState`), host-specific capability generics (`ElectronAppCapabilitiesFor`, `CapacitorAppCapabilitiesFor`, `TauriAppCapabilities`), and selection runtimes. The two-lane split is clean.
- **Entity quartets intact.** Sampled `Bitmap.ts`, `Notification.ts`, `Mesh.ts` -- all carry their quartet pattern (`*Data`/`*Runtime`/entity/`*Kind`). `Notification` and `ScheduledNotification` are Entity-backed with `id` identity, matching charter Decision on notification identity.
- **Open contracts + string kinds.** 20 standalone `*Kind` files, plus many more `*Kind` constants inline in their concept files. Sampled `SpritesheetFormatKind`, `TextureKind`, `DisplayObjectKind`, `StandardPbrMaterialKind` -- all PascalCase values as specified. 21 `*Backend` seam files for platform capabilities.
- **Signal handle surface now backed.** `SignalConnection.ts` documents `connectSignalTracked` (the function that now exists in `@flighthq/signals/src/connection.ts`), and `SignalScope.ts` documents `createSignalScope`/`disconnectSignalScope` (both exported from `@flighthq/signals`). The doc comments in these type files now match the live implementation. This resolves the prior review's top finding.
- **Coverage of new packages is thorough.** Recent additions verified in source: `FlightDocument` family (11 files: `FlightDocument.ts`, `FlightDocumentLayout.ts`, `FlightDocumentToken.ts`, `FlightDocumentFieldSchema.ts`, `FlightDocumentInteractiveState.ts`, `FlightDocumentResource.ts`, etc.), `GizmoAlignment.ts` and `GizmoState.ts`, `GuiController.ts` and `GuiDialog.ts`, `DisplacementEffect.ts`, `InteractionDispatchLayer` additions in `InteractionManager.ts`. The "navigable from types alone" promise holds on sampling.
- **Contract tests.** 39 type-level test files (up from 10), covering structural invariants across entities, materials, effects, modifiers, signals, nodes, sprites, layout, and the FlightDocument family. The posture Decision #2 blesses is well-executed.
- **Header self-containment holds.** `grep -rn '@flighthq/' packages/types/src/` finds only doc comments referencing other packages for context -- no `import` from any `@flighthq/*` package exists in any non-test source file. `package.json` declares no `@flighthq` dependency.
- **Approved items from assessment all landed.** Notification `id` seam, ParticleForce/ParticleCollider closed-by-design rationale, Dom PascalCase filenames, `TextDirection` extraction, `glyphCount` documentation -- all verified in source.

## Gaps / drift

1. **Sibling codec vocabularies still disagree on casing.** `SpritesheetFormatKind` uses PascalCase values (`'Aseprite'`, `'Starling'`, `'TexturePacker'`) while `TextureAtlasFormatKind` uses lowercase (`'aseprite'`, `'starling'`, `'texturePacker'`) -- the same external formats spelled two ways in neighboring vocabularies. Unchanged since the prior review. Per types-layout, these are serialized kind values and should be PascalCase.

2. **Lowercase Flight-owned kind vocabularies persist and have spread.** `CollisionShapeKind2D` = `'circle' | 'aabb' | 'obb' | 'capsule' | 'polygon' | 'segment' | 'point'`, `PlatformKind` = `'desktop' | 'mobile' | 'web' | 'unknown'`, `MessageDialogKind` = `'info' | 'warning' | 'error' | 'question'`, `AppLaunchKind` = `'cold' | 'warm'`, `FileSystemPathKind` = `'home' | 'documents' | ...`, `AppPathKind` = `'userData' | 'logs' | 'crashDumps'`, `GamepadMappingKind` = `'standard' | 'raw' | ''`, `CanvasImageSourceKind` = `'data' | 'element'`, `DomImageSourceKind` = `'data' | 'element'`. Some may relay foreign strings (GamepadMappingKind mirrors the W3C Gamepad API), but `CollisionShapeKind2D`, `MessageDialogKind`, `AppLaunchKind`, and `AppPathKind` are unambiguously Flight-owned and should be PascalCase per the types-layout casing rule. The sweep has not happened and the inventory has grown since the prior review.

3. **`Collision.ts` has grown to 665 lines.** Up from 84 lines at the prior review, it now carries `CollisionShapeKind2D`, six 2D shape interfaces, the built-in and vendor shape unions, `CollisionManifold2D`, `CollisionRaycastHit2D`, `CollisionSupport2D`, `CollisionTest2D`, `CollisionTestGuard2D`, plus a mirrored 3D set. The types-layout convention specifies one concept per file; at 665 lines with two full dimension families, this file is well past the boundary where the convention would split. `Collision.ts` started as a defensible capability-home grouping when it was small and all-2D -- it is no longer either.

4. **`RenderViewport2D` Rectangle-duplicate still standing.** Exact `{x, y, width, height}` shape with no additional fields, unchanged since charter Decision #3 named it consolidation debt. Cross-package, so not within-types to fix alone.

5. **Header closure remains unenforced.** No `headerClosure.test.ts`, no script rule, no `packages:check` extension validates that no file in `types/src/` imports from `@flighthq/*`. The promise holds by convention -- verified by grep -- but nothing catches the first violation. Status flagged this; charter Open direction #4 describes the enforcement.

6. **`CollisionObb2D` abbreviated fields.** `halfW`/`halfH` remain -- the only abbreviated field names found in sampling. The convention spells out `halfWidth`/`halfHeight` (as seen in `Camera3D.ts:36` and `OrthographicProjectionOptions.ts:3-4` within this same package).

7. **Scene versioning still absent.** `SceneVersion` and `SceneMigration` appear nowhere in `types/src/`. The `Scene3DDocument.ts` IR is complete for import but carries no migration contract.

## Charter contradictions

None found. The five North-star principles are honored on sampling. Decisions #1-#6 are all realized in source (notification entity identity, closed particle unions, Signal divergence documented, Rectangle posture acknowledged as debt). The signal-handle gap that nearly bordered on contradiction (types describing a nonexistent API) is resolved -- `SignalConnection` and `SignalScope` now accurately describe the live `@flighthq/signals` surface.

One nuance persists from the prior review: Decision #3's "add fields -> `extends Rectangle`" is structurally awkward for plain-data (non-entity) region types since `Rectangle extends Entity`. The Decision's prescription needs a footnote, not a code change.

## Contract & docs fit

- **Contract:** zero `@flighthq` deps, two-lane export (`"."` + `"./contract"`), `sideEffects: false`, `@webgpu/types` as peer only, no impl leaks (grep-verified). Filename=type on sampling; apparent mismatches are quartet/capability-home patterns, not violations. Strong fit.
- **Candidate doc revisions:** (a) charter says "~478 source files" -- now 957; (b) charter Open direction #2 (TextDirection) was completed and can be retired; (c) status Open bullet on `SignalConnection`/`SignalScope` can be retired (the backing API now exists); (d) the types-layout doc could record a domain-file size boundary the `Collision.ts` growth is testing.

## Candidate open directions

1. **Kind-casing adjudication sweep.** The inventory of lowercase Flight-owned kind vocabularies has grown since the prior review without a sweep. Each vocabulary needs a per-vocabulary ruling: Flight-owned enum (-> PascalCase, e.g. `CollisionShapeKind2D`, `MessageDialogKind`, `AppLaunchKind`, `AppPathKind`) vs foreign-string relay (-> keep source form, e.g. `GamepadMappingKind`). These are serialized values -- a sweep is cheap now and expensive after shipping.

2. **Split `Collision.ts`.** At 665 lines it is no longer a small capability-home grouping. It carries two full dimension families (2D and 3D) with six shape interfaces each, plus manifolds, raycasts, support functions, and test guards. The types-layout one-concept-per-file convention would split at least the 3D family into a `Collision3D.ts`, and potentially separate shape types into per-shape files. A ruling on the boundary is due before the pattern spreads to other growing domain files.

3. **Header closure enforcement.** Charter Open direction #4. A within-package test or script rule that verifies no `types/src/` file imports from `@flighthq/*`. The promise is structural and load-bearing; it should be self-verifying.

4. **Amend Decision #3 for plain-data regions.** Non-entity region types cannot `extends Rectangle` because `Rectangle extends Entity`. Record that re-declaring the four fields is the expected pattern for non-entity rectangle-shaped types, so reviewers stop flagging `BitmapRegion` as debt.

5. **Retire completed charter Open direction.** Open direction #2 (TextDirection shared type) is done and can be removed from the charter.
