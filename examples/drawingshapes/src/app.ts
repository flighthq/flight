import type { Shape } from '@flighthq/sdk';
import {
  addChild,
  beginFill,
  createDisplayObject,
  createShape,
  curveTo,
  drawCircle,
  drawEllipse,
  drawRectangle,
  drawRoundRectangle,
  lineStyle,
  lineTo,
  moveTo,
  setTransformX,
  setTransformY,
  updateDisplayObjectBeforeRender,
} from '@flighthq/sdk';

import { render, scale, state } from './render';

const main = createDisplayObject();
main.scaleX = scale;
main.scaleY = scale;

function drawPolygon(g: Shape, x: number, y: number, radius: number, sides: number): void {
  const step = (Math.PI * 2) / sides;
  const start = 0.5 * Math.PI;
  moveTo(g, Math.cos(start) * radius + x, -Math.sin(start) * radius + y);
  for (let i = 0; i < sides; i++) {
    lineTo(g, Math.cos(start + step * i) * radius + x, -Math.sin(start + step * i) * radius + y);
  }
}

// ── Row 1: primitives ──────────────────────────────────────────────────────

const square = createShape();
beginFill(square, 0x24afc4);
drawRectangle(square, 0, 0, 100, 100);
setTransformX(square, 20);
setTransformY(square, 20);
addChild(main, square);

const rectangle = createShape();
beginFill(rectangle, 0x24afc4);
drawRectangle(rectangle, 0, 0, 120, 100);
setTransformX(rectangle, 140);
setTransformY(rectangle, 20);
addChild(main, rectangle);

const circle = createShape();
beginFill(circle, 0x24afc4);
drawCircle(circle, 50, 50, 50);
setTransformX(circle, 280);
setTransformY(circle, 20);
addChild(main, circle);

const ellipse = createShape();
beginFill(ellipse, 0x24afc4);
drawEllipse(ellipse, 0, 0, 120, 100);
setTransformX(ellipse, 400);
setTransformY(ellipse, 20);
addChild(main, ellipse);

const roundSquare = createShape();
beginFill(roundSquare, 0x24afc4);
drawRoundRectangle(roundSquare, 0, 0, 100, 100, 40, 40);
setTransformX(roundSquare, 540);
setTransformY(roundSquare, 20);
addChild(main, roundSquare);

const roundRectangle = createShape();
beginFill(roundRectangle, 0x24afc4);
drawRoundRectangle(roundRectangle, 0, 0, 120, 100, 40, 40);
setTransformX(roundRectangle, 660);
setTransformY(roundRectangle, 20);
addChild(main, roundRectangle);

// ── Row 2: polygons ────────────────────────────────────────────────────────

const triangle = createShape();
beginFill(triangle, 0x24afc4);
moveTo(triangle, 0, 100);
lineTo(triangle, 50, 0);
lineTo(triangle, 100, 100);
lineTo(triangle, 0, 100);
setTransformX(triangle, 20);
setTransformY(triangle, 150);
addChild(main, triangle);

const pentagon = createShape();
beginFill(pentagon, 0x24afc4);
drawPolygon(pentagon, 50, 50, 50, 5);
setTransformX(pentagon, 145);
setTransformY(pentagon, 150);
addChild(main, pentagon);

const hexagon = createShape();
beginFill(hexagon, 0x24afc4);
drawPolygon(hexagon, 50, 50, 50, 6);
setTransformX(hexagon, 270);
setTransformY(hexagon, 150);
addChild(main, hexagon);

const heptagon = createShape();
beginFill(heptagon, 0x24afc4);
drawPolygon(heptagon, 50, 50, 50, 7);
setTransformX(heptagon, 395);
setTransformY(heptagon, 150);
addChild(main, heptagon);

const octagon = createShape();
beginFill(octagon, 0x24afc4);
drawPolygon(octagon, 50, 50, 50, 8);
setTransformX(octagon, 520);
setTransformY(octagon, 150);
addChild(main, octagon);

const decagon = createShape();
beginFill(decagon, 0x24afc4);
drawPolygon(decagon, 50, 50, 50, 10);
setTransformX(decagon, 650);
setTransformY(decagon, 150);
addChild(main, decagon);

// ── Row 3: lines and curves ───────────────────────────────────────────────

const line = createShape();
lineStyle(line, 10, 0x24afc4);
lineTo(line, 755, 0);
setTransformX(line, 20);
setTransformY(line, 280);
addChild(main, line);

const curve = createShape();
lineStyle(curve, 10, 0x24afc4);
curveTo(curve, 327.5, -50, 755, 0);
setTransformX(curve, 20);
setTransformY(curve, 340);
addChild(main, curve);

// ── Render loop ───────────────────────────────────────────────────────────

function enterFrame(): void {
  if (updateDisplayObjectBeforeRender(state, main)) {
    render(main);
  }
  requestAnimationFrame(enterFrame);
}

enterFrame();
