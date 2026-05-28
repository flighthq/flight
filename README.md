# Flight

A TypeScript 2D rendering engine with a Flash/OpenFL-style display list API. Targets HTML5 Canvas, WebGL, and DOM renderers from a single scene graph.

## Packages

The monorepo is organized under `packages/`. Import everything from the barrel for applications:

```ts
import { createBitmap, createShape, addChild } from '@flighthq/sdk';
```

Individual packages can be imported directly in library code (the barrel is for examples and apps only).

| Package | Purpose |
|---|---|
| `@flighthq/sdk` | Single barrel re-exporting all packages |
| `@flighthq/types` | Shared TypeScript interfaces and types |
| `@flighthq/scenegraph-display` | Display objects — containers, bitmaps, shapes, text |
| `@flighthq/scenegraph-core` | Base scene graph (transform, bounds, graph nodes) |
| `@flighthq/render-canvas` | HTML5 Canvas renderer |
| `@flighthq/render-dom` | DOM renderer |
| `@flighthq/render-webgl` | WebGL renderer |
| `@flighthq/render-core` | Renderer registration and render node management |
| `@flighthq/tween` | Tween engine and timers |
| `@flighthq/tween-easing` | Easing functions (Quad, Elastic, …) |
| `@flighthq/signals` | Typed event signals |
| `@flighthq/assets` | Asset loading (images, fonts, audio) |
| `@flighthq/geometry` | Rectangle, matrix, point types |
| `@flighthq/materials` | Blend modes, color utilities |
| `@flighthq/spritesheet` | Spritesheet parsing |
| `@flighthq/timeline` | Frame-based timeline |
| `@flighthq/timeline-spritesheet` | Spritesheet animation timeline |
| `@flighthq/interaction` | Input and hit testing |
| `@flighthq/text-layout` | Text layout engine |
| `@flighthq/entity` | Entity/component system |

## Getting started

```ts
import {
  addChild,
  createBitmap,
  createDisplayObject,
  loadImageSourceFromURL,
  updateDisplayObjectBeforeRender,
} from '@flighthq/sdk';

// Scene graph
const root = createDisplayObject();
const bitmap = createBitmap();
const image = await loadImageSourceFromURL('assets/sprite.png');
bitmap.data.image = image;
addChild(root, bitmap);

// Render loop
function enterFrame() {
  if (updateDisplayObjectBeforeRender(state, root)) {
    render(root);
  }
  requestAnimationFrame(enterFrame);
}
enterFrame();
```

### Renderer setup

Each renderer is set up independently. Register display object renderers against a render state, then call the appropriate render function:

```ts
import {
  BitmapKind,
  createCanvasRenderState,
  defaultCanvasBitmapRenderer,
  registerRenderer,
  renderCanvasBackground,
  renderCanvasDisplayObject,
} from '@flighthq/sdk';

const canvas = document.createElement('canvas');
const state = createCanvasRenderState(canvas, { backgroundColor: 0x1a1a2eff });

registerRenderer(state, BitmapKind, defaultCanvasBitmapRenderer);

function render(root) {
  renderCanvasBackground(state);
  renderCanvasDisplayObject(state, root);
}
```

### Shapes

```ts
import { createShape, beginFill, drawRect, drawCircle, lineStyle, lineTo } from '@flighthq/sdk';

const box = createShape();
beginFill(box, 0x24afc4);
drawRect(box, 0, 0, 100, 100);

const circle = createShape();
beginFill(circle, 0xff6644);
drawCircle(circle, 0, 0, 50);

const line = createShape();
lineStyle(line, 4, 0xffffff);
lineTo(line, 200, 0);
```

### Text

```ts
import { createText, loadFontFromURL } from '@flighthq/sdk';

const font = await loadFontFromURL('assets/MyFont.woff', 'MyFont');

const label = createText();
label.data.text = 'Hello World';
label.data.textFormat = { font: font.name, size: 32, color: 0xffffff };
```

### Tweens

```ts
import {
  createTweenManager, createTween, updateTweens,
  connectSignal, invalidateRender, Quad,
} from '@flighthq/sdk';

const manager = createTweenManager();

const tween = createTween(manager, sprite, 1000, { x: 400, alpha: 0 }, { ease: Quad.easeOut });
connectSignal(tween.onComplete, () => console.log('done'));
connectSignal(tween.onUpdate, () => invalidateRender(sprite));

// In your frame loop:
updateTweens(manager, deltaMs);
```

### Filters

Filters are applied per display object and rendered via `cacheAsBitmap`:

```ts
import { setFilters, createDropShadowFilter, createGlowFilter, createBlurFilter } from '@flighthq/sdk';

setFilters(panel, [createGlowFilter(0xffffff, 0.6, 10, 10)]);
setFilters(label, [createDropShadowFilter(3, 45, 0x000000, 0.5, 4, 4)]);
setFilters(sprite, [createBlurFilter(8, 8)]);
```

## Examples

Examples live in `examples/`. Each is a standalone Vite app that can target canvas, DOM, or WebGL via `RENDER` env var.

| Example | Description |
|---|---|
| `displayingabitmap` | Load and display a bitmap |
| `drawingshapes` | Primitives — rect, circle, ellipse, polygon, lines |
| `addingtext` | Text with a custom font |
| `addinganimation` | Tween with easing |
| `tweenexample` | Animated circles using tweens and timers |
| `animatedsprite` | Spritesheet animation |
| `bunnymark` | Performance benchmark (bitmaps) |
| `nyancat` | GIF-style animation |
| `piratepig` | Match-3 game with tweens, audio, and filters |
| `simplesprite` | Minimal sprite example |
| `usingtilemap` | Tile map rendering |

Build a specific example:

```sh
npm run build --workspace=examples/drawingshapes
```

Run the example explorer (dev server with live preview of all examples):

```sh
npm run explorer
```

## Development

```sh
npm install

# Build all packages
npm run build

# Run all tests
npm run test

# Unit tests only
npm run test:unit

# Lint and format
npm run lint
npm run format

# Regenerate OVERVIEW.md (auto-generated — do not edit manually)
npm run overview
```

## Repo structure

```
packages/      internal packages (@flighthq/*)
examples/      example apps
tests/         integration, API, and size tests
tools/         dev tooling (explorer)
scripts/       build utilities
```