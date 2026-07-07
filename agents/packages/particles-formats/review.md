---
package: '@flighthq/particles-formats'
status: solid
score: 86
updated: 2026-06-24
ingested:
  - status.md
  - source
  - dist (realized API surface)
  - changes.patch (builder-67dc46d64)
---

# particles-formats — Review

> Evidence: `incoming/builder-67dc46d64/head/packages/particles-formats/` (source + tests + dist), `incoming/builder-67dc46d64/changes.patch`. No `reviews/depth/particles-formats.md` exists — there is no prior depth review to supersede; this is the first survey. The charter is a stub (North star / Boundaries / Decisions / Open directions all `TODO`), so the package is judged against the codebase-map AAA standard and the structural forks, with each silence flagged below.

## Verdict

`solid` — **86/100**. A genuinely broad, well-tested codec layer: six authoring formats with full parse→config + document→serialize round-trips (one is parse-only), honest `warnings[]` fidelity reporting, unified structural auto-detection, and 279 colocated tests. The score is held below the 90s by two real issues — an **unused registry sitting beside a hardcoded closed-`if` dispatcher** (the structural fork the package's own name promises it resolves), and **stale "not supported" warnings that drop data the parent `ParticleEmitterConfig` can now hold** (radial/tangential acceleration, multi-burst). Both are traceable to the parent `particles` package advancing past where the deferral notes assumed it was.

## Present capabilities

All paths verified in source under `67dc46d64:packages/particles-formats/src/`.

- **Six formats, each its own `<format>Parse.ts` (+ most a `<format>Serialize.ts` + `<format>Schema.ts`):**
  - **Particle Designer** plist (`particleDesignerParse.ts` / `…Serialize.ts` / `…Schema.ts`) — parse + serialize.
  - **Spine** 4.x JSON (`spineParse.ts` / `…Serialize.ts` / `spineSchema.ts`) — parse + serialize; bakes multi-stop color into `colorCurve`.
  - **Unity** Shuriken JSON (`unityParse.ts` / `…Serialize.ts` / `unitySchema.ts`) — parse + serialize; bakes color gradients to a curve; reads `bursts[0]`.
  - **libGDX** `.p` (`libgdxParse.ts` / `…Serialize.ts` / `libgdxSchema.ts`) — parse + serialize; bespoke section/key text parser.
  - **Starling PEX** XML (`starlingPexParse.ts` / `…Serialize.ts` / `starlingPexSchema.ts`) — parse + serialize.
  - **Pixi** v3/v4/v5 JSON (`pixiParse.ts`) — **parse-only; no serializer, no schema file.**
- **Unified dispatch** (`parseParticleConfig.ts`): `detectParticleFormat(text)` (structural sniffing, never throws), `parseParticleConfig(text, options?)` → config, `parseParticleConfigDocument(text, options?)` → `{ config, format, warnings }`. Unknown/unparseable input returns a default config with an `'unknown-format'`/`'parse-error'` warning rather than throwing — a clean sentinel-style boundary. `ParseParticleConfigOptions` aggregates the per-format option bags (`textureSize`).
- **Detection** (`detect.ts`): libGDX (first line `Particle Effect`), Starling PEX (`<particleEmitterConfig`, checked before plist), Particle Designer (`<plist`), Unity (MinMaxCurve `mode` / `gravityModifier` / `looping`+`startLifetime`), Pixi (`pos` + `alpha.start/end`), Spine (`continuous` / `{low,high}` range).
- **Format codec registry** (`formatRegistry.ts`): `ParticleFormatCodec` interface (`detect`/`parseToConfig`/`parseToDocument`/`serialize`), `registerParticleFormat` (last-write-wins, module-private `Map`), `unregisterParticleFormat`, `getParticleFormatCodec`, `getRegisteredParticleFormats`, `detectRegisteredParticleFormat`, `parseRegisteredParticleFormat`.
- **Shared result shapes:** `ParticleConfigParseResult` (`parseParticleConfig.ts`), `ParticleSerializeResult` (`serializeResult.ts`, `readonly text` + `warnings[]`).
- **Honest fidelity channel:** every parser has a `collect<Format>Warnings` pass; serializers warn on features the target format cannot express. Tests assert specific warning strings.
- **Types live upstream** in `@flighthq/types`: `ParticleFormatKind` (open union, vendor-prefix doc'd) and `ParticleFormatWarning`. Package is `sideEffects: false`, single root `.` export, deps only `@flighthq/particles` + `@flighthq/types`.
- **Tests:** 15 colocated `*.test.ts`, **279 `it`/`test` cases** (verified by count, matches the status claim). `exports:check` describe-block naming was fixed this pass.

The status report's session claims (the `*Parsed` → `*ParseResult` renames with `@deprecated` aliases, the three new formats, the registry, the detect/dispatch wiring) all verify against source and the realized `dist/*.d.ts`. The deprecated aliases (`LibgdxParsed`, `PixiParsed`, etc.) are present in `dist`.

## Gaps

1. **Pixi is parse-only (asymmetric).** Every other format round-trips; Pixi has no `pixiSerialize.ts` and no `PixiDocument`/schema. The package's value proposition is round-trip; Pixi breaks the symmetry without a stated reason.
2. **Phaser is declared but unbuilt.** `PhaserParticleFormatKind` exists in `@flighthq/types` and is advertised in detection prose, but no `phaser*` source exists and `detectParticleFormat` does not sniff it. A declared-but-absent format is a dangling promise in the public type surface.
3. **Data dropped that the parent config can now hold (the highest-value gap).** Parsers warn `radialAcceleration is not supported and was ignored` / `tangentialAcceleration … ignored` (`starlingPexParse.ts:255-260`, `particleDesignerParse.ts:178-183`) and `Only the first of N emission bursts was imported` (`unityParse.ts:242`). But `ParticleEmitterConfig` (`types/src/ParticleEmitterConfig.ts`) now has `radialAcceleration`, `tangentialAcceleration`, and `burstSchedule: ParticleBurstSchedule | null`. Starling PEX even parses `radialAcceleration`/`tangentialAcceleration` into its **document** (`starlingPexParse.ts:168-171`) and then drops them on the floor instead of forwarding into `createParticleEmitterConfig` (the build block, lines 201-238, omits them). These are now 1:1 mappings being thrown away — the status report's "blocked by cross-package design decision" rationale is **stale**.
4. **Radial-emitter approximation.** Particle Designer / PEX `emitterType=1` still falls back to a gravity emitter with a warning, rather than mapping to the config's `'cone'`/`'ring'` spawn shapes (which now exist). Worth re-checking whether the new shape vocabulary closes part of this.
5. **No multi-emitter / effect-bundle handling.** A single config per file; real `.p`/PEX/Unity assets routinely carry several emitters. `parseParticleEffectBundle` is deferred (needs a bundle type upstream).
6. **No Rust crate.** `crate: flighthq-particles-formats` is declared in the charter front matter but no crate exists. This is a value-typed (plain string-in / config-out) leaf — a strong early Wasm-mixing / conformance candidate per fork D, and the TS surface is now stable enough to port.

## Charter contradictions

The charter is a stub — its only substantive line is the seeded "What it is," which lists **three** formats (Particle Designer, Spine, Unity). The package now ships **six**. This is not a violation so much as the charter being out of date relative to the work; recorded here and under candidate directions because there is no North-star/Boundary text to contradict yet. No code violates a stated principle, because none is stated.

## Contract & docs fit

**Lives up to the contract:**

- Types are `@flighthq/types`-first (`ParticleFormatKind`, `ParticleFormatWarning`); no cross-package types defined inline.
- Full unabbreviated names throughout (`parseLibgdxParticleDocument`, `detectRegisteredParticleFormat`).
- Sentinels-not-throws at the unified boundary (`parseParticleConfig*` catch and return warnings); per-format parsers throw only on genuinely malformed input — the documented split.
- Single root `.` export, `sideEffects: false`, one test file per source file, kinds are plain strings.
- The `-formats` neighbor-of-`particles` shape matches the structural-forks **subject triad** (`particles` → `particles-formats` → sim-backend) exactly.

**Contract-fit drift (the structural fork to flag — fork B, registry-by-default):**

- The package contains **two parallel dispatch systems that do not meet.** `detect.ts` + `parseParticleConfig.ts` are a **hardcoded closed `if (format === …Kind)` chain** over six formats; `formatRegistry.ts` is a proper open registry — but **no built-in codec is ever registered into it** (`grep registerParticleFormat(` finds only the definition, no call). So the registry is dead machinery on the default path, and the actual dispatcher is the closed switch the package's own `-formats`/registry framing exists to avoid. Per fork B, a _growing_ format family (six and counting, with Phaser pending) is exactly the trigger to be registry-backed; the dispatch can be hoisted out of any hot loop, and parse/detect are not hot loops anyway. The fix is to register the built-ins (a `registerBuiltInParticleFormats()` opt-in, keeping `sideEffects: false`) and route `detectParticleFormat`/`parseParticleConfig` through the registry, collapsing the duplication.
- **Asymmetry between the registry codec contract and reality:** `ParticleFormatCodec.serialize` is required, but Pixi has no serializer — Pixi cannot satisfy the codec interface, another signal the registry and the implemented formats have not been reconciled.

**Admin-docs candidate revisions (the user's gate, not mine):**

- The **Package Map** line in `agents/index.md` for `@flighthq/particles-formats` lists only "Particle Designer plist, Spine 4.x particle JSON, Unity Shuriken JSON." It is stale — the package now also ships libGDX, Starling PEX, and Pixi. Update to the six-format set.
- The charter's "What it is" carries the same three-format wording and the same `_(Seeded…)_` placeholder — first candidate for a real authoring pass.

## Candidate open directions

These are the charter silences I had to assume around; each is a question for the charter, not a prescription:

1. **Is round-trip symmetry a hard boundary?** If yes, Pixi needs a serializer (and a schema/document); if parse-only formats are acceptable, the codec interface should make `serialize` optional and say so.
2. **Is Phaser in scope?** It is half-declared (a `Kind` with no implementation). Either build it or remove the type — a declared-but-absent format is the worst of both.
3. **How much fidelity is the package responsible for, now that the parent config is richer?** The radial/tangential/multi-burst warnings were written against an older, thinner `ParticleEmitterConfig`. The standing question: when `particles` gains a field, is closing the matching format warning in-scope sweep work here, or does it wait for a direction pass? (Several of these are now mechanical 1:1 maps — see gap 3.)
4. **Registry vs. closed switch — settle it.** Should `detect`/`parse` dispatch through `formatRegistry`, with built-ins registered via an opt-in `register*`? This is the package's instance of structural fork B and wants a blessed ruling.
5. **Multi-emitter / effect-bundle scope.** Real assets carry several emitters; the package returns one config. Is a `ParticleEffectBundle` (and its upstream type) in scope for this package?
6. **Rust port timing.** Plain-data leaf, stable surface — is `flighthq-particles-formats` a near-term conformance/mixing target or parked?
