# Functional scenes — what a cell is allowed to show

**Status: ratified 2026-08-19 by the user, except where marked UNDECIDED.** These are rulings, not proposals. The one open question is _where_ antialiasing is applied, not whether it must be uniform.

Read this before adding a scene, adding a backend variant to an existing scene, declaring a backend unsupported, or changing a scene's antialiasing. The procedure for authoring a scene is the [`functional-test`](../.claude/skills/functional-test/SKILL.md) skill; this file is the set of rules that skill's output has to satisfy.

A **cell** is one scene on one backend — `functional/effect-bloom/webgl`. A scene's cells sit side by side in the review tool, and the reviewer's whole job is to spot where they disagree. Every rule below follows from that one fact.

## The governing rule

> If something occupies a neighboring cell, each cell is meant to show the SAME THING.

The reviewer is looking for differences. Any difference a scene puts there _on purpose_ spends the signal the review exists to produce — it trains the eye to accept disagreement, and the next real defect reads as another intentional one. So a scene may not ship a cell that deliberately differs from its neighbours, for any reason, however well documented.

**This is not only about the human reviewer.** Parity is compared mechanically against `CAPTURE_PARITY_TOLERANCE`, and that tolerance has to be loose enough to absorb every difference the corpus ships on purpose. Measured tonight: a scene whose canvas and webgl cells carry _materially different content_ — 6.10% of pixels, mean delta 129.5 — scores 4.35 against a tolerance of 15 and passes, while two scenes fixed to agree score 0.05 and 0.28. Every intentional difference raises the floor the gate must clear, for the whole corpus. **Cells that look precisely the same are the precondition for a tolerance tight enough to catch anything.**

Four things follow, and they are the ones that actually get violated:

### 1. A backend that cannot show the same thing gets no cell

Not a cell with a caveat, not a cell marked as an exception — **no cell**. Ship only the `<name>.<backend>.ts` files for backends that can produce the picture; existence is the manifest.

If only one backend implements a feature, that scene forms zero parity pairs. **That is the correct answer**, and the harness reports zero pairs as uncovered rather than silently green. An honest "nothing to compare" beats a comparison against something that was never the same thing.

### 2. An approximation is a difference

A narrowed substitute — the right idea at lower fidelity — is exactly a neighbouring cell that does not show the same thing. It is not a partial win.

The worked case: `effect-lens-flare` is tagged `[HDR]`, and Canvas 2D is 8-bit. Canvas can express a recognisable lens flare, but not the GPU version's headroom. So Canvas gets no lens-flare cell. The scene keeps its WebGL and WebGPU cells, which are a real pair.

### 3. A scene may not manufacture its own agreement

Reaching a matching image by a **different mechanism** than the feature under test makes parity green by construction and proves nothing. It is worse than a red, because it is reported onward as evidence.

The worked case: `color-adjustment.canvas` blitted an already-red source with no adjustment attached, so its image matched the GL/WGPU siblings byte for byte while exercising no colour adjustment at all. If a cell agrees with its neighbours for a reason other than "the same feature ran", it is a decoy. This is not detectable by lint — an identical image can be reached honestly — so it is on the author.

### 4. Antialiasing policy is uniform across a scene's cells

AA on every cell, or off on every cell. **If it is off, that applies to the canvas and dom cells too, if the scene has them.**

That clause has teeth, because it is not always satisfiable:

| backend | AA control |
| --- | --- |
| Canvas 2D | **none** — `CanvasRenderOptions` has no `antialias` field, correctly: Canvas 2D has no API for it. `imageSmoothingEnabled` governs image scaling, not path edges. |
| DOM | **none** — same, for the same reason. |
| WebGL | `antialias` honoured, and it defaults to `true` (`glRenderState.ts`). Effect targets honour `sampleCount` with a real multisample renderbuffer. |
| WebGPU | **no context-level switch exists by design.** MSAA must be plumbed as `multisample` state through every pipeline, and currently is not — `createWgpuRenderEffectPipeline` normalises any `sampleCount > 1` to 1. |

So a scene with a canvas or dom cell **cannot** be uniformly AA-off, and one with a webgpu cell cannot currently be uniformly AA-on. Do not resolve that by switching WebGL's AA off to match WebGPU: that trades a GL-vs-WGPU difference for a GL-vs-canvas one, which is how the current state was reached.

**UNDECIDED: where AA is applied.** Two routes are open — plumbing `multisample` through the WebGPU pipelines, or supersampling in the functional targets (`tools/harness/*.ts`) for all four backends. The requirement above holds either way. Until it is settled, do not add a scene whose subject is antialiasing quality, and do not add a new `antialias: false` to a scene that has a canvas or dom cell.

## Controls

A control used to be a **backend** cell that deliberately rendered a feature's _absence_, declared with `export const functionalBackendSupport = 'control'`. That form is retired: it is rules 1 and 4 violated in their purest form, and confirming that nothing happened is not a job a picture does well.

What replaces it has two forms, and **they do not have the same availability.** The baked-in control needs nothing and is usable today. The `control` cell is a RATIFIED DESIGN THAT DOES NOT EXIST YET — no `<name>.control.ts` target is implemented, in the harness or anywhere else. Nothing below is an in-progress migration, and reading it as one has already caused a builder to pause work that had no conflict. Until it is built, the baked-in form is the only control there is.

### The baked-in control — always available

Put the reference **inside the picture**: a directly-drawn element beside the treated one, present in every cell. On a correct backend the two agree. The canonical shape, in the user's words: _a true red rect next to an adjusted rectangle._

This keeps the "did the effect actually run" signal inside one image, where it cannot dilute the cross-backend comparison, and it costs no new machinery.

### The `control` cell — DESIGN ONLY, NOT BUILT

**Nothing in this subsection is implemented.** It is written in the present tense because it records a settled design, not because the mechanism exists. Do not author a `<name>.control.ts`, and do not treat an absent one as a gap. When it is built, this marker comes off in the same commit.

The design: a distinct target, `<name>.control.ts`, that draws what the scene is _defined_ to produce. It is **not a backend** and it never occupies the canvas slot.

- **Visible during review, never reviewed.** It is shown alongside the real cells as context, because seeing the target is helpful. It is not a cell anyone is asked to judge, and navigation does not stop on it. _Displayed_ and _reviewable_ are now two different things.
- **Never commissioned.** It does not go to `flight-reference-images` and has no reference image — its appearance is specified in source, so there is nothing for a human to approve. Drift is caught by its fingerprint baseline, the same as any cell.
- **It is the parity reference when present.** Comparing two captured backends compares two things that can both drift; comparing against an authored control fixes one side by construction.
- **It must look precisely the same** as the real cells — not approximately, and not "the same modulo a known difference".

**The condition that makes it sound: derive the control from what the effect is DEFINED to produce, never from what the implementation currently produces.** A control authored by looking at current output agrees with the implementation's bugs, and then two things are wrong in the same way and nothing reports it. That is a second opinion from the same source, not a control.

**Where it is constructible:** only where the expected image is independently derivable — the same boundary the `expectedImageDescription` work maps. A flat tinted rect, yes. A bloom or a radial distortion, no: you would be re-implementing the effect, and agreement between two implementations of the same idea proves nothing. When a control cell is not constructible, use the baked-in form.

### A capability gap is not a control, in either form

"This backend does not implement this feature" needs no picture at all — the correct rendering of an unimplemented feature is nothing. Its home is the support matrix and the package's `status.md`, and its resolution is to implement the feature or record the gap.

**Never put a control in the canvas slot.** Beyond the rules above, canvas is the declared parity _reference_ (`reference: 'canvas'` in `FLIGHT_VISUAL_PARITY_GROUPS`), so excluding a canvas cell silently re-shapes that scene's parity from reference-based to all-pairs. One declaration doing two unrelated jobs is a mixed signal by construction.

### When you find a backend without an implementation

Ask **can it, or has nobody written it** — and answer from what the backend can express, not from what the scene currently does. `effects-canvas` ships `drawCanvasImageDataPass` precisely for effects with no CSS-filter equivalent, so "Canvas can only do CSS filters" is not the constraint it looks like. Five cells were assumed inexpressible on canvas; four turned out merely unwritten.

- **Implementable → implement it.** A feature area that is partially built is unfinished work, not a design choice (`AGENTS.md`). Deleting a cell that could have been made to work discards a capability slot, and it is expensive to reverse: cells appear in the coverage manifest, the calibration file, the hold ledger, and committed baselines.
- **Genuinely impossible, or only approximable → no cell**, and record the gap where it will be acted on.

## Holds

`scripts/reference-image-held.json` names cells that must not be commissioned, with who holds each and why. A hold is checked **before** any local evidence is read, so a cell that looks perfect in today's capture still stays held — the holder knows something a capture cannot see.

**A hold's reason must name a condition someone else could check and thereby release.** "Held pending a design ruling" names no question, so nobody can release it; eight cells sat still for four days behind exactly that sentence. And when a reason goes stale, rewrite it rather than releasing on it — a hold released by disproving a reason that was already false releases a cell we know is broken.

Releasing a hold is deleting its entry, which is a reviewed change with a name on it. Whoever rewrites a reason records in the commit what the old one said and why it no longer applies.
