---
package: '@flighthq/particles-formats'
status: solid
score: 82
updated: 2026-07-13
ingested:
  - status.md
  - prior review.md (2026-06-24, solid/86)
  - charter.md (blessed 2026-07-03, incl. Decisions)
  - source (all 21 src files, live worktree)
  - tests (all 14 colocated *.test.ts)
  - '@flighthq/types ParticleFormatKind / ParticleEmitterConfig / ParticleBurstSchedule / ParticleForce'
  - package.json
  - git log since 2026-06-20
---

# particles-formats — Review (re-review)

> Evidence: live worktree `packages/particles-formats/src/`. Prior review (2026-06-24, `solid` 86) surveyed the `builder-67dc46d64` bundle; since then the repo went through source-recovery commits (`06a0c480` "recover lost source", `a21e4fe0`/`d1845fff` "reconstruct types") and the charter was blessed (2026-07-03) with four Decisions. This pass verifies the prior flags and the recovery fallout.

## Verdict

`solid` — **82/100** (down from 86). The six-format codec core is intact and well-tested, but the score drops for two reasons: (1) **all three 2026-07-03 charter Decisions remain unexecuted** — the registry-only dispatch unification, the Phaser ghost, and the stale package description — so the code now *contradicts a blessed ruling* rather than merely predating one; and (2) the source-recovery commits **regressed session work the prior review verified**: the `*ParseResult` renames survive for only 3 of 6 formats, `serializeResult.test.ts` is gone (234 `it` cases vs the 279 previously verified), and the parent `ParticleEmitterConfig` lost the `radialAcceleration`/`tangentialAcceleration`/`burstSchedule` fields the prior review's highest-value gap was premised on.

## Present capabilities

All verified in source this pass.

- **Six formats.** Five full round-trips — each with `<format>Parse.ts` + `<format>Serialize.ts` + `<format>Schema.ts`: Particle Designer plist (`particleDesignerParse.ts`), Spine 4.x JSON (`spineParse.ts`), Unity Shuriken JSON (`unityParse.ts`), libGDX `.p` (`libgdxParse.ts`, bespoke section/key text parser), Starling PEX XML (`starlingPexParse.ts`, attribute- and element-style). **Pixi v3/v4/v5 JSON is parse-only** (`pixiParse.ts`; no serializer, no schema).
- **Unified dispatch** (`parseParticleConfig.ts`): `parseParticleConfig` / `parseParticleConfigDocument` over `detectParticleFormat` (`detect.ts`, structural sniffing, never throws). Unknown input → default config + `'unknown-format'` warning; per-format parser throws are caught → `'parse-error'` warning. Clean sentinel boundary, matches the charter North star.
- **Fidelity channel both directions.** Every parser has a `collect<Format>Warnings` pass; **every one of the five serializers now has a `collect<Format>SerializeWarnings` pass** (blend-mode approximation, curve truncation, burst/variance/velocityInheritance drops) — the prior assessment's "serialize-side warnings" backlog item is done.
- **Curve baking.** Unity gradients / size AnimationCurves and Spine multi-stop tint/alpha timelines bake into `colorCurve`/`alphaCurve`/`scaleCurve` (`particleColorCurveFromKeyframes` etc.) and serialize back out as full multi-stop timelines (`spineSerialize.ts:59-72`, `unitySerialize.ts:104-110`) — genuine round-trip beyond endpoints, with dedicated curve round-trip tests.
- **Round-trip preservation via `existing` documents:** all serializers take `(config, existing?, options?)` and re-emit fields the config cannot carry (texture name, emitter type, radial params, prewarm…).
- **Registry** (`formatRegistry.ts`): `ParticleFormatCodec`, `registerParticleFormat` (last-write-wins `Map`), `unregisterParticleFormat`, `getParticleFormatCodec`, `getRegisteredParticleFormats`, `detectRegisteredParticleFormat`, `parseRegisteredParticleFormat` — tested with a vendor-prefixed test codec, but **still with zero built-in registrations** (grep: only tests call `registerParticleFormat`).
- **Contract shape:** deps only `@flighthq/particles` + `@flighthq/types`, `sideEffects: false`, single root `.` export, kinds are plain strings in `@flighthq/types`.
- **Tests:** 14 colocated files, 234 `it` cases; top-level `describe`s mirror exported names; malformed-input and warning-string assertions throughout.

## Gaps

1. **Charter Decision 1 unexecuted — dual dispatch persists.** `detect.ts` + `parseParticleConfig.ts` remain a hardcoded closed `if (format === …Kind)` chain over six formats; the registry stays dead machinery on the default path. Worse, `formatRegistry.ts:90-95` now *documents a fiction*: "Built-in kinds… are registered at module load time by the format packages themselves" — nothing does this, and the next sentence ("no implicit registration") contradicts it.
2. **Charter Decision 2 unexecuted — Phaser ghost intact.** `PhaserParticleFormatKind = 'Phaser'` still declared in `packages/types/src/ParticleFormatKind.ts:14` with no `phaser*` source and no detection.
3. **Charter Decision 3 unexecuted — stale description.** `package.json` description still names three formats ("Particle Designer, Spine, Unity"); the package ships six.
4. **Recovery regression — naming asymmetry.** `ParticleDesignerParsed`, `SpineParsed`, `UnityParsed` are the *only* result-type names in their files (no `*ParseResult`, no `@deprecated` alias), while libGDX/Starling PEX/Pixi carry the canonical `*ParseResult` + deprecated `*Parsed` alias. The 2026-06-24 rename half-survived the source recovery.
5. **Recovery regression — lost tests.** `serializeResult.test.ts` (12 cases per the status log) no longer exists; total cases 234 vs the 279 the prior review verified by count. (`serializeResult.ts` exports only an interface, so `exports:check` may not flag it.)
6. **Pixi is parse-only** (unchanged) — and `ParticleFormatCodec.serialize` is required, so Pixi cannot satisfy the codec interface Decision 1 wants everything routed through. These two must be settled together (charter Open direction 1).
7. **Radial-emitter approximation** (unchanged): PD/PEX `emitterType=1` → gravity emitter + warning. Note the prior review's suggestion that the config's `'cone'`/`'ring'` shapes could absorb part of this is **void in this tree**: `ParticleEmitterShape` is `'point' | 'circle' | 'rect'` only, and the config has no `radialAcceleration`/`tangentialAcceleration` — the parse warnings are accurate again against today's thinner config.
8. **No multi-emitter / effect-bundle handling** (unchanged); real `.p`/PEX/Unity assets carry several emitters.
9. **No Rust crate** (`crate: flighthq-particles-formats` declared, nothing exists) — still the strongest early Wasm-mixing leaf candidate (fork D).
10. **Format breadth for non-game consumers:** nothing for Godot (`ParticleProcessMaterial`), Unreal (Cascade/Niagara), or motion-design tools; Phaser half-declared. Breadth is a charter call, not a defect — noted for completeness against a mature interop library.

## Charter contradictions

The charter now speaks, and the code contradicts it in three places — all three dated Decisions of 2026-07-03 (registry-only dispatch; Phaser implement-or-remove; description update) are recorded in `charter.md › Decisions` and none is realized in source. This is the highest-value finding of the pass: blessed direction exists and execution has not followed. No North-star principle is violated by new work — the violations are all inherited state the Decisions already target.

## Contract & docs fit

**Lives up to the contract:** types `@flighthq/types`-first; full unabbreviated exported names; sentinels-not-throws at the unified boundary with per-format throws documented; single root export; `sideEffects: false`; one test file per source file (modulo gap 5); string kinds; `Readonly<ParticleEmitterConfig>` on all serializer inputs; the subject-triad `-formats` shape.

**Contract-fit drift:**

- **Structural divider comments** (`// ─── Value helpers ───…`) in `particleDesignerParse.ts`, `spineParse.ts`, `unityParse.ts` — an explicit Source Style violation ("avoid structural divider comments"); the recovered libGDX/PEX/Pixi files are clean.
- **Misleading durable comment** in `formatRegistry.ts` (gap 1) — says built-ins self-register at module load, which would also violate `sideEffects: false` if true.
- **Undocumented coordinate seam:** `pixiParse.ts:139` maps direction as `directionY: Math.sin(angleMid)` where every other parser uses `-Math.sin` — presumably correct for Pixi's y-down clockwise angle convention, but no comment or test states so; as written it reads as a sign bug.
- **Test placement drift:** `serializeUnityParticle`/`serializeSpineParticle` describes live in the *parse* test files while `unitySerialize.test.ts`/`spineSerialize.test.ts` also exist, and `unityParse.test.ts:292` / `spineParse.test.ts:267` use the banned `— description` describe suffix the 2026-06-24 pass had removed (another recovery regression).

**Admin-docs candidate revisions (the user's gate):**

- `agents/index.md` Package Map line for `particles-formats` — "Particle Designer / Spine / Unity Shuriken import-export" — still names three formats; should name six and note Pixi is parse-only.
- **Cross-package (types):** `ParticleBurstSchedule` (`packages/types/src/ParticleBurstSchedule.ts`) is exported from `@flighthq/types` but referenced by *nothing* — not by `ParticleEmitterConfig`, not by `@flighthq/particles`. An orphan left by the type reconstruction; either the config regained-fields work re-lands upstream or the orphan should be flagged to the `particles`/`types` cells.
- The status log's 2026-06-24 entry describes state (renames, `serializeResult.test.ts`, 279 tests) that the recovery partially rolled back — the next ingest pass should note the divergence so successors do not trust it as current.

## Candidate open directions

The charter's eight Open directions all remain live; nothing here adds to them except:

1. **Recovery-audit as a task class.** This package shows measurable drift between what a verified review saw and what the recovered tree holds (naming, tests, upstream config fields). When the parent `particles`/`types` recovery is reconciled, gaps 4/5/7 should be re-checked rather than assumed.
2. **Decision-execution sequencing.** Decision 1 (registry-only) cannot complete cleanly while Open direction 1 (Pixi/`serialize` optionality) is unsettled — the codec interface is the coupling point. Worth settling both in one pass.
