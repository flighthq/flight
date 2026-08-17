import { getBitmapPixelRgb } from '@flighthq/bitmap';
import { applyAnimationClipToNode2D } from '@flighthq/scene2d';
import { createScene2DFromRiveDocument } from '@flighthq/scene2d-formats';
import type { Bitmap } from '@flighthq/types';
import { DisplayObjectKind, ShapeKind } from '@flighthq/types';
import { createFunctionalTarget } from '@ft/render';

const WIDTH = 800;
const HEIGHT = 480;
const LEFT_X = 210;
const RIGHT_X = 590;
const CENTER_Y = 240;
const POSITIVE_CORNER_X = 360;
const NEGATIVE_CORNER_X = 440;
const CORNER_Y = 70;

export function assertRender(frame: Readonly<Bitmap>): void {
  const scale = frame.width / width;
  const at = (x: number, y: number): number => getBitmapPixelRgb(frame, Math.round(x * scale), Math.round(y * scale));

  const dark = at(LEFT_X - 70, CENTER_Y);
  const light = at(LEFT_X + 70, CENTER_Y);
  if (colorDistance(dark, light) < 80) {
    throw new Error(`[rive-import] imported gradient did not change across the card — ${hex(dark)} vs ${hex(light)}`);
  }

  const stroke = at(LEFT_X, CENTER_Y - 79);
  if (!isBright(stroke))
    throw new Error(`[rive-import] imported second paint did not stroke the card — ${hex(stroke)}`);

  const clippedCorner = at(LEFT_X + 100, CENTER_Y + 70);
  if (!isBackground(clippedCorner)) {
    throw new Error(`[rive-import] imported clip did not remove the card corner — ${hex(clippedCorner)}`);
  }

  const intersectedEdge = at(LEFT_X + 100, CENTER_Y);
  if (!isBackground(intersectedEdge)) {
    throw new Error(`[rive-import] second imported clip did not intersect the first — ${hex(intersectedEdge)}`);
  }

  // Positive rounding leaves this inside the shape while an inverted (negative-radius) corner cuts
  // through it. Sampling twins with otherwise identical geometry catches treating the sign as abs().
  const roundedCorner = at(POSITIVE_CORNER_X + 24, CORNER_Y - 24);
  const invertedCorner = at(NEGATIVE_CORNER_X + 24, CORNER_Y - 24);
  if (isBackground(roundedCorner) || !isBackground(invertedCorner)) {
    throw new Error(
      `[rive-import] positive and inverted corners rendered alike — ${hex(roundedCorner)} vs ${hex(invertedCorner)}`,
    );
  }

  // These points straddle gradient bands, the stroke, the clipped corners, and untouched background.
  // The two cards use different Rive geometry encodings, so a decoder error can make the pair disagree.
  for (const [x, y] of COMPARISON_POINTS) {
    const parametric = at(LEFT_X + x, CENTER_Y + y);
    const points = at(RIGHT_X + x, CENTER_Y + y);
    if (colorDistance(parametric, points) > 6) {
      throw new Error(
        `[rive-import] parametric and points encodings disagree at ${x},${y} — ${hex(parametric)} vs ${hex(points)}`,
      );
    }
  }
}

type RiveFixtureObject = readonly [typeKey: number, properties: readonly number[][]];

function createRiveFixture(): Uint8Array {
  const objects: RiveFixtureObject[] = [
    [RIVE_ARTBOARD, [text(RIVE_NAME, 'Functional'), float(RIVE_WIDTH, WIDTH), float(RIVE_HEIGHT, HEIGHT)]],
  ];

  addCard(objects, LEFT_X, true);
  const animatedShape = addCard(objects, RIGHT_X, false);
  addCornerProbe(objects, POSITIVE_CORNER_X, 18);
  addCornerProbe(objects, NEGATIVE_CORNER_X, -18);
  objects.push(
    [
      RIVE_LINEAR_ANIMATION,
      [text(RIVE_ANIMATION_NAME, 'settle'), uint(RIVE_ANIMATION_FPS, 60), uint(RIVE_ANIMATION_DURATION, 60)],
    ],
    [RIVE_KEYED_OBJECT, [uint(RIVE_KEYED_OBJECT_ID, animatedShape)]],
    [RIVE_KEYED_PROPERTY, [uint(RIVE_KEYED_PROPERTY_KEY, RIVE_X)]],
    [
      RIVE_KEYFRAME_DOUBLE,
      [uint(RIVE_KEYFRAME_FRAME, 0), uint(RIVE_KEYFRAME_INTERPOLATION, 1), float(RIVE_KEYFRAME_VALUE, RIGHT_X - 60)],
    ],
    [
      RIVE_KEYFRAME_DOUBLE,
      [uint(RIVE_KEYFRAME_FRAME, 60), uint(RIVE_KEYFRAME_INTERPOLATION, 1), float(RIVE_KEYFRAME_VALUE, RIGHT_X + 60)],
    ],
  );
  return encodeRiveFile(objects);
}

function addCard(objects: RiveFixtureObject[], x: number, parametric: boolean): number {
  const shape = addComponent(objects, RIVE_SHAPE, RIVE_ARTBOARD_ID, [
    text(RIVE_NAME, parametric ? 'Parametric' : 'Points'),
    float(RIVE_X, x),
    float(RIVE_Y, CENTER_Y),
  ]);
  if (parametric) {
    addComponent(objects, RIVE_RECTANGLE, shape, [float(RIVE_PATH_WIDTH, 220), float(RIVE_PATH_HEIGHT, 160)]);
  } else {
    const path = addComponent(objects, RIVE_POINTS_PATH, shape, [uint(RIVE_PATH_IS_CLOSED, 1)]);
    addComponent(objects, RIVE_STRAIGHT_VERTEX, path, [float(RIVE_VERTEX_X, -110), float(RIVE_VERTEX_Y, -80)]);
    addComponent(objects, RIVE_STRAIGHT_VERTEX, path, [float(RIVE_VERTEX_X, 110), float(RIVE_VERTEX_Y, -80)]);
    addComponent(objects, RIVE_STRAIGHT_VERTEX, path, [float(RIVE_VERTEX_X, 110), float(RIVE_VERTEX_Y, 80)]);
    addComponent(objects, RIVE_STRAIGHT_VERTEX, path, [float(RIVE_VERTEX_X, -110), float(RIVE_VERTEX_Y, 80)]);
  }

  const fill = addComponent(objects, RIVE_FILL, shape);
  const gradient = addComponent(objects, RIVE_LINEAR_GRADIENT, fill, [
    float(RIVE_GRADIENT_START_X, -110),
    float(RIVE_GRADIENT_START_Y, 0),
    float(RIVE_GRADIENT_END_X, 110),
    float(RIVE_GRADIENT_END_Y, 0),
  ]);
  addComponent(objects, RIVE_GRADIENT_STOP, gradient, [color(RIVE_GRADIENT_STOP_COLOR, 0xff2563eb)]);
  addComponent(objects, RIVE_GRADIENT_STOP, gradient, [
    color(RIVE_GRADIENT_STOP_COLOR, 0xfff97316),
    float(RIVE_GRADIENT_STOP_POSITION, 1),
  ]);

  const stroke = addComponent(objects, RIVE_STROKE, shape, [
    float(RIVE_STROKE_THICKNESS, 6),
    uint(RIVE_STROKE_CAP, 1),
    uint(RIVE_STROKE_JOIN, 1),
  ]);
  addComponent(objects, RIVE_SOLID_COLOR, stroke, [color(RIVE_SOLID_COLOR_VALUE, 0xffffffff)]);

  const clipSource = addComponent(objects, RIVE_SHAPE, RIVE_ARTBOARD_ID, [
    float(RIVE_X, x),
    float(RIVE_Y, CENTER_Y),
    float(RIVE_OPACITY, 0),
  ]);
  addComponent(objects, RIVE_ELLIPSE, clipSource, [float(RIVE_PATH_WIDTH, 230), float(RIVE_PATH_HEIGHT, 170)]);
  addComponent(objects, RIVE_CLIPPING_SHAPE, shape, [uint(RIVE_CLIP_SOURCE_ID, clipSource)]);

  const intersectingSource = addComponent(objects, RIVE_SHAPE, RIVE_ARTBOARD_ID, [
    float(RIVE_X, x),
    float(RIVE_Y, CENTER_Y),
    float(RIVE_OPACITY, 0),
  ]);
  addComponent(objects, RIVE_RECTANGLE, intersectingSource, [
    float(RIVE_PATH_WIDTH, 180),
    float(RIVE_PATH_HEIGHT, 190),
  ]);
  addComponent(objects, RIVE_CLIPPING_SHAPE, shape, [uint(RIVE_CLIP_SOURCE_ID, intersectingSource)]);
  return shape;
}

function addCornerProbe(objects: RiveFixtureObject[], x: number, radius: number): void {
  const shape = addComponent(objects, RIVE_SHAPE, RIVE_ARTBOARD_ID, [float(RIVE_X, x), float(RIVE_Y, CORNER_Y)]);
  const path = addComponent(objects, RIVE_POINTS_PATH, shape, [uint(RIVE_PATH_IS_CLOSED, 1)]);
  addComponent(objects, RIVE_STRAIGHT_VERTEX, path, [float(RIVE_VERTEX_X, -30), float(RIVE_VERTEX_Y, -30)]);
  addComponent(objects, RIVE_STRAIGHT_VERTEX, path, [
    float(RIVE_VERTEX_X, 30),
    float(RIVE_VERTEX_Y, -30),
    float(RIVE_VERTEX_RADIUS, radius),
  ]);
  addComponent(objects, RIVE_STRAIGHT_VERTEX, path, [float(RIVE_VERTEX_X, 30), float(RIVE_VERTEX_Y, 30)]);
  addComponent(objects, RIVE_STRAIGHT_VERTEX, path, [float(RIVE_VERTEX_X, -30), float(RIVE_VERTEX_Y, 30)]);
  const fill = addComponent(objects, RIVE_FILL, shape);
  addComponent(objects, RIVE_SOLID_COLOR, fill, [color(RIVE_SOLID_COLOR_VALUE, 0xff22c55e)]);
}

function addComponent(
  objects: RiveFixtureObject[],
  typeKey: number,
  parent: number,
  properties: readonly number[][] = [],
): number {
  const index = objects.length;
  objects.push([typeKey, [uint(RIVE_PARENT_ID, parent), ...properties]]);
  return index;
}

function encodeRiveFile(objects: readonly RiveFixtureObject[]): Uint8Array {
  // Empty table of contents is the normal editor output; standard property widths come from Rive's
  // object model. The fixture is generated here, carries no third-party bytes, and is deterministic.
  const bytes: number[] = [0x52, 0x49, 0x56, 0x45, ...varUint(7), ...varUint(0), ...varUint(0), 0];
  for (const [typeKey, properties] of objects) {
    bytes.push(...varUint(typeKey));
    for (const property of properties) bytes.push(...property);
    bytes.push(0);
  }
  return new Uint8Array(bytes);
}

function color(key: number, value: number): number[] {
  return [...varUint(key), value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

function float(key: number, value: number): number[] {
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, value, true);
  return [...varUint(key), view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3)];
}

function text(key: number, value: string): number[] {
  const encoded = Array.from(new TextEncoder().encode(value));
  return [...varUint(key), ...varUint(encoded.length), ...encoded];
}

function uint(key: number, value: number): number[] {
  return [...varUint(key), ...varUint(value)];
}

function varUint(value: number): number[] {
  const bytes: number[] = [];
  let remaining = value;
  do {
    const group = remaining % 128;
    remaining = Math.floor(remaining / 128);
    bytes.push(remaining > 0 ? group + 128 : group);
  } while (remaining > 0);
  return bytes;
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 0xff;
}

function colorDistance(a: number, b: number): number {
  return (
    Math.abs(channel(a, 16) - channel(b, 16)) +
    Math.abs(channel(a, 8) - channel(b, 8)) +
    Math.abs(channel(a, 0) - channel(b, 0))
  );
}

function hex(rgb: number): string {
  return `#${(rgb & 0xffffff).toString(16).padStart(6, '0')}`;
}

function isBackground(rgb: number): boolean {
  return colorDistance(rgb, 0x111827) < 30;
}

function isBright(rgb: number): boolean {
  return channel(rgb, 16) > 190 && channel(rgb, 8) > 190 && channel(rgb, 0) > 190;
}

const COMPARISON_POINTS: ReadonlyArray<readonly [number, number]> = [
  [-120, -90],
  [-100, -70],
  [-80, -40],
  [-70, 0],
  [-40, 40],
  [0, -79],
  [0, -40],
  [0, 0],
  [0, 40],
  [40, -40],
  [70, 0],
  [80, 40],
  [100, 70],
  [120, 90],
];

const RIVE_ARTBOARD = 1;
const RIVE_SHAPE = 3;
const RIVE_ELLIPSE = 4;
const RIVE_STRAIGHT_VERTEX = 5;
const RIVE_RECTANGLE = 7;
const RIVE_POINTS_PATH = 16;
const RIVE_SOLID_COLOR = 18;
const RIVE_GRADIENT_STOP = 19;
const RIVE_FILL = 20;
const RIVE_LINEAR_GRADIENT = 22;
const RIVE_STROKE = 24;
const RIVE_KEYED_OBJECT = 25;
const RIVE_KEYED_PROPERTY = 26;
const RIVE_KEYFRAME_DOUBLE = 30;
const RIVE_LINEAR_ANIMATION = 31;
const RIVE_CLIPPING_SHAPE = 42;

const RIVE_ARTBOARD_ID = 0;
const RIVE_NAME = 4;
const RIVE_PARENT_ID = 5;
const RIVE_WIDTH = 7;
const RIVE_HEIGHT = 8;
const RIVE_X = 13;
const RIVE_Y = 14;
const RIVE_OPACITY = 18;
const RIVE_PATH_WIDTH = 20;
const RIVE_PATH_HEIGHT = 21;
const RIVE_VERTEX_X = 24;
const RIVE_VERTEX_Y = 25;
const RIVE_VERTEX_RADIUS = 26;
const RIVE_PATH_IS_CLOSED = 32;
const RIVE_GRADIENT_START_Y = 33;
const RIVE_GRADIENT_END_X = 34;
const RIVE_GRADIENT_END_Y = 35;
const RIVE_SOLID_COLOR_VALUE = 37;
const RIVE_GRADIENT_STOP_COLOR = 38;
const RIVE_GRADIENT_STOP_POSITION = 39;
const RIVE_GRADIENT_START_X = 42;
const RIVE_STROKE_THICKNESS = 47;
const RIVE_STROKE_CAP = 48;
const RIVE_STROKE_JOIN = 49;
const RIVE_KEYED_OBJECT_ID = 51;
const RIVE_KEYED_PROPERTY_KEY = 53;
const RIVE_ANIMATION_NAME = 55;
const RIVE_ANIMATION_FPS = 56;
const RIVE_ANIMATION_DURATION = 57;
const RIVE_KEYFRAME_FRAME = 67;
const RIVE_KEYFRAME_INTERPOLATION = 68;
const RIVE_KEYFRAME_VALUE = 70;
const RIVE_CLIP_SOURCE_ID = 92;

const { render, width } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x111827ff,
  kinds: [DisplayObjectKind, ShapeKind],
  clip: true,
  expectedImageDescription:
    'An 800x480 field on a very dark blue-grey background with TWO cards that must look IDENTICAL to ' +
    'each other, one centred near x 210 and one near x 590, both around y 240. Each card is filled with ' +
    'a GRADIENT that changes markedly from its left side to its right — a point 70 px left of the card ' +
    'centre and one 70 px right of it are clearly different colours, not one flat tone — and each carries ' +
    'a bright stroke along its upper edge, about 79 px above the card centre. Each card also has pieces ' +
    'REMOVED: about 100 px right and 70 px below the centre is background rather than card, and so is a ' +
    'point 100 px directly right of the centre, so two separate cuts overlap rather than one covering ' +
    'the other. Near the top of the field, around y 70, sit two small twin shapes at x 360 and x 440 that ' +
    'differ only in one corner: the left one keeps ink 24 px in from its corner while the right one has ' +
    'that same spot cut away to background. Twins that look alike there is a failure. The two big cards ' +
    'matching each other is the strongest claim in the picture: they are built from different underlying ' +
    'descriptions of the same drawing, so any visible difference between them is wrong.',
});

const imported = createScene2DFromRiveDocument(createRiveFixture());
const artboard = imported.artboards[0];
if (artboard === undefined) throw new Error('[rive-import] synthetic Rive fixture produced no artboard');
const animation = artboard.animations[0];
if (animation === undefined) throw new Error('[rive-import] synthetic Rive fixture produced no animation');

// The right shape is authored at RIGHT_X but keyed from either side of it. Sampling the imported
// clip at its midpoint must put the independently encoded points path beside the parametric path.
applyAnimationClipToNode2D(animation.clip, 0.5);
render(artboard.root);
