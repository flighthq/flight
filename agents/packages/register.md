# Package Register

The single index of every package and its decomposition state — the system over the breadth and depth reviews (structural fork E). It distinguishes what is _blessed and built_ from what merely _exists in code_ or is _recommended_, so a candidate is never mistaken for a real package. The patterns it applies — the subject triad and the bedrock test — live in [structural-forks.md](structural-forks.md).

## States

- **blessed-built** — a real package with an authored charter. The default; not enumerated here.
- **built-unblessed** — code exists, no direction yet. Needs a bless / reject / absorb verdict.
- **recommended** — a breadth-review candidate (a proposal). Never rendered as blessed.
- **rejected** — verdict reached: should not exist as a package. Kept as the audit trail so it is not re-proposed.
- **rust-intended** — designated for a **Rust/wasm implementation, built in `flight-rs`** (which treats this monorepo as upstream). This repo is the **naming + architecture authority**: the charter here fully specifies the name, seam, and intended contract as guidance the downstream Rust repo abides by; the code is built there, never scaffolded here. Marked by `rust: <repo>` charter front-matter (e.g. `rust: flight-rs`); `todo.mjs` routes it to the TODO's `Rust-intended` section and out of the local chartered-unbuilt queue. Distinct from **spun-out** (`spunOut:`), which is the *past-tense* case — code that once lived here and was moved out (`surface-rs`). Use `rust:` to designate a *new* Rust cell forward; use `spunOut:` to record one that departed. Rust cells are compute-heavy work that belongs in the Rust box (shapers, from-scratch Unicode-table backends, rasterizers) — the TS side owns only the swappable seam they register behind.

## Fields (the schema to mechanize later)

`state`, `subject` (the domain), `layer` (`primitive` | `-formats` | `-backend` | `node` | `n/a`), `well-homed` (`yes` | `overlaps:<pkg>` | `mis-homed`), and a `verdict` note. For now this register tracks the **non-default** states by hand; once the shape is stable it becomes cell front-matter plus a generated view (like `api` / `order`), not a hand-maintained table.

## The bedrock test (the gate)

Applied to every built-unblessed and recommended entry — full definition in [structural-forks.md](structural-forks.md#e-the-breadthdepth-system--bedrock--recommended-vs-blessed):

1. **Substantial & irreducible** — oracle: does a dedicated upstream library exist?
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
- **`resources` → dissolve into per-subject triads.** ✅ Fully executed: `resources` is gone; `image` / `audio` / `video` / `font` / `textureatlas` / `tileset` all exist as packages. The follow-on reconciliation (gathering `media` playback, `surface` ops, `texture` GPU upload, text-shaping's font consumption into their subject homes) remains open — and the 2026-07-03 depth reviews show the new subject homes landed correct but thin (`audio` 18, `video` 15, `font` 33, `tileset` 25, `textureatlas` 45): the dissolution created the right cells, not yet mature ones. Per-package next moves: [`TODO.md`](TODO.md).

## Landed candidates (recommended → built, as of 2026-07-03)

Eight June candidates are now real: `animation`, `skeleton`, `picking` (3D build-out), `gltf` (landed as **`scene-formats`**, a glTF import proving-slice), `font` and `audio`-the-subject (from the `resources` dissolution), `displayobject-skia` (Rust-only crate), and the `audio`-mixer candidate (folded into **`media`** — bus graph, per-bus gain/pan/mute/routing; the naming collision below is thereby resolved). Each has a blessed cell under `packages/` with its review in `<name>/review.md`.

**Chartered, not yet built** — eight cells carry a blessed charter with no code behind them, the ready-to-build queue: `capture`, `clock`, `image-codec`, `movieclip`, `particleemitter`, `path-boolean`, `path-formats`, `shape-formats`. (This list is computed live in [`TODO.md`](TODO.md).)

## Build queue — recommended order (regenerated 2026-07-10)

Re-ranked after the 2026-07 build-out. The 2026-07-03 queue's entire top tier is **built**: `net`, `socket`, `assets`, `collision`, `spatial`, `camera2d`, `accessibility`, plus the whole 2D-game / animation / `-formats` blocks (`flow`, `spring`, `motionpath`, `clock`, `intl`, `permissions`, `scene`, `picking`, `animation`, `skeleton`, `font`, `image-codec`, `texture-formats`, `tilemap-formats`, and the full text/glyph bitmap cluster `glyphatlas`/`bitmapfont`/`bitmapfont-formats`/`bitmaptext`). What genuinely remains, re-ranked by foundational-ness and unblocked-ness:

1. **Text itemization + shaping cluster** — the typography bottleneck, now unblocked (the shaper seam is glyph-bearing and bitmap text just landed). `textsegment` (grapheme/word/line segmentation; upstream `unicode-segmentation`) and `textbidi` (bidi itemization; upstream `unicode-bidi`) are the itemize layers correct international layout sits on; `textshaper-harfbuzz` (GSUB/GPOS shaping — the TS backend seam + registrar is local, the heavy rustybuzz impl → `flight-rs` like `surface-rs`); `text-markup` (markup → rich-text `-formats`).
2. **3D lighting build-out** — defers to [`render-architecture.md`](../render-architecture.md) / [`3d-materials-architecture.md`](../3d-materials-architecture.md) as authoritative; sequence core-lit → shadow → IBL. `shadow` (shadow-map pass + PCF seam), `environment` (skybox + IBL bake), `instancing` (GPU instancing). **`render-graph` needs its own design pass FIRST** (it reshapes `render`).
3. **Host backends** — mechanical, mirror `host-electron`: `host-tauri`, `host-capacitor`.
4. **Platform-suite opportunistic** — clean cells like clipboard/dialog: `mediasession`, `biometrics`, `purchase`, `calendar`, `contacts`.
5. **Infra / tooling** — `devtools`, `testing`. The `tool-*` suite has begun (`tool-capture`); `testing`/`devtools` may land as `tool-*` cells rather than SDK packages.
6. **`compute-wgpu`** — GPU compute backend (enables GPU particles/physics later).

Design calls to settle before building the affected entries:

- **Scene serialization** — the aligned name `scene-formats` is taken by the glTF importer; native save/load + versioned migration needs a fold-in or a distinct name (`scene-save`? `scene-document`?).
- **`render-graph`** — its own design pass (reshaping `render`) before shadow/lighting sequencing hardens.
- **The `animation`/`skeleton`/`tween`/`timeline` boundary** — now that all four are built, revisit for overlap (anchor: the `clock` charter).

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

### Visual authoring import (fork I) — chartered candidates, unbuilt

The visual-authoring-artifact arc ([structural-forks fork I](structural-forks.md#i-visual-authoring-artifacts-import-as--formats-not-as-a-code-layout-dsl)): UI and rich vector content are **authored visually and imported**, not built from a code-layout DSL. Each importer is a `-formats` cell into an **existing** subject home (never a new runtime), so the plurality is real (three distinct formats) and the outputs are well-homed.

| Candidate          | Subject · layer                       | Verdict                                                                                   |
| ------------------ | ------------------------------------- | ----------------------------------------------------------------------------------------- |
| `svg-formats`      | shape/display · `-formats`            | **bedrock** — static SVG only ("to a point"); path data delegates to `path-formats`; output is `shape`/display |
| `lottie-formats`   | shape + animation · `-formats`        | **bedrock** — Bodymovin JSON → `shape` + `@flighthq/animation` tracks; static-vector path shared with `svg-formats` |
| `rive-formats`     | shape/mesh/skeleton/anim · `-formats` | **bedrock**, with a parse/runtime split — `.riv` → Flight data here; the state-machine *runtime* is a distinct future cell (à la `particles`/`particleemitter`) |
| `markup-tokenizer` | text · lenient lexer                  | **reserved** — extract `text-markup`'s inline lenient lexer at the 2nd consumer; the rich-text runs inside the importers above are that trigger |

**Still open (not greenlit):** the responsive **constraint/anchor** layer that fits a fixed-size imported artifact to a live viewport — the one place a little *layout* logic is warranted. A data descriptor over display nodes vs. a solver is undecided; it is a direction to settle, not a code-layout DSL, and distinct from the importers (which are in scope). Charters: `packages/{svg-formats,lottie-formats,rive-formats,markup-tokenizer}/charter.md` (draft).

### Platform-suite capabilities (clean cells, like clipboard/dialog)

`biometrics`, `calendar`, `contacts`, `mediasession`, `permissions`, `purchase` — all **bedrock**.

### 3D pipeline build-out — ✅ accepted: full 3D (2026-06-24)

Scope **decided** (fork G): Flight goes full 3D. `environment`, `instancing`, `picking`, `postprocess`, `shadow`, `skeleton`, `animation`, `render-graph`, `gltf` — all **accepted (in scope, to build)**; `scene` (stub today) becomes a priority build-out. **Binding constraint: 3D is strictly additive** — a 2D app pays nothing for it (hard tree-shake + API boundary), enforced by a 2D-example `size` baseline that must not move. Still to **design** within scope: the `animation`/`skeleton`/`tween` boundary, and `render-graph`'s reshaping of `render` (its own design pass).

**Reconciled against the existing 3D architecture** — [`render-architecture.md`](../render-architecture.md) and [`3d-materials-architecture.md`](../3d-materials-architecture.md) are the **authoritative** 3D design; this register defers to them rather than restating them:

- **Already planned / in progress there:** `materials` (built — 20-material taxonomy, 922 tests), lighting, `shadow`, `environment` (IBL) sit in the materials/lighting build plan (core-lit → shadows → IBL → transmission); `scene-gl`/`scene-wgpu` are being stubbed and wired; `instancing` is partially planned.
- **Net-new beyond that plan** (what this structure newly tracks): `picking`, `postprocess`, `skeleton`, `animation`, `render-graph`, `gltf`.

The 2D↔3D boundary the binding constraint demands already has a home in `render-architecture.md` (the "Stage / Texture bridge"); the new piece is the **2D-example `size` gate** that enforces it.

### 2D game subjects

`collision`, `spatial`, `camera2d`, `flow`, `clock`, `motion-path`, `spring` — **bedrock**. `clock` is the shared time-domain primitive under tween/timeline/spritesheet/particles (fork A); `motion-path` and `spring` coordinate with the animation family.

### Networking

`net` (HTTP / URLLoader analogue), `socket` (WebSocket) — **bedrock** siblings.

### Text-GPU cluster — ⚠ overlap

`font-atlas` and `text-gpu` both build a glyph/SDF/MSDF atlas for GPU text — **discuss**: design the glyph-atlas seam once, not twice.

### Infra / cross-cutting

`assets` (id-keyed library above resources/loader), `atlas-packer` (→ `textureatlas`/`tileset`), `intl`, `devtools`, `testing`, `accessibility` — **bedrock**. `displayobject-skia` (Rust-only, already planned in rust docs), `host-tauri` / `host-capacitor` (planned host siblings) — **bedrock**.

### Flag — naming collision

`audio` (the candidate is an audio **mixer** graph over `media`) collides with the `audio` **subject** from the `resources` dissolution. Rename the mixer (e.g. `audiomixer`) or fold the subject's playback layer in — **discuss**.

## Breadth review candidates (2026-07-13)

Net-new candidates from the four-angle breadth review ([synthesis](../breadth-synthesis.md)). Prioritized by cross-report consensus. These remain **recommended**, not blessed — the verdicts below are the recommendation.

### Pure-math value-leaves (now — cheapest authority)

| Candidate | Subject · layer | Source | Verdict |
| --- | --- | --- | --- |
| `color` | color · primitive | [adjacent](../breadth-adjacent-content.md), [deepening](../breadth-domain-deepening.md) | **bedrock** — spaces sRGB↔linear/HSL/OKLab/LCH, ramps/schemes, contrast. Oracle: d3-color, chroma.js. Pure value-leaf, wasm-mixable |
| `scale` | scale · primitive | [adjacent](../breadth-adjacent-content.md) | **bedrock** — d3-scale tier: linear/log/time/ordinal/band, ticks, nice(), invert. **discuss** naming collision with transform-scale vocabulary |

### Platform primitives (now — two genuine gaps)

| Candidate | Subject · layer | Source | Verdict |
| --- | --- | --- | --- |
| `focus` | focus · primitive | [platform](../breadth-platform-variance.md), [deepening](../breadth-domain-deepening.md) | **bedrock** — spatial dpad/LRUD focus nav over plain-data `{id, bounds}` regions. Oracle: BBC LRUD, Norigin. TV + console + gamepad + keyboard-a11y converge |

### Gameplay tier (now/soon — one layer below gameplay)

| Candidate | Subject · layer | Source | Verdict |
| --- | --- | --- | --- |
| `physics2d` | physics · primitive | [deepening](../breadth-domain-deepening.md) | **bedrock** — rigid-body dynamics/constraints/joints over collision+spatial. Oracle: Box2D/planck.js. Prereq: collision phases 2-3. Constraint solver rust-intended-optional |
| `pathfinding` | pathfinding · primitive | [deepening](../breadth-domain-deepening.md) | **bedrock** — A\*/Dijkstra/JPS/flow fields. Charter must draw the path ≠ pathfinding line |
| `steering` | steering · primitive | [deepening](../breadth-domain-deepening.md) | **bedrock** — Reynolds seek/flee/arrive/flocking. Distinct from motionpath (authored) and spring (smoothing) |
| `behaviortree` | ai · primitive | [deepening](../breadth-domain-deepening.md) | **bedrock** — plain-data BTs, open node-kind registry, explicit tick, caller-owned blackboard |
| `statechart` | state · primitive | [deepening](../breadth-domain-deepening.md) | **bedrock** — hierarchical FSM. Doubly motivated: gameplay + Rive SM runtime substrate. Distinct from flow (app stack) |

### Cloud / distributed tier (soon)

| Candidate | Subject · layer | Source | Verdict |
| --- | --- | --- | --- |
| `serialize` | serialization · primitive | [cloud](../breadth-cloud-distributed.md) | **bedrock** — plain-data ↔ compact bytes with schema. Varint/float32 policy. Oracle: msgpack/FlatBuffers. Wasm-mixable. Unblocks ipc, socket binary, snapshot wire |
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
| `host-node` | host · `-backend` | [platform](../breadth-platform-variance.md) | **bedrock** — Node/Deno/Bun host: timer LoopBackend, fs storage/filesystem, file log sink. Unlocks headless chain |
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
| `physics` (3D) | physics · primitive | [deepening](../breadth-domain-deepening.md) | **reserve** — rust-intended. After physics2d proves the seam |
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
