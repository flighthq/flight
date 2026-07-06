import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeRectangle,
  createDisplayContainer,
  createRichText,
  createShape,
  loadFontFromUrl,
  RichTextKind,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const { height, render, width } = await createFunctionalTarget({
  width: 1000,
  height: 700,
  background: 0xffffffff,
  kinds: [RichTextKind],
});

const unifont = await loadFontFromUrl('assets/unifont-8.0.01.ttf', 'Unifont');

const COLS = 16;
const ROWS = 20;

const root = createDisplayContainer();

const W = width;
const H = height;

const bg = createShape();
appendShapeBeginFill(bg, 0xffffff);
appendShapeRectangle(bg, 0, 0, W, H);
addNodeChild(root, bg);

const fmt = { font: unifont.name, size: 18, color: 0x000000 };

const colHeaders: ReturnType<typeof createRichText>[] = [];
for (let x = 0; x < COLS; x++) {
  const tf = createRichText();
  tf.data.defaultTextFormat = fmt;
  tf.data.text = String(x);
  tf.x = 200 + x * 50;
  tf.y = 20;
  tf.data.width = 50;
  tf.data.height = 30;
  addNodeChild(root, tf);
  colHeaders.push(tf);
}

const rowLabels: ReturnType<typeof createRichText>[] = [];
for (let y = 0; y < ROWS; y++) {
  const tf = createRichText();
  tf.data.defaultTextFormat = fmt;
  tf.x = 10;
  tf.y = 75 + y * 30;
  tf.data.width = 120;
  tf.data.height = 30;
  addNodeChild(root, tf);
  rowLabels.push(tf);
}

const cells: ReturnType<typeof createRichText>[][] = [];
for (let y = 0; y < ROWS; y++) {
  const row: ReturnType<typeof createRichText>[] = [];
  cells.push(row);
  for (let x = 0; x < COLS; x++) {
    const tf = createRichText();
    tf.data.defaultTextFormat = fmt;
    tf.x = 200 + x * 50;
    tf.y = 75 + y * 30;
    tf.data.width = 50;
    tf.data.height = 30;
    addNodeChild(root, tf);
    row.push(tf);
  }
}

let lineOffset = 0;

function updateDisplay(): void {
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const cp = (y + lineOffset) * COLS + x;
      cells[y][x].data.text = cp <= 0x10ffff ? String.fromCodePoint(cp) : '';
    }
    const base = (y + lineOffset) * COLS;
    const hex = base.toString(16).toUpperCase().padStart(6, '0');
    rowLabels[y].data.text = '0x' + hex;
  }
  render(root);
}

const MAX_OFFSET = Math.floor(0x10ffff / COLS);

document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' && lineOffset < MAX_OFFSET) {
    lineOffset++;
    updateDisplay();
  } else if (e.key === 'ArrowUp' && lineOffset > 0) {
    lineOffset--;
    updateDisplay();
  } else if (e.key === 'ArrowRight') {
    lineOffset = Math.min(lineOffset + 16, MAX_OFFSET);
    updateDisplay();
  } else if (e.key === 'ArrowLeft') {
    lineOffset = Math.max(lineOffset - 16, 0);
    updateDisplay();
  }
});

updateDisplay();
