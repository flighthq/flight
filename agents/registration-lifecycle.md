# Registration lifecycle — from an asset to the exact calls that draw it

**Status: unratified proposal. Raised and revised 2026-08-07.** Nothing here is implemented. Read it
before adding a requirements producer, a registries generator, or a CLI that emits registration calls.
Do not build on it as settled: the [names](#names--settled-and-one-root-word) are ruled, but the
importer-sink decision is provisional at the user's own marking and one question below is open.

Third of three documents on registration, and the one that spans the other two:

- [registration model](registration-model.md) — the **doors**. The two public entry points, the
  register-means-real-implementation rule, and what may go in a convenience bundle. Ratified.
- [registry table model](registry-table-model.md) — the **storage** beneath the doors. Table shapes,
  ownership tiers, and the derivation losses. Unratified, three blockers.
- this document — the **lifecycle** across both: how a file's contents become the specific `register*`
  calls an application writes, and why an agent would produce that instead of one bundled call.

The narrow question is what a queried asset emits and how that becomes source. The wider one: **a
registration is a fact derivable from content plus backend — so who derives it, and why does anyone
bother when a shotgun is one line?**

## What already exists, and what it is missing

The scene↔consumer seam is built and correct in shape. `getScene2DKindUsage` /
`getScene3DKindUsage` walk a scene and report plain kinds; `explainGlScene2DCoverage` and its eleven
siblings answer those kinds against a backend's registries and return `SceneCoverageEntry[]`. The rule
that makes it work is stated in `packages/types/src/Scene2DKindUsage.ts`:

> a scene knows WHAT is in it, and only the holder of a registry knows whether anything is bound to
> serve it, so this reports kinds and never verdicts

Four things are absent, and each is one stage of the lifecycle:

1. **The producer needs an asset, not a scene.** A usage walk takes a `Scene2D`, which means the
   importer is already wired before you can ask what to wire.
2. **Nothing serializes.** Both usage types are in-memory structs with no on-disk form, so no tool can
   carry an answer from a build step to a source file.
3. **Nothing maps a kind to the call that serves it.** `SceneCoverageEntry` names the failure
   (`{coverage, kind, registry}`) and stops there. The remedy — which registrar, from which module — is
   nowhere in the data.
4. **Nothing writes source.** The repo has no TypeScript generator at all; `order:fix` rewrites
   declaration order in place and is the closest thing to one.

## Four artifacts

### 1. The requirement set — what an asset needs

Producer vocabulary. No registry names, no backend token, no verdicts — the existing seam rule, kept.

**It is a type, not a file format.** Its runtime consumer is `explain*Coverage`, which answers "can this
backend draw the content that just loaded?" — entirely in memory. The generator merges requirements
across assets internally and never writes them out. Being plain data it *serializes*, and
`--emit-requirements` exposes that for inspection and for the case where a content pipeline and an app
build are genuinely separate stages; neither is the golden path.

```ts
interface Requirement {
  readonly facet: RequirementFacet;  // 'node-kind', 'shape-command', 'blend-mode', …
  readonly key: Kind;                // 'Shape', 'BeginFill', 'Multiply', …
}

interface RequirementSet {
  readonly covers: readonly RequirementFacet[];
  readonly requirements: readonly Requirement[];
}
```

**Flat facet+key, replacing the two struct-of-arrays types.** Three grounds, each answering a defect
visible in source today:

- **`covers` turns completeness into data.** `Scene2DKindUsage.ts:12` already carries this as a comment
  — *"Not yet reported: texture source kinds… a caller would read the absence as 'no resolver needed'"*.
  That is the right instinct recorded in the one place a machine cannot read. As a field it is checkable;
  as a comment it is a promise a walk can quietly break.
- **One shape for 2D and 3D.** The two usage types are separate structs with overlapping fields, so
  every tool that consumes both special-cases both. The *answer* half already unified —
  `SceneCoverageEntry` is shared, and its header says *"nothing about a coverage verdict differs by
  dimension."* The question half should follow.
- **Facets are open; struct fields are not.** Adding texture sources later adds a facet value, not a
  field, so a manifest written by an older build still parses.

**The cost, stated plainly:** a flat list loses compile-time field checking, which the structs have.
Mitigation is a generated `Facet` const object from a declared list — the shape `RenderRegistry` already
uses, and the generate-and-diff discipline `scripts/swf-capabilities.ts` already runs
(`npm run capabilities` writes `.json` + `.md`; `capabilities:check` regenerates in memory and fails on
drift). That is a working five-day-old precedent, not a new mechanism.

Facet ids are dot-namespaced and sorted, and the declared list must be able to name a facet no walk
currently emits — for the same reason `swf-capabilities.ts` states in its own header: a list derived from
what a walk emitted can only contain what was already found, which makes an unreported facet an absence
of evidence rather than a measurement.

### 2. The catalog — what serves a facet+key on a backend

The consumer half, and the one that must never be hand-written.

```json
{ "backend": "gl", "facet": "render-effect", "key": "BlurEffect",
  "registrar": "registerGlBlurEffect", "module": "@flighthq/effects-gl" }
```

**It is derived from source, and the derivation already exists.** `scripts/reachability-core.ts:151`
`registrationMaps()` walks a registrar body for a `CallExpression`, reads `arguments[1]` as the kind
string literal and `arguments[2]` as the implementation identifier, and compares both against a
name-derived expectation. Inverting it — recording the pair instead of verifying it — yields the catalog
with no new analysis technique, no annotation, and no table to drift. It reuses the same oxc parser, the
same `declarationsIn` walk, and the same package-to-module resolution.

Coverage is high by construction: the census in [registry table model](registry-table-model.md) counts
**219 of 295** registrars as exactly this single delegating statement.

**A registrar the walk cannot read is reported as uncatalogued, never silently omitted.** That is the
property that keeps the catalog honest as the codebase grows, and it applies steady pressure toward the
single-delegating-statement shape rather than letting an unreadable registrar disappear from the map.

### 3. The generated registries module — committed, readable source

`registries.gen.ts`, exporting `createGlRenderRegistries(state)`. The target output is not hypothetical;
it is already hand-written throughout the examples.
`examples/packages/adjustments/src/render.canvas.ts` is three registration lines derived from what that
scene uses:

```ts
registerRenderer(state, ShapeKind, defaultCanvasShapeRenderer);
registerRenderer(state, TextLabelKind, defaultCanvasTextLabelRenderer);
registerCanvasShapeCommands(state, [defaultCanvasBeginFill, defaultCanvasDrawRectangle]);
```

Generation writes that file instead of a person writing it. It is committed, reviewed, and diffed like
any source — see [No bundler plugin](#no-bundler-plugin-deliberately) for why it is not injected.

### 4. The remedy on a miss

`SceneCoverageEntry` gains `registrar` and `module`, both nullable. `null` is the reliable-negative case
[registration model §3](registration-model.md) already promises: *"If `registerCanvasSsaoEffect` and
`defaultCanvasSsaoEffectRunner` do not exist, canvas does not implement SSAO, and no call you could write
would unlock it."* A miss that can name its own repair is the mechanism the whole anti-shotgun argument
rests on — see [Why an agent reaches for it](#why-an-agent-reaches-for-it-instead-of-a-bundle).

## One command, and where requirements come from

The CLI surface is deliberately **one verb on the golden path**:

```
tool-registry generate assets/*.swf --backend gl -o src/registries.gen.ts
```

An earlier revision split this into `scan` (assets → `requirements.json`) and `generate`
(`requirements.json` → source). That was wrong on the criterion this whole document exists to serve: the
anti-shotgun argument rests on the correct path being **shorter than the bundled call**, and two commands
plus an intermediate file is a worse bet against one line of `registerEverything` than one command is. An
app has many assets and one registries module, so the merge across assets happens in memory. The
requirement set stays a type; `--emit-requirements` covers inspection.

### Where requirements come from — the importer sink

**Decision (provisional): the importer emits requirements through an optional sink. There is no
prescan.**

`collectImportDiagnostics` in `@flighthq/importdiagnostics` already proves the seam. A sink parameter is
threaded to each drop site; when no collector is engaged the cost is a single `undefined` check, and its
header states the contract: *"Engaging a collector is the ONLY thing that makes a parser record — the
default parse (no collector) stays near-free and records nothing."* A requirements sink is the same
shape at the same sites, so an importer answers what a document needs **as a byproduct of importing it**.

```ts
const requirements = collectScene2DRequirements((sink) =>
  createScene2DFromSwfDocument(bytes, diagnostics, sink),
);
```

The alternative — `prescanSwfRequirements(out, bytes)`, reading a file without importing it — costs a
second partial parser for **every** format and creates two code paths that can disagree about the same
file. It buys the ability to ask before wiring an importer, and neither timing that matters needs it:

- **Build time** — the scan runs inside a tool that imports with everything registered, where being fat
  is free and non-tree-shakable is the norm for the `tool-*` family.
- **Runtime, content arriving after build** — already answered by `has*Coverage` on the imported scene,
  which exists today.

Today's format detection is magic-byte matchers paired with parsers (`detectImageMimeType`,
`detectTextureAtlasFormat`, the `matches*Document` functions behind
`Scene2DDocumentImporterRegistry`). Those select *which* parser runs. They do not and should not report
what the content needs; that is the parser's knowledge.

**Why this is marked provisional:** the user selected it as the recommended option while noting the
proposed call shape was not legible to them at the time of the ruling. The reasoning above stands on its
own, but the decision should be re-confirmed against this written form before anything is built on it.

### Resolution — requirement set × catalog × backend to source

Mechanical: resolve each requirement through the catalog for the target backend, collect the distinct
`(module, registrar)` pairs, emit imports and calls. A requirement with no catalog entry is a hard error
naming the facet and key, not a silent omission — the same rule as an uncatalogued registrar, applied at
the other end.

### check — regenerate in memory, diff, fail

`capabilities:check` and `support:check` are the pattern, and both are already wired into
`npm run check`. Nothing new is needed to make a stale registries module a build failure.

## Why an agent reaches for it instead of a bundle

This is [Blocker 2 of the registry table model](registry-table-model.md#blockers) and it is the only part
of this lifecycle with no worked design. It is also the part the rest is for.

**An agent takes the shortest path from *symptom* to *green*.** The symptom is a blank screen. Today the
shortest path is one bundled call, and being architecturally better is not an input to that choice — the
correct path has to be *shorter, measured from the symptom*. Three things, and all three are required:

1. **The miss prints the fix.** With `registrar` and `module` on the entry, a guard line is a paste-able
   import and call. One paste beats discovering that a bundle exists.
2. **The miss names the command.** The generator has to appear in the guard output. A CLI an agent
   learns about from `AGENTS.md` is a CLI it does not use, because it never reads that section while
   chasing a blank screen. The failure is the only reliable delivery mechanism.
3. **The bundle must not be there to reach for.** The codebase both forbids the pattern and practises
   it: `registerBuiltInGlModifierSnippets` is in `examples/packages/awd2loading/src/render.webgl.ts`
   right now, and it grows behind the caller's back every time a modifier is added. While it exists it
   is one line and correct wiring is N. Remove the grow-behind-your-back bundles and the shotgun costs
   46 hand-written lines — strictly more work than one command.

**The acceptance test is behavioral, not structural.** Hand an agent a broken example and no
instructions, and see whether it produces minimal wiring. If it still reaches for a bundle, the design
failed regardless of how clean the types are. No amount of type-level correctness substitutes for
running this.

## No bundler plugin, deliberately

A plugin that injects registrations at build time is `displayObject.filters` for wiring — the
[anti-goal](anti-goals.md) exactly: hidden state applied on the caller's behalf, at a moment the caller
did not name. It also defeats every property the generated file has. Committed source is reviewable in a
diff, greppable, tree-shakes with no help from the bundler, and works in every toolchain including none.

The one thing a plugin might buy — failing the build on stale wiring — is `catalog:check` in
`npm run check`, using machinery that already exists.

## Cells this needs

| Cell | Kind | Why |
|---|---|---|
| `@flighthq/registry` | new SDK package | table storage (the [registry table model](registry-table-model.md) proposal) plus `RequirementSet` construction, merge, and diff |
| `@flighthq/tool-registry` | new `tool-*` package | `generate` and `check`; outside the SDK barrel, non-tree-shakable, `bin` entry. Pairs with `@flighthq/registry` exactly as `@flighthq/tool-capture` pairs with `@flighthq/capture` — the existing precedent for a `tool-X` CLI over an SDK `X` |
| `scripts/catalog.ts` | script | catalog generation from source, plus `catalog:check` |
| `scene2d` / `scene3d` `sceneKindUsage.ts` | edit | facet emitter replacing the struct walk |
| the `*-formats` cells | edit | requirements sink at the sites that already carry the diagnostics sink |
| `types` + the twelve `explain*` functions | edit | `registrar` / `module` on `SceneCoverageEntry` |

One new SDK package, one new tool package, one script. No new format packages and no prescan packages —
that is what the sink decision buys.

## Build the generator first

[Blocker 3 of the registry table model](registry-table-model.md#blockers) says the census is not safe to
migrate on and demands *"a generated ownership inventory or a derivation-invariant test."*

**The catalog generator is that inventory.** It produces `(registrar → door → kind → package)` for all
295 registrars by derivation rather than by hand scan, which is the thing two hand scans have already
been shown to get wrong. So it is not the last stage of this lifecycle — it is the first piece of the
whole registry arc, it retires Blocker 3, and it is independently useful even if the storage design
changes underneath it.

Nothing else here should start before it reports real numbers.

## Names — settled, and one root word

Ruled by the user 2026-08-07. One root across the whole ladder, and **`wire` / `wiring` appears nowhere
in the design** — not as an aggregate, not as a package, not as a generated filename:

| Slot | Name |
|---|---|
| package (storage) | `@flighthq/registry` |
| aggregate | `GlRenderRegistries` / `CanvasRenderRegistries` / `WgpuRenderRegistries` |
| members | `KeyedTable` / `SlotTable` / `OrdinalTable` |
| CLI package | `@flighthq/tool-registry`, bin `tool-registry` |
| generated file | `registries.gen.ts`, exporting `createGlRenderRegistries(state)` |

`Registries` is accurate to the structure — the aggregate is a struct of tables and each table *is* a
registry — where `Registrations` names the entries inside them, a different noun. The CLI pairing needs
no invention: `@flighthq/tool-capture` over `@flighthq/capture` is the existing precedent for a `tool-X`
CLI driving an SDK `X`, down to the bin name.

**This supersedes the aggregate-name open question in
[registry table model](registry-table-model.md#open-questions), and that entry's supporting figures
should be corrected rather than merely dropped.** It rejects `Wiring` on the grounds that *"`wireframe`
appears 296 times"* against 124 `wiring` uses in 96 files. Those numbers do not reproduce: measured
2026-08-07 across `.ts` and `.md` excluding `dist/` and `node_modules/`, `wiring` is 240 lines in 155
files and `wireframe` is 102 in 35 — the ratio inverted. Source-only (`packages/*/src`) it is `wiring` 27
/ `wireframe` 56, so wireframe does lead there, but at a fifth the stated magnitude. The decision above
does not rest on either count, which is why it stands regardless; the figure is flagged because it is
recorded as fact and was load-bearing for a naming argument.

## Open questions

- **Does the catalog ship to end users?** Not ruled. Shipping it inside `@flighthq/tool-registry` means a
  consumer with an asset and no Flight checkout can run the tool, which is the only version that helps
  someone hitting a blank screen in their own app. Repo-internal (`agents/registry-catalog.json`, beside
  `support-matrix.json`) is simpler and matches the `swf-capabilities` precedent, but helps only people
  working in this repo. No longer blocked on naming.
- **Does the facet vocabulary cover non-render registries?** The ~65 tables include decompressors,
  importers, and joint solvers. [registry table model](registry-table-model.md) already asks whether
  `Satisfied` / `Fallback` / `Missing` generalize; the facet list inherits that question.
- **Re-confirm the importer-sink decision** against the written form above, per the provisional marking.
