---
package: '@flighthq/particles-formats'
crate: flighthq-particles-formats
draft: false
lastDirection: 2026-07-03
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---


# particles-formats — Charter

## What it is

The **codec layer** of the particles subject triad (`particles` → `particles-formats` → sim-backend): import/export of particle-emitter configurations between Flight's `ParticleEmitterConfig` (the data primitive, owned by `@flighthq/particles`) and third-party authoring formats. It owns the file↔value boundary — parsing an external asset's bytes into a config, and serializing a config back out — plus structural format auto-detection and an honest `warnings[]` fidelity channel reporting what each codec could not faithfully carry across.

Where it ends: it does **not** own the emitter data shape (that is `@flighthq/particles` and the `ParticleEmitterConfig` type in `@flighthq/types`), and it does **not** simulate, render, or schedule particles (the sim-backend / `sprite` participation layer). It is the translation seam only — bytes in, config out, and back.

As shipped in `builder-67dc46d64`, it carries six formats (Particle Designer plist, Spine 4.x JSON, Unity Shuriken JSON, libGDX `.p`, Starling PEX XML, Pixi v3/v4/v5 JSON), with full round-trip on five and parse-only on Pixi, unified detection/dispatch, a (currently unused) open codec registry, and 279 colocated tests.

## North star

_Proposed, not blessed — edit or move any of these to Open directions before confirming._

- **Round-trip is the value proposition.** A format that Flight can read it should, by default, be able to write back — `config ↔ file` symmetry is the reason this layer exists rather than a pile of one-way importers. Asymmetry (parse-only) is a deliberate, stated exception, not a silent gap.
- **Fidelity is reported, never silently lost.** Every codec carries an honest `warnings[]` channel: when a source feature cannot be expressed in the target (or vice versa), the user is told exactly what was dropped, with specific, testable warning strings. The codec layer never pretends a lossy conversion was lossless.
- **The boundary never throws on bad bytes.** Unknown or malformed input at the unified entry points returns a sentinel default config plus a warning, not an exception — parsing untrusted third-party assets is the normal case, not a programmer error. (Per-format parsers may throw on genuinely malformed structure; the unified dispatcher catches and reports.)
- **The config is the single target; this layer tracks it.** `ParticleEmitterConfig` is the contract. When the parent config gains a field that a format already carries, forwarding it is this layer's job — the codec is only as faithful as the field it maps to, and stale "not supported" warnings against a now-richer config are bugs, not boundaries.
- **Registry-by-default dispatch.** A growing format family (fork B) is dispatched through the open codec registry with built-ins registered via an opt-in `register*`, not a hardcoded closed `if` chain — keeping the package `sideEffects: false` and the format set extensible by users.

## Boundaries

_Proposed, not blessed._

**In scope:**

- Parse / serialize / detect for industry-standard particle authoring formats.
- The open codec registry and its built-in registrations.
- The `warnings[]` fidelity-reporting channel.
- Mapping every `ParticleEmitterConfig` field a format can express, in both directions.

**Non-goals:**

- Defining the emitter data shape — that is `@flighthq/particles` / `@flighthq/types`.
- Simulating, rendering, scheduling, or participating in the scene graph — the sim-backend / `sprite` layers.
- Inventing a Flight-native particle file format (this layer translates _other people's_ formats).

**Open at the boundary (see Open directions):** parse-only formats, multi-emitter / effect-bundle assets, and whether radial-emitter shape mapping is owned here or upstream.

## Decisions

- **2026-07-03 — Unify dispatch to registry-only.** Built-in codecs self-register via import. Why: hardcoded switch + unused registry is confusing, defeats tree-shaking.
- **2026-07-03 — PhaserParticleFormatKind: implement or remove.** Ghost kind with no implementation.
- **2026-07-03 — Package description needs update (ships 6 formats, names 3).**
- **2026-07-03 — TS-leads, Rust conforms later.**

## Open directions

Every candidate question carried from `review.md`, plus the structural forks that touch this package. These are where uncertainty lives — an agent **asks** here rather than assuming.

1. **Is round-trip symmetry a hard boundary?** Pixi ships parse-only (no `pixiSerialize.ts`, no schema/document), breaking the symmetry every other format holds, and the `ParticleFormatCodec` interface requires `serialize` — which Pixi cannot satisfy. Either Pixi gets a serializer, or the codec interface makes `serialize` optional and the North star states parse-only as an accepted exception. (review.md gaps 1, contract-fit asymmetry.)

2. **Is Phaser in scope?** `PhaserParticleFormatKind` is declared in `@flighthq/types` and advertised in detection prose, but no `phaser*` source exists and `detectParticleFormat` does not sniff it — a declared-but-absent format, the worst of both. Build it or remove the type. (review.md gap 2.)

3. **How much fidelity is this layer responsible for as the parent config grows?** The radial/tangential-acceleration and multi-burst "not supported" warnings were written against an older, thinner `ParticleEmitterConfig`; the parent now has `radialAcceleration`, `tangentialAcceleration`, and `burstSchedule`. Several of these are now mechanical 1:1 maps being thrown away (Starling PEX even parses radial/tangential into its document, then drops them). The standing question: when `particles` gains a field, is closing the matching format warning in-scope sweep work here, or does it wait for a direction pass? (review.md gap 3, candidate direction 3.)

4. **Radial-emitter approximation.** Particle Designer / PEX `emitterType=1` falls back to a gravity emitter with a warning rather than mapping to the config's `'cone'`/`'ring'` spawn shapes (which now exist). Does the new shape vocabulary close part of this, and is that mapping owned here? (review.md gap 4.)

5. **Multi-emitter / effect-bundle scope (fork A — source-data vs. graph participation).** Real `.p`/PEX/Unity assets routinely carry several emitters; the package returns one config per file and defers `parseParticleEffectBundle` pending a `ParticleEffectBundle` type upstream. Is the bundle concept (and its upstream type) in scope for this package? (review.md gap 5, candidate direction 5.)

6. **Registry vs. closed switch — settle fork B (registry-by-default).** The package contains two parallel dispatch systems that do not meet: `detect.ts` + `parseParticleConfig.ts` are a hardcoded closed `if (format === …Kind)` chain over six formats, while `formatRegistry.ts` is a proper open registry into which **no built-in codec is ever registered** — dead machinery on the default path. Per fork B, a growing format family is exactly the trigger to be registry-backed (dispatch can be hoisted out of any hot loop; parse/detect are not hot loops). Should `detect`/`parse` route through `formatRegistry`, with built-ins registered via an opt-in `registerBuiltInParticleFormats()` keeping `sideEffects: false`? This is the package's instance of the fork its own name promises to resolve. (review.md contract-fit drift, candidate direction 4.)

7. **Rust port timing (fork D — Wasm `-rs` mixing seam).** `crate: flighthq-particles-formats` is declared but no crate exists. This is a value-typed plain-data leaf (string-in / config-out) — a strong early conformance / Wasm-mixing candidate, and the TS surface is now stable enough to port. Near-term target or parked? (review.md gap 6, candidate direction 6.)

8. **Stale "What it is" / Package Map (admin-doc drift, the user's gate).** Both the prior charter "What it is" and the `agents/index.md` Package Map line still name only three formats (Particle Designer, Spine, Unity); the package ships six (adding libGDX, Starling PEX, Pixi). The draft above updates the charter's framing to six; the Package Map line is a separate doc edit for the user to confirm. (review.md charter contradictions, admin-docs candidate revisions.)
