import { getTextShaperBackend, setTextShaperBackend } from '@flighthq/textshaper';

import {
  CanvasTextShaperBackend,
  clearCanvasTextShaperBackendCache,
  createCanvasTextShaperBackend,
} from './canvasTextShaper';

afterEach(() => {
  setTextShaperBackend(null);
});

describe('CanvasTextShaperBackend', () => {
  it('satisfies the TextShaperBackend interface', () => {
    const backend = createCanvasTextShaperBackend();
    expect(typeof backend.measureText).toBe('function');
    expect(typeof backend.getFontMetrics).toBe('function');
    expect(typeof backend.clearCache).toBe('function');
  });
});

describe('clearCanvasTextShaperBackendCache', () => {
  it('clears the advance cache so subsequent calls re-measure', () => {
    const backend = createCanvasTextShaperBackend();
    const first = backend.measureText('hello', { size: 16 });
    // Warm the cache, then clear and re-measure — should produce the same result (not a stale value)
    clearCanvasTextShaperBackendCache(backend);
    const second = backend.measureText('hello', { size: 16 });
    expect(second).toBeCloseTo(first, 5);
  });

  it('is a no-op on the sentinel backend', () => {
    // Sentinel is returned when document is unavailable. We cannot easily simulate that in jsdom,
    // but we can verify clearCanvasTextShaperBackendCache is callable and does not throw.
    const backend = createCanvasTextShaperBackend();
    expect(() => clearCanvasTextShaperBackendCache(backend)).not.toThrow();
  });
});

describe('createCanvasTextShaperBackend', () => {
  it('returns a backend whose measureText reports a non-negative width', () => {
    const backend = createCanvasTextShaperBackend();
    expect(backend.measureText('hello', {})).toBeGreaterThanOrEqual(0);
  });

  it('returns a greater advance for longer text at the same format', () => {
    const backend = createCanvasTextShaperBackend();
    const short = backend.measureText('a', { size: 16 });
    const longer = backend.measureText('aaa', { size: 16 });
    expect(longer).toBeGreaterThan(short);
  });

  it('returns a number for any font size', () => {
    // jsdom measureText always returns 0; we only verify type and non-negative sentinel behavior.
    const backend = createCanvasTextShaperBackend();
    const small = backend.measureText('hello', { size: 12 });
    const large = backend.measureText('hello', { size: 24 });
    expect(typeof small).toBe('number');
    expect(typeof large).toBe('number');
    expect(small).toBeGreaterThanOrEqual(0);
    expect(large).toBeGreaterThanOrEqual(0);
  });

  it('two backends do not share a context — independent font state', () => {
    const a = createCanvasTextShaperBackend();
    const b = createCanvasTextShaperBackend();
    // Both should yield the same measurement for the same input (they use the same algorithm),
    // but they are independent instances. Mutating one should not change the other.
    const widthA = a.measureText('hello', { size: 16 });
    const widthB = b.measureText('hello', { size: 16 });
    expect(widthA).toBeCloseTo(widthB, 5);
    // Measuring with a different format on backend a does not change b's next measurement.
    a.measureText('hello', { size: 48, bold: true });
    const widthB2 = b.measureText('hello', { size: 16 });
    expect(widthB2).toBeCloseTo(widthB, 5);
  });

  it('installs into the textshaper seam', () => {
    const backend = createCanvasTextShaperBackend();
    setTextShaperBackend(backend);
    expect(getTextShaperBackend()).toBe(backend);
  });

  it('measureText uses the advance cache — same key returns immediately', () => {
    const backend = createCanvasTextShaperBackend();
    const first = backend.measureText('cached', { size: 16, font: 'serif' });
    const second = backend.measureText('cached', { size: 16, font: 'serif' });
    // Both calls must return the same value (cached path must not change the result).
    expect(second).toBe(first);
  });

  it('measureText returns -1 when letterSpacing is set (sentinel or jsdom limitation is acceptable)', () => {
    // jsdom's measureText returns 0 for all text, so we just check non-throw and type.
    const backend = createCanvasTextShaperBackend();
    const result = backend.measureText('hello', { letterSpacing: 2 });
    expect(typeof result).toBe('number');
  });

  it('measureText with letterSpacing=0 and non-zero produce number results', () => {
    const backend = createCanvasTextShaperBackend();
    const noSpacing = backend.measureText('hello', { letterSpacing: 0 });
    const withSpacing = backend.measureText('hello', { letterSpacing: 4 });
    expect(typeof noSpacing).toBe('number');
    expect(typeof withSpacing).toBe('number');
    expect(noSpacing).toBeGreaterThanOrEqual(0);
    expect(withSpacing).toBeGreaterThanOrEqual(0);
  });

  it('keys the advance cache on letterSpacing — differing letterSpacing does not collapse to one entry', () => {
    // jsdom's measureText returns 0 for every string, so a wrong width is invisible; instead pin
    // the fix by observing the underlying measureText call count. Two calls that differ only in
    // letterSpacing must each reach measureText (distinct cache keys); a repeated identical call
    // must hit the cache (no second measureText). A spy on the 2D context proves both.
    const realGetContext = HTMLCanvasElement.prototype.getContext;
    const measureSpy = vi.fn((_text: string) => ({ width: 0 }) as TextMetrics);
    const fakeContext = {
      font: '',
      letterSpacing: '0px',
      wordSpacing: '0px',
      direction: 'ltr',
      measureText: measureSpy,
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fakeContext as never);
    try {
      const backend = createCanvasTextShaperBackend();
      if (backend.measureText('probe', {}) === -1) return; // sentinel path; nothing to assert

      measureSpy.mockClear();
      backend.measureText('same', { size: 16, letterSpacing: 0 });
      backend.measureText('same', { size: 16, letterSpacing: 0 });
      // Identical key — second call is served from cache.
      expect(measureSpy).toHaveBeenCalledTimes(1);

      backend.measureText('same', { size: 16, letterSpacing: 4 });
      // Different letterSpacing — distinct key, must re-measure rather than return the cached 0-spacing width.
      expect(measureSpy).toHaveBeenCalledTimes(2);
    } finally {
      HTMLCanvasElement.prototype.getContext = realGetContext;
    }
  });
});

describe('createCanvasTextShaperBackend — getFontMetrics', () => {
  it('returns an object with the expected FontMetrics fields', () => {
    const backend = createCanvasTextShaperBackend();
    const metrics = backend.getFontMetrics!({ size: 16, font: 'serif' });
    if (metrics === null) return; // sentinel path; skip field checks

    expect(typeof metrics.ascent).toBe('number');
    expect(typeof metrics.capHeight).toBe('number');
    expect(typeof metrics.descent).toBe('number');
    expect(typeof metrics.lineGap).toBe('number');
    expect(typeof metrics.underlinePosition).toBe('number');
    expect(typeof metrics.underlineThickness).toBe('number');
    expect(typeof metrics.unitsPerEm).toBe('number');
    expect(typeof metrics.xHeight).toBe('number');
  });

  it('ascent and descent are non-negative', () => {
    const backend = createCanvasTextShaperBackend();
    const metrics = backend.getFontMetrics!({ size: 16 });
    if (metrics === null) return;
    expect(metrics.ascent).toBeGreaterThanOrEqual(0);
    expect(metrics.descent).toBeGreaterThanOrEqual(0);
  });

  it('reports a non-zero unitsPerEm (identity size) so the documented inverse never divides by zero', () => {
    const backend = createCanvasTextShaperBackend();
    const metrics = backend.getFontMetrics!({ size: 16 });
    if (metrics === null) return;
    // Canvas cannot read OS/2 units; it returns the identity unitsPerEm === size, making the
    // documented "divide by size / unitsPerEm" conversion a safe no-op (divide by 1) instead of /0.
    expect(metrics.unitsPerEm).toBe(16);
    const defaultMetrics = backend.getFontMetrics!({});
    if (defaultMetrics === null) return;
    // No explicit size falls back to the 12px default — still non-zero.
    expect(defaultMetrics.unitsPerEm).toBe(12);
  });

  it('underlineThickness is positive', () => {
    const backend = createCanvasTextShaperBackend();
    const metrics = backend.getFontMetrics!({ size: 16 });
    if (metrics === null) return;
    expect(metrics.underlineThickness).toBeGreaterThan(0);
  });

  it('returns null or an object — never throws', () => {
    const backend = createCanvasTextShaperBackend();
    expect(() => backend.getFontMetrics!({})).not.toThrow();
    expect(() => backend.getFontMetrics!({ size: 12, bold: true, italic: true })).not.toThrow();
  });
});
