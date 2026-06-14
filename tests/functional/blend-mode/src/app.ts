// Requires: assets/BlendSquare.png, assets/BlendCircle.png
// Port of BlendModeTest1.
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  BlendMode,
  createBitmap,
  createDisplayContainer,
  createRichText,
  createShape,
  loadImageSourceFromURL,
} from '@flighthq/sdk';

import { height, render, scale, width } from './render';

const BLEND_MODES: [BlendMode, string][] = [
  [BlendMode.Normal, 'normal'],
  [BlendMode.Layer, 'layer'],
  [BlendMode.Multiply, 'multiply'],
  [BlendMode.Screen, 'screen'],
  [BlendMode.Lighten, 'lighten'],
  [BlendMode.Darken, 'darken'],
  [BlendMode.Difference, 'difference'],
  [BlendMode.Add, 'add'],
  [BlendMode.Subtract, 'subtract'],
  [BlendMode.Invert, 'invert'],
  [BlendMode.Alpha, 'alpha'],
  [BlendMode.Erase, 'erase'],
  [BlendMode.Overlay, 'overlay'],
  [BlendMode.Hardlight, 'hardlight'],
];

const root = createDisplayContainer();
root.scaleX = scale;
root.scaleY = scale;

const W = width / scale;
const H = height / scale;

const bg = createShape();
appendShapeBeginFill(bg, 0xffffff);
appendShapeRectangle(bg, 0, 0, W, H);
appendShapeEndFill(bg);
addNodeChild(root, bg);

const [squareImg, circleImg] = await Promise.all([
  loadImageSourceFromURL('assets/BlendSquare.png'),
  loadImageSourceFromURL('assets/BlendCircle.png'),
]);

// Grid layout — 16:9 aspect ratio
let rows = 1;
while (rows * Math.floor((rows * 16) / 9) < BLEND_MODES.length) rows++;
const cols = Math.floor((rows * 16) / 9);

for (let i = 0; i < BLEND_MODES.length; i++) {
  const [mode, name] = BLEND_MODES[i];
  const col = i % cols;
  const row = Math.floor(i / cols);
  const cx = (W * col) / cols + W / (2 * cols);
  const cy = (H * row) / rows + H / (2 * rows) - 20;

  const square = createBitmap();
  square.data.image = squareImg;
  square.data.smoothing = true;
  square.x = cx - squareImg.width / 2;
  square.y = cy - squareImg.height / 2;
  addNodeChild(root, square);

  const circle = createBitmap();
  circle.data.image = circleImg;
  circle.data.smoothing = true;
  circle.x = cx - 10;
  circle.y = cy - 10;
  circle.blendMode = mode;
  addNodeChild(root, circle);

  const lbl = createRichText();
  lbl.data.defaultTextFormat = { font: 'sans-serif', size: 14, bold: true, color: 0x222222 };
  lbl.x = cx - squareImg.width / 2 - 30;
  lbl.y = cy + squareImg.height / 2 + 40;
  lbl.data.width = 200;
  lbl.data.height = 30;
  lbl.data.text = name;
  addNodeChild(root, lbl);
}

render(root);
