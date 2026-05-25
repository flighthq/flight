import {
  addChild,
  beginFill,
  createCanvasRenderState,
  createDisplayObject,
  createShape,
  curveTo,
  defaultCanvasShapeCommands,
  defaultCanvasShapeRenderer,
  drawCircle,
  drawEllipse,
  drawRect,
  drawRoundRect,
  lineStyle,
  lineTo,
  moveTo,
  registerCanvasShapeCommands,
  registerRenderer,
  renderCanvasBackground,
  renderCanvasDisplayObject,
  setX,
  setY,
  type Shape,
  ShapeKind,
  updateDisplayObjectBeforeRender,
} from '@flighthq/engine';

const dpr = window.devicePixelRatio || 1;

const canvas = document.createElement('canvas');
canvas.style.width = '800px';
canvas.style.height = '400px';
canvas.width = 800 * dpr;
canvas.height = 400 * dpr;
document.body.appendChild(canvas);

const state = createCanvasRenderState(canvas, {
  backgroundColor: 0xffffffff,
  contextAttributes: { alpha: false },
});
registerRenderer(state, ShapeKind, defaultCanvasShapeRenderer);
registerCanvasShapeCommands(defaultCanvasShapeCommands);

const main = createDisplayObject();
main.scaleX = dpr;
main.scaleY = dpr;

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
drawRect(square, 0, 0, 100, 100);
setX(square, 20);
setY(square, 20);
addChild(main, square);

const rectangle = createShape();
beginFill(rectangle, 0x24afc4);
drawRect(rectangle, 0, 0, 120, 100);
setX(rectangle, 140);
setY(rectangle, 20);
addChild(main, rectangle);

const circle = createShape();
beginFill(circle, 0x24afc4);
drawCircle(circle, 50, 50, 50);
setX(circle, 280);
setY(circle, 20);
addChild(main, circle);

const ellipse = createShape();
beginFill(ellipse, 0x24afc4);
drawEllipse(ellipse, 0, 0, 120, 100);
setX(ellipse, 400);
setY(ellipse, 20);
addChild(main, ellipse);

const roundSquare = createShape();
beginFill(roundSquare, 0x24afc4);
drawRoundRect(roundSquare, 0, 0, 100, 100, 40, 40);
setX(roundSquare, 540);
setY(roundSquare, 20);
addChild(main, roundSquare);

const roundRectangle = createShape();
beginFill(roundRectangle, 0x24afc4);
drawRoundRect(roundRectangle, 0, 0, 120, 100, 40, 40);
setX(roundRectangle, 660);
setY(roundRectangle, 20);
addChild(main, roundRectangle);

// ── Row 2: polygons ────────────────────────────────────────────────────────

const triangle = createShape();
beginFill(triangle, 0x24afc4);
moveTo(triangle, 0, 100);
lineTo(triangle, 50, 0);
lineTo(triangle, 100, 100);
lineTo(triangle, 0, 100);
setX(triangle, 20);
setY(triangle, 150);
addChild(main, triangle);

const pentagon = createShape();
beginFill(pentagon, 0x24afc4);
drawPolygon(pentagon, 50, 50, 50, 5);
setX(pentagon, 145);
setY(pentagon, 150);
addChild(main, pentagon);

const hexagon = createShape();
beginFill(hexagon, 0x24afc4);
drawPolygon(hexagon, 50, 50, 50, 6);
setX(hexagon, 270);
setY(hexagon, 150);
addChild(main, hexagon);

const heptagon = createShape();
beginFill(heptagon, 0x24afc4);
drawPolygon(heptagon, 50, 50, 50, 7);
setX(heptagon, 395);
setY(heptagon, 150);
addChild(main, heptagon);

const octagon = createShape();
beginFill(octagon, 0x24afc4);
drawPolygon(octagon, 50, 50, 50, 8);
setX(octagon, 520);
setY(octagon, 150);
addChild(main, octagon);

const decagon = createShape();
beginFill(decagon, 0x24afc4);
drawPolygon(decagon, 50, 50, 50, 10);
setX(decagon, 650);
setY(decagon, 150);
addChild(main, decagon);

// ── Row 3: lines and curves ───────────────────────────────────────────────

const line = createShape();
lineStyle(line, 10, 0x24afc4);
lineTo(line, 755, 0);
setX(line, 20);
setY(line, 280);
addChild(main, line);

const curve = createShape();
lineStyle(curve, 10, 0x24afc4);
curveTo(curve, 327.5, -50, 755, 0);
setX(curve, 20);
setY(curve, 340);
addChild(main, curve);

// ── Render loop ───────────────────────────────────────────────────────────

function enterFrame(): void {
  if (updateDisplayObjectBeforeRender(state, main)) {
    renderCanvasBackground(state);
    renderCanvasDisplayObject(state, main);
  }
  requestAnimationFrame(enterFrame);
}

enterFrame();
