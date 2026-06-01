# Flight

Flight is a TypeScript monorepo for a tree-shakable 2D rendering SDK inspired by OpenFL and Lime. It provides scene graph packages, renderer packages, animation and asset helpers, and a convenience `@flighthq/sdk` barrel for applications and examples.

The codebase is organized so low-level users can import small subpaths without pulling in renderer registration, app helpers, or unrelated graph families. Packages are intended to be import side-effect-free; renderers and platform listeners are registered explicitly by the caller.

## Packages

Applications and examples can import from the SDK barrel:

```ts
import { addGraphChild, createBitmap, createShape } from '@flighthq/sdk';
```

Library code should prefer the smallest package or subpath that provides the needed API.

| Package                          | Purpose                                                            |
| -------------------------------- | ------------------------------------------------------------------ |
| `@flighthq/application`          | Application loop and browser window lifecycle helpers              |
| `@flighthq/assets`               | Image source, texture atlas, tileset, font, and audio utilities    |
| `@flighthq/assets-loader`        | Group asset loading with progress and completion signals           |
| `@flighthq/entity`               | Entity, node, runtime, and binding primitives                      |
| `@flighthq/geometry`             | Vectors, matrices, rectangles, typed-array helpers, and pools      |
| `@flighthq/image-cache`          | Runtime image cache access for display-object bitmap caching       |
| `@flighthq/input`                | Keyboard, pointer, wheel, and text input normalization             |
| `@flighthq/interaction`          | Hit testing and pointer dispatch                                   |
| `@flighthq/materials`            | Color transforms, filters, blend modes, and material utilities     |
| `@flighthq/media`                | Audio and video playback channels                                  |
| `@flighthq/render-canvas`        | Canvas 2D renderer                                                 |
| `@flighthq/render-core`          | Renderer registration, render nodes, and render update pipeline    |
| `@flighthq/render-dom`           | DOM renderer                                                       |
| `@flighthq/render-webgl`         | WebGL2 renderer                                                    |
| `@flighthq/scenegraph-core`      | Shared hierarchy, transforms, bounds, appearance, and invalidation |
| `@flighthq/scenegraph-display`   | Display-object graph: bitmaps, shapes, text, masks, and video      |
| `@flighthq/scenegraph-sprite`    | Sprite graph: sprites, quad batches, and tilemaps                  |
| `@flighthq/scenegraph-world`     | Experimental 3D world graph                                        |
| `@flighthq/sdk`                  | Application-level convenience barrel                               |
| `@flighthq/signals`              | Strictly typed signals and slots                                   |
| `@flighthq/spritesheet`          | Spritesheet frame animation playback                               |
| `@flighthq/surface`              | Pixel-level image manipulation using browser `ImageData`           |
| `@flighthq/text-layout`          | Renderer-agnostic glyph measuring and text layout                  |
| `@flighthq/timeline`             | Timeline-based animation sequencing                                |
| `@flighthq/timeline-spritesheet` | Spritesheet animation driven by timelines                          |
| `@flighthq/tween`                | Tween managers, tweens, and timers                                 |
| `@flighthq/tween-easing`         | Easing functions for animation                                     |
| `@flighthq/types`                | Shared interfaces, kind symbols, and cross-package contracts       |

## Getting Started

Install dependencies with npm:

```sh
npm install
```

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
  registerRenderer,
  renderCanvasBackground,
  renderCanvasDisplayObject,
  updateDisplayObjectBeforeRender,
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
  if (updateDisplayObjectBeforeRender(state, root)) {
    renderCanvasBackground(state);
    renderCanvasDisplayObject(state, root);
  }

  requestAnimationFrame(enterFrame);
}

enterFrame();
```

### Shapes

Shapes store drawing commands on a `Shape` node. Canvas rendering also needs the shape renderer and shape-command draw handlers registered for the commands you use:

```ts
import {
  appendShapeBeginFill,
  appendShapeCircle,
  appendShapeLineStyle,
  appendShapeLineTo,
  appendShapeRectangle,
  createShape,
  defaultCanvasShapeCommands,
  defaultCanvasShapeRenderer,
  registerCanvasShapeCommands,
  registerRenderer,
  ShapeKind,
} from '@flighthq/sdk';

registerRenderer(state, ShapeKind, defaultCanvasShapeRenderer);
registerCanvasShapeCommands(defaultCanvasShapeCommands);

const box = createShape();
appendShapeBeginFill(box, 0x24afc4);
appendShapeRectangle(box, 0, 0, 100, 100);

const circle = createShape();
appendShapeBeginFill(circle, 0xff6644);
appendShapeCircle(circle, 50, 50, 50);

const line = createShape();
appendShapeLineStyle(line, 4, 0xffffff);
appendShapeLineTo(line, 200, 0);
```

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
  if (updateDisplayObjectBeforeRender(state, root)) {
    render(root);
  }
});

startApplicationLoop(app);
```

## Examples

Examples live in `examples/`. Each example is a standalone Vite app and most can target Canvas, DOM, or WebGL through renderer-specific scripts.

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
| `playingsound`      | Sound playback with pause, resume, and fades     |
| `piratepig`         | Match-3 game with tweens, audio, text, and input |
| `simplesprite`      | Minimal sprite graph example                     |
| `tweenexample`      | Animated circles using tweens and timers         |
| `usingtilemap`      | Tilemap rendering                                |

Run the example explorer:

```sh
npm run explorer
```

Build a specific example:

```sh
npm run build --workspace=examples/drawingshapes
```

Run a renderer-specific example dev server:

```sh
npm run dev:canvas --workspace=examples/drawingshapes
npm run dev:dom --workspace=examples/drawingshapes
```

## Development

```sh
npm install

# Build packages
npm run build

# Run the normal Vitest workspace, excluding size tests
npm run test

# Run package unit tests through workspace scripts
npm run test:unit

# Lint, order, and format with auto-fixes
npm run fix

# Default quality sweep
npm run check

# Full CI-equivalent confidence sweep
npm run ci
```

Useful repository commands:

| Command                  | Purpose                                                                 |
| ------------------------ | ----------------------------------------------------------------------- |
| `npm run api`            | Print compact public API signatures                                     |
| `npm run coverage`       | Check that exported functions have colocated tests                      |
| `npm run order`          | Check source export and test `describe` ordering                        |
| `npm run size`           | Build matching examples and report gzip sizes against the baseline      |
| `npm run packages:check` | Check package shape, exports, references, and side-effect-free patterns |

## Repo Structure

```text
packages/      Workspace packages published as @flighthq/*
examples/      Standalone Vite example apps
tests/         Integration, API, browser API, and size tests
tools/         Development tools, including the example explorer
scripts/       Validation, API, coverage, ordering, size, and build scripts
```
