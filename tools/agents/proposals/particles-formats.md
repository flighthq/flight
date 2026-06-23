---
id: particles-formats
title: '@flighthq/particles-formats'
type: depth
target: particles-formats
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/depth/particles-formats.md
  - tools/agents/docs/reviews/depth/particles-formats.md
depends_on: []
updated: 2026-06-23
---

## Summary

solid — 68/100. A genuinely well-built three-format conversion layer (Particle Designer plist, Spine particle JSON, Unity Shuriken JSON) with full round-trip, lossless `existing`-document merge, curve baking, and an honest `warnings[]` channel; held back from authoritative by format breadth and a few in-format fidelity gaps, not by shallow execution.

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The minimum genuinely-useful upgrade: close the most glaring fidelity and ergonomics gaps in the formats already supported, plus the structural fixes. No new format families yet — make the three existing ones correct and discoverable.

- **`detectParticleFormat(text): ParticleFormatKind | null`** — sniff plist-vs-JSON, then within JSON disambiguate Spine/Unity by shape markers; return a sentinel `null` when no format matches (expected failure, not a throw). Define `ParticleFormatKind` as string constants (`'ParticleDesigner'`, `'Spine'`, `'Unity'`) in `@flighthq/types` (these are the registry keys Silver's dispatcher will use).
- **`parseParticleConfig(text, options?): ParticleEmitterConfig`** and **`parseParticleConfigDocument(text, options?): ParticleParsed`** — unified entry points that call `detectParticleFormat` then route to the format-specific parser, so callers need not know the format a priori. Return a sentinel-bearing result (`warnings` includes an `'unknown-format'` entry; config falls back to `createParticleEmitterConfig()`) rather than throwing on unknown input.
- **Particle Designer radial-emitter import (the headline fidelity gap).** Map `emitterType=1` (radial) plus `radialAcceleration`/`tangentialAcceleration` into the parent's `ParticleForce` model (`applyParticleForces` already exists) instead of only warning. Requires a `ParticleForce` radial/tangential descriptor in `@flighthq/types` — if one is missing, surface it as a cross-package item (see Sequencing) rather than inventing a parallel representation here.
- **Import all Unity emission bursts**, not just the first. Carry the full burst list through to the config's burst representation; drop the "only first burst imported" warning.
- **Serialize-side warnings: symmetric `warnings[]` on export.** Add a `*SerializeResult` shape (`{ text, warnings }`) returned by new `serialize*Document`-style entry points (or an opt-in `options.collectWarnings`) so config→format lossiness (a Flight feature the target format cannot express) is reported instead of silently dropped. Define `ParticleFormatWarning` in `@flighthq/types`.
- **Rename the parse-result naming nit.** `parse*ParticleDocument` returns `{config, document, warnings}` (a parse _result_), not a bare `*Document`. Settle on one canonical pattern — either rename to `parse*ParticleEffect` or name the return types `*ParseResult` — and apply it across all three formats for symmetry. Pre-release: do the rename now, no compat shim.
- **Package Map entry.** Add the one-line `@flighthq/particles-formats` entry to `tools/agents/docs/index.md` under the `@flighthq/particles` neighbor, mirroring the `spritesheet-formats`/`spritesheet` precedent the docs already cite.
- **Tests for every new export** (house rule: colocated `*.test.ts`, alphabetized `describe`). Round-trip tests for radial PD and multi-burst Unity; detection tests across all three formats plus a garbage input asserting the `null` sentinel.

### Silver

Competitive and solid: match what a well-regarded particle-format bridge offers — the dominant missing formats, a real dispatcher with format identity, batch/multi-emitter handling, and version awareness.

- **libGDX 2D Particle Editor (`.p`) format** — `parseLibgdxParticle`, `parseLibgdxParticleDocument`, `serializeLibgdxParticle`, `LibgdxParticleDocument`, `libgdxSchema`, `LibgdxParseOptions`/`LibgdxSerializeOptions`. The canonical open-source 2D particle format and native sibling of the already-supported Spine (shared Esoteric/libGDX lineage); highest-value single addition.
- **Starling / Sparrow PEX (`.pex`)** — `parseStarlingPex`, `parseStarlingPexDocument`, `serializeStarlingPex`, `StarlingPexDocument`, `starlingPexSchema`. Particle Designer's XML variant pervasive in the Starling/OpenFL world Flight targets. Factor the existing hand-rolled plist reader into a shared internal XML helper reused by both PD and PEX (no new dependency, still `sideEffects: false`).
- **Format registry + dispatcher.** Promote `detectParticleFormat`/`parseParticleConfig` into a real registry keyed by `ParticleFormatKind` string: `registerParticleFormat(kind, codec)`, internal `ParticleFormatCodec` contract (`detect`, `parseToConfig`, `parseToDocument`, `serialize`), so a custom/vendor-prefixed format (`'acme.Foo'`) can be added without touching the barrel. Last-write-wins, no registration at module top level — expose `registerParticleFormat` and let callers opt in.
- **Batch / multi-emitter handling.** Several formats carry an effect bundle or multiple emitters. Add `parseParticleEffectBundle(text, options?): ParticleEffectBundle` returning an ordered array of `{ name, config, document?, warnings }`, and `serializeParticleEffectBundle`. Define `ParticleEffectBundle`/`ParticleEffectEntry` in `@flighthq/types`. Single-emitter functions remain the fast path.
- **Version negotiation.** Read the version field where present (Spine, Unity) into the `*Document`, branch schema handling on it, and emit a `'version-unsupported'` warning (not a throw) for unknown future revisions parsed best-effort.
- **Texture/atlas reference surfacing.** Keep references as boundary strings, but expose them structurally: `getParticleFormatTextureReferences(document): ReadonlyArray<ParticleTextureReference>` so an asset pipeline can resolve/link them against `@flighthq/resources` without this package taking a resources dependency.
- **Pixi / Phaser web-emitter JSON** — `parsePixiParticle`/`serializePixiParticle` (pixi-particle-emitter config shape) and the Phaser particle-manager config. Web-first target makes these high-value; both are plain JSON, low-risk.
- **Cross-backend / cross-format consistency tests.** A shared fixture matrix asserting that a config round-tripped through each format and back preserves the features that format _can_ express, and that every feature it _cannot_ produces a serialize-side warning (closes the export-lossiness audit honestly).

### Gold

Authoritative / AAA: exhaustive format coverage, exhaustive in-format fidelity, performance, full error handling, and 1:1 Rust-port parity.

- **Effekseer (`.efk`/`.efkefc` JSON-exportable subset)** and **PopcornFX descriptor import** — the remaining professional-tier authoring tools; warn-and-drop only the genuinely unmappable node-graph features, with each named in `warnings[]`.
- **Lottie / After-Effects particle-ish layer import** (best-effort, where a layer maps to an emitter) — frontier coverage; explicitly scoped and documented as lossy.
- **Exhaustive Unity module coverage.** Convert (not warn) every module the parent particle simulation can represent: velocity-over-lifetime, force-over-lifetime, limit-velocity, noise (if `@flighthq/particles` grows a noise force), collision (`applyParticleCollisions` exists), texture-sheet animation (→ spritesheet/timeline linkage), sub-emitters (→ child `ParticleEffectBundle` entries). Each conversion lands a force/curve descriptor in `@flighthq/types` first. Shrink `UNSUPPORTED_UNITY_MODULES` to the genuinely-impossible residue.
- **Full PD/PEX fidelity.** Premultiply, blend-func exotic combinations, per-channel color variance, duration/lifespan variance, and emitter-shape variants all round-trip exactly; serialize emits byte-stable output diffable against the source tool's export.
- **`validateParticleFormatDocument(document, kind): ParticleConfigIssue[]`** — structural validation per format (mirrors the parent's `validateParticleEmitterConfig`), returning issue arrays (sentinels), not throws.
- **Strict vs lenient parse mode** — `options.strict` to escalate would-be-warnings into a returned `ParticleConfigIssue[]` for asset-pipeline CI gating, while default stays lenient/best-effort.
- **Performance & allocation discipline.** The fast `parse*` path stays single-pass and allocation-lean; document the allocation boundary; ensure the XML/JSON readers do not retain whole-document closures. Bench against large multi-emitter bundles.
- **Round-trip fuzz/property tests** per format (parse→serialize→parse fixpoint) and a corpus of real-world exported files from each authoring tool committed as fixtures.
- **Rust-port parity: `flighthq-particles-formats` crate.** 1:1 mirror — `parse_particle_designer_plist`, `parse_spine_particle`, `parse_unity_particle`, `detect_particle_format`, `parse_particle_config`, the registry, and the bundle API, conforming to upstream TS per the conformance map. Value-typed leaf (plain-data in/out), a strong _mixing_ candidate (a future `particles-formats-rs` wasm drop-in), and headlessly fingerprint-able against the TS fixtures. Record the crate in the conformance map and pair scenes by name.
- **Docs.** Per-format support matrix (feature → supported/lossy/dropped) generated from the warning tables, so the lossiness contract is documentation, not tribal knowledge.

## Sequencing & effort

Recommended order, dependencies, and items to surface rather than do autonomously.

1. **Bronze structural + ergonomics first (low effort, no cross-package risk):** Package Map entry, the `parse*ParticleDocument` rename, `detectParticleFormat` + `parseParticleConfig`, and serialize-side warnings (`ParticleFormatWarning`, `ParticleFormatKind` in `@flighthq/types` first). These are self-contained in this package + the types header and unblock everything downstream.
2. **Bronze fidelity (medium, one cross-package dependency):** Unity multi-burst import is local. **Particle Designer radial-emitter import depends on the `ParticleForce` representation in `@flighthq/particles`/`@flighthq/types`.** Per the depth review and house rules, radial/tangential-acceleration simulation touches the parent's force model — **surface as a cross-package suggestion/design decision** (does `ParticleForce` already carry radial+tangential, or must it be added?) before implementing. Do the local Unity work regardless; gate the PD radial work on that answer.
3. **Silver formats (medium-high):** libGDX `.p` then Starling `.pex` — the two highest-value missing formats given Flight's Spine support and OpenFL/Starling heritage; these two alone move the verdict toward authoritative. Factor the shared XML reader before adding PEX. Pixi/Phaser JSON after, since web-first.
4. **Silver infrastructure (medium):** the `registerParticleFormat` registry + `ParticleFormatCodec` contract (depends on `ParticleFormatKind` from step 1); then `ParticleEffectBundle` batch API (types-first in `@flighthq/types`); then version negotiation. The registry should land before or with the second/third format so each new format registers rather than being barrel-wired.
5. **Gold (high, long tail):** exhaustive Unity-module conversion and Effekseer/PopcornFX/Lottie each depend on the parent particle sim growing the matching force/collision/sub-emitter capabilities — **each is a cross-package design decision to surface, not an autonomous addition.** The Rust `flighthq-particles-formats` crate is the largest single Gold item but is independent of the TS frontier and can proceed in parallel once the TS API surface (through Silver) is stable; do it after the API has settled to avoid mirroring a moving target.

Cross-package / design-decision items to surface to the user (do not act autonomously):

- `ParticleForce` radial + tangential acceleration representation in `@flighthq/particles`/`@flighthq/types` (blocks PD radial import).
- Whether sub-emitters/texture-sheet/noise/collision conversions are in-scope for the parent sim (blocks the exhaustive-Unity Gold item).
- Whether a `@flighthq/resources` linkage step belongs here or in an asset-pipeline tool (Silver keeps it as boundary strings + structural surfacing only).

## Acceptance

- [ ] Shared types defined in `@flighthq/types` first
- [ ] `npm run check` passes
- [ ] `npm run packages:check` passes
- [ ] Colocated test per export (`npm run exports:check`)
- [ ] `npm run order` / `npm run api` clean
- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered

## Open questions

- _(none captured yet)_

## Agent brief

> Build `@flighthq/particles-formats` up to the **Bronze** tier per the Scope + Design above (the package exists — extend it). Define any new shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions. Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).
