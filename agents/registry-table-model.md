# Registry Tables — what a registry is made of, and who owns it

**Status: unratified proposal. Raised 2026-08-07.** Nothing here is implemented. Read it before adding a
registry or changing how a render state is derived, but do not build on it as settled.

This is the **storage** half of registration. [registration model](registration-model.md) owns the
**doors** — the two public entry points, the register-means-real-implementation rule, what may go in a
convenience bundle. That document is ratified and unaffected by this one: every rule it states survives,
and the 219 per-kind registrars it governs change by one parameter type or not at all.

The narrow question is why a missing texture resolver breaks silently at runtime. The wider one this
document exists to settle: **a registry is a value with a lifetime — which value, whose lifetime, and how
many shapes does it come in?**

## What is actually there

Counts from a scan of every exported `register*` body, hand-verified where the scan was ambiguous. The
scan has known holes (multi-line signatures, local `registry` aliases), so treat the long tail as
approximate and the named cases as verified.

**295 exported `register*` functions over ~65 distinct tables.** The distribution is the finding:

| | |
|---|---|
| 219 | delegate to another `register*` — pure name-binding, no mechanism of their own |
| 45 | keyed `.set` |
| 23 | single-slot assignment — not a table |
| 6 | bundles, plus the batch `registerRenderers` |
| 2 | append to an ordered list |

Three quarters of the surface is naming. Whatever the storage model is, it is a change to ~65 things.

Four consequences, each verified against source:

**Registries have no home, so they are copied.** `copyGlRenderStateRegistrations` assigns 14 fields and
then delegates to `copyRenderStateRegistrations` for 3 more; `copyAllRenderersFromRenderState` is a
*separate* call the caller must also remember. The wgpu and canvas twins are the same shape at different
sizes. `3f281bf4e` ("carry the shape-command registry onto a derived render state") is this failing once
already.

**Several registries are not copied at all.** Structurally verified by reading the copy functions; **no
failing test has been written, so this is a claim from structure, not a reproduction.**
`_velocityWriters` (gl and wgpu), `_customMaterialShaders` (gl and wgpu), and `_customShaders`
(effects-gl) live in module-global `WeakMap<RenderState, …>` side tables that no copy function touches.
`canvasBlendEffectBackdrops` is omitted by the canvas copy. And `shapeRasterizer` — a plain GL runtime
field set by `registerGlShapeRasterizer` — is absent from the 14. Every one of these is caller-facing, so
a cached or offscreen node silently loses it.

**At least 15 registries are module-global**, which `registration-model.md` already forbids: *"it cannot
be introspected, cannot be isolated between states, and makes 'wired' indistinguishable from 'wired by
someone else's test'."* `interaction`'s `hitTestRegistry` takes no state parameter at all, so
`interaction` cannot be wired two ways in one process.

**23 registries have no key, so they cannot be reported.** `explain*Coverage` walks lists of kinds; a
slot has no kind to walk. Where a slot does reach the miss seam it borrows the consumer's kind —
`registryMiss?.(RenderRegistry.ShapeRasterizer, ShapeKind)` appears at six sites with five different
kinds, so one unregistered rasterizer reports as five distinct misses.

And the duplication this enables: **twelve `has*`/`explain*Coverage` functions across six packages** run
the same loop. The only thing that varies between them is what a miss means.

## Three lifetimes in one object

`createGlOffscreenRenderState` does three different things to three groups of fields, and the doc
comments say so outright:

| Group | What derivation does | Real lifetime |
|---|---|---|
| `gl`, `canvas`, shaders, buffers, upload cache | **aliases** — *"must share the screen state's GL context and every context-bound resource"* | GPU context |
| the registries | **copies** — *"registrations start equal, then either state may override or omit them independently"* | application setup |
| proxy map, adapter map, frame counter, `tempStack`, `currentClipDepth`, `renderAlpha` | **fresh** — *"so baking neither substitutes a cache into itself nor disturbs the screen state's nodes"* | one pass |

Alias / copy / fresh, hand-maintained, in one constructor. The device tier has a name (`gl`). The pass
tier has a name (`RenderState`). The middle tier has none, which is exactly why it is copied field by
field instead of passed.

A `GlRenderState`'s lifetime is *per root* — `enableGlRenderStateGuards` ships a warning for reusing one
across roots — and `createGlCacheState` spawns one **per cached node**. So the object holding the
registries is among the shortest-lived things in the system, and it re-copies the longest-lived data
every time it is born.

Giving that tier a value makes the "start equal, then diverge independently" contract *cheaper* rather
than harder: sharing is by reference, and divergence allocates only what diverged.

Naming for the aggregate is open (see [Open questions](#open-questions)). This document writes it
`GlRenderWiring` as a placeholder, not a recommendation.

## Table shapes

Registrar bodies were checked for what they touch: **215 of 295 are a single statement, and zero touch a
GL, WebGPU, or canvas context.** That is what makes a registry plain data rather than something bound to
a device.

### The admission rule

> A new table shape must be justified by a difference in **lookup** or in **what a miss means** — never by
> a storage preference.

This exists because the shape discriminant serves lookup and `explain`, and nothing else. A difference
that never reaches either seam is not a shape.

### `KeyedTable` — ~38 members

Open `Kind` → value, last write wins. The default, and what every unremarkable registry is:
`rendererMap`, `glTextureResolverRegistry`, `materialRendererMap` (×3 backends), the render-effect
registries, `hitTestRegistry`, `decoders`/`encoders`, `_decompressors`, `jointSolvers`, `definitions`,
`listers`.

### `SlotTable` — ~23 members

A one-element vocabulary: the capability is present or it is not. `shapeRasterizer` (gl/wgpu/dom), the
color-adjustment material features, `defaultBitmapShader`, the compressed-texture decoder and uploader,
GPU skinning, `_dracoDecoder`, and the base-runtime slots `colorAdjustmentResolver`,
`strokeTessellator`, `renderRootGuard`, `applyBlendMode`.

Earns a shape on **both** criteria. Lookup differs — there is no key, so its key is its own `RegistryId`.
Miss reporting differs materially: this is the fix for the six borrowed-kind `registryMiss` sites, and
it is what makes the 23 unreportable registries reportable at all.

### `OrdinalTable` — 1 member, probationary

Dense array indexed by position in a closed vocabulary. Passes the rule on lookup — index and
bounds-check rather than hash, on the genuinely hot per-token shape-command replay path — and arguably on
miss semantics, since a miss on a closed vocabulary is a programmer error rather than an unwired feature.

Its one member is `canvasShapeCommandRegistry`, whose apology is already written into `RenderState.ts`:

> *"ShapeCommandKey is a closed union… The map is keyed by plain string only because a stream is read back
> token by token, so the lookup takes whatever the buffer holds; it is not an opening of the vocabulary."*

One member is thin for a founding shape. It lives on the base runtime with four backend consumers, which
is why it is held rather than cut — but if the model should be two shapes, this is the one that goes.

### Rejected: `ChainTable`

Ordered first-match probe. Four candidates exist — the `Scene2DDocumentImporterRegistry` and the
`detect` registries in `particles-formats`, `spritesheet-formats`, and `textureatlas-formats`.

It fails the admission rule. `has(table, kind)` answers the same question a keyed table answers, and a
miss means the same thing; chain-ness never reaches either seam. What differs is a **derived operation**
— detect — sitting above the table.

Detection is two operations fused: a search over probes that *derives* a key, then a keyed lookup of that
key. Three of the four store entries in a `Map` and rely on insertion order for correctness:

```ts
for (const [kind, codec] of _registry) {
  if (codec.detect(text)) return kind;
}
```

Re-registering a kind keeps its original position, so overriding *what* parses a format can change
*which* format wins detection. Where precedence genuinely matters — overlapping text formats — it should
be an explicit value on the entry, not a call-order side effect.

**Deferred:** the `Scene2DDocumentImporterRegistry` pattern, and what moving it off ordered entries would
cost, are held for a separate ruling and are out of scope here.

## The header

Types live in `@flighthq/types` per the standing rule; `@flighthq/registry` exports functions only.

```ts
import type { Kind } from './Entity';

// Built-in registry identifiers. A const object with `type RegistryId = string` rather than a numeric
// enum, for the same reason Kind is a string: the identifier, the serialized form, and the user-facing
// vocabulary are one value, so a requirements manifest emitted at build time round-trips with no
// id<->name seam. Third-party registries namespace with a vendor prefix ('acme.Foo').
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
// The three members are exactly the cases the twelve hand-written coverage walks distinguish today;
// FallbackWhen is the material-renderer case, where an unregistered kind still draws as
// StandardMaterialKind when that one is bound.
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

// Dense array indexed by position in `vocabulary`, for a closed union such as ShapeCommandKey. A stream
// is read back token by token, so the lookup indexes and bounds-checks rather than hashing, and an
// out-of-vocabulary token is a range failure instead of a silent miss.
export interface OrdinalTable<T> extends RegistryTableBase {
  readonly entries: (T | null)[];
  readonly shape: 'ordinal';
  readonly vocabulary: readonly Kind[];
}

// A one-element vocabulary: the capability is present or it is not. Its key is its own RegistryId, so
// explain addresses it uniformly and a missing shape rasterizer reports once rather than once per node
// kind that wanted it.
export interface SlotTable<T> extends RegistryTableBase {
  readonly shape: 'slot';
  value: T | null;
}

// Closed by design: entries are open forever, shapes are not. Plain data with a discriminant rather than
// a method table, so a table lowers to a Haxe/Rust struct and the hot path reads its concrete member
// without dispatch.
export type RegistryTable<T> = KeyedTable<T> | OrdinalTable<T> | SlotTable<T>;

// One thing an input needs bound before it can be served. The question half of the seam: an input knows
// what it contains, and only the holder of a registry knows whether anything serves it.
export interface Requirement {
  readonly key: Kind;
  readonly registry: RegistryId;
}
```

## Cold layer, hot path

Every generic operation is cold — construction, composition, enumeration, diagnostics. None is on a draw
path, which is what keeps the discriminant switch off the frame budget.

```ts
// Allocates a new table serving everything in `base`, overridden by `overlay`. Neither input is mutated,
// which is what makes "start equal, then either state may override or omit independently" a
// share-by-reference plus copy-on-write instead of an eager field-by-field copy.
export function concatRegistryTable<T>(
  base: Readonly<RegistryTable<T>>,
  overlay: Readonly<RegistryTable<T>>,
): RegistryTable<T>;

export function getRegistryTableEntry<T>(table: Readonly<RegistryTable<T>>, key: Kind): T | null;

// Clears `out`, then appends every bound key in sorted order, so two tables diff and compare equal
// regardless of registration order. Sorting here rather than in storage is what lets the keyed shape
// stay a Map.
export function getRegistryTableKeys(out: Kind[], table: Readonly<RegistryTable<unknown>>): void;

export function hasRegistryTableEntry(table: Readonly<RegistryTable<unknown>>, key: Kind): boolean;

export function setRegistryTableEntry<T>(table: RegistryTable<T>, key: Kind, value: T): void;

// Clears `out`, then reports every requirement with how well `tables` serve it — satisfied entries
// included, so one call is a complete manifest.
export function explainRegistryCoverage(
  out: SceneCoverageEntry[],
  tables: readonly Readonly<RegistryTable<unknown>>[],
  requirements: readonly Readonly<Requirement>[],
): void;
```

The twelve coverage functions become a list of tables:

```ts
export function explainGlScene2DCoverage(
  out: SceneCoverageEntry[],
  wiring: Readonly<GlRenderWiring>,
  requirements: readonly Readonly<Requirement>[],
): void {
  explainRegistryCoverage(out, [
    wiring.blendRealizations,
    wiring.materialRenderers,
    wiring.nodeRenderers,
    wiring.shapeCommands,
    wiring.shapeRasterizer,
    wiring.textureResolvers,
  ], requirements);
}
```

`shapeRasterizer` appearing in that list is the bug fix: a `SlotTable` is addressable, so the six
borrowed-kind miss sites collapse to one honest report.

Access stays concrete and monomorphic per family. The hot path does **not** call
`getRegistryTableEntry`:

```ts
export function getGlRenderEffectRunner(
  wiring: Readonly<GlRenderWiring>,
  kind: Kind,
): GlRenderEffectRunner | null {
  return wiring.renderEffects.entries.get(kind) ?? null;
}
```

That is the point of the shape being plain data rather than a method table.

## What does not change

The 219 delegating registrars change by one parameter type and nothing else:

```ts
export function registerGlBloomEffect(wiring: GlRenderWiring): void {
  registerGlRenderEffect(wiring, BloomEffectKind, defaultGlBloomEffectRunner);
}
```

Both doors from [registration model](registration-model.md) survive unchanged: the per-kind registrar and
the generic `registerGlRenderEffect(wiring, kind, runner)` with its public `default*Runner`. Nothing here
opens a bag — the container stays a struct of named fields, never a `Map<RegistryId, RegistryTable>`,
because a registry addressable by id at runtime is a registry that cannot be shaken out.

## Open questions

- **Mutation versus sharing.** `setRegistryTableEntry` mutates while `concatRegistryTable` allocates, so a
  table shared by reference between a screen state and its offscreen derivation can still be mutated out
  from under the parent. Copy-on-write with an ownership flag fixes it; a `sealed` flag checked in the
  guard lane may be the honester answer. **Unresolved.**
- **Package name.** `@flighthq/registry` reads correctly and matches the vocabulary the docs already use,
  but `RenderRegistry` (an identifier) and `ShapeCommandRegistry` (an interface of argument tuples, not a
  table) are both already taken by unrelated things.
- **The aggregate's name.** `Wiring` is native vocabulary — 124 non-`wireframe` uses across 96 files, and
  `registration-model.md` uses "wired" as the verb for exactly this — but `wireframe` appears 296 times,
  so it lands in a polluted grep namespace. `Vocabulary` is clean. `Capabilities` and `Support` both
  collide with existing meanings.
- **`RenderRegistry` as a numeric enum.** 121 call sites. Its own comment names the fragility: *"a literal
  at a callsite would silently mean a different registry the moment one is inserted above it."* Survivable
  while the values never leave the process; a build-time requirements manifest is exactly them leaving.
- **`OrdinalTable`'s membership.** One member. Cut to two shapes, or keep three?
- **The five-plus uncopied registries.** Verified structurally, not reproduced. Failing tests would settle
  whether this is live today, and are worth writing under any outcome here.

## Deferred

The `Scene2DDocumentImporterRegistry` pattern — the one registry already built as a caller-owned value,
and the only place where a prescan producing `Requirement[]` could originate — is held for a separate
ruling.
