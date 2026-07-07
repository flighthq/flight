---
package: '@flighthq/effects-gl'
updated: 2026-06-24
basedOn: ./review.md
---

# effects-gl — Assessment

> Recommendation layer over `review.md` (survey of bundle `builder-67dc46d64`) and the absorbed `reviews/maturation/depth/effects-gl.md` roadmap. `Recommended` is strictly sweep-safe (within-package, no cross-package coupling, no breaking change, no open design decision) so "do all recommended" is always safe to bless. Design forks and cross-package items are noted for the charter's **Open directions**, not placed here. `Approved` stays empty until a verbal gate.
>
> The roadmap is being consumed: its **entire Bronze tier already landed in this bundle** (batch + category + taxonomy registrars, `getGlRenderEffectKinds`, `hasGlRenderEffectRunner`, dropped `@flighthq/filters` dep), as did two Silver items (mip-pyramid bloom, uniform-location cache). Those are not re-recommended. The depth roadmap can be removed once this assessment is in place.

## Recommended

Sweep-safe, in-package, no design decision. The bundle already did the bulk of the easy in-package work, so this set is intentionally small — the substantive remaining gaps are all either cross-package or design-gated (see Backlog) and must not be swept.

- **Record GL effects + stand-ins in `render-backend-support.md`.** That doc is the source of truth for "what renders on each backend," and the review found it silent on `effects-gl`: it should state that the 44 GL post-process runners exist and that `Ssr`/`Taa`/`Ssao`/`Smaa` are honest stand-ins (passthrough / luminance-variation / single-pass), so a scoping agent does not assume real depth-driven AO/reflections on GL. Purely descriptive doc hygiene — no design content, no source change, no API surface. (Source: review.md "Contract & docs fit › admin docs stale".)

## Backlog

Parked — each carries a reason. Nothing here is sweep-safe.

### Cross-package (header-first; cannot land in `effects-gl` alone)

- **Chain-ordering / validation metadata** — `validateGlRenderEffectChain`, `orderGlRenderEffectChain`, `withGlRenderEffectToneMap`. _Parked:_ requires a new `RenderEffectChainHint` type in `@flighthq/types` and `getRenderEffectChainHint` in `@flighthq/effects` first; `effects-gl` must not define cross-package types inline. Also depends on the chain-orchestration-ownership decision (Open direction #5).
- **CMAA2 / MLAA as a second non-temporal AA option** — _Parked:_ needs a new descriptor type in `@flighthq/types` + `@flighthq/effects`. Header-first, same reason as above.
- **Real TAA** — `applyTaaEffectToGl` with reprojection/neighborhood-clamp/blend. _Parked:_ the `sceneVelocityTexture` seam exists but a per-pipeline **history target** does not; needs a `GlRenderEffectPipeline.historyTarget` field in `@flighthq/types` plus a `render-gl` state-lifecycle change to retain/resolve the prior frame. Gated on the G-buffer/history seam (Open direction #6).
- **Real depth-driven SSAO** (then DoF + screen-space fog) — _Parked:_ needs a sampleable scene depth texture end-to-end and `GlRenderEffectContext.sceneDepthParams` (near/far/projection) in `@flighthq/types`. Highest-value substrate upgrade, but gated on whether the 2D scene path writes depth — a cross-package seam decision (Open direction #6).
- **Backend-parity functional coverage** — `tests/functional/effect-*-gl` scenes proving GL output agrees with canvas/wgpu under `test:functional:parity`. _Parked:_ this is the highest-value missing coverage for the backend, but it lives in the functional-test harness layer, not in-package, and whether `effects-gl` "owns" carrying these scenes is itself unsettled (Open direction #4). jsdom cannot reach rendered pixels, so the colocated `*.test.ts` files are wiring/closure checks by necessity.
- **Sibling lockstep with `effects-wgpu`** — every addition above should land as a matched pair to preserve cross-backend (`canvas`/`gl`/`wgpu`) consistency, verified by `test:functional:parity`. _Parked:_ crosses into `effects-wgpu`; coordinate, do not sweep.
- **Rust mirror (`flighthq-effects-gl`)** — mirror each landed TS addition (`register_default_*`, pyramid bloom, future chain/validate/order, real SSAO) and pair conformance scenes by name for the parity differ. _Parked:_ lives in the Rust worktree; track intentional divergences in the conformance map.
- **Package Map entries** — add `effects`, `effects-gl`, `effects-wgpu`, `effects-canvas` lines to `agents/index.md`. _Parked:_ not a `render-backend-support.md`-style factual note about this one package — it adds entries for sibling packages too, so it is a cross-package admin-doc edit better made once across the `effects` family than piecemeal here.

### Design-gated (waiting on an Open direction → routed to the charter)

- **Bloom math: consume `@flighthq/effects` helpers, reconcile canonical derivation.** The bundle's pyramid bloom **reimplements** mip-count and soft-knee math inline that `effects/bloomMath.ts` now ships as shared helpers (`computeBloomMipCount`, `computeBloomMipWeights`, `computeBloomThresholdKnee`), and the two **disagree** (GL clamps mip count 1–6 and `/4`s; GL's knee is unscaled vs `effects`' `thresholdKnee * threshold`). This guarantees GL↔WGPU↔Rust bloom divergence and defeats the helpers' stated "all backends derive identical parameters" purpose. _Parked:_ swapping in the shared helpers changes bloom output, and _which_ of the two derivations is canonical is an open call (fork C, Open direction #2) — not sweep-safe until the user blesses the canonical math. This is the single most important parked item: it is a live correctness/consistency regression, not just polish.
- **Naming honesty for stand-ins** (`Ssr`/`Taa`/`Ssao`/`Smaa`) — keep under canonical names with honest comments, or relocate to an `experimental`/`stub` namespace until the G-buffer/history seam lands. _Parked:_ reshapes the public effect set; explicitly escalated by the status doc (Open direction #1).
- **Taxonomy reconciliation** — bless the six-band taxonomy as canonical and decide whether to keep or drop the four-band back-compat aliases; settle `BloomEffect`/`DitherEffect` band placement vs the wgpu sibling. _Parked:_ a naming decision, low urgency (last-write-wins, no runtime impact) (Open direction #3).

### Larger / deferred maturity (Gold, no decision but substantial)

- **Performance & robustness** — half-resolution quality scale for expensive families (bloom/DoF/SSAO) via a descriptor field; context-loss recovery (the `glEffectProgramCache` WeakMap holds dead programs after `webglcontextrestored`); `rgba16f`-unsupported fallback (extension probe → degrade to `rgba8` with a sentinel rather than a black screen); zero-size target guards. _Parked:_ several touch `render-gl` lifecycle or need a descriptor field in `@flighthq/types`; the quality-scale field is header-first.
- **Effect-chain fusion** — `fuseGlRenderEffectChain` collapsing adjacent color-only point effects into one fullscreen pass. _Parked:_ larger optimization layer, lower priority than the parity/seam work above.
- **Per-effect reference + pipeline cookbook docs** — _Parked:_ documentation pass, sequence after the feature surface stabilizes.

## Approved

_None. Approval is the user's verbal gate; this section is frozen only on that approval._

## Notes for the charter's Open directions

These came out of the review/roadmap and need a user decision; surface into `charter.md › Open directions` (do not edit the charter from here):

1. **Naming honesty for the screen-space stand-ins** (`Ssr`/`Taa`/`Ssao`/`Smaa`).
2. **Canonical bloom math home** — require all backends to consume `@flighthq/effects` bloom helpers (divergence becomes a contract failure), and pick which of the two current mip/knee derivations is canonical.
3. **Taxonomy reconciliation** — bless six-band as canonical; keep or drop the four-band aliases.
4. **Backend-parity test scope** — does `effects-gl` carry `tests/functional/effect-*-gl` scenes, or does the functional-test harness layer own them?
5. **Chain-orchestration ownership** — `RenderEffectChainHint` in `effects` consumed here, or a helper in `render-gl`?
6. **G-buffer / history-target seam in `render-gl`** — the single cross-package dependency unblocking real SSR/SSAO/TAA at once (retained-target shape, depth/normal buffers). Surface as one design item rather than three separate effect TODOs.
