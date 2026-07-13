# Flight

Flight is a modular TypeScript graphics and application SDK. It combines a 2D display-object graph, a 3D scene stack, four interchangeable renderers, image/effect processing, animation, text, media, input, game primitives, platform integrations, and tooling behind explicit, tree-shakable APIs.

The framework is built around small cellular packages. Importing a package does not register renderers, patch globals, start loops, attach listeners, or allocate host resources. Applications opt into each backend and subsystem by calling the relevant `create*`, `register*`, `attach*`, or `enable*` functions.

That design keeps both humans and AI agents oriented: exported function names are globally legible, data flow is explicit, and hidden runtime behavior is avoided. The same properties keep bundles narrow. A minimal bitmap display gzips to 3.9 KB, while a full match-3 game with tweens, audio, text, and input gzips to 14.9 KB.

## Try It

Browse the live examples gallery at [flighthq.ai](https://flighthq.ai), or run it locally:

```sh
npm install
npm run examples
```

## Getting Started

Create a display-object tree, register the renderer kinds you use, prepare the render graph, then draw:

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

The same tree can render through DOM, WebGL2, or WebGPU by creating that backend's render state and registering that backend's renderers. The display objects stay plain data; backend work remains explicit.

## Breadth

Flight currently spans 128 workspace packages. The public API can be inspected with:

```sh
npm run api
npm run api -- --json
```

Major areas:

| Area | Packages and capabilities |
| --- | --- |
| Core model | `@flighthq/types`, `@flighthq/entity`, `@flighthq/node`, `@flighthq/signals`, `@flighthq/log`, `@flighthq/debug` |
| Math and geometry | `@flighthq/math`, `@flighthq/geometry`, `@flighthq/path`, `@flighthq/path-boolean`, `@flighthq/clip`, `@flighthq/binpack` |
| 2D graph | `@flighthq/displayobject`, `@flighthq/shape`, `@flighthq/sprite`, `@flighthq/bitmaptext`, `@flighthq/text`, `@flighthq/textureatlas`, `@flighthq/tileset` |
| Renderers | `@flighthq/render`, `@flighthq/displayobject-canvas`, `@flighthq/displayobject-dom`, `@flighthq/render-gl`, `@flighthq/displayobject-gl`, `@flighthq/render-wgpu`, `@flighthq/displayobject-wgpu` |
| Effects and pixels | `@flighthq/adjustments`, `@flighthq/effects`, `@flighthq/effects-canvas`, `@flighthq/effects-gl`, `@flighthq/effects-wgpu`, `@flighthq/surface`, `@flighthq/capture` |
| 3D | `@flighthq/scene`, `@flighthq/mesh`, `@flighthq/materials`, `@flighthq/lighting`, `@flighthq/texture`, `@flighthq/camera`, `@flighthq/skeleton`, `@flighthq/picking`, `@flighthq/scene-gl`, `@flighthq/scene-wgpu` |
| Text | `@flighthq/textlayout`, `@flighthq/textshaper`, `@flighthq/textshaper-canvas`, `@flighthq/textsegment`, `@flighthq/textbidi`, `@flighthq/textinput`, `@flighthq/glyphatlas`, `@flighthq/bitmapfont`, `@flighthq/text-markup` |
| Animation and simulation | `@flighthq/easing`, `@flighthq/tween`, `@flighthq/spring`, `@flighthq/animation`, `@flighthq/timeline`, `@flighthq/movieclip`, `@flighthq/spritesheet`, `@flighthq/motionpath`, `@flighthq/clock`, `@flighthq/particles`, `@flighthq/particleemitter` |
| Game primitives | `@flighthq/camera2d`, `@flighthq/collision`, `@flighthq/spatial`, `@flighthq/flow`, `@flighthq/snapshot`, `@flighthq/interaction`, `@flighthq/input` |
| Assets and codecs | `@flighthq/assets`, `@flighthq/loader`, `@flighthq/image`, `@flighthq/image-codec`, `@flighthq/audio`, `@flighthq/video`, `@flighthq/font`, plus atlas, sprite, tilemap, bitmap-font, texture, path, shape, particle, scene, XML, and text-markup format packages |
| Application and media | `@flighthq/application`, `@flighthq/app`, `@flighthq/media`, `@flighthq/mediasession`, `@flighthq/intl`, `@flighthq/useragent` |
| Platform and hosts | Clipboard, dialog, filesystem, notifications, share, shell, menu, tray, shortcut, screen, power, storage, lifecycle, connectivity, device, sensors, keyboard, geolocation, webcam, permissions, net, socket, IPC, protocol, updater, and host adapters for Electron, Tauri, and Capacitor |
| Tooling | `@flighthq/tool-capture`, functional/example capture baselines, renderer parity checks, API/export/package/order/size validation scripts |
| Convenience barrel | `@flighthq/sdk` re-exports the packages for application code and examples |

Applications and examples usually import from `@flighthq/sdk`:

```ts
import { addNodeChild, createBitmap, createShape } from '@flighthq/sdk';
```

Library code should prefer the smallest package root that provides the needed API:

```ts
import { createTween, updateTweens } from '@flighthq/tween';
```

## Rendering Model

Flight separates authored data from backend work:

1. Build a graph from display objects, sprites, text, shapes, tilemaps, particles, or 3D scene nodes.
2. Create a backend render state for Canvas 2D, DOM, WebGL2, or WebGPU.
3. Register only the renderers and effect backends the scene needs.
4. Run the explicit prepare/update pass.
5. Draw through the selected backend.

Canvas and DOM are lightweight host-web paths. WebGL2 and WebGPU add GPU render targets, cached pipelines, shader/material registries, post-processing, clipping, masking, velocity, render caches, 2D batching, and 3D forward renderers.

## Examples

| Example             | Description                                      |
| ------------------- | ------------------------------------------------ |
| `addinganimation`   | Bitmap animation with tweens                     |
| `addingtext`        | Text rendering with a custom font                |
| `animatedsprite`    | Spritesheet animation                            |
| `batchloading`      | Batch asset loading with progress                |
| `bunnymark`         | Bitmap batching benchmark                        |
| `comparebitmapdata` | Surface and bitmap-data comparison               |
| `displayingabitmap` | Minimal bitmap display                           |
| `drawingshapes`     | Shape primitives, lines, curves, and polygons    |
| `nyancat`           | Frame animation                                  |
| `piratepig`         | Match-3 game with tweens, audio, text, and input |
| `playingvideo`      | Video playback through media channels            |
| `playingsound`      | Sound playback with pause, resume, and fades     |
| `renderview`        | Render-to-texture style composition              |
| `sparktrail`        | Particle-emitter trail                           |
| `textmetrics`       | Text measurement and layout metrics              |
| `tweenexample`      | Animated circles using tweens and timers         |
| `usingtilemap`      | Tilemap rendering                                |

Build a specific example:

```sh
npm run build --workspace=examples/drawingshapes
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
npm run check
npm run test
npm run size
npm run test:functional
```
