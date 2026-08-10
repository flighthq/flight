# Registry Tables — what a registry is made of, and who owns it

**Status: unratified proposal, revised after adversarial review. Raised and audited 2026-08-07.** Nothing
here is implemented. Read it before adding a registry or changing how a render state is derived, but do
not build on it as settled — three blockers below are unresolved, and the first revision of this document
asserted things that source contradicts.

**Scoped authorization (2026-08-10): Stage 1 of the registrar ownership-inventory program may build on
this document; no later stage or other unratified proposal is authorized.**

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

### Stage 1 syntax inventory result

The scoped source recorder now inventories 300 exported registrars as 228 concrete mapping rows across
196 registrars, 55 caller-supplied mechanisms, and 49 `UNCATALOGUED` registrars. Mechanisms are explicit
rather than silently removed from the denominator: 51 receive a direct key and 4 loop over a
caller-supplied collection. The unreadable remainder is 12 inline implementation expressions, 3
caller-independent hidden arrays, and 34 functions that are not kind registrations. Named-factory call
results, unresolved identifier/member kinds, and unexplained non-bare callees are all zero. The complete
rows, rather than these summary numbers, are the authoritative artifact emitted by
`npm run reachability:json` as `registrarOwnership`. They are authoritative only for this syntax
inventory: one loop body is one row even when it emits many runtime pairs, so these counts do not prove
runtime provenance or derivation survival.

The full pass over the former 50 non-bare-callee rows found 50 generic doors whose key is derived from
their own parameter and zero delegating registrars that write a table directly. That preserves the
claim that aggregate ownership can be confined to doors; it is not an extrapolation from the two sampled
render doors.

The separate production call-site query found 257 calls to those 50 doors: 254 inside `register*`
bodies and 3 outside. `copyRenderersFromRenderState` replays renderer entries while deriving a target
state, so it is setup-time copying. `createExternalGlTexture` and `createExternalWgpuTexture` each install
their external-texture resolver on demand and may run after state setup. Those two are real
post-build-capable registry mutations in the current API; a build-once/frozen design must relocate or
otherwise account for them rather than treating the non-registrar query as empty.

The eight former hidden-loop/array rows count bodies, not runtime pairs. Hand-reading all eight gives
the real units below. `N` is the input length, `U(x)` the number of distinct keys, `G` the number of
distinct groups, `D` the number of final distinct descriptor ids, and `V` the number of schemes that
pass validation and whose host registration succeeds.

| Registrar | Runtime contribution on a fresh target |
|---|---|
| `registerAssetDescriptor` | `1 + G`: one descriptor entry plus one newly-created group entry per distinct group; membership is an array append, not another table pair |
| `registerAssetManifest` | `D + G`: duplicate ids collapse to their final descriptor before the descriptor registrar runs |
| `registerWebImageDecoders` | **6 fixed pairs**: PNG, JPEG, WebP, GIF, AVIF, BMP |
| `registerWebImageEncoders` | **3 fixed pairs**: PNG, JPEG, WebP |
| `registerProtocolSchemes` | `N` host registration attempts and `V` successful host bindings; it contributes no in-memory kind→implementation table pair |
| `registerRenderers` | `N` door calls and `U(kind)` final pairs |
| `registerDefaultGlBlendModes` | **6 fixed pairs**: Add, Darken, Lighten, Multiply, Normal, Screen |
| `registerCanvasShapeCommands` | `N` door calls and `U(command.key)` final pairs |

`registerWebImageDecoders()` is the named counterexample to treating one loop body as one
registration: it is a zero-argument assembly, emits six pairs, and therefore turns the old one-row
syntax result into a 6× undercount. Those six missing bindings share one remedy call, which is the
anti-shotgun property in miniature.

The identities are computed from the emitted artifact, not from the earlier prose census:
`300 = 196 readable registrars + 55 generic mechanisms + 49 UNCATALOGUED`. The 196 registrars emit 228
mapping rows. Excluding the 34 deliberate not-kind rows gives
`266 = 196 readable + 55 mechanisms + 15 recorder misses`. The earlier
`300 = 128 + 172` / 139-mapping identity described the pre-constant-folding artifact and is retained as
history, not as the current result.

### Runtime registrar probe

`npm run reachability:runtime:json` is the runtime companion to the syntax inventory. It classifies all
exported registrars first: caller-keyed direct and batch functions are generic doors, while genuine
assemblies are invoked independently. State-held registries receive a new constructible state or
registry per assembly. Rootless assemblies run serially in fresh processes, so module caches cannot
contaminate another registrar's result. Each result names the roots and reachable tables it diffed and
is one of:

- `PROBED` — at least one exact door/kind/implementation delta was observable;
- `PROBED-EMPTY` — the call completed but no delta was observable, with the empty diff scope and any
  WeakMap-owned outside writes retained as findings;
- `UNPROBED` — required state/arguments were unavailable, or a process-global table had no enumeration
  seam, so an intercepted private write could not be promoted into evidence.

The collision pass compares the independently captured registrar pair sets, order-independently. A
door+kind claimed by two assemblies is a collision even though no particular fresh-state run overwrote
anything. The optional combined sequential order-sensitivity pass is explicitly `NOT-RUN`; it answers a
different question and cannot replace the collision pass. State derivation is also checked after each
observable write, retaining `survived`, `lost`, and `not-applicable` per pair.

The measured run classifies all 300 registrars as 55 generic doors and 245 assemblies. Of those
assemblies, 193 are `PROBED`, 14 are `PROBED-EMPTY`, and 38 are `UNPROBED`. The independent probes emit
263 exact pairs: 201 survive state derivation, none are lost, and 62 are not state-derived. The six
order-independent collisions are the `bitmap`, `image`, and `renderTarget` keys on each of
`registerGlTextureResolver` and `registerWgpuTextureResolver`; the claims reuse the same implementation
for a key but arrive through multiple genuine assemblies, so they remain collisions under the stated
door+kind rule.

### Process-global registry census

The runtime artifact also carries the complete 15-table census. `read` and `enumerate` are
caller-serving seams; `clear` is instrument-serving; `unregister` has weak independent justification
because last-write-wins already supplies override. Empty-at-import is recorded and asserted at runtime
where enumeration exists, but it is inherited from the repository's no-top-level-side-effects rule,
not proposed as a fifth-tier-specific contract.

| Table (door) | enumerate | read | clear | unregister | import baseline | production reader packages |
|---|---|---|---|---|---|---|
| audio decoders (`registerAudioDecoder`) | `getAudioDecoderMimeTypes` | `getAudioDecoder` | — | `unregisterAudioDecoder` | empty | audio |
| decompressors (`registerDecompressor`) | — | `getDecompressor` | — | `unregisterDecompressor` | empty | compression, font-formats, scene3d-formats, swf |
| debug subsystems (`registerDebugSubsystem`) | — | `enableDebug` | — | `unregisterDebugSubsystem` | empty | debug |
| image bitmap composers (`registerImageBitmapComposer`) | `getImageBitmapComposerKinds` | `getImageBitmapComposer` | `clearImageBitmapComposers` | `unregisterImageBitmapComposer` | empty | image, image-codec |
| image decoders (`registerImageDecoder`) | `getImageDecoderMimeTypes` | `getImageDecoder` | `clearImageDecoders` | `unregisterImageDecoder` | empty | image-codec |
| image encoders (`registerImageEncoder`) | `getImageEncoderMimeTypes` | `getImageEncoder` | `clearImageEncoders` | `unregisterImageEncoder` | empty | image-codec |
| coarse hit tests (`registerHitTest`) | — | `hitTestGraphPoint` | — | — | empty | interaction |
| precise hit tests (`registerHitTestPrecise`) | — | `hitTestGraphPointPrecise` | — | — | empty | interaction |
| log serializers (`registerLogSerializer`) | — | `createJsonLogFormatter` | `clearLogSerializers` | — | empty | log |
| particle formats (`registerParticleFormat`) | `getRegisteredParticleFormats` | `getParticleFormatCodec` | — | `unregisterParticleFormat` | empty | particles-formats |
| skeleton animation target binders (`registerSkeleton2DAnimationTargetBinder`) | — | `getSkeleton2DAnimationTargetBinder` | — | `unregisterSkeleton2DAnimationTargetBinder` | two built-ins at import | skeleton2d |
| skeleton constraint solvers (`registerSkeleton2DConstraintSolver`) | — | `solveSkeleton2DConstraints` | — | `unregisterSkeleton2DConstraintSolver` | empty | skeleton2d |
| skeleton formats (`registerSkeleton2DFormat`) | — | `parseSkeleton2D` | — | `unregisterSkeleton2DFormat` | empty; two built-ins on first read | skeleton2d-formats |
| spritesheet formats (`registerSpritesheetFormat`) | — | `parseSpritesheet` | — | — | empty; five built-ins on first read | spritesheet-formats |
| texture-atlas formats (`registerTextureAtlasFormat`) | — | `parseTextureAtlas` | — | — | empty; four built-ins on first read | textureatlas-formats |

All 15 have a read path, but only 5 enumerate and 11 have either clear or unregister isolation. Four
tables have neither isolation seam, and 10 cannot enumerate. Only decompressors (four packages) and
image bitmap composers (two) have production reads spanning more than their owning package. That read
graph is part of the evidence needed to decide fifth-tier-versus-drift; this census converts neither.

The existing top-level-side-effect gate was separately widened in a throwaway measurement and left
unchanged. Its current `ExpressionStatement` walk misses all other statement categories. Applying the
same effect-expression predicate recursively to top-level non-expression statements found **444
`VariableDeclaration` statements in 226 files across 81 packages**, and zero current `if`, loop, or
other statement-category hits. That is a flood, not a mechanical gate patch: it includes initializer
allocations/calls and needs a scope ruling before any widening lands.

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

**It carries no tombstone, and no composition operations at all — BECAUSE nothing composes it.** This is
the ruled shape, and the reasoning is the precondition, not a preference: composition today is exactly one
mechanism (`copyGlRenderStateRegistrations`), every field it copies is a render registry, and SWF parsing
does not reach it — an importer is not a render state. No overlay omits a wire-format token reader, and
out-of-range is already the format's own skip path. So an ordinal table is not "the composable table minus
the sentinel"; it is a structurally different type that cannot be passed where a composable table is
expected, so the exemption cannot be rediscovered later as a quiet third meaning.

★ **The precondition, and the tripwire.** This rests on
[`Scene2DDocumentImporterRegistry` being uncomposed](#deferred--the-scene2ddocumentimporterregistry-question),
which is deferred, not settled. If that registry becomes composable *and* tag readers come to live in it,
an ordinal table acquires an overlay path and this decision re-opens. **Adding a composition operation to
this type is itself the trigger** — the structural separation means acquiring an overlay path requires
editing right here, so whoever does it has their hand on this note. When that happens, the hot-path cost
of a discriminant read on a direct-index path **must be measured before the type is weakened**; it has not
been measured, and an unmeasured performance claim is not grounds for a weaker type.

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
// SUPERSEDED as written: these three members were the cases the hand-written coverage walks distinguished
// when this was proposed. `SceneCoverage` has since split on remedy into five states — `Satisfied`,
// `Unregistered`, `Unavailable`, `FallbackRemediable`, `FallbackUnavailable` — retiring both `Missing` and
// bare `Fallback`. Re-derive this policy from those before building on it; it is left here as the shape of
// the question, not as a current answer.
export type RegistryMissPolicy =
  | { readonly coverage: 'Fallback' }
  | { readonly coverage: 'FallbackWhen'; readonly key: Kind }
  | { readonly coverage: 'Missing' };

export interface RegistryTableBase {
  readonly onMiss: RegistryMissPolicy;
  readonly registry: RegistryId;
}

// Open key -> ENTRY lookup, last write wins. `entries` holds `RegistryTableEntry<T>` rather than `T` for
// two reasons, both load-bearing. It is the only place a tombstone can be represented at all — a sentinel
// the storage cannot hold is not a sentinel. And because these tables are plain data with public fields,
// an assembly can iterate `table.entries` without calling anything of ours; holding the union means that
// loop fails to compile until it narrows, so the constraint defends the FIELD and not merely the function.
//
// `ReadonlyMap`, not `Map`: `readonly entries` freezes the field and leaves the map mutable, which a
// persistent table cannot survive — a replacement table means nothing if a caller can mutate the map both
// tables share.
export interface KeyedTable<T> extends RegistryTableBase {
  readonly entries: ReadonlyMap<Kind, RegistryTableEntry<T>>;
  readonly shape: 'keyed';
}

// A one-element vocabulary: the capability is present or it is not. Its key is its own RegistryId, so
// explain addresses it uniformly and a missing shape rasterizer reports once rather than once per node
// kind that wanted it.
export interface SlotTable<T> extends RegistryTableBase {
  readonly entry: RegistryTableEntry<T> | null;
  readonly shape: 'slot';
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

// Clears `out`, then appends every BOUND key in sorted order — a tombstoned key is NOT listed. Stated
// rather than inferred because the alternative is the present-in-keys, absent-on-lookup trap: a caller
// that enumerates and then resolves would get `null` for a key this function just said was there.
// Enumeration and resolution must not disagree. Sorting here rather than in storage is what lets the
// keyed shape stay a map.
export function getRegistryTableKeys(out: Kind[], table: Readonly<RegistryTable<unknown>>): void;

// FALSE for a tombstoned key. Same reason as the keys rule above, one call apart: `has` answering true
// where `get` answers null is that same disagreement wearing a different name.
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

// OMIT. Binds `key` to the tombstone: "this table has an opinion about `key`, and the opinion is NOTHING."
// Under composition the overlay's tombstone WINS and the base's entry does not survive.
//
// The opposite of `withoutRegistryTableEntry`, which it reads almost identically to in English and which
// composes the other way. Both leave `getRegistryTableEntry` answering null on a table with no base, so
// the difference is invisible until the table is composed — see the note under that function.
export function withRegistryTableTombstone<T>(
  table: Readonly<RegistryTable<T>>,
  key: Kind,
): RegistryTable<T>;

// NO OPINION. Removes `key` from the table entirely, so under composition the base's entry is INHERITED.
// This is the splice `unregisterScene2DDocumentImporter` performs today, named for what it means rather
// than for what it does to storage.
//
// The opposite of `withRegistryTableTombstone`: that one overrides the base with nothing, this one
// declines to override at all. There is no third union variant for this, and there should not be — "no
// opinion" is the key being ABSENT from the map, so there is nothing to store and therefore nothing to
// type. Typing it would mean storing it, which is the tombstone.
//
// ★ These two are the trap. `withRegistryTableTombstone` and `withoutRegistryTableEntry` read the same way
// to a reader skimming, produce the SAME observable result on an uncomposed table, and have OPPOSITE
// consequences the moment anything derives from it. Choose by what you mean — override-with-nothing, or
// decline-to-override — never by which looks right at the call site.
export function withoutRegistryTableEntry<T>(
  table: Readonly<RegistryTable<T>>,
  key: Kind,
): RegistryTable<T>;
```

Second-order consequence, harmless today and silently load-bearing later: **a tombstone written into a
table that nothing derives from is meaningless**, because there is no base for it to override. It becomes
meaningful the first time someone composes that table — so a tombstone placed "for symmetry" while the
distinction is inert is not inert, it is a decision deferred to whoever adds the first overlay.

### The tombstone must not compile where a value is expected

A tombstone that some readers ignore is worse than no tombstone, because it looks handled. So the
sentinel is a discriminated union, and the reason it is not an optional flag or a reserved value is that
both of those *type-check* at every site that never heard of them:

```ts
// Not `T | null` and not `{ value: T; omitted?: boolean }`. Neither of those can fail a build: a reader
// that has never heard of tombstones assigns them straight through. This union is NOT assignable to `T`,
// so the only way to reach the value is to narrow, and the only way to narrow is to have handled both.
// Discriminant values follow the repo's established const-object + typeof spelling (as `RenderRegistry`
// does). The union of SHAPES cannot collapse into a const object — the variants carry different payloads,
// which is the whole point — but the spelling of the values should match existing precedent rather than
// introduce a second way to write the same thing.
export const RegistryEntryState = {
  Bound: 'bound',
  Tombstoned: 'tombstoned',
} as const;

export type RegistryEntryState = (typeof RegistryEntryState)[keyof typeof RegistryEntryState];

export type RegistryTableEntry<T> =
  | { readonly state: typeof RegistryEntryState.Bound; readonly value: T }
  | { readonly state: typeof RegistryEntryState.Tombstoned };
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
- **Do all ~65 registries share `Satisfied` / `Unregistered` / `Unavailable` / `FallbackRemediable` /
  `FallbackUnavailable`?** Those five are the current `SceneCoverage` states, and they are
  render-specific. A decompressor or an importer registry may not have a fallback state at all. Reuse
  outside scene and render is still open, and any reuse must preserve the remedy split: a state naming a
  call the caller can write is not the same state as one proving no such call exists.
- **Which tables are pure policy?** Prerequisite to the wiring tier, per the retraction above.

## Deferred — the `Scene2DDocumentImporterRegistry` question

★ **Ruling this registry composable re-opens the [`OrdinalTable` tombstone exemption](#ordinaltable--integer-token-formats-only).**
That exemption is granted on the precondition that nothing composes an ordinal table, and this registry is
the only candidate path by which one could.

**The question, in one sentence:** does `Scene2DDocumentImporterRegistry` become a `RegistryTable`, and if
so with what ordering, ownership, and removal semantics — or is it a genuinely different thing that the
table vocabulary should not absorb?

It is deferred because it is the one registry that already answers several of this document's open
questions *differently from every other*, so folding it in would either change it or weaken the model.
Stated below from source (`packages/scene2d-resources/src/scene2DDocumentImporterRegistry.ts`), so a ruling
does not have to reconstruct it.

**What it actually is today.** A `createEntity({ entries: [] })` — an ordered **array**, not a map — passed
explicitly by the caller into every operation. `createScene2DDocumentFromBytes` walks it in order, calls
`entry.matches(source, context)`, and takes the first hit.

**Five ways it differs, each bearing on a different open question:**

1. **Ownership.** It is the only registry built as a **caller-owned value**; every other lives on a render
   state's runtime. It is therefore the existing evidence for the ownership-tier question, and the shape a
   caller-owned registry would be modelled on.
2. **Ordering is contractual.** First-match probe: which importer wins is decided by position. The document
   already ruled the general case for detect-registries — *precedence belongs on the entry as an explicit
   value* — but explicitly deferred **what moving this one off ordered entries would cost**. Note the
   partial mitigation already in source: `registerScene2DDocumentImporter` replaces in place when the kind
   exists, so re-registering an importer keeps its position and cannot silently move a format in the queue.
   The unresolved half is ordering *between different kinds*, which is still insertion order.
3. **It is the only registry with a real removal verb — RULED 2026-08-10.** `unregisterScene2DDocumentImporter`
   **splices** the entry out. That is a third *meaning* beside bound and tombstoned, but **not** a third
   stored *state*: "no opinion" is the key being absent from the map, so there is nothing to store and
   nothing to type. It is a distinct **verb** — `withoutRegistryTableEntry` — not a union variant. At the
   port, use `without*`: a splice means inherit-the-base, which is the opposite of a tombstone. The
   distinction is inert for this registry today (item 4), which is not a reason to pick casually — "inert
   today" is exactly the quiet exception this document keeps finding.
4. **Composition — the flip condition.** Nothing copies, merges, concatenates, derives, or overlays it
   today (checked for all five verbs). That fact is what grants the `OrdinalTable` exemption above. A
   ruling that gives it overlay semantics re-opens that decision and triggers the measurement requirement
   stated there.
5. **Requirements prescan.** It is the only place a prescan producing requirements could originate: matching
   bytes to an importer is the step that could report what a document will need before anything is wired.
   That is a lifecycle question rather than a table-shape one, and it is why the answer matters beyond this
   document — see [registration lifecycle](registration-lifecycle.md).

**Not ruled here.** The four options visible from source are: leave it as-is; keep the array and add an
explicit precedence field per the general detect ruling; model it as a new table shape; or model it as a
`KeyedTable` plus a separate ordered probe list. Each interacts with items 1–5 differently and this
document does not choose between them.
