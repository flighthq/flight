---
package: '@flighthq/effects-gl'
role: package
crate: flighthq-effects-gl
draft: false
lastDirection: 2026-07-31
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# effects-gl — Charter


## What it is

WebGL 2 backend for screen-space post-process effects — the GPU runner layer that turns the data-descriptor effects in `@flighthq/effects` into multi-pass fullscreen shader recipes, plus the post-process pipeline that drives them (MSAA-aware HDR scene target, ping-pong pooled-target loop, per-`GlRenderState` effect registry, program + uniform-location cache, depth/velocity seams).

It also owns the explicit per-node target-to-target application over `RenderTexture` leases. This is
the backend bridge between a subtree captured through `createGlOffscreenRenderState` and explicit
`Sprite + RenderTexture` composition; it never reaches into or mutates a live render proxy.

It is the GL sibling of `effects-wgpu` and `effects-canvas`: same effect descriptor types (owned by `@flighthq/types`), same six-band taxonomy, same intent — the only difference is the substrate it rasterizes against. It ends where `@flighthq/effects` begins (substrate-agnostic effect _intent_ and shared parameter math) and where `render-gl` begins (the GL state, targets, fullscreen program plumbing, and any retained G-buffer/history infrastructure). `effects-gl` owns the _shader recipe per effect_ and the _post-process pipeline_ — not the descriptors, not the GPU core.

## North star

_Proposed from the package design + the SDK-wide forks; edit or reject in review._

1. **One real runner per registered effect — never a switch.** Each effect is a self-contained `apply<Name>EffectToGl` + `defaultGl<Name>EffectRunner` pair with its fragment source colocated, wired through a per-state registry so an unused effect tree-shakes out. A fake identity runner is absent rather than hidden on another lane.
2. **The backend differs, the intent does not.** Effect descriptor types live in `@flighthq/types`; substrate-agnostic parameter math lives in `@flighthq/effects`. `effects-gl` consumes those and adds only the GL realization, so GL, WGPU, canvas, and the future Rust backend derive identical results from the same descriptor. (Open: whether consuming the shared math is a contract requirement — see Open directions.)
3. **Explicit GPU lifecycle.** The pipeline allocates and frees deterministically — `create/destroy` for owned GPU resources (`destroy*`, not `dispose*`), `acquire/release` brackets balanced on every pooled target, program/uniform caches keyed to the object they outlive. No hidden allocation per frame.
4. **Names tell the truth about what runs.** A registered runner performs the named, parameter-responsive effect. GL TAA and SSR were unconditional identity copies and are therefore absent.
5. **Symmetric invariants, substrate-specific sets.** GL, WGPU, and Canvas use the same registry and naming shape, while each backend exposes only its realized kinds. Symmetry never requires a fake counterpart.

## Boundaries

_Proposed; edit in review._

**In scope**

- A GL fragment-shader recipe per render effect, across the antialiasing / bloom-optical / blur / color-tone / screen-space-atmospheric / stylize bands.
- The post-process pipeline: MSAA-aware HDR scene target, ping-pong pooled targets, final GL→GL present blit, and the seams that feed effects (depth, velocity).
- The per-state effect registry, matching per-kind registrars, program cache, and uniform-location cache.
- Consuming descriptor types from `@flighthq/types` and shared effect math from `@flighthq/effects`.

**Non-goals**

- Effect _descriptor_ types or substrate-agnostic parameter math — those belong upstream (`@flighthq/types`, `@flighthq/effects`).
- The GL core itself — GL state, render targets, fullscreen programs, and any retained G-buffer/history/normal infrastructure belong to `render-gl`.
- Filters (the per-display-object `@flighthq/filters-gl` family) — a separate pass with its own backend package.
- Effect-chain orchestration policy (validation, ordering, tone-map-last) _as a built feature_ — unsettled ownership (see Open directions).
- Canvas2D / WGPU realizations — sibling packages.

## Decisions

- **2026-07-02 — TS-leads, Rust conforms later.**
- **2026-07-31 — GL has 46 realized built-ins.** TAA and SSR identity implementations were deleted in full; every remaining default runner has exactly one matching per-kind registrar.
- **2026-07-31 — Export lanes are curated.** The reachability baseline reports dot/contract moves without making current placement a hard invariant.

## Open directions

Every candidate question the review surfaced, plus the structural forks that touch this package. These are for you to settle; an agent asks here rather than assuming.

1. **Fidelity threshold for lower-quality realizations.** SSAO and SMAA are parameter-responsive GL recipes but intentionally lower quality than depth-driven/multi-pass reference algorithms. Define the evidence threshold that separates an acceptable realization from a wrong effect; unconditional identity is already settled as absent.
2. **Canonical bloom math home (fork C — within-unit duplication).** `glBloomEffect.ts` reimplements mip-count and soft-knee math inline instead of consuming the shared `@flighthq/effects` helpers (`computeBloomMipCount`/`computeBloomMipWeights`/`computeBloomThresholdKnee`) added in the same bundle — and the two **disagree** (clamp + `/4` on mip count; scaled-vs-unscaled knee). This guarantees GL↔WGPU↔(future Rust) bloom divergence. Should _all_ bloom backends be required to consume the shared helpers (making divergence a contract/lint failure), and **which derivation is canonical** — the `effects` one or the GL one? (Relates to North star #2.)
3. **Backend-parity test scope.** There are no `tests/functional/effect-*-gl` scenes proving GL output agrees with canvas/wgpu; the colocated tests verify wiring, not pixels. Is carrying parity scenes part of "done" for `effects-gl`, or is that owned by the functional-test harness layer? This settles whether the missing parity coverage is a gap _in this package_.
4. **Chain orchestration ownership (fork — cross-package).** No `validateGlRenderEffectChain` / `orderGlRenderEffectChain` / tone-map-last helper exists; the pipeline silently skips unregistered kinds. Where does chain validation/ordering live — a `RenderEffectChainHint` type in `@flighthq/types`/`@flighthq/effects` consumed here, or a helper in `render-gl`? (Mirrors the `filters-gl` ruling that the chain applier is out of scope for the leaf-shader package.)
5. **G-buffer quality seam.** A sampleable depth/normal G-buffer would improve the realized depth-sensitive effects. Treat it as a quality upgrade across the GPU backends, not permission to restore deleted TAA/SSR stubs.
6. **Per-kind discoverability.** The register-all/category aggregates were retired. Decide whether generated documentation from the source-derived runner set is sufficient or whether a separate query API has a real consumer.
7. **Standard GPU-effects maturity items (deferred, cross-package).** Context-loss recovery, `rgba16f` fallback, and effect-chain fusion are normal maturity work for a GPU effects backend; all are deferred and depend on `render-gl`. Park or schedule?
8. **Admin-doc maintenance.** Generate backend-capability prose from the same runner inventory used by reachability where practical; hand-maintained counts and aggregate names have repeatedly drifted.
