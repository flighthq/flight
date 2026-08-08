---
package: '@flighthq/particles-formats'
updated: 2026-08-08
by: principal
---

# particles-formats — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item was re-checked against `packages/particles-formats/src/` on 2026-08-08. A file:line here is
a claim about this tree, not about a session.

- **Phaser is a declared kind with no codec.** `PhaserParticleFormatKind` is defined and is a member of
  the `ParticleFormatKind` union (`types/src/ParticleFormatKind.ts:14`, `:24`), but no
  `phaser*` file, detector branch, or dispatch case exists here.
- **Pixi is parse-only.** `contract.ts` carries `pixiParse` with no `pixiSerialize`; the other five
  formats each ship a parse/serialize pair.
- **Built-in codecs are never registered.** `_registry` is an empty module `Map`
  (`formatRegistry.ts:106`), and no `registerBuiltInParticleFormats` exists, so
  `detectRegisteredParticleFormat` and `getRegisteredParticleFormats` return nothing until a caller
  registers by hand — even though six codecs are compiled in.
- **Deprecated `*Parsed` aliases are still the declared return types** —
  `particleDesignerParse.ts:217`, `spineParse.ts:318`, `unityParse.ts:454`. Nothing is published, so
  there is nothing to stay compatible with.

The unmodeled-feature deepening is still QUEUED behind the current wave. Every item below is crumbed
today, so the drops are visible; the work is importing them instead of reporting them:

- **libGDX `Emission` is never mapped onto `spawnRate`,** so `createParticleEmitterConfig` substitutes
  its default rate on every conversion. The crumb fires unconditionally and says why
  (`libgdxParse.ts:100-111`).
- **libGDX multi-stop `Tint` / `Transparency` reduce to first and last stop** — no `colorCurve` or
  `alphaCurve` is built (`libgdxParse.ts:112-129`). Spawn-shape `edges` / `side` are parsed and dropped
  (`:131-138`, `:364-365`), and `minParticleCount` is parsed and unused (`:369`).
- **Unity**: non-Cone/Sphere/Box shapes collapse to a point (`unity.shape-unsupported`);
  `startRotation` and `prewarm` are dropped; only the first burst imports
  (`unityParse.ts:243-251`), because `ParticleEmitterConfig` carries one `burstCount`/`burstInterval`
  pair; and eleven modules stay unconverted in `UNSUPPORTED_UNITY_MODULES` (`:201-213`) — each waits on
  `@flighthq/particles` growing the matching simulation capability.
- **Particle Designer + Starling PEX**: `finishParticleSizeVariance` and alpha-channel colour variance
  have no config home (`particledesigner.finish-size-variance-unsupported`,
  `starlingpex.alpha-variance-unsupported`).
- **Spine `premultiplied` is informational only** (`spine.premultiplied-informational`); it is a
  renderer concern with no seam on this side. `lifeOffset` and position ranges are dropped.
- **Pixi `acceleration` and v5+ `behaviors`** are recognized and unmodeled
  (`pixi.acceleration-unsupported`, `pixi.behaviors-partial`).
- **Radial emitters approximate to gravity** in both plist dialects
  (`particleDesignerParse.ts:171`, `starlingPexParse.ts:60`), and the radial/tangential acceleration
  axes have nowhere to land. This one is blocked twice over, not merely unstarted: `ParticleForce` is a
  deliberately closed union (`types/src/ParticleForce.ts:7`) and `ParticleEmitterConfig` no longer
  carries `radialAcceleration` / `tangentialAcceleration` at all. Faithful import needs a ruling in
  `particles` first.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. The headline claim in the 2026-07-25 entry
  checked out **false**: libGDX `Emission` was described as "the one feature NOT crumbed, since an
  always-firing crumb would break the clean-import contract," but it now reports unconditionally at
  `libgdxParse.ts:106-111`, with a comment arguing exactly the opposite — a conditional guard would
  miss the explicit-zero-rate case. The schema types named as local files (`libgdxSchema.ts`,
  `starlingPexSchema.ts`, `serializeResult.ts`) also no longer live here; they are in `@flighthq/types`.
- **2026-07-25** — Structured-diagnostics capstone: every recognized-but-unmodeled feature now emits a
  Skip or Recover crumb, so the parsers agree on what they drop.
- **2026-06-24** — libGDX `.p`, Starling PEX, and Pixi parsers added; `formatRegistry` introduced;
  `detectParticleFormat` and `parseParticleConfig` widened to all six formats.
