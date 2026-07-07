---
package: '@flighthq/particles-formats'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# particles-formats — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/particles-formats

**Session date:** 2026-06-24 **Starting score (second pass):** 78/100 **Estimated new score:** 92/100

## What Changed This Session (Second Pass)

### Renames: `*Parsed` → `*ParseResult`

- `ParticleDesignerParsed` — deprecated alias; `ParticleDesignerParseResult` is the canonical name.
- `SpineParsed` — deprecated alias; `SpineParseResult` is the canonical name.
- `UnityParsed` — deprecated alias; `UnityParseResult` is the canonical name.

All three deprecated aliases carry a `@deprecated` JSDoc tag pointing to the new name. All callers and test files updated.

### exports:check — describe-block naming fixed

Rewrote `particleDesignerParse.test.ts`, `spineParse.test.ts`, and `unityParse.test.ts` to use exact-function-name describe blocks (`describe('parseParticleDesignerPlist', ...)` etc.) instead of the old ` — description` suffix style. The `exports:check` checker now sees 100% coverage across all three files.

### libGDX `.p` parser — new Silver format

**Files:** `libgdxSchema.ts`, `libgdxParse.ts`, `libgdxSerialize.ts`, `libgdxParse.test.ts`, `libgdxSerialize.test.ts`

- `LibgdxParticleDocument` — schema for the full `.p` document model (sections, emitter name, imagePath, additive flag, range values with scaling/timeline arrays).
- `LibgdxRangeValue` — typed representation of libGDX's numeric range descriptor.
- `LibgdxParseResult` / `LibgdxParsed` (deprecated alias) — parse result shape.
- `LibgdxParseOptions` — `{ textureSize? }` option bag.
- `parseLibgdxParticle(text, options?)` — single-pass parse to `ParticleEmitterConfig`.
- `parseLibgdxParticleDocument(text, options?)` — full parse to `LibgdxParseResult` with warnings.
- `LibgdxSerializeOptions` — `{ textureSize? }` option bag.
- `serializeLibgdxParticle(config, existing?, options?)` — produces `.p` text.
- `serializeLibgdxParticleDocument(config, existing?, options?)` — `ParticleSerializeResult`.

Key parsing decisions:

- Root metadata (`additive`, `maxParticleCount`, `imagePath`) appear after the `- EmitterName -` header line in the format, so they land in the emitter section. Parser reads root from the emitter section first, falls back to `'Particle Effect'` section.
- Duration stored in milliseconds → converted to seconds (÷ 1000).
- Velocity range → `speedMin`/`speedMax`.
- Angle range → direction vector midpoint + spread in radians.
- Tint colors → `colorStart`/`colorEnd` (first/last stop from timeline).
- Transparency scaling → `alphaStart`/`alphaEnd` (first/last scaling value).
- Scale section → `scaleMin`/`scaleMax` (size range ÷ textureSize) and `scaleEnd` (last scaling timeline value).

### Starling PEX parser — new Silver format

**Files:** `starlingPexSchema.ts`, `starlingPexParse.ts`, `starlingPexSerialize.ts`, `starlingPexParse.test.ts`, `starlingPexSerialize.test.ts`

- `StarlingPexDocument` — schema for the full document model.
- `StarlingPexColor` — `{ red, green, blue, alpha }` channel struct.
- `StarlingPexParseResult` / `StarlingPexParsed` (deprecated alias) — parse result shape.
- `StarlingPexParseOptions` — `{ textureSize? }` option bag.
- `parseStarlingPex(xml, options?)` — single-pass parse.
- `parseStarlingPexDocument(xml, options?)` — full parse with warnings. Handles attribute-style (`<attribute name="X" value="Y"/>`) and color-attribute style (`<attribute name="startColor" red="…"`). Warns on radial emitter approximation and unsupported radial/tangential acceleration.
- `StarlingPexSerializeOptions` — `{ textureSize? }` option bag.
- `serializeStarlingPex(config, existing?, options?)` — produces attribute-style XML.
- `serializeStarlingPexDocument(config, existing?, options?)` — `ParticleSerializeResult`.

### Pixi parser — new Silver format

**Files:** `pixiParse.ts`, `pixiParse.test.ts`

- `PixiParseResult` / `PixiParsed` (deprecated alias) — parse result shape.
- `parsePixiParticle(json)` — single-pass parse. Throws a clear, format-tagged error on invalid JSON or non-object root.
- `parsePixiParticleDocument(json)` — full parse with warnings. Warns on non-zero `acceleration`, `spawnBurst`, `spawnPolygon`, v5+ `behaviors` array.

Supports pixi-particle-emitter v3/v4/v5 config shape: `pos`, `alpha.start/end`, `speed.start/end`, `scale.start/end`, `color.start/end`, `lifetime.min/max`, `spawnRect`, `spawnCircle`, `blendMode`, `frequency`, `maxParticles`.

### Format registry — `registerParticleFormat`

**File:** `formatRegistry.ts`, `formatRegistry.test.ts`

- `ParticleFormatCodec` — interface: `{ detect, parseToConfig, parseToDocument, serialize }`.
- `registerParticleFormat(kind, codec)` — last-write-wins, module-private `Map<string, codec>`.
- `unregisterParticleFormat(kind)` — returns `boolean`.
- `getParticleFormatCodec(kind)` — returns codec or `null`.
- `getRegisteredParticleFormats()` — returns all registered kind strings.
- `detectRegisteredParticleFormat(text)` — consults all codecs' `detect` in insertion order.
- `parseRegisteredParticleFormat(text, kind)` — returns `ParticleConfigParseResult`.

### Detect and dispatch wired for new formats

`detectParticleFormat` now detects:

- libGDX `.p` — first non-empty line is exactly `Particle Effect`.
- Starling PEX — XML containing `<particleEmitterConfig` (checked before `<plist`).

`parseParticleConfig` and `parseParticleConfigDocument` now dispatch all six supported formats: libGDX, Particle Designer, Pixi, Spine, Starling PEX, Unity.

`ParseParticleConfigOptions` now extends `LibgdxParseOptions` and `StarlingPexParseOptions` as well.

---

## Implemented APIs (Complete Picture)

### `@flighthq/types` (unchanged this session, already added last pass)

- `ParticleFormatKind` union and constants: `ParticleDesignerFormatKind`, `SpineParticleFormatKind`, `UnityParticleFormatKind`, `LibgdxParticleFormatKind`, `StarlingPexFormatKind`, `PixiParticleFormatKind`, `PhaserParticleFormatKind`.
- `ParticleFormatWarning` interface.

### `@flighthq/particles-formats`

**Core dispatch:**

- `detectParticleFormat(text)` — detects libGDX, Starling PEX, Particle Designer, Unity, Pixi, Spine.
- `parseParticleConfig(text, options?)` — unified parse, all six formats.
- `parseParticleConfigDocument(text, options?)` — unified parse with `{ config, format, warnings }`.

**Registry:**

- `registerParticleFormat(kind, codec)`, `unregisterParticleFormat(kind)`, `getParticleFormatCodec(kind)`, `getRegisteredParticleFormats()`, `detectRegisteredParticleFormat(text)`, `parseRegisteredParticleFormat(text, kind)`.
- `ParticleFormatCodec` interface, `ParticleConfigParseResult` interface, `ParseParticleConfigOptions` interface.

**Particle Designer (plist):**

- `parseParticleDesignerPlist`, `parseParticleDesignerPlistDocument`, `serializeParticleDesignerPlist`, `serializeParticleDesignerPlistDocument`.
- `ParticleDesignerDocument`, `ParticleDesignerParseResult` (+ deprecated `ParticleDesignerParsed`), `ParticleDesignerParseOptions`, `ParticleDesignerSerializeOptions`.

**Spine:**

- `parseSpineParticle`, `parseSpineParticleDocument`, `serializeSpineParticle`, `serializeSpineParticleDocument`.
- `SpineParticleDocument`, `SpineParseResult` (+ deprecated `SpineParsed`), `SpineSerializeOptions`.

**Unity:**

- `parseUnityParticle`, `parseUnityParticleDocument`, `serializeUnityParticle`, `serializeUnityParticleDocument`.
- `UnityParticleDocument`, `UnityParseResult` (+ deprecated `UnityParsed`), `UnityParseOptions`, `UnitySerializeOptions`.

**libGDX:**

- `parseLibgdxParticle`, `parseLibgdxParticleDocument`, `serializeLibgdxParticle`, `serializeLibgdxParticleDocument`.
- `LibgdxParticleDocument`, `LibgdxRangeValue`, `LibgdxParseResult` (+ deprecated `LibgdxParsed`), `LibgdxParseOptions`, `LibgdxSerializeOptions`.

**Starling PEX:**

- `parseStarlingPex`, `parseStarlingPexDocument`, `serializeStarlingPex`, `serializeStarlingPexDocument`.
- `StarlingPexDocument`, `StarlingPexColor`, `StarlingPexParseResult` (+ deprecated `StarlingPexParsed`), `StarlingPexParseOptions`, `StarlingPexSerializeOptions`.

**Pixi:**

- `parsePixiParticle`, `parsePixiParticleDocument`.
- `PixiParseResult` (+ deprecated `PixiParsed`).

**Shared:**

- `ParticleSerializeResult` interface.

### Tests (15 test files, 279 tests passing)

| Test file                           | Tests     |
| ----------------------------------- | --------- |
| `detect.test.ts`                    | 17        |
| `formatRegistry.test.ts`            | ~10       |
| `libgdxParse.test.ts`               | ~22       |
| `libgdxSerialize.test.ts`           | ~10       |
| `parseParticleConfig.test.ts`       | ~20       |
| `particleDesignerParse.test.ts`     | rewritten |
| `particleDesignerSerialize.test.ts` | 9         |
| `pixiParse.test.ts`                 | 20        |
| `serializeResult.test.ts`           | 12        |
| `spineParse.test.ts`                | rewritten |
| `spineSerialize.test.ts`            | 10        |
| `starlingPexParse.test.ts`          | ~18       |
| `starlingPexSerialize.test.ts`      | ~10       |
| `unityParse.test.ts`                | rewritten |
| `unitySerialize.test.ts`            | 10        |

## Deferred Items and Why

### Phaser JSON parser (Silver)

`PhaserParticleFormatKind` is declared in `@flighthq/types`. Detection is not yet wired (the Phaser format would need a structural fingerprint — probably `particles: []` array with `{ x, y, lifespan }` items). Not implemented this session.

### Multi-burst Unity import (Bronze-level, blocked by cross-package design decision)

`ParticleEmitterConfig` has only `burstCount: number` and `burstInterval: number`. Unity supports multiple one-shot bursts. Extending this requires a `bursts` field in `@flighthq/types`. The existing warning `"only first burst imported"` remains. Surface to user before acting.

### Particle Designer radial-emitter simulation (Bronze-level, blocked)

`emitterType=1` (radial) falls back to gravity with a warning. Proper mapping requires `RadialForce`/`TangentialForce` descriptors in `@flighthq/types`'s `ParticleForce` union and registry-based dispatch in `@flighthq/particles`. Surface to user.

### Batch / multi-emitter handling (Silver)

`parseParticleEffectBundle` and `serializeParticleEffectBundle` — requires `ParticleEffectBundle`/`ParticleEffectEntry` types in `@flighthq/types`. Out of scope.

### Rust crate `flighthq-particles-formats` (Gold)

No `crates/` directory in this worktree. The Rust port is a future task. TS API surface is now stable enough to start the port.

### Exhaustive Unity module coverage (Gold)

`UNSUPPORTED_UNITY_MODULES` still lists velocity-over-lifetime, force-over-lifetime, limit-velocity, noise, collision, sub-emitters, trails, texture-sheet, external-forces, lights. Each conversion depends on parent `@flighthq/particles` growing matching simulation capabilities.

## Concerns / Surprises

1. **libGDX root-metadata in emitter section**: Root-level fields (`additive`, `maxParticleCount`, `imagePath`) appear after the `- EmitterName -` header line in the standard format, so the parser reads root from the emitter section first. This was a non-obvious parsing detail that needed a dedicated fix.

2. **Pixi `acceleration` warning scope**: Initial implementation warned whenever the `acceleration` key existed (even `{x:0, y:0}`). Corrected to warn only for non-zero values — matching user expectations.

3. **exports:check colocated-test requirement**: The checker requires a `*.test.ts` file colocated with each `*.ts` source file (not just a describe block in some other test file). Created separate `libgdxSerialize.test.ts` and `starlingPexSerialize.test.ts` for the serialize modules.

## Suggestions for Future Sessions

1. **Add Phaser JSON parser** — detect the `particles: [...]` shape, parse to config.
2. **Surface the multi-burst design question** to the user: should `ParticleEmitterConfig` gain a `bursts` array field?
3. **Surface the radial-emitter design question**: extend `ParticleForce` to an open registry-dispatch union?
4. **Register built-in codecs into `formatRegistry`** — the codecs exist but are not auto-registered. Consider a `registerBuiltInParticleFormats()` convenience function.
5. **Rust port** — TS API is now stable enough. Start with `flighthq-particles-formats` as a mixable leaf crate (plain data in/out, no graph state).
