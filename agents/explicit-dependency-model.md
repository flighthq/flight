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

### 1. Host as an explicit collection

Today: 42+ `set*Backend()` calls mutate module-scoped singletons. Functions reach for the singleton internally. If no backend is installed, a sentinel silently returns a default value.

After: `Host` is a plain object carrying only the backends you installed. Functions that need a backend take it as an argument.

```typescript
const host = createHost({
  dialog: createWebDialogBackend(),
  net: createWebNetBackend(),
  audio: createWebAudioDeviceBackend(),
});

// The function signature is honest about needing a dialog backend
openDialog(host.dialog, { title: 'Save?', buttons: ['Yes', 'No'] });

// If you didn't install dialog, host.dialog is absent — type error, not silent sentinel
fetchResource(host.net, url);
```

**What changes:**
- `enableHostWeb()` becomes `createWebHost()` and returns a value.
- Per-capability enablers (`enableHostWebAudioDevice()`) become factories (`createWebAudioDeviceBackend()`) — most already exist internally.
- The precedence model (custom > host > sentinel) simplifies: there is no precedence. You passed what you passed.
- `explain*Backend()` for failure diagnosis becomes unnecessary — a missing backend is a type error, not a runtime mystery. `explain*` for unused-registration reporting (see below) remains useful.
- `host-web` becomes a convenience that builds a full `Host` with all web backends. `host-lime`, `host-electron`, etc. build partial ones. A user can mix and match.

### 2. Renderer registries as explicit values

Today: `registerRenderer(state, SpriteKind, renderer)` mutates the render state's internal registry. If you forget to register, the node kind silently doesn't render. `prepareScene2DRender` must be called before drawing or transforms are stale — nothing enforces this.

After: you build a registry as a value and pass it when constructing render state.

```typescript
const renderers = createRendererRegistry([
  [SpriteKind, createSpriteRenderer({ textureResolver })],
  [ShapeKind, createShapeRenderer()],
]);

const state = createGlRenderState(glContext, { renderers });
```

**What changes:**
- The texture resolver is an argument to the renderer that needs it (Sprite), not ambient state. A user rendering only shapes never encounters it.
- The render state takes the registry explicitly. What's registered is visible at the construction site.
- Per-renderer dependencies (texture resolution, mask resolution, blend mode tables) are arguments to that renderer's factory, not shared ambient state.
- The prepare pass should be implicit in the render call rather than a separate step the user must remember — a function that silently produces wrong output without a prerequisite call is a footgun.

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
- `createFullSwfParserConfig()` provides the batteries-included version — same explicit shape, all features included.
- The same pattern applies to every `*-formats` parser: glTF section parsers, texture format decoders, scene-document schema registries.

## Other subsystems affected

The same pattern (ambient global state → explicit value argument) applies to:

- **Scene-document materialization** — the kind-to-constructor mapping and schema registry are currently implicit. Becomes an explicit config passed to materialize functions.
- **Image codecs** — `registerWebImageEncoders()` mutates a global registry. Becomes an explicit codec registry passed to encode/decode.
- **Compression** — `@flighthq/compression` has a global decompressor registry. Becomes an explicit registry passed to things that decompress.
- **Asset loading** — `loader`/`assets` reach for global net and codec state. A loader config carrying its net backend, codec registry, and texture resolver makes the dependency chain visible.
- **Text shaping** — the canvas text shaper is globally installed. Becomes an explicit shaper passed to text layout functions.

## The convenience layer

All of this makes the minimal path explicit and small, but it makes the maximal path more verbose. Convenience functions are essential:

- `createWebHost()` — full web host with all backends
- `createFullSwfParserConfig()` — all tag parsers and decompressors
- `createDefaultRendererRegistry()` — all standard 2D renderers with default configuration
- `createDefaultScene2DPipeline()` — renderers + prepare + standard configuration

These are **discoverable shortcuts to the explicit path**, not a different API. The convenience function returns the same type as the manual assembly. A user starts with the convenience, then replaces it with manual assembly when they want to optimize — and the types guide them because the shape is identical.

## Unused-registration diagnostics

The old rule: "importing everything is an anti-pattern." The new rule: **"know what you imported."**

`importEverything()` is fine. Importing everything without knowing what it costs is not. To close this gap, registries support an `explain()` style diagnostic that reports what was registered but never exercised:

```
Registry: renderers
  Registered: Sprite, Shape, Text, TileMap, QuadBatch, Mesh
  Exercised:  Sprite, Shape
  Unused:     Text, TileMap, QuadBatch, Mesh

Registry: host
  Installed:  dialog, net, audio, clipboard, filesystem
  Exercised:  net, audio
  Unused:     dialog, clipboard, filesystem
```

This is the diagnostics inversion principle applied to **cost** instead of failure. Today's `explain*` tells you why something didn't work. This tells you what you're paying for but not using.

This is a **reporting layer, not an enforcement layer**. It does not prevent registering things you don't use. It makes the cost visible so you can act on it when ready.

## What this is NOT

- **Not a DI framework.** There is no container, no auto-wiring, no reflection, no runtime resolution. You build a value and pass it. The value is a plain object with typed fields.
- **Not a breaking change to the cellular architecture.** Packages still own their domains. What changes is how cross-package dependencies are expressed: as arguments rather than ambient state.
- **Not incompatible with tree-shaking.** Tree-shaking operates at import time. Explicit arguments operate at call time. A texture resolver passed as an argument tree-shakes identically to one installed globally — the bundler sees the same import either way. What changes is that the *user* can see it too.

## Relationship to existing work

- **P1 (partial backend composition)** — the Host collection supersedes the `set*Backend` / `install*HostBackend` / `explain*Backend` ceremony. Partial composition becomes structural: a Host with 3 backends has 3 backends. No sentinel, no precedence, no query.
- **P3 (transport bypass audit)** — the derived gate still matters, but the fix changes. Instead of moving bypasses into `createWeb*Backend` functions, the fix is ensuring the function takes a backend argument rather than reaching for ambient state.
- **P5 (DOM seams)** — the GL/WGPU host acquisition seam becomes a factory argument to render state construction rather than a separate `setWgpuHostBackend` call.
- **Registration model** — the current `register*` functions become registry-builder helpers rather than state mutators. The registration model doc needs updating to reflect this.
