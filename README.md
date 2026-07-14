# Flight

Flight is a graphics and application SDK whose API is cellular — every function is self-contained, legible in isolation, and free of hidden state. Explicit inputs, explicit outputs, no globals to trace, no implicit runtime behavior. A developer reading one function understands and applies it without context from anywhere else in the codebase.

The same design properties that make Flight easy to reason over also make bundles small. Nothing runs at import time: renderers, update loops, and event listeners are all opt-in. A minimal bitmap display gzips to 3.9 KB. A full match-3 game with tweens, audio, text, and input gzips to 14.9 KB.

It provides a scene graph, four interchangeable renderers (Canvas 2D, DOM, WebGL 2, and WebGPU), a 3D scene stack with a 20-material shader library, offscreen image processing, and everything needed for a complete interactive application — animation, input, audio, video, text, effects, game primitives, and platform integration. Build a scene once; choose a backend by registering it.

## Try It

Browse the live examples gallery at [flighthq.ai](https://flighthq.ai), or run it locally:

```sh
npm install
npm run examples
```

## Getting Started

Create a display-object scene, register the renderer kinds you use, update the render graph, then draw:

```ts
import {
  addNodeChild,
  BitmapKind,
  createBitmap,
  createCanvasElement,
  createCanvasRenderState,
  createDisplayObject,
  defaultCanvasBitmapRenderer,
  loadImageResourceFromUrl,
  prepareDisplayObjectRender,
  registerRenderer,
  renderCanvasBackground,
  renderCanvasDisplayObject,
} from '@flighthq/sdk';

const pixelRatio = window.devicePixelRatio || 1;
const canvas = createCanvasElement(550, 400, pixelRatio);
document.body.appendChild(canvas);

const state = createCanvasRenderState(canvas, {
  backgroundColor: 0xeeddccff,
  sceneGraphSyncPolicy: 'requiresInvalidation',
});

registerRenderer(state, BitmapKind, defaultCanvasBitmapRenderer);

const root = createDisplayObject();
root.scaleX = pixelRatio;
root.scaleY = pixelRatio;

const bitmap = createBitmap();
bitmap.data.image = await loadImageResourceFromUrl('assets/wabbit_alpha.png');
addNodeChild(root, bitmap);

function enterFrame(): void {
  if (prepareDisplayObjectRender(state, root)) {
    renderCanvasBackground(state);
    renderCanvasDisplayObject(state, root);
  }

  requestAnimationFrame(enterFrame);
}

enterFrame();
```

The same scene renders through DOM, WebGL2, or WebGPU by creating the matching render state and registering that backend's renderers — no change to the scene graph itself. The display objects stay plain data; backend work remains explicit.

### Animation

The application package provides a request-animation-frame loop with typed update and render signals:

```ts
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
  if (prepareDisplayObjectRender(state, root)) {
    renderCanvasBackground(state);
    renderCanvasDisplayObject(state, root);
  }
});

startApplicationLoop(app);
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
  DisplayObjectKind,
  hitTestGraphLocalBounds,
  invalidateNodeRender,
  registerHitTestPoint,
} from '@flighthq/sdk';

registerHitTestPoint(DisplayObjectKind, hitTestGraphLocalBounds);

const interaction = createInteractionManager(root);
const input = createInputManager();
attachPointerInput(input, canvas);
connectInputToInteraction(input, interaction, pixelRatio);

connectInteractionSignal(interaction, bitmap, 'onPointerDown', () => {
  bitmap.alpha = 0.5;
  invalidateNodeRender(bitmap);
});
connectInteractionSignal(interaction, bitmap, 'onPointerUp', () => {
  bitmap.alpha = 1;
  invalidateNodeRender(bitmap);
});
```

### Sound

Load an audio resource with fallback formats, then play it:

```ts
import { loadAudioResourceFromUrls, playAudioResource } from '@flighthq/sdk';

const audioContext = new AudioContext();
const sound = await loadAudioResourceFromUrls(audioContext, [{ url: 'assets/click.ogg' }, { url: 'assets/click.mp3' }]);

connectInteractionSignal(interaction, bitmap, 'onPointerDown', () => {
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

## Breadth

Flight currently spans 128 workspace packages. The public API can be inspected with:

```sh
npm run api
npm run api -- --json
```

Major areas:

| Area | Packages |
| --- | --- |
| Core | `types`, `entity`, `node`, `signals` |
| Math and geometry | `math`, `geometry`, `path`, `path-boolean`, `clip`, `binpack` |
| 2D scene graph | `displayobject`, `shape`, `sprite`, `text` |
| 3D scene graph | `scene`, `mesh`, `materials`, `lighting`, `texture`, `camera`, `skeleton`, `picking` |
| Rendering | `render`, `displayobject-canvas`, `displayobject-dom`, `render-gl`, `displayobject-gl`, `render-wgpu`, `displayobject-wgpu`, `scene-gl`, `scene-wgpu` |
| Effects and adjustments | `adjustments`, `effects`, `effects-canvas`, `effects-gl`, `effects-wgpu` |
| Text | `textlayout`, `textshaper`, `textshaper-canvas`, `textsegment`, `textbidi`, `textinput`, `glyphatlas`, `bitmapfont`, `bitmaptext`, `text-markup` |
| Animation and simulation | `easing`, `tween`, `spring`, `animation`, `timeline`, `movieclip`, `spritesheet`, `motionpath`, `clock`, `particles`, `particleemitter` |
| Input and interaction | `input`, `interaction` |
| Game | `camera2d`, `collision`, `spatial`, `flow`, `snapshot` |
| Resources | `image`, `image-codec`, `surface`, `audio`, `video`, `font`, `textureatlas`, `tileset`, `loader`, `assets` |
| Format codecs | Atlas, sprite, tilemap, bitmap-font, texture, path, shape, particle, scene, XML, and text-markup `-formats` packages |
| Application and media | `application`, `app`, `media`, `intl`, `useragent` |
| Diagnostics | `log`, `debug` |
| Platform | Clipboard, dialog, filesystem, notifications, share, shell, menu, tray, shortcut, screen, power, storage, lifecycle, connectivity, device, sensors, keyboard, geolocation, webcam, permissions, mediasession, net, socket, IPC, protocol, updater, and host adapters for Electron, Tauri, and Capacitor |
| Tooling | `tool-capture`, `capture`, functional/example baselines, renderer parity checks, API/export/package/order/size validation scripts |
| Convenience barrel | `@flighthq/sdk` re-exports the packages above for application code and examples |

All packages are published under `@flighthq/`. Applications and examples usually import from `@flighthq/sdk`:

```ts
import { addNodeChild, createBitmap, createShape } from '@flighthq/sdk';
```

Library code should prefer the smallest package root that provides the needed API:

```ts
import { createTween, updateTweens } from '@flighthq/tween';
```

## Examples

| Example       | Description                                              |
| ------------- | -------------------------------------------------------- |
| `adjustments` | Color matrix composition with interactive sliders        |
| `benchmark`   | QuadBatch bouncing benchmark with procedural textures    |
| `bitmap`      | Procedural bitmap display with transforms                |
| `camera2d`    | 2D game camera with follow, zoom, and parallax           |
| `clock`       | Hierarchical clocks with pause and time scaling          |
| `collision`   | 2D collision detection with manifold visualization       |
| `flowstates`  | Application mode/screen flow-state stack                 |
| `interaction` | Pointer hit testing with drag and hover                  |
| `motionpath`  | Path-following animation along bezier curves             |
| `movieclip`   | Timeline-driven frame animation with labels and scripts  |
| `particles`   | Dual particle emitters with forces and color curves      |
| `pathboolean` | Path boolean operations (union/intersect/difference)     |
| `shapes`      | Shape primitives, fills, strokes, curves, and polygons   |
| `snapshot`    | State snapshot capture, restore, and interpolation       |
| `spritesheet` | Procedural sprite strip with grid slicing and playback   |
| `spatial`     | Broadphase spatial query with uniform grid               |
| `spring`      | Spring-physics animation with frequency/damping controls |
| `text`        | TextLabel, RichText, alignment, wrapping, and styles     |
| `textinput`   | Editable text field with caret, selection, and undo      |
| `tween`       | Easing function grid with 15 curve families              |

Build a specific example:

```sh
npm run build --workspace=examples/shapes
```

Run a renderer-specific example dev server:

```sh
npm run dev:canvas --workspace=examples/textmetrics
npm run dev:dom --workspace=examples/textmetrics
npm run dev:webgl --workspace=examples/textmetrics
npm run dev:webgpu --workspace=examples/textmetrics
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
functional/    Renderer-focused functional scenes and baselines
tools/         Gallery, functional harness, capture tooling, and repo utilities
scripts/       Validation, API, coverage, ordering, size, and build scripts
```

Useful checks:

```sh
npm run check        # packages:check + typecheck + lint + format + order + exports
npm run test         # unit tests across all packages
npm run size         # gzip output size against baselines
npm run test:functional  # headless render smoke, parity, and regression
```
