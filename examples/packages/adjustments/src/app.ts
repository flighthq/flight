import type { Node2D, Shape } from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeRectangle,
  clearShapeCommands,
  createDisplayObject,
  createShape,
  createTextLabel,
  invalidateNodeAppearance,
  invalidateNodeLocalTransform,
  setNodeColorAdjustmentsTint,
  setTextLabelString,
} from '@flighthq/sdk';
import {
  applyColorMatrixToColor,
  createBrightnessColorMatrix,
  createContrastColorMatrix,
  createHueRotateColorMatrix,
  createIdentityColorMatrix,
  createSaturationColorMatrix,
  fuseColorMatrices,
} from '@flighthq/sdk/rendering';

import { render, scale } from './render';

const CANVAS_HEIGHT = 600;

const SAMPLE_COLORS: readonly number[] = [
  0xff0000ff, 0x00ff00ff, 0x0000ffff, 0xffff00ff, 0xff00ffff, 0x00ffffff, 0xffffffff, 0x808080ff,
];

const SWATCH_SIZE = 40;
const SWATCH_GAP = 8;
const SWATCHES_X = 40;
const SWATCHES_BEFORE_Y = 340;
const SWATCHES_AFTER_Y = 420;
const SWATCHES_TINT_Y = 510;

const MATRIX_X = 40;
const MATRIX_Y = 200;
const MATRIX_CELL_WIDTH = 90;
const MATRIX_CELL_HEIGHT = 24;

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

const captureWindow = window as typeof window & { __flightCapture?: boolean };
const captureMode = captureWindow.__flightCapture === true;

// Slider state. `brightness` is normalized-linear, the unit `createBrightnessColorMatrix` documents:
// the amount lands in the matrix's offset column, which is added to channels already scaled to 0..1.
// This example drove it on a -128..128 scale, so the capture default of 24 pinned every channel at 1
// and the "After matrix" row rendered eight white squares with #ffffff under them, whatever the other
// three sliders said. The matrix readout above it was correct the whole time, which is what made the
// mismatch easy to miss.
let brightness = captureMode ? 0.1 : 0;
let contrast = captureMode ? 1.2 : 1;
let hueRotation = captureMode ? 30 : 0;
let saturation = captureMode ? 0.75 : 1;

// Fused color matrix (recomputed when sliders change).
let fusedMatrix = createIdentityColorMatrix();

const controlsStyle = document.createElement('style');
controlsStyle.textContent = `
  .controls { position:fixed; z-index:2; top:14px; left:max(14px, calc(50% - 386px));
    width:min(390px, calc(100vw - 28px)); display:grid; grid-template-columns:1fr; gap:6px; padding:10px 12px;
    box-sizing:border-box; border:1px solid #39405e; border-radius:9px; background:#111426ee;
    box-shadow:0 10px 30px #0007; color:#d8def2; font:12px monospace; }
  .controls .field { display:grid; grid-template-columns:88px minmax(90px, 1fr) 48px; gap:8px; align-items:center; }
  .controls .field input { width:100%; min-width:0; accent-color:#eedd44; }
  .controls .value { color:#eedd44; text-align:right; font-variant-numeric:tabular-nums; }
`;
document.head.appendChild(controlsStyle);

const controls = document.createElement('section');
controls.className = 'controls';
const controlsTitle = document.createElement('strong');
controlsTitle.textContent = 'Color matrix controls';
controls.appendChild(controlsTitle);
document.body.appendChild(controls);

// Create an HTML slider with a label and value readout. Returns a function to read the current value.
function createSlider(labelText: string, min: number, max: number, step: number, initial: number): HTMLInputElement {
  const container = document.createElement('div');
  container.className = 'field';

  const label = document.createElement('span');
  label.textContent = labelText;
  container.appendChild(label);

  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(initial);
  container.appendChild(input);

  const valueDisplay = document.createElement('span');
  valueDisplay.textContent = initial.toFixed(2);
  valueDisplay.className = 'value';
  container.appendChild(valueDisplay);

  input.addEventListener('input', () => {
    valueDisplay.textContent = parseFloat(input.value).toFixed(2);
    onSliderChange();
  });

  controls.appendChild(container);
  return input;
}

// Create sliders in HTML overlay above the canvas.
const brightnessSlider = createSlider('Brightness', -1, 1, 0.01, brightness);
const contrastSlider = createSlider('Contrast', 0, 3, 0.01, contrast);
const hueSlider = createSlider('Hue Rotate', -180, 180, 1, hueRotation);
const saturationSlider = createSlider('Saturation', 0, 3, 0.01, saturation);

// Matrix display: 4 rows x 5 columns of text labels showing the fused matrix values.
const matrixLabels: Node2D[] = [];

function createLabel(text: string, x: number, y: number, size: number, color: number): Node2D {
  const label = createTextLabel();
  label.data.text = text;
  label.data.textFormat = { size, color };
  label.x = x;
  label.y = y;
  invalidateNodeLocalTransform(label);
  return label;
}

function updateLabel(label: Node2D, text: string): void {
  setTextLabelString(label as ReturnType<typeof createTextLabel>, text);
}

// Title and section labels.
addNodeChild(root, createLabel('4x5 Color Matrix (fused)', MATRIX_X, MATRIX_Y - 30, 16, 0xccccccff));

const ROW_LABELS = ["R'", "G'", "B'", "A'"];
const COL_LABELS = ['R', 'G', 'B', 'A', 'Offset'];

for (let col = 0; col < 5; col++) {
  addNodeChild(
    root,
    createLabel(COL_LABELS[col], MATRIX_X + 40 + col * MATRIX_CELL_WIDTH, MATRIX_Y - 10, 12, 0x888888ff),
  );
}

for (let row = 0; row < 4; row++) {
  addNodeChild(root, createLabel(ROW_LABELS[row], MATRIX_X, MATRIX_Y + 14 + row * MATRIX_CELL_HEIGHT, 12, 0x888888ff));
  for (let col = 0; col < 5; col++) {
    const label = createLabel(
      '0.000',
      MATRIX_X + 40 + col * MATRIX_CELL_WIDTH,
      MATRIX_Y + 14 + row * MATRIX_CELL_HEIGHT,
      13,
      0xeedd44ff,
    );
    addNodeChild(root, label);
    matrixLabels.push(label);
  }
}

// Color swatch shapes: "before" row (original) and "after" row (matrix-transformed).
addNodeChild(root, createLabel('Original colors', SWATCHES_X, SWATCHES_BEFORE_Y - 22, 14, 0xccccccff));
addNodeChild(root, createLabel('After matrix', SWATCHES_X, SWATCHES_AFTER_Y - 22, 14, 0xccccccff));
addNodeChild(root, createLabel('Per-instance node tint', SWATCHES_X, SWATCHES_TINT_Y - 22, 14, 0xccccccff));

const afterSwatches: Shape[] = [];

for (let i = 0; i < SAMPLE_COLORS.length; i++) {
  const x = SWATCHES_X + i * (SWATCH_SIZE + SWATCH_GAP);

  const beforeShape = createShape();
  appendShapeBeginFill(beforeShape, SAMPLE_COLORS[i], 1);
  appendShapeRectangle(beforeShape, x, SWATCHES_BEFORE_Y, SWATCH_SIZE, SWATCH_SIZE);
  addNodeChild(root, beforeShape);

  const afterShape = createShape();
  addNodeChild(root, afterShape);
  afterSwatches.push(afterShape);

  // The geometry stays white. Each node carries its own packed-RGBA tint, which the render walk
  // resolves to the backend's per-instance color scale/bias data.
  const tintedShape = createShape();
  appendShapeBeginFill(tintedShape, 0xffffffff, 1);
  appendShapeRectangle(tintedShape, x, SWATCHES_TINT_Y, SWATCH_SIZE, SWATCH_SIZE);
  setNodeColorAdjustmentsTint(tintedShape, SAMPLE_COLORS[i]);
  addNodeChild(root, tintedShape);
}

// Hex value labels below each after-swatch.
const afterHexLabels: Node2D[] = [];
for (let i = 0; i < SAMPLE_COLORS.length; i++) {
  const x = SWATCHES_X + i * (SWATCH_SIZE + SWATCH_GAP);
  const hexLabel = createLabel('', x, SWATCHES_AFTER_Y + SWATCH_SIZE + 4, 9, 0x888888ff);
  addNodeChild(root, hexLabel);
  afterHexLabels.push(hexLabel);
}

// Description label at the bottom.
addNodeChild(
  root,
  createLabel(
    'Adjustments compose a 4x5 color matrix as pure data. Use sliders to build a fused matrix.',
    SWATCHES_X,
    CANVAS_HEIGHT - 22,
    12,
    0x666666ff,
  ),
);

function formatMatrixValue(v: number): string {
  if (Math.abs(v) < 0.0005) return '0.000';
  return v.toFixed(3);
}

function packedRgbaToHex(packed: number): string {
  const r = (packed >>> 24) & 0xff;
  const g = (packed >>> 16) & 0xff;
  const b = (packed >>> 8) & 0xff;
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

function recomputeMatrix(): void {
  const matrices: number[][] = [];

  if (brightness !== 0) matrices.push(createBrightnessColorMatrix(brightness));
  if (contrast !== 1) matrices.push(createContrastColorMatrix(contrast));
  if (hueRotation !== 0) matrices.push(createHueRotateColorMatrix(hueRotation));
  if (saturation !== 1) matrices.push(createSaturationColorMatrix(saturation));

  fusedMatrix = matrices.length > 0 ? fuseColorMatrices(matrices) : createIdentityColorMatrix();
}

function updateMatrixDisplay(): void {
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 5; col++) {
      const idx = row * 5 + col;
      updateLabel(matrixLabels[idx], formatMatrixValue(fusedMatrix[idx]));
    }
  }
}

function updateSwatches(): void {
  for (let i = 0; i < SAMPLE_COLORS.length; i++) {
    const original = SAMPLE_COLORS[i];
    const transformed = applyColorMatrixToColor(fusedMatrix, original);

    const x = SWATCHES_X + i * (SWATCH_SIZE + SWATCH_GAP);
    const shape = afterSwatches[i];
    clearShapeCommands(shape);
    appendShapeBeginFill(shape, transformed, 1);
    appendShapeRectangle(shape, x, SWATCHES_AFTER_Y, SWATCH_SIZE, SWATCH_SIZE);
    invalidateNodeAppearance(shape);

    updateLabel(afterHexLabels[i], packedRgbaToHex(transformed));
  }
}

function onSliderChange(): void {
  brightness = parseFloat(brightnessSlider.value);
  contrast = parseFloat(contrastSlider.value);
  hueRotation = parseFloat(hueSlider.value);
  saturation = parseFloat(saturationSlider.value);

  recomputeMatrix();
  updateMatrixDisplay();
  updateSwatches();
}

// Initial computation.
recomputeMatrix();
updateMatrixDisplay();
updateSwatches();

function enterFrame(): void {
  render(root);
  requestAnimationFrame(enterFrame);
}

enterFrame();
