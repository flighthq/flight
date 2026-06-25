import type { ColorMatrixFilter } from '@flighthq/types';

/**
 * Builds a CSS `filter: url(#id)` string for a ColorMatrixFilter by injecting an inline SVG
 * `<feColorMatrix>` element into a shared hidden SVG container. Callers pass the returned
 * CSS string directly to `setDomCssFilter`.
 *
 * The Flash/OpenFL 4×5 color matrix uses offsets in the 0–255 range; SVG `feColorMatrix`
 * expects values in the 0–1 range. This function divides offset columns (indices 4, 9, 14, 19)
 * by 255 before writing the `values` attribute.
 *
 * The returned CSS string references a `<filter>` element owned by this module. Call
 * `releaseDomSvgColorMatrixFilter` with the id portion when the filter is no longer needed to
 * remove the SVG element from the DOM; not doing so leaks `<filter>` nodes.
 *
 * Returns null if called outside a document context (SSR / headless without DOM).
 */
export function getDomSvgColorMatrixFilter(filter: Readonly<ColorMatrixFilter>): string | null {
  const container = ensureSvgContainer();
  if (container === null) return null;
  const id = `flighthq-cm-${_nextFilterId++}`;
  const svgFilter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
  svgFilter.id = id;
  svgFilter.setAttribute('color-interpolation-filters', 'sRGB');
  const feColorMatrix = document.createElementNS('http://www.w3.org/2000/svg', 'feColorMatrix');
  feColorMatrix.setAttribute('type', 'matrix');
  feColorMatrix.setAttribute('values', buildFeColorMatrixValues(filter.matrix));
  svgFilter.appendChild(feColorMatrix);
  container.appendChild(svgFilter);
  return `url(#${id})`;
}

/**
 * Removes the SVG `<filter>` element registered under the given id from the shared container.
 * The `id` is the fragment portion of the string returned by `getDomSvgColorMatrixFilter`
 * (strip the leading `url(#` and trailing `)`).
 *
 * Call this when the filter is no longer needed to avoid leaking `<filter>` DOM nodes.
 * No-op if the id is not found or outside a document context.
 */
export function releaseDomSvgColorMatrixFilter(id: string): void {
  const container = _svgContainer;
  if (container === null) return;
  const el = container.querySelector(`#${CSS.escape(id)}`);
  if (el !== null) container.removeChild(el);
}

// Builds the SVG feColorMatrix `values` attribute string from a Flash/OpenFL 4×5 color matrix.
// SVG expects values in the 0–1 range; the offset column (every 5th value starting at index 4)
// is divided by 255 to convert from Flash's 0–255 convention.
function buildFeColorMatrixValues(matrix: ReadonlyArray<number>): string {
  const out = new Array<number>(20);
  for (let row = 0; row < 4; row++) {
    const base = row * 5;
    out[base + 0] = matrix[base + 0];
    out[base + 1] = matrix[base + 1];
    out[base + 2] = matrix[base + 2];
    out[base + 3] = matrix[base + 3];
    // Offset column: divide by 255 (Flash 0–255 → SVG 0–1).
    out[base + 4] = matrix[base + 4] / 255;
  }
  return out.join(' ');
}

// Returns (or lazily creates) the shared hidden SVG container appended to document.body.
// Returns null when no document is available (SSR context).
function ensureSvgContainer(): SVGSVGElement | null {
  if (_svgContainer !== null) return _svgContainer;
  if (typeof document === 'undefined') return null;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.position = 'absolute';
  svg.style.width = '0';
  svg.style.height = '0';
  svg.style.overflow = 'hidden';
  svg.style.pointerEvents = 'none';
  // The container lives outside the render root so clip-path / overflow:hidden cannot hide it.
  document.body.appendChild(svg);
  _svgContainer = svg;
  return svg;
}

// SVG filter elements are appended to a shared hidden <svg> container at the document root so
// every element with `filter: url(#id)` can reference them regardless of placement in the DOM.
// Each filter gets a unique id derived from a monotonically incrementing counter so concurrent
// filters do not collide.
let _svgContainer: SVGSVGElement | null = null;
let _nextFilterId = 0;
