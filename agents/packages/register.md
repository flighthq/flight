# Package Register

The single index of every package and its decomposition state — the system over the breadth and depth reviews (structural fork E). It distinguishes what is _blessed and built_ from what merely _exists in code_ or is _recommended_, so a candidate is never mistaken for a real package. The patterns it applies — the subject triad and the bedrock test — live in [structural-forks.md](structural-forks.md).

## States

- **blessed-built** — a real package with an authored charter. The default; not enumerated here.
- **built-unblessed** — code exists, no direction yet. Needs a bless / reject / absorb verdict.
- **recommended** — a breadth-review candidate (a proposal). Never rendered as blessed.
- **rejected** — verdict reached: should not exist as a package. Kept as the audit trail so it is not re-proposed.

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

## Build queue — recommended order (2026-07-03)

The remaining candidates ranked by how many stakeholder perspectives demand them and how severely their absence was rated. One line each; verdicts are in the tables below (candidate specs were part of the June report generation — regenerate on demand; see index.md).

1. `net` + `socket` — HTTP and WebSocket transport seam (URLLoader/URLRequest home); the largest single coverage hole, #1 for two perspectives.
2. `textshaper-harfbuzz` — full-glyph GSUB/GPOS shaper backend (rustybuzz on Rust); unblocked now the shaper seam is glyph-bearing; the text-typography bottleneck.
3. `assets` — id-keyed asset library over loader/resources: dedup, refcount, eviction, manifests, preload-by-group; the asset-pipeline keystone.
4. `collision` + `spatial` — overlap/swept tests + broadphase; game-2d's #1 category.
5. `camera2d` — follow/deadzone, zoom, worldToScreen, parallax, cull bounds; game-2d's single biggest hole.
6. `shadow` + `environment` — shadow-map pass + PCF seam; skybox + IBL bake; the top 3D blockers, sequenced by 3d-pipeline-architecture.md.
7. `accessibility` — role/label/focus tree over a backend (DOM ARIA first); category-level omission.
8. Scene serialization — **needs the naming/scope call first** (see the `scene-format` row below).
9. Then: `instancing` / `postprocess` / `compute-wgpu` (3D remainder; `render-graph` needs its own design pass), `host-capacitor` / `host-tauri`, `textbidi` / `textsegment` / `text-markup`, `texture-formats` / `atlas-packer` / `tilemap-formats`, `spring` / `motion-path`, `gamestate` / `permission` / `intl`.
10. Opportunistic: `mediasession`, `biometrics`, `purchase`, `calendar`, `contacts`, `devtools`, `testing`.

Design calls to settle before building the affected entries: the glyph-atlas seam (`font-atlas`/`text-gpu` — design once), scene serialization naming, `render-graph`'s reshaping of `render`, the 2D-skeletal question (`skeleton` landed 3D-shaped), and the `animation`/`skeleton`/`tween`/`timeline` boundary (anchor: the `clock` charter).

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

### Platform-suite capabilities (clean cells, like clipboard/dialog)

`biometrics`, `calendar`, `contacts`, `mediasession`, `permission`, `purchase` — all **bedrock**.

### 3D pipeline build-out — ✅ accepted: full 3D (2026-06-24)

Scope **decided** (fork G): Flight goes full 3D. `environment`, `instancing`, `picking`, `postprocess`, `shadow`, `skeleton`, `animation`, `render-graph`, `gltf` — all **accepted (in scope, to build)**; `scene` (stub today) becomes a priority build-out. **Binding constraint: 3D is strictly additive** — a 2D app pays nothing for it (hard tree-shake + API boundary), enforced by a 2D-example `size` baseline that must not move. Still to **design** within scope: the `animation`/`skeleton`/`tween` boundary, and `render-graph`'s reshaping of `render` (its own design pass).

**Reconciled against the existing 3D architecture** — [`render-architecture.md`](../render-architecture.md) and [`3d-materials-architecture.md`](../3d-materials-architecture.md) are the **authoritative** 3D design; this register defers to them rather than restating them:

- **Already planned / in progress there:** `materials` (built — 20-material taxonomy, 922 tests), lighting, `shadow`, `environment` (IBL) sit in the materials/lighting build plan (core-lit → shadows → IBL → transmission); `scene-gl`/`scene-wgpu` are being stubbed and wired; `instancing` is partially planned.
- **Net-new beyond that plan** (what this structure newly tracks): `picking`, `postprocess`, `skeleton`, `animation`, `render-graph`, `gltf`.

The 2D↔3D boundary the binding constraint demands already has a home in `render-architecture.md` (the "Stage / Texture bridge"); the new piece is the **2D-example `size` gate** that enforces it.

### 2D game subjects

`collision`, `spatial`, `camera2d`, `gamestate`, `clock`, `motion-path`, `spring` — **bedrock**. `clock` is the shared time-domain primitive under tween/timeline/spritesheet/particles (fork A); `motion-path` and `spring` coordinate with the animation family.

### Networking

`net` (HTTP / URLLoader analogue), `socket` (WebSocket) — **bedrock** siblings.

### Text-GPU cluster — ⚠ overlap

`font-atlas` and `text-gpu` both build a glyph/SDF/MSDF atlas for GPU text — **discuss**: design the glyph-atlas seam once, not twice.

### Infra / cross-cutting

`assets` (id-keyed library above resources/loader), `atlas-packer` (→ `textureatlas`/`tileset`), `intl`, `devtools`, `testing`, `accessibility` — **bedrock**. `displayobject-skia` (Rust-only, already planned in rust docs), `host-tauri` / `host-capacitor` (planned host siblings) — **bedrock**.

### Flag — naming collision

`audio` (the candidate is an audio **mixer** graph over `media`) collides with the `audio` **subject** from the `resources` dissolution. Rename the mixer (e.g. `audiomixer`) or fold the subject's playback layer in — **discuss**.
