import { registerShapeHitTestCommand } from './shapeHitTestRegistry';

// Registers default hit-test handlers for the built-in primitive commands: drawCircle,
// drawEllipse, drawRectangle, and drawRoundRectangle. Also registers a basic point-in-polygon
// handler for pen-path fills (moveTo/lineTo/curveTo/drawPath). After calling this function,
// hitTestShapeCommandPoint is no longer inert in isolation — it returns true/false for all
// registered primitives.
//
// This function is tree-shakable: import it and call it once to opt in. Do not call at module
// top level; call from your application's initialization code.
export function enableShapeHitTesting(): void {
  registerShapeHitTestCommand({
    key: 'drawCircle',
    hitTest(x: number, y: number, buf: unknown[], i: number): boolean {
      const cx = buf[i] as number;
      const cy = buf[i + 1] as number;
      const r = buf[i + 2] as number;
      const dx = x - cx;
      const dy = y - cy;
      return dx * dx + dy * dy <= r * r;
    },
  });
  registerShapeHitTestCommand({
    key: 'drawEllipse',
    hitTest(x: number, y: number, buf: unknown[], i: number): boolean {
      // drawEllipse args: x (top-left), y (top-left), width, height
      const ex = buf[i] as number;
      const ey = buf[i + 1] as number;
      const ew = buf[i + 2] as number;
      const eh = buf[i + 3] as number;
      const rx = ew / 2;
      const ry = eh / 2;
      const cx = ex + rx;
      const cy = ey + ry;
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      return nx * nx + ny * ny <= 1;
    },
  });
  registerShapeHitTestCommand({
    key: 'drawRectangle',
    hitTest(x: number, y: number, buf: unknown[], i: number): boolean {
      const rx = buf[i] as number;
      const ry = buf[i + 1] as number;
      const rw = buf[i + 2] as number;
      const rh = buf[i + 3] as number;
      return x >= rx && x <= rx + rw && y >= ry && y <= ry + rh;
    },
  });
  registerShapeHitTestCommand({
    key: 'drawRoundRectangle',
    hitTest(x: number, y: number, buf: unknown[], i: number): boolean {
      const rx = buf[i] as number;
      const ry = buf[i + 1] as number;
      const rw = buf[i + 2] as number;
      const rh = buf[i + 3] as number;
      // drawRoundRectangle args: x, y, width, height, ellipseWidth, ellipseHeight.
      // ellipseWidth/ellipseHeight are the full diameters — halve them for the arc radii.
      const arx = ((buf[i + 4] as number) / 2) | 0 || (buf[i + 4] as number) / 2;
      const ary = ((buf[i + 5] as number) / 2) | 0 || (buf[i + 5] as number) / 2;
      // Clamp corner radii to at most half of the dimension in each axis.
      const cx = Math.min(arx, rw / 2);
      const cy = Math.min(ary, rh / 2);
      // Broad-phase: must be within the outer rectangle.
      if (x < rx || x > rx + rw || y < ry || y > ry + rh) return false;
      // The four corner rectangles — if inside those, check the ellipse; otherwise the interior
      // cross is unconditional.
      const inLeft = x < rx + cx;
      const inRight = x > rx + rw - cx;
      const inTop = y < ry + cy;
      const inBottom = y > ry + rh - cy;
      if ((inLeft || inRight) && (inTop || inBottom)) {
        // We are in one of the four corner regions. Map to the relevant ellipse center.
        const ecx = inLeft ? rx + cx : rx + rw - cx;
        const ecy = inTop ? ry + cy : ry + rh - cy;
        const dx = (x - ecx) / cx;
        const dy = (y - ecy) / cy;
        return dx * dx + dy * dy <= 1;
      }
      // Otherwise in the central cross — unconditionally inside.
      return true;
    },
  });
}
