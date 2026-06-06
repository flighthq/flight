// Port of CacheBitmapTest1. cacheAsBitmap is not applicable in flight;
// this test verifies that alpha-blended rounded-rect shapes render correctly
// while orbiting the screen.
import {
  addSceneChild,
  appendShapeBeginFill,
  appendShapeEndFill,
  appendShapeRectangle,
  appendShapeRoundRectangle,
  createDisplayContainer,
  createRichText,
  createShape,
} from '@flighthq/sdk';

import { height, render, scale, width } from './render';

const RPM = 5;
const COLORS = [0xff4cf0, 0xfff372, 0x85ff75, 0x59ddff];

function pos(i: number): number {
  return (i * height) / (720 * scale);
}

const root = createDisplayContainer();
root.scaleX = scale;
root.scaleY = scale;

const W = width / scale;
const H = height / scale;

// Black stage background
const stageBg = createShape();
appendShapeBeginFill(stageBg, 0x000000);
appendShapeRectangle(stageBg, 0, 0, W, H);
addSceneChild(root, stageBg);

// Static background rects with varying alpha
const bgRects: { color: number; alpha: number; x: number; y: number }[] = [
  { color: 0x002288, alpha: 1.0, x: pos(500), y: pos(200) },
  { color: 0x002288, alpha: 0.5, x: pos(700), y: pos(200) },
  { color: 0x002288, alpha: 0.1, x: pos(500), y: pos(400) },
];
for (const { color, alpha, x, y } of bgRects) {
  const s = createShape();
  appendShapeBeginFill(s, color, alpha);
  appendShapeRectangle(s, x, y, pos(200), pos(200));
  appendShapeEndFill(s);
  addSceneChild(root, s);
}

// Orbiting group
const group = createDisplayContainer();
addSceneChild(root, group);

const redBase = createShape();
appendShapeBeginFill(redBase, 0xff0000);
appendShapeRectangle(redBase, pos(75), pos(25), pos(125), pos(125));
addSceneChild(group, redBase);

const roundedRects = [
  { color: COLORS[0], x: 0, y: 0, rx: pos(100), ry: pos(100) },
  { color: COLORS[1], x: pos(125), y: pos(10), rx: pos(20), ry: pos(40) },
  { color: COLORS[2], x: pos(125), y: pos(110), rx: pos(40), ry: pos(20) },
  { color: COLORS[3], x: 0, y: pos(110), rx: pos(40), ry: pos(40) },
];
for (const { color, x, y, rx, ry } of roundedRects) {
  const s = createShape();
  s.alpha = 0.66;
  appendShapeBeginFill(s, color);
  appendShapeRoundRectangle(s, x, y, pos(100), pos(100), rx, ry);
  appendShapeEndFill(s);
  addSceneChild(group, s);
}

// Status label
const status = createRichText();
status.data.defaultTextFormat = { font: 'sans-serif', size: pos(32), color: 0xffffff };
status.x = pos(410);
status.y = pos(10);
status.data.width = pos(860);
status.data.height = pos(40);
status.data.text = 'cacheAsBitmap: n/a (not in flight)';
addSceneChild(root, status);

const cx = pos(527);
const cy = pos(255);
const radius = pos(200);
let angle = 0;
let lastTime = performance.now();

function enterFrame(): void {
  const now = performance.now();
  const dt = (now - lastTime) / 1000;
  lastTime = now;
  angle += (dt / (60 / RPM)) * Math.PI * 2;
  group.x = cx + radius * Math.cos(angle);
  group.y = cy + radius * Math.sin(angle);
  render(root);
  requestAnimationFrame(enterFrame);
}

enterFrame();
