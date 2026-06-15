import type { Shape, TextFormat, TextMeasureFunction } from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeRectangle,
  computeTextFormatFontString,
  computeTextLayout,
  connectSignal,
  createApplication,
  createDisplayObject,
  createRichText,
  createShape,
  createTextFormatRange,
  createTextLayoutResult,
  invalidateNodeRender,
  startApplicationLoop,
} from '@flighthq/sdk';

import { render, scale } from './render';

const BUFFER = 64;
const GUTTER = 2;
const FIELD_W = 354;
const FIELD_H = 354;
const TEXT = 'Wqx\nWqx';
const TEXT_X = 300;
const TEXT_Y = 100;

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

// ---- Text format (matches original: serif, 120px, centered, 20px leading) ----

const format: TextFormat = {
  align: 'center',
  font: 'serif',
  leading: 20,
  size: 120,
};

// ---- Main text field ----

const textField = createRichText();
textField.x = TEXT_X;
textField.y = TEXT_Y;
textField.data.border = true;
textField.data.borderColor = 0x000000;
textField.data.defaultTextFormat = format;
textField.data.height = FIELD_H;
textField.data.multiline = true;
textField.data.selectable = false;
textField.data.text = TEXT;
textField.data.width = FIELD_W;
textField.data.wordWrap = true;

// ---- Compute metrics using an offscreen canvas ----
// wordWrap=true makes the layout use data.width for centering (matching the renderer).

const measureCanvas = document.createElement('canvas');
const measureCtx = measureCanvas.getContext('2d')!;
const measure: TextMeasureFunction = (t, fmt) => {
  measureCtx.font = computeTextFormatFontString(fmt);
  return measureCtx.measureText(t).width;
};

const result = createTextLayoutResult();
computeTextLayout(result, {
  formatRanges: [createTextFormatRange(format, 0, TEXT.length)],
  height: FIELD_H,
  measure,
  multiline: true,
  text: TEXT,
  width: FIELD_W,
  wordWrap: true,
});

const lineX = result.groups.find((g) => g.lineIndex === 0)?.offsetX ?? 0;
const tlm = {
  ascent: result.lineAscents[0] ?? 0,
  descent: result.lineDescents[0] ?? 0,
  height: result.lineHeights[0] ?? 0,
  leading: result.lineLeadings[0] ?? 0,
  width: result.lineWidths[0] ?? 0,
  x: lineX,
};
const textWidth = result.textWidth;
const textHeight = result.textHeight;

// ---- Visualization (replaces original's BitmapData drawing) ----

const bmpW = FIELD_W + BUFFER * 2;
const bmpH = FIELD_H + BUFFER * 2;

const vizBg = createShape();
vizBg.x = TEXT_X - BUFFER;
vizBg.y = TEXT_Y - BUFFER;
appendShapeBeginFill(vizBg, 0xe0e0e0, 1);
appendShapeRectangle(vizBg, 0, 0, bmpW, bmpH);

const vizLines = createShape();
vizLines.x = TEXT_X - BUFFER;
vizLines.y = TEXT_Y - BUFFER;
drawLineMetrics(vizLines, FIELD_W, FIELD_H, BUFFER, GUTTER, bmpW, bmpH, textWidth, textHeight, tlm);

// ---- Output metrics text ----

const outText = createRichText();
outText.x = 0;
outText.y = 0;
outText.data.height = 1000;
outText.data.multiline = true;
outText.data.text = buildMetricsString(TEXT_X, TEXT_Y, FIELD_W, FIELD_H, textWidth, textHeight, tlm, result);
outText.data.width = 350;
outText.data.wordWrap = false;

// ---- Lorem ipsum section (white background + word-wrapped text) ----

const whiteBg = createShape();
whiteBg.x = 0;
whiteBg.y = 250;
appendShapeBeginFill(whiteBg, 0xffffff, 1);
appendShapeRectangle(whiteBg, 0, 0, 200, 200);

const loremText = createRichText();
loremText.x = 0;
loremText.y = 250;
loremText.data.height = 200;
loremText.data.multiline = true;
loremText.data.text =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.';
loremText.data.width = 200;
loremText.data.wordWrap = true;

// ---- Scene graph (z-order: bg → vizBg → textField → vizLines → lorem → outText) ----

addNodeChild(root, vizBg);
addNodeChild(root, textField);
addNodeChild(root, vizLines);
addNodeChild(root, whiteBg);
addNodeChild(root, loremText);
addNodeChild(root, outText);

invalidateNodeRender(root);

// ---- Render loop ----

const app = createApplication();
connectSignal(app.onRender, () => {
  render(root);
});
startApplicationLoop(app);

// ---- Helpers ----

function fillRect(shape: Shape, x: number, y: number, w: number, h: number, color: number): void {
  appendShapeBeginFill(shape, color, 1);
  appendShapeRectangle(shape, x, y, Math.max(w, 1), Math.max(h, 1));
}

function drawLineMetrics(
  shape: Shape,
  fieldW: number,
  fieldH: number,
  buf: number,
  gut: number,
  bmpW: number,
  bmpH: number,
  tw: number,
  th: number,
  m: { x: number; width: number; height: number; ascent: number; descent: number; leading: number },
): void {
  const GREEN = 0x00ff00;
  const RED = 0xff0000;

  // text.width — horizontal bar near top, vertical boundaries
  fillRect(shape, buf, buf / 2, fieldW, 1, GREEN);
  fillRect(shape, buf, 0, 1, bmpH, RED);
  fillRect(shape, buf + fieldW, 0, 1, bmpH, RED);

  // text.textWidth — horizontal bar near bottom, vertical boundaries
  fillRect(shape, buf + gut + m.x, bmpH - buf / 2, tw, 1, GREEN);
  fillRect(shape, buf + gut + m.x, 0, 1, bmpH, RED);
  fillRect(shape, buf + gut + m.x + tw, 0, 1, bmpH, RED);

  // text.height — vertical bar on left, horizontal boundaries
  fillRect(shape, (buf * 1) / 4, buf, 1, fieldH, GREEN);
  fillRect(shape, (buf * 1) / 4, buf, bmpW - gut * 2, 1, RED);
  fillRect(shape, (buf * 1) / 4, buf + fieldH, bmpW - gut * 2, 1, RED);

  // text.height - gutter*2
  fillRect(shape, (buf * 2) / 4, buf + gut, 1, fieldH - gut * 2, GREEN);
  fillRect(shape, (buf * 2) / 4, buf + gut, bmpW - gut * 2, 1, RED);
  fillRect(shape, (buf * 2) / 4, buf + gut + fieldH - gut * 2, bmpW - gut * 2, 1, RED);

  // line height (ascent + descent)
  fillRect(shape, (buf * 3) / 4, buf + gut, 1, m.height, GREEN);
  fillRect(shape, (buf * 3) / 4, buf + gut, bmpW - gut * 2, 1, RED);
  fillRect(shape, (buf * 3) / 4, buf + gut + m.height, bmpW - gut * 2, 1, RED);

  // textHeight
  fillRect(shape, buf / 8, buf + gut, 1, th, GREEN);
  fillRect(shape, buf / 8, buf + gut, bmpW - gut * 2, 1, RED);
  fillRect(shape, buf / 8, buf + gut + th, bmpW - gut * 2, 1, RED);

  // ascent
  fillRect(shape, bmpW - (buf * 3) / 4, buf + gut, 1, m.ascent, GREEN);
  fillRect(shape, (buf * 3) / 4, buf + gut, bmpW - gut * 2, 1, RED);
  fillRect(shape, (buf * 3) / 4, buf + gut + m.ascent, bmpW - gut * 2, 1, RED);

  // descent
  fillRect(shape, bmpW - (buf * 2) / 4, buf + gut + m.ascent, 1, m.descent, GREEN);
  fillRect(shape, (buf * 3) / 4, buf + gut + m.ascent, bmpW - gut * 2, 1, RED);
  fillRect(shape, (buf * 3) / 4, buf + gut + m.ascent + m.descent, bmpW - gut * 2, 1, RED);

  // leading
  if (m.leading > 0) {
    fillRect(shape, bmpW - buf / 4, buf + gut + m.height, 1, m.leading, GREEN);
    fillRect(shape, (buf * 3) / 4, buf + gut + m.height, bmpW - gut * 2, 1, RED);
    fillRect(shape, (buf * 3) / 4, buf + gut + m.height + m.leading, bmpW - gut * 2, 1, RED);
  }

  // right margin (horizontal space between textWidth and field right edge)
  const marginLeft = buf + gut + m.x + tw;
  const marginW = fieldW - (gut * 2 + m.x + tw);
  if (marginW > 0) {
    fillRect(shape, marginLeft, bmpH - gut - buf * 2, marginW, 1, GREEN);
    fillRect(shape, marginLeft, buf * 2, 1, bmpH - buf * 4, RED);
    fillRect(shape, marginLeft + marginW, buf * 2, 1, bmpH - buf * 4, RED);
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function buildMetricsString(
  tx: number,
  ty: number,
  fw: number,
  fh: number,
  tw: number,
  th: number,
  m: { x: number; width: number; height: number; ascent: number; descent: number; leading: number },
  r: ReturnType<typeof createTextLayoutResult>,
): string {
  let s = '';
  s += `x/y = ${tx} / ${ty}`;
  s += `\nwidth/height = ${fw} / ${fh}`;
  s += `\ntextWidth/textHeight = ${round2(tw)} / ${round2(th)}`;
  for (let i = 0; i < r.numLines; i++) {
    const lx = r.groups.find((g) => g.lineIndex === i)?.offsetX ?? 0;
    s += `\nline(${i}) x = ${round2(lx)}`;
    s += `\nline(${i}) width = ${round2(r.lineWidths[i] ?? 0)}`;
    s += `\nline(${i}) height = ${round2(r.lineHeights[i] ?? 0)}`;
    s += `\nline(${i}) ascent = ${round2(r.lineAscents[i] ?? 0)}`;
    s += `\nline(${i}) descent = ${round2(r.lineDescents[i] ?? 0)}`;
    s += `\nline(${i}) leading = ${round2(r.lineLeadings[i] ?? 0)}`;
  }
  return s;
}
