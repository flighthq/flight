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
  invalidateLocalTransform,
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
invalidateLocalTransform(square);
addSceneChild(main, square);

const rectangle = createShape();
appendShapeBeginFill(rectangle, 0x24afc4);
appendShapeRectangle(rectangle, 0, 0, 120, 100);
rectangle.x = 140;
rectangle.y = 20;
invalidateLocalTransform(rectangle);
addSceneChild(main, rectangle);

const circle = createShape();
appendShapeBeginFill(circle, 0x24afc4);
appendShapeCircle(circle, 50, 50, 50);
circle.x = 280;
circle.y = 20;
invalidateLocalTransform(circle);
addSceneChild(main, circle);

const ellipse = createShape();
appendShapeBeginFill(ellipse, 0x24afc4);
appendShapeEllipse(ellipse, 0, 0, 120, 100);
ellipse.x = 400;
ellipse.y = 20;
invalidateLocalTransform(ellipse);
addSceneChild(main, ellipse);

const roundSquare = createShape();
appendShapeBeginFill(roundSquare, 0x24afc4);
appendShapeRoundRectangle(roundSquare, 0, 0, 100, 100, 40, 40);
roundSquare.x = 540;
roundSquare.y = 20;
invalidateLocalTransform(roundSquare);
addSceneChild(main, roundSquare);

const roundRectangle = createShape();
appendShapeBeginFill(roundRectangle, 0x24afc4);
appendShapeRoundRectangle(roundRectangle, 0, 0, 120, 100, 40, 40);
roundRectangle.x = 660;
roundRectangle.y = 20;
invalidateLocalTransform(roundRectangle);
addSceneChild(main, roundRectangle);

// ── Row 2: polygons ────────────────────────────────────────────────────────

const triangle = createShape();
appendShapeBeginFill(triangle, 0x24afc4);
appendShapeMoveTo(triangle, 0, 100);
appendShapeLineTo(triangle, 50, 0);
appendShapeLineTo(triangle, 100, 100);
appendShapeLineTo(triangle, 0, 100);
triangle.x = 20;
triangle.y = 150;
invalidateLocalTransform(triangle);
addSceneChild(main, triangle);

const pentagon = createShape();
appendShapeBeginFill(pentagon, 0x24afc4);
drawPolygon(pentagon, 50, 50, 50, 5);
pentagon.x = 145;
pentagon.y = 150;
invalidateLocalTransform(pentagon);
addSceneChild(main, pentagon);

const hexagon = createShape();
appendShapeBeginFill(hexagon, 0x24afc4);
drawPolygon(hexagon, 50, 50, 50, 6);
hexagon.x = 270;
hexagon.y = 150;
invalidateLocalTransform(hexagon);
addSceneChild(main, hexagon);

const heptagon = createShape();
appendShapeBeginFill(heptagon, 0x24afc4);
drawPolygon(heptagon, 50, 50, 50, 7);
heptagon.x = 395;
heptagon.y = 150;
invalidateLocalTransform(heptagon);
addSceneChild(main, heptagon);

const octagon = createShape();
appendShapeBeginFill(octagon, 0x24afc4);
drawPolygon(octagon, 50, 50, 50, 8);
octagon.x = 520;
octagon.y = 150;
invalidateLocalTransform(octagon);
addSceneChild(main, octagon);

const decagon = createShape();
appendShapeBeginFill(decagon, 0x24afc4);
drawPolygon(decagon, 50, 50, 50, 10);
decagon.x = 650;
decagon.y = 150;
invalidateLocalTransform(decagon);
addSceneChild(main, decagon);

// ── Row 3: lines and curves ───────────────────────────────────────────────

const line = createShape();
appendShapeLineStyle(line, 10, 0x24afc4);
appendShapeLineTo(line, 755, 0);
line.x = 20;
line.y = 280;
invalidateLocalTransform(line);
addSceneChild(main, line);

const curve = createShape();
appendShapeLineStyle(curve, 10, 0x24afc4);
appendShapeCurveTo(curve, 327.5, -50, 755, 0);
curve.x = 20;
curve.y = 340;
invalidateLocalTransform(curve);
addSceneChild(main, curve);

// ── Render loop ───────────────────────────────────────────────────────────

function enterFrame(): void {
  render(main);
  requestAnimationFrame(enterFrame);
}

enterFrame();
