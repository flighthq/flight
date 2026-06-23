# Maturation Roadmap: @flighthq/velocity

**Current verdict:** solid — 72/100. An intentionally-narrow, well-designed velocity-field seam (per-frame explicit-vs-baseline accumulation with correct staleness/override fencing) whose biggest real gap is that it stores `previousWorldTransform` but never consumes it: the affine/per-pixel velocity path is designed-but-unbuilt.

This package is a seam, not a sub-library, so the tiers below are smaller than for a sprawling domain package. Bronze closes the package's own unfinished promise and the canonical value helpers; Silver makes it competitive with a real engine motion-vector module (affine reprojection, angular velocity, history, iteration); Gold is the authoritative motion-vector reference (acceleration, dilation/correctness controls, full Rust parity, conformance scenes, docs).

The single most important architectural reminder: all shared shapes (`Velocity2D`, `VelocitySample`, `VelocityField`, `VelocityContributor`, and every new descriptor named below) are defined in `@flighthq/types` **first**, then implemented here. Velocity values are plain `{x,y}` data; every helper is a free function with explicit `out`/`create*` allocation; reads stay alias-safe and hot-loop allocation-free; the package keeps its single root `.` export and `"sideEffects": false`.

## Bronze

The minimum genuinely-useful version: fill the glaring gaps the depth review named, fix the contract drift, and make the package visible. All small, all canonical, all directly consumed by the existing `GlVelocityWriter` / `WgpuVelocityWriter` motion-blur path.

- **Affine baseline contributor — the package's own unfinished promise.** Add `contributeAffineVelocity(field, root)` (or upgrade the baseline behind an explicit name) that uses the stored `previousWorldTransform` to produce per-pixel-correct velocity for rotation and scale, not just `tx/ty` delta. Expose the per-pixel primitive it relies on as a value helper: `getVelocitySampleAt(sample, pointX, pointY, out)` computing `current·p − previous·p` from `previousWorldTransform` and the node's current world transform. This is the most impactful single addition; the data model already pays for `previousWorldTransform`.
- **Value helpers (out-parameter, tree-shakable):**
  - `clampVelocity(out, velocity, maxLength)` — clamp to a max blur length (the canonical motion-blur safety helper the writers reimplement today).
  - `scaleVelocity(out, velocity, scale)` — pixel-ratio / unit conversion (the comments say "a producer scales by pixel ratio" but ship no helper).
  - `copyVelocity(out, velocity)` and `zeroVelocity(out)` — completeness for the `Velocity2D` value type so consumers stop hand-writing field assignments.
- **Contract / naming reconciliation:** fix the stale `contributeNodeVelocity` / `suppressNodeVelocity` references in `@flighthq/types/Velocity.ts`'s `VelocityContributor` doc to match the shipped `contributeVelocity` / `suppressVelocity` names.
- **Package Map entry** in `tools/agents/docs/index.md`: add `@flighthq/velocity` describing it as the generic per-node velocity-field seam between motion sources (transform delta, tween, physics, camera, manual edit) and GPU motion-blur velocity-buffer writers (`displayobject-gl`/`-wgpu` `*Velocity` writers, `effects-gl`/`effects-wgpu` motion blur). Its absence hides its scope today.
- **Document the deliberate boundaries** in the types contract as explicit missing-by-design notes (not silent omissions): per-frame delta (not per-second / no `dt`), single previous frame, and per-instance velocity punted to each kind's velocity writer.

## Silver

Competitive and solid — matches a good engine motion-vector module: angular velocity as a first-class quantity, multi-source iteration, smoothing for jitter-free buffers, and harden the soft typing spots.

- **Angular / rotational velocity as a first-class quantity.** Add to `VelocitySample` (in `@flighthq/types`) an optional `angularVelocity: number` (radians/frame) and a `transformDelta: Matrix | null` (the 2×2 + translation delta), with `contributeAngularVelocity(field, source, radians)` and `getAngularVelocity(field, source)` (sentinel `0` when stale/missing). Many motion-blur and radial-blur pipelines want a scalar spin or full transform-delta, not just a 2-vector.
- **Per-frame smoothing / damping** for jitter-free buffers:
  - `dampVelocity(out, current, previous, factor)` — exponential moving average across frames.
  - A field-level `smoothVelocityField(field, factor)` pass (or per-sample `lastVelocity` retention) so a producer can low-pass without holding its own history table.
- **Bulk read / iteration.** `forEachVelocity(field, visit)` (or a `getMovingSources(field, outArray)`) so a standalone consumer can enumerate every source moving this frame without already holding each object. Requires switching `samples` from `WeakMap` to a hybrid (a `Map` for iteration plus retain semantics, or an auxiliary live-this-frame list) — a deliberate memory tradeoff to surface to the user, since it changes the GC story.
- **Harden the transform-trait cast.** `contributeTransformVelocity` casts children `as unknown as Transform2DNode`. Either gate on a kind/trait check (`isTransform2DNode(child)`) so a non-transform child kind is skipped rather than mis-typed, or push a `Transform2DNode` child accessor into `@flighthq/node` so the cast disappears. Cross-package — surface to the user (see Sequencing).
- **Velocity buffer scaling/orientation policy helper.** `createVelocityWriteParams(width, height, pixelRatio, out)` (or a small descriptor in `@flighthq/types`) that centralizes the screen-space → buffer-space scale + Y-axis convention the GL/Wgpu writers each currently bake in, so both backends and the Rust port agree on one convention.
- **Signals (opt-in group).** If consumers need to observe velocity-field lifecycle (frame begun, source suppressed), add `enableVelocityFieldSignals(field)` in this package with a `VelocityFieldSignals` group in `@flighthq/types`, per the `enable*` opt-in rule. Only if a real consumer appears — otherwise record as deferred.

## Gold

Authoritative / AAA — the canonical 2D motion-vector reference, with nothing a domain expert would find missing, full performance and edge-case handling, and 1:1 Rust parity proven by conformance scenes.

- **Higher-order motion:** `VelocitySample.acceleration: Velocity2D` and `contributeAcceleration` / `getAcceleration`, derived from the velocity delta across frames — enables curved/second-order motion blur and predictive reprojection.
- **Multi-frame history / motion trails.** An optional ring of N previous transforms per sample (`VelocityHistory` in `@flighthq/types`) behind an explicit `enableVelocityHistory(field, frames)` allocation, for trail effects and temporal reprojection (TAA-style) — kept off the default path so the common single-previous-frame case stays allocation-light.
- **Time normalization done right.** A `dt`-aware read seam: store the frame `dt` on the field at `beginVelocityFrame(field, dt)` (overload / optional arg, sentinel `1` for frame-locked) and add `getVelocityPerSecond(field, source, out)` so both frame-delta and per-second consumers are first-class, resolving the documented ambiguity instead of only documenting it.
- **Exhaustive value/edge-case helpers:** `lengthOfVelocity`, `normalizeVelocity(out, v)`, `lerpVelocity(out, a, b, t)`, `addVelocity` / `subtractVelocity`, and `isVelocityZero(v, epsilon)` — the complete `Velocity2D` value algebra, alphabetized, all alias-safe out-param.
- **Performance + correctness pass:** verify `contributeTransformVelocity` / `contributeAffineVelocity` are allocation-free in steady state (sample + `previousWorldTransform` allocated once, reused); add a fast-path skip for unchanged transforms (compare invalidation/dirty id rather than recomputing); document and test the aliasing contract on every out-param helper (`out === input`).
- **Full test + conformance coverage:** colocated unit tests for every new export (the package must stay at `exports:check` parity); a `tests/functional/velocity-*` scene exercising translation, rotation, and scale motion blur across the raster backends; and a Rust↔TS conformance scene (the field/contributor logic is value-typed and deterministic — an ideal headless fingerprint target).
- **1:1 Rust parity for the full surface.** `flighthq-velocity` already mirrors the 8-function baseline (`begin/contribute/create/ensure/get/has/suppress_velocity` + `contribute_transform_velocity`, keyed on `u64` source ids per the Rust arena model). Mirror every Bronze/Silver/Gold addition into the crate — affine reprojection, value helpers, angular velocity, history, dt — and record any intentional TS↔Rust divergence (e.g. `WeakMap<object>` vs `HashMap<u64>` keying, iteration semantics) in the conformance divergence map.
- **Docs:** a package README / doc-section covering the contributor model (explicit-wins-over-baseline fence), the affine reprojection math, the suppress/teleport pattern, the buffer-write convention, and the per-instance boundary (why batched per-instance velocity lives in the kind's velocity writer, not here).

## Sequencing & effort

Recommended order, with dependencies and cross-package / design-decision items called out.

1. **Bronze, types-first, self-contained (low effort, ~half a day).** Add the new shapes to `@flighthq/types` (`Velocity2D` helpers need no new types; affine reprojection needs none beyond `Matrix`), then implement `contributeAffineVelocity` + `getVelocitySampleAt` and the four value helpers here. Fix the stale `VelocityContributor` doc names and add the Package Map entry in the same pass. No other package needs to change. Run `npm run exports:check` and `npm run order` after — every new export needs a colocated test.

2. **Bronze affine adoption (cross-package, surface as suggestion).** The GL/Wgpu velocity writers (`displayobject-gl`/`-wgpu`, `effects-gl`/`-wgpu`) currently consume only translation delta. Switching them to consume `getVelocitySampleAt` reprojection is the payoff of the affine work but touches other packages — **surface to the user** rather than reaching across the boundary autonomously.

3. **Silver angular velocity + smoothing (medium).** Requires `@flighthq/types` additions (`angularVelocity`, `transformDelta`, optional `lastVelocity`). Self-contained in this package. Do before iteration so the iteration API can expose the richer sample.

4. **Silver iteration — design decision to surface.** Switching `samples` away from `WeakMap` changes the package's GC/ownership story (the depth review credits source-agnostic `WeakMap` keying as a strength). This is a genuine API/memory tradeoff: **surface to the user as a design decision** (keep `WeakMap` and require consumers to hold sources, vs. add a live-this-frame iteration list). Do not flip it silently.

5. **Silver transform-trait hardening (cross-package).** The cleanest fix lives in `@flighthq/node` (a trait check or `Transform2DNode` child accessor), not here. **Surface as a cross-package suggestion**; the local fallback (`isTransform2DNode` guard) is acceptable if `@flighthq/node` is out of scope.

6. **Silver/Gold buffer-write convention helper (cross-package alignment).** Centralizing the screen→buffer scale + Y convention only pays off if the GL/Wgpu writers and the Rust port adopt it. Define the descriptor in `@flighthq/types`, then coordinate adoption — a cross-package item.

7. **Gold (high effort, do last).** Acceleration, multi-frame history, `dt` normalization, the full value algebra, the performance/aliasing pass, functional + Rust conformance scenes, and docs. History and `dt` are the largest because they change the field/sample shape and the `beginVelocityFrame` signature; gate both behind explicit opt-in (`enableVelocityHistory`, `dt` arg defaulting to frame-locked) so the common path stays unchanged.

**Rust parity runs alongside every tier, not at the end.** The crate is already at baseline parity; each TS addition should land its Rust mirror in the same logical change and any TS↔Rust keying/iteration divergence goes in the conformance divergence map.

**Cross-cutting checkpoints:** `@flighthq/types` first for every new shape; `npm run exports:check` + `npm run order` after each export change; `npm run api velocity` to confirm naming symmetry; `npm run fix` before completing any session.
