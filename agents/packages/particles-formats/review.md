---
package: '@flighthq/particles-formats'
status: solid
score: 79
updated: 2026-09-02
ingested:
  - status.md (2026-08-08)
  - charter.md (blessed 2026-07-03, incl. Decisions + Open directions)
  - assessment.md (2026-07-13, based on prior review)
  - prior review.md (2026-07-13, solid/82)
  - source (all 15 src files, live worktree)
  - tests (all 14 colocated *.test.ts, 261 it-cases)
  - '@flighthq/types: ParticleFormatKind, ParticleFormatCodec, ParticleEmitterConfig, ParticleConfigParse, ParticleSerializeResult, ParticleEmitterShape, ParticleForce, ParticleBurstSchedule, all format schema types'
  - package.json
---

# particles-formats -- Review

> Evidence: live worktree `packages/particles-formats/src/`. Prior review (2026-07-13, `solid` 82) verified the six-format codec core and flagged three unexecuted charter Decisions plus recovery regressions. This pass re-verifies every claim against current source.

## Verdict

`solid` -- **79/100** (down from 82). The six-format codec core remains intact and well-tested, but the score drops for three reasons: (1) **all three 2026-07-03 charter Decisions remain unexecuted** two months later -- the registry-only dispatch unification, the Phaser ghost, and the stale package description; (2) **naming asymmetry and orphaned `@deprecated` annotations** persist across five of the six format files, creating confusion about what is deprecated and what is not; and (3) **dependency growth** (`@flighthq/importdiagnostics` and `@flighthq/math` added since the charter baseline) is legitimate but the charter's "deps only `particles` + `types`" framing is now stale. Test coverage dropped from 279 to 261 `it`-cases, with some serialize tests duplicated across parse and serialize test files rather than consolidated.

## Present capabilities

All verified in source this pass.

- **Six formats.** Five full round-trips -- each with `<format>Parse.ts` + `<format>Serialize.ts`: Particle Designer plist, Spine 4.x JSON, Unity Shuriken JSON, libGDX `.p`, Starling PEX XML. **Pixi v3/v4/v5 JSON is parse-only** (`pixiParse.ts`; no serializer).
- **Unified dispatch** (`parseParticleConfig.ts`): `parseParticleConfig` / `parseParticleConfigDocument` over `detectParticleFormat` (`detect.ts`, structural sniffing, never throws). Unknown input returns a default config + `particles.unknown-format` Reject diagnostic; per-format parser throws are caught and returned as `particles.parse-error` Reject. Clean sentinel boundary, matching the charter North star.
- **Structured diagnostics via `@flighthq/importdiagnostics`.** All parsers use `reportImportDiagnostic` with typed `ImportDiagnostic` objects carrying severity (`Skip`, `Recover`, `Reject`), a string code, and an origin function name. This is a step up from the old `warnings: string[]` channel -- the parse side now uses `ImportDiagnostic[]` while serialize side still uses `string[]` warnings.
- **Fidelity channel both directions.** Every parser has `collect<Format>Diagnostics` (import); every serializer has `collect<Format>SerializeWarnings` (export). Import uses structured `ImportDiagnostic[]`; export uses plain `string[]` via `ParticleSerializeResult.warnings`.
- **Curve baking.** Spine multi-stop tint/alpha timelines and Unity colorOverLifetime gradients / sizeOverLifetime AnimationCurves bake into `colorCurve`/`alphaCurve`/`scaleCurve` (`particleColorCurveFromKeyframes`, `particleCurveFromKeyframes` from `@flighthq/particles`). Serializers write them back out as full multi-stop timelines -- genuine round-trip with dedicated curve round-trip tests in `spineParse.test.ts:328` and `unityParse.test.ts:348`.
- **Round-trip preservation via `existing` documents.** All five serializers accept `(config, existing?, options?)` and re-emit format-specific fields the config cannot carry (texture name, emitter type, radial params, prewarm, blend function constants, etc.).
- **Registry** (`formatRegistry.ts`): `ParticleFormatCodec` interface, `registerParticleFormat` (last-write-wins `Map`), `unregisterParticleFormat`, `getParticleFormatCodec`, `getRegisteredParticleFormats`, `detectRegisteredParticleFormat`, `parseRegisteredParticleFormat` -- tested with a vendor-prefixed test codec. Registry returns `ImportDiagnostic[]` for unknown-format/parse-error cases. But **zero built-in codecs are registered** on the default path.
- **Contract shape:** deps `@flighthq/particles` + `@flighthq/types` + `@flighthq/importdiagnostics` + `@flighthq/math`. `sideEffects: false`. Two export lanes: `.` (public, curated `index.ts`) and `./contract` (full surface, `contract.ts` with `export *`). String kinds in `@flighthq/types`.
- **Tests:** 14 colocated files, 261 `it`-cases. Top-level `describe` blocks mostly mirror exported names. Malformed-input, warning-string, and diagnostic-code assertions throughout.

## Gaps

1. **Charter Decision 1 unexecuted -- dual dispatch persists.** `detect.ts` + `parseParticleConfig.ts` remain a hardcoded closed `if (format === ...Kind)` chain over six formats; the registry is dead machinery on the default path. The misleading JSDoc in `formatRegistry.ts:88-94` still claims "Built-in kinds... are registered at module load time by the format packages themselves" and then contradicts itself: "This function must be called explicitly -- there is no implicit registration at module load time."

2. **Charter Decision 2 unexecuted -- Phaser ghost intact.** `PhaserParticleFormatKind = 'Phaser'` is declared in `ParticleFormatKind.ts:14` and included in the `ParticleFormatKind` union (`:24`), but no `phaser*` source file exists, `detectParticleFormat` does not sniff for it, and `parseParticleConfig` has no dispatch branch for it.

3. **Charter Decision 3 unexecuted -- stale description.** `package.json` description reads "Import/export particle emitter configs from industry-standard formats (Particle Designer, Spine, Unity)" -- names three formats; the package ships six.

4. **Naming asymmetry in result types.** Three formats use the old `*Parsed` name as the primary interface in `@flighthq/types` with no `*ParseResult` canonical form: `ParticleDesignerParsed` (in `ParticleDesignerSchema.ts:92`), `SpineParsed` (in `SpineParticleSchema.ts:70`), `UnityParsed` (in `UnitySchema.ts:141`). The other three use canonical `*ParseResult` names with deprecated `*Parsed` aliases: `LibgdxParseResult` + `LibgdxParsed`, `StarlingPexParseResult` + `StarlingPexParsed`, `PixiParseResult` + `PixiParsed`. The import-side source mirrors this split exactly.

5. **Orphaned `@deprecated` annotations.** `pixiParse.ts:11`, `libgdxParse.ts:14`, and `starlingPexParse.ts:15` each carry `/** @deprecated Use 'XxxParseResult'. */` as a free-floating JSDoc comment that does not attach to any declaration -- it sits before the function's own JSDoc comment, so it is dead text that reads as if `parsePixiParticle`/`parseLibgdxParticle`/`parseStarlingPex` are deprecated (they are not). These are leftovers from when the `*Parsed` type alias lived in the file.

6. **Pixi direction sign anomaly.** `pixiParse.ts:154` maps `directionY: Math.sin(angleMid)` -- every other parser uses `directionY: -Math.sin(...)` (negated). No comment explains why Pixi uses positive sin, and no test specifically asserts the direction sign for a known angle. If Pixi's angle convention is genuinely y-down (clockwise from +x), the positive sign is correct and needs a durable coordinate-space comment. If it is a bug, all existing tests pass because none of them test direction at a non-axis-aligned angle where the sign would matter.

7. **Diagnostic asymmetry between parse and serialize.** Import side uses structured `ImportDiagnostic[]` (via `@flighthq/importdiagnostics`); export side uses unstructured `string[]` (via `ParticleSerializeResult.warnings`). This means import diagnostics are machine-readable (severity, code, origin) while export warnings are opaque prose. The mismatch is visible across all five serializers.

8. **Serialize tests duplicated across files.** `serializeSpineParticle` has describe blocks in both `spineParse.test.ts:306` and `spineSerialize.test.ts:39`; `serializeUnityParticle` in both `unityParse.test.ts:329` and `unitySerialize.test.ts:26`. Similarly `serializeParticleDesignerPlist` in `particleDesignerParse.test.ts:309`. These are different tests (curve round-trip vs. basic field round-trip), but the dual-file placement means the same exported function name appears in `describe` blocks in two files, violating the one-test-file-per-source-file convention.

9. **No multi-emitter / effect-bundle handling** (unchanged). Real `.p`/PEX/Unity assets routinely carry several emitters; the package returns one config per file.

10. **Radial-emitter approximation** (unchanged). PD/PEX `emitterType=1` maps to a gravity emitter + warning. `ParticleForce` is a deliberately closed union (per `ParticleForce.ts:7` comment) and `ParticleEmitterConfig` has no `radialAcceleration`/`tangentialAcceleration` fields. The current parse warnings are accurate against today's config.

11. **No Rust crate** (`crate: flighthq-particles-formats` declared in charter, nothing exists).

## Charter contradictions

All three dated Decisions of 2026-07-03 are recorded in `charter.md` and none is realized in source. This is unchanged from the prior review and is the single largest gap between charter and code:

- **Decision 1** (registry-only dispatch) -- `detect.ts` and `parseParticleConfig.ts` are still a closed `if` chain. No `registerBuiltInParticleFormats` function exists.
- **Decision 2** (Phaser: implement or remove) -- `PhaserParticleFormatKind` is still declared with no implementation.
- **Decision 3** (package description update) -- `package.json` still names three formats.

The charter's "What it is" section correctly names six formats, but the `package.json` description and the Package Map line in `agents/index.md` have not caught up.

The charter's dependency framing ("deps only `particles` + `types`") is also stale: `@flighthq/importdiagnostics` and `@flighthq/math` are now runtime dependencies. Both are legitimate (`importdiagnostics` for structured diagnostics, `math` for `DEG_TO_RAD`/`RAD_TO_DEG`), but the charter should acknowledge them.

## Contract & docs fit

**Satisfies the contract:**
- Types are `@flighthq/types`-first; all `ParticleDesignerDocument`, `SpineParticleDocument`, `UnityParticleDocument`, `LibgdxParticleDocument`, `StarlingPexDocument`, `ParticleFormatCodec`, `ParticleConfigParseResult`, and schema types live in `@flighthq/types`.
- Full unabbreviated exported names (e.g. `parseParticleDesignerPlistDocument`, `serializeStarlingPexDocument`).
- Sentinels at the unified boundary (`parseParticleConfig` returns default config, `parseParticleConfigDocument` returns default config + Reject diagnostic); per-format parsers throw on genuinely malformed input as documented.
- Two export lanes: curated `index.ts` (named exports) and `contract.ts` (barrel re-exports).
- `sideEffects: false` declared and honored -- no top-level side effects, no self-registration.
- `Readonly<ParticleEmitterConfig>` on all serializer inputs.
- One test file per source file (14 source, 14 test), all colocated in `src/`.
- String kind identity via `@flighthq/types` constants.

**Contract-fit drift:**
- **Structural divider comments** (`// --- ... ---` style) in `particleDesignerParse.ts` (lines 15, 75, 148), `spineParse.ts` (lines 22, 126, 271, 342), and `unityParse.ts` (lines 31, 87, 357, 444) -- an explicit Source Style violation. The `libgdxParse.ts`, `starlingPexParse.ts`, and `pixiParse.ts` files are clean.
- **Misleading durable comment** in `formatRegistry.ts:88-94` -- claims built-ins self-register at module load, which contradicts both reality and `sideEffects: false`. The very next sentence contradicts it.
- **Orphaned `@deprecated` JSDoc** (gap 5) -- dead text that creates a false deprecation impression.
- **Serialize test placement** (gap 8) -- `serializeSpineParticle`, `serializeUnityParticle`, and `serializeParticleDesignerPlist` have `describe` blocks in parse test files alongside their dedicated serialize test files.

**Admin-docs candidate revisions (the user's gate):**
- `agents/index.md` Package Map line for `particles-formats` -- still names three formats; should name six and note Pixi is parse-only.
- Cross-package: `ParticleBurstSchedule` (`packages/types/src/ParticleBurstSchedule.ts`) is exported from `@flighthq/types/contract` but referenced by nothing in `@flighthq/particles` or `@flighthq/particles-formats` -- an orphan type.
- The charter dependency list should be updated to include `@flighthq/importdiagnostics` and `@flighthq/math`.

## Candidate open directions

The charter's eight Open directions all remain live. Observations from this pass:

1. **Decision execution is the highest-priority work.** Three blessed Decisions sit unexecuted for two months. Decision 1 (registry-only dispatch) remains coupled to Open direction 1 (Pixi serialize optionality) -- the `ParticleFormatCodec` interface requires `serialize`, so Pixi cannot satisfy it. Settling both in one pass is the natural sequencing.

2. **Diagnostic symmetry.** Import diagnostics upgraded to structured `ImportDiagnostic[]` while serialize warnings remain unstructured `string[]`. Unifying them so serialize also uses `ImportDiagnostic[]` would close the asymmetry and make all diagnostics machine-readable. This requires a `ParticleSerializeResult` change in `@flighthq/types` -- cross-package.

3. **Naming consolidation.** The three older formats (PD, Spine, Unity) use `*Parsed` as the primary type; the three newer ones (libGDX, PEX, Pixi) use `*ParseResult`. Greenfield: rename the three `*Parsed` types to `*ParseResult` in `@flighthq/types` (cross-package) and update the three parser files. Deprecated aliases in the opposite direction already exist for the newer three.

4. **Test consolidation.** Serialize round-trip tests that live in parse test files should migrate to their dedicated serialize test files. This is mechanical cleanup.

5. **libGDX Emission mapping.** The unconditional Recover diagnostic at `libgdxParse.ts:105-110` fires on every import. Mapping the Emission section onto `spawnRate` would eliminate it and close the loss. Queued per status.md.

6. **`ParticleEmitterShape` has grown** to include `'box'`, `'cone3d'`, and `'sphere'` (3D shapes). The parsers still use only `'point' | 'circle' | 'rect'`. This is correct for 2D formats, but if a format can express 3D shapes (Unity's Sphere/Hemisphere/Box map to `'circle'`/`'rect'` today), richer mapping may be warranted when 3D particle formats are in scope.
