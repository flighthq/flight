import { createReferenceStage } from '../../_harness/stage';
// Tests GPU surface allocation by creating/destroying bitmaps of varying sizes.
// Arrow keys / number keys match the original OpenFL key bindings.
// Up: add 100x100 bitmap   Down: remove oldest 100x100
// Right: add 500x500        Left: remove oldest 500x500
// 1: add 1000x1000          4: remove oldest 1000x1000
// 5: remove all
import Bitmap from 'openfl/display/Bitmap';
import BitmapData from 'openfl/display/BitmapData';
import Shape from 'openfl/display/Shape';
import TextField from 'openfl/text/TextField';
import TextFormat from 'openfl/text/TextFormat';

const WIDTH = 800;
const HEIGHT = 600;

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

function makeColoredBitmap(size: number): Bitmap {
  const r = rand(256),
    g = rand(256),
    b = rand(256);
  const bd = new BitmapData(size, size, false, (r << 16) | (g << 8) | b);
  return new Bitmap(bd);
}

const { root } = createReferenceStage(WIDTH, HEIGHT, 0x000000);

const stageBg = new Shape();
stageBg.graphics.beginFill(0x000000);
stageBg.graphics.drawRect(0, 0, WIDTH, HEIGHT);
stageBg.graphics.endFill();
root.addChild(stageBg);

const label = new TextField();
label.defaultTextFormat = new TextFormat('_sans', 44, 0xffffff, true);
label.x = WIDTH / 2 - 100;
label.y = 50;
label.width = 400;
label.height = 60;
label.text = '0×100, 0×500, 0×1000';
root.addChild(label);

const instructions = new TextField();
instructions.defaultTextFormat = new TextFormat('_sans', 16, 0xaaaaaa);
instructions.x = 20;
instructions.y = HEIGHT - 60;
instructions.width = WIDTH - 40;
instructions.height = 50;
instructions.text = '↑ add 100 · ↓ remove 100 · → add 500 · ← remove 500 · 1 add 1000 · 4 remove 1000 · 5 clear all';
root.addChild(instructions);

const bitmaps100: Bitmap[] = [];
const bitmaps500: Bitmap[] = [];
const bitmaps1000: Bitmap[] = [];

let nextX = 50;
let nextY = 100;

function placeBitmap(bmp: Bitmap): void {
  bmp.x = nextX;
  bmp.y = nextY;
  root.addChild(bmp);
  nextX += 30;
  nextY += 30;
  if (nextX >= WIDTH - 100 || nextY >= HEIGHT - 100) {
    nextX = 50;
    nextY = 100;
  }
}

function updateLabel(): void {
  label.text = `${bitmaps100.length}×100, ${bitmaps500.length}×500, ${bitmaps1000.length}×1000`;
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
      if (bitmaps100.length > 0) root.removeChild(bitmaps100.shift()!);
      break;
    case 'ArrowLeft':
      if (bitmaps500.length > 0) root.removeChild(bitmaps500.shift()!);
      break;
    case '4':
      if (bitmaps1000.length > 0) root.removeChild(bitmaps1000.shift()!);
      break;
    case '5':
      for (const b of [...bitmaps100, ...bitmaps500, ...bitmaps1000]) root.removeChild(b);
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
