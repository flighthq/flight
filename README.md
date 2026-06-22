# Flight

Flight is a graphics and application SDK designed for AI agents. Its API is cellular — every function is self-contained, legible in isolation, and free of hidden state. Explicit inputs, explicit outputs, no globals to trace, no implicit runtime behavior. An agent reading one function understands and applies it without context from anywhere else in the codebase.

The same design properties that make Flight easy to reason over also make bundles small. Nothing runs at import time: renderers, update loops, and event listeners are all opt-in. A minimal bitmap display gzips to 3.9 KB. A full match-3 game with tweens, audio, text, and input gzips to 14.9 KB.

It provides a scene graph, four interchangeable renderers (Canvas 2D, DOM, WebGL 2, and WebGPU), offscreen image processing, and everything needed for a complete interactive application — animation, input, audio, video, text, filters, and effects. Build a scene once; choose a backend by registering it.

## Try It

Browse the live examples gallery at [flighthq.github.io/flight](https://flighthq.github.io/flight), or run it locally:

```sh
npm install
npm run examples
```

## Getting Started

Create a display-object scene, register the renderer kinds you use, update the render graph, then draw:

```ts
import {
  addGraphChild,
  BitmapKind,
  createBitmap,
  createCanvasElement,
  createCanvasRenderState,
  createDisplayObject,
  defaultCanvasBitmapRenderer,
  loadImageSourceFromURL,
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
  contextAttributes: { alpha: false },
});

registerRenderer(state, BitmapKind, defaultCanvasBitmapRenderer);

const root = createDisplayObject();
root.scaleX = pixelRatio;
root.scaleY = pixelRatio;

const bitmap = createBitmap();
bitmap.data.image = await loadImageSourceFromURL('assets/wabbit_alpha.png');
addGraphChild(root, bitmap);

function enterFrame(): void {
  if (prepareDisplayObjectRender(state, root)) {
    renderCanvasBackground(state);
    renderCanvasDisplayObject(state, root);
  }

  requestAnimationFrame(enterFrame);
}

enterFrame();
```

The same scene renders through DOM or WebGL2 by creating the matching render state and registering that backend's renderers — `createWebGLRenderState` with `defaultWebGLBitmapRenderer` and `renderWebGLDisplayObject`, or the `*DOM*` equivalents — with no change to the scene graph itself.

### Animation

The application package provides a request-animation-frame loop with typed update and render signals:

```ts
import {
  connectSignal,
  createApplication,
  createTween,
  createTweenManager,
  invalidateRender,
  Quad,
  startApplicationLoop,
  updateTweens,
} from '@flighthq/sdk';

const app = createApplication();
const tweens = createTweenManager();

const tween = createTween(tweens, sprite, 1000, { x: 400, alpha: 0 }, { ease: Quad.easeOut });
connectSignal(tween.onUpdate, () => invalidateRender(sprite));

connectSignal(app.onUpdate, (deltaMs) => updateTweens(tweens, deltaMs));
connectSignal(app.onRender, () => {
  if (prepareDisplayObjectRender(state, root)) {
    render(root);
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
  connectSignal,
  createInputManager,
  createInteractionManager,
  DisplayObjectKind,
  getInteractionSignals,
  graphHitTestLocalBounds,
  invalidateRender,
  registerHitTestPoint,
} from '@flighthq/sdk';

registerHitTestPoint(DisplayObjectKind, graphHitTestLocalBounds);

const interaction = createInteractionManager(root);
const input = createInputManager();
attachPointerInput(input, canvas);
connectInputToInteraction(input, interaction, pixelRatio);

const signals = getInteractionSignals(bitmap);
connectSignal(signals.onPointerDown, () => {
  bitmap.alpha = 0.5;
  invalidateRender(bitmap);
});
connectSignal(signals.onPointerUp, () => {
  bitmap.alpha = 1;
  invalidateRender(bitmap);
});
```

### Sound

Load an audio source with fallback formats, then play it:

```ts
import { loadAudioSourceFromURLs, playAudioSource } from '@flighthq/sdk';

const sound = await loadAudioSourceFromURLs([{ url: 'assets/click.ogg' }, { url: 'assets/click.mp3' }]);

connectSignal(signals.onPointerDown, () => playAudioSource(sound));
```

## Examples

| Example             | Description                                      |
| ------------------- | ------------------------------------------------ |
| `addinganimation`   | Bitmap animation with tweens                     |
| `addingtext`        | Text rendering with a custom font                |
| `animatedsprite`    | Spritesheet animation                            |
| `bunnymark`         | Bitmap batching benchmark                        |
| `comparebitmapdata` | Surface and bitmap-data comparison               |
| `displayingabitmap` | Minimal bitmap display                           |
| `drawingshapes`     | Shape primitives, lines, curves, and polygons    |
| `nyancat`           | Frame animation                                  |
| `piratepig`         | Match-3 game with tweens, audio, text, and input |
| `playingsound`      | Sound playback with pause, resume, and fades     |
| `playingvideo`      | Video playback through the media channels        |
| `sparktrail`        | WebGL particle-emitter trail                     |
| `textmetrics`       | Text measurement and layout metrics              |
| `tweenexample`      | Animated circles using tweens and timers         |
| `usingtilemap`      | Tilemap rendering                                |

Build a specific example:

```sh
npm run build --workspace=examples/drawingshapes
```

Run a renderer-specific example dev server. Use whichever backend the example implements:

```sh
npm run dev:canvas --workspace=examples/textmetrics
npm run dev:dom --workspace=examples/textmetrics
npm run dev:webgl --workspace=examples/textmetrics
```

## Packages

Applications and examples import from the SDK barrel:

```ts
import { addGraphChild, createBitmap, createShape } from '@flighthq/sdk';
```

Library code should prefer the smallest package or subpath that provides the needed API.

| Package | Purpose |
| --- | --- |
| `@flighthq/application` | Application loop and browser window/host lifecycle helpers |
| `@flighthq/resources` | Image, audio, video, and font resources plus texture atlas and tileset utilities |
| `@flighthq/resources-loader` | Group resource loading with progress and completion signals |
| `@flighthq/entity` | Entity, node, runtime, and binding primitives |
| `@flighthq/filters` | Blur, glow, bevel, drop-shadow, color-matrix, and convolution filters with Canvas/CSS and WebGL backends |
| `@flighthq/geometry` | Vectors, matrices, rectangles, typed-array helpers, and pools |
| `@flighthq/input` | Keyboard, pointer, wheel, and text input normalization |
| `@flighthq/interaction` | Hit testing, pointer dispatch, and object overlap detection |
| `@flighthq/materials` | Color transform and material utilities |
| `@flighthq/media` | Audio and video playback channels |
| `@flighthq/render` | Renderer registration, render state/queue, render nodes, and the update pipeline |
| `@flighthq/render-canvas` | Canvas 2D renderer |
| `@flighthq/render-dom` | DOM renderer |
| `@flighthq/render-webgl` | WebGL2 renderer |
| `@flighthq/node` | Shared hierarchy, transforms, bounds, appearance, and invalidation |
| `@flighthq/displayobject` | Display-object graph: bitmaps, shapes, text, containers, masks, and video |
| `@flighthq/sprite` | Sprite graph: sprites, quad batches, and tilemaps |
| `@flighthq/scene` | Experimental 3D world graph |
| `@flighthq/sdk` | Application-level convenience barrel |
| `@flighthq/signals` | Strictly typed signals and slots |
| `@flighthq/spritesheet` | Spritesheet frame animation playback |
| `@flighthq/surface` | Pixel-level image manipulation using browser `ImageData` |
| `@flighthq/text-input` | Editable text helpers: selection, replacement, and input restriction |
| `@flighthq/text-layout` | Renderer-agnostic glyph measuring and text layout |
| `@flighthq/timeline` | Timeline-based animation sequencing |
| `@flighthq/timeline-spritesheet` | Spritesheet animation driven by timelines |
| `@flighthq/tween` | Tween managers, tweens, and timers |
| `@flighthq/tween-easing` | Easing functions for animation |
| `@flighthq/types` | Shared interfaces, kind symbols, and cross-package contracts |

## Contributing

```sh
git clone https://github.com/flighthq/flight.git
cd flight
npm install
```

```text
packages/      Workspace packages published as @flighthq/*
examples/      Standalone Vite example apps
tests/         Integration, API, browser API, and size tests
tools/         Development tools, including the examples gallery
scripts/       Validation, API, coverage, ordering, size, and build scripts
```
