# Registration lifecycle — from an asset to the exact calls that draw it

**Status: unratified proposal. Raised and revised 2026-08-07.** Nothing here is implemented. Read it
before adding a requirements producer, a registries generator, or a CLI that emits registration calls.
Do not build on it as settled: the [names](#names--settled-and-one-root-word) are ruled, but the
importer-sink decision is provisional at the user's own marking and one question below is open.

**Scoped authorization (2026-08-10): Stage 1 of the registrar ownership-inventory program may build on
this document; no later stage or other unratified proposal is authorized.**

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

This document's “registration” means build-time renderer/catalog linking. OS-global Shortcut
registration is a different lifecycle: since 2026-08-30 it is an awaited runtime trigger subscription
owned by a `GlobalShortcut` Entity, exact provider, and opaque token. It is not catalogued, generated,
enumerated, or last-write-wins; same-chord acquisition is serialized and teardown is creator-pinned.

## The frame: this is linking

The clearest statement of what these pieces are, and the one that decides most of the arguments below:

| linker | here |
|---|---|
| undefined symbol references in an object file | the **requirement set** an asset produces |
| the symbol table | the **catalog** of what each registrar binds |
| resolution — match references to definitions, pull in only those | **codegen** emitting exactly the calls the content needs |
| `--whole-archive` | `registerEverything` |

The analogy is load-bearing, not decorative. It settles three things at once:

- **Nobody hand-maintains a symbol table.** The catalog is generated, never declared — see
  [Built-in entries are generated](#built-in-entries-are-generated).
- **Minimal is the default and inclusion is earned.** A compiler does not link every translation unit
  because linking selectively is inconvenient. Registration should not either. "Just make it work"
  is the same instinct as making tree-shaking opt-in.
- **Resolution is a pure function over two tables.** That is why the emitter is an SDK function and not
  a script — see [Cells this needs](#cells-this-needs).

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

The consumer half, and the symbol table of the analogy above.

```ts
// One public call that can satisfy a catalog entry.
interface CatalogRegistration {
  readonly module: string;           // '@flighthq/effects-gl'
  readonly registrar: string;        // 'registerGlBlurEffect'
}

// Diagnostics define this consumer-shaped contract. An inventory walk, invariant probe, or caller can
// all produce it without exposing the instrument's own row shape through every explain* signature.
interface CatalogEntry {
  readonly kind: Kind;                // 'BlurEffect'
  readonly registry: RenderRegistry; // 'EffectRunner'
  readonly registrations: readonly CatalogRegistration[];
}

type SceneCoverageCatalog = readonly CatalogEntry[];
```

**A key does not map to one registrar, and assuming it did was a defect.** `tools/harness/canvas.ts`
already shows the counter-example in working code: satisfying `ShapeKind` on canvas takes *two* calls —
the renderer and the shape-command set — and `Scale9ShapeKind` takes its own renderer plus the same
commands. A single `registrar` field cannot express that, so the emitter would have produced a scene that
draws nothing while reporting full coverage. Ordering is part of the entry, not an emitter convention.

**It is an open, caller-owned registry, not a static table.** This is not a preference — it is forced by
the rule in [AGENTS.md](../AGENTS.md): *"Prefer an open registry over a closed `switch (kind)` … so users
add their own (vendor-prefixed) kinds."* A consumer who ships `acme.Kaleidoscope` with
`registerAcmeKaleidoscope` must be able to add an entry, or their asset scans clean, resolves to nothing,
and codegen errors on content that works. A catalog baked into this repo's build cannot serve them, which
is why the catalog is an SDK package and not a script output. `Scene2DDocumentImporterRegistry` is the
shape: `create*`, `register*`, caller-held, no module global.

Flight's own built-ins are entries in that registry like any other — they are simply
[generated](#built-in-entries-are-generated) rather than typed by hand.

**Form: TypeScript is canonical; JSON is available on demand and never committed.** The catalog is plain
data, so any of JSON, TOML, or YAML would carry it. Two consumers decide it:

- **The port.** TypeScript is lowered to Haxe and Rust with the rest of the source, so a `.ts` catalog
  arrives in each target as a native const with no parser in the build. A data file needs a reader
  written once per target.
- **The guard layer.** The [remedy on a miss](#4-the-remedy-on-a-miss) is a *runtime* read — naming
  `registerGlBlurEffect` in a warning requires reaching the catalog at warn time. Diagnostics are opt-in
  and separately importable, so it must shake out of a build that never enables guards; a const shakes,
  a JSON import is a bundler-configuration question that does not.

`tool-registry catalog --json` dumps the same data for external tooling. Nothing is committed in that
form, so there is no second artifact to drift — but the dump path is exported surface and carries its own
test.

#### Built-in entries: derived where source states the binding, declared where it does not

**Not every family is derivable, and assuming otherwise was the first revision's largest error.** The two
halves are split by one test — *does any statement in source pair this kind with this implementation?*

##### Derived — the 219 delegating registrars

**The derivation already exists.** `scripts/reachability-core.ts:151`
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

##### Declared — node renderers, because source never states them

**There is no per-kind node-renderer registrar, no built-in table, and therefore nothing to read.** The
only door is the generic `registerRenderer(state, kind, renderer)`, and the pairing
`ShapeKind → defaultCanvasShapeRenderer` exists **only at application call sites**. `renderer.ts:46`
states the refusal as a design position:

> The registry stays open and tree-shakable: only the renderers the caller references are pulled in —
> there is no "register all built-ins" set, which would force every renderer into the bundle.

That rule is right and is not up for revision. Its consequence is that the knowledge of what a kind's
default renderer *is* lives in examples and in people's heads, nowhere a tool can read.

**Name derivation cannot rescue it.** Pairing `default{Backend}{X}Renderer` with `{X}Kind` breaks on the
canvas list's own entries: `defaultCanvasRenderCacheRenderer` is registered through
`registerRenderCacheRenderer(state, renderer)`, a different door taking no kind at all, and
`defaultCanvasMorphShapeRenderer` is an alias of `defaultCanvasShapeRenderer`. Unlike the derived half,
there is no body to confirm a guess against — so a name scan is a guess wearing a check's clothing, and a
wrong entry generates a wrong call, which is worse than no entry.

**Rejected: adding per-kind wrappers so source would state it.** `registerCanvasShapeRenderer(state)`
wrapping the generic door would make the whole catalog derivable and close the door-1 asymmetry node
renderers have (effects have both public doors; node renderers only ever had door 2). It was rejected on
two grounds, and the cost comparison does not favour it either — there are 39 renderer constants across
the four 2D backends, against 39 declared rows:

- **It is a second string-derivation rule, and it needs exceptions immediately.** `RenderCache` uses a
  different door and `MorphShape` is an alias, so 1 of canvas's 9 breaks the rule outright.
  `backend-prefix:check` already carries an `ALLOW` list for exactly this class of fragility.
- **A uniform-looking family sets an expectation the project deliberately breaks.** `registration-model.md`
  §6 establishes that DOM's batch exclusions are declared positions, not roadmap — the canvas and DOM
  leaf sets differ by identity, not by one being behind. A blanket convention makes a missing
  `registerDomTilemapRenderer` read as an oversight rather than a decision.

Declared rows avoid both: no naming rule, and a backend's gap is an absent row rather than an absent
member of an expected series. They also concentrate 39 entries into four files instead of 39 sites.

**What the check can and cannot verify here.** It confirms every declared entry names a symbol that
exists and is exported on the named module's lane — which catches renames and deletions, the rot that
actually happens. It cannot confirm the pairing is semantically right; `ShapeKind` bound to the tilemap
renderer would pass. That failure is caught by the first thing that renders — which the
[generated examples](#the-examples-are-the-prior-art-and-they-currently-teach-the-shotgun) turn from a
hope into a mechanism. The catalog must record which half each entry came from, so a reader knows which
guarantee applies.

##### This half already exists, hand-written, four times

**`tools/harness/{canvas,dom,webgl,webgpu}.ts` are the declared node-renderer catalog.** Not an analogue
of it — the thing itself, in production, exercised by every functional test:

```ts
for (const kind of options.kinds ?? []) {
  if (kind === ShapeKind) {
    registerRenderer(state, ShapeKind, defaultCanvasShapeRenderer);
    registerCanvasShapeCommands(state, [...defaultCanvasShapeCommands, ...defaultCanvasTextureShapeCommands]);
  } else if (kind === RichTextKind) {
    registerRenderer(state, RichTextKind, defaultCanvasRichTextRenderer);
  } else if (kind === QuadBatchKind) {
    registerRenderer(state, QuadBatchKind, defaultCanvasQuadBatchRenderer);
  } // …
}
```

The loop over declared kinds is the resolution step; the chain is the table. Three things follow:

- **The bindings are already written down and already verified by rendering.** Extracting them into
  `@flighthq/registry-catalog` is a move, not an invention, and the risk is correspondingly low.
- **It is a closed `switch (kind)` chain, duplicated four times**, which is the shape
  [AGENTS.md](../AGENTS.md) explicitly warns against: adding a kind means four hand edits, and a consumer
  cannot extend it at all. That is the drift this proposal exists to end, sitting in the tool that
  validates everything else.
- **The harness demonstrates the shotgun too.** Three `registerCanvas*TextureResolver` calls run above
  the loop, unconditionally, regardless of what the target declared.

This makes the [first prototype](#build-the-generator-first) concrete and cheap: replace the four chains
with catalog lookups. The code exists, every functional baseline covers it, and a catalog that cannot
reproduce it fails as red baselines rather than as an argument.

#### How the generated half is written

**The generator writes package source**, and `catalog:check` regenerates in memory and fails on drift —
the `support.ts` and `swf-capabilities.ts` mechanism, pointed at `packages/registry-catalog/src/`
instead of at `agents/`. This is the repository's **first generated `.ts` inside a package**, and the
novelty is deliberate rather than overlooked:

- Declaring what source already states — a hand-written list the script only *verifies* — matches
  existing convention but fails on the criterion this document is built around. Keeping 219 entries
  current by hand is friction on the person adding a registrar; they skip it, the catalog goes stale,
  codegen errors on a kind that genuinely works, and the fastest repair is the bundle. **A declared list
  regenerates the exact failure mode the design exists to remove**, one level up: not an agent reaching
  for the shotgun while using the system, but a maintainer making the shotgun necessary while extending
  it. That argument is why the derivable half is derived — and why the declared half is kept to the 39
  rows where source states nothing, rather than allowed to grow.
- The convention it breaks has no reason behind it here. Package source is hand-authored because nothing
  has needed generating, not because generating is forbidden.
- And nobody hand-maintains a symbol table. See [the frame](#the-frame-this-is-linking).

What the novelty costs, and must be handled rather than discovered: the file carries a
`GENERATED … DO NOT EDIT` header like `capabilities.md` already does; the generator emits in sorted
order so `order:fix` is a no-op over it; and `exports:check` wants a colocated test, which asserts shape
invariants over the whole table rather than one case per entry.

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

`SceneCoverageEntry` is a remedy-discriminated union. `Unregistered` and `FallbackRemediable` require
both `registrar` and `module`; `Unavailable`, `FallbackUnavailable`, and `Satisfied` expose neither.
There is no nullable remedy pair. The strict definition of an unavailable result is: **no call you
could write would unlock it.** This is the reliable-negative case [registration model §3](registration-model.md)
already promises: if `registerCanvasSsaoEffect` and `defaultCanvasSsaoEffectRunner` do not exist, Canvas
does not implement SSAO. A miss that can name its own repair is the mechanism the whole anti-shotgun
argument rests on — see [Why an agent reaches for it](#why-an-agent-reaches-for-it-instead-of-a-bundle).

**States are distinguished by whether remedies differ, not why they arose.** Three instances pin the
rule down:

1. A caller who forgot a registration and a caller who deliberately did not opt into the same feature
   can write the same registration call. Both receive `Unregistered`, regardless of intent.
2. A missing authored renderer that falls back to a standard renderer is `FallbackRemediable` when the
   catalog names the authored renderer's registrar, and `FallbackUnavailable` when no such call exists.
   The visual downgrade is the same; the remedy is not.
3. A missing `ShadedMaterial` texture lister is `Unregistered` with
   `registerShadedScene3DMaterialTextures`. A missing `BlinnPhongMaterial` lister is `Unavailable`
   because no call in the SDK can install one. Calling both "deliberate boundaries" would erase the
   actionable distinction.

Each `explain*` function takes the complete backend-specific `SceneCoverageCatalog` explicitly. Its
package-private lookup reads the first ordered registration as the primary remedy; separately imported
guards may display the full ordered list. The `has*` functions stay catalog-free because they answer
only whether the live registry serves the requirement.

### When a vocabulary collapses two meanings — the canonical test

Two of this document's states and one instrument outside it exist because a single symbol was carrying
two meanings with different consequences. The question of whether to split a vocabulary or delete part of
it comes up repeatedly and has been answered inconsistently, so the test is stated once, here, and
referenced from elsewhere rather than restated:

1. **Is each collapsed meaning a legitimate state of a correct system?** If one is not, **delete it rather
   than name it** — a leftover is not a state, and naming it makes a bad state legible when it should be
   made unrepresentable.
2. **If both are legitimate: do their remedies differ?** Different remedies → **split**. Same remedy →
   **one state**, because a distinction the reader cannot act on is noise that dilutes the ones they can.

Worked instances, which is why this reads as three unrelated rulings without the test:

- **`⊘` in the support matrix** — collapsed *declared control* with *orphaned capture*. Step 1 stops it:
  an orphaned fingerprint is a leftover, not a state a correct tree has. So `support:check` fails on it
  and the glyph stays single, unambiguously meaning declared-control. See
  [capture verification tiers](capture-verification-tiers.md).
- **The retired `Missing` in `SceneCoverage`** — collapsed *no registrar exists anywhere* with *a registrar
  exists and this backend has none bound*. Both are legitimate states. Step 2 split them into `Unavailable`,
  answered by "this backend does not implement it, no call unlocks it," and `Unregistered`, answered by the
  exact [remedy](#4-the-remedy-on-a-miss) — different repairs, so different states.
- **The retired bare `Fallback`** — read as one state on the first pass, on the reasoning that every way to
  arrive at it shares the remedy *register this kind's own implementation*. That reasoning was wrong, and
  the same test caught it: the remedy exists only when a registrar does. Step 2 split it into
  `FallbackRemediable` and `FallbackUnavailable`. The visual downgrade is identical in both, which is
  exactly why the test asks about remedies rather than about symptoms.

The two steps are ordered on purpose. Asking "do the remedies differ" first invites naming a state for a
condition that should not exist at all, which is how a leftover acquires a vocabulary entry and then a
reader who trusts it.

### Evidence rules beside the remedy

Three rules govern how an instrument may support this remedy:

1. **A finding about an instrument is not a finding about its subject.** The named instances are
   foreman's reading of the syntax recorder's 172, manager's bucket-5 body count, and principal's
   181-function grep: each accurately described what its instrument selected and was overread as a fact
   about registrars. A vantage point is also an instrument: an agent could see unnamed per-recipient
   send slots and inferred that retention prevented parcel reconciliation, while the host-owned
   `meta.yaml` records already carried the parcel identities needed to reconcile them. A correct grep
   can still be over-read: finding `mesh-legacy-fixtures` in an oracle and its test proved that the
   consumer names the pack, while the test's asserted `NOT-RUN` path against an empty directory showed
   that it did not prove the pack was present or fetched. Verifying that cited text says what was quoted
   is likewise distinct from verifying the claim the citation was offered to support. Commit reachability
   is another instrument, and its inverse failure is easy to miss: builder found `f9b7efac5` unreachable
   after a rebase had re-minted the SHA, but a content check found both the end-to-end test and its
   `requestfailed` handlers under a different hash. A green run does not prove named content survived,
   and an unreachable hash does not prove the content is absent; both directions require a content check.
   The base SHA is likewise a required subject-control for any absence claim about someone else's code.
   Builder derived this after a valid grep control proved the grep worked but could not prove their tree
   was current; manager independently derived the same rule from trusting that result because its
   instrument had a control. Their two readings name the distinction: a valid instrument-control does
   not substitute for the base-SHA control that establishes which subject was actually inspected. The
   same mismatch can occur inside a text check: foreman verified that four Markdown row markers appeared
   in order, while principal caught that the needed property was adjacency. Ordered markers can still
   have an intervening blank line that breaks the table; only consecutive line numbers prove the stronger
   claim.
2. **States are distinguished by whether their remedies differ, not by why they arose.** The named
   instances are `SceneCoverage.Missing`, the `⊘` orphan, and `ContributedNothing` versus
   `ObservedNothing`. Collapsing either pair erases the action a caller should take.
3. **When instruments overlap, state whether their blind spots are shared or different.** Reachability
   and the registrar probe both omit the Source/Backdrop family for unrelated selector reasons; that is
   a shared coverage gap and makes the omission durable. The static top-level-side-effect scan and the
   runtime empty-at-import assertion fail differently; that is genuine defence in depth.

### When a vocabulary collapses two meanings — the canonical test

Two of this document's states and one instrument outside it exist because a single symbol was carrying
two meanings with different consequences. The question of whether to split a vocabulary or delete part of
it comes up repeatedly and has been answered inconsistently, so the test is stated once, here, and
referenced from elsewhere rather than restated:

1. **Is each collapsed meaning a legitimate state of a correct system?** If one is not, **delete it rather
   than name it** — a leftover is not a state, and naming it makes a bad state legible when it should be
   made unrepresentable.
2. **If both are legitimate: do their remedies differ?** Different remedies → **split**. Same remedy →
   **one state**, because a distinction the reader cannot act on is noise that dilutes the ones they can.

Worked instances, which is why this reads as three unrelated rulings without the test:

- **`⊘` in the support matrix** — collapsed *declared control* with *orphaned capture*. Step 1 stops it:
  an orphaned fingerprint is a leftover, not a state a correct tree has. So `support:check` fails on it
  and the glyph stays single, unambiguously meaning declared-control. See
  [capture verification tiers](capture-verification-tiers.md).
- **`Missing` in `SceneCoverage`** — collapses *no registrar exists anywhere* with *a registrar exists and
  this backend has none bound*. Both are legitimate states. Step 2 splits them: the first is answered by
  "this backend does not implement it, no call unlocks it," the second by the exact
  [remedy](#4-the-remedy-on-a-miss) — different repairs, so different states.
- **`Fallback`** — already correctly one state under the same test. Every way to arrive at it has the same
  remedy: register this kind's own implementation.

The two steps are ordered on purpose. Asking "do the remedies differ" first invites naming a state for a
condition that should not exist at all, which is how a leftover acquires a vocabulary entry and then a
reader who trusts it.

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

### Two producers: an asset is scanned, a programmatic scene is declared

**Not every scene comes from a file, and the first revision assumed one did.** An openfl-samples or
awayjs port loads a SWF or a glTF and there is an asset to read. An example that constructs
`createShape()` and a `QuadBatch` in code has no asset, no importer, and therefore no sink to fire.

The two families differ **only in who produces the requirement set**. Everything downstream — catalog,
resolution, emission — is identical.

| scene | requirements come from |
|---|---|
| format port (SWF, glTF, SVG, Lottie) | the [importer sink](#where-requirements-come-from-the-importer-sink), derived while parsing |
| constructed in code | the author's declaration |

**A programmatic scene declares, and it already does.** `createFunctionalTarget({ kinds: [ShapeKind] })`
in `tools/harness/target.ts` is a requirement set written by hand, in use across every functional scene.
The pattern needs generalizing, not inventing.

**Rejected: deriving requirements by static analysis of example source.** Reading `new QuadBatch()` out
of a `.ts` file to infer `QuadBatchKind` is the same unsound move as
[name-derivation](#declared--node-renderers-because-source-never-states-them): a scene built in a loop,
from data, or behind a condition is invisible to it, and a wrong answer emits a wrong call. For a
constructed scene the requirements are a fact about *intent*, and a declaration states intent honestly
where a source scan guesses at it.

**But a declaration can be checked, and should be.** `getScene2DKindUsage(usage, scene)` walks a *built*
scene and needs no render state, so a harness can build, walk, and fail when the walk finds a kind the
declaration omitted. That is the same declare-then-verify pairing that makes the derived half
trustworthy, applied to the half source cannot state.

Its limit is honest and belongs in the record: **a walk is a snapshot.** A kind that first appears on
frame 300, or only when a branch is taken, escapes it. That tail is what the runtime guard and its
[remedy](#4-the-remedy-on-a-miss) exist to catch — the two halves are complementary, and neither alone
is sufficient.

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
`(module, registrar)` pairs, emit imports and calls.

**An unresolved requirement is two different conditions and they must not share a response.** Both look
like a lookup returning nothing:

- **No backend serves the key.** The catalog is stale, or a consumer forgot to register their own kind.
  A **hard error** naming the facet and key — the same rule as an uncatalogued registrar, applied at the
  other end.
- **This backend does not serve a key another one does.** Canvas has no `SsaoEffect`; that is
  [registration model §3](registration-model.md)'s reliable negative, and the content genuinely cannot
  draw here. **Reported, never fatal.**

The catalog distinguishes them without carrying explicit negative knowledge: if any backend serves the
key, absence on this one is a real negative. Collapsing the two makes every Canvas app whose content
mentions SSAO fail to generate.

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

## Shadowing — generated is not final

**Requirement, raised by the user 2026-08-07: wire from asset A, then override the realization for one
kind.** Generation that cannot be overridden is worse than no generation, because the escape hatch
becomes editing a file the next run overwrites.

Three tiers, and only the last one works today:

1. **Catalog** — "in this app, `ShapeKind` resolves to `acmeShapeRenderer`," so codegen *emits* the
   override. Works by construction: the catalog is an open registry and registration is last-write-wins.
2. **Module** — the generated file stays pure and is never hand-edited; overrides are ordinary calls
   after it. This makes call order contractual, which nothing currently states.
3. **Runtime** — `registerRenderer` is already last-write-wins, so a later call shadows an earlier one.

```ts
createGlRenderRegistries(state);                       // generated — regenerable, never hand-edited
registerRenderer(state, ShapeKind, myShapeRenderer);   // hand-written — survives regeneration
```

**Tier 3 is blocked on [Blocker 1 of the registry table model](registry-table-model.md#blockers), and
this raises that blocker's priority.** Last-write-wins isolates only while each state owns its tables.
The storage proposal *shares* tables by reference — at which point overriding on a derived state mutates
the state it was derived from, and there is no tombstone to express "omit this one here." Blocker 1 was
recorded as an internal correctness problem; it is really the question of whether the headline use case
above works at all.

## The examples are the prior art, and they currently teach the shotgun

**Ruled by the user 2026-08-07: example wiring is generated, except for a named set that deliberately
demonstrates something else.**

An agent looking for how to wire something does not read this document. It greps the examples. There are
**132 `render.*.ts` files carrying roughly 700 registration calls**, and that corpus is the most
available prior art in the repository. Measured 2026-08-07:

| calls | symbol | teaches |
|---|---|---|
| 203 | `registerRenderer` | the generic door, kind and renderer by hand |
| 139 | `registerCanvasShapeCommands` | a caller-named array — the sanctioned bag |
| 39 | `registerStandardGlTextureResolvers` | **a bundle** |
| 14 | `registerStandardWgpuTextureResolvers` | **a bundle** |

**53 call sites demonstrate the shotgun.** A better diagnostic competes against 39 worked examples saying
otherwise, and loses. This is why [why an agent reaches for it](#why-an-agent-reaches-for-it-instead-of-a-bundle)
cannot be solved at the error message alone: the corpus is the teacher.

Generating example wiring from the catalog changes three things at once:

- **The default lesson inverts.** Copying an example copies the minimal path.
- **The capture suite becomes the catalog's correctness oracle.** This is what closes the gap left open
  in [the declared half](#declared--node-renderers-because-source-never-states-them): a check cannot
  confirm `ShapeKind → defaultCanvasShapeRenderer` is the *right* pairing, but an example generated from
  that row and rendered into `test:functional:regression` can. The committed baseline is evidence
  external to the catalog, so this is verification and not circularity.
- **`npm run size` becomes a minimality gate on codegen.** Examples are what the size baseline measures,
  so over-registration shows up as bundle growth against the tool's central promise.

**The named hand-wired set is not an exemption, it is a second curriculum.** Some examples exist to
demonstrate door 2, custom vendor-prefixed kinds, overriding a built-in realization, or deliberately
tree-shaken imports — all sanctioned, none of them the golden path. Marking them makes the corpus
self-describing about which door each example teaches, which it is not today.

**The gap this leaves, which must be measured rather than assumed.** Examples exercise only the SKUs they
use. A catalog aiming at every SKU will name many no example reaches, and that tail carries no rendering
evidence. `scripts/swf-capabilities.ts` states the same hazard for its own list — *"a list derived from
what a walk emitted could only ever contain what was already found, which would make the unexercised
bucket an absence of evidence rather than a measurement."* The answer is a generated SKU-coverage report,
declared against exercised, shaped like `agents/packages/swf/fixture-evidence.md`.

## The laundering test — data is not the deliverable

**The lifecycle is done when a call executes. Everything before that is bookkeeping about a problem
nobody has solved yet.** An asset says it needs a blur; a requirement set says a blur is needed; a
catalog says blurs are served by `registerGlBlurEffect`. Not one of those has registered anything. A
design that stops at any of them has moved the problem into a nicer file, not fixed it — and each of
those intermediate artifacts is individually reasonable enough to be mistaken for progress.

So every stage answers to one question: **does this end in a call?**

```ts
// src/registries.gen.ts — the terminal artifact, generated and committed
import { registerGlBlurEffect } from '@flighthq/effects-gl';
import { registerRenderer } from '@flighthq/render';
import { defaultGlShapeRenderer } from '@flighthq/scene2d-gl';

export function createGlRenderRegistries(state: GlRenderState): void {
  registerRenderer(state, ShapeKind, defaultGlShapeRenderer);
  registerGlBlurEffect(state);
}
```

Three consequences, and they are constraints on anything built here:

- **`--emit-requirements` is never the golden path.** It is a debugging affordance. A workflow whose
  normal output is a manifest has laundered the problem, which is why the CLI collapsed to
  [one command](#one-command-and-where-requirements-come-from).
- **The generated module still has to be called**, and that is the one place this can quietly fail: you
  run the generator, commit the file, forget the `createGlRenderRegistries(state)` line, and you are back
  at a blank screen holding a file that describes the fix. One explicit call is the design and not a gap
  — Flight prefers spelling registration out — but *nothing currently notices its absence*. A generated
  module that is never imported must be a check failure, not a silent no-op.
- **A remediable miss must name a call, not a condition.** The retired
  `{coverage: 'Missing', kind: 'BlurEffect'}` shape was only a fact
  about the world. `registerGlBlurEffect` from `@flighthq/effects-gl` is a thing to do. Only the second
  is worth the diagnostics machinery, which is why [the remedy](#4-the-remedy-on-a-miss) is a field and
  not a doc paragraph.

## No bundler plugin, deliberately

A plugin that injects registrations at build time is `displayObject.filters` for wiring — the
[anti-goal](anti-goals.md) exactly: hidden state applied on the caller's behalf, at a moment the caller
did not name. It also defeats every property the generated file has. Committed source is reviewable in a
diff, greppable, tree-shakes with no help from the bundler, and works in every toolchain including none.

The one thing a plugin might buy — failing the build on stale wiring — is `catalog:check` in
`npm run check`, using machinery that already exists.

## Cells this needs

**Each stage is an SDK package. The CLI holds only what cannot be anything else.** The first revision put
the catalog in `scripts/` while citing `@flighthq/capture` as the precedent for the CLI's name — but that
package's own description is *"render capture verification policy **and baseline format**"*. The format is
the SDK cell; the tool is a shell over it. A catalog is a format.

| Cell | Kind | Owns | Precedent |
|---|---|---|---|
| `@flighthq/requirements` | new SDK package | the sink, `collectScene2DRequirements`, `RequirementSet` merge/diff, the declared facet vocabulary | `@flighthq/importdiagnostics` — same sink shape, same collector, `deps: types only` |
| `@flighthq/registry` | new SDK package | `KeyedTable` / `SlotTable` / `OrdinalTable`, `GlRenderRegistries` (the [registry table model](registry-table-model.md) proposal) | — |
| `@flighthq/registry-catalog` | new SDK package | `CatalogEntry`, the open catalog registry, the generated built-in entries, and the ~39 declared node-renderer rows | `Scene2DDocumentImporterRegistry` for shape; `-subpackage` naming per `spritesheet-formats` |
| `@flighthq/registry-codegen` | new SDK package | `emitRegistriesModule(catalog, requirements, backend): string` — pure, no fs, no argv | — |
| `@flighthq/tool-registry` | new `tool-*` package | argv, glob, file writes, exit codes. Outside the SDK barrel, non-tree-shakable, `bin` entry | `@flighthq/tool-capture` over `@flighthq/capture` |
| `scripts/catalog.ts` | script | generates the built-in entries into `registry-catalog`; `catalog:check` | `support.ts`, `swf-capabilities.ts` |
| `scene2d` / `scene3d` `sceneKindUsage.ts` | edit | facet emitter replacing the struct walk | — |
| the `*-formats` cells | edit | requirements sink at the sites that already carry the diagnostics sink | — |
| `types` + the twelve coverage cells | edit | remedy-discriminated `SceneCoverageEntry` and explicit catalog input | — |

**Why `requirements` and `registry-catalog` are separate cells and not one.** The seam rule this whole
design rests on is that a producer must never name a registry — *"a producer that named the registry would
be asserting a backend it cannot know."* Two packages make that structural: `requirements` cannot express
a registrar because it does not depend on anything that defines one. A single package would leave the rule
to reviewer memory.

**Why `registry-codegen` is separate.** An application doing runtime coverage checks — the
`has*Coverage` path, which is the majority case — should carry no TypeScript string emitter. Package
boundaries are the stated mechanism: *"If adding something forces a user to pull in unrelated weight, the
boundary is wrong."* It is also the most arguable split in the table, since resolution and emission always
travel together.

Four new SDK packages, one tool package, one script. No new format packages and no prescan packages —
that is what the sink decision buys.

## Build the generator first

[Blocker 3 of the registry table model](registry-table-model.md#blockers) says the census is not safe to
migrate on and demands *"a generated ownership inventory or a derivation-invariant test."*

**The catalog generator is that inventory.** It produces `(registrar → door → kind → package)` for all
295 registrars by derivation rather than by hand scan, which is the thing two hand scans have already
been shown to get wrong. So it is not the last stage of this lifecycle — it is the first piece of the
whole registry arc, it retires Blocker 3, and it is independently useful even if the storage design
changes underneath it.

**The first milestone is replacing the four harness chains, not counting registrars.** A count proves
nothing about whether codegen works. `tools/harness/{canvas,dom,webgl,webgpu}.ts`
[already hold the declared half](#this-half-already-exists-hand-written-four-times) as `if/else` chains,
every functional baseline exercises them, and swapping them for catalog lookups is mechanical. It
exercises both halves, the multi-registration case (`ShapeKind` needs renderer *and* commands), and
resolution — and a catalog that gets any of it wrong fails as red baselines rather than as an argument.

Two claims in earlier revisions of this document failed on contact with source: the `wireframe` counts,
and the assumption that every family was derivable. Both were caught by review rather than by the author.
That is the case for building the smallest falsifiable thing before any package exists.

## Names — settled, and one root word

Ruled by the user 2026-08-07. One root across the whole ladder, and **`wire` / `wiring` appears nowhere
in the design** — not as an aggregate, not as a package, not as a generated filename:

| Slot | Name |
|---|---|
| packages | `@flighthq/requirements`, `@flighthq/registry`, `@flighthq/registry-catalog`, `@flighthq/registry-codegen` |
| catalog form | generated `.ts` (canonical); `tool-registry catalog --json` on demand, never committed |
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

- ~~**Does the catalog ship to end users?**~~ — **answered by the cell decision.** It is
  `@flighthq/registry-catalog`, an SDK package, so it ships by construction and a consumer can extend it
  with their own kinds at runtime. The repo-internal alternative (`agents/registry-catalog.json`, beside
  `support-matrix.json`) was rejected as a closed vocabulary.
- ~~**Does the facet vocabulary cover non-render registries?**~~ — **yes.** The declared generated
  vocabulary is a superset of current scene walks and includes decompressors, importers, and joint
  solvers. Deriving it from emitted scene usage would make an unreported facet invisible by definition.
- **Re-confirm the importer-sink decision** against the written form above, per the provisional marking.
