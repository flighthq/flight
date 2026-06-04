import type { Shape } from '@flighthq/sdk';
import {
  addSceneChild,
  appendShapeBeginFill,
  appendShapeCircle,
  appendShapeCurveTo,
  appendShapeEllipse,
  appendShapeLineStyle,
  appendShapeLineTo,
  appendShapeMoveTo,
  appendShapeRectangle,
  appendShapeRoundRectangle,
  createDisplayObject,
  createShape,
  setTransformX,
  setTransformY,
  updateDisplayObject,
} from '@flighthq/sdk';

import { render, scale, state } from './render';

const main = createDisplayObject();
main.scaleX = scale;
main.scaleY = scale;

function drawPolygon(g: Shape, x: number, y: number, radius: number, sides: number): void {
  const step = (Math.PI * 2) / sides;
  const start = 0.5 * Math.PI;
  appendShapeMoveTo(g, Math.cos(start) * radius + x, -Math.sin(start) * radius + y);
  for (let i = 0; i < sides; i++) {
    appendShapeLineTo(g, Math.cos(start + step * i) * radius + x, -Math.sin(start + step * i) * radius + y);
  }
}

// ── Row 1: primitives ──────────────────────────────────────────────────────

const square = createShape();
appendShapeBeginFill(square, 0x24afc4);
appendShapeRectangle(square, 0, 0, 100, 100);
setTransformX(square, 20);
setTransformY(square, 20);
addSceneChild(main, square);

const rectangle = createShape();
appendShapeBeginFill(rectangle, 0x24afc4);
appendShapeRectangle(rectangle, 0, 0, 120, 100);
setTransformX(rectangle, 140);
setTransformY(rectangle, 20);
addSceneChild(main, rectangle);

const circle = createShape();
appendShapeBeginFill(circle, 0x24afc4);
appendShapeCircle(circle, 50, 50, 50);
setTransformX(circle, 280);
setTransformY(circle, 20);
addSceneChild(main, circle);

const ellipse = createShape();
appendShapeBeginFill(ellipse, 0x24afc4);
appendShapeEllipse(ellipse, 0, 0, 120, 100);
setTransformX(ellipse, 400);
setTransformY(ellipse, 20);
addSceneChild(main, ellipse);

const roundSquare = createShape();
appendShapeBeginFill(roundSquare, 0x24afc4);
appendShapeRoundRectangle(roundSquare, 0, 0, 100, 100, 40, 40);
setTransformX(roundSquare, 540);
setTransformY(roundSquare, 20);
addSceneChild(main, roundSquare);

const roundRectangle = createShape();
appendShapeBeginFill(roundRectangle, 0x24afc4);
appendShapeRoundRectangle(roundRectangle, 0, 0, 120, 100, 40, 40);
setTransformX(roundRectangle, 660);
setTransformY(roundRectangle, 20);
addSceneChild(main, roundRectangle);

// ── Row 2: polygons ────────────────────────────────────────────────────────

const triangle = createShape();
appendShapeBeginFill(triangle, 0x24afc4);
appendShapeMoveTo(triangle, 0, 100);
appendShapeLineTo(triangle, 50, 0);
appendShapeLineTo(triangle, 100, 100);
appendShapeLineTo(triangle, 0, 100);
setTransformX(triangle, 20);
setTransformY(triangle, 150);
addSceneChild(main, triangle);

const pentagon = createShape();
appendShapeBeginFill(pentagon, 0x24afc4);
drawPolygon(pentagon, 50, 50, 50, 5);
setTransformX(pentagon, 145);
setTransformY(pentagon, 150);
addSceneChild(main, pentagon);

const hexagon = createShape();
appendShapeBeginFill(hexagon, 0x24afc4);
drawPolygon(hexagon, 50, 50, 50, 6);
setTransformX(hexagon, 270);
setTransformY(hexagon, 150);
addSceneChild(main, hexagon);

const heptagon = createShape();
appendShapeBeginFill(heptagon, 0x24afc4);
drawPolygon(heptagon, 50, 50, 50, 7);
setTransformX(heptagon, 395);
setTransformY(heptagon, 150);
addSceneChild(main, heptagon);

const octagon = createShape();
appendShapeBeginFill(octagon, 0x24afc4);
drawPolygon(octagon, 50, 50, 50, 8);
setTransformX(octagon, 520);
setTransformY(octagon, 150);
addSceneChild(main, octagon);

const decagon = createShape();
appendShapeBeginFill(decagon, 0x24afc4);
drawPolygon(decagon, 50, 50, 50, 10);
setTransformX(decagon, 650);
setTransformY(decagon, 150);
addSceneChild(main, decagon);

// ── Row 3: lines and curves ───────────────────────────────────────────────

const line = createShape();
appendShapeLineStyle(line, 10, 0x24afc4);
appendShapeLineTo(line, 755, 0);
setTransformX(line, 20);
setTransformY(line, 280);
addSceneChild(main, line);

const curve = createShape();
appendShapeLineStyle(curve, 10, 0x24afc4);
appendShapeCurveTo(curve, 327.5, -50, 755, 0);
setTransformX(curve, 20);
setTransformY(curve, 340);
addSceneChild(main, curve);

// ── Render loop ───────────────────────────────────────────────────────────

function enterFrame(): void {
  if (updateDisplayObject(state, main)) {
    render(main);
  }
  requestAnimationFrame(enterFrame);
}

enterFrame();
