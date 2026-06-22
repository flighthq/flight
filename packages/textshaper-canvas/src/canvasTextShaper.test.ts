import { getTextShaperBackend, setTextShaperBackend } from '@flighthq/textshaper';

import { createCanvasTextShaperBackend } from './canvasTextShaper';

afterEach(() => {
  setTextShaperBackend(null);
});

describe('createCanvasTextShaperBackend', () => {
  it('returns a backend whose measureText reports a non-negative width', () => {
    const backend = createCanvasTextShaperBackend();
    expect(typeof backend.measureText).toBe('function');
    expect(backend.measureText('hello', {})).toBeGreaterThanOrEqual(0);
  });

  it('installs into the textshaper seam', () => {
    const backend = createCanvasTextShaperBackend();
    setTextShaperBackend(backend);
    expect(getTextShaperBackend()).toBe(backend);
  });
});
