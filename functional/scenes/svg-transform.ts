// svg-transform — render coverage for the SVG importer's transform attribute: that a transform on a
// group reaches the rasterizer as a real node transform, and that a MIRRORING one survives.
//
// The mirrored glyph is the point of this scene. An SVG transform is parsed to a matrix and handed to
// decomposeMatrixToTransform2D (svgDocument.ts), which until recently carried a negative determinant on
// scaleY while deriving skewX as though scaleY were positive — so scale(-1, 1) came back out as
// (-1, 0, 0, -1), a 180° ROTATION rather than a horizontal mirror. Every mirrored SVG document imported
// with that defect rendered wrong, and nothing caught it: the importer had no render coverage at all.
//
// So the glyph is asymmetric on BOTH axes. A shape symmetric across the mirror line renders identically
// whether it was mirrored or rotated, and this scene would pass against the very defect it exists to
// catch. The two candidate renderings put the arm on opposite sides of the glyph's origin row, and the
// oracle samples both — it fails in each direction rather than merely proving the arm is somewhere.
//
// The third glyph carries translate + rotate to cover ordinary composed transforms, and each glyph has
// its own fill so a mix-up between them cannot read as a pass.
//
// SCOPE, STATED NARROWLY: transform on a group, for the translate / scale / rotate functions only. The
// importer also parses matrix(), skewX() and skewY(), and supports transforms in places this scene never
// exercises. Read a pass as "group transforms reach the rasterizer, and mirroring survives," never as
// "SVG transforms are covered."
//
// The oracle gates canvas, webgl and webgpu — not dom. The DOM verifier has no pixels to read back and
// returns after checking the target element has children, before any oracle runs (functionalVerify.ts).
import type { Bitmap, ImportDiagnostic } from '@flighthq/sdk';
import {
  addNodeChild,
  createDisplayObject,
  createScene2DFromSvgDocument,
  getBitmapPixelRgb,
  ShapeKind,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const WIDTH = 800;
const HEIGHT = 600;

// The glyph, in its own local coordinates: a bar down the left edge and an arm along the top going
// right. Asymmetric on both axes, which is what lets a mirror be told apart from a rotation.
const BAR_WIDTH = 20;
const GLYPH_HEIGHT = 120;
const ARM_LENGTH = 90;
const ARM_HEIGHT = 30;

// Every glyph's local origin sits on this row. Chosen so the mirrored copy stays fully on-canvas under
// EITHER rendering: the correct mirror runs down to y = 420, the defect's 180° rotation runs up to
// y = 180. A row that clipped one of them would weaken the discriminator into a visibility test.
const ROW_Y = 300;
const CONTROL_X = 80;
// Local +x runs LEFT from here under the mirror, so that glyph occupies x = 310..400.
const MIRROR_X = 400;
const ROTATE_X = 650;

const CONTROL_FILL = '#33ccff';
const MIRROR_FILL = '#33ff66';
const ROTATE_FILL = '#ffaa33';

const SVG_SOURCE = `<svg width="${WIDTH}" height="${HEIGHT}">
  <g transform="translate(${CONTROL_X},${ROW_Y})" fill="${CONTROL_FILL}">${glyphMarkup()}</g>
  <g transform="translate(${MIRROR_X},${ROW_Y}) scale(-1,1)" fill="${MIRROR_FILL}">${glyphMarkup()}</g>
  <g transform="translate(${ROTATE_X},${ROW_Y}) rotate(90)" fill="${ROTATE_FILL}">${glyphMarkup()}</g>
</svg>`;

const { render } = await createFunctionalTarget({
  width: WIDTH,
  height: HEIGHT,
  background: 0x000000ff, // opaque black (packed RGBA)
  kinds: [ShapeKind],
  expectedImageDescription:
    'An 800x600 opaque black field with three flat L-shaped glyphs on one row starting at y 300, each a ' +
    'different colour, each made of a long bar and a shorter arm meeting at a right angle. The cyan ' +
    'control has its bar upright at x 80-100 running down to y 420, with its arm running RIGHT along the ' +
    'top at x 100-170, y 300-330. The green one is its mirror image: bar upright at x 380-400, arm running ' +
    'LEFT at x 310-380, y 300-330. The orange one is turned a quarter turn: its long bar lies HORIZONTAL ' +
    'at x 530-650, y 300-320, with the arm hanging down at x 620-650, y 320-390. The three orientations ' +
    'must differ from each other in exactly that way — three identical upright glyphs, or a mirror that ' +
    'points the same way as the control, is the failure. All three are flat colour with no gradient, and ' +
    'the field is otherwise pure black.',
});

const root = createDisplayObject();

// A clean document must import silently. A diagnostic here would mean the importer dropped or recovered
// something, making every pixel assertion below a statement about the fallback rather than the import.
const diagnostics: ImportDiagnostic[] = [];
const imported = createScene2DFromSvgDocument(SVG_SOURCE, diagnostics);
if (diagnostics.length > 0) {
  throw new Error(
    `[svg-transform] clean document raised ${diagnostics.length} diagnostic(s): ${JSON.stringify(diagnostics)}`,
  );
}
addNodeChild(root, imported);

render(root);

export function assertRender(frame: Readonly<Bitmap>): void {
  const scale = frame.width / WIDTH;
  const at = (x: number, y: number): number => getBitmapPixelRgb(frame, Math.round(x * scale), Math.round(y * scale));

  // The translated control: its arm runs right from the bar, below the origin row.
  const controlArm = at(CONTROL_X + BAR_WIDTH + 40, ROW_Y + ARM_HEIGHT / 2);
  if (!isFill(controlArm)) {
    throw new Error(`[svg-transform] translated glyph's arm is missing — got #${hex(controlArm)}`);
  }
  // Below the arm and right of the bar is a hole in the glyph, so the shape is asserted, not just ink.
  const controlHole = at(CONTROL_X + BAR_WIDTH + 40, ROW_Y + GLYPH_HEIGHT - 20);
  if (isFill(controlHole)) {
    throw new Error(
      `[svg-transform] translated glyph is a solid block, not the authored shape — got #${hex(controlHole)}`,
    );
  }

  // The mirrored glyph. Under the correct mirror its arm runs BELOW the origin row; under the defect's
  // 180° rotation it runs above it instead.
  const mirrorArmX = MIRROR_X - BAR_WIDTH - 40;
  const below = at(mirrorArmX, ROW_Y + ARM_HEIGHT / 2);
  const above = at(mirrorArmX, ROW_Y - ARM_HEIGHT / 2);
  if (!isFill(below)) {
    throw new Error(
      `[svg-transform] reflection lost: the mirrored glyph's arm is not below the origin row — got ` +
        `#${hex(below)}. scale(-1,1) decomposed to a 180° rotation instead of a horizontal mirror.`,
    );
  }
  if (isFill(above)) {
    throw new Error(
      `[svg-transform] the mirrored glyph's arm is ABOVE the origin row — got #${hex(above)}. That is the ` +
        `180°-rotation rendering, not a mirror.`,
    );
  }
  // A mirror runs leftward from its origin; nothing may spill to the right of it.
  const spill = at(MIRROR_X + 40, ROW_Y + ARM_HEIGHT / 2);
  if (isFill(spill)) {
    throw new Error(`[svg-transform] the mirrored glyph extends right of its origin — got #${hex(spill)}`);
  }

  // The rotated glyph: rotate(90) maps local (x, y) to (-y, x), so the bar lies along the top edge
  // running left from the origin. Sampling it proves the rotation applied and in which direction.
  const rotatedBar = at(ROTATE_X - 70, ROW_Y + BAR_WIDTH / 2);
  if (!isFill(rotatedBar)) {
    throw new Error(`[svg-transform] rotated glyph's bar is not where rotate(90) places it — got #${hex(rotatedBar)}`);
  }
}

function glyphMarkup(): string {
  return (
    `<rect x="0" y="0" width="${BAR_WIDTH}" height="${GLYPH_HEIGHT}"/>` +
    `<rect x="${BAR_WIDTH}" y="0" width="${ARM_LENGTH - BAR_WIDTH}" height="${ARM_HEIGHT}"/>`
  );
}

function channel(rgb: number, shift: number): number {
  return (rgb >> shift) & 255;
}

function hex(rgb: number): string {
  return (rgb & 0xffffff).toString(16).padStart(6, '0');
}

// Any of the three fills against an opaque-black background. The glyphs are distinguished by position
// rather than by colour here; the distinct fills exist so a human reading the baseline can tell them
// apart, and so a mix-up shows up as a visible change rather than an identical frame.
function isFill(rgb: number): boolean {
  return channel(rgb, 16) > 90 || channel(rgb, 8) > 90 || channel(rgb, 0) > 90;
}
