# Flight

[![CI](https://github.com/flighthq/flight/actions/workflows/tests.yml/badge.svg?branch=develop)](https://github.com/flighthq/flight/actions/workflows/tests.yml?query=branch%3Adevelop) [![npm](https://img.shields.io/npm/v/@flighthq/sdk?logo=npm)](https://www.npmjs.com/package/@flighthq/sdk)

Flight is a modular TypeScript SDK for building interactive applications — designed to be read and written by AI coding agents as well as people. Its more than 150 tree-shakable packages span 2D and 3D graphics, physics, animation, media, input, asset formats, application lifecycle, and desktop/mobile platform APIs.

The API is cellular: explicit passes over plain data, self-identifying names, clear ownership, and no work at import time. A function can be understood in isolation; an application can import one capability without inheriting an engine. Those same properties keep the codebase grepable for agents, portable to compiled targets, and small in production builds.

Build a scene once and choose a renderer — Canvas 2D, DOM, WebGL 2, or WebGPU — by registering only the implementations it uses. Compose the same small primitives into a game, visualization, media experience, desktop tool, or mobile application.

## Try It

See Flight render its own [live introduction](https://flighthq.ai), browse the [examples gallery](https://flighthq.ai/examples/), compare [ports from established frameworks](https://ports.flighthq.ai), or run the gallery locally:

```sh
npm install
npm run examples
```

## Getting Started

```sh
npm install @flighthq/sdk
```

Create a display-object scene, register the renderer kinds you use, update the render graph, then draw:

```ts
import {
  addNodeChild,
  createCanvasElement,
  createCanvasRenderState,
  createDisplayObject,
  createSprite,
  createTexture,
  defaultCanvasSpriteRenderer,
  getCanvasRenderStateTextureResolvers,
  loadImageResourceFromUrl,
  prepareScene2DRender,
  registerCanvasImageTextureResolver,
  registerRenderer,
  renderCanvasBackground,
  renderCanvasScene2D,
  SpriteKind,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createCanvasElement(550, 400, pixelRatio);
document.body.appendChild(canvas);

const state = createCanvasRenderState(canvas, {
  backgroundColor: 0xeeddccff,
  sceneGraphSyncPolicy: 'requiresInvalidation',
});

registerCanvasImageTextureResolver(getCanvasRenderStateTextureResolvers(state));
registerRenderer(state, SpriteKind, defaultCanvasSpriteRenderer);

const root = createDisplayObject();
root.scaleX = pixelRatio;
root.scaleY = pixelRatio;

const sprite = createSprite();
const image = await loadImageResourceFromUrl('assets/wabbit_alpha.png');
sprite.data.texture = createTexture({ dimension: '2d', source: image });
addNodeChild(root, sprite);

function enterFrame(): void {
  if (prepareScene2DRender(state, root)) {
    renderCanvasBackground(state);
    renderCanvasScene2D(state, root);
  }

  requestAnimationFrame(enterFrame);
}

enterFrame();
```

The same scene renders through DOM, WebGL2, or WebGPU by creating the matching render state and registering that backend's renderers — no change to the scene graph itself. The display objects stay plain data; backend work remains explicit.

### Animation

The application package provides a request-animation-frame loop with typed update and render signals. Host implementations are explicit; in a browser, pass the web host when starting the application:

```sh
npm install @flighthq/host-web
```

```ts
import { webHost } from '@flighthq/host-web';
import {
  connectSignal,
  createApplication,
  createTween,
  createTweenManager,
  easeOutElastic,
  invalidateNodeRender,
  startApplicationLoop,
  updateTweens,
} from '@flighthq/sdk';

const manager = createTweenManager();

const tween = createTween(manager, sprite, 1000, { x: 400, alpha: 0 }, { ease: easeOutElastic });
connectSignal(tween.onUpdate, () => invalidateNodeRender(sprite));

const app = createApplication();
connectSignal(app.onUpdate, (delta) => updateTweens(manager, delta));
connectSignal(app.onRender, () => {
  if (prepareScene2DRender(state, root)) {
    renderCanvasBackground(state);
    renderCanvasScene2D(state, root);
  }
});

startApplicationLoop(webHost, app);
```

### Interaction

Wire up pointer events on any scene node. Register a hit-test strategy once, then create an interaction manager and connect it to the input system:

```ts
import {
  attachPointerInput,
  connectInputToInteraction,
  connectInteractionSignal,
  createInputManager,
  createInteractionManager,
  invalidateNodeRender,
  registerDefaultHitTests,
  setNodeHitTestEnabled,
} from '@flighthq/sdk';

registerDefaultHitTests();
setNodeHitTestEnabled(sprite, true);

const interaction = createInteractionManager(root);
const input = createInputManager();
attachPointerInput(input, canvas);
connectInputToInteraction(input, interaction, pixelRatio);

connectInteractionSignal(interaction, sprite, 'onPointerDown', () => {
  sprite.alpha = 0.5;
  invalidateNodeRender(sprite);
});
connectInteractionSignal(interaction, sprite, 'onPointerUp', () => {
  sprite.alpha = 1;
  invalidateNodeRender(sprite);
});
```

### Sound

Load an audio resource with fallback formats, then play it:

```ts
import { loadAudioResourceFromUrls, playAudioResource } from '@flighthq/sdk';

const audioContext = new AudioContext();
const sound = await loadAudioResourceFromUrls(audioContext, [{ url: 'assets/click.ogg' }, { url: 'assets/click.mp3' }]);

connectInteractionSignal(interaction, sprite, 'onPointerDown', () => {
  playAudioResource(audioContext, sound);
});
```

## Rendering Model

Flight separates authored data from backend work:

1. Build a graph from display objects, sprites, text, shapes, tilemaps, particles, or 3D scene nodes.
2. Create a backend render state for Canvas 2D, DOM, WebGL2, or WebGPU.
3. Register only the renderers and effect backends the scene needs.
4. Run the explicit prepare/update pass.
5. Draw through the selected backend.

Canvas and DOM are lightweight host-web paths. WebGL2 and WebGPU add GPU render targets, cached pipelines, shader/material registries, post-processing, clipping, masking, velocity, render caches, 2D batching, and 3D forward renderers with a 20-material Cook-Torrance PBR + classic/NPR/debug shader library.

## Platform Scope

Flight currently spans more than 150 independently importable, publishable packages. The public API can be inspected with:

```sh
npm run api
npm run api -- --json
```

Major areas:

| Area | Packages |
| --- | --- |
| Core and data | `types`, `entity`, `node`, `signals`, `math`, `geometry`, `color`, `layout`, `compression` |
| 2D graphics | `scene2d`, `bitmap`, `shape`, `path`, `clip`, `text`, `tilemap`, `quadbatch` |
| 3D graphics | `scene3d`, `mesh`, `materials`, `shading`, `lighting`, `texture`, `camera`, `skeleton3d`, `picking` |
| Rendering | `render`, Canvas/DOM scene renderers, WebGL 2 and WebGPU cores, and 2D/3D GPU renderers |
| Effects and imaging | `adjustments`, `effects`, Canvas/WebGL/WebGPU effect executors, `image`, `image-codec`, `capture` |
| Text | `textlayout`, `textshaper`, `textsegment`, `textbidi`, `textinput`, `glyphatlas`, `bitmapfont`, `bitmaptext`, `text-markup` |
| Animation and simulation | `easing`, `tween`, `spring`, `animation`, `timeline`, `movieclip`, `spritesheet`, `motionpath`, `clock`, `particles` |
| Games and interaction | `input`, `interaction`, `collision`, `physics2d`, `spatial`, `flow`, `statechart`, `snapshot` |
| Resources and formats | Loaders and structured importers for images, fonts, atlases, tilemaps, particles, SVG, SWF, glTF, OBJ/MTL, 3DS, MD2/MD5, AWD2, and more |
| Application and media | `application`, `audio`, `video`, `media`, `mediasession`, `intl`, `log`, `debug` |
| Platform integration | Web-first APIs for storage, networking, filesystem, clipboard, dialogs, notifications, sensors, windows, lifecycle, and other OS/device capabilities |
| Native hosts | Replaceable adapters for Electron, Tauri, and Capacitor |
| Tooling | Capture and baseline tooling, cross-renderer smoke/parity checks, conformance fixtures, API/export/package/order/portability gates, and bundle-size budgets |

All packages are published under `@flighthq/`. Applications and examples usually import from `@flighthq/sdk`:

```ts
import { addNodeChild, createBitmap, createShape } from '@flighthq/sdk';
```

Library code should prefer the smallest package root that provides the needed API:

```ts
import { createTween, updateTweens } from '@flighthq/tween';
```

Platform implementations are registered explicitly. Browser applications opt into the narrow `enableHostWeb*` functions they use (or the combined `enableHostWeb()` setup); Electron, Tauri, and Capacitor hosts register their matching adapters. The application-facing API remains stable across those hosts.

## Engineering Confidence

Flight is pre-release software, so confidence comes from the engineering path behind each change. Code changes are exercised by two unit-test lanes, a full TypeScript build, package and public-API validation, bundle-size budgets, and browser-render smoke and parity checks across DOM, Canvas, WebGL, and WebGPU. Nightly runs add coverage thresholds and generated API-surface checks.

`main` is a machine-managed known-good pointer: it advances only to commits whose CI run succeeded. Version releases verify that exact tagged commit passed CI before publishing the complete package graph to npm with provenance.

The repository also keeps reliability concerns visible in the design: imports are side-effect-free, feature families use explicit registries, resource ownership and allocation are named, format importers report structured diagnostics, source stays inside a checked compiled-target-portable subset, and render output is tested across interchangeable backends.

## Examples

The gallery includes focused examples for shapes, bitmaps, text, interaction, animation, tilemaps, particles, collision, application flow, audio/video, file-format loading, and a growing set of 3D scenes covering primitives, shading, skyboxes, skeletal animation, picking, fire, explosions, and a globe. Where a capability is shared, the gallery lets you switch the same scene among supported renderers.

Build a specific example:

```sh
npm run build --workspace=examples/packages/shapes
```

Run a renderer-specific example dev server:

```sh
npm run dev:canvas --workspace=examples/packages/shapes
npm run dev:dom --workspace=examples/packages/shapes
npm run dev:webgl --workspace=examples/packages/shapes
npm run dev:webgpu --workspace=examples/packages/scene-primitives
```

## Repository

```sh
git clone https://github.com/flighthq/flight.git
cd flight
npm install
```

```text
packages/      Workspace packages published as @flighthq/*
examples/      Standalone Vite example apps
conformance/   Import fixtures and structured conformance checks
tools/         Gallery, functional scenes, capture harness, and repo utilities
scripts/       Validation, API, coverage, ordering, size, and build scripts
```

Useful checks:

```sh
npm run check              # package, type, API, export, portability, docs, and style gates
npm run test               # unit tests across all packages
npm run size               # gzip output size against committed budgets
npm run test:smoke         # fail on browser/runtime/render errors
npm run test:parity        # compare output across render backends
npm run test:regression    # compare output against committed fingerprints
```
