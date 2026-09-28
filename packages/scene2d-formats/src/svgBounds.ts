import { createRectangle, matrixTransformRectangle } from '@flighthq/geometry/contract';
import {
  getNodeChildAt,
  getNodeChildCount,
  getNodeLocalBoundsRectangle,
  getNodeLocalMatrix,
} from '@flighthq/node/contract';
import { getShapeBounds } from '@flighthq/shape/contract';
import type { Node2D, Rectangle, Shape, SvgImportContext } from '@flighthq/types/contract';
import { RichTextKind, ShapeKind, TextLabelKind } from '@flighthq/types/contract';

export function createSvgNode2DBounds(target: Node2D, context: SvgImportContext): Rectangle | null {
  if (target.kind === TextLabelKind || target.kind === RichTextKind) return null;
  const out = createRectangle();
  // ★ THIS BOX EXISTS TO SATISFY A FORMAT RULE, NOT TO DESCRIBE THE SHAPE. The bounding box these units are
  // defined against EXCLUDES stroke-width (and clipping, masking, filters and opacity) — it is the geometry's
  // extent, not the inked extent. `getNodeLocalBoundsRectangle` deliberately includes the stroke, which is
  // correct for culling, hit-testing and picking and WRONG here, so the importer keeps its own geometry-only
  // box recorded at shape-creation time.
  //
  // Do not "fix" this back toward the node's bounds because stroke-inclusive looks more accurate in
  // isolation: it silently oversized every objectBoundingBox consumer, and only on stroked shapes inside a
  // container — a 10x10 rect with stroke-width 4 measured 14 through a parent <g> and 10 when clipped
  // directly, so the same element got two different boxes depending on which node carried the clip.
  const recorded = context.objectBoundingBoxes.get(target);
  let ownBounds: Readonly<Rectangle>;
  if (target.kind === ShapeKind) {
    const shapeBounds = createRectangle();
    // A partial box is worse than no box for objectBoundingBox units: it places a valid-looking clip at
    // the wrong coordinates. Validate the complete command stream even when SVG retained its fill-only
    // source geometry separately, then keep using that recorded geometry to exclude stroke as required.
    if (!getShapeBounds(shapeBounds, target as Shape, 'fill')) return null;
    ownBounds = recorded ?? shapeBounds;
  } else {
    ownBounds = recorded ?? getNodeLocalBoundsRectangle(target);
  }
  let hasBounds = copyNonEmptySvgBounds(out, ownBounds, false);
  let hasUnresolvedChildBounds = false;
  const childCount = getNodeChildCount(target);
  for (let index = 0; index < childCount; index++) {
    const child = getNodeChildAt(target, index) as Node2D | null;
    if (child === null) continue;
    const childBounds = createSvgNode2DBounds(child, context);
    if (childBounds === null) {
      hasUnresolvedChildBounds = true;
      continue;
    }
    const bounds = createRectangle();
    matrixTransformRectangle(bounds, getNodeLocalMatrix(child), childBounds);
    hasBounds = copyNonEmptySvgBounds(out, bounds, hasBounds);
  }
  return hasBounds && !hasUnresolvedChildBounds ? out : null;
}

/**
 * The geometry-only bounding box SVG's `objectBoundingBox` units are defined against.
 *
 * ★ THIS NAMES THE TEXT FAMILY'S NODE KINDS, AND ONLY ITS KINDS. Text bounds depend on a shaper the importer does not
 * run, so a subtree containing a label has no box and every `objectBoundingBox` consumer over it has to decline rather
 * than guess. That is a comparison against two kind constants from `@flighthq/types` — it links no text reading — so a
 * build with no text family still answers the question correctly, by never meeting a label.
 */
// Why `createSvgNode2DBounds` could not measure a subtree. The clip path reports this alongside the drop so
// a caller can tell OUR unimplemented measurement from THEIR empty geometry — today both surface as "your
// clip was dropped", which is the same sentence for a file that is wrong and a file we cannot yet handle.
//
// Text is genuinely UNMEASURABLE here, not merely unmeasured: this importer performs no text layout, so a
// subtree containing text has an UNKNOWN bounding box rather than a known one missing a piece. That is why
// the null propagates instead of unioning the measurable children — a box computed from the rest would be
// confidently too small, and a clip placed from it would be silently wrong rather than loudly absent.
export function hasUnmeasurableSvgText(target: Node2D): boolean {
  if (target.kind === TextLabelKind || target.kind === RichTextKind) return true;
  const childCount = getNodeChildCount(target);
  for (let index = 0; index < childCount; index++) {
    const child = getNodeChildAt(target, index) as Node2D | null;
    if (child !== null && hasUnmeasurableSvgText(child)) return true;
  }
  return false;
}

function copyNonEmptySvgBounds(out: Rectangle, source: Readonly<Rectangle>, hasBounds: boolean): boolean {
  if (source.width === 0 || source.height === 0) return hasBounds;
  if (!hasBounds) {
    out.x = source.x;
    out.y = source.y;
    out.width = source.width;
    out.height = source.height;
    return true;
  }
  const minimumX = Math.min(out.x, source.x);
  const minimumY = Math.min(out.y, source.y);
  const maximumX = Math.max(out.x + out.width, source.x + source.width);
  const maximumY = Math.max(out.y + out.height, source.y + source.height);
  out.x = minimumX;
  out.y = minimumY;
  out.width = maximumX - minimumX;
  out.height = maximumY - minimumY;
  return true;
}
