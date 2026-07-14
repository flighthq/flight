import {
  applyColorMatrixToColor,
  createBrightnessColorMatrix,
  createContrastColorMatrix,
  createHueRotateColorMatrix,
  createIdentityColorMatrix,
  createSaturationColorMatrix,
  fuseColorMatrices,
} from '@flighthq/adjustments';
import type { DisplayObject, Shape } from '@flighthq/sdk';
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
} from '@flighthq/sdk';

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

const MATRIX_X = 40;
const MATRIX_Y = 200;
const MATRIX_CELL_WIDTH = 90;
const MATRIX_CELL_HEIGHT = 24;

const root = createDisplayObject();
root.scaleX = scale;
root.scaleY = scale;

// Slider state.
let brightness = 0;
let contrast = 1;
let hueRotation = 0;
let saturation = 1;

// Fused color matrix (recomputed when sliders change).
let fusedMatrix = createIdentityColorMatrix();

// Create an HTML slider with a label and value readout. Returns a function to read the current value.
function createSlider(
  labelText: string,
  min: number,
  max: number,
  step: number,
  initial: number,
  x: number,
  y: number,
): HTMLInputElement {
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.left = x + 'px';
  container.style.top = y + 'px';
  container.style.display = 'flex';
  container.style.alignItems = 'center';
  container.style.gap = '8px';
  container.style.fontFamily = 'monospace';
  container.style.fontSize = '13px';
  container.style.color = '#ccc';

  const label = document.createElement('span');
  label.textContent = labelText;
  label.style.width = '100px';
  label.style.textAlign = 'right';
  container.appendChild(label);

  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(initial);
  input.style.width = '200px';
  container.appendChild(input);

  const valueDisplay = document.createElement('span');
  valueDisplay.textContent = initial.toFixed(2);
  valueDisplay.style.width = '60px';
  container.appendChild(valueDisplay);

  input.addEventListener('input', () => {
    valueDisplay.textContent = parseFloat(input.value).toFixed(2);
    onSliderChange();
  });

  document.body.appendChild(container);
  return input;
}

// Create sliders in HTML overlay above the canvas.
const brightnessSlider = createSlider('Brightness', -128, 128, 1, 0, 20, 20);
const contrastSlider = createSlider('Contrast', 0, 3, 0.01, 1, 20, 50);
const hueSlider = createSlider('Hue Rotate', -180, 180, 1, 0, 20, 80);
const saturationSlider = createSlider('Saturation', 0, 3, 0.01, 1, 20, 110);

// Matrix display: 4 rows x 5 columns of text labels showing the fused matrix values.
const matrixLabels: DisplayObject[] = [];

function createLabel(text: string, x: number, y: number, size: number, color: number): DisplayObject {
  const label = createTextLabel();
  label.data.text = text;
  label.data.textFormat = { size, color };
  label.x = x;
  label.y = y;
  invalidateNodeLocalTransform(label);
  return label;
}

function updateLabel(label: DisplayObject, text: string): void {
  (label as ReturnType<typeof createTextLabel>).data.text = text;
  invalidateNodeAppearance(label);
}

// Title and section labels.
addNodeChild(root, createLabel('4x5 Color Matrix (fused)', MATRIX_X, MATRIX_Y - 30, 16, 0xcccccc));

const ROW_LABELS = ["R'", "G'", "B'", "A'"];
const COL_LABELS = ['R', 'G', 'B', 'A', 'Offset'];

for (let col = 0; col < 5; col++) {
  addNodeChild(
    root,
    createLabel(COL_LABELS[col], MATRIX_X + 40 + col * MATRIX_CELL_WIDTH, MATRIX_Y - 10, 12, 0x888888),
  );
}

for (let row = 0; row < 4; row++) {
  addNodeChild(root, createLabel(ROW_LABELS[row], MATRIX_X, MATRIX_Y + 14 + row * MATRIX_CELL_HEIGHT, 12, 0x888888));
  for (let col = 0; col < 5; col++) {
    const label = createLabel(
      '0.000',
      MATRIX_X + 40 + col * MATRIX_CELL_WIDTH,
      MATRIX_Y + 14 + row * MATRIX_CELL_HEIGHT,
      13,
      0xeedd44,
    );
    addNodeChild(root, label);
    matrixLabels.push(label);
  }
}

// Color swatch shapes: "before" row (original) and "after" row (matrix-transformed).
addNodeChild(root, createLabel('Original colors', SWATCHES_X, SWATCHES_BEFORE_Y - 22, 14, 0xcccccc));
addNodeChild(root, createLabel('After matrix', SWATCHES_X, SWATCHES_AFTER_Y - 22, 14, 0xcccccc));

const afterSwatches: Shape[] = [];

for (let i = 0; i < SAMPLE_COLORS.length; i++) {
  const x = SWATCHES_X + i * (SWATCH_SIZE + SWATCH_GAP);

  const beforeShape = createShape();
  appendShapeBeginFill(beforeShape, SAMPLE_COLORS[i] >>> 8, 1);
  appendShapeRectangle(beforeShape, x, SWATCHES_BEFORE_Y, SWATCH_SIZE, SWATCH_SIZE);
  addNodeChild(root, beforeShape);

  const afterShape = createShape();
  addNodeChild(root, afterShape);
  afterSwatches.push(afterShape);
}

// Hex value labels below each after-swatch.
const afterHexLabels: DisplayObject[] = [];
for (let i = 0; i < SAMPLE_COLORS.length; i++) {
  const x = SWATCHES_X + i * (SWATCH_SIZE + SWATCH_GAP);
  const hexLabel = createLabel('', x, SWATCHES_AFTER_Y + SWATCH_SIZE + 4, 9, 0x888888);
  addNodeChild(root, hexLabel);
  afterHexLabels.push(hexLabel);
}

// Description label at the bottom.
addNodeChild(
  root,
  createLabel(
    'Adjustments compose a 4x5 color matrix as pure data. Use sliders to build a fused matrix.',
    SWATCHES_X,
    CANVAS_HEIGHT - 40,
    12,
    0x666666,
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
    appendShapeBeginFill(shape, transformed >>> 8, (transformed & 0xff) / 255);
    appendShapeRectangle(shape, x, SWATCHES_AFTER_Y, SWATCH_SIZE, SWATCH_SIZE);
    invalidateNodeLocalTransform(shape);

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
