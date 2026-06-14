// Port of CacheBitmapTest2. cacheAsBitmap is not applicable in flight;
// this tests that nested alpha-blended containers render correctly while orbiting.
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  createDisplayContainer,
  createRichText,
  createShape,
  setTransformX,
  setTransformY,
} from '@flighthq/sdk';

import { height, render, scale, width } from './render';

const RPM = 20;
const COLORS = [
  0x3366ff, 0x6633ff, 0xcc33ff, 0xff33cc, 0x33ccff, 0x003df5, 0x002eb8, 0xff3366, 0x33ffcc, 0xb88a00, 0xf5b800,
  0xff6633, 0x33ff66, 0x66ff33, 0xccff33, 0xffcc33,
];

function pos(i: number): number {
  return (i * height) / (720 * scale);
}

function makeChild(rects: { color: number; x: number; y: number }[]): ReturnType<typeof createDisplayContainer> {
  const c = createDisplayContainer();
  const bg = createShape();
  appendShapeBeginFill(bg, 0xff0000);
  for (const { x, y } of rects.slice(0, 1)) {
    appendShapeRectangle(bg, x, y, pos(125), pos(125));
  }
  appendShapeEndFill(bg);
  addNodeChild(c, bg);
  for (const { color, x, y } of rects.slice(1)) {
    const s = createShape();
    appendShapeBeginFill(s, color);
    appendShapeRectangle(s, x, y, pos(100), pos(100));
    appendShapeEndFill(s);
    addNodeChild(c, s);
  }
  return c;
}

const root = createDisplayContainer();
root.scaleX = scale;
root.scaleY = scale;

const W = width / scale;
const H = height / scale;

const stageBg = createShape();
appendShapeBeginFill(stageBg, 0x000000);
appendShapeRectangle(stageBg, 0, 0, W, H);
addNodeChild(root, stageBg);

const child1 = makeChild([
  { color: 0xff0000, x: pos(75), y: pos(25) },
  { color: COLORS[0], x: 0, y: 0 },
  { color: COLORS[1], x: pos(125), y: pos(10) },
  { color: COLORS[2], x: pos(125), y: pos(110) },
  { color: COLORS[3], x: 0, y: pos(110) },
]);

const child2 = makeChild([
  { color: 0xff0000, x: pos(415), y: pos(25) },
  { color: COLORS[4], x: pos(340), y: 0 },
  { color: COLORS[5], x: pos(465), y: pos(10) },
  { color: COLORS[6], x: pos(465), y: pos(110) },
  { color: COLORS[7], x: pos(340), y: pos(110) },
]);
child2.x = pos(150);

const parent = createDisplayContainer();

const parentBg = createShape();
appendShapeBeginFill(parentBg, 0xff0000);
appendShapeRectangle(parentBg, 0, 0, pos(640), pos(480));
appendShapeEndFill(parentBg);
addNodeChild(parent, parentBg);

const parentRects = [
  { color: COLORS[8], x: pos(207), y: pos(300) },
  { color: COLORS[9], x: pos(332), y: pos(310) },
  { color: COLORS[10], x: pos(332), y: pos(410) },
  { color: COLORS[11], x: pos(207), y: pos(410) },
];
for (const { color, x, y } of parentRects) {
  const s = createShape();
  appendShapeBeginFill(s, color);
  appendShapeRectangle(s, x, y, pos(100), pos(100));
  appendShapeEndFill(s);
  addNodeChild(parent, s);
}

addNodeChild(parent, child1);
addNodeChild(parent, child2);
addNodeChild(root, parent);

const status = createRichText();
status.data.defaultTextFormat = { font: 'sans-serif', size: pos(32), color: 0xffffff };
status.x = pos(10);
status.y = pos(10);
status.data.width = pos(1270);
status.data.height = pos(40);
status.data.text = 'cacheAsBitmap: n/a (not in flight)';
addNodeChild(root, status);

const cx = pos(320);
const cy = pos(120);
const radius = pos(120);
let angle = 0;
let lastTime = performance.now();

function enterFrame(): void {
  const now = performance.now();
  const dt = (now - lastTime) / 1000;
  lastTime = now;
  angle += (dt / (60 / RPM)) * Math.PI * 2;
  setTransformX(parent, cx + radius * Math.cos(angle));
  setTransformY(parent, cy + radius * Math.sin(angle));
  render(root);
  requestAnimationFrame(enterFrame);
}

enterFrame();
