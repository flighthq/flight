# Effect Recipes — where an intent becomes backend passes

**Status: proposal, awaiting ruling. Raised 2026-08-01 from downstream consumer feedback measured against
`0.3.0-next.1445`.** One section is settled and marked so; everything under [The open question](#the-open-question)
is not.

Read before adding a field to an effect descriptor, before changing how an effect chain sequences its
passes, or before adding an effect runner to a backend. The narrow question is why `strength` behaves
differently on every backend. The wider one this document exists to settle: **who converts an effect intent
into passes, and what happens when a backend can only partly realize it?**

## Settled: what `strength` means

**Ratified by the user 2026-08-01, conditional on verification; the condition is met and cited below.
Implementable independently of everything else in this document.**

> `strength` is a **gain on coverage, applied after the spatial operator, then clamped**. The color's own
> alpha multiplies the result *outside* that clamp.

For the glow/shadow family, with `blur` the spatial operator applied to source alpha:

```
outer:  alpha_out = color.a * saturate(blur(src.a) * strength)
inner:  alpha_out = color.a * saturate((1 - blur(src.a)) * strength)
```

Three independent sources agree:

- **Ruffle's `render/wgpu/shaders/filter/glow.wgsl`**, reverse-engineered against Flash Player:
  `let alpha = filter_args.color.a * saturate(blur * filter_args.strength);` and the inner variant
  `saturate((1.0 - blur) * filter_args.strength)`.
- **Adobe AS3 docs** for `GlowFilter` / `DropShadowFilter`: "the strength of the imprint or spread… the
  higher the value, the more color is imprinted", valid range **0–255**. A 0–255 gain only makes sense as a
  multiplier on normalized coverage that then clamps; as a pass count it would be nonsense.
- **OpenFL 9.5.2**, measured by the downstream consumer: `uStrength` applied on the final blur pass only,
  `clamp(a * uStrength, 0, 1)` against blurred alpha.

This is the definition Flight adopts on its own merits, not by mirroring anyone's code or constants. Two
properties force it:

- **Separability.** Applied pre-blur, `strength` interacts with the kernel and vanishes entirely on a
  saturated source. Applied post-operator, it is orthogonal to spatial extent — which is the only reason
  `blur` and `strength` deserve to be two parameters.
- **Continuity.** `Math.floor(strength)` repeated composites are neither continuous nor monotonic
  (`1.9` behaves as `1.0`), and repeated source-over is *screen* (`1-(1-a)^N`), making the meaning of
  `strength` a function of pass count.

### Three corollaries

1. **`strength` is not `intensity`.** Gain-on-coverage is clamped and lives in the alpha domain;
   gain-on-energy (`BloomEffect.intensity`) is unclamped and lives in the color domain, because additive
   light legitimately exceeds 1. `glBevelEffect.ts:137` currently names its uniform `u_intensity` while
   implementing strength. Two quantities, two names, never one uniform.
2. **For the gradient family, `strength` scales the ramp *sample*, not the lookup *coordinate*.** Scaling
   the coordinate changes which color is sampled — that alters the glow's hue rather than its strength.
3. **The missing primitive is a post-operator coverage-gain pass.** `Bevel` is the only correct effect
   precisely because it owns one (`glBevelEffect.ts:137`); every other runner reaches for the shared tint
   pass, which is pre-blur by construction, and fakes strength with whatever it had left.

### What is wrong today

All three backends, same defects:

| Effect | Current | Correct |
|---|---|---|
| InnerGlow, InnerShadow | pre-blur clamp only (`glInnerGlowEffect.ts:77`, `glInnerShadowEffect.ts:80`) | post-operator gain |
| OuterGlow, DropShadow | `min(1,s)` pre-blur + `floor(s)` repeated composites (`glOuterGlowEffect.ts:42-43`, `glDropShadowEffect.ts:46-47`) | post-operator gain |
| GradientGlow, GradientBevel | `min(1,s)` pre-blur, never read again (`glGradientGlowEffect.ts:70`, `glGradientBevelEffect.ts:95`) | post-operator gain on the ramp sample |
| Bevel | post-blur ✅ | — |

Two further ordering defects, independent of the above:

- **Color alpha is folded inside the clamp.** `glEffectTintShader.ts:16` computes
  `min(1.0, a * u_alpha * u_strength)`; the reference applies `color.a` *outside* the saturate. With
  `alpha=0.5, strength=4` the reference yields at most 0.5, Flight yields up to 1.0 — so `alpha` and
  `strength` are not independently controllable either.
- **Inner effects invert before the blur instead of after.** `INVERT_TINT_FRAGMENT_SRC`
  (`glEffectTintShader.ts:31`) inverts source alpha and then blurs. The reference blurs and then inverts.
  These coincide in the interior (normalized kernel, partition of unity) but diverge at the source border,
  where the blur reads zeros outside the texture while the inverted field should read 1 — i.e. exactly on
  antialiased edges.

Correct order: **blur → invert (inner only) → × strength → saturate → × color.a.**

### Test gap

No test compares rendered output at `strength=1` against `strength=2`. Worse,
`glInnerGlowEffect.test.ts:81` passes `strength: 2` and then asserts on `edgeColor` — so strength is
incidental input to an unrelated assertion, and the file *reads* as though strength is covered. Any fix
needs a differential assertion, which is cheap and unit-level; no render baseline is required.

**Fixing strength will churn functional baselines for every effects leg.** That is expected, not a
regression.

## The defect class underneath

The consumer's own framing, and it is the right one:

> fields that accept a value and then silently discard or reshape it. These typecheck cleanly and render
> plausibly, so they cost far more to find than an error would.

Three measured instances, all still live:

- **`BloomEffect.passes` is read by nothing.** Declared at `packages/types/src/BloomEffect.ts:8`, present in
  the defaults table at `renderEffectDefaults.ts:63`, zero reads in the GL, WGPU, or canvas bloom runners.
- **The defaults table is stale in both directions and consumed by nobody.**
  `getRenderEffectDefaults` / `normalizeRenderEffect` are exported (`effects/src/index.ts:123,133`) and
  fully tested, but **called by no runner, example, or pipeline**. The table was never wired in; it did not
  drift. `renderEffectDefaults.ts:63` proves it — `BloomEffect` lists `brightness`, `mipCount`,
  `thresholdKnee` (none of which exist in the type, so they are unsettable) and **omits `intensity`**, which
  does exist and is read by all three runners. Same shape in `SsrEffect`, `MotionBlurEffect`,
  `BokehDepthOfFieldEffect`.
- **ToneMap `exposure` is a unit mismatch, not a default disagreement.**
  `effects/src/toneMapMath.ts:31-35` documents exposure as EV / photographer's stops (`EV=0 → 1.0`) and is
  tested asserting exactly that — and `computeExposureScale` **is called by nothing but its own test**.
  Meanwhile `glToneMapEffect.ts:15` does `effect.exposure ?? 1` and passes it raw to `c.rgb * u_exposure`;
  WGPU is identical. So the semantics layer says EV stops (neutral 0), the runners say linear multiplier
  (neutral 1). The defaults table's `exposure: 0` was **correct**. `exposure: 2` means 4× documented and 2×
  shipped. It survives because 1× happens to look neutral.

Two orphaned-semantics helpers (`normalizeRenderEffect`, `computeExposureScale`) is a pattern, not an
accident: **nothing requires a runner to consult the semantics layer**, so runners write their own inline
`?? fallback` and drift from it silently.

## Where the layers sit today

| Layer | What it is | Belongs in | Today |
|---|---|---|---|
| **Ingredients** | values and math — kernel weights, σ from radius, tone curves, per-field defaults and units | `effects` | ✅ present (~40 `compute*` exports) |
| **Recipe** | ordering and policy — what passes, in what order, what fuses, which scratch slot | *open — see below* | ❌ **triplicated in the backends** |
| **Realization** | how a pass becomes a draw — shader source, target allocation, present | `effects-*` | ✅ correct |

The dependency direction is already correct and one-way: `effects` depends on `render`, `signals`, `types`
only; each `effects-*` depends on `effects` plus its backend. **`effects` is already a dependency of
`effects-*`, and the kernel math is already shared** — the inverse arrangement (a meta-package *over* the
backends) is not merely undesirable but self-defeating: it forces shared ingredients into a fourth package
below both, and that package is `effects` as it exists today, with a dispatcher added on top that must
import every backend and destroys tree-shaking.

What is *not* shared is the recipe. `glRenderEffectPipeline.ts` (213 lines),
`wgpuRenderEffectPipeline.ts` (242), and `canvasRenderEffectPipeline.ts` (183) run the **same algorithm**:
walk operations, accumulate a maximal run of pointwise adjustments, fuse matrix-tier into one 4×5 matrix or
bake a LUT if any member is LUT-tier, flush on an effect boundary, ping-pong `scratchA`/`scratchB`, treat an
unregistered kind as an identity copy, present.

Canvas is **not** structurally different — it ping-pongs identically (`canvasRenderEffectPipeline.ts:106-160`).

Three transcriptions of one recipe have already drifted: GL threads the real `sceneDepthTexture`
(`glRenderEffectPipeline.ts:169`) while WGPU passes `null` (`wgpuRenderEffectPipeline.ts:165`) — a
capability divergence hiding inside copy-pasted code.

## The open question

**Who converts an effect intent into passes?** Two shapes were considered on 2026-08-01. Neither is ratified.

### Shape A — backend-neutral plan in `effects`

`planRenderEffectChain(operations, registry, outPlan)` returns plain data: an ordered array of passes
(`fusedMatrix` / `lut` / `effect` / `identity`), each naming the scratch slot it reads and writes. Backends
loop the plan and execute it.

Argues for itself on: no vtable or inversion of control (a free function over plain data, C-portable);
`effects` stays testable with numbers rather than mocks; backend files stay linear; a backend can inspect
the plan and optimize before executing.

**Its binding constraint:** the plan must be expressed in **intent, not mechanism**. A pass that says "3 box
passes at radius 4" is unrealizable on canvas and manufactures a capability gap out of an implementation
detail; a pass that says "gaussian coverage, σ=8" is fully realized by one CSS filter *and* by three box
passes. Push mechanism into a neutral plan and every backend becomes falsely "partially supporting".

### Shape B — backend-specific recipes over shared architecture *(currently favored by the user, 2026-08-01)*

Converting an intent into a recipe is a **backend-prefixed** call in `effects-*` — `planGlBlurEffect(...)`,
`planCanvasBlurEffect(...)` — reusing pass/plan types and sequencing scaffolding owned by `effects`. Paired
with an `is*Compatible` query per kind, so a caller can ask whether an intent is *fully* realized.
**Absence of these functions is the signal that the backend does not support the kind at all.**

This dissolves Shape A's binding constraint: because the recipe is built per backend, it may be
mechanism-level (3 box passes for GL, one CSS filter for canvas) without inventing gaps.

It also matches conventions already enforced elsewhere: the backend token prefixes the type
(`npm run backend-prefix:check`), `is*` is the blessed boolean prefix, and absence-as-reliable-negative is
already the registration model's rule.

**Open cost:** it multiplies the per-kind surface. Today a kind carries `apply*EffectTo*` +
`default*EffectRunner` + `register*Effect`; adding `plan*` and `is*Compatible` makes five exports per kind
across 47 GL / 45 WGPU / 18 canvas kinds — and `npm run exports:check` requires a colocated test per export.

### Constraints any answer must satisfy

- **No hidden allocation.** A plan is an array of passes rebuilt per frame per node. `create*` may allocate;
  planning must write into a caller-owned `out` buffer with an explicit count, in the shape the quad-batch
  writer already uses (preallocated typed array + count, not `push`). This is a hard requirement, not a
  later optimization.
- **Out-parameter aliasing safety.** Read all inputs into locals before writing output fields.
- **The bundle invariant.** Whatever owns the recipe must stay per-effect and shakable. Moving adjustment
  fusion into `effects` adds an `effects → adjustments` edge; `adjustments` depends on `@flighthq/types`
  alone, so the edge is cheap, but it must be confirmed with `npm run size`.
- **Intent-vs-mechanism** (Shape A only, see above).

## Partial realization — the rule already exists, one level up

Flight has blessed this rule twice, in two domains:

- `capture-verification-tiers.md`: **"A tier either has what it needs and gates hard, or it fails loudly
  saying so. There is no silent degrade-to-success."** — "a leg that reports success while checking almost
  nothing is worse than an absent leg, because an absent leg is visibly absent."
- `registration-model.md` §3: "a `register*` function is added only alongside a real implementation, and a
  kind a backend does not implement gets no registrar and no runner rather than a stub that registers and
  does nothing." Runners that were registered-but-unrealized have already been **deleted** under this rule.

Applied to recipes, there are three honest responses to "I cannot fully realize this" and one dishonest one:

- **Decline** — register nothing. Absence is a reliable negative; the chain treats the kind as an identity
  copy (`canvasRenderEffectPipeline.ts:148-151`).
- **Approximate** — realize it perceptually. Legitimate, and the point of per-backend realization: CSS
  `blur(8px)` and three box passes are both complete realizations of "gaussian σ=8".
- **Declare** — register, realize what you can, report the gap as queryable data (`is*Compatible`, plus an
  `explain*` returning *which* fields are unrealized rather than a bare boolean).
- **Accept-and-drop** — take the field, typecheck it, ignore it. This is what ships today.

**The granularity gap.** The rule is enforced for whole kinds and for CI tiers. It has never been applied to
**fields inside a registered kind** — and every defect in this document lives in exactly that gap.
`BloomEffect` *is* registered on all three backends; each claims to realize it; each drops `passes`. The
chain-level partial case is already diagnosed (`applyGlRenderEffectsToRenderTexture` returns `true` having
dropped unregistered kinds; the guard names it `partial-registration`). The field-level case has nothing.

Proposed, unratified: extend `npm run reachability:check` from the runner↔registrar inverse down to
**field-level reachability** — every optional field on an effect descriptor must be read by at least one
registered runner or semantic helper. Start narrow (effect descriptors only) and **report-only, like
`docs:check`**, to measure the false-positive rate before gating. Shape B makes this cheaper and more
accurate, since a field's read moves to one `plan*` / `is*Compatible` site per backend rather than being
scattered through a runner body.

## Cross-links

- [effect / adjustment / material architecture](effect-adjustment-architecture.md) — the three-tier model
  this sits inside. Unchanged by anything here.
- [render view model](render-view-model.md) — **unratified**, and converging with this. To own a recipe,
  some layer needs a backend-neutral notion of "a target you can run ordered passes over, with scratch" —
  the same primitive the offscreen-render ergonomics need. Related finding recorded there: a derivative
  render state currently starts with `renderTargetViewport = null` (`glRenderState.ts:269`) while
  `renderIntoGlRenderTexture` sets that slot on the *screen* state's runtime, so opening a pass on one state
  and drawing with another silently projects through the screen canvas.
- [registration model](registration-model.md) — the two public doors and the absence-is-a-reliable-negative
  rule that Shape B extends.
- [render backend support](render-backend-support.md) — declared realization would give the generated
  support matrix a second, independent source to cross-check against functional baselines.

## What this does not settle

The choice between Shape A and Shape B; whether `is*Compatible` returns a boolean or structured data;
whether the chain's fusion policy is shared or per-backend; and the per-kind export-surface cost of Shape B.
The `strength` definition above is settled and may be implemented without waiting for any of it.
