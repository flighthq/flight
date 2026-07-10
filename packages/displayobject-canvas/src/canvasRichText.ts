import { computeRgbHexString } from '@flighthq/materials';
import { noopRendererData } from '@flighthq/render';
import { computeTextFormatFontString, getRichTextPasswordCharacter, getRichTextRuntime } from '@flighthq/text';
import {
  computeRichTextContent,
  computeTextBoundsHeight,
  computeTextBoundsWidth,
  computeTextLayout,
  getRichTextContent,
  getRichTextScrollYOffset,
  getRichTextSelectionRectangles,
  getTextLayoutResult,
} from '@flighthq/textlayout';
import type { TextSelectionRectangle } from '@flighthq/types';
import type {
  CanvasRenderState,
  DisplayObjectRenderer,
  RenderProxy2D,
  RichText,
  RichTextRuntime,
  TextFormat,
  TextLabelRuntime,
} from '@flighthq/types';

import { drawCanvasDisplayObject } from './canvasDisplayObject';
import { setCanvasTransform } from './canvasTransform';

export function drawCanvasRichText(state: CanvasRenderState, renderProxy: RenderProxy2D): void {
  drawCanvasRichTextField(state, renderProxy);
  // The editable-input overlay (caret/selection) draws on top of the field, in its own coordinate
  // space, and must run even when the text is empty — so it is invoked after the field, keyed off the
  // input slot. registerCanvasTextInputOverlay (enableCanvasTextInput) is what installs it; a static
  // RichText leaves the slot null and pulls no text-input code.
  if (_canvasTextInputOverlay !== null && getRichTextRuntime(renderProxy.source as RichText).input !== null) {
    _canvasTextInputOverlay(state, renderProxy);
  }
}

export type CanvasTextInputOverlay = (state: CanvasRenderState, renderProxy: RenderProxy2D) => void;

export function drawCanvasRichTextMask(state: CanvasRenderState, data: RenderProxy2D): void {
  drawCanvasDisplayObject(state, data);
}

function drawCanvasRichTextField(state: CanvasRenderState, renderProxy: RenderProxy2D): void {
  drawCanvasDisplayObject(state, renderProxy);

  const source = renderProxy.source as RichText;
  const data = source.data;
  const context = state.context;
  state.applyBlendMode?.(state, renderProxy.blendMode);
  context.globalAlpha = renderProxy.alpha;
  setCanvasTransform(state, context, renderProxy.transform2D);

  const richTextRuntime = getRichTextRuntime(source) as RichTextRuntime;
  const content = getRichTextContent(richTextRuntime);
  computeRichTextContent(content, data, getRichTextPasswordCharacter(source));
  const { text } = content;

  const measure = (t: string, fmt: TextFormat): number => {
    context.font = computeTextFormatFontString(fmt);
    return context.measureText(t).width;
  };

  const result = getTextLayoutResult(richTextRuntime as TextLabelRuntime);
  computeTextLayout(result, {
    text,
    formatRanges: content.formatRanges,
    width: data.width,
    height: data.height,
    measure,
    multiline: data.multiline,
    wordWrap: data.wordWrap,
  });
  const fieldW = computeTextBoundsWidth(data, result);
  const fieldH = computeTextBoundsHeight(data, result);

  if (data.background) {
    context.fillStyle = computeRgbHexString(data.backgroundColor);
    context.fillRect(0, 0, fieldW, fieldH);
  }

  if (data.border) {
    context.strokeStyle = computeRgbHexString(data.borderColor);
    context.lineWidth = 1;
    context.strokeRect(0, 0, fieldW, fieldH);
  }

  if (text.length === 0) return;

  // scrollV is 1-based: first visible line index = scrollV - 1
  const firstVisibleLine = data.scrollV - 1;
  const scrollYOffset = firstVisibleLine > 0 ? getRichTextScrollYOffset(result.lineHeights, firstVisibleLine) : 0;
  const scrollXOffset = data.scrollH;

  context.save();
  context.beginPath();
  context.rect(0, 0, fieldW, fieldH);
  context.clip();

  if (source.data.selectable && richTextRuntime.selectionBeginIndex !== richTextRuntime.selectionEndIndex) {
    getRichTextSelectionRectangles(
      _richTextSelectionRectangles,
      richTextRuntime.selectionBeginIndex,
      richTextRuntime.selectionEndIndex,
      result,
    );
    context.fillStyle = SELECTION_COLOR;
    context.globalAlpha = Math.min(1, renderProxy.alpha * SELECTION_ALPHA);
    for (const rectangle of _richTextSelectionRectangles) {
      context.fillRect(rectangle.x - scrollXOffset, rectangle.y - scrollYOffset, rectangle.width, rectangle.height);
    }
    context.globalAlpha = renderProxy.alpha;
  }

  context.textBaseline = 'alphabetic';
  context.textAlign = 'start';

  const bulletLines = new Set<number>();
  for (const group of result.groups) {
    if (group.lineIndex < firstVisibleLine) continue;

    context.font = computeTextFormatFontString(group.format);
    context.fillStyle = computeRgbHexString(group.format.color ?? data.textColor);
    const slice = text.substring(group.startIndex, group.endIndex);
    const x = group.offsetX - scrollXOffset;
    const y = group.offsetY + group.ascent - scrollYOffset;

    if (group.format.bullet && !bulletLines.has(group.lineIndex)) {
      bulletLines.add(group.lineIndex);
      const bulletW = context.measureText(BULLET_CHAR).width;
      context.fillText(BULLET_CHAR, x - bulletW - BULLET_GAP, y);
    }

    context.fillText(slice, x, y);

    const lineColor = computeRgbHexString(group.format.color ?? data.textColor);
    const lineWidth = Math.max(1, (group.format.size ?? 12) / 16);
    if (group.format.underline || group.format.strikethrough) {
      context.strokeStyle = lineColor;
      context.lineWidth = lineWidth;
      if (group.format.underline) {
        context.beginPath();
        context.moveTo(x, y + group.descent);
        context.lineTo(x + group.width, y + group.descent);
        context.stroke();
      }
      if (group.format.strikethrough) {
        context.beginPath();
        context.moveTo(x, y - group.ascent * 0.35);
        context.lineTo(x + group.width, y - group.ascent * 0.35);
        context.stroke();
      }
    }
  }

  context.restore();
}

export function registerCanvasTextInputOverlay(overlay: CanvasTextInputOverlay): void {
  _canvasTextInputOverlay = overlay;
}

const BULLET_CHAR = 'Ã¢â‚¬Â¢';
const BULLET_GAP = 4;
const SELECTION_ALPHA = 0.35;
const SELECTION_COLOR = '#0078d7';
const _richTextSelectionRectangles: TextSelectionRectangle[] = [];
let _canvasTextInputOverlay: CanvasTextInputOverlay | null = null;

export const defaultCanvasRichTextRenderer: DisplayObjectRenderer = {
  createData: noopRendererData,
  submit: drawCanvasRichText,
};
