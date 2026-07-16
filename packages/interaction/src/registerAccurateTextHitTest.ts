import { inverseMatrixTransformPointXY } from '@flighthq/geometry';
import { getNodeWorldTransformMatrix } from '@flighthq/node';
import { getTextLayout } from '@flighthq/text';
import { computeRichTextCharIndexAtPoint } from '@flighthq/textlayout';
import type { DisplayObject, NodeAny, TextLabel } from '@flighthq/types';
import { RichTextKind, TextLabelKind } from '@flighthq/types';

import { registerHitTestDetailed } from './hitTests';

/**
 * Opt-in Tier-2 sub-index for text: resolves which character is under the pointer, so
 * `findGraphHitTargetDetailed`'s `subIndex` becomes the character index (the basis for caret placement,
 * selection, and link hit testing). The coarse Tier-1 text hit stays the bounds box — a text field is
 * clickable across its whole area; this only refines *where within it*.
 *
 * Importing this module is the opt-in — it pulls `@flighthq/text` (`getTextLayout`) and
 * `@flighthq/textlayout` (`computeRichTextCharIndexAtPoint`), so the base interaction bundle stays free
 * of them (tree-shaken unless referenced). Returns -1 when the text has no computed layout yet (no
 * measure provider registered) — the honest "not resolvable" sentinel.
 */
export function registerAccurateTextHitTest(): void {
  registerHitTestDetailed(TextLabelKind, resolveTextCharIndex);
  registerHitTestDetailed(RichTextKind, resolveTextCharIndex);
}

function resolveTextCharIndex(source: NodeAny, x: number, y: number, _shapeFlag: boolean): number {
  const layout = getTextLayout(source as TextLabel);
  if (layout === null) return -1;
  inverseMatrixTransformPointXY(textHitLocalPoint, getNodeWorldTransformMatrix(source as DisplayObject), x, y);
  return computeRichTextCharIndexAtPoint(layout, textHitLocalPoint.x, textHitLocalPoint.y);
}

const textHitLocalPoint = { x: 0, y: 0 };
