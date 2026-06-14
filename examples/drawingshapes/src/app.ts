import type { Shape } from '@flighthq/sdk';
import {
  addNodeChild,
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
  invalidateNodeLocalTransform,
} from '@flighthq/sdk';

import { render, scale } from './render';

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
square.x = 20;
square.y = 20;
invalidateNodeLocalTransform(square);
addNodeChild(main, square);

const rectangle = createShape();
appendShapeBeginFill(rectangle, 0x24afc4);
appendShapeRectangle(rectangle, 0, 0, 120, 100);
rectangle.x = 140;
rectangle.y = 20;
invalidateNodeLocalTransform(rectangle);
addNodeChild(main, rectangle);

const circle = createShape();
appendShapeBeginFill(circle, 0x24afc4);
appendShapeCircle(circle, 50, 50, 50);
circle.x = 280;
circle.y = 20;
invalidateNodeLocalTransform(circle);
addNodeChild(main, circle);

const ellipse = createShape();
appendShapeBeginFill(ellipse, 0x24afc4);
appendShapeEllipse(ellipse, 0, 0, 120, 100);
ellipse.x = 400;
ellipse.y = 20;
invalidateNodeLocalTransform(ellipse);
addNodeChild(main, ellipse);

const roundSquare = createShape();
appendShapeBeginFill(roundSquare, 0x24afc4);
appendShapeRoundRectangle(roundSquare, 0, 0, 100, 100, 40, 40);
roundSquare.x = 540;
roundSquare.y = 20;
invalidateNodeLocalTransform(roundSquare);
addNodeChild(main, roundSquare);

const roundRectangle = createShape();
appendShapeBeginFill(roundRectangle, 0x24afc4);
appendShapeRoundRectangle(roundRectangle, 0, 0, 120, 100, 40, 40);
roundRectangle.x = 660;
roundRectangle.y = 20;
invalidateNodeLocalTransform(roundRectangle);
addNodeChild(main, roundRectangle);

// ── Row 2: polygons ────────────────────────────────────────────────────────

const triangle = createShape();
appendShapeBeginFill(triangle, 0x24afc4);
appendShapeMoveTo(triangle, 0, 100);
appendShapeLineTo(triangle, 50, 0);
appendShapeLineTo(triangle, 100, 100);
appendShapeLineTo(triangle, 0, 100);
triangle.x = 20;
triangle.y = 150;
invalidateNodeLocalTransform(triangle);
addNodeChild(main, triangle);

const pentagon = createShape();
appendShapeBeginFill(pentagon, 0x24afc4);
drawPolygon(pentagon, 50, 50, 50, 5);
pentagon.x = 145;
pentagon.y = 150;
invalidateNodeLocalTransform(pentagon);
addNodeChild(main, pentagon);

const hexagon = createShape();
appendShapeBeginFill(hexagon, 0x24afc4);
drawPolygon(hexagon, 50, 50, 50, 6);
hexagon.x = 270;
hexagon.y = 150;
invalidateNodeLocalTransform(hexagon);
addNodeChild(main, hexagon);

const heptagon = createShape();
appendShapeBeginFill(heptagon, 0x24afc4);
drawPolygon(heptagon, 50, 50, 50, 7);
heptagon.x = 395;
heptagon.y = 150;
invalidateNodeLocalTransform(heptagon);
addNodeChild(main, heptagon);

const octagon = createShape();
appendShapeBeginFill(octagon, 0x24afc4);
drawPolygon(octagon, 50, 50, 50, 8);
octagon.x = 520;
octagon.y = 150;
invalidateNodeLocalTransform(octagon);
addNodeChild(main, octagon);

const decagon = createShape();
appendShapeBeginFill(decagon, 0x24afc4);
drawPolygon(decagon, 50, 50, 50, 10);
decagon.x = 650;
decagon.y = 150;
invalidateNodeLocalTransform(decagon);
addNodeChild(main, decagon);

// ── Row 3: lines and curves ───────────────────────────────────────────────

const line = createShape();
appendShapeLineStyle(line, 10, 0x24afc4);
appendShapeLineTo(line, 755, 0);
line.x = 20;
line.y = 280;
invalidateNodeLocalTransform(line);
addNodeChild(main, line);

const curve = createShape();
appendShapeLineStyle(curve, 10, 0x24afc4);
appendShapeCurveTo(curve, 327.5, -50, 755, 0);
curve.x = 20;
curve.y = 340;
invalidateNodeLocalTransform(curve);
addNodeChild(main, curve);

// ── Render loop ───────────────────────────────────────────────────────────

function enterFrame(): void {
  render(main);
  requestAnimationFrame(enterFrame);
}

enterFrame();
