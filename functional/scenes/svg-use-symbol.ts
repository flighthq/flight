// svg-use-symbol — render coverage for <use>: that a referenced definition is instantiated, placed at
// the use's x/y, and scaled from a <symbol>'s viewBox to the use's width/height.
//
// One definition is instantiated TWICE at different sizes, which is the property that makes this about
// reuse rather than about drawing: a single-instance scene passes even if the reference were resolved
// once and inlined, and passes if the viewBox scale were ignored whenever it happened to be 1. Here the
// same glyph must appear at 5x in one place and 2x in another, so a dropped scale or a shared instance
// fails somewhere.
//
// The glyph is an asymmetric bar-and-arm, so scaling errors show as shape errors and not just as size:
// the scene assertion samples the arm, the bar, and the notch BETWEEN them. A uniformly-scaled solid block would
// fill the notch, and a mirrored or transposed instantiation would move it.
//
// Both uses are deliberately UNIFORM scales (40x30 viewBox into 200x150 and 80x60), so the default
// preserveAspectRatio has nothing to letterbox. That keeps this scene about reference resolution,
// placement and scale, and leaves aspect-ratio fitting — a distinct behaviour with its own edge cases —
// to a scene that actually targets it.
//
// The third instance references a plain <rect> rather than a <symbol>, which is a separate path in the
// importer (element instantiation rather than symbol viewport instantiation) and carries translation
// only.
//
// SCOPE, STATED NARROWLY: <use> of a <symbol> at uniform scale, and <use> of a plain element. It says
// nothing about non-uniform preserveAspectRatio fitting, nested or recursive use, use with its own
// transform, or style inheritance through a use. Read a pass as "a use instantiates its reference at
// the right place and scale," never as "SVG use is covered."
//
// The scene assertion gates canvas, webgl and webgpu — not dom. The DOM verifier has no pixels to read back and
// returns after checking the target element has children, before any scene assertion runs (functionalVerify.ts).
import type { Bitmap, ImportDiagnostic } from '@flighthq/sdk';
import {
  addNodeChild,
  createDisplayObject,
  createScene2DFromSvgDocument,
  getBitmapPixelRgb,
  ShapeKind,
} from '@flighthq/sdk';
import { createFunctionalTarget, declareAntialiasingPolicy } from '@ft/render';

const WIDTH = 800;
const HEIGHT = 600;

// The symbol's own coordinate system, and the asymmetric glyph inside it.
const VIEW_W = 40;
const VIEW_H = 30;
const BAR_W = 8;
const ARM_H = 10;
const ARM_W = 24;

// Instance A: 40x30 viewBox into a 200x150 box, so exactly 5x.
const A_X = 60;
const A_Y = 150;
const A_SCALE = 5;
// Instance B: the same glyph into an 80x60 box, so exactly 2x.
const B_X = 420;
const B_Y = 150;
const B_SCALE = 2;
// Instance C references a plain rect and only translates.
const C_X = 600;
const C_Y = 380;
const RECT_W = 60;
const RECT_H = 40;

const GLYPH_FILL = '#33ccff';
const RECT_FILL = '#ffaa33';

const SVG_SOURCE = `<svg width="${WIDTH}" height="${HEIGHT}">
  <defs>
    <symbol id="glyph" viewBox="0 0 ${VIEW_W} ${VIEW_H}">
      <rect x="0" y="0" width="${BAR_W}" height="${VIEW_H}" fill="${GLYPH_FILL}"/>
      <rect x="${BAR_W}" y="0" width="${ARM_W}" height="${ARM_H}" fill="${GLYPH_FILL}"/>
    </symbol>
    <rect id="plate" x="0" y="0" width="${RECT_W}" height="${RECT_H}" fill="${RECT_FILL}"/>
  </defs>
  <use href="#glyph" x="${A_X}" y="${A_Y}" width="${VIEW_W * A_SCALE}" height="${VIEW_H * A_SCALE}"/>
  <use href="#glyph" x="${B_X}" y="${B_Y}" width="${VIEW_W * B_SCALE}" height="${VIEW_H * B_SCALE}"/>
  <use href="#plate" x="${C_X}" y="${C_Y}"/>
</svg>`;

declareAntialiasingPolicy('aa');

const { render } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff, // opaque black (packed RGBA)
  kinds: [ShapeKind],
  expectedImageDescription:
    'An 800x600 opaque black field with three flat shapes. Two are the same cyan L-glyph at different ' +
    'sizes: a large one whose upright bar spans x 60-100, y 150-300 with its arm running right at ' +
    'x 100-220, y 150-200; and a small one, the same shape at two-fifths the size, whose bar spans ' +
    'x 420-436, y 150-210 with its arm at x 436-484, y 150-170. Both are the SAME glyph, so their ' +
    'proportions match exactly and only their scale differs. The third is an orange rectangle, 60x40, at ' +
    'x 600-660, y 380-420 — a different shape and a different colour, drawn at its own natural size with ' +
    'no scaling. Every shape is one flat tone with no gradient or outline, the three do not overlap, and ' +
    'the rest of the field is pure black.',
});

const root = createDisplayObject();

// A clean document must import silently. A diagnostic here would mean the importer dropped or recovered
// something, making every pixel assertion below a statement about the fallback rather than the import.
const diagnostics: ImportDiagnostic[] = [];
const imported = createScene2DFromSvgDocument(SVG_SOURCE, diagnostics);
if (diagnostics.length > 0) {
  throw new Error(
    `[svg-use-symbol] clean document raised ${diagnostics.length} diagnostic(s): ${JSON.stringify(diagnostics)}`,
  );
}
addNodeChild(root, imported);

render(root);

export function assertRender(frame: Readonly<Bitmap>): void {
  const scale = frame.width / WIDTH;
  const at = (x: number, y: number): number => getBitmapPixelRgb(frame, Math.round(x * scale), Math.round(y * scale));

  assertGlyph('A', A_X, A_Y, A_SCALE);
  assertGlyph('B', B_X, B_Y, B_SCALE);

  // Instance C: a plain referenced element, translated only.
  const plate = at(C_X + RECT_W / 2, C_Y + RECT_H / 2);
  if (!isRect(plate)) {
    throw new Error(`[svg-use-symbol] the use of a plain <rect> did not instantiate it — got #${hex(plate)}`);
  }
  const belowPlate = at(C_X + RECT_W / 2, C_Y + RECT_H + 30);
  if (!isBackground(belowPlate)) {
    throw new Error(`[svg-use-symbol] the plain <rect> instance is larger than authored — got #${hex(belowPlate)}`);
  }

  function assertGlyph(label: string, originX: number, originY: number, factor: number): void {
    // Inside the arm, clear of the bar: present at both scales.
    const arm = at(originX + (BAR_W + ARM_W / 2) * factor, originY + (ARM_H / 2) * factor);
    if (!isGlyph(arm)) {
      throw new Error(`[svg-use-symbol] instance ${label}'s arm is missing at ${factor}x — got #${hex(arm)}`);
    }
    // Inside the bar, below the arm.
    const bar = at(originX + (BAR_W / 2) * factor, originY + VIEW_H * factor - (ARM_H / 2) * factor);
    if (!isGlyph(bar)) {
      throw new Error(`[svg-use-symbol] instance ${label}'s bar is missing at ${factor}x — got #${hex(bar)}`);
    }
    // The notch: right of the bar and below the arm is empty in the glyph, so this asserts the SHAPE
    // scaled rather than a block of the right size appearing.
    const notch = at(originX + (BAR_W + ARM_W / 2) * factor, originY + VIEW_H * factor - (ARM_H / 2) * factor);
    if (!isBackground(notch)) {
      throw new Error(
        `[svg-use-symbol] instance ${label} filled its notch at ${factor}x — got #${hex(notch)}, so the ` +
          `glyph rendered as a solid block rather than the authored shape`,
      );
    }
    // Just beyond the instance's box: nothing may spill past the use's width/height.
    const beyond = at(originX + VIEW_W * factor + 20, originY + (ARM_H / 2) * factor);
    if (!isBackground(beyond)) {
      throw new Error(
        `[svg-use-symbol] instance ${label} extends past its authored width at ${factor}x — got #${hex(beyond)}`,
      );
    }
  }
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 0xff;
}

function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}

function isBackground(rgb: number): boolean {
  return channel(rgb, 16) < 60 && channel(rgb, 8) < 60 && channel(rgb, 0) < 60;
}

function isGlyph(rgb: number): boolean {
  return channel(rgb, 0) > 150 && channel(rgb, 16) < 130;
}

function isRect(rgb: number): boolean {
  return channel(rgb, 16) > 150 && channel(rgb, 0) < 130;
}
