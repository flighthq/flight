import { inverseMatrixTransformPointXY } from '@flighthq/geometry';
import { getNodeWorldTransformMatrix } from '@flighthq/node';
import { getTextLayout } from '@flighthq/text';
import { computeRichTextCharIndexAtPoint } from '@flighthq/textlayout';
import type { DisplayObject, NodeAny, TextLabel } from '@flighthq/types';
import { RichTextKind, TextLabelKind } from '@flighthq/types';

import { hitTestGraphLocalBounds, registerHitTestPrecise } from './hitTests';

/**
 * Opt-in exact hit provider for text: a text field still hits across its whole box (like coarse), but the
 * provider resolves *which character* is under the point — so `describeGraphHit`'s `subIndex` becomes the
 * character index (the basis for caret placement, selection, and link hit testing).
 *
 * Importing this module is the opt-in — it pulls `@flighthq/text` (`getTextLayout`) and
 * `@flighthq/textlayout` (`computeRichTextCharIndexAtPoint`), so the base interaction bundle stays free
 * of them (tree-shaken unless referenced). Returns 0 (a bounds hit with no char detail) when the text has
 * no computed layout yet (no measure provider registered).
 */
export function registerTextHitTest(): void {
  registerHitTestPrecise(TextLabelKind, resolveTextCharIndex);
  registerHitTestPrecise(RichTextKind, resolveTextCharIndex);
}

// -1 outside the text box; otherwise the character index at the point (0 when no layout is available yet).
function resolveTextCharIndex(source: NodeAny, x: number, y: number): number {
  if (!hitTestGraphLocalBounds(source, x, y)) return -1;
  const layout = getTextLayout(source as TextLabel);
  if (layout === null) return 0;
  inverseMatrixTransformPointXY(textHitLocalPoint, getNodeWorldTransformMatrix(source as DisplayObject), x, y);
  return computeRichTextCharIndexAtPoint(layout, textHitLocalPoint.x, textHitLocalPoint.y);
}

const textHitLocalPoint = { x: 0, y: 0 };
