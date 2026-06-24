---
package: '@flighthq/effects-wgpu'
updated: 2026-06-24
basedOn: ./review.md
---

# effects-wgpu — Assessment

The review verdict is `solid — 88/100`: a mature WGSL backend in near-perfect structural lockstep with `effects-gl` (44 runners over identical kinds, registry dispatch, pooled ping-pong pipeline, two flagship multi-pass recipes). The distance-to-AAA is dominated by items that are either cross-package (depth/velocity G-buffers, TAA history), design forks (the missing-effect scope, the parity-vs-best-recipe bar), or gated on render infrastructure that does not yet exist (functional /parity gates, the Rust mirror). That pushes almost everything into Backlog or the charter's Open directions; only the within-package, non-design test-floor work is sweep-safe.

The prior `reviews/maturation/depth/effects-wgpu.md` roadmap does **not** exist in this worktree — its Gold-scope items (Rust mirror, functional scenes, depth/velocity unblock) were already absorbed into `review.md` from the status doc, so this assessment sorts from the review alone. Nothing to remove.

## Recommended

Sweep-safe: within `@flighthq/effects-wgpu`, no cross-package coupling, no breaking change, no open design decision.

1. **Fix the stale "45 effects / 45 runners" count to 44.** The status-derived prose repeats a "45" figure that is off by one against the 44 runner files and 44 band registrations (review §Present capabilities, §Status-doc verification). Correct the count wherever it appears in this package's docs/comments so the descriptor-vs-backend arithmetic (52 descriptors − 44 runners = 8 missing) reads consistently. Pure within-package doc/comment hygiene.

2. **Add a deterministic unit-assertion tier the jsdom env can run, above the "is a function" floor** (review gap 4; Open-direction "Test floor" — the _non-design_ portion only). Without running WGSL, jsdom can still assert: registry round-trips (`register` → `getWgpuRenderEffectRunner` → `has*`), each band registrant installs exactly its expected kind set, `registerStandardWgpuRenderEffects` composes all bands, and the pipeline's `create`/`begin`/`end`/`destroy` orchestration + `acquire*`/`release*` pool bracketing (including the `scene === null` early-return). This converts the per-effect smoke tests into real structural assertions without touching pixel behavior. Strictly additive test coverage, no source change required. (Whether this tier is _sufficient_ as the blessed floor remains the Open direction; building the runnable assertions is sweep-safe regardless of that ruling.)

## Backlog

Parked: cross-package coordination, larger scope, or waiting on an Open direction.

1. **The 8 missing effect runners** (`AutoExposure`, `BarrelDistortion`, `ColorBlindSimulation`, `ContactShadows`, `CustomShader`, `FilmEmulation`, `PanniniProjection`, `VolumetricLight`) — review gap 1. _Parked:_ the agnostic `effects` descriptors raced ahead of both backends, so this is a coordinated `effects-gl` + `effects-wgpu` build (lockstep is a stated value), and `scope` is undecided — whether these are backend recipes at all is an Open direction. `CustomShader` is additionally an API-shape fork (a user-supplied-WGSL seam), not a concrete recipe. Acting in `effects-wgpu` alone would break the sibling-parity invariant.

2. **Depth/velocity G-buffer wiring** — review gap 2. _Parked:_ highest-leverage unblock (7 recipes stuck in color-only fallback: SSAO, ScreenSpaceFog, BokehDepthOfField, SSR, MotionBlur, CameraMotionBlur, TAA), but it requires a `render-wgpu` cross-package addition (`getWgpuRenderTargetDepthTexture`, a sampleable depth attachment, a velocity bookkeeping pass) and a symmetric gl/wgpu design. Cross-package + design decision → Open direction.

3. **TAA history buffer (`historyTarget`)** — review gap 3. _Parked:_ first effect with cross-frame retained state; needs a `@flighthq/types` pipeline-type change touching both gl and wgpu, plus a `destroy*` ownership decision for the retained target. Design fork → Open direction.

4. **Rust mirror (`flighthq-effects-wgpu`) + `effect-*` functional/parity scenes** — review gap 5. _Parked:_ Gold scope, correctly deferred until depth/velocity/TAA settle the pipeline shape. The WGSL bodies are plain string constants (extractable as shared constants for the port), but the port should follow, not lead, the pipeline-shape decisions above. This is also what would give the 44-recipe library real pixel verification in CI (the test-floor ceiling noted in gap 4).

5. **Type homing: move `RenderEffectPipelineOptions` out of `types/src/GlRenderEffectPipeline.ts`** into its own `RenderEffectPipelineOptions.ts` (review §Contract & docs fit b). _Parked:_ correct per the filename-equals-type-name convention, but it touches `@flighthq/types` and the gl pipeline type — cross-package, surfaced not acted on.

6. **Package Map + `render-backend-support.md` documentation additions** (review §Contract & docs fit b). _Parked:_ enumerate the `effects` / `effects-gl` / `effects-wgpu` / `effects-canvas` family and the descriptor-vs-backend split in the codebase-map Package Map, and add an "effects support" row mirroring the backend feature-support matrix (so the 8-effect gap and the depth-null fallback are visible at the map level). Edits to shared admin docs outside this package's cell → route to maintainers, not a within-package sweep.

## Approved

_None. Approval is the user's verbal gate._

---

### Surfaced to the charter's Open directions (noted, not edited here)

The review's candidate open directions are design/cross-package questions for the direction pass; the assessment routes them rather than recommending them:

- **North star / bar:** "1:1 algorithmic parity with `effects-gl`" vs "best WGSL recipe per effect even where it diverges." The HDR-format asymmetry (`rgba16float` present on wgpu, absent on gl) already hints divergence is creeping in — this ruling decides whether that is a bug or a feature.
- **Scope of the 8 missing effects** and whether `CustomShader` is a user-supplied-WGSL seam this package must expose (Backlog 1).
- **Depth/velocity G-buffer go-ahead** — the cross-package keystone (Backlog 2).
- **TAA cross-frame state** — add `historyTarget` to the shared pipeline type? (Backlog 3).
- **Bundle posture** — bless analytical-SMAA / no-LUT / no-`rgba16float`-by-default as the default, with HDR/LUT as opt-ins (the status proposes `rgba16float` as a future default).
- **Test floor** — is the "is a function" + registry-assertion floor accepted for a GPU package whose real verification lives in the not-yet-built functional/parity gates? (the _design_ half of Recommended 2).
