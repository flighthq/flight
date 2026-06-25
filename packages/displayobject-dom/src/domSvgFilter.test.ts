import { getDomSvgColorMatrixFilter, releaseDomSvgColorMatrixFilter } from './domSvgFilter';

// A simple identity color matrix (Flash 0–255 offset convention).
const IDENTITY_MATRIX = [
  1,
  0,
  0,
  0,
  0, // R row
  0,
  1,
  0,
  0,
  0, // G row
  0,
  0,
  1,
  0,
  0, // B row
  0,
  0,
  0,
  1,
  0, // A row
];

describe('getDomSvgColorMatrixFilter', () => {
  it('returns a css url(#id) reference string', () => {
    const filter = { kind: 'ColorMatrixFilter' as const, matrix: IDENTITY_MATRIX };
    const css = getDomSvgColorMatrixFilter(filter);
    expect(css).toMatch(/^url\(#flighthq-cm-\d+\)$/);
  });

  it('injects a <filter> element into the document', () => {
    const filter = { kind: 'ColorMatrixFilter' as const, matrix: IDENTITY_MATRIX };
    const css = getDomSvgColorMatrixFilter(filter)!;
    const id = css.slice('url(#'.length, -1);
    const el = document.getElementById(id);
    expect(el).not.toBeNull();
    expect(el!.tagName.toLowerCase()).toBe('filter');
  });

  it('injects a feColorMatrix child with type=matrix', () => {
    const filter = { kind: 'ColorMatrixFilter' as const, matrix: IDENTITY_MATRIX };
    const css = getDomSvgColorMatrixFilter(filter)!;
    const id = css.slice('url(#'.length, -1);
    const filterEl = document.getElementById(id)!;
    const feEl = filterEl.querySelector('feColorMatrix');
    expect(feEl).not.toBeNull();
    expect(feEl!.getAttribute('type')).toBe('matrix');
  });

  it('divides offset column by 255 in the feColorMatrix values', () => {
    // Matrix with offset 255 in the red channel (index 4), which should become 1.0 in SVG.
    const matrix = [
      1,
      0,
      0,
      0,
      255, // R: offset 255 → should map to 1 in SVG
      0,
      1,
      0,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      0,
      1,
      0,
    ];
    const filter = { kind: 'ColorMatrixFilter' as const, matrix };
    const css = getDomSvgColorMatrixFilter(filter)!;
    const id = css.slice('url(#'.length, -1);
    const filterEl = document.getElementById(id)!;
    const feEl = filterEl.querySelector('feColorMatrix')!;
    const values = feEl.getAttribute('values')!.split(' ').map(Number);
    // Index 4 is the R-row offset; should be 255/255 = 1
    expect(values[4]).toBeCloseTo(1, 5);
  });

  it('each call produces a unique id', () => {
    const filter = { kind: 'ColorMatrixFilter' as const, matrix: IDENTITY_MATRIX };
    const css1 = getDomSvgColorMatrixFilter(filter);
    const css2 = getDomSvgColorMatrixFilter(filter);
    expect(css1).not.toBe(css2);
  });

  it('sets color-interpolation-filters to sRGB on the filter element', () => {
    const filter = { kind: 'ColorMatrixFilter' as const, matrix: IDENTITY_MATRIX };
    const css = getDomSvgColorMatrixFilter(filter)!;
    const id = css.slice('url(#'.length, -1);
    const filterEl = document.getElementById(id)!;
    expect(filterEl.getAttribute('color-interpolation-filters')).toBe('sRGB');
  });
});

describe('releaseDomSvgColorMatrixFilter', () => {
  it('removes the injected filter element from the document', () => {
    const filter = { kind: 'ColorMatrixFilter' as const, matrix: IDENTITY_MATRIX };
    const css = getDomSvgColorMatrixFilter(filter)!;
    const id = css.slice('url(#'.length, -1);
    expect(document.getElementById(id)).not.toBeNull();
    releaseDomSvgColorMatrixFilter(id);
    expect(document.getElementById(id)).toBeNull();
  });

  it('is a no-op for an unknown id', () => {
    expect(() => releaseDomSvgColorMatrixFilter('nonexistent-filter-id')).not.toThrow();
  });
});
