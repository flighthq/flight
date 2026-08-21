# Package Register

The single index of every package and its decomposition state — the system over the breadth and depth reviews (structural fork E). It distinguishes what is _blessed and built_ from what merely _exists in code_ or is _recommended_, so a candidate is never mistaken for a real package. The patterns it applies — the subject triad and the bedrock test — live in [structural-forks.md](structural-forks.md).

## States

- **blessed-built** — a real package with an authored charter. The default; not enumerated here.
- **built-unblessed** — code exists, no direction yet. Needs a bless / reject / absorb verdict.
- **recommended** — a breadth-review candidate (a proposal). Never rendered as blessed.
- **rejected** — verdict reached: should not exist as a package. Kept as the audit trail so it is not re-proposed.
- **downstream** — **implemented in another repo that treats this monorepo as upstream** (`flight-rs`, `flight-hx`). This repo is the **naming + architecture authority**: the charter here fully specifies the name, seam, and intended contract as guidance the downstream repo abides by; the code is built there, **never scaffolded here**. Marked by `downstream: <repo>` charter front-matter; `todo.mjs` routes it to the TODO's `Downstream` section and out of the local chartered-unbuilt queue. **The marker records a location, not a language** — which box the work belongs in (Rust for compute-heavy shapers, rasterizers, and from-scratch Unicode tables; Haxe for the Lime/Cairo host family) is a property of the downstream repo and belongs in the charter prose. Distinct from **spun-out** (`spunOut:`), which is the *past-tense* case — code that once lived **here** and was moved out (`surface-rs`). Use `downstream:` for a cell whose implementation lives elsewhere and never lived here; use `spunOut:` to record one that departed. Either way the TS side owns only the swappable seam the implementation registers behind.

## Fields (the schema to mechanize later)

`state`, `subject` (the domain), `layer` (`primitive` | `-formats` | `-backend` | `node` | `n/a`), `well-homed` (`yes` | `overlaps:<pkg>` | `mis-homed`), and a `verdict` note. For now this register tracks the **non-default** states by hand; once the shape is stable it becomes cell front-matter plus a generated view (like `api` / `order`), not a hand-maintained table.

## The bedrock test (the gate)

Applied to every built-unblessed and recommended entry — full definition in [structural-forks.md](structural-forks.md#e-the-breadthdepth-system--bedrock--recommended-vs-blessed):

1. **Substantial & irreducible** — reference-image: does a dedicated upstream library exist?
2. **Well-homed / no overlap** — no duplication, and the target type it produces is itself well-homed.
3. **Honest naming** — the convention fits what it is.

Plus the triad **plurality guard**: a `-formats`/`-backend` cell only when the subject has ≥2 formats/backends.

## Built-unblessed — verdicts (from bundle `builder-67dc46d64`) — ✅ all executed

| Package | Verdict | Resolution |
| --- | --- | --- |
| `device-formats` | **rejected** — blood-from-a-stone: split a subject with no plurality, misnamed (`-formats` on a UA string), duplicate `parseUserAgentArch` export | ✅ collapsed into **`useragent`** |
| `platform-formats` | **rejected** — the other half of the same UA parser | ✅ collapsed into **`useragent`** |
| `resource-formats` | **redirect** — individually plausible (real atlas formats, has a `registerTextureAtlasFormat` registry) but duplicates `spritesheet-formats`; the duplication is a _symptom_ of `TextureAtlas` being mis-homed in `resources` | ✅ became **`textureatlas-formats`** after `textureatlas` was extracted from `resources`; cell scaffolded 2026-07-03 (the spent `resource-formats` cell was removed) |

## Standing decomposition directions — ✅ both executed (2026-07)

- **`useragent`** — ✅ built (package + Rust crate): pure UA-string → identity-tokens value-leaf, depends only on `types`, used by the _web backends_ of `device` and `platform` (UA parsing is a web-backend concern; native reads the OS). Wasm-mixable (fork D). Depth review 2026-07-03: partial 42 — two unmerged parser families, browser-product axis missing.
- **`resources` → dissolve into per-subject triads.** ✅ Fully executed: `resources` is gone; `image` / `audio` / `video` / `font` / `textureatlas` / `tileset` all exist as packages. The follow-on reconciliation (gathering `media` playback, `bitmap` ops, `texture` GPU upload, text-shaping's font consumption into their subject homes) remains open — and the 2026-07-03 depth reviews show the new subject homes landed correct but thin (`audio` 18, `video` 15, `font` 33, `tileset` 25, `textureatlas` 45): the dissolution created the right cells, not yet mature ones. Per-package next moves: `TODO.md` (`node agents/packages/todo.mjs`).

## Landed candidates (recommended → built, as of 2026-07-03)

Eight June candidates are now real: `animation`, `skeleton3d` (originally `skeleton`), `picking` (3D build-out), `gltf` (landed as **`scene-formats`**, a glTF import proving-slice), `font` and `audio`-the-subject (from the `resources` dissolution), `scene2d-skia` (Rust-only crate), and the `audio`-mixer candidate (folded into **`media`** — bus graph, per-bus gain/pan/mute/routing; the naming collision below is thereby resolved). Each has a blessed cell under `packages/` with its review in `<name>/review.md`.

**Chartered, not yet built** — eight cells carry a blessed charter with no code behind them, the ready-to-build queue: `capture`, `clock`, `image-codec`, `movieclip`, `particleemitter`, `path-boolean`, `path-formats`, `shape-formats`. (This list is computed live in `TODO.md`.)

## Build queue — recommended order (regenerated 2026-07-31)

Re-ranked after the 2026-07 build-out. The 2026-07-03 queue's entire top tier is **built**: `net`, `socket`, `assets`, `collision`, `spatial`, unified `camera`, `accessibility`, plus the whole 2D-game / animation / `-formats` blocks (`flow`, `spring`, `motionpath`, `clock`, `intl`, `permissions`, `scene`, `picking`, `animation`, `skeleton3d`, `font`, `image-codec`, `texture-formats`, `tilemap-formats`, and the full text/glyph bitmap cluster `glyphatlas`/`bitmapfont`/`bitmapfont-formats`/`bitmaptext`).

**Struck 2026-07-31** — verified against `packages/` and found already built while still listed as queue items: the whole text itemization cluster `textsegment` / `textbidi` / `text-markup` (old tier 1), both host backends `host-tauri` / `host-capacitor` (old tier 3), and `mediasession` (old tier 4). The one unbuilt member of the old text tier, `textshaper-harfbuzz`, is a **rust-intended** cell — named and scoped here, implemented in `flight-rs` — so it is not local work and does not belong in this queue at all. What genuinely remains, re-ranked by foundational-ness and unblocked-ness:

1. **3D bedrock deepening** — execute in dependency order, with exhaustive GL behavior proof at each wave:
   1. **Frame/target contract:** integrate `ApplicationRenderView`, partial-target viewport/scissor and
      composable Extended PBR; finish truthful render-target storage axes, float capability negotiation,
      MSAA resolve isolation, deterministic GL teardown, and the HDR/output-transform contract.
   2. **Material/lighting transport:** make Standard/Extended PBR combinations physically coherent across
      punctual and IBL paths; assemble real opaque scene color for transmission; keep every extension and
      resource lister independently tree-shakable. Shadows/probes begin only on these settled inputs.
   3. **Prepared-scene semantics:** unify explicit scene preparation across rendering, bounds, picking,
      morph, skin, billboard, instance, and selected LOD. Prove morph+skin composition and clone-safe
      ownership before acceleration. Animation mixing/pose composition belongs in this wave.
   4. **Resource/import truth:** complete texture channel/format upload, mip/residency state, environment
      cache invalidation, scene-resource retry/diagnostics, and full scene-format material/texture/sampler/
      animation results with real fixtures.
   5. **Scene scale and breadth:** realize instancing and LOD end to end, then true-3D particle render feeds,
      unified transparent ordering, forward-light budgets, directional/spot/point shadows, and probes.
   6. **Advanced consumers:** explicit normal/material/velocity/history attachments followed by real
      SSAO/DoF/TAA/motion blur/SSR behavior, then optional BVH/refit and visibility acceleration.

   Commission WGPU parity only after each GL contract has raster evidence. A general render graph,
   occlusion system, reversed-Z, full mesh simplification, and physics3d remain later layers rather than
   prerequisites for these atoms.
2. **Platform-suite opportunistic** — clean cells like clipboard/dialog: `biometrics`, `purchase`, `calendar`, `contacts`.
3. **Infra / tooling** — `devtools`, `testing`. The `tool-*` suite has begun (`tool-capture`); `testing`/`devtools` may land as `tool-*` cells rather than SDK packages.
4. **`compute-wgpu`** — GPU compute backend (enables GPU particles/physics later).

Design calls to settle before building the affected entries:

- **Scene serialization** — the aligned name `scene-formats` is taken by the glTF importer; native save/load + versioned migration needs a fold-in or a distinct name (`scene-save`? `scene-document`?).
- **`render-graph`** — its own later design pass after explicit attachment/pass contracts are behaviorally proven; do not make it a prerequisite for viewport, PBR transmission, effects inputs, or shadows.
- **The `animation`/`skeleton3d`/`tween`/`timeline` boundary** — now that all four are built, revisit for overlap (anchor: the `clock` charter).

## 2D/3D naming architecture (decided 2026-07-15)

The standing rule for packages that span two and three dimensions. The test: **"does the dimension change the mathematical model, or just the representation?"** If the model is the same, one package with suffixed types; if the model differs, separate packages.

### Unified (representation differs, model same)

| Package | 2D type | 3D type | Status | Notes |
| --- | --- | --- | --- | --- |
| `camera` | `Camera2D` | `Camera3D` | unified; `camera2d` absorbed | Both pure math (matrix producers), no graph dep |
| `particleemitter` | `ParticleEmitter2D` | `ParticleEmitter3D` | add 3D, rename existing | Dual `scene2d`+`scene` dep accepted; tree-shaking zeroes cost |
| `collision` | 2D shapes (existing) | 3D shapes (future) | add 3D when built | One support-function/GJK core instantiated twice, so the model is shared; **every type carries a `2D`/`3D` suffix** and the dimension lives in the shape type and entry point (2026-08-20) |
| `spatial` | 2D backends (existing) | 3D backends (future) | add 3D when built | BVH/octree behind same `SpatialIndexBackend` seam |
| `velocity` | `Velocity2D` (existing) | `Velocity3D` (future) | add 3D when built | Same concept: position delta / dt |

**Corrected 2026-08-21.** Both tables above used to cite the same fact in opposite directions: the split
row justified `physics2d`/`physics3d` with *"contact generation (SAT vs GJK/EPA)"* while the unified row
placed `collision` with *"GJK/EPA joins same package."* Contact generation is `collision`'s job in either
dimension, so it could never have been a reason to split `physics`. The built packages settle it as fact
rather than argument: `physics3d` generates no contacts at all — it consumes `Physics3DContact` records the
caller supplies — and its real divergence from `physics2d` is the constraint math, which is what the row
now says.

**Superseded in its evidence, not its conclusion, 2026-08-21.** `physics3d` now DOES generate contacts: it
carries colliders, a `SpatialIndexBackend3D`, and an intake pass over `@flighthq/collision`'s 3D narrow
phase, exactly as `physics2d` does. The note above is kept because its reasoning is what settled the
question and the correction it records is real — but the sentence starting "The built packages settle it"
argued from a temporary state of the code. The conclusion survives the state changing, and is now better
supported: both packages generate contacts through `collision`, so contact generation was never the
difference, and the constraint math still is.

### Split (model differs)

| 2D package | 3D package | Status | Why different models |
| --- | --- | --- | --- |
| `physics2d` | `physics3d` | both new (chartered) | Different constraint Jacobians (scalar angular velocity vs quaternion + inertia tensor), different joint sets, different mass properties |
| `skeleton2d` | `skeleton3d` | 3D renamed and built; 2D chartered | Different skinning math (CPU 2D mesh warp vs GPU skin palette), different IK, different blend strategies |

### Inherently single-dimension (no counterpart)

Display graph families (`scene2d`=2D, `scene`=3D), 2D geometry primitives (`path`, `shape`, `clip`, `motionpath`), 3D geometry (`mesh`), 3D rendering (`lighting`, `materials`), 2D animation (`movieclip`, `spritesheet`), 2D input (`interaction`), 3D selection (`picking`).

### Naming convention

- When both 2D and 3D types coexist in one package, both get explicit suffixes: `Camera2D`/`Camera3D`, `ParticleEmitter2D`/`ParticleEmitter3D`.
- Where shape names are vocabulary-distinct (Circle vs Sphere, ConvexPolygon vs ConvexHull), no dimension suffix is needed.
- Historical `skeleton` is absorbed into `skeleton3d` for symmetry with `skeleton2d`. Both dimensions have explicit suffixes.

Resolved / redundant — removed from the candidate set:

- `postprocess` → **covered by the built `effects`** + `effects-gl`/`effects-wgpu`/`effects-canvas` (substrate-agnostic post-process descriptors + per-backend execution).
- `atlas-packer` → **covered by the built `binpack`** (general 2D MaxRects packer under `textureatlas`/`tileset`).

_(A full multi-perspective re-poll of severity/demand — the original June-report methodology — is available on request; this regeneration is the prune-and-rerank against actual built state.)_

## Recommended candidates (triaged 2026-06-24; landed entries struck 2026-07-03)

The 46 net-new proposals from the breadth pass (specs under `reviews/maturation/breadth/`), run through the bedrock test. These remain **recommended**, not blessed — the verdicts below are the recommendation, the bless is yours. Most are well-founded, and **~a third are precisely the `-formats`/`-backend` triad layers the subject-triad predicts** — strong confirmation of the pattern. Verdicts: **bedrock** (a real subject/layer), **align** (bedrock but rename to the convention), **discuss** (boundary/scope needs a call). Prioritized sequencing of what remains: the [Build queue](#build-queue--recommended-order-2026-07-03) above.

### Triad layers — the pattern predicts these

| Candidate             | Subject · layer               | Verdict                                     |
| --------------------- | ----------------------------- | ------------------------------------------- |
| `image-codec`         | image · `-formats`            | **align** → `image-formats` (charter blessed, unbuilt) |
| `texture-formats`     | texture · `-formats`          | bedrock                                     |
| `tilemap-formats`     | tileset/tilemap · `-formats`  | bedrock (`tileset` precondition ✅ satisfied) |
| `scene-format`        | scene · `-formats`            | **discuss** — still open: the aligned name `scene-formats` is now taken by the glTF importer; native save/load + versioned migration needs either a fold-in or a distinct name |
| `gltf`                | scene/mesh · model `-formats` | ✅ landed as `scene-formats`                 |
| `text-markup`         | text · markup `-formats`      | bedrock                                     |
| `textbidi`            | text · itemize layer          | bedrock (upstream: `unicode-bidi`)          |
| `textsegment`         | text · itemize layer          | bedrock (upstream: `unicode-segmentation`)  |
| `textshaper-harfbuzz` | textshaper · `-backend`       | bedrock (already planned; unblocked — the shaper seam is now glyph-bearing) |
| `compute-wgpu`        | gpu · compute `-backend`      | bedrock                                     |
| `font`                | font · primitive              | ✅ landed (partial 33 — needs matching/fallback/variable axes) |

### Visual authoring import (fork I) — chartered package arc

The visual-authoring-artifact arc ([structural-forks fork I](structural-forks.md#i-visual-authoring-artifacts-import-as--formats-not-as-a-code-layout-dsl)): UI and rich vector content are **authored visually and imported**, not built from a code-layout DSL. Ordinary source formats are codecs inside the target-named `scene2d-formats` cell, while SWF's much larger display/MovieClip domain has graduated to the standalone `swf` peer package. All produce well-homed output. The `Scene2DDocument` + named-slot resolve layer that the named-graph (#3) contract needs is the target-named `scene2d-resources` cell (twin of `scene3d-resources`).

| Candidate          | Subject · layer                       | Verdict                                                                                   |
| ------------------ | ------------------------------------- | ----------------------------------------------------------------------------------------- |
| `scene2d-formats` | display · `-formats`              | ✅ landed — static SVG document import first; path data delegates to `path-formats`; output is a display subtree |
| `lottie-formats`   | shape + animation · `-formats`        | **absorbed** into `scene2d-formats` — Bodymovin JSON → `shape` + `@flighthq/animation`; a codec, not a package (`-formats` is target-named) |
| `rive-formats`     | shape/mesh/skeleton/anim · `-formats` | **absorbed** into `scene2d-formats` (parse is a codec here; deps via seams) — the state-machine *runtime* remains a distinct future cell (à la `particles`/`particleemitter`) |
| `swf`              | display/movieclip · domain            | ✅ named-graph slice landed — standalone domain package; uncompressed recursive first-frame `DefineSprite` graphs across `PlaceObject`–`PlaceObject4` / both removal forms and fresh/move/replacement state, with names + composed transforms + linkage + RECT/embedded-image/lossless-bitmap/video/sprite authored extents into `Scene2DDocument`. Later frames, visual bodies, and compression remain staged; ABC/execution out of scope |
| `scene2d-resources`| display · resource/document           | ✅ landed — `Scene2DDocument` + authored bounds/linkage + synchronous reconcile + operation-scoped async load + named asset/slot resolution; optional open importer registry |
| `markup-tokenizer` | text · lenient lexer                  | **reserved** — extract `text-markup`'s inline lenient lexer at the 2nd consumer; the rich-text runs inside the importers above are that trigger |

**Settled 2026-08-04:** the responsive rectangle layer is the headless `@flighthq/layout` package: flat-tree anchor/flex/grid resolution into caller-owned buffers, separate from display-node binding and from constraint solving. It does not turn the source-format packages into a code-layout DSL; importers may translate authored descriptors into this generic boundary later. Charter: [`packages/layout/charter.md`](layout/charter.md). The other charters remain `packages/{scene2d-formats,scene2d-resources,swf,markup-tokenizer}/charter.md`; `swf` is a **domain package** peer (graduated out — a huge domain, like `movieclip`/`sprite`), not a codec. The source-named `svg-formats`/`lottie-formats`/`rive-formats` charters are **superseded** — retained as history, absorbed as codecs into `scene2d-formats`.

### Platform-suite capabilities (clean cells, like clipboard/dialog)

`biometrics`, `calendar`, `contacts`, `mediasession`, `permissions`, `purchase` — all **bedrock**.

### 3D pipeline build-out — ✅ accepted: full 3D (2026-06-24)

Scope **decided** (fork G): Flight goes full 3D. `environment`, `instancing`, `picking`, `postprocess`, `shadow`, `skeleton3d`, `animation`, `render-graph`, `gltf` — all **accepted (in scope, to build)**; `scene` becomes a priority build-out. **Binding constraint: 3D is strictly additive** — a 2D app pays nothing for it (hard tree-shake + API boundary), enforced by a 2D-example `size` baseline that must not move. Still to **design** within scope: the `animation`/`skeleton3d`/`tween` boundary, and `render-graph`'s eventual reshaping of `render` after the explicit pass/attachment contracts settle.

**Reconciled against the existing 3D architecture** — [`render-architecture.md`](../render-architecture.md) and [`3d-materials-architecture.md`](../3d-materials-architecture.md) are the **authoritative** 3D design; this register defers to them rather than restating them:

- **Already planned / in progress there:** `materials` (built — 20-material taxonomy, 922 tests), lighting, `shadow`, `environment` (IBL) sit in the materials/lighting build plan (core-lit → shadows → IBL → transmission); `scene-gl`/`scene-wgpu` are being stubbed and wired; `instancing` is partially planned.
- **Net-new beyond that plan** (what this structure newly tracks): `picking`, `postprocess`, `skeleton3d`, `animation`, `render-graph`, `gltf`.

The 2D↔3D boundary the binding constraint demands already has a home in `render-architecture.md` (the "Stage / Texture bridge"); the new piece is the **2D-example `size` gate** that enforces it.

### 2D game subjects

`collision`, `spatial`, `camera`'s `Camera2D` surface, `flow`, `clock`, `motion-path`, `spring` — **bedrock**. `clock` is the shared time-domain primitive under tween/timeline/spritesheet/particles (fork A); `motion-path` and `spring` coordinate with the animation family.

### Networking

`net` (HTTP / URLLoader analogue), `socket` (WebSocket) — **bedrock** siblings.

### Text-GPU cluster — ⚠ overlap

`font-atlas` and `text-gpu` both build a glyph/SDF/MSDF atlas for GPU text — **discuss**: design the glyph-atlas seam once, not twice.

### Infra / cross-cutting

`assets` (id-keyed library above resources/loader), `atlas-packer` (→ `textureatlas`/`tileset`), `intl`, `devtools`, `testing`, `accessibility` — **bedrock**. `scene2d-skia` (Rust-only, already planned in rust docs), `host-tauri` / `host-capacitor` (planned host siblings) — **bedrock**.

### Flag — naming collision

`audio` (the candidate is an audio **mixer** graph over `media`) collides with the `audio` **subject** from the `resources` dissolution. Rename the mixer (e.g. `audiomixer`) or fold the subject's playback layer in — **discuss**.

## Breadth review candidates (2026-07-13)

Net-new candidates from the four-angle breadth review ([synthesis](../breadth-synthesis.md)). Prioritized by cross-report consensus. These remain **recommended**, not blessed — the verdicts below are the recommendation.

### Pure-math value-leaves (now — cheapest authority)

| Candidate | Subject · layer | Source | Verdict |
| --- | --- | --- | --- |
| `color` | color · primitive | [adjacent](../breadth-adjacent-content.md), [deepening](../breadth-domain-deepening.md) | **bedrock** — spaces sRGB↔linear/HSL/OKLab/LCH, ramps/schemes, contrast. ReferenceImage: d3-color, chroma.js. Pure value-leaf, wasm-mixable |
| `scale` | scale · primitive | [adjacent](../breadth-adjacent-content.md) | **bedrock** — d3-scale tier: linear/log/time/ordinal/band, ticks, nice(), invert. **discuss** naming collision with transform-scale vocabulary |

### Platform primitives (now — two genuine gaps)

| Candidate | Subject · layer | Source | Verdict |
| --- | --- | --- | --- |
| `focus` | focus · primitive | [platform](../breadth-platform-variance.md), [deepening](../breadth-domain-deepening.md) | **bedrock** — spatial dpad/LRUD focus nav over plain-data `{id, bounds}` regions. ReferenceImage: BBC LRUD, Norigin. TV + console + gamepad + keyboard-a11y converge |

### Gameplay tier (now/soon — one layer below gameplay)

| Candidate | Subject · layer | Source | Verdict |
| --- | --- | --- | --- |
| `physics2d` | physics · primitive | [deepening](../breadth-domain-deepening.md) | **bedrock** — rigid-body dynamics/constraints/joints over collision+spatial. ReferenceImage: Box2D/planck.js. Prereq: collision phases 2-3. Constraint solver rust-intended-optional |
| `pathfinding` | pathfinding · primitive | [deepening](../breadth-domain-deepening.md) | **bedrock** — A\*/Dijkstra/JPS/flow fields. Charter must draw the path ≠ pathfinding line |
| `steering` | steering · primitive | [deepening](../breadth-domain-deepening.md) | **bedrock** — Reynolds seek/flee/arrive/flocking. Distinct from motionpath (authored) and spring (smoothing) |
| `behaviortree` | ai · primitive | [deepening](../breadth-domain-deepening.md) | **bedrock** — plain-data BTs, open node-kind registry, explicit tick, caller-owned blackboard |
| `skeleton2d` | skeleton · primitive | naming matrix (2026-07-15) | **bedrock** — 2D skeletal animation (Spine/DragonBones territory). Separate from `skeleton3d` because the dimension changes the mathematical model. Chartered 2026-07-15 |

### Cloud / distributed tier (soon)

| Candidate | Subject · layer | Source | Verdict |
| --- | --- | --- | --- |
| `serialize` | serialization · primitive | [cloud](../breadth-cloud-distributed.md) | **bedrock** — plain-data ↔ compact bytes with schema. Varint/float32 policy. ReferenceImage: msgpack/FlatBuffers. Wasm-mixable. Unblocks ipc, socket binary, snapshot wire |
| `telemetry` | telemetry · primitive | [cloud](../breadth-cloud-distributed.md) | **bedrock** — event envelope, offline batch queue in storage, backoff flush over net, flush-on-lifecycle-hide. Log sink feeds it |
| `flags` | config · primitive | [cloud](../breadth-cloud-distributed.md) | **bedrock** — typed remote-config seam, OpenFeature-shaped. Exposure events → telemetry |
| `tool-assetpipeline` | assets · tool | [cloud](../breadth-cloud-distributed.md) | **bedrock** — build-time producer: binpack+image-codec+texture-formats → hashed manifest. Same package local or cloud-CI |

### Content import (soon — fork I generalized)

| Candidate | Subject · layer | Source | Verdict |
| --- | --- | --- | --- |
| `localization` | localization · primitive | [deepening](../breadth-domain-deepening.md) | **bedrock** — string catalogs, ICU MessageFormat plural/select, locale fallback. `intl` = values, `localization` = catalogs |
| `localization-formats` | localization · `-formats` | [deepening](../breadth-domain-deepening.md) | **bedrock** — PO/XLIFF/FTL/ARB codecs. Triad-predicted |

### Host / environment (soon)

| Candidate | Subject · layer | Source | Verdict |
| --- | --- | --- | --- |
| `host-node` | host · `-backend` | [platform](../breadth-platform-variance.md) | **reserve (charter-only)** — Node/Deno/Bun host: timer LoopBackend, fs storage/filesystem, file log sink. Charter at `agents/packages/host-node/charter.md`; not created until first genuine backend |
| `worker` | worker · primitive | [platform](../breadth-platform-variance.md) | **bedrock** — typed cross-context channel with explicit transferables. comlink-minus-proxy-magic. Lean distinct from ipc: transferables don't exist in process IPC |

### Media codecs (soon)

| Candidate | Subject · layer | Source | Verdict |
| --- | --- | --- | --- |
| `video-codec` | video · `-formats` | [adjacent](../breadth-adjacent-content.md) | **bedrock** — WebCodecs mux/demux seam, mirror of image-codec for time-media. Encode = differentiator |
| `audio-formats` | audio · `-formats` | [adjacent](../breadth-adjacent-content.md) | **bedrock** — triad-predicted. Decode rust-intended |

### Later / reserve

| Candidate | Subject · layer | Source | Verdict |
| --- | --- | --- | --- |
| `replication` | sync · primitive | [cloud](../breadth-cloud-distributed.md) | **bedrock** — server-auth entity sync over snapshot-diff+serialize+socket. Blocked on now/soon tier |
| `rollback` | netcode · primitive | [cloud](../breadth-cloud-distributed.md) | **reserve** — GGPO-style. Demands determinism audit |
| `bindiff` | diff · primitive | [cloud](../breadth-cloud-distributed.md) | **bedrock** — bsdiff-class binary diff. Serves updater + asset patching |
| `peer` | transport · primitive | [cloud](../breadth-cloud-distributed.md) | **bedrock** — WebRTC data channels. Only unreliable/unordered browser transport |
| `history` | undo · primitive | [adjacent](../breadth-adjacent-content.md) | **discuss** — command-stack undo. Boundary vs snapshot memento + textinput undo |
| `snapping` | editing · primitive | [adjacent](../breadth-adjacent-content.md) | **bedrock** — align/distribute/magnetism math |
| `dialogue` | dialogue · primitive | [deepening](../breadth-domain-deepening.md) | **bedrock** — Yarn/Ink/Twine runtime. Fork I for content |
| `dialogue-formats` | dialogue · `-formats` | [deepening](../breadth-domain-deepening.md) | **bedrock** — Yarn/Ink/Twine codecs. Triad-predicted |
| `navmesh` | navigation · primitive | [deepening](../breadth-domain-deepening.md) | **bedrock** — bake rust-intended, query TS. Recast/Detour split |
| `xr` | xr · primitive | [platform](../breadth-platform-variance.md) | **bedrock** — session/reference-space/input-source data + XrBackend. Gated on 3D maturity |
| `geo` | geo · primitive | [adjacent](../breadth-adjacent-content.md) | **discuss** — projections, haversine. Needs fork-G-style scope ruling |
| `geo-formats` | geo · `-formats` | [adjacent](../breadth-adjacent-content.md) | **discuss** — GeoJSON/TopoJSON/MVT. After scope ruling |
| `maptile` | geo · primitive | [adjacent](../breadth-adjacent-content.md) | **discuss** — slippy z/x/y math. After scope ruling |
| `physics3d` | physics · primitive | [deepening](../breadth-domain-deepening.md) | **reserve** — rust-intended. After physics2d proves the seam. Chartered 2026-07-15 |
| `presence` | sync · primitive | [cloud](../breadth-cloud-distributed.md) | **reserve** |
| `identity` | auth · primitive | [cloud](../breadth-cloud-distributed.md) | **reserve** — vendor territory today |
| `midi` | midi · primitive | [adjacent](../breadth-adjacent-content.md) | **reserve** |

## Rejected candidates (2026-07-13)

Formally rejected to prevent re-proposal. Each fails the bedrock test or is covered by composition.

| Candidate | Source | Rejection |
| --- | --- | --- |
| `ecs` | [deepening](../breadth-domain-deepening.md) | **reject → anti-goals.md entry.** Flight's entity/runtime model + SoA batching is the deliberate alternative. The entity/runtime split is documented and intentional |
| `inventory` / `economy` | [deepening](../breadth-domain-deepening.md) | **reject** — app-domain logic, not SDK bedrock |
| `cloud-save` | [cloud](../breadth-cloud-distributed.md) | **reject** — composition over existing primitives (snapshot + storage + net), not a standalone cell |
| `matchmaking` / `lobby` / `leaderboards` | [cloud](../breadth-cloud-distributed.md) | **reject** — vendor services, not SDK bedrock. The `*Backend` seam vocabulary is the SDK's job; the server is the vendor's |
| `chart` | [adjacent](../breadth-adjacent-content.md) | **reject** — assembly (composition over scale + color + sprite + interaction), not bedrock. Reserve name only |
| `l-systems` | [deepening](../breadth-domain-deepening.md) | **reject** — a path recipe (assembly), not a standalone primitive |
