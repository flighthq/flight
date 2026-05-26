import {
  cloneImageData,
  compareImageData,
  createImageData,
  drawImageData,
  fillRect,
  setPixel32,
} from '@flighthq/imagedata';

const IMG_SIZE = 40;
const CELL_SIZE = IMG_SIZE + 4;
const LABEL_SIZE = 56;
const PAD = 8;

function createCheckers(color1: number, color2: number, tileSize = 8): ImageData {
  const img = createImageData(IMG_SIZE, IMG_SIZE, color1);
  for (let y = 0; y < IMG_SIZE; y++) {
    for (let x = 0; x < IMG_SIZE; x++) {
      if (((Math.floor(x / tileSize) + Math.floor(y / tileSize)) & 1) === 1) {
        setPixel32(img, x, y, color2);
      }
    }
  }
  return img;
}

function createNoise(seed: number): ImageData {
  const img = createImageData(IMG_SIZE, IMG_SIZE);
  let s = seed >>> 0;
  for (let i = 0; i < img.data.length; i++) {
    s = Math.imul(s, 1664525) + 1013904223;
    img.data[i] = s & 0xff;
  }
  return img;
}

function createBall(color: number, alpha = 255): ImageData {
  const img = createImageData(IMG_SIZE, IMG_SIZE);
  const cx = IMG_SIZE / 2;
  const cy = IMG_SIZE / 2;
  const r = IMG_SIZE / 2 - 2;
  for (let y = 0; y < IMG_SIZE; y++) {
    for (let x = 0; x < IMG_SIZE; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r * r) {
        setPixel32(img, x, y, ((alpha & 0xff) * 0x1000000 + (color & 0xffffff)) >>> 0);
      }
    }
  }
  return img;
}

function createRect(color: number, inset = 4): ImageData {
  const img = createImageData(IMG_SIZE, IMG_SIZE);
  fillRect(img, inset, inset, IMG_SIZE - inset * 2, IMG_SIZE - inset * 2, color);
  return img;
}

const sources: Array<{ label: string; img: ImageData | null }> = [
  { label: 'Checkers', img: createCheckers(0xffffffff, 0xff000000) },
  { label: 'Checkers2', img: createCheckers(0xffffffff, 0xff808080) },
  { label: 'Noise 1', img: createNoise(0xdeadbeef) },
  { label: 'Noise 2', img: createNoise(0xcafebabe) },
  { label: 'Red Ball', img: createBall(0xff0000) },
  { label: 'Yellow Ball', img: createBall(0xffff00) },
  { label: 'Half Alpha', img: createBall(0xff0000, 128) },
  { label: 'Rect', img: createRect(0xff0000ff) },
  { label: 'Rect 2', img: createRect(0xff00ffff, 8) },
  { label: 'Clone', img: null },
  { label: 'Null', img: null },
];

sources[9].img = cloneImageData(sources[4].img!);

const n = sources.length;
const gridW = LABEL_SIZE + n * CELL_SIZE + PAD;
const gridH = LABEL_SIZE + n * CELL_SIZE + PAD;

const canvas = document.getElementById('app') as HTMLCanvasElement;
canvas.width = gridW;
canvas.height = gridH;
const ctx = canvas.getContext('2d')!;

ctx.fillStyle = '#16213e';
ctx.fillRect(0, 0, gridW, gridH);

for (let col = 0; col < n; col++) {
  const x = LABEL_SIZE + col * CELL_SIZE;
  const { label, img } = sources[col];

  if (img) {
    drawImageData(canvas, img, x + 2, 2);
  } else {
    ctx.fillStyle = '#333';
    ctx.fillRect(x + 2, 2, IMG_SIZE, IMG_SIZE);
    ctx.fillStyle = '#888';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('null', x + 2 + IMG_SIZE / 2, 2 + IMG_SIZE / 2 + 4);
  }

  ctx.save();
  ctx.fillStyle = '#aaa';
  ctx.font = '9px monospace';
  ctx.textAlign = 'center';
  ctx.translate(x + 2 + IMG_SIZE / 2, IMG_SIZE + 6);
  ctx.rotate(-Math.PI / 4);
  ctx.fillText(label, 0, 0);
  ctx.restore();
}

for (let row = 0; row < n; row++) {
  const y = LABEL_SIZE + row * CELL_SIZE;
  const { label: rowLabel, img: rowImg } = sources[row];

  if (rowImg) {
    drawImageData(canvas, rowImg, 2, y + 2);
  } else {
    ctx.fillStyle = '#333';
    ctx.fillRect(2, y + 2, IMG_SIZE, IMG_SIZE);
    ctx.fillStyle = '#888';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('null', 2 + IMG_SIZE / 2, y + 2 + IMG_SIZE / 2 + 4);
  }

  ctx.fillStyle = '#aaa';
  ctx.font = '9px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(rowLabel, 2, y + IMG_SIZE + 14);

  for (let col = 0; col < n; col++) {
    const x = LABEL_SIZE + col * CELL_SIZE;
    const { img: colImg } = sources[col];
    if (rowImg === null) {
      drawCell(ctx, canvas, x + 2, y + 2, -1, true);
    } else {
      drawCell(ctx, canvas, x + 2, y + 2, compareImageData(rowImg, colImg), false);
    }
  }
}

function drawCell(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
  result: ImageData | 0 | -1 | -2 | -3,
  sourceIsNull: boolean,
): void {
  if (sourceIsNull) {
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(x, y, IMG_SIZE, IMG_SIZE);
    return;
  }

  if (result === 0) {
    ctx.fillStyle = '#1a4a1a';
    ctx.fillRect(x, y, IMG_SIZE, IMG_SIZE);
    ctx.fillStyle = '#4caf50';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('=', x + IMG_SIZE / 2, y + IMG_SIZE / 2 + 4);
    return;
  }

  if (typeof result === 'number') {
    ctx.fillStyle = '#2a1a1a';
    ctx.fillRect(x, y, IMG_SIZE, IMG_SIZE);
    ctx.fillStyle = '#f44';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    const label = result === -1 ? 'null' : result === -2 ? 'W≠' : 'H≠';
    ctx.fillText(label, x + IMG_SIZE / 2, y + IMG_SIZE / 2 + 4);
    return;
  }

  drawImageData(canvas, result, x, y);
}
