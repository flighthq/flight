import type { Shape } from '@flighthq/sdk';
import {
  addNodeChild,
  appendShapeBeginFill,
  appendShapeCircle,
  appendShapeCubicCurveTo,
  appendShapeCurveTo,
  appendShapeEllipse,
  appendShapeEndFill,
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

// Layout constants for the five-row grid.
const ROW_HEIGHT = 110;
const ROW_PADDING = 10;
const COL_START = 20;

function rowY(row: number): number {
  return ROW_PADDING + row * (ROW_HEIGHT + ROW_PADDING);
}

// Positions a shape in the grid and adds it to the scene.
function placeShape(shape: Shape, x: number, y: number): void {
  shape.x = x;
  shape.y = y;
  invalidateNodeLocalTransform(shape);
  addNodeChild(main, shape);
}

// Draws a regular polygon centered at (cx, cy) with a given radius and number of sides.
// The first vertex points upward (-Y).
function drawRegularPolygon(shape: Shape, cx: number, cy: number, radius: number, sides: number): void {
  const step = (Math.PI * 2) / sides;
  const startAngle = -Math.PI / 2;
  for (let i = 0; i <= sides; i++) {
    const angle = startAngle + step * i;
    const px = cx + Math.cos(angle) * radius;
    const py = cy + Math.sin(angle) * radius;
    if (i === 0) {
      appendShapeMoveTo(shape, px, py);
    } else {
      appendShapeLineTo(shape, px, py);
    }
  }
}

// Draws a star centered at (cx, cy) with outer and inner radii and a given number of points.
function drawStar(
  shape: Shape,
  cx: number,
  cy: number,
  outerRadius: number,
  innerRadius: number,
  points: number,
): void {
  const totalVertices = points * 2;
  const step = Math.PI / points;
  const startAngle = -Math.PI / 2;
  for (let i = 0; i <= totalVertices; i++) {
    const angle = startAngle + step * i;
    const r = i % 2 === 0 ? outerRadius : innerRadius;
    const px = cx + Math.cos(angle) * r;
    const py = cy + Math.sin(angle) * r;
    if (i === 0) {
      appendShapeMoveTo(shape, px, py);
    } else {
      appendShapeLineTo(shape, px, py);
    }
  }
}

const FILL_COLOR = 0x4488cc;
const STROKE_COLOR = 0x88ccff;

// ===== Row 1: Basic primitives =====

const row1Y = rowY(0);

const rect = createShape();
appendShapeBeginFill(rect, FILL_COLOR);
appendShapeRectangle(rect, 0, 0, 120, 80);
appendShapeEndFill(rect);
placeShape(rect, COL_START, row1Y + 15);

const circ = createShape();
appendShapeBeginFill(circ, FILL_COLOR);
appendShapeCircle(circ, 50, 50, 50);
appendShapeEndFill(circ);
placeShape(circ, COL_START + 160, row1Y + 5);

const ellip = createShape();
appendShapeBeginFill(ellip, FILL_COLOR);
appendShapeEllipse(ellip, 0, 0, 140, 90);
appendShapeEndFill(ellip);
placeShape(ellip, COL_START + 300, row1Y + 10);

const roundRect = createShape();
appendShapeBeginFill(roundRect, FILL_COLOR);
appendShapeRoundRectangle(roundRect, 0, 0, 140, 90, 20, 20);
appendShapeEndFill(roundRect);
placeShape(roundRect, COL_START + 500, row1Y + 10);

// ===== Row 2: Polygons =====

const row2Y = rowY(1);
const polySize = 45;

const triangle = createShape();
appendShapeBeginFill(triangle, FILL_COLOR);
drawRegularPolygon(triangle, polySize, polySize + 5, polySize, 3);
appendShapeEndFill(triangle);
placeShape(triangle, COL_START, row2Y);

const pentagon = createShape();
appendShapeBeginFill(pentagon, FILL_COLOR);
drawRegularPolygon(pentagon, polySize, polySize + 5, polySize, 5);
appendShapeEndFill(pentagon);
placeShape(pentagon, COL_START + 140, row2Y);

const hexagon = createShape();
appendShapeBeginFill(hexagon, FILL_COLOR);
drawRegularPolygon(hexagon, polySize, polySize + 5, polySize, 6);
appendShapeEndFill(hexagon);
placeShape(hexagon, COL_START + 280, row2Y);

const star5 = createShape();
appendShapeBeginFill(star5, FILL_COLOR);
drawStar(star5, polySize, polySize + 5, polySize, polySize * 0.4, 5);
appendShapeEndFill(star5);
placeShape(star5, COL_START + 420, row2Y);

// ===== Row 3: Lines and curves =====

const row3Y = rowY(2);
const curveWidth = 200;
const curveHeight = 80;

const straightLine = createShape();
appendShapeLineStyle(straightLine, 3, STROKE_COLOR);
appendShapeMoveTo(straightLine, 0, curveHeight / 2);
appendShapeLineTo(straightLine, curveWidth, curveHeight / 2);
placeShape(straightLine, COL_START, row3Y + 15);

const quadCurve = createShape();
appendShapeLineStyle(quadCurve, 3, STROKE_COLOR);
appendShapeMoveTo(quadCurve, 0, curveHeight);
appendShapeCurveTo(quadCurve, curveWidth / 2, -curveHeight * 0.4, curveWidth, curveHeight);
placeShape(quadCurve, COL_START + 240, row3Y + 10);

const cubicCurve = createShape();
appendShapeLineStyle(cubicCurve, 3, STROKE_COLOR);
appendShapeMoveTo(cubicCurve, 0, curveHeight);
appendShapeCubicCurveTo(
  cubicCurve,
  curveWidth * 0.33,
  -curveHeight * 0.3,
  curveWidth * 0.66,
  curveHeight * 1.3,
  curveWidth,
  0,
);
placeShape(cubicCurve, COL_START + 500, row3Y + 10);

// ===== Row 4: Fill types =====

const row4Y = rowY(3);
const fillSize = 80;

const solidFill = createShape();
appendShapeBeginFill(solidFill, 0xcc4444);
appendShapeRectangle(solidFill, 0, 0, fillSize, fillSize);
appendShapeEndFill(solidFill);
placeShape(solidFill, COL_START, row4Y + 15);

const alphaFill = createShape();
appendShapeBeginFill(alphaFill, 0x44cc44, 0.5);
appendShapeRectangle(alphaFill, 0, 0, fillSize, fillSize);
appendShapeEndFill(alphaFill);
placeShape(alphaFill, COL_START + 140, row4Y + 15);

const strokeOnly = createShape();
appendShapeLineStyle(strokeOnly, 3, 0xcccc44);
appendShapeRectangle(strokeOnly, 0, 0, fillSize, fillSize);
placeShape(strokeOnly, COL_START + 280, row4Y + 15);

const fillAndStroke = createShape();
appendShapeBeginFill(fillAndStroke, 0x4444cc);
appendShapeLineStyle(fillAndStroke, 3, 0xcccc44);
appendShapeRectangle(fillAndStroke, 0, 0, fillSize, fillSize);
appendShapeEndFill(fillAndStroke);
placeShape(fillAndStroke, COL_START + 420, row4Y + 15);

// ===== Row 5: Stroke variations =====

const row5Y = rowY(4);
const strokeLineLength = 160;

// Thin stroke.
const thinStroke = createShape();
appendShapeLineStyle(thinStroke, 1, STROKE_COLOR);
appendShapeMoveTo(thinStroke, 0, 20);
appendShapeLineTo(thinStroke, strokeLineLength, 20);
// Medium stroke below.
appendShapeLineStyle(thinStroke, 4, STROKE_COLOR);
appendShapeMoveTo(thinStroke, 0, 50);
appendShapeLineTo(thinStroke, strokeLineLength, 50);
// Thick stroke below.
appendShapeLineStyle(thinStroke, 10, STROKE_COLOR);
appendShapeMoveTo(thinStroke, 0, 80);
appendShapeLineTo(thinStroke, strokeLineLength, 80);
placeShape(thinStroke, COL_START, row5Y);

// Cap styles: none, round, square.
const capsNone = createShape();
appendShapeLineStyle(capsNone, 10, 0xcc8844, 1, false, 'normal', 'none');
appendShapeMoveTo(capsNone, 10, 20);
appendShapeLineTo(capsNone, strokeLineLength - 10, 20);
appendShapeLineStyle(capsNone, 10, 0x44cc88, 1, false, 'normal', 'round');
appendShapeMoveTo(capsNone, 10, 50);
appendShapeLineTo(capsNone, strokeLineLength - 10, 50);
appendShapeLineStyle(capsNone, 10, 0x8844cc, 1, false, 'normal', 'square');
appendShapeMoveTo(capsNone, 10, 80);
appendShapeLineTo(capsNone, strokeLineLength - 10, 80);
placeShape(capsNone, COL_START + 220, row5Y);

// Join styles: miter, round, bevel.
const joinMiter = createShape();
appendShapeLineStyle(joinMiter, 6, 0xcc8844, 1, false, 'normal', 'none', 'miter');
appendShapeMoveTo(joinMiter, 0, 80);
appendShapeLineTo(joinMiter, 40, 10);
appendShapeLineTo(joinMiter, 80, 80);
placeShape(joinMiter, COL_START + 440, row5Y + 10);

const joinRound = createShape();
appendShapeLineStyle(joinRound, 6, 0x44cc88, 1, false, 'normal', 'none', 'round');
appendShapeMoveTo(joinRound, 0, 80);
appendShapeLineTo(joinRound, 40, 10);
appendShapeLineTo(joinRound, 80, 80);
placeShape(joinRound, COL_START + 550, row5Y + 10);

const joinBevel = createShape();
appendShapeLineStyle(joinBevel, 6, 0x8844cc, 1, false, 'normal', 'none', 'bevel');
appendShapeMoveTo(joinBevel, 0, 80);
appendShapeLineTo(joinBevel, 40, 10);
appendShapeLineTo(joinBevel, 80, 80);
placeShape(joinBevel, COL_START + 660, row5Y + 10);

function enterFrame(): void {
  render(main);
  requestAnimationFrame(enterFrame);
}

enterFrame();
