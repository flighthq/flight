import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeRectangle,
  clearShapeCommands,
  createDisplayContainer,
  createShape,
  invalidateNodeAppearance,
  ShapeKind,
} from '@flighthq/sdk';
import { createFunctionalTarget } from '@ft/render';

const { height, render, width } = await createFunctionalTarget({
  width: 800,
  height: 600,
  background: 0xff000000,
  kinds: [ShapeKind],
});

// Multiply-with-carry PRNG seeded at startup so results are deterministic per session.
// Algorithm from https://en.wikipedia.org/wiki/Multiply-with-carry
const RESIDUES = 4096;
const PHI = 0x9e3779b9 | 0;
let _c = 362436;
let _rotation = RESIDUES - 1;
const _Q: number[] = [Date.now() & 0x7fff_ffff];
_Q.push((_Q[0] + PHI) | 0);
_Q.push((_Q[1] + PHI) | 0);
for (let i = 3; i < RESIDUES; i++) _Q.push((_Q[i - 3] ^ _Q[i - 2] ^ PHI ^ i) | 0);

function seededRandom(max: number): number {
  const a = 18782;
  const r = 0xffff_fffe;
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

function pos(i: number): number {
  return (i * height) / 720;
}

const root = createDisplayContainer();

// Background + static rectangles drawn on the container background shape
const bg = createShape();
appendShapeBeginFill(bg, 0x000000);
appendShapeRectangle(bg, 0, 0, width, height);
addNodeChild(root, bg);

const redSquare = createShape();
appendShapeBeginFill(redSquare, 0xff0000);
appendShapeRectangle(redSquare, pos(148), pos(67), pos(370), pos(273));
addNodeChild(root, redSquare);

const blueSquare = createShape();
appendShapeBeginFill(blueSquare, 0x0000ff);
appendShapeRectangle(blueSquare, pos(281), pos(201), pos(501), pos(447));
addNodeChild(root, blueSquare);

const greenSquare = createShape();
appendShapeBeginFill(greenSquare, 0x00ff00);
appendShapeRectangle(greenSquare, pos(420), pos(224), pos(182), pos(97));
addNodeChild(root, greenSquare);

// Animated random rectangle drawn each frame
const randomRect = createShape();
addNodeChild(root, randomRect);

function enterFrame(): void {
  clearShapeCommands(randomRect);

  const w = seededRandom(1279);
  const h = seededRandom(719);
  const x = seededRandom(1280 - w);
  const y = seededRandom(720 - h);
  const color = seededRandom(0x100_0000);

  appendShapeBeginFill(randomRect, color);
  appendShapeRectangle(randomRect, pos(x), pos(y), pos(w), pos(h));
  invalidateNodeAppearance(randomRect);

  render(root);
  requestAnimationFrame(enterFrame);
}

enterFrame();
