import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  createDisplayContainer,
  createShape,
  ShapeKind,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const { height, render, width } = await createFunctionalTarget({
  width: 800,
  height: 600,
  background: 0xffffffff,
  kinds: [ShapeKind],
});

// 9 rows, 4 columns. Each row is a different alpha level from 1.0 down to 0.0.
// Column layout:
//   0: solid reference color (grey computed from alpha)
//   1: white + black overlay at (1 - alpha), no cacheAsBitmap
//   2: same as column 1 (cacheAsBitmap not available yet — kept as a placeholder)
//   3: white + alpha-channel color (ARGB with alpha in high byte)
//
// All four columns should look identical at each row.

const ROWS = 9;
const root = createDisplayContainer();

const W = width;
const H = height;
const cellW = W / 4;
const cellH = H / ROWS;

for (let y = 0; y < ROWS; y++) {
  const alpha = 1 - y / 8;
  const frag = Math.round(alpha * 255);
  const solidColor = (frag << 16) | (frag << 8) | frag;

  // Column 0 — solid reference
  const ref = createShape();
  appendShapeBeginFill(ref, solidColor);
  appendShapeRectangle(ref, 0, y * cellH, cellW, cellH);
  appendShapeEndFill(ref);
  addNodeChild(root, ref);

  // Columns 1 & 2 — white base + semi-transparent black overlay
  for (const col of [1, 2]) {
    const base = createShape();
    appendShapeBeginFill(base, 0xffffff);
    appendShapeRectangle(base, col * cellW, y * cellH, cellW, cellH);
    appendShapeEndFill(base);
    addNodeChild(root, base);

    const overlay = createShape();
    appendShapeBeginFill(overlay, 0x000000, 1 - alpha);
    appendShapeRectangle(overlay, col * cellW, y * cellH, cellW, cellH);
    appendShapeEndFill(overlay);
    addNodeChild(root, overlay);
  }

  // Column 3 — white base + color with alpha baked into fill alpha parameter
  const base3 = createShape();
  appendShapeBeginFill(base3, 0xffffff);
  appendShapeRectangle(base3, 3 * cellW, y * cellH, cellW, cellH);
  appendShapeEndFill(base3);
  addNodeChild(root, base3);

  const overlay3 = createShape();
  appendShapeBeginFill(overlay3, solidColor, alpha);
  appendShapeRectangle(overlay3, 3 * cellW, y * cellH, cellW, cellH);
  appendShapeEndFill(overlay3);
  addNodeChild(root, overlay3);
}

render(root);
