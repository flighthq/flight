# Dependency Graph — Global

_Reviewed 2026-06-23. 86 packages, 16 examples. `npm run packages:check` → **pass** (`✓ 86 packages and 16 examples valid`)._

`packages:check` validates monorepo shape, workspace references, export targets, packaging, and side-effect-free source. It does **not** read `import`/`export` statements to confirm declared deps are actually used, nor flag dead "up-the-layer" edges. Everything below is what manual import-graph analysis adds on top of a green `packages:check`.

Method: parsed every `packages/*/package.json` for the dependency edge set, then parsed every non-test `src/**/*.ts` for `import … from`, `export … from`, and dynamic `import()` of `@flighthq/*`. Edges declared-but-never-imported are **unused**; imported-but-never-declared are **phantom**.

## Layering map

The intended spine holds. Edges flow strictly downward; no edge reaches up a layer.

```
types  (leaf — 0 deps; the header layer)
  └─ entity, signals, math, path, easing, log, + all platform-suite seams  (types only)
       ├─ geometry (→ entity), materials (→ entity)
       │    └─ node (→ entity, geometry, signals)
       │         ├─ displayobject (→ node, signals)            shape, sprite, text, textinput,
       │         │      timeline, spritesheet, particles, scene, interaction, velocity, clip
       │         └─ render (→ entity, geometry, materials, node)   ← render core
       │              ├─ render-gl (→ render)        render-wgpu (→ render, surface)
       │              │     └─ displayobject-{gl,wgpu} (→ displayobject, render-*, …)
       │              │        scene-{gl,wgpu} (→ render, render-*, camera, mesh, …)
       │              └─ effects-{gl,wgpu,canvas}, filters-{gl,wgpu,canvas,css,surface}
       └─ host-electron (→ every platform-suite seam it adapts)   ← adapter, top of stack
sdk  (pure `export * from` barrel over everything; nothing imports it)
```

Verified clean structurally:

- **No cycles.** Full DFS over the 86-node `@flighthq/*` edge set found zero back-edges.
- **Nothing imports `@flighthq/sdk`.** The barrel is a strict sink; `sdk` itself is `export *`-only (no `import … from`), so it pulls no runtime weight of its own.
- **No package depends on another up its layer.** Renderers depend on `render` (core), never the reverse. Backends (`*-gl`, `*-wgpu`, `*-canvas`, `*-dom`, `*-css`) never depend on each other — the one cross-backend edge, `displayobject-dom → displayobject-canvas`, is **intentional and documented** (DOM reuses Canvas raster for bitmap/text fills; mirrored by the Rust map's note that DOM has no compute of its own).
- **`@flighthq/types` is a true leaf** (0 deps) and the only cross-package type carrier. No consumer redefines a cross-package type inline — the spot-checked cases (`render` using `DisplayObject`/`MatrixLike`/`RectangleLike`, `particles-formats` using `ParticleEmitterConfig`) all pull the type from `types`, as intended.
- **Workspace deps are all pinned `"*"`** (no exceptions) and there are **zero external runtime dependencies** across all 86 packages — the SDK is fully self-contained and every package declares `"sideEffects": false`. Bundle/tree-shaking posture is structurally sound.

`import type { @flighthq/types }` is used by ~40 leaf/seam packages as their _only_ edge. This is correct, not a smell: `types` also carries runtime values (kind strings like `NodeKind`, the `BlendMode` enum), so it is a legitimate runtime dependency even where a given package only consumes its type side. Not flagged.

## Cycles & boundary violations

**Cycles:** none.

**Boundary violations:** none. No edge reaches up a layer; no backend↔backend edge beyond the documented `displayobject-dom → displayobject-canvas` raster reuse.

**Phantom dependencies (imported in `src`, not declared)** — these _should_ be caught by tooling and are not; each is a real `import` that works only because the symbol resolves transitively or via the hoisted workspace `node_modules`:

| Package             | Phantom dep          | Evidence                                                               |
| ------------------- | -------------------- | ---------------------------------------------------------------------- |
| `mesh`              | `@flighthq/entity`   | `meshGeometry.ts`: `import { createEntity }`                           |
| `render`            | `@flighthq/signals`  | `renderCache.ts`: `import { createSignal }`                            |
| `spritesheet`       | `@flighthq/entity`   | `spritesheet.ts`, `spritesheetAnimation.ts`: `import { createEntity }` |
| `effects-canvas`    | `@flighthq/geometry` | `canvasRenderEffectPipeline.ts`: `import { createMatrix }`             |
| `particles-formats` | `@flighthq/types`    | 6 files import `ParticleEmitterConfig` / `ParticleBlendMode`           |

All five are correct _additions_ to make — the import is legitimate; the manifest just omits it.

**Unused declared dependencies (declared, never imported anywhere in `src`, including `export … from`)** — each is a dead edge that overstates the package's coupling and should be removed:

| Package                | Unused declared dep(s)      |
| ---------------------- | --------------------------- |
| `render`               | `displayobject`, `sprite`   |
| `render-gl`            | `displayobject`             |
| `render-wgpu`          | `displayobject`             |
| `displayobject`        | `geometry`, `textlayout`    |
| `displayobject-canvas` | `resources`, `shape`        |
| `displayobject-dom`    | `shape`                     |
| `displayobject-gl`     | `sprite`                    |
| `displayobject-wgpu`   | `sprite`                    |
| `effects-canvas`       | `filters`, `filters-canvas` |
| `effects-gl`           | `filters`                   |
| `effects-wgpu`         | `filters`                   |
| `interaction`          | `displayobject`, `scene`    |
| `scene`                | `signals`                   |
| `scene-gl`             | `lighting`, `mesh`, `scene` |
| `scene-wgpu`           | `lighting`, `mesh`, `scene` |
| `text`                 | `entity`, `geometry`        |
| `textinput`            | `displayobject`             |
| `texture`              | `resources`                 |
| `resources`            | `geometry`                  |
| `shape`                | `geometry`                  |
| `spritesheet`          | `geometry`, `resources`     |
| `particles`            | `math`                      |
| `textshaper-canvas`    | `textshaper`                |

The most architecturally telling cluster is **`render → displayobject`/`sprite`** (and the same dead edges on `render-gl`/`render-wgpu`/`displayobject-{gl,wgpu}`). The render core now reaches `DisplayObject` purely as a _type_ from `@flighthq/types` (confirmed: the only `render` reference is `import type { DisplayObject } from '@flighthq/types'` in `renderTarget.ts`). So the real layering is _cleaner_ than the manifests admit: the post-collapse render core has no runtime dependency on the displayobject/sprite packages, but the pre-collapse manifest edges were never removed. Deleting them makes the manifest match the achieved (better) architecture.

## Surprising edges

- **`render` core declaring `displayobject` + `sprite`.** A render _core_ depending on concrete graph families reads as a layering inversion. It is in fact dead (types come from `types`) — the surprise is resolved by removing the edge, after which the mapping reads cleanly.
- **`scene-gl` / `scene-wgpu` declaring `scene`, `mesh`, `lighting` but not importing them.** A 3D backend that doesn't touch the 3D scene/mesh/lighting packages is suspect. Two readings: either these backends are still stubs (the edges are aspirational placeholders), or they consume those concepts only via `types` and the package edges are dead. Either way the declared graph overstates what is wired today; worth a maturity check on the `scene-*` backends.
- **`displayobject-{gl,wgpu}` declaring `sprite`.** Tilemap/quad-batch rendering would plausibly need `sprite`, so the _intent_ is unsurprising — but it isn't imported, so today it's dead. Decide per the sprite-fold-into-displayobject direction (see memory note): if sprite rendering now lives inside `displayobject-*`, the edge is obsolete; if it's pending, it's a stub edge.
- **No external dependencies anywhere.** Pleasantly surprising for a 4-renderer SDK (no gl-matrix, no earcut, etc.) — everything is in-tree (`geometry`, `path`, `math`). This is a deliberate strength worth preserving; flag any future external dep as a real decision.

Everything else maps cleanly: a reader can predict each package's deps from its purpose. The platform suite is uniform (`types`-only for command seams; `+ signals` for the event seams), and `host-electron` correctly fans out to exactly the seams it adapts.

## Recommendations

1. **Add the 5 phantom deps** to their manifests (`mesh→entity`, `render→signals`, `spritesheet→entity`, `effects-canvas→geometry`, `particles-formats→types`). These are correct, non-controversial fixes.
2. **Remove the 23 dead declared edges** listed above. Highest value: drop `render→{displayobject,sprite}`, `render-gl→displayobject`, `render-wgpu→displayobject` — this makes the manifest reflect the cleaner post-collapse render core (types-only coupling) instead of the old graph-family coupling.
3. **Resolve the `scene-*` and `displayobject-*→sprite` stub edges deliberately**, not by deletion alone. Confirm whether `scene-gl`/`scene-wgpu` are wired (if not, treat as known-incomplete backends and keep the edges as TODO markers with a note) and whether sprite rendering has folded into `displayobject-*` (if so, drop the `sprite` edge; if pending, leave it and track it).
4. **Add a CI check that diffs declared deps against actual `import`/`export … from` usage** so phantom and unused edges fail `npm run packages:check` rather than accumulating. The analysis above is mechanical and cheap to encode; today nothing enforces it.
5. **Keep the zero-external-dependency posture** as an explicit invariant — make any future external runtime dep a flagged, measured decision per the bundle-size rule.
