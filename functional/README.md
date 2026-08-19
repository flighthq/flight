# Functional scenes — what a cell is allowed to show

**Status: ratified 2026-08-19 by the user, except where marked UNDECIDED.** These are rulings, not proposals. The one open question is _where_ antialiasing is applied, not whether it must be uniform.

Read this before adding a scene, adding a backend variant to an existing scene, declaring a backend unsupported, or changing a scene's antialiasing. The procedure for authoring a scene is the [`functional-test`](../.claude/skills/functional-test/SKILL.md) skill; this file is the set of rules that skill's output has to satisfy.

A **cell** is one scene on one backend — `functional/effect-bloom/webgl`. A scene's cells sit side by side in the review tool, and the reviewer's whole job is to spot where they disagree. Every rule below follows from that one fact.

## The governing rule

> If something occupies a neighboring cell, each cell is meant to show the SAME THING.

The reviewer is looking for differences. Any difference a scene puts there _on purpose_ spends the signal the review exists to produce — it trains the eye to accept disagreement, and the next real defect reads as another intentional one. So a scene may not ship a cell that deliberately differs from its neighbours, for any reason, however well documented.

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

## Controls: not a cell

A control used to be a cell that deliberately rendered the _absence_ of a feature, declared with `export const functionalBackendSupport = 'control'`. That is retired. It is rule 1 and rule 4's violation in its purest form, and the review job it created — confirming that nothing happened — is not a job a picture does well.

**Two separate things were being conflated. Send each to its own home:**

- **"This backend does not implement this feature."** A capability fact. It needs no picture; the correct rendering of an unimplemented feature is nothing. Its home is the support matrix and the package's `status.md`, and its resolution is to implement the feature or record the gap — not to photograph it.
- **"The effect visibly did something."** A within-backend fact, and a picture _does_ answer it — so **bake the control into the scene**: a directly-drawn reference element beside the treated one, in every cell. On a correct backend the two agree. This keeps the signal inside one image, where it cannot dilute the cross-backend comparison.

  The canonical shape, in the user's words: _a true red rect next to an adjusted rectangle._

**Never declare a canvas cell a control.** Beyond the rules above, canvas is the declared parity _reference_ (`reference: 'canvas'` in `FLIGHT_VISUAL_PARITY_GROUPS`), so excluding a canvas cell silently re-shapes that scene's parity from reference-based to all-pairs. One declaration doing two unrelated jobs is a mixed signal by construction.

### When you find a backend without an implementation

Ask **can it, or has nobody written it** — and answer it from what the backend can express, not from what the scene currently does. `effects-canvas` ships `drawCanvasImageDataPass` precisely for effects with no CSS-filter equivalent, so "Canvas can only do CSS filters" is not the constraint it looks like. Five cells were assumed inexpressible on canvas; four turned out merely unwritten.

- **Implementable → implement it.** A feature area that is partially built is unfinished work, not a design choice (`AGENTS.md`). Deleting a cell that could have been made to work discards a capability slot, and it is expensive to reverse: cells appear in the coverage manifest, the calibration file, the hold ledger, and committed baselines.
- **Genuinely impossible, or only approximable → no cell**, and record the gap where it will be acted on.

The rule is not "delete the control declaration". It is: decide which of the two homes above the fact belongs in, and put it there.

## Holds

`scripts/reference-image-held.json` names cells that must not be commissioned, with who holds each and why. A hold is checked **before** any local evidence is read, so a cell that looks perfect in today's capture still stays held — the holder knows something a capture cannot see.

**A hold's reason must name a condition someone else could check and thereby release.** "Held pending a design ruling" names no question, so nobody can release it; eight cells sat still for four days behind exactly that sentence. And when a reason goes stale, rewrite it rather than releasing on it — a hold released by disproving a reason that was already false releases a cell we know is broken.

Releasing a hold is deleting its entry, which is a reviewed change with a name on it. Whoever rewrites a reason records in the commit what the old one said and why it no longer applies.
