---
package: '@flighthq/types'
updated: 2026-08-08
by: principal
---

# types — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item was re-checked against `packages/types/src/` on 2026-08-08 (897 files, 2,272 exported
names). A file:line here is a claim about this tree, not about a session.

- **425 of 2,272 exported names — 19% — have no reference in any implementation package.** Measured
  by taking every `export interface|type|enum|const` in `types/src/` and searching every other
  `packages/*/src`. They are not one dead corner: they span host plugin surfaces
  (`CapacitorApi.ts:68` and its ~40 siblings), format models (`AsepriteRect`, `GltfScene3D`,
  `LottieTransformShapeItem`), render seams (`BatchBarrier.ts:4`, `RenderEffectPaddingStatus`,
  `GlCapabilities`), and graph aliases (`AppearanceNode` at `HasAppearance.ts:25`, `BlendModeNode`
  at `HasBlendMode.ts:12`). The header is the design surface, so an unconsumed type is either a
  designed-ahead header or a dropped thread, and nothing in the tree distinguishes them.
- **`SignalConnection` and `SignalScope` describe an API that does not exist.**
  `SignalConnection.ts:11` documents a handle "returned by `connectSignal` and `connectSignalOnce`",
  with `paused` slots "skipped during dispatch"; `SignalScope.ts:11` documents `createSignalScope`
  and `disconnectSignalScope`. None of those four functions exists in `packages/signals/src/`,
  `connectSignal` returns `void` (`signals/src/slot.ts:12`), and `SignalData` has no `enabled` lane
  (`Signal.ts:8`). Both types are exported from **both** lanes (`index.ts:554`, `:556`).
- **`Signal<T>` is still function-typed, not payload-parameterized** —
  `Signal.ts:3`, `SignalData.slots: T[]` at `:8`. Pinned by `Signal.test.ts`. The reshape stays a
  cross-package decision touching every `*Signals` group and every `enable*` callsite.
- **Header closure holds but is unenforced.** No file in `types/src/` imports from any
  `@flighthq/*` package, and `package.json` declares no `@flighthq` dependency — but there is no
  `headerClosure.test.ts` and `grep headerClosure scripts/` finds no rule, so nothing catches the
  first violation.
- **No kind vocabulary from the header.** `KindOf<T>` and `KnownKinds` appear nowhere in
  `types/src/`; `AdjustmentKind` (`AdjustmentKind.ts:7`) is a bare `type = string` with no
  consumer. The built-in kind set is only reachable by grepping the implementation packages.
- **No branded primitives.** `PackedRgba` does not exist; packed colors and angle values are plain
  `number` everywhere, so a color/alpha or degree/radian mix-up is not type-catchable.
- **Scene versioning is absent from an otherwise complete document model.** `Scene3DDocument.ts`
  is a full format-neutral IR, but `SceneVersion` and `SceneMigration` appear nowhere, so a
  serialized document carries no migration contract.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract, and re-measured the header against the
  implementation packages. Most significant false claim dropped: "**Scene serialization / versioning
  contract** — DEFERRED. `Scene3DDocument`, `SceneVersion`, `SceneMigration` types are not yet
  defined." `Scene3DDocument.ts` exists and is the hub of the whole import/serialization stack
  (`parse<Format>` → document → `createScene3DFromDocument`), with `Scene3DAnimationPath` and
  `Scene3DMetadata` beside it; only the two versioning types are still missing, which is what the
  `Open` bullet now says. Also dropped: the `DOMRenderOptions`/`DOMStageRectangle` rename thread and
  every `Stage*` entry (no `Stage` file or symbol survives here), the `*DataFactory` audit recap,
  and the Rust conformance-lock item — there is no `rust/` tree in this repo.
- **2026-08-05** — Header expanded through the 2D/3D naming migration, the `.`/`./contract` lane
  split, texture/render-target ownership, PBR extensions, and format-import data models.
- **2026-06-25** — `Signal.test.ts` pins the present function-typed contract; `Bitmap.test.ts` adds
  the entity-quartet subtype laws; `DeviceBackend` gained its module doc.
- **2026-06-25** — Added `Ray3D`/`Ray3DLike`, `EulerOrder`, and `NodeDescendantVisitor` for the
  geometry/node port.
- **2026-06-24** — `ParticleForce`/`ParticleCollider` settled as closed-by-design; the
  `missing.test.ts` placeholder replaced with eight type-level assertion tests.
