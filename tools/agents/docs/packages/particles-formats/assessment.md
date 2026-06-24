---
package: '@flighthq/particles-formats'
updated: 2026-06-24
basedOn: ./review.md
---

# particles-formats — Assessment

> Sorts `review.md`'s gaps into **Recommended** (strictly sweep-safe: within `@flighthq/particles-formats`, no cross-package coupling, no breaking change, no open design decision) and **Backlog** (the rest, each with a reason). `Approved` is empty — approval is the user's verbal gate.
>
> No prior `reviews/maturation/depth/particles-formats.md` roadmap exists (the review is the first survey), so this assessment reasons over `review.md` alone. The charter is a stub (North star / Boundaries all `TODO`); the package's three design forks — registry-by-default (fork B), round-trip symmetry, and Rust port timing — are routed to the charter's **Open directions**, not into Recommended.

## Recommended

All within-package, no breaking change, no open design decision. Each is a now-mechanical 1:1 map that closes a stale "not supported" warning because the parent `ParticleEmitterConfig` advanced past where the deferral notes assumed it was (review gap 3). The fork-B registry question is deliberately _not_ here — it is an Open direction below.

1. **Forward Starling PEX radial/tangential acceleration into the config.** `starlingPexParse.ts:168-171` already parses `radialAcceleration`/`tangentialAcceleration` into its document but the build block (lines 201-238) omits them from `createParticleEmitterConfig`. `ParticleEmitterConfig` now carries both fields — forward the already-parsed values instead of dropping them, and remove the now-false `… is not supported and was ignored` warnings at `starlingPexParse.ts:255-260`. (review.md#gaps gap 3)
2. **Forward Particle Designer radial/tangential acceleration into the config.** Same 1:1 map for `particleDesignerParse.ts` — populate `radialAcceleration`/`tangentialAcceleration` on the built config and drop the stale warnings at `particleDesignerParse.ts:178-183`. (review.md#gaps gap 3)
3. **Forward Unity multi-burst into `burstSchedule` instead of `bursts[0]`-only.** `unityParse.ts:242` warns `Only the first of N emission bursts was imported`; `ParticleEmitterConfig.burstSchedule` (`ParticleBurstSchedule | null`) can now hold the full schedule. Map all bursts and remove the first-only warning. (review.md#gaps gap 3)
4. **Sweep the now-stale fidelity warnings.** After items 1-3, audit the `collect<Format>Warnings` passes for any remaining `radialAcceleration`/`tangentialAcceleration`/multi-burst "not supported" strings (and their asserting tests) and update them so the warning channel stays honest — warnings should describe only what the current `ParticleEmitterConfig` genuinely cannot express. (review.md#gaps gap 3, review.md#candidate-open-directions item 3)

## Backlog

Parked for a reason — cross-package coupling, an upstream-type dependency, an investigation, or a design fork that wants a blessed ruling. None are sweep-safe.

- **Registry-by-default (fork B) — route `detect`/`parse` through `formatRegistry`.** The package ships two parallel dispatch systems that never meet: a hardcoded closed `if (format === …Kind)` chain (`detect.ts` + `parseParticleConfig.ts`) and a dead open registry (`formatRegistry.ts`, into which no built-in is ever registered). The fix — a `registerBuiltInParticleFormats()` opt-in plus routing the unified dispatch through the registry — is the package's instance of **structural fork B** and the review says it "wants a blessed ruling." _Parked: design fork → routed to charter Open directions, not Recommended._ (review.md#contract--docs-fit, review.md#candidate-open-directions item 4)
- **Pixi serializer + schema/document (round-trip symmetry).** Pixi is parse-only while every other format round-trips, and `ParticleFormatCodec.serialize` is a required interface member Pixi cannot satisfy. _Parked: depends on the boundary decision "is round-trip a hard boundary, or is `serialize` optional?" — an Open direction, not a mechanical fix._ (review.md#gaps gap 1, review.md#candidate-open-directions item 1)
- **Phaser — build it or remove the type.** `PhaserParticleFormatKind` exists in `@flighthq/types` and is advertised in detection prose, but no `phaser*` source exists. _Parked: needs a scope decision, and the removal arm touches `@flighthq/types` (cross-package). Routed to Open directions._ (review.md#gaps gap 2, review.md#candidate-open-directions item 2)
- **Radial-emitter mapping (`emitterType=1` → `'cone'`/`'ring'` spawn shapes).** Particle Designer / PEX radial emitters still fall back to a gravity emitter with a warning. The new spawn-shape vocabulary may close part of this. _Parked: not a 1:1 map — it needs an investigation of how `emitterType=1` semantics map onto `cone`/`ring`, with a judgment call, so it is not sweep-safe._ (review.md#gaps gap 4)
- **Multi-emitter / effect-bundle (`parseParticleEffectBundle`).** Real `.p`/PEX/Unity assets carry several emitters; the package returns one config per file. _Parked: requires a `ParticleEffectBundle` type upstream in `@flighthq/types` (cross-package) and a scope decision. Routed to Open directions._ (review.md#gaps gap 5, review.md#candidate-open-directions item 5)
- **Rust crate `flighthq-particles-formats`.** Declared in the charter front matter but absent. A value-typed (string-in / config-out) leaf — a strong early Wasm-mixing / conformance candidate (fork D). _Parked: a port-timing decision spanning the Rust workspace (cross-package). Routed to Open directions._ (review.md#gaps gap 6, review.md#candidate-open-directions item 6)
- **Admin-doc refresh (user's gate).** The Package Map line in `tools/agents/docs/index.md` and the charter's `_(Seeded…)_` "What it is" both still say three formats; the package ships six. _Parked: edits to the charter and the codebase map are the user's gate, not assessment work — noted for a charter authoring pass._ (review.md#contract--docs-fit, review.md#charter-contradictions)

## Approved

_None. Approval is the user's verbal gate; this section is frozen only on explicit approval._
