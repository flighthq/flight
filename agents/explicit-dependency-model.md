# Explicit Dependency Model

_2026-08-29. Architecture record — replacing ambient state with explicit, value-based dependency threading across the SDK._

**Status: RATIFIED 2026-08-29 by the user, and commissioned as the active build.** Read before working on host backends, renderer registration, format parsers, codec registries, or any subsystem that currently uses module-scoped global state. The model below is settled and may be built on. What is *not* settled is sequencing and scope-per-slice — those are in [Commissioning](#commissioning) at the foot of this record, which is manager's, not principal's, and is the part that changes as the program runs.

## Three principles

1. **No magic.** A function signature tells you precisely what it does: what it allocates, what it mutates, what it reads. Explicit `Readonly<>`, explicit `out` parameters, explicit `create*`/`clone*`/`acquire*` verbs. The reader reasons about cost and behavior from the signature alone.

2. **No footguns.** A function that requires something to work correctly takes it as an argument. If you forgot a dependency, you get a type error at the call site — not silent wrong output discovered by staring at pixels. The distance between cause and symptom must be zero.

3. **Pay for what you use.** If you buy the whole store, the receipt is clear. If you buy one thing, you pay for one thing. Scope follows cost. `importEverything()` is not an anti-pattern — importing everything without knowing what it costs is.

These three principles are not new. What is new is applying all three *consistently*, especially principle 2. Flight has been strong on (1) and (3) but weak on (2): functions that require renderer registration, backend installation, prepare passes, texture resolvers, and codec registries reach for ambient state rather than taking them as arguments. The function succeeds, the output is wrong, and the cause is invisible in the signature.

## The change

**Ambient mutable state becomes explicit values passed at the call site.**

Anywhere Flight currently has `register*(globalState, ...)` or `set*(globalBackend)` followed by functions that silently reach for that global state, the fix is the same: build the registry/config as a value, pass it to the function that needs it.

Two mechanisms carry this: **const objects** for stateless implementations, and **trait constraints** on functions that consume them. Together they replace the 48 `set*Backend` / 44 `install*HostBackend` / 38 `_hostConflict` / 33 observation functions with plain imports and structural typing.

## Const objects over factories

Backends and renderers are typically stateless — thin wrappers around platform APIs or rendering algorithms. A factory is overhead when there's nothing to construct. The default path is a const object, importable directly:

```typescript
import { spriteRenderer, shapeRenderer } from '@flighthq/scene2d-gl';
import { webHost } from '@flighthq/host-web';
import { webNetBackend } from '@flighthq/host-web';
```

**Naming rule:** the const is the thing. No `default` prefix. `spriteRenderer`, not `defaultSpriteRenderer`. Variants are qualified: `batchedSpriteRenderer`, `instancedSpriteRenderer`. The unqualified name is the one you reach for first. A user's custom implementation is `myCustomShapeRenderer`.

Factories exist alongside for cases that need configuration (custom headers on a net backend, a specific sample rate). But the standard path is: import the const, use it.

A const backend that internally manages platform state (an `AudioContext`, a connection pool) is fine — the backend IS the boundary. Its contract is the interface it implements; how it fulfills that internally is its business. What the explicit dependency model eliminates is functions reaching for *Flight's* ambient state, not platform resources managed within a backend implementation.

## Trait constraints

Functions that need a capability take the whole host object, constrained by a structural trait interface. The compiler enforces that the host has the required capability. No runtime check, no sentinel, no stub.

```typescript
// Trait interfaces — structural, in @flighthq/types
interface HasNetHttp {
  readonly net: { readonly http: NetBackend };
}

interface HasAudioDevice {
  readonly audio: { readonly device: AudioDeviceBackend };
}

// Functions declare what they need
function fetchResource(host: HasNetHttp, url: string): Promise<Response> {
  return host.net.http.fetch(url);
}

function playSound(host: HasAudioDevice, soundId: string): void {
  host.audio.device.play(soundId);
}
```

The callsite passes the host; the trait does the rest:

```typescript
fetchResource(webHost, url);           // webHost satisfies HasNetHttp
playSound(webHost, soundId);           // webHost satisfies HasAudioDevice
openFileDialog(minimalHost, options);  // type error — minimalHost has no dialog.file
```

This is the same pattern as `getNode2DBounds(node: BoundsNode)` — the function declares the trait it needs, the compiler enforces it, the distance between cause and symptom is zero.

**Multi-capability functions compose via intersection:**

```typescript
type LoaderHost = HasNetHttp & HasAudioDevice;
function loadAndPlay(host: LoaderHost, url: string): Promise<void> { ... }
```

The intersection type IS the documentation of what the function costs.

**Platform name on the const, generic signature on the consumer.** `webHost`, `limeHost`, `tauriHost` encode the platform in the object name. Functions that consume them (`fetchResource`, `playSound`) carry no platform name — they work with any host that satisfies their trait. This is the same pattern as renderers: `createGlRenderState()` encodes the backend once at construction; everything downstream takes `RenderState` generically.

## Host structure

Host uses two-level nesting. The top level is a domain group (always present, never `undefined`). The second level is capability slots within that domain (optional — present if the host supports them).

```typescript
interface Host {
  audio: AudioCapabilities;
  dialog: DialogCapabilities;
  window: WindowCapabilities;
  clipboard: ClipboardCapabilities;
  net: NetCapabilities;
  // ~10-12 domain groups
}

interface AudioCapabilities {
  device?: AudioDeviceBackend;
  // future: capture?, spatial?
}

interface DialogCapabilities {
  file?: FileDialogBackend;
  message?: MessageDialogBackend;
  prompt?: PromptDialogBackend;   // split from message; see First inventories
}

// WITHDRAWN — window's real granularity is per-operation, not three slots.
// See First inventories. Kept here only to show what the two-level sketch
// originally proposed and why guessing level two is banned by R7.
interface WindowCapabilities {
  management?: WindowManagementBackend;
  fullscreen?: WindowFullscreenBackend;
  appearance?: WindowAppearanceBackend;
}
```

**Why two levels:**

- **Groups are always present** so access is one `?.` check: `if (host.audio.device) playSound(host, soundId)`. No double-optional.
- **Forward-compatible decomposition.** When a real host proves that audio playback and audio capture are independent, add `host.audio.capture`. Code using `HasAudioDevice` (which requires `audio.device`) is unaffected.
- **No prediction needed.** A domain with one capability today (audio: just `device`) is not assumed to be atomic forever. The group structure handles growth without breaking existing traits or call sites.
- **Discoverable.** `host.audio.` autocompletes to show what audio capabilities exist. `host.dialog.` shows dialog capabilities. ~10-12 top-level groups, not 25-30 flat fields.

**Construction:**

```typescript
// Full web host — convenience const
import { webHost } from '@flighthq/host-web';

// Partial host — manual assembly
const host = createHost({
  audio: { device: webAudioDeviceBackend },
  net: { http: webNetBackend },
  window: { management: limeWindowManagementBackend },
});

// createHost fills empty groups automatically
// host.dialog exists but is {} — no dialog capabilities
```

### 1. Host replaces set*Backend / install*HostBackend

Today: 48 `set*Backend()` + 44 `install*HostBackend()` calls mutate module-scoped singletons. Functions reach for the singleton internally. If no backend is installed, a sentinel silently returns a default value. Three-tier precedence (custom > host > sentinel) adds complexity.

After: `webHost` is a const object with all web backends. Functions take the host with a trait constraint. The precedence model disappears — you passed what you passed.

**What goes away:**
- `enableHostWeb()` and all `enableHostWeb*()` calls — replaced by importing `webHost` or individual `web*Backend` consts
- `set*Backend()` / `get*Backend()` — replaced by host fields
- `install*HostBackend()` / `explain*Backend()` — no installation ceremony, no failure to diagnose
- `_hostConflict` implementations — no conflict possible; the host is a value, not a mutable singleton
- Host observation functions — no mutation to observe

### 2. Pipeline: immutable render configuration

Today: ~10 `register*` calls mutate the render state after construction — renderers, texture resolvers, materials, blend modes, shape rasterizer, shape commands, stroke tessellator, shaders. If you forget one, the affected node kind silently doesn't render. A typical 2D GL example makes 10 registration calls; a full 3D app makes more. The current render state mixes immutable configuration (what renders what) with mutable per-frame state (current framebuffer, scissor stack, traversal position).

After: immutable configuration becomes a **pipeline** — a const object carrying all registries. Mutable per-frame state stays on the render state. The render state references a pipeline and a context state.

```typescript
import { scene2dGlPipeline } from '@flighthq/scene2d-gl';

const glContext = createGlContextState(gl);
const state = createGlRenderState(glContext, scene2dGlPipeline);
```

`scene2dGlPipeline` is a const carrying: node renderers (Sprite, Shape, TextLabel, RichText, DisplayObject, RenderCache, QuadBatch, TileMap, ParticleEmitter, BitmapText), texture resolvers (Bitmap, Image, CompressedImage, RenderTexture), standard material renderer, blend mode realizations, shape rasterizer, shape commands, stroke tessellator, default bitmap shader. The same pattern applies per backend and dimension: `scene2dCanvasPipeline`, `scene2dWgpuPipeline`, `scene3dGlPipeline`, `scene3dWgpuPipeline`.

A user who wants less builds a manual pipeline — same type, same mechanism:

```typescript
const pipeline = createGlPipeline({
  renderers: createRendererRegistry([
    [SpriteKind, spriteRenderer],
  ]),
  textureResolvers: createTextureResolverRegistry([
    [BitmapSourceKind, bitmapTextureResolver],
  ]),
  blendRealizations: standardBlendRealizations,
  defaultBitmapShader: bitmapShader,
});

const state = createGlRenderState(glContext, pipeline);
```

A 3D pipeline extends a 2D pipeline via spread:

```typescript
const scene3dGlPipeline = createGlPipeline({
  ...scene2dGlPipeline,
  meshMaterialRenderers: [...],
  pbrExtensions: [...],
});
```

**Texture resolution belongs on the pipeline, not individual renderers.** It is shared GPU infrastructure — every renderer that consumes textures (sprite, tilemap, quadbatch, mesh) needs the same resolver backed by the same GPU texture cache. Putting it on individual renderers would force the user to thread the same resolver to every texture-consuming renderer, with duplicate GPU uploads if they passed different instances.

**The prepare pass stays separate from the render call.** It propagates transforms, alpha, visibility, and materials from the scene graph into render proxies. Keeping it explicit allows: (1) inserting a 3D skinning deform pass between scene updates and prepare, (2) preparing once when rendering the same scene to multiple targets, (3) skipping prepare on static scenes. A dev-mode guard warns when render is called without a preceding prepare — making the mistake impossible to miss, not impossible to make.

### 3. Format parsers with explicit feature registries

Today: `parseSwf(buffer)` uses a fixed internal set of tag parsers and decompressors. The user cannot control which tags are parsed or which decompressors are available.

After: the parser takes an explicit configuration carrying only the features the user wants.

```typescript
const swfConfig = createSwfParserConfig({
  decompressors: [zlibDecompressor, lzmaDecompressor],
  tagParsers: [shapeTagParser, spriteTagParser, imageTagParser],
});

const result = parseSwf(swfConfig, buffer);
```

**What changes:**
- A user who only needs shapes from SWF files imports only the shape tag parser and pays only for that.
- `fullSwfParserConfig` (a const) provides the batteries-included version — same explicit shape, all features included.
- The same pattern applies to every `*-formats` parser: glTF section parsers, texture format decoders, scene-document schema registries.

## Graphics context and render state

The current `GlRenderState` mixes three concerns: acquiring the raw GL context, managing shared GPU state (shader cache, texture cache, GL binding shadow), and holding per-pipeline configuration (renderer registry, traversal, clip stacks). The shared GPU state is hidden behind `Object.defineProperty` getters/setters that redirect field access from the per-state runtime to a shared context runtime via a WeakMap — invisible indirection that makes the runtime look like it has plain fields when it doesn't.

The fix is three explicit layers, each with a clear owner:

**1. Acquisition — host capability.** How you get the raw GL context or WGPU device. Platform-specific. Web acquires from a canvas element. Lime already has one from its window. This is the only layer a new host must implement. It is a host capability trait (`HasGlAcquisition`, `HasWgpuAcquisition`).

```typescript
// Web
const gl = acquireGlContext(host, canvas, { antialias: true });  // host: HasGlAcquisition

// Native — host already has the context
const gl = limeWindow.glContext;  // no acquisition capability needed
```

**2. Context state — platform-agnostic.** Wraps the acquired context + owns the shared GPU tier: binding shadow (`currentProgram`, `currentTexture`, `currentBlendMode`), compiled shader programs, texture caches, GPU buffers, extension queries. This is openfl's `Context3DState` made explicit. No `Object.defineProperty`, no WeakMap — a plain object that render states hold a visible reference to. Does not know or care how the raw context was obtained.

```typescript
const glContext = createGlContextState(gl);  // same code on every platform
```

**3. Pipeline — immutable configuration.** What renders what: renderer registry, texture resolvers, material renderers, blend realizations, shape rasterizer, shaders. Built once as a const, potentially shared across render states. See [section 2](#2-pipeline-immutable-render-configuration) for the full registry inventory.

**4. Render state — mutable per-frame.** Current framebuffer, scissor stack, traversal position, flush state. Lean. References a context state and a pipeline.

```typescript
const glContext = createGlContextState(gl);
const state1 = createGlRenderState(glContext, scene2dGlPipeline);
const state2 = createGlRenderState(glContext, scene3dGlPipeline);
// Both share glContext's shader cache, texture cache, binding shadow — visibly
// Each has its own pipeline (different renderers) and its own mutable frame state
```

The test for whether something belongs to a layer: "does a new host have to define this, or change how this works?" Acquisition: yes — host feature. Context state: no — generic. Pipeline: no — generic. Render state: no — generic. A new host implements one small capability (give me a GL context / give me a WGPU device), and everything above is Flight's code.

The WGPU parallel is identical: `acquireWgpuDevice` (host capability) → `createWgpuDeviceState(device, format)` (context state: pipeline cache, layouts, samplers, texture upload cache) → `createWgpuRenderState(wgpuDevice, scene2dWgpuPipeline)` (mutable per-frame + immutable pipeline).

## Other subsystems affected

The same pattern (ambient global state → explicit value argument) applies to:

- **Scene-document materialization** — the kind-to-constructor mapping and schema registry are currently implicit. Becomes an explicit config passed to materialize functions.
- **Image codecs** — `registerWebImageEncoders()` mutates a global registry. Becomes an explicit codec registry passed to encode/decode.
- **Compression** — `@flighthq/compression` has a global decompressor registry. Becomes an explicit registry passed to things that decompress.
- **Asset loading** — `loader`/`assets` reach for global net and codec state. A loader config carrying its host (via trait), codec registry, and texture resolver makes the dependency chain visible.
- **Text shaping** — the canvas text shaper is globally installed. Becomes an explicit shaper passed to text layout functions.

## The convenience layer

The explicit path is precise but verbose. Convenience consts are essential:

- `webHost` — const, full web host with all backends
- `fullSwfParserConfig` — const, all SWF tag parsers and decompressors
- `scene2dGlPipeline` — const, all standard 2D GL renderers, resolvers, materials, blend modes, shape infrastructure, shaders
- `scene3dGlPipeline` — const, all 3D GL renderers, mesh materials, PBR, extends the 2D pipeline
- `scene2dCanvasPipeline`, `scene2dWgpuPipeline`, `scene3dWgpuPipeline` — per-backend equivalents

These are **discoverable shortcuts to the explicit path**, not a different API. Each const is the same type as a manual assembly. A user starts with the convenience, then replaces it with manual assembly when they want to optimize — and the types guide them because the shape is identical. No tiers (core/standard/full) — one const per backend per dimension. `explain()` covers "am I paying for too much?"

## Entity boundary

Entity is the base type for every SDK object — anything you `create*`, hold a reference to, and pass across call boundaries. The runtime slot is the enforcement mechanism: it forces code through the constructor, which gives consistent V8 hidden classes, portable concrete types (Haxe/Rust/C++ auto-porting), and the package-private runtime extension point. A plain object literal that happens to match the public fields has no runtime, and any function touching `getRuntime(entity)` catches the difference immediately.

**Entity:** Host, Pipeline, GlContextState, WgpuDeviceState, backends, renderers, renderer registries, parser configs, codec registries, nodes, textures, meshes, materials, matrices, rectangles, vectors — anything the user creates and holds.

**Not Entity:** descriptors (plain data literals — effect descriptors, adjustment descriptors, material descriptors), options/config bags (consumed once by a `create*` call and discarded), query results and intermediates (bounds results, hit test results, `out`-parameter values), and type-only constructs (trait interfaces, capability group interfaces, kind constants).

The rule for `create*`: **`create*` always returns Entity. If something shouldn't be Entity, it doesn't use `create*`.** Descriptors use object literals. Options use object literals. There is no `build*`, `make*`, or `assemble*` verb to avoid Entity — the question is whether the thing has identity and ongoing reference. If it does, it's Entity.

**Tree-shaking with const Entity instances.** A const like `webHost` or `scene2dGlPipeline` is a module-scope `createHost(...)` / `createGlPipeline(...)` call. ES modules evaluate lazily: the constructor runs only when the module is first imported. If nobody imports it, it tree-shakes out entirely. But if both `webHost` and individual backends (`webNetBackend`) live in the same file, importing either evaluates the whole file. So the whole-store const and the individual backends live in **separate source files** within the package, re-exported through the package root. Import `webHost` → pay for everything. Import `webNetBackend` → pay for net only.

## Module-scoped scratch state

Module-scoped `_scratch*`, `_temp*`, and `_pool` variables are **performance infrastructure, not capability dependencies**. They do not move to explicit arguments. The principle: module-scoped state for **allocation/identity** (scratch buffers, object pools, handle counters, guard enable flags) is fine. Module-scoped state for **capabilities** (backends, registries, codecs) is the target of this model.

## Unused-registration diagnostics

The old rule: "importing everything is an anti-pattern." The new rule: **"know what you imported."**

`importEverything()` is fine. Importing everything without knowing what it costs is not. To close this gap, registries support an `explain()` style diagnostic that reports what was registered but never exercised:

```
Registry: renderers
  Registered: Sprite, Shape, Text, TileMap, QuadBatch, Mesh
  Exercised:  Sprite, Shape
  Unused:     Text, TileMap, QuadBatch, Mesh

Host: webHost
  Installed:  audio.device, dialog.file, dialog.message, net.http, clipboard.access
  Exercised:  net.http, audio.device
  Unused:     dialog.file, dialog.message, clipboard.access
```

This is the diagnostics inversion principle applied to **cost** instead of failure. Today's `explain*` tells you why something didn't work. This tells you what you're paying for but not using.

This is a **reporting layer, not an enforcement layer**. It does not prevent registering things you don't use. It makes the cost visible so you can act on it when ready.

## Error results are domain-specific

The explicit dependency model eliminates the "unsupported" sentinel — a missing capability is a type error, not a runtime `null`. The remaining failure modes (denied, timeout, I/O error, missing resource) are **domain-specific, not a global pattern**. HTTP has many terminal conditions and earns a discriminated result. Clipboard either worked or didn't — `string | null` may be perfectly honest. Each capability's error surface should match the domain's actual failure modes, designed when that capability is built under the new model.

## What this is NOT

- **Not a DI framework.** There is no container, no auto-wiring, no reflection, no runtime resolution. You import a const or build a value and pass it. The value is a plain object with typed fields.
- **Not a breaking change to the cellular architecture.** Packages still own their domains. What changes is how cross-package dependencies are expressed: as arguments rather than ambient state.
- **Not incompatible with tree-shaking.** Tree-shaking operates at import time. Explicit arguments operate at call time. A texture resolver passed as an argument tree-shakes identically to one installed globally — the bundler sees the same import either way. What changes is that the *user* can see it too. Importing `webHost` (all backends) is slightly larger than importing `webNetBackend` alone, but the tradeoff is explicit: the user chose `webHost` and the types tell them what it carries.

## Relationship to existing work

- **P1 (partial backend composition)** — the Host capability-group structure supersedes the `set*Backend` / `install*HostBackend` / `explain*Backend` ceremony. Partial composition becomes structural: a Host with 3 capabilities has 3 capabilities. No sentinel, no precedence, no query. MediaSession's former conditional ambient composition is superseded by its explicit `session` / `sessionAction` slots.
- **P3 (transport bypass audit)** — the derived gate still matters, but the fix changes. Instead of moving bypasses into `createWeb*Backend` functions, the fix is ensuring the function takes a host argument (via trait) rather than reaching for ambient state.
- **P5 (DOM seams)** — the GL/WGPU host acquisition seam becomes a factory argument to render state construction rather than a separate `setWgpuHostBackend` call. Generic contracts expose semantic capabilities rather than browser objects.
- **Node trait system** — the `Has*` trait pattern on Host mirrors the existing `BoundsNode`, `Transform2DNode`, `Spatial2DNode` pattern on nodes. Both are structural interfaces constraining function arguments to guarantee capabilities at compile time.
- **Registration model** — the current `register*` functions become registry-builder helpers operating on explicit values rather than state mutators. The registration model doc needs updating to reflect this.
- **flight-hx consumer feedback** — independently identified the same three top priorities: composable backend capabilities, scoped host configuration, and deterministic renderer/resource ownership. This model addresses all three.

## Open design

All three items that stood here are now dispositioned — none blocks code.

- **Context state field inventory** — became slice **B-inventory**, and it runs FIRST in strand B, ahead of the type spine. Do not cite this record's field count: the array in `packages/render-gl/src/glRenderState.ts` holds **34** entries, not 36, and `WGPU_DEVICE_RUNTIME_KEYS` must be counted the same way. Derive the roster and print its members; the classification (context tier / pipeline tier / render-state tier) is the slice's actual product.
- **Offscreen render state creation** — became slice **B-offscreen**. Sharing is structural: `createGlOffscreenRenderState` takes the same `GlContextState` and pipeline as the primary state rather than deriving from it.
- **Pipeline mutability** — **RULED, see [Commissioning](#commissioning) R2.** Pipelines are immutable; late registration is rebuild-and-swap, not a mutation path.

## Commissioning

_Manager's section, 2026-08-29. The model above is principal's and is now settled. This section is sequencing, scope, and standing rulings; it is rewritten as the program runs and carries no design authority over the model itself._

### Standing rulings — do not re-litigate these

**R1 — Types first, in `@flighthq/types`, before any implementation.** `Host`, the capability-group interfaces, every `Has*` trait, `GlContextState`, `WgpuDeviceState`, the pipeline and registry types: all of them are exported types and therefore live in `@flighthq/types`, split across its `.` and `/contract` lanes. No implementation package defines any of them inline. This is not a style preference — the header *is* the design surface for this model, because the whole point is that a signature tells you what a function needs.

**R2 — Pipelines are immutable. Late registration is rebuild-and-swap.** `createGlPipeline({ ...scene2dGlPipeline, renderers: … })` produces a new pipeline; a render state is pointed at it. There is no `registerIntoPipeline` and no controlled mutation path. A mutation path would reintroduce precisely the ambient mutable state this model exists to delete, and the spread idiom is already the record's own mechanism for 3D-extends-2D — one mechanism, used twice, is better than two. If a real use case proves rebuild-and-swap insufficient, escalate it; do not invent a mutator to get unblocked.

**R3 — No parallel API era.** Flight is pre-release with no compat obligations. A slice removes the old mechanism *and* migrates its call sites in the same commit. `set*Backend` does not survive alongside `Host` as a deprecated path, and a pipeline does not ship beside a still-working `registerRenderer`. Definition of done, mirroring the rule already in force for P5 slices: **site removal + call-site migration + guard/ledger update in one commit.**

  **A green check is not evidence of R3 compliance.** A tree where both the old and new mechanisms work is exactly as green as a tree where only the new one does — the harm R3 prevents is a deprecated path that *outlives* the migration, and no test suite can see it. So a domain migration's definition of done is a **content check** — and it is scoped by a **predicate, never by a roster**: *every function in the domain, **exported or module-internal**, that resolves a backend or a capability from ambient state rather than from an argument.* Derive it per domain from the tree, print the members (R5), and show each absent or justified.

An enumerated list reads as complete whether or not it was derived completely, and this rule exists because a hand-written six-symbol roster was used once and **missed three of eight** — including `getWindowOperationBackend`, the domain's second most-used symbol at 29 call sites and the per-operation ambient lookup itself, missed precisely because it is module-internal rather than exported. A migration that deletes the setters while the *reaching* survives has not migrated. Also expect to find runtime capability queries (`has*Operation`) and host observation functions (`observe*HostResult`) in the population: under this model a missing capability is a compile-time question, and there is no mutation left to observe. Anything deliberately kept is named with its reason and ruled on, not left to inference.

**R4 — The `explain()` cost-reporting layer is deferred, not cancelled — and it is a guard module.** Per the diagnostics inversion rule, unused-registration reporting is separately importable (`enable*Guards` shape, emitting through `@flighthq/log`), never inline in core. Same for the dev-mode prepare guard the model calls for. Both are scheduled after the first registry family exists to report on; a guard with nothing to observe cannot be tested.

**R5 — Derive every roster; never cite a count from this record.** The numbers in the model are illustrative and at least two are already wrong against the tree: 34 context keys, not 36; and "a typical 2D GL example makes 10 registration calls" describes one example, while the render packages export ~100 `register*` functions and the repo exports 322. Every slice derives its own roster from the tree, prints the members, and states where it looked. A total is unfalsifiable in isolation.

**R6 — Behavioural severity floor, unchanged.** Precedence errors, sentinels that throw, wrong provider resolution, teardown leaks, and gate blindness block a slice. Roster prose, manifest wording, and doc drift become follow-ups against the landed slice rather than blocking it.

**R7 — A capability slot is whatever unit the domain's provider coverage actually varies by.** Derived per domain, never a hand-picked noun. Two-level nesting holds; *guessing* what populates level two does not. This was ruled after the first two domain inventories disagreed about what a "group" even is — see [First inventories](#first-inventories-what-they-changed). A domain that has not been inventoried ships its group **empty** rather than guessed: an empty group is honest and forward-compatible, a guessed one is a group that lies, and both worked examples would have been wrong.

**R8 — No slice in this program has a base-publication precondition.** "`A-types` gates the strand" is a **dependency order**, not a publication requirement: the types must *exist to build against*, and where they physically live — integration's clone, a parcel in a builder's inbox, or `quimby/base` — is irrelevant to it. Agent-to-agent handoff carries work at any time; base publication is a synchronisation convenience. Integration may deliver an integrated tree directly to any builder with no host in the loop. **"Waiting for publication" is never a valid status for any agent** — an agent idle for that reason is idle for no reason. This rule exists because the slice graph above was once read as mandating a types-first *base publication*, which it never said, and because treating publication as a precondition has previously idled builders holding completed work.

**R9 — Quality control happens upstream at the builder; it is never a gate at the end of the funnel.** An incomplete slice is not *sent*; anything already *delivered* to integration is merged with its redness surfaced. Holding a cumulative tree to gate one unfinished slice stops every other builder's completed work riding in it, and that cost is invisible to whoever applies the brake, because each of us only sees the slice in front of us. This is the user's own standing instruction to integration — merge, surface if red, do not block the end of the funnel — and it is absolute rather than case-by-case for exactly that reason. Integration may say so and keep merging when anything reads like a hold, a gate, or a precondition, whoever sent it.

**R10 — The API a capability is implemented with does not tell you which domain owns it.** "It calls `screen.orientation`, so it belongs in `screen`" is the same inference that would have collapsed `requestApplicationFullscreen` into `setWindowFullscreen` — and those turned out to be two capabilities with different targets and different exit scopes. Implementation detail is not ownership evidence. Where a capability's home is in question, split the work: put it behind a trait **in place** first (local, reversible, and it delivers the whole direct-reach fix on its own), then relocate a *clean trait* rather than a platform-entangled function, with placement **derived** the way window and dialog were.

**R11 — A subscription is an eligibility edge: the trait requires both halves.** A host providing a subscribe must provide its unsubscribe, because a subscription creates a resource with a teardown obligation and the obligation belongs in the trait rather than in prose. Three uses so far — `open`-requires-`close` on windows, `subscribe`-requires-`unsubscribe` on fullscreen, and the clipboard change subscription — so treat it as the standard shape rather than re-deriving it per domain.

**R12 — "Conditional" is not "sometimes absent." Presence is a construction fact; denial is a domain outcome.** Whether a capability is present is decided by how the *host was built*, never discovered at runtime. A capability gated on a permission or a secure context is **present** on that host, and a refusal at call time is a domain-specific outcome handled like any other denied/timeout/IO case. What must never appear is a slot that is present-or-absent depending on a runtime check, or a `has*Capability()` probe — that is the runtime capability query this model deletes, and `hasWindowOperation` was removed for exactly this reason. *Absent* means the host does not offer it; *denied* means it offers it and the platform said no.

**R13 — A super-group slot may hold only a capability with a single uniform coverage vector.** The moment a domain's derived coverage varies *internally*, it needs the second level for its own slots and is promoted to a top-level group — the shape `dialog` (non-optional group, optional `file?`/`message?`/`prompt?`) and `window` (non-optional group, optional operations) already have. Nesting a varying domain inside a super-group produces `host.ui.clipboard?.text?` — three levels and two optionals, defeating the single-`?.` property that two-level nesting exists for. Clipboard was promoted out of `ui` on exactly this ground. Expect it again: `menu`, `notification`, `share`, `screen` and `sensors` all sit in super-groups undreived, and at least one will likely move. **The record's "~10-12 domain groups" is an estimate written before any domain was derived, and it yields to the derivation** (R5) — never compress a domain into a super-group to protect a number.

**R14 — A stub that *documents* a seam it does not *implement* is deleted, not preserved.** `getWindowDisplay` was an unconditional `return -1` with an unused parameter and an eslint suppression hiding it, under a comment claiming that host-electron and host-winit resolve the display through `@flighthq/screen`. There was no host argument, no lookup, no dispatch — no mechanism by which any provider could ever have supplied a value. The sentinel was the smaller problem: **the comment was false in the durable way**, and the next person to implement multi-monitor support would have looked for the seam it promised, believed the wiring existed, and built against nothing. Delete the function, its export, and its test — a test asserting that a function returning a hardcoded `-1` returns `-1` cannot fail except by editing the constant it pins, so leaving it behind preserves a green assertion about nothing. Expect these as each domain is derived. Deleting is **not** a judgement that the feature is unwanted: when a provider exists it returns as a derived capability slot, never as a sentinel-returning free function, and its placement is derived then (R10) rather than inferred from the API it would be built on.

**R15 — A generic field bag bypasses the classification while passing every gate.** The GL context runtime carries `fields: {}`, and tipping all 34 keys into it would compile, pass, and remove the `Object.defineProperty` indirection — looking complete while applying **no classification at all**. That is a transcription one indirection deeper than the one being removed, and *harder* to see, because the names would no longer be enumerated anywhere. Binding on `BP-owners`: the 34 GL and 17 WGPU members are placed per the C / C\* classification into **typed owner substates**. `C*` means the field's *shape* must be replaced before it enters the spine — those are not fields to move, they are fields to rebuild. **A field arriving in an untyped bag has not been migrated, whatever the gates say.** More generally: when a slice's whole value is a classification, a container that accepts anything is the mechanism by which the classification gets skipped.

**R16 — Coverage decides where slots *split*; shape decides where they cannot *merge*.** A command capability and an event capability never share a slot, whatever their coverage. The suite gives commands a backend you call and events a signal entity with `create*`/`attach*`/`detach*`/`dispose*` plus a teardown obligation; merging them would force one slot to carry two incompatible shapes and leave the eligibility edge (R11) nowhere to attach. Menu's `application` and `select` have identical coverage (Electron/Tauri) and still take separate slots for exactly this reason. **Identical coverage is necessary but not sufficient for grouping** — which is why clipboard's `text`+`clear` merged (both commands) and menu's did not.

**R17 — A no-op or always-false implementation is worse than an absent capability, and is deleted rather than preserved.** Web's menu backend returned unconditional `false` from `setApplicationMenu`, a no-op `subscribeSelect`, and an empty `destroy` — a provider *claiming* three capabilities it does not have. Absence is a type error the caller sees; a no-op is a silent wrong result. Under a derived slot roster these resolve themselves: the provider simply is not in those slots' coverage, and the pretending bodies are deleted. Same family as a stub that documents a seam it does not implement (R14).

**R18 — A signal is a Host event slot only if a *backend* emits it.** If core emits it around its own dispatch, it is a core signal belonging to the owning package's `enable*` group and never to the Host — putting it in the Host would assert that hosts must supply it, which is false, and a future host author would try to implement it. Menu's `onContextMenuOpen`/`onContextMenuClose` are emitted by the core dispatcher around its own popup call, so they stay core signals; `onMenuItemHighlight` is emitted from the DOM overlay that R3 moves into `host-web`, so it becomes a Web-only Host slot. **Determine the emitter *after* the slice's move, not before** — for a domain mid-migration the emitter's current file is not evidence, and ruling on today's location would have placed highlight in the wrong layer. Module-scoped signal state (`_menuSignals`) is explicitly fine: the model permits module-scoped allocation/identity and guard enable flags, and targets module-scoped *capabilities*.

**Application target R16/R18 census — 2026-08-29 append.** The retained raw-target population was derived as exactly five exported application functions: `attachWindowDropFile`, `attachWindowFocus`, `attachWindowRenderContext`, `attachWindowRenderState`, and `lockApplicationPointer` (with the paired global `exitApplicationPointerLock` command). After moving DOM work to `host-web`, emitter and shape classify them as follows:

| Surface | Post-move emitter/shape | Host slot |
| --- | --- | --- |
| drop file | backend emits paths; application forwards them to the core-owned `ApplicationWindow.onDropFile` signal | `input.dropFile` event |
| focus/blur | backend emits target focus transitions; application forwards them to the two core-owned window signals | `input.focus` event |
| render-context loss/restoration | backend emits surface context transitions; application forwards them to the two core-owned window signals | `graphics.renderContext` event |
| render-state resize | core `ApplicationWindow.onResize` emits; its listener issues a bounded backing-store sizing command | `graphics.renderSurface` command only; **no Host resize event slot** |
| pointer lock | request/exit are commands with one provider-global active lock | `input.pointerLock` command |

The three event slots remain separate from both command slots under R16 even though Web realizes all five through one opaque `InputTargetHandle` mapping. Multi-capability use is expressed as the explicit intersection of their five `Has*` traits; no aggregate slot hides that cost.

**Storage R7/R3 result — 2026-08-29 append.** The provider coverage derivation yields two slots:
`storage.local` is supplied by Web and Electron, while `storage.change` is supplied only by Web. Byte
size is computed from primitive key/value reads in core, so it is not a Host capability. The quota
surface is deleted rather than guessed into the Host. Web exports one stable Entity in both truthful
slots; Electron retains its configured factory and supplies only `local`.

R3 removes the ambient backend population in the same slice: no `getStorageBackend`,
`setStorageBackend`, `installStorageHostBackend`, conflict observer, host-Web enabler, sentinel,
`createWebStorageBackend`, quota API/type, or `createStorageNamespace` remains. Every core operation
takes the narrow `HasStorageLocal` or `HasStorageChange` trait it needs.

All provider and core results use `reason` as the sole discriminant. A missing key is
`{ value: null, reason: 'ok' }`; an empty string remains a value. Failed queries return a null payload
instead of partial data, while mutation batches report the completed prefix and failing key. Typed and
JSON helpers add their own parse/serialization reasons without erasing provider failures. Migration
steps are validated before any read, checkpoint after every successful callback, propagate callback
exceptions, and never roll earlier steps back; callbacks must therefore be replay-safe and idempotent.

The Storage success contract is deliberately narrower than durability: mutation `reason: 'ok'` means
the new value is atomically visible through the provider and its cache matches that visible value. It
does **not** mean the bytes were fsynced or will survive sudden power loss. Electron realizes that
contract with a same-directory temporary candidate plus rename and commits its cache only after the
rename succeeds.

### First inventories — what they changed

Two domain inventories (`window`, `dialog`) and the GL/WGPU context inventory landed 2026-08-29 and each overturned something this record proposed. All three are ruled; none is open.

**`WindowCapabilities { management?, fullscreen?, appearance? }` is withdrawn.** `packages/types/src/ApplicationWindow.ts` already carries `WindowBackend` as ~30 individually optional methods, under an explicit doctrine that a host declares support by providing the method rather than publishing a false implementation, plus cross-operation eligibility (`attach` and `open` are each eligible only when `close` is also provided, which owns the release obligation). The three-slot split is *coarser* than what exists: it elevates one method of thirty to group status, bundles unrelated powers (`setContentProtection` is a privacy power, `setHasShadow` is cosmetic), and cannot express an edge *between* operations at all. Window's second level is its operation set plus those edges. **The eligibility edge becomes a strict improvement under this model:** what is a runtime doctrine today becomes a compile-time constraint, since `HasWindowOpen` requires both `open` and `close`.

**`dialog.color` / `ColorPickerBackend` is withdrawn — on non-existence, not on any conflict.** No colour-picker capability exists in any package source, in the `dialog` package's surface, or in any host runtime (Electron, Tauri, Capacitor). It is a slot invented for a capability that exists nowhere. It is *not* withdrawn because of `gui-architecture.md`'s "ColorPicker — NO, a composition" ruling: that governs an in-app GUI **controller** built from sliders and a text input, while `dialog.color` would be an OS-native chooser. Different layers, no contradiction — recorded because a ruling resting on a bad premise gets reopened on that premise. Groups are forward-compatible; add it if a host ever ships one.

**`dialog` is `{ file?, message?, prompt? }` — `prompt` splits out.** Electron's `prompt()` is `Promise.resolve(null)` under the comment "Electron has no native text-input dialog"; Tauri is identical; Capacitor implements it; web uses `window.prompt`. Two of four hosts structurally cannot do it. Leaving `prompt` inside `message` means a *present* `dialog.message` with one permanently lying operation — this model's central failure mode, reproduced inside the new structure on day one. `null` currently means both "user cancelled" (a legitimate domain outcome that keeps its sentinel) and "this platform has none" (an absent capability, which must become a type error).

**Window fullscreen and surface fullscreen are two capabilities, not two granularities of one.** `setWindowFullscreen` is a window-scoped boolean mirrored on the entity and routed through the backend seam; `requestApplicationFullscreen(element)` calls `element.requestFullscreen()` on an **arbitrary** element and `exitApplicationFullscreen()` calls the **document-global** `document.exitFullscreen()`, while `fullscreenchange` is subscribed on the document. Under R7 coverage settles it: no host offers "make this arbitrary element fullscreen." Three consequences. **(a)** `request(target)` / `exit()` / `subscribe(handler)` is the honest shape — on the web at most one element is fullscreen per document, so the capability is a document-scoped singleton; a symmetric `exit(target)` would lie about a constraint the caller needs. **(b)** The `HTMLElement` parameter must go: a raw DOM type in an exported signature cannot exist on a native host, and the missing primitive is an opaque **fullscreen target handle** the web backend realizes as an element and a native host as its window or surface. **(c)** `subscribe` carries a teardown obligation expressed as an eligibility edge — a host providing it must provide its unsubscribe, so the trait requires both, the same mechanism as `open`-requires-`close`.

**The six context defects are latent, and the strand is what makes them reachable.** A reachability audit found no shipped example or functional scene reaching a pixel-wrong terminal state, and **no committed baseline has blessed wrong pixels**. One near-hit exists — `bitmap-perbitmap-smoothing.webgpu.ts` puts one source through `mipmaps=false` then `mipmaps=true` and the second lookup reuses the first entry — but it is inert because the functional WGPU harness never registers mip generation, the image is magnified rather than minified, and the quad batch builds a sampler-specific bind group. That baseline "is not evidence that the first-caller mip behavior is correct, only that the level-0 per-bitmap filter path is." **Latent means unconstructed, not safe:** defect 4 needs two states over one raw context and defect 5 needs a derived state rendering scene3d — and `B-context` exists precisely to make those constructions natural. A slice that lands the construction without the fix converts a latent defect into a live one in the same commit.

**The type spine does not lift the current context fields.** The GL/WGPU inventory classified 34 GL and 17 WGPU members (the 36 this record originally claimed is wrong) and found **no** pipeline-tier or render-state-tier members in either array — not because everything is context-tier, but because the pipeline and render-state members already sit outside those arrays. The residue is that many legitimate context resources are flattened without owner, key, or teardown primitives. Hence slice `B-primitives` below.

### Strand B — the graphics stack. Runs first; it already has two beachheads.

H7 (`GlContext` as the missing primitive, the user's own ruling) and H17 (WGPU acquisition-first, synchronous construction) were commissioned before this model existed and turn out to *be* its layer 1→2. They are not parallel work to reconcile; they are the first two slices, already paid for.

Slices are listed with their real dependencies, not as a numbered march — two of them are unblocked today.

- **B-ship — release H17.** No dependency. Complete and verified at builder2, paused only by the wind-down this commissioning ends.
- **B-inventory — the context-state field inventory.** No dependency, read-only, and it is an **input to the type spine, not a consumer of it** — the classification is what tells you what `GlContextState` has in it. Derive the roster from `packages/render-gl/src/glRenderState.ts` (34 entries) and its WGPU counterpart, print the members, and classify each across context tier / pipeline tier / render-state tier.
- **B-primitives — extract what the context tier is missing.** Depends on B-inventory, gates B-types. **Nothing types until these exist.** Six primitives, none of which exists today, cut four ways by what interlocks:
  - **BP-shadow** — the GL binding shadow trio: a realized blend signature (not a semantic label), an atomic texture realization carrying its straight-alpha companion, and a bound-shader record split from the ownership ledger. Carries defects 1–3; most self-contained.
  - **BP-owners** — owner-keyed context-resource substates with registered teardown. Carries defect 4's structural fix and the flattened particle / quad-batch / colour / shape / mipmap resources. Largest, and it gates `B-context`.
  - **BP-wgpu** — the WGPU texture resource-versus-binding split with a complete realization key. Defect 6.
  - **BP-mesh** — true context/device mesh-upload cache references. Defect 5. Smallest.
  Each defect's falsifier recipe is the "missing construction" derived by the reachability audit; R3 applies, so the fix and its falsifier land in the same commit as the primitive.
- **B-types — the type spine.** Depends on B-primitives. `GlContextState`, `WgpuDeviceState`, `GlPipeline` / `WgpuPipeline` / `CanvasPipeline`, the registry types, `HasGlAcquisition` / `HasWgpuAcquisition`. Types only, no implementation. Gates everything below.

  **B-types is not a transcription of the current field names into an interface.** That was B-inventory's entire finding, and the temptation peaks once the four primitives exist and the work looks mechanical. It takes two mandatory inputs: the **classification**, with its C-versus-C\* distinction intact (`C*` means context responsibility whose *current field shape must be replaced* before it enters the spine — those are not fields to lift), and the **four primitives as the vocabulary**, in which the spine is expressed rather than alongside. A `GlContextState` whose members are recognisably the old 34 names has skipped the classification.
- **B-context — `createGlContextState`.** Depends on B-types. **Standing constraint: the context object must BE the sharing identity.** Today the hidden sharing identity is a derivation *lineage* — two independent `createGlRenderState(gl)` calls over one `gl` get different binding shadows and caches — so recreating lineage-based sharing would carry the bug forward into the new structure. Implements B-inventory's classification and deletes the `Object.defineProperty` + `WeakMap` indirection in `glRenderState.ts` in favour of a visible object. The deletion is the proof the classification was right.

  **`createGlContextState(gl)` ALLOCATES — every call, no hidden map, no dedup, no registry.** Sharing is expressed by the caller passing the *same object* to two render states. A raw-context-keyed lookup table is a trap that must be named because it *fixes the interleaving defect* and is still wrong: two calls would silently return one object, a dedup the caller cannot see, opt out of, or reason about, with teardown ownership left ambiguous. The defect being gone is not the deliverable; the dependency being **visible** is. Distinguish the two failures on review — keyed by *state runtime* is the original bug unchanged; keyed by *raw context* is the symptom fixed with the mechanism still implicit.

  **Two context states over one raw context is API misuse, and the detection belongs in a guard.** It is a precondition violation that cannot occur in correct code, so core neither repairs it silently nor returns a sentinel. Per the diagnostics inversion rule the detection lives in a separately-importable guard module (`enable*Guards`, emitting through `@flighthq/log`), which may keep its own raw-context-keyed `WeakMap` and warn on a second context state over one context. The bookkeeping is legitimate; it is simply in the wrong module when it sits in core. Same placement as the prepare guard and the `explain()` cost layer under R4 — one mechanism, third use — and deferred with them until there is something to observe.
- **B-pipeline — `createGlPipeline` + `scene2dGlPipeline`.** Depends on B-types. Sliced **by registry family**, never big-bang: renderers, then texture resolvers, then blend realizations, then shape infrastructure, then shaders. Each family is its own commit under R3.
- **B-offscreen — offscreen render state** takes context + pipeline structurally. Depends on B-context.
- **B-backends — the remaining pipeline consts:** `scene2dCanvasPipeline`, `scene2dWgpuPipeline`, then `scene3dGlPipeline` / `scene3dWgpuPipeline` via spread. Depends on B-pipeline.

### Falsifier recipes for the six context defects

Each defect is latent because its construction is absent from the tree; these ARE those constructions, and each is the falsifier for the primitive that fixes it. Recorded here rather than passed in parcels, because a parcel attachment is swept on processing and these were nearly lost that way once.

- **1 — GL blend shadow (BP-shadow).** Two arms, two tests; they fail by different mechanisms. *Realization:* derive B from A, replace the realization for one blend label in B only, apply the label on A then on B with no physical-cache invalidation between — B early-returns on A's semantic label at `glDraw.ts:31-39` and leaves A's equation live. *Null collision:* `null` is both "valid normal" and the invalidation sentinel — leave a non-normal equation live, store the sentinel via `invalidateGlRenderStateCache` or a pass boundary, then draw a child whose effective blend is `null`.
- **2 — `shaderLoc` deletes a caller-owned program (BP-shadow).** Create a `GlBitmapShader`, render so `useGlProgram` writes its locations into the shared `shaderLoc` (`glDraw.ts:514-521`), destroy the last state in that context lineage, then reuse the program. Teardown adds `runtime.shaderLoc.program` to its owned deletion set (`glRenderState.ts:231-234`), contradicting the ownership contract stated at `:213-217`.
- **3 — external GL texture leaves the alpha shadow stale (BP-shadow).** Draw a source leaving `currentTextureStraightAlpha = true`, then resolve a `createExternalGlTexture` texture and submit a sprite. `glExternalTexture.ts:44-52` binds without assigning either shadow field; `glSprite.ts:28-30` snapshots the stale flag into a deferred batch. The reverse (stale `false`) is reachable too.
- **4 — sharing identity is a lineage, not the context (BP-owners).** Call `createGlRenderState(gl)` **twice with the same `gl`**, then alternate operations whose binding shadows can skip a rebind; the WGPU form needs two top-level states over one `.device`. **`render-pass-shared-context.webgl.ts` is NOT a reproducer** — its second state comes from `createGlCacheState` → `createGlOffscreenRenderState`, which passes the parent runtime in (`glCache.ts:45-50`, `glRenderState.ts:65-84`). Offscreen derivation is the *supported* path and does not reproduce this.
- **5 — mesh upload cache is nominally shared (BP-mesh).** Render the same `MeshGeometry` through scene3d on both a primary and a derived offscreen state on one context. Each first `get*Scene3DRuntime` allocates its own `WeakMap` (`glScene3DRuntime.ts:125-130`, `wgpuScene3DRuntime.ts:83-88`), stores it on the per-state runtime the draw paths consume, then assigns it into the nominally shared slot — last-writer-wins.
- **6 — WGPU entry bakes first-caller policy (BP-wgpu).** *Mip arm:* install `registerWgpuMipmapGeneration`, wrap one source in two Textures with differing `sampler.mipmaps`, resolve the no-mip one first, then **minify** the mipmapped one. *Bind-group arm:* realize an entry under one `allowSmoothing`, then draw it through a state with the other and no explicit override. `bindWgpuTextureSourceTexture` keys only by source/alpha/colour (`wgpuDraw.ts:69-108`). **The falsifier must defeat all three reasons `bitmap-perbitmap-smoothing.webgpu.ts` stays green** — no mip generation registered in the harness, magnification not minification, and a sampler-specific bind group at flush — or it passes for the wrong reason.

### Strand A — Host. Starts as soon as its type spine lands; runs concurrently with B.

A and B touch disjoint packages (`host-*` and the capability packages vs `render-*`), so they do not serialize. A is the larger census — 48 `set*Backend`, 48 `get*Backend`, 43 `install*HostBackend`, 38 `_hostConflict`, 39 `enableHostWeb*`, all verified against the tree on 2026-08-29 — but it is also the more mechanical, and it parallelizes cleanly one capability domain per builder.

- **A-inventory — per-domain site derivation.** No dependency, and an **input to A-types, not a consumer of it** — the same role B-inventory plays in strand B. For a given domain, derive every site (`set*` / `get*` / `install*` / `_hostConflict` / `enableHostWeb*`) and every consumer. Run it on **two** domains concurrently, `window` (management / fullscreen / appearance) and `dialog` (file / message / colour): a group structure validated against a single domain is a structure fitted to that domain, and if the two disagree about what a group is, that must surface before the shape is replicated across ten. It is the front half of the migration slice the same builder finishes — not read-only research occupying a builder slot.
- **A-types — type spine:** `Host`, the ~10–12 capability groups, every `Has*` trait. Types only. Gates everything else in the strand.
- **A-pattern — one domain, end to end**, as the pattern-setter: const backend, capability group, trait, all call sites migrated, old `set*`/`get*`/`install*`/`_hostConflict` deleted. Pick a domain with more than one capability so the group structure is actually exercised — `dialog` or `window`, not `clipboard`.
- **A-domains — the remaining domains**, one per builder, against the pattern A-pattern establishes.

  Web publishes W-only slots unconditionally; missing browser APIs become domain results, never runtime slot disappearance.

  **Screen R3 (2026-08-29):** `screen` is a non-optional top-level Host group. Its `query`, `change`, `details`, and `permissionChange` slots separate commands from events and make provider coverage explicit. The package-local resolver, setter, installer, diagnostics, operation roster, sentinels, refresh/mode-enumeration seams, and direct subscription conveniences were deleted; Screen operations now take a Host witness. Web owns all four stable slots, Electron owns query/change, and Tauri/Capacitor publish `{}`.

  **MediaSession R3 (2026-08-29):** `media.session` is the Web-only command slot and
  `media.sessionAction` the Web-only event slot. Shape forces the split even though coverage is equal.
  Commands take a `HasMediaSession` witness and return method-tight reason-only outcomes; actions use
  per-action Entities whose provider subscription is origin-pinned and retryable. The ambient resolver,
  custom/host precedence, sentinel, diagnostics/observer/support surface, and Web enabler were deleted
  together. Web owns both stable slots; Electron/Tauri/Capacitor publish `media: {}`.

### Strand C — parsers, codecs, and the remaining ambient registries. Last.

SWF parser config, image codecs, the `@flighthq/compression` decompressor registry, the loader's ambient net/codec reach, the globally-installed canvas text shaper. C waits for B-pipeline to settle what a registry type looks like, so it inherits that shape instead of inventing a second one.

### Not in this program

- **Scene-document.** It is its own commissioned build with its own record. This model's "scene-document materialization" bullet is a consequence to apply *when* that reader is written, not a reason to reopen it here.
- **Effects and adjustments.** `effect-recipe-model` is unratified; nothing here builds on it.
