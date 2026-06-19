import type { Matrix, PathWinding } from '@flighthq/types';

// DOM contour clip via CSS clip-path. Unlike WebGL/WebGPU stencil, the DOM realizes a path clip as a
// `clip-path` on the masked element(s). Crisp (vector), honors winding via `clip-rule`. Replaces the
// former domMask bounding-rectangle approximation for path clips.
//
// MODEL: the existing DOM clip stack (`domClipStack`) holds stage-space rectangles intersected into one
// clip-path polygon per element. A contour clip is a new stack entry kind. RECONCILE: change the stack
// element type to a tagged union { kind:'rect', ... } | { kind:'contour', points, winding }, and have
// applyDOMClipRectangles emit `polygon()`/`path()` for contour entries.
//
// LIMITATION (documented): CSS cannot intersect a path clip with other clips in one property. When a
// contour clip is active, apply it directly and ignore stacked rects for that element (v1), or nest one
// clip-path per clipping wrapper element (preferred, more DOM churn). UNVERIFIED — authored during a
// tooling outage.

export interface DOMClipContourEntry {
  kind: 'contour';
  // Contour points already transformed to stage space (apply() then maps to each element's local space).
  contours: number[][];
  winding: PathWinding;
}

// Builds a CSS clip-path value from stage-space contours mapped into one element's local space.
// `elementInverse` maps stage space -> element local (reuse getElementMatrix + invert from
// domClipRectangle). Single contour -> polygon(); multiple/holes -> path() with clip-rule.
export function buildDOMContourClipPath(
  entry: DOMClipContourEntry,
  mapPointToElement: (x: number, y: number) => readonly [number, number],
): string {
  if (entry.contours.length === 1) {
    const pts: string[] = [];
    const contour = entry.contours[0];
    for (let i = 0; i < contour.length; i += 2) {
      const [x, y] = mapPointToElement(contour[i], contour[i + 1]);
      pts.push(`${x}px ${y}px`);
    }
    return `polygon(${pts.join(', ')})`;
  }
  let d = '';
  for (let c = 0; c < entry.contours.length; c++) {
    const contour = entry.contours[c];
    for (let i = 0; i < contour.length; i += 2) {
      const [x, y] = mapPointToElement(contour[i], contour[i + 1]);
      d += `${i === 0 ? 'M' : 'L'}${x} ${y} `;
    }
    d += 'Z ';
  }
  const rule = entry.winding === 'evenOdd' ? 'evenodd' : 'nonzero';
  return `path('${rule}', '${d.trim()}')`;
}

export function pushDOMClipContours(
  stack: { push(entry: DOMClipContourEntry): void },
  contours: readonly (readonly number[])[],
  winding: PathWinding,
  transform: Readonly<Matrix>,
): void {
  const staged: number[][] = [];
  for (let c = 0; c < contours.length; c++) {
    const src = contours[c];
    const out: number[] = [];
    for (let i = 0; i < src.length; i += 2) {
      const x = src[i];
      const y = src[i + 1];
      out.push(transform.a * x + transform.c * y + transform.tx, transform.b * x + transform.d * y + transform.ty);
    }
    staged.push(out);
  }
  stack.push({ kind: 'contour', contours: staged, winding });
}
