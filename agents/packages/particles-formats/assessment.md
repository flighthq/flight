---
package: '@flighthq/particles-formats'
updated: 2026-07-13
basedOn: ./review.md
---

# particles-formats — Assessment

See [charter](./charter.md) for blessed direction. Based on the 2026-07-13 re-review (solid, 82).

## Recommended

Sweep-safe, within-package, no open design decision. Items 1–3 execute the charter's already-blessed 2026-07-03 Decisions.

1. **Execute Decision 1 — registry-only dispatch.** Add an opt-in `registerBuiltInParticleFormats()` (keeps `sideEffects: false`), route `detectParticleFormat`/`parseParticleConfig*` through `formatRegistry`, and delete the closed `if (format === …Kind)` chains in `detect.ts`/`parseParticleConfig.ts`. Fix the false `formatRegistry.ts:90-95` doc comment ("registered at module load time") in the same pass. Coupled caveat: the codec interface's required `serialize` collides with parse-only Pixi — if Open direction 1 is still unsettled at execution time, make `serialize` optional as the minimal unblocking shape and note it. (review gaps 1, 6.)
2. **Execute Decision 3 — update `package.json` description** to the six-format set, noting Pixi is parse-only. (review gap 3.)
3. **Restore `*ParseResult` naming symmetry.** Rename `ParticleDesignerParsed` → `ParticleDesignerParseResult`, `SpineParsed` → `SpineParseResult`, `UnityParsed` → `UnityParseResult` (greenfield: rename outright; deprecated aliases optional for symmetry with the three formats that kept them). Recovery regression, previously done and verified. (review gap 4.)
4. **Remove structural divider comments** (`// ─── … ───`) from `particleDesignerParse.ts`, `spineParse.ts`, `unityParse.ts`. Source Style violation; the other three formats' files are clean. (review contract-fit.)
5. **Document and test the Pixi angle convention.** `pixiParse.ts:139` `directionY: Math.sin(angleMid)` (vs `-Math.sin` everywhere else) needs a durable coordinate-space comment and a direction-sign test — or a fix if it is in fact a sign bug. (review contract-fit.)
6. **Repair test regressions:** restore `serializeResult.test.ts` (or confirm interface-only exemption), move the `serializeUnityParticle`/`serializeSpineParticle` describes from the parse test files into `unitySerialize.test.ts`/`spineSerialize.test.ts`, and fold the two banned `— description` suffix describes into their parent blocks. (review gaps 5, contract-fit.)

## Backlog

- **Decision 2 — Phaser: implement or remove `PhaserParticleFormatKind`.** Blessed as "implement or remove," but the branch is unchosen (charter Open direction 2) and the removal edit lands in `@flighthq/types` — cross-package. Needs the user's pick.
- **Pixi serializer** (or blessing parse-only as a stated exception + optional `serialize` in the codec contract). Waits on charter Open direction 1 (round-trip as a hard boundary).
- **Multi-emitter / effect-bundle parsing** (`parseParticleEffectBundle`). Needs a `ParticleEffectBundle` type upstream in `@flighthq/types` — cross-package, charter Open direction 5.
- **Radial-emitter mapping.** Blocked upstream again: today's `ParticleEmitterConfig` has no `radialAcceleration`/`tangentialAcceleration` fields and no `'cone'`/`'ring'` shapes (the recovery dropped them), so the current warnings are honest. Re-open when `particles`/`types` regain the fields; charter Open directions 3–4.
- **Rust crate `flighthq-particles-formats`** (fork D Wasm-mixing leaf). Waits on charter Open direction 7 timing call.
- **Format breadth** (Godot, Unreal Cascade/Niagara, Phaser). New-format scope is a charter call, not sweep work.
- **Cross-package flag for the `types`/`particles` cells:** orphaned `ParticleBurstSchedule` exported from `@flighthq/types` with zero references — reconcile with the recovery. Not this package's edit.

## Approved

None.
