# Explicit Dependency Model

_2026-08-29. Architecture record — replacing ambient state with explicit, value-based dependency threading across the SDK._

**Status: unratified.** Read before working on host backends, renderer registration, format parsers, codec registries, or any subsystem that currently uses module-scoped global state.

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
  color?: ColorPickerBackend;
}

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

### 2. Renderer registries as explicit values

Today: `registerRenderer(state, SpriteKind, renderer)` mutates the render state's internal registry. If you forget to register, the node kind silently doesn't render. `prepareScene2DRender` must be called before drawing or transforms are stale — nothing enforces this.

After: you build a registry from const renderer objects and pass it when constructing render state.

```typescript
import { spriteRenderer, shapeRenderer, textRenderer } from '@flighthq/scene2d-gl';

const renderers = createRendererRegistry([
  [SpriteKind, spriteRenderer],
  [ShapeKind, shapeRenderer],
  [TextKind, textRenderer],
]);

const state = createGlRenderState(glContext, { renderers, textureResolver });
```

**Texture resolution belongs on the render state, not individual renderers.** It is shared GPU infrastructure — every renderer that consumes textures (sprite, tilemap, quadbatch, mesh) needs the same resolver backed by the same GPU texture cache. Putting it on individual renderers would force the user to thread the same resolver to every texture-consuming renderer, with duplicate GPU uploads if they passed different instances. The render state is the "I hold the GPU context and everything needed to draw" object; texture resolution sits at that level alongside the GL/WGPU context.

**The prepare pass should be implicit in the render call** rather than a separate step the user must remember. A function that silently produces wrong output without a prerequisite call is a footgun.

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

**3. Render state — per-pipeline.** Renderer registry, traversal state, clip/scissor stacks, blend mode application. References the context state explicitly. Multiple render states can share one context state (separate registries, shared shader/texture cache).

```typescript
const state1 = createGlRenderState(glContext, { renderers: scene2dRenderers });
const state2 = createGlRenderState(glContext, { renderers: uiRenderers });
// Both share glContext's shader cache, texture cache, binding shadow — visibly
```

The test for whether something belongs to a layer: "does a new host have to define this, or change how this works?" Acquisition: yes — host feature. Context state: no — generic. Render state: no — generic. A new host implements one small capability (give me a GL context / give me a WGPU device), and everything above is Flight's code.

The WGPU parallel is identical: `acquireWgpuDevice` (host capability) → `createWgpuDeviceState(device, format)` (context state: pipeline cache, layouts, samplers, texture upload cache) → `createWgpuRenderState(wgpuDevice, { renderers })` (per-pipeline).

## Other subsystems affected

The same pattern (ambient global state → explicit value argument) applies to:

- **Scene-document materialization** — the kind-to-constructor mapping and schema registry are currently implicit. Becomes an explicit config passed to materialize functions.
- **Image codecs** — `registerWebImageEncoders()` mutates a global registry. Becomes an explicit codec registry passed to encode/decode.
- **Compression** — `@flighthq/compression` has a global decompressor registry. Becomes an explicit registry passed to things that decompress.
- **Asset loading** — `loader`/`assets` reach for global net and codec state. A loader config carrying its host (via trait), codec registry, and texture resolver makes the dependency chain visible.
- **Text shaping** — the canvas text shaper is globally installed. Becomes an explicit shaper passed to text layout functions.

## The convenience layer

The explicit path is precise but verbose. Convenience consts and functions are essential:

- `webHost` — const, full web host with all backends
- `fullSwfParserConfig` — const, all tag parsers and decompressors
- `scene2dGlRenderers` — const, all standard 2D GL renderers
- `createFullScene2DGlPipeline(glContext)` — factory (needs the context), renderers + texture resolver + standard configuration

These are **discoverable shortcuts to the explicit path**, not a different API. The convenience returns the same type as the manual assembly. A user starts with the convenience, then replaces it with manual assembly when they want to optimize — and the types guide them because the shape is identical.

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

- **P1 (partial backend composition)** — the Host capability-group structure supersedes the `set*Backend` / `install*HostBackend` / `explain*Backend` ceremony. Partial composition becomes structural: a Host with 3 capabilities has 3 capabilities. No sentinel, no precedence, no query. The MediaSession conditional composition pattern generalizes to all decomposable backends through capability groups.
- **P3 (transport bypass audit)** — the derived gate still matters, but the fix changes. Instead of moving bypasses into `createWeb*Backend` functions, the fix is ensuring the function takes a host argument (via trait) rather than reaching for ambient state.
- **P5 (DOM seams)** — the GL/WGPU host acquisition seam becomes a factory argument to render state construction rather than a separate `setWgpuHostBackend` call. Generic contracts expose semantic capabilities rather than browser objects.
- **Node trait system** — the `Has*` trait pattern on Host mirrors the existing `BoundsNode`, `Transform2DNode`, `Spatial2DNode` pattern on nodes. Both are structural interfaces constraining function arguments to guarantee capabilities at compile time.
- **Registration model** — the current `register*` functions become registry-builder helpers operating on explicit values rather than state mutators. The registration model doc needs updating to reflect this.
- **flight-hx consumer feedback** — independently identified the same three top priorities: composable backend capabilities, scoped host configuration, and deterministic renderer/resource ownership. This model addresses all three.

## Open design

- **Context state field inventory** — the current `GL_CONTEXT_RUNTIME_KEYS` (36 fields) and `WGPU_DEVICE_RUNTIME_KEYS` need auditing to confirm each field is correctly placed in the context tier vs the render-state tier. Some fields that are currently context-shared may belong per-state, and vice versa.
- **Offscreen render state creation** — `createGlOffscreenRenderState` currently derives from a screen state and shares its context runtime. Under the explicit model, it takes the same `GlContextState` as the primary state — sharing is structural, not derived.
