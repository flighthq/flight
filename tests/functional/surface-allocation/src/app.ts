// Tests GPU surface allocation by creating/destroying bitmaps of varying sizes.
// Arrow keys / number keys match the original OpenFL key bindings.
// Up: add 100x100 bitmap   Down: remove oldest 100x100
// Right: add 500x500        Left: remove oldest 500x500
// 1: add 1000x1000          4: remove oldest 1000x1000
// 5: remove all
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  BitmapKind,
  createBitmap,
  createDisplayContainer,
  createImageResourceFromCanvas,
  createRichText,
  createShape,
  removeNodeChild,
  RichTextKind,
  ShapeKind,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const { height, render, width } = createFunctionalTarget({
  width: 800,
  height: 600,
  background: 0xff000000,
  kinds: [BitmapKind, RichTextKind, ShapeKind],
});

// Seeded random (same algorithm as fill test)
const RESIDUES = 4096;
const PHI = 0x9e3779b9 | 0;
let _c = 362436;
let _rotation = RESIDUES - 1;
const _Q: number[] = [Date.now() & 0x7fff_ffff];
_Q.push((_Q[0] + PHI) | 0);
_Q.push((_Q[1] + PHI) | 0);
for (let i = 3; i < RESIDUES; i++) _Q.push((_Q[i - 3] ^ _Q[i - 2] ^ PHI ^ i) | 0);
function rand(max: number): number {
  const a = 18782,
    r = 0xffff_fffe;
  _rotation = (_rotation + 1) & (RESIDUES - 1);
  const t = Math.imul(a, _Q[_rotation]) + _c;
  _c = (t / 0x1_0000_0000) | 0;
  let x = (t + _c) | 0;
  if (x < _c) {
    x = (x + 1) | 0;
    _c++;
  }
  _Q[_rotation] = (r - x) | 0;
  return (((_Q[_rotation] % max) + max) % max) | 0;
}

function makeColoredBitmap(size: number): ReturnType<typeof createBitmap> {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const r = rand(256),
    g = rand(256),
    b = rand(256),
    a = rand(256);
  ctx.fillStyle = `rgba(${r},${g},${b},${a / 255})`;
  ctx.fillRect(0, 0, size, size);
  const bmp = createBitmap();
  bmp.data.image = createImageResourceFromCanvas(canvas);
  return bmp;
}

const root = createDisplayContainer();

const W = width;
const H = height;

const stageBg = createShape();
appendShapeBeginFill(stageBg, 0x000000);
appendShapeRectangle(stageBg, 0, 0, W, H);
appendShapeEndFill(stageBg);
addNodeChild(root, stageBg);

const label = createRichText();
label.data.defaultTextFormat = { font: 'sans-serif', size: 44, bold: true, color: 0xffffff };
label.x = W / 2 - 100;
label.y = 50;
label.data.width = 400;
label.data.height = 60;
label.data.text = '0×100, 0×500, 0×1000';
addNodeChild(root, label);

const instructions = createRichText();
instructions.data.defaultTextFormat = { font: 'sans-serif', size: 16, color: 0xaaaaaa };
instructions.x = 20;
instructions.y = H - 60;
instructions.data.width = W - 40;
instructions.data.height = 50;
instructions.data.text =
  '↑ add 100 · ↓ remove 100 · → add 500 · ← remove 500 · 1 add 1000 · 4 remove 1000 · 5 clear all';
addNodeChild(root, instructions);

const bitmaps100: ReturnType<typeof createBitmap>[] = [];
const bitmaps500: ReturnType<typeof createBitmap>[] = [];
const bitmaps1000: ReturnType<typeof createBitmap>[] = [];

let nextX = 50;
let nextY = 100;

function placeBitmap(bmp: ReturnType<typeof createBitmap>): void {
  bmp.x = nextX;
  bmp.y = nextY;
  addNodeChild(root, bmp);
  nextX += 30;
  nextY += 30;
  if (nextX >= W - 100 || nextY >= H - 100) {
    nextX = 50;
    nextY = 100;
  }
}

function updateLabel(): void {
  label.data.text = `${bitmaps100.length}×100, ${bitmaps500.length}×500, ${bitmaps1000.length}×1000`;
  render(root);
}

document.addEventListener('keydown', (e) => {
  switch (e.key) {
    case 'ArrowUp': {
      const b = makeColoredBitmap(100);
      bitmaps100.push(b);
      placeBitmap(b);
      break;
    }
    case 'ArrowRight': {
      const b = makeColoredBitmap(500);
      bitmaps500.push(b);
      placeBitmap(b);
      break;
    }
    case '1': {
      const b = makeColoredBitmap(1000);
      bitmaps1000.push(b);
      placeBitmap(b);
      break;
    }
    case 'ArrowDown':
      if (bitmaps100.length > 0) {
        removeNodeChild(root, bitmaps100.shift()!);
      }
      break;
    case 'ArrowLeft':
      if (bitmaps500.length > 0) {
        removeNodeChild(root, bitmaps500.shift()!);
      }
      break;
    case '4':
      if (bitmaps1000.length > 0) {
        removeNodeChild(root, bitmaps1000.shift()!);
      }
      break;
    case '5':
      for (const b of [...bitmaps100, ...bitmaps500, ...bitmaps1000]) removeNodeChild(root, b);
      bitmaps100.length = 0;
      bitmaps500.length = 0;
      bitmaps1000.length = 0;
      break;
    default:
      return;
  }
  e.preventDefault();
  updateLabel();
});

render(root);
