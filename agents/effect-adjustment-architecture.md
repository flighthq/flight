# Effect / Adjustment / Material Architecture

**Blessed 2026-07-11.** Authoritative design for how image operations are modeled, composed, and realized across backends. Supersedes the "filters vs effects are separate domains" framing: `@flighthq/filters` **dissolves** into `@flighthq/adjustments` (pointwise) and `@flighthq/effects` (spatial/composite). Recorded as fork H in [structural-forks](packages/structural-forks.md).

> **Read this first — the recurring misread.** An **Adjustment** (e.g. a color transform) is **data-fed, not compiled shader composition.** It is a *fixed* shader stage — `color = color * mult + offset` — driven by a per-instance attribute or a uniform, and a stack of adjustments **fuses into one matrix (or one baked LUT) as data**, with **zero shader variants**. Three independent reviewers each defaulted to modeling a color transform as an injected shader snippet / shader-graph node. It is not that. That instinct describes the *reserved* compiled-feature tier ([shading](packages/shading/charter.md)), not the Adjustment tier. Keep the two apart; conflating them re-loses the batch-safety guarantee.

## The tiers

An image operation is authored at exactly one of three tiers. The tier is chosen by *what the operation is*, and it determines *how it composes* and *how it is realized* — which is the whole point of naming them separately (cost transparency).

| tier | what it is | composes by | realized as |
|---|---|---|---|
| **Material** (`@flighthq/materials`) | a shading input — the surface definition fed to lighting (albedo, metalness, roughness, unlit base) | (a complete shader per kind) | part of the draw |
| **Adjustment** (`@flighthq/adjustments`) | a **pointwise** value remap of the shaded output (one pixel → one pixel, no neighbors) | **fuse** — a stack collapses to **one** matrix or **one** LUT | **folds into the draw** as per-instance/uniform data |
| **Effect** (`@flighthq/effects`) | a **spatial or composite** op (reads neighbors, or needs multiple passes/buffers) | **chain** — a stack is **N** passes, each reading the last's output | **bounces** through an offscreen target (a pass) |

Reserved future tier — **Material Feature / Modifier** ([`@flighthq/shading`](packages/shading/charter.md)): *compiled* shader features (Fresnel, dissolve, toon-as-feature, vertex displacement) that inject into the material shader and produce variants. Flight ships complete materials today, so this tier is chartered and reserved, not built — see its charter for the when/how.

Pipeline order: **Material** (base shading) → *[Material Features, compiled — future]* → shaded output → **Adjustment** (post-output value remap, data-fed) → **Effect** (offscreen passes).

## The core distinction: fuse-and-fold vs chain-and-bounce

This is what the old "filter vs effect" split was groping at (and getting wrong — it framed the line as scope, per-object vs full-frame; the real line is composition algebra):

- **Adjustments fuse and fold.** Pointwise value ops compose by data (matrix multiply / LUT bake) into a single artifact, then fold into whatever draw is already happening. They never allocate an offscreen and never break a batch.
- **Effects chain and bounce.** Spatial/composite ops can't read a neighbor they haven't rendered, so they require the subject as a sampled texture — an offscreen bounce — and stack as sequential passes.

The intrinsic property that decides the tier is **pointwise vs neighbor-sampling/composite**, declared on the descriptor. It is backend-invariant.

## The three realization shapes

A descriptor is invariant; its *realization* is per-backend and comes in three shapes. The **presence** of a realization is the support matrix (see below).

1. **Inline contribution** (Adjustments on GPU): fold the op into the draw. Data-inline — a fixed color-matrix/LUT stage fed by per-instance attributes or a uniform (no recompile). This is the `a_ctMult` (per-instance) / `u_ctMult` (uniform) path that already exists in `displayobject-gl`.
2. **Offscreen pass** (Effects on GPU/CPU; Adjustments on CPU): render to a target, run the pass(es).
3. **Declarative** (DOM): emit a persistent CSS property (`filter`, etc.), diff-on-change; the browser composites. Falls back to an offscreen `<canvas>` where the op isn't CSS-expressible. DOM uniquely merges material + adjustment + effect into one composited style.

**Data folds, code bounces** is the one-line rule. It shows up at the package level too (see Packaging): the fold-in realization lives *with the draw*; the bounce realizations are their own packages.

## Uniform vs per-instance — by data cardinality, not a mode flag

An Adjustment is bound as a uniform (shared) or a per-instance attribute (varying) by **where the data lives** — one value or N values. No mode flag crosses the API.

- **Uniform (whole batch / node):** attach the adjustment to the node — `addNodeEffect(batch, createColorTransformAdjustment(...))`. One value → bound as `u_ctMult`. Cheapest; base stride.
- **Per-instance (each quad):** set it on the instance — `setQuadBatchInstanceColorTransform(batch, i, ct)`, paralleling the existing `setQuadBatchInstanceMatrix`. N values → packed into the `a_ctMult` attribute stream; the batch **promotes** its instance stride (the same mechanism as `setQuadBatchTransformType` / `getQuadBatchTransformStride`), identity for unset instances.

Attaching an adjustment can at most **promote** a batch (batch-wide layout upgrade, still one draw call); it can **never split** it. Only per-instance *shader code* splits a batch — and that is the escape hatch, which runs as its own pass, never a batch member. A matrix varies freely per-instance; a LUT is per-batch by default (per-instance LUT needs a texture-array + index to stay one draw).

## Extensibility — matrix, LUT, escape hatch (no invented types)

A user adds their own pointwise adjustment as **data that composes**, never a shader snippet — that is what keeps composition out of shader-code space (no variant/collation compiler for the common case):

- **Matrix tier (linear):** contribute a 4×5 color matrix (or a params→matrix builder). Stacks fold via `concatColorMatrix` (already in `filters/colorMatrixMath.ts`) into one matrix → the `a_ctMult`/`u_ctMult` slot. Covers tint/brightness/contrast/saturation/hue/invert/channel-mix/color-balance.
- **LUT tier (arbitrary value→value):** contribute a plain `rgb→rgb` function; the system bakes the composed stack into one 3D LUT (CPU, cached by stack identity) → one texture tap. Covers gamma/curves/posterize/custom grade — no user GLSL.
- **Escape hatch:** `customShaderEffect` (an **Effect**, already present) for ops that aren't pure value→value (read alpha nonlinearly, vary by position, sample neighbors). These can't fold into the batch anyway, so they are standalone passes — the *only* place shader-code collation lives, and it's bounded there.

Every pure value→value op fits matrix or LUT; nothing pointwise escapes to the shader path. **No `FilterList`-style container type**, no `Adjustment`/`Effect` wrapper hierarchy — a stack is a plain `readonly T[]`; the plural is expressed by the function name (`applyImageAdjustmentsTo…`), not an invented noun.

## Support matrix = realization presence

The realization function's **existence is the support matrix**. `applyBlurEffectToGl` exists → GL supports blur; no `expressAnisotropicBlurAsCss` → CSS can't. This replaces the hand-maintained prose in [render-backend-support](render-backend-support.md):

- Register realizations by `(kind, backend)`; an unregistered cell returns the sentinel; `explainEffectRealization(op, backend)` returns plain data (`{ shape, breaksBatch, reason }`) — diagnostics-inversion, shakeable, zero prod cost.
- Queryable via `npm run api`; can't drift (it *is* the code); unsupported = absent = zero bytes.
- `render-backend-support.md` becomes generated from registration presence, or retires into `npm run api`.

## Packaging

- **`@flighthq/adjustments`** — peer of `effects`. Descriptors + fuse math (color-matrix compose, LUT bake). Absorbs the pointwise tier from three current homes: `filters` (`colorMatrix` + `colorMatrixMath`), `effects` (`colorGrade`, `hueSaturation`, `brightnessContrast`, `invert`, `grayscale`, `liftGammaGain`, `channelMixer`, `exposure`, `lookupTableGrade`, `colorBlindSimulation`), and `materials` (`ColorTransformMaterial` / `UniformColorTransformMaterial`).
- **GPU realization is inline, so it lives with the draw** — `displayobject-gl` / sprite batch path (where `glColorTransformMaterial` already is), *not* a symmetric `adjustments-gl` pass package. `adjustments-surface` (CPU pixel pass) and `adjustments-css` (property emitter) *are* standalone backends. This asymmetry is the data-folds/code-bounces rule at the package layer, deliberate.
- **`@flighthq/effects`** keeps only spatial/composite ops (`blur`, `sharpen`, `displacement`, `dropShadow`, `glow`, `bevel`, `bloom`, `bokehDoF`, `godRays`, …).
- **`@flighthq/materials`** shrinks to shading kinds only.
- **`filters`, `filters-gl`, `filters-wgpu`, `filters-canvas`, `filters-css`, `filters-surface`, `filters-math` retire** — their contents sort into adjustments (pointwise) and effects (spatial/composite) by the fuse-fold/chain-bounce line.
- **`@flighthq/shading`** — reserved home for the compiled Material Feature / Modifier tier ([charter](packages/shading/charter.md)).

## Migration staging — bottom-up

Build the generic/bedrock layer before specializing per op/backend (design bottom-up so each layer is primitive and composes):

1. **Bedrock.** `@flighthq/adjustments` shell + the invariant descriptor type(s) in `@flighthq/types`, the fuse-math primitives (matrix compose, LUT bake) moved from `colorMatrixMath`, and the realization seam (registry by `(kind, backend)` + sentinel + `explainEffectRealization`). No per-op specialization yet.
2. **Move ColorTransform** `materials → adjustments` (lowest-risk: it already has both the inline `a_ctMult` and uniform `u_ctMult` realizations — reframe, don't rewrite). Fold the color-matrix stage into the base batch shader so a color transform stops selecting a distinct material program (it splits batches today).
3. **Re-sort the pointwise effects** out of `effects` into `adjustments`; wire their fuse (matrix/LUT) realizations.
4. **Re-sort `filters`** — pointwise → adjustments, spatial/composite → effects — then delete the `filters*` packages.
5. **Support matrix** — generate `render-backend-support.md` from realization presence (or retire it).

Each step is a gated, separately-committed unit. See the [adjustments charter](packages/adjustments/charter.md) for the package's own north star and boundaries.
