# Registry Tables — what a registry is made of, and who owns it

**Status: unratified proposal, revised after adversarial review. Raised and audited 2026-08-07.** Nothing
here is implemented. Read it before adding a registry or changing how a render state is derived, but do
not build on it as settled — three blockers below are unresolved, and the first revision of this document
asserted things that source contradicts.

The review recommended **do not ratify as written** and backed it with a throwaway cross-backend Vitest
probe (written, run, removed; repository left clean). What it changed:

- The **diagnosis got stronger.** The probe confirmed every derivation loss claimed here and found more,
  including one copy that looks correct and is dead.
- The **prescription got weaker.** The wiring tier is narrower than claimed, because the argument for its
  device-independence was invalid. There are four ownership tiers, not three. The requirements model
  leaked consumer policy into producers and has been rebuilt around facets. `OrdinalTable` lost its
  proposed member and was rejected, then re-admitted on a different one under a sharper criterion — see
  [`OrdinalTable`](#ordinaltable--integer-token-formats-only).

The narrow question is why a missing texture resolver breaks silently at runtime. The wider one this
document exists to settle: **a registry is a value with a lifetime — which value, whose lifetime, and how
many shapes does it come in?**

## Relationship to `registration-model.md`

That document owns the **doors** — the two public entry points, the register-means-real-implementation
rule, what may go in a convenience bundle. This one is about the **storage** beneath them.

The first revision claimed the ratified model was unaffected. **That was wrong.** The ratified model
states that registration is per render state, that an offscreen state starts empty, and that the door is
`registerGlBlurEffect(state)`. Moving the parameter to a separate aggregate and replacing state-to-state
copying with sharing changes door semantics and consumer ergonomics both. It may be a worthwhile
pre-release change; it is not a no-op, and it must be priced as a breaking one.

## What is actually there

Counts from a scan of every exported `register*` body, hand-verified where ambiguous. The scan has known
holes, so the totals are approximate and **not a safe migration census** — see [Blockers](#blockers).

**295 exported `register*` functions over ~65 distinct tables.** The distribution is the finding:

| | |
|---|---|
| 219 | delegate to another `register*` — pure name-binding, no mechanism of their own |
| 45 | keyed `.set` |
| 23 | single-slot assignment — not a table |
| 6 | bundles, plus the batch `registerRenderers` |
| 2 | append to an ordered list |

Three quarters of the surface is naming.

**Registries have no home, so they are copied.** `copyGlRenderStateRegistrations` assigns 14 fields then
delegates to `copyRenderStateRegistrations` for 3 more; `copyAllRenderersFromRenderState` is a *separate*
call the caller must also remember. `3f281bf4e` ("carry the shape-command registry onto a derived render
state") is this failing once already.

**Registries are lost on derivation — reproduced, not merely read.** The audit probe registered each
capability, derived a state, and asserted the lookup came back empty. All assertions passed:

- `_velocityWriters` (gl and wgpu), `_customMaterialShaders` (gl and wgpu), `_customShaders`
  (effects-gl) — module-global `WeakMap<RenderState, …>` side tables no copy function touches.
- `canvasBlendEffectBackdrops` — runtime field omitted by the canvas copy.
- `shapeRasterizer` — a plain runtime field set by `registerGlShapeRasterizer`, absent from
  `copyGlRenderStateRegistrations`'s 14 assignments. **The wgpu twin is omitted too.**
- GL and WGPU blend backdrops — further state-keyed module `WeakMap`s, also uncopied.
- GL/WGPU modifier-snippet and GL PBR-extension registries — created fresh inside the private scene
  runtime, never copied.
- **`sceneMeshMaterialRegistry` is copied and then overwritten.** `copyGlRenderStateRegistrations` carries
  it; the first `getGlScene3DRuntime` call on the derived state builds `materialRegistry: new Map()` and
  assigns it straight over the copied field. The probe saw `getGlMeshMaterialRenderer` return `null`
  after derivation despite registration before it. A copy that reads as correct and does nothing is worse
  than an omission, and no review of the copy function alone would catch it.

**At least 15 registries are module-global**, which `registration-model.md` already forbids: *"it cannot
be introspected, cannot be isolated between states, and makes 'wired' indistinguishable from 'wired by
someone else's test'."* `interaction`'s `hitTestRegistry` takes no state parameter at all.

**23 registries have no key, so they cannot be reported.** `explain*Coverage` walks lists of kinds; a slot
has no kind to walk. Where a slot does reach the miss seam it borrows the consumer's kind —
`registryMiss?.(RenderRegistry.ShapeRasterizer, ShapeKind)` at six sites with five different kinds, so one
unregistered rasterizer reports as five distinct misses. **These are the registries that fail silently
today, and closing that is the highest-leverage part of this proposal.**

And the duplication it enables: **twelve `has*`/`explain*Coverage` functions across six packages** running
the same loop, varying only in what a miss means.

## Who owns a registry

### Retraction: the device-independence argument was invalid

The first revision argued that because 215 of 295 registrar bodies are one statement and **zero** touch a
GL, WebGPU, or canvas context, registries are plain data safely extracted from the device tier.

**A registrar body says nothing about the value it stores.** `registerGlBitmapShader` merely assigns a
field, but `GlBitmapShader` carries `GlShaderLocations`, whose `program` is a `WebGLProgram`. Blend
backdrops hold live `WebGLTexture` / `WgpuRenderTarget` / `CanvasRenderTarget` references — source calls
them "live GPU texture" bindings. These are context-bound resources with caller-managed liveness that
happen to have a setter named `register*`.

The extraction is therefore narrower than claimed: **pure registration policy may have a wiring owner.
Device-bound implementations and live resource bindings must not be swept into it because of their
setter's name.** Sorting the ~65 tables on that axis is prerequisite work, not a detail.

### Four tiers, not three

`createGlOffscreenRenderState` does three things to three groups — alias the context and its bound
resources, copy the registrations, freshen the scene bookkeeping. The first revision read those three
actions as three lifetimes. They are derivation *behavior*, and the third action merges two tiers:

| Tier | Example | Lifetime |
|---|---|---|
| Device / context | `gl`, `canvas`, programs, buffers, upload caches | GPU context |
| Application wiring | pure registration policy (see retraction above) | application setup |
| Root / pipeline instance | proxy maps, proxy sources, `rendererMapId`, frame counter | many frames — a cache state is built once by `createGlCacheState` and reused by `refreshGlRenderCache` |
| Render pass / invocation | framebuffer, viewport, scissor, stencil | one pass, bracketed by `beginGlRenderPass` / `endGlRenderPass` |

"Fresh when a derived pipeline is constructed" is not "one pass." The retained tier is the one that
matters for derivation, and it is the third, not the fourth.

A `GlRenderState`'s lifetime is *per root* — `enableGlRenderStateGuards` ships a warning for reusing one
across roots — and `createGlCacheState` spawns one per cached node. So the object holding the registries
is among the shortest-lived things in the system, and it re-copies the longest-lived data every time it is
born. That diagnosis survives the audit intact; only the tier count and the tier's contents changed.

The aggregate is `GlRenderRegistries` — settled 2026-08-07, see [registration lifecycle](registration-lifecycle.md#names--settled-and-one-root-word).

## Table shapes

### The admission rule

The first revision proposed *"lookup or what a miss means, never a storage preference."* The audit showed
that is too narrow — it would reject a registry whose `get(kind)` looks ordinary but whose registration
and enumeration order are contractual. Widened:

> A storage shape must earn itself by an observable difference in the table's **algebra**: key domain or
> cardinality, lookup, registration / overwrite / removal, enumeration and order, composition, or miss
> semantics. Never by a storage preference.

### `KeyedTable` — ~38 members

Open `Kind` → value, last write wins. The default, and what every unremarkable registry is: `rendererMap`,
`glTextureResolverRegistry`, `materialRendererMap` (×3 backends), the render-effect registries,
`hitTestRegistry`, `decoders`/`encoders`, `_decompressors`, `jointSolvers`, `definitions`, `listers`.

### `SlotTable` — ~23 members

A one-element vocabulary: the capability is present or it is not. `shapeRasterizer` (gl/wgpu/dom), the
color-adjustment material features, the compressed-texture decoder and uploader, GPU skinning,
`_dracoDecoder`, and the base-runtime slots `colorAdjustmentResolver`, `strokeTessellator`,
`renderRootGuard`, `applyBlendMode`.

Earns a shape on **cardinality** — its key domain has exactly one member, so its key is its own
`RegistryId` — and on **miss identity**: this is what makes the six borrowed-kind `registryMiss` sites
report once, and what makes the 23 silent registries reportable at all.

### `OrdinalTable` — integer-token formats only

A dense array indexed by a token the wire format already carries as an integer. The admission criterion
is exactly that, and it is narrow on purpose:

> An `OrdinalTable` is warranted only where the **serialized token is already a small dense integer**. If
> the stream carries a string and something must convert it to an index, the shape has bought nothing.

**Rejected member: shape commands.** This shape was originally proposed on the strength of a comment in
`RenderState.ts` — *"ShapeCommandKey is a closed union — the authored vocabulary is fixed by
ShapeCommandRegistry"* — and source contradicts it. `ShapeCommand.ts` says *"May be extended via
declaration merging"*, recorded streams store each command as a **string key**, the hot replay path reads
that string and calls `getCanvasShapeCommand(state, key)`, and the registrar accepts consumer-extended
`keyof ShapeCommandRegistry` values. Indexing an array by a string needs a string→index map, a switch, or
`indexOf`: the first restores the hash, the second centralizes a vocabulary meant to be extensible, the
third is slower. Shape commands stay a `KeyedTable`.

**Admitted member: SWF tag readers.** The framing loop derives `const code = tagHeader >> 6` — an integer,
never a string — and the format's tag space is dense and closed at 94. Dispatch today is a chain of 55
`code === TAG_*` comparisons, so an average tag walks roughly half of them; a dense array is one index.

It earns the shape on three axes of the algebra, not one:

- **Key domain.** Integer, dense, closed by the format. Categorically different from an open string domain.
- **Lookup.** Direct index, no hash and no string, on a path that runs once per tag in the file.
- **Miss semantics.** The bounds check *is* the unknown-tag path. TLV framing exists so a reader can skip
  what it does not know, so out-of-range is correct behavior, not an error — while in-range-but-unregistered
  is "this parser was not built with that feature," which is reportable and is exactly what a requirements
  manifest wants to say. Those are genuinely two conditions with two responses, which is what the shape-
  command case conflated.

Honest margin: most of the win over today comes from being a table at all rather than an `else if` chain,
and a `Map<number, …>` would capture much of it. What justifies a distinct shape is the key domain and the
bounds-check-as-skip-path, not raw speed.

**The cost this does not pay.** A tag table only tree-shakes if the readers are separately registered.
`swfDocument.ts` is a single 2,522-line module whose dispatch statically references all 28 readers, so the
table is a precondition for a lean parser, not the thing that delivers one. Restructuring that module is
its own piece of work and is not proposed here.

**Independent defect, worth fixing regardless of this proposal:** two comments in `@flighthq/types` assert
opposite things about whether `ShapeCommandRegistry` is closed. One of them is wrong and both are
load-bearing for readers.

### Rejected: `ChainTable`

Ordered first-match probe. Four candidates: the `Scene2DDocumentImporterRegistry` and the `detect`
registries in `particles-formats`, `spritesheet-formats`, and `textureatlas-formats`.

Detection is two operations fused — a search over probes that *derives* a key, then a keyed lookup of
that key. Three of the four store entries in a `Map` and rely on insertion order for correctness:

```ts
for (const [kind, codec] of _registry) {
  if (codec.detect(text)) return kind;
}
```

Re-registering a kind keeps its original position, so overriding *what* parses a format can change *which*
format wins detection.

Under the widened rule this shape can no longer be dismissed as "a derived operation" — contractual
enumeration order is now admissible grounds. It is rejected on a different basis: **precedence belongs on
the entry as an explicit value.** Once each entry carries a precedence number, storage holds no order, the
scan is deterministic, and a re-registration cannot silently move a format in the queue. A shape is not
needed to express a field.

**Deferred:** the `Scene2DDocumentImporterRegistry` pattern, and what moving it off ordered entries would
cost, are held for a separate ruling.

## The header

Types live in `@flighthq/types` per the standing rule; `@flighthq/registry` exports functions only.

```ts
import type { Kind } from './Entity';

// Built-in registry identifiers. A const object with `type RegistryId = string` rather than a numeric
// enum, so the identifier, the serialized form, and the user-facing vocabulary are one value.
// See Open questions: the numeric form is load-bearing for diagnostics today and this is not free.
export const RenderRegistry = {
  BlendRealization: 'BlendRealization',
  EffectPaddingResolver: 'EffectPaddingResolver',
  MaterialRenderer: 'MaterialRenderer',
  NodeRenderer: 'NodeRenderer',
  ShapeCommandHandler: 'ShapeCommandHandler',
  ShapeRasterizer: 'ShapeRasterizer',
  TextureResolver: 'TextureResolver',
} as const;

export type RegistryId = string;

// What an unserved key means for this registry — a property of the registry, not of the caller asking.
// The three members are exactly the cases the twelve hand-written coverage walks distinguish today.
export type RegistryMissPolicy =
  | { readonly coverage: 'Fallback' }
  | { readonly coverage: 'FallbackWhen'; readonly key: Kind }
  | { readonly coverage: 'Missing' };

export interface RegistryTableBase {
  readonly onMiss: RegistryMissPolicy;
  readonly registry: RegistryId;
}

// Open key -> value lookup, last write wins.
export interface KeyedTable<T> extends RegistryTableBase {
  readonly entries: Map<Kind, T>;
  readonly shape: 'keyed';
}

// A one-element vocabulary: the capability is present or it is not. Its key is its own RegistryId, so
// explain addresses it uniformly and a missing shape rasterizer reports once rather than once per node
// kind that wanted it.
export interface SlotTable<T> extends RegistryTableBase {
  readonly shape: 'slot';
  value: T | null;
}

// Dense array indexed by a token the wire format already carries as an integer — a SWF tag id, never a
// string command key. `vocabulary` maps ordinal to Kind so explain can name a slot; the hot path never
// consults it, because the decoder already holds the integer. An out-of-range token is the format's
// skip-what-you-do-not-know path, not a miss.
export interface OrdinalTable<T> extends RegistryTableBase {
  readonly entries: (T | null)[];
  readonly shape: 'ordinal';
  readonly vocabulary: readonly Kind[];
}

// Closed by design: entries are open forever, shapes are not. Plain data with a discriminant rather than
// a method table, so a table lowers to a Haxe/Rust struct and the hot path reads its concrete member
// without dispatch.
export type RegistryTable<T> = KeyedTable<T> | OrdinalTable<T> | SlotTable<T>;

// A fact about content, named in the producer's own vocabulary — NEVER a registry id. A non-default
// blend mode needs a BlendRealization on GL and no registry at all on Canvas, so only the consumer can
// map a facet to a registry. A producer that named the registry would be asserting a backend it cannot
// know, which is the seam Scene2DKindUsage already draws: "a scene knows WHAT is in it, and only the
// holder of a registry knows whether anything is bound to serve it."
export type RequirementFacet = string;

export interface Requirement {
  readonly facet: RequirementFacet;
  readonly key: Kind;
}

// `covers` is the completeness signal, and is why this is a set rather than a bare array. A walk that
// did not inspect texture sources must say so, or a caller reads the absence as "none needed" — the
// exact misreading Scene2DKindUsage refuses partial reporting to avoid.
export interface RequirementSet {
  readonly covers: readonly RequirementFacet[];
  readonly requirements: readonly Requirement[];
}
```

## Cold layer, hot path

Every generic operation is cold — construction, composition, enumeration, diagnostics. None is on a draw
path.

```ts
export function concatRegistryTable<T>(
  base: Readonly<RegistryTable<T>>,
  overlay: Readonly<RegistryTable<T>>,
): RegistryTable<T>;

// Addresses any shape by Kind, which for an OrdinalTable means resolving through `vocabulary`. That
// resolution is why this form is cold-only: a decoder already holds the integer and indexes directly.
export function getRegistryTableEntry<T>(table: Readonly<RegistryTable<T>>, key: Kind): T | null;

// The ordinal hot-path form. Out-of-range returns null, which is the format's skip path rather than a
// miss — a caller distinguishing "unknown tag" from "unregistered reader" compares against
// `vocabulary.length`.
export function getOrdinalTableEntry<T>(table: Readonly<OrdinalTable<T>>, ordinal: number): T | null;

// Clears `out`, then appends every bound key in sorted order, so two tables diff and compare equal
// regardless of registration order. Sorting here rather than in storage is what lets the keyed shape
// stay a Map.
export function getRegistryTableKeys(out: Kind[], table: Readonly<RegistryTable<unknown>>): void;

export function hasRegistryTableEntry(table: Readonly<RegistryTable<unknown>>, key: Kind): boolean;

// NOT `setRegistryTableEntry`. Tables are persistent, so this returns a REPLACEMENT table and mutates
// nothing — and AGENTS.md's Geometry Ownership rule reserves `set*` for in-place mutation. A `set*` that
// does not set contradicts a stated rule at the call site, where the reader has only the name to go on.
// This name is deliberate; do not "restore" the old one as an oversight. The owner assigns the result:
//   registries.textureResolvers = withRegistryTableEntry(registries.textureResolvers, kind, resolver);
export function withRegistryTableEntry<T>(
  table: Readonly<RegistryTable<T>>,
  key: Kind,
  value: T,
): RegistryTable<T>;

// Binds `key` to the tombstone: "this table explicitly omits the base's entry," which a keyed overlay
// previously could not say and a slot's `null` could not distinguish from "inherit base."
export function withRegistryTableTombstone<T>(
  table: Readonly<RegistryTable<T>>,
  key: Kind,
): RegistryTable<T>;
```

### The tombstone must not compile where a value is expected

A tombstone that some readers ignore is worse than no tombstone, because it looks handled. So the
sentinel is a discriminated union, and the reason it is not an optional flag or a reserved value is that
both of those *type-check* at every site that never heard of them:

```ts
// Not `T | null` and not `{ value: T; omitted?: boolean }`. Neither of those can fail a build: a reader
// that has never heard of tombstones assigns them straight through. This union is NOT assignable to `T`,
// so the only way to reach the value is to narrow, and the only way to narrow is to have handled both.
export type RegistryTableEntry<T> =
  | { readonly state: 'bound'; readonly value: T }
  | { readonly state: 'tombstoned' };
```

**Where the union is mandatory, and where it would be noise.** These are different questions and
conflating them is what makes exhaustiveness feel like a tax:

- **Resolution** — `getRegistryTableEntry` keeps returning `T | null`. At resolution a tombstone *is* a
  miss: the caller asked what is bound and the answer is nothing. Collapsing it there is correct, not
  lossy, and no tombstone escapes into caller code.
- **Composition and enumeration** — every operation that handles entries *as entries* deals in
  `RegistryTableEntry<T>`. This is the one place a tombstone can be mistaken for data, and it is exactly
  the case the constraint exists for: `concatRegistryTable` copying an overlay's entries into a result
  must not copy a tombstone through as a binding, because that would resurrect the very entry the overlay
  meant to omit.

Composition therefore switches, and the `never` arm is what makes a **third** state a build failure
rather than a silent fall-through — the way a third meaning would otherwise get in unnoticed:

```ts
switch (entry.state) {
  case 'bound':
    // …carry the binding into the result
    break;
  case 'tombstoned':
    // …omit the base's entry from the result; NOT the same as leaving it unbound
    break;
  default: {
    const unreachable: never = entry;
    return unreachable;
  }
}
```

`concatRegistryTable` still **throws** on shape, registry-id, or miss-policy mismatch — that is a
programmer error, not an expected failure, and the ruling leaves it standing. The tombstone answers a
different question: not "can these two tables compose" but "what did the overlay mean by saying nothing."

### Domain audit: every path that returns or accepts an entry

The split above is sound **only if no entry reaches the value domain without passing the resolver**. Every
API, classified. Three do not close, and one of them is the storage itself.

| Path | Domain | Closed? |
| --- | --- | --- |
| `getRegistryTableEntry` | resolution | yes — collapses a tombstone to `null` |
| `getOrdinalTableEntry` | resolution (hot) | **open — see below** |
| `hasRegistryTableEntry` | resolution | yes, *if specified* to answer `false` for a tombstone |
| `getRegistryTableKeys` | enumeration | **open — "bound" is now ambiguous** |
| `concatRegistryTable` | composition | yes — switches exhaustively |
| `withRegistryTableEntry` / `…Tombstone` | construction | yes — produce entries, never hand them out |
| `table.entries`, `table.value` | **raw field access** | **open — widest surface, bypasses all of the above** |

**1. The storage types have nowhere to put a tombstone.** `KeyedTable<T>.entries` is `Map<Kind, T>`, so
the sentinel this design introduces cannot be represented in the table that is supposed to carry it. This
is the leak, and it is load-bearing: storage must hold `RegistryTableEntry<T>`, not `T`.

That change also closes the raw-access row, and this is the reason to prefer it over any alternative. The
tables are plain data with public `readonly` fields — an assembly can write `for (const [kind, value] of
table.entries)` and never call a function of ours. If `entries` holds `T`, that loop is unprotected by
construction. If it holds `RegistryTableEntry<T>`, the same loop **fails to compile** until it narrows.
The union defends the field, not just the function.

While changing it: `readonly entries: Map<…>` marks the *field* readonly and leaves the map mutable, which
does not survive a persistence claim — `withRegistryTableEntry` returning a replacement means nothing if a
caller can mutate the shared map underneath it. It should be `ReadonlyMap`.

**2. `getRegistryTableKeys` says "every bound key", and a tombstone has made that ambiguous.** If a
tombstoned key is listed, a caller that enumerates and then resolves gets `null` for a key the table just
told it was there — the *present-in-keys, absent-on-lookup* trap. It must list only `bound` entries, and
say so, so enumeration and resolution cannot disagree. `hasRegistryTableEntry` must answer `false` on a
tombstone for the same reason: `has` returning true where `get` returns null is the same defect one call
apart.

**3. `OrdinalTable` and the hot path is a real decision, not an oversight.** `entries` is `(T | null)[]`
indexed directly by a token the decoder already holds; the whole point is that nothing is consulted on the
way. Making those entries a union puts a discriminant read in that path. The options are (a) ordinal
tables carry no tombstone — defensible, since an overlay omitting a *wire-format token reader* is not a
motivated case and out-of-range is already the format's skip path, or (b) uniformity at a hot-path cost.
**Unresolved; needs a ruling before materialization.** Recorded here rather than picked, because "the
ordinal shape is exempt from the sentinel" is exactly the kind of quiet exception that becomes a third
meaning later.

A note on the discriminant: it is `state`, not `kind`. `Kind` is already the key vocabulary these tables
are addressed by, and a `kind` field on the entry would read as the key it is stored under.

The twelve coverage functions become a list of tables plus the backend's facet mapping — the mapping is
the consumer-side policy the producer must not carry:

```ts
export function explainGlScene2DCoverage(
  out: SceneCoverageEntry[],
  registries: Readonly<GlRenderRegistries>,
  requirements: Readonly<RequirementSet>,
): void;
```

`registries.shapeRasterizer` belonging in that list is the bug fix: a `SlotTable` is addressable, so the six
borrowed-kind miss sites collapse to one honest report.

Access stays concrete and monomorphic per family. The hot path does **not** call `getRegistryTableEntry`:

```ts
export function getGlRenderEffectRunner(
  registries: Readonly<GlRenderRegistries>,
  kind: Kind,
): GlRenderEffectRunner | null {
  return registries.renderEffects.entries.get(kind) ?? null;
}
```

## Blockers

Three things must be settled before this can be ratified. Each was raised by the audit; none is resolved.

**1. Mutation and removal cannot express the contract. — RULED 2026-08-10, resolved in the header above.**
The design promised current snapshot semantics — a derived state starts equal, then either side may
override *or omit* independently — while sharing tables by reference and exposing a mutating setter that
could not replace the owning aggregate's field. The user ruled **persistent tables**: the operation returns
a replacement table and the owner assigns it, which is why it is named `withRegistryTableEntry` and not
`set*`. Omission is now sayable through a **distinct tombstone sentinel**, typed so an unhandled one fails
the build rather than being copied through composition as a binding. `concatRegistryTable` **throws** on
shape, registry-id, or miss-policy mismatch, unchanged. Blockers 2 and 3 are untouched by this ruling and
still gate ratification.

**2. Nothing here implements the anti-shotgun path.** Reporting a miss names the failure; it does not make
the selective fix cheaper than one bundled call. An agent still has to discover N registrars, add N
imports, and call them, so `registerEverything` remains the shortest repair — and the codebase already
both forbids the pattern and practises it (`registerDefaultGlBlendModes` hides a private array without
separately exporting its members; the three `register*Backends` install every host backend by design).
`npm run size` only protects assemblies it actually measures.

For this to work, a miss must carry its **remedy** — the exact registrar and import that would satisfy
it — through a dev-only lane that shakes out of production. Precise, actionable, one-line fixes are what
make the shotgun *more* work than the correct repair; that is the mechanism, and it is not designed yet.
Until it is, the user's paths (3) and (4) are unaddressed.

**3. The census is not safe to migrate on.** The audit found losses the hand scan missed, including one
copy that reads as correct and is overwritten at first use. A ratified design must be backed by a
generated ownership inventory or a derivation-invariant test — "register everything, derive, assert
nothing was lost" — not by a hand scan that has already been shown incomplete twice.

## What does not change

The 219 delegating registrars change by one parameter type and nothing else. The container stays a struct
of named fields, never a `Map<RegistryId, RegistryTable>` — a registry addressable by id at runtime is a
registry that cannot be shaken out.

## Open questions

- ~~**Package name**~~ and ~~**the aggregate's name**~~ — **settled 2026-08-07, see
  [registration lifecycle](registration-lifecycle.md#names--settled-and-one-root-word).** The package is
  `@flighthq/registry` (the collision with `RenderRegistry` and `ShapeCommandRegistry` is cosmetic —
  package specifiers and type names do not share a namespace); the aggregate is `GlRenderRegistries`,
  not `Wiring`. **The `wireframe` counts this entry cited as grounds do not reproduce** — measured
  2026-08-07, `wiring` is 240 lines / 155 files and `wireframe` 102 / 35 repo-wide, the ratio inverted
  from the 124-vs-296 stated here. The ruling does not rest on either count.
- **`RenderRegistry` as a numeric enum.** 121 call sites, and the numeric form is deliberate: diagnostics
  emit IDs to keep policy and messages out of render core, and capture tooling plus tests consume the
  type. A string identity may be right for an external manifest; the migration must price the diagnostics
  contract rather than assume it.
- **Do all ~65 registries share `Satisfied` / `Fallback` / `Missing`?** Those terms are render-specific.
  A decompressor or an importer registry may not have a Fallback state at all.
- **Which tables are pure policy?** Prerequisite to the wiring tier, per the retraction above.

## Deferred

The `Scene2DDocumentImporterRegistry` pattern — the one registry already built as a caller-owned value,
and the only place where a prescan producing requirements could originate — is held for a separate ruling.
