import type { Graphics } from '@flighthq/types';

export function beginFill(graphics: Graphics, color = 0, alpha = 1): void {
  graphics.commands.push({ type: 'beginFill', alpha, color });
}

export function cubicCurveTo(
  graphics: Graphics,
  controlX1: number,
  controlY1: number,
  controlX2: number,
  controlY2: number,
  anchorX: number,
  anchorY: number,
): void {
  graphics.commands.push({ type: 'cubicCurveTo', anchorX, anchorY, controlX1, controlY1, controlX2, controlY2 });
}

export function curveTo(
  graphics: Graphics,
  controlX: number,
  controlY: number,
  anchorX: number,
  anchorY: number,
): void {
  graphics.commands.push({ type: 'curveTo', anchorX, anchorY, controlX, controlY });
}

export function drawCircle(graphics: Graphics, x: number, y: number, radius: number): void {
  graphics.commands.push({ type: 'drawCircle', radius, x, y });
}

export function drawEllipse(graphics: Graphics, x: number, y: number, width: number, height: number): void {
  graphics.commands.push({ type: 'drawEllipse', height, width, x, y });
}

export function drawRect(graphics: Graphics, x: number, y: number, width: number, height: number): void {
  graphics.commands.push({ type: 'drawRect', height, width, x, y });
}

export function drawRoundRect(
  graphics: Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  ellipseWidth: number,
  ellipseHeight: number,
): void {
  graphics.commands.push({ type: 'drawRoundRect', ellipseHeight, ellipseWidth, height, width, x, y });
}

export function endFill(graphics: Graphics): void {
  graphics.commands.push({ type: 'endFill' });
}

export function lineStyle(graphics: Graphics, thickness = 1, color = 0, alpha = 1): void {
  graphics.commands.push({ type: 'lineStyle', alpha, color, thickness });
}

export function lineTo(graphics: Graphics, x: number, y: number): void {
  graphics.commands.push({ type: 'lineTo', x, y });
}

export function moveTo(graphics: Graphics, x: number, y: number): void {
  graphics.commands.push({ type: 'moveTo', x, y });
}
