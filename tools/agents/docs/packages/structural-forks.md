# SDK-Wide Structural Forks

Cross-cutting decisions that recur across packages. A per-package charter _references_ these rather than re-litigating them — they are **patterns**, not any single package's vision. Each fork records the question, the current direction (decided / lean / open), and the packages it touches.

## The frame: monolith decomposition, down to bedrock

This whole project is the decomposition of the OpenFL/Lime monolith into composable primitives (see [Composition and Complexity](../index.md#composition-and-complexity)). Two opposing forces bound the work:

- **Decompose** until every unit is a primitive or simple-by-composition.
- **Stop at bedrock.** Decomposition has a floor — the irreducible primitive. Past it is _blood from a stone_: over-decomposition with diminishing returns. Finding where bedrock lies, per domain, is itself a recurring judgement (fork E).

Every fork below is an instance of placing a cut between "decompose further" and "bedrock."

## The recurring shape: the subject triad

The cuts keep landing in the same place. Every well-formed _subject_ decomposes into up to three layers:

> **data primitive** (the value) → **`<subject>-formats`** (codec: file ↔ value, registry-dispatched) → **`<subject>-<backend>`** (seam: playback / rasterize / GPU-upload / compute).

This generalizes three forks at once: the `-formats` layer is fork B (registry by default), the `-backend` layer is fork D, the primitive is fork A. Examples: `particles` / `particles-formats` / sim-backend; `textureatlas` / `textureatlas-formats` / consumed-by-`sprite`; `audio` / `audio-formats` / playback-backend; `font` / `font-formats` / rasterize-backend.

- **Plurality guard (bedrock for the triad).** Never pre-create a `-formats`/`-backend` cell — add one only when the subject has _plurality_ (≥2 formats, or ≥2 backends). A thin subject stays one package. `device-formats`/`platform-formats` failed exactly this: they split a subject with no plurality.
- **Upstream-library oracle.** "Is this a real subject/layer?" is checkable: does a mature, separately-factored upstream library exist? Audio decode → `symphonia`, fonts → `ttf-parser`/FreeType, images → the `image` crate. That external factoring is evidence of where bedrock lies, and the Rust port mirrors it. No library for "UA-parsing split by consumer" → not a subject.
- **Grab-bags are fused primitive-layers.** A package reads as a grab-bag when it fuses the data-primitive layer of _several_ subjects. `resources` (image + audio + video + font + atlas + tileset, all as data) is the clearest → it dissolves into per-subject triads (see the register).

## A. Source-data vs. graph participation _(open)_

**Question:** which package holds a node's _source data / simulation_ vs. its _participation in the scene graph_, and where is the line? **Context:** historically `displayobject` was all DisplayObject nodes and `sprite` all Sprite nodes; those graphs were **unified**, so node types are now spread across packages and the data-vs-participation line blurred. The unified graph may be ideal, but the **rule for where a node's data lives vs. its graph participation** needs clarifying. **Live case:** `particles` sim buffers (source data) reach into `sprite` via `reserveParticleEmitter` (participation) — sim and node are fused. **Touches:** particles↔sprite, tilemap, spritesheet, timeline↔MovieClip, 3D scene/mesh/material.

## B. Closed union vs. open registry _(decided, with nuance)_

**Default: registry.** Maximal tree-shaking — per the bundle invariant a closed `switch(kind)` taxes every user of the pass. **Exception:** a tight loop within a closed system may keep a closed union. **Trigger:** revisit on growth — a closed union that was fine while small flips to a registry once the family grows. **Touches:** particles forces/colliders (growing → lean registry; dispatch can be hoisted out of the hot loop so registry need not cost perf), filters/effects, formats, any `kind` switch. **Candidate to promote** into the global Design Constraints.

## C. Monolith decomposition — the project telos _(agreed)_

Not one fork but the theme: the whole project is monolith decomposition. The actionable form is an audit — every package gets checked for a hot function that bundles features as config-gated branches (the within-unit smell). **Confirmed:** particles `updateParticleEmitter`. **Suspects:** the render update pipeline, textlayout, other SoA sims.

## D. Two seam dimensions — runtime backend vs. Wasm mixing _(distinguish)_

Two different axes, often conflated:

1. **Runtime backend seam** — swap an implementation behind a `*Backend` trait. Established: render (multi-backend), text-shaping, `host-*`.
2. **Wasm `-rs` mixing seam** — ship a _single Rust crate as a wasm NPM drop-in_ inside an otherwise-TS app. A different dimension. **Question:** which packages are good Wasm-mixable leaves? **Lead:** `surface` (value-in/value-out pixel buffers — near-zero-copy). Candidates: geometry, path, filters/effects (data descriptors), particles (deterministic buffer-in/out), color/material math. The mixable set is the **value-typed leaves**; stateful graph packages are all-or-nothing.

## E. The breadth/depth system — bedrock + recommended-vs-blessed _(to build)_

A system over the breadth and depth reviews that (1) determines **bedrock** — how far to decompose before it is blood-from-a-stone — and (2) clearly identifies **recommended** packages **without treating them as blessed.** Three package states to track distinctly:

- **Blessed + built** — a real package with an authored charter.
- **Built-but-unblessed** — exists in code, no direction yet (the 3 worker-created `-formats` packages). Needs a bless-or-remove decision via the bedrock test.
- **Recommended-but-not-built** — a breadth-review candidate (the ~46 harvested net-new specs). A _proposal_, not a package; never rendered as blessed.

**The bedrock test** (the gate every built-unblessed / recommended package passes):

1. **Substantial & irreducible** — not blood-from-a-stone. Oracle: does a dedicated upstream library exist?
2. **Well-homed / no overlap** — it does not duplicate an existing package, _and_ the target type it produces is itself well-homed. (The `resource-formats` lesson: the duplication was a symptom of `TextureAtlas` being mis-homed in `resources`.)
3. **Honest naming** — the convention fits what it is (a UA string is not a `-format`).

Plus the triad **plurality guard** for `-formats`/`-backend` cells. The register ([register.md](register.md)) is where states and verdicts are tracked; the first three verdicts (`device-formats`/`platform-formats` → `useragent`; `resource-formats` → `textureatlas-formats`) are recorded there.

## F. Stubs — thin-by-design vs. under-built _(agreed)_

Triage each of the 7 stubs: **blessed-as-intentionally-minimal** (the domain is genuinely thin, e.g. `shortcut`) vs. **under-built-needs-a-push** (`scene`, `loader`, `textshaper`). The charter matters most here — there is little code to infer intent from.

## G. SDK scope _(ongoing; first ruling made)_

The breadth/depth passes are the mechanism for determining what is in/out of scope. Feeds E's recommended-package track.

**Decision (2026-06-24): full 3D is in scope.** The 3D pipeline build-out — `environment` (IBL/skybox), `instancing`, `picking`, `postprocess`, `shadow`, `skeleton`, `animation`, `render-graph`, and `gltf` import — is **accepted**. `scene` (a stub today) becomes a priority build-out, not a doorway.

**Binding constraint — 3D is strictly additive.** A 2D app pays _nothing_ for 3D: no 3D code in a 2D bundle (the 2D/3D split is a hard tree-shake boundary), and the 2D authoring workflow is uncompromised (3D never intrudes on a 2D API signature). This is the bundle invariant and the cellular boundary applied to the 2D/3D line — 2D is complete and self-contained on its own; 3D _composes_ the shared substrate (`render`/`geometry`/`math`/`types`) without the 2D path ever reaching the 3D family. **Enforced, not promised:** a 2D example's `npm run size` baseline must not move when a 3D package is added — that is the gate, the same way `packages:check` polices package shape.

Within-3D boundaries still to design: `animation` (channels/clips) vs `skeleton` (bones/skinning) vs `tween`/`timeline`; and `render-graph`'s reshaping of `render` (architecturally significant — its own design pass).

**Authoritative 3D design already exists** in [`render-architecture.md`](../render-architecture.md) and [`3d-materials-architecture.md`](../3d-materials-architecture.md) — materials, lighting, shadows, and IBL are designed (and `materials` is built). The register reconciles the accepted candidates against them (already-planned vs net-new), and the charter/register system **references these pre-existing blessed docs rather than duplicating them** — a general rule: blessed architecture that predates this structure is linked, not restated.
