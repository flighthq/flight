# @flighthq/particles-formats — status

## 2026-06-25 — builder R2-4 lost-source recovery

The integration curation pruned `packages/particles-formats/src/` down to the Particle Designer / Spine / Unity trio (parse + schema + serialize), but the gitignored `dist/` proved a much larger format suite had compiled. Reconstructed the lost `.ts` by merging `dist/<m>.js` (impl + `//` comments verbatim) with `dist/<m>.d.ts` (types) — the validated camera pattern.

### Recovered modules (new src + colocated test + index export)

- `serializeResult.ts` — `ParticleSerializeResult` interface (the `{ text, warnings }` shape every `*Document` serializer returns). Interface-only, no test (like the schema files).
- `libgdxSchema.ts` — `LibgdxRangeValue`, `LibgdxParticleDocument`. Interface-only.
- `libgdxParse.ts` — `parseLibgdxParticle`, `parseLibgdxParticleDocument` (+ `LibgdxParseOptions`, `LibgdxParseResult`, `LibgdxParsed`). libGDX 2D Particle Editor `.p` text reader.
- `libgdxSerialize.ts` — `serializeLibgdxParticle`, `serializeLibgdxParticleDocument` (+ `LibgdxSerializeOptions`).
- `pixiParse.ts` — `parsePixiParticle`, `parsePixiParticleDocument` (+ `PixiParseResult`, `PixiParsed`). pixi-particle-emitter v3/v4/v5 JSON reader.
- `starlingPexSchema.ts` — `StarlingPexColor`, `StarlingPexDocument`. Interface-only.
- `starlingPexParse.ts` — `parseStarlingPex`, `parseStarlingPexDocument` (+ `StarlingPexParseOptions`, `StarlingPexParseResult`, `StarlingPexParsed`).
- `starlingPexSerialize.ts` — `serializeStarlingPex`, `serializeStarlingPexDocument` (+ `StarlingPexSerializeOptions`).

### Recovered functions (added into existing src files)

The three surviving serialize files had lost their `*Document` (warnings-returning) variants and the warning collectors behind them:

- `particleDesignerSerialize.ts` — added `serializeParticleDesignerPlistDocument`
  - `collectParticleDesignerSerializeWarnings`.
- `spineSerialize.ts` — added `serializeSpineParticleDocument`
  - `collectSpineSerializeWarnings`.
- `unitySerialize.ts` — added `serializeUnityParticleDocument`
  - `collectUnitySerializeWarnings`.

`serializeResult.ts` was imported by these three plus the libgdx/starling serializers, so it had to come back first.

### Fossils skipped

None. Nothing recovered touches the dropped DisplayObject / Loader / Stage / Bitmap / Video concepts; this is a pure data-codec package.

### Parked

- `detect.ts` (`detectParticleFormat`) — reason: needs the `*ParticleFormatKind` string constants (`LibgdxParticleFormatKind`, `ParticleDesignerFormatKind`, `PixiParticleFormatKind`, `SpineParticleFormatKind`, `StarlingPexFormatKind`, `UnityParticleFormatKind`) in `@flighthq/types`. They exist in `packages/types/dist/ParticleFormatKind.{js,d.ts}` but were pruned from `packages/types/src/` — outside this task's hard boundary (no `@flighthq/types` edits). Recover alongside a `ParticleFormatKind.ts` restoration in the types package.
- `formatRegistry.ts` (`registerParticleFormat`, `unregisterParticleFormat`, `getParticleFormatCodec`, `getRegisteredParticleFormats`, `detectRegisteredParticleFormat`, `parseRegisteredParticleFormat`, `ParticleFormatCodec`) — reason: needs the `ParticleFormatKind` type in `@flighthq/types` (same prune as above).
- `parseParticleConfig.ts` (`parseParticleConfig`, `parseParticleConfigDocument`) — reason: needs the `*ParticleFormatKind` constants in `@flighthq/types` (same prune). Its non-type deps (`detect`, all per-format parsers) are otherwise present.

### Type drift handled (not parked)

The `dist/` was built against an older, richer `ParticleEmitterConfig` whose current `packages/types/src/ParticleEmitterConfig.ts` no longer carries `burstSchedule`, `rgbaCurve`, `spawnRateCurve`, `angularAcceleration`, `angularDrag`, `scaleAspect`, `stretchByVelocity`, or `colorInterpolation`. These appeared only inside the libgdx/starling **serialize warning collectors** (and their tests). Since the fields are gone from the authoritative type and `@flighthq/types` is out of bounds, those individual warning checks + their tests were dropped; the parse/serialize round-trip functionality is recovered intact. If/when those config fields return to `@flighthq/types`, re-add the corresponding warning lines (they are verbatim in `dist/libgdxSerialize.js` / `dist/starlingPexSerialize.js`).

### Tests

`npm run test --workspace=packages/particles-formats` → 11 files, 185 tests, all passing. `npx tsc --noEmit -p tsconfig.json` (package-local) → clean.

## 2026-06-25 — builder R2-4 second-pass recovery

The first pass parked three modules for "needs the `*ParticleFormatKind` string constants / `ParticleFormatKind` type in `@flighthq/types`". A parallel types-recovery pass has since restored `packages/types/src/ParticleFormatKind.ts` (all six built-in `*FormatKind` constants plus `PhaserParticleFormatKind`, and the `ParticleFormatKind` union) and `ParticleFormatWarning.ts`. With the blocking types present, all three parked modules are now recoverable and were merged from `dist/<m>.js` (+ `//` comments) and `dist/<m>.d.ts`.

### Recovered modules (new src + colocated test + index export)

- `detect.ts` — `detectParticleFormat`. Structural content sniffer (libGDX `.p` first line, PEX/plist XML markers, Unity MinMaxCurve `mode`/`gravityModifier`, Pixi `pos`+`alpha.start/end`, Spine `continuous`/`{low,high}` ranges); returns `null` for unknown/corrupt input, never throws. Private helpers `hasMinMaxCurveMode`/`isRangeObject` kept below the export.
- `formatRegistry.ts` — `ParticleFormatCodec` interface plus `detectRegisteredParticleFormat`, `getParticleFormatCodec`, `getRegisteredParticleFormats`, `parseRegisteredParticleFormat`, `registerParticleFormat`, `unregisterParticleFormat`. Last-write-wins `Map`-backed registry; the `_registry` scratch moved to the bottom of the file per source-style.
- `parseParticleConfig.ts` — `parseParticleConfig`, `parseParticleConfigDocument` (+ `ParseParticleConfigOptions`, `ParticleConfigParseResult`). Unified dispatcher over `detectParticleFormat` + the per-format parsers; unknown/error input returns a default config with an `'unknown-format'`/`'parse-error'` warning rather than throwing.

`src/index.ts` updated with the three `export *` lines (alphabetized); it now matches `dist/index.js` exactly (full module parity).

### Fossils skipped

None. No Phaser codec module exists in `dist/` (only the `PhaserParticleFormatKind` constant lives in `@flighthq/types`), so there is nothing to recover for it. Nothing recovered touches the dropped DisplayObject / Loader / Stage / Bitmap concepts.

### Parked

None — all previously-parked modules recovered.

### Tests

`npm run test --workspace=packages/particles-formats` → 14 files, 231 tests, all passing (up from 11/185). The three new test files (`detect.test.ts`, `formatRegistry.test.ts`, `parseParticleConfig.test.ts`) were ported verbatim from `dist/*.test.js`.
