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

Every scene source module states that policy beside its expected-image declaration:

```ts
declareAntialiasingPolicy('aa');
// or: declareAntialiasingPolicy('no-aa');
```

The call is a checked claim about the final reviewed picture, never a renderer setting. It accepts only those two literal values: there is deliberately no `mixed`, `inherit`, computed, or default state. A backend-agnostic source makes one declaration for every cell it produces; backend-specific sibling modules each declare locally and must agree. `npm run check:functional-antialiasing` gates declaration presence and sibling agreement immediately. Its declaration-vs-effective-configuration census remains report-only until the newly available WebGPU path is deliberately enabled in the harness: doing so changes every WebGPU picture and is sequenced with one authorized re-baseline rather than smuggled into an unrelated change.

That clause has teeth, because it is not always satisfiable:

| backend | AA control |
| --- | --- |
| Canvas 2D | **none** — `CanvasRenderOptions` has no `antialias` field, correctly: Canvas 2D has no API for it. `imageSmoothingEnabled` governs image scaling, not path edges. |
| DOM | **none** — same, for the same reason. |
| WebGL | `antialias` honoured, and it defaults to `true` (`glRenderState.ts`). Effect targets honour `sampleCount` with a real multisample renderbuffer. |
| WebGPU | **no context-level switch exists by design.** `WgpuRenderOptions.antialias` now opts the main surface into a 2× supersample-and-linear-resolve step, default off. Effect-target `sampleCount > 1` remains a separate unsupported capability and is still normalised to 1. |

So a scene with a canvas or dom cell **cannot** be uniformly AA-off. A WebGPU cell can now opt into AA, but the functional harness deliberately leaves that option off until the associated picture changes can be captured once under the standing re-baseline decision. Do not resolve the interim mismatch by switching WebGL's AA off: that trades a GL-vs-WGPU difference for a GL-vs-canvas one, which is how the current state was reached.

**DECIDED: AA is a real SDK render step, not a harness filter.** The WebGPU state renders its main surface at 2× in each axis and resolves once into the canvas (or the enabled frame-capture target) before submit. The option defaults off, and `tools/harness/webgpu.ts` does not enable it yet. This does not implement multisampled effect targets: a scene whose subject is `sampleCount: 4` remains held until that distinct capability exists. Until the one authorized AA re-baseline is sequenced, do not add a scene whose subject is antialiasing quality, and do not add a new `antialias: false` to a scene that has a canvas or dom cell.

### 5. Parameters are off-centre and off-axis, or the scene cannot catch a convention error

A scene that passes a symmetric or neutral parameter value **cannot reveal a convention error in that parameter**. The effect runs, the assertion passes, both cells look right — because the one value where a flip is invisible is also the most natural default to write.

This has hidden three defects so far: god-rays behind `centerY: 0.5`, directional-blur behind an axis-aligned angle, radial-blur behind `centerY: 0.5` again. In every case the parameter was the exact subject of the bug and the scene chose the one value that could not expose it.

So: choose positional parameters **off-centre**, directional ones **off-axis** — a centre at 0.25 rather than 0.5, an angle at 0.5 rad rather than 0 or π/2. If a scene must use a neutral value for its own reasons, say in a comment what it therefore cannot detect, so the next reader does not mistake its green for coverage.

**And the parameter must be inside the effect's discriminating range — neither neutral nor saturated.** A neutral value hides the effect's _direction_; a saturated one hides its _magnitude and shape_. A chromatic-aberration scene at `intensity: 4` separated every tile interior completely, so a correct radial falloff and a badly wrong one produced the same picture. Turning the parameter up until the effect is unmistakable makes the scene _less_ able to detect a defect in it, not more.

**A discriminating picture is not a discriminating check.** Blindness is the _conjunction_ of three things, and fixing one leaves the others: the **parameter** (is the value one where the defect shows), the **probe geometry** (do the assertion's sample points differ between the right and wrong results), and the **subject shape** (can the drawn thing express the difference at all). A worked case: a shadow scene with `angle: 0` also samples six probes all on the vertical midline — change the angle to 45° and the picture becomes diagonal while a shadow displaced up-right and one displaced down-right still produce identical samples. Off-axis parameters plus midline probes is still blind. Check all three before calling a scene able to see.

**Blind coverage is worse than no coverage.** A missing scene is visible as a gap and someone eventually fills it. A scene that exists and cannot see reports green, appears in the support matrix, and answers the question wrong — it impersonates the test that would have caught the defect. Measured on this corpus: 4 of 10 positional/directional parameter values were blind, and one of them was the sole coverage for a known-divergent effect whose own remedy note already prescribed the case it fails to run.

**Before probing a parameter of X, verify that X does anything.** A probe that varies one dimension produces a conclusion bounded to that dimension, and the bound is a property of the probe, not of the system: varying a velocity's Y component can only ever tell you about Y, while silently implying X worked. The strongest control is **removing the subject entirely** — if deleting the whole effect leaves the picture byte-identical, no finer-grained probe of its parameters means anything, and every measurement taken before that check was measuring nothing. Worked case: a motion-blur sign defect was confirmed from source by three separate readings, probed along Y, then along X, before anyone emptied the effect list and found the effect contributes nothing to that scene at all.

**Trying to build the case is itself a check on the fix.** A fix whose discriminating case cannot be constructed is telling you something — that the defect may not be observable, that the scene cannot exercise it, or that the fix changes nothing. Worked case: three separate reviews confirmed a motion-blur sign defect from source, and nobody discovered the scene's velocity was axis-aligned — so negating its Y component could not change a pixel — until someone tried to write the oracle and could not make the reverted shader differ. **The attempt is the check.** Do not defer it.

**The discriminating case is PERISHABLE.** It exists only while the defect exists. Once the fix lands, the evidence that the check can fail cannot be recreated in history — only re-enacted, by someone who still knows exactly what the defect was. That is the real reason a fix lands with the case that would have failed without it: not tidiness, but that this is the only moment the evidence is available for free. If a fix has already landed without one, restore the exact prior line from history, run the new check against it, and **record the failure output in the commit** — the measured message and numbers, never "verified locally", which nobody can check.

The same rule applies to a fix's discriminating case: the case that proves a convention fix is the one that would have failed before it, and an axis-aligned or centred case is not that.

### 6. When a description and an implementation disagree, fix whichever is wrong on its own terms

Not whichever is cheaper to change, and not "the description always wins". Measure each against the canonical form of the thing it is. Two worked cases, opposite verdicts:

- **`effect-chromatic-aberration`** — the scene's `intensity` was **800× the recipe's own default**, and the picture it produced was saturated everywhere. The implementation was the outlier; the description described the sensible operating point. → **the scene was fixed.**
- **`effect-chain`** — bloom-then-grade is the **canonical post-process order**, and the description claimed an outcome that order does not produce (0.258 saturation against a raw 0.639). Grade-then-bloom _would_ have made the sentence true, at the cost of demonstrating a less canonical pipeline. → **the description was fixed.**

That the rule cuts both ways is what makes it a rule rather than a preference for whichever artifact you trust. **The description is the specification for the ASSERTION. It is not the specification for the RECIPE.**

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
