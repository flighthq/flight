import { getSurfaceCoverage } from './coverage';
import { setSurfacePixel } from './pixel';
import { createSurface } from './surface';

describe('getSurfaceCoverage', () => {
  it('returns 0 for a surface still entirely the background colour', () => {
    expect(getSurfaceCoverage(createSurface(4, 4, 0x123456ff), 0x123456ff)).toBe(0);
  });

  it('returns 0 for a fully transparent surface against a transparent background', () => {
    expect(getSurfaceCoverage(createSurface(4, 4, 0x00000000), 0x00000000)).toBe(0);
  });

  it('counts pixels that differ from the background on any channel', () => {
    const surface = createSurface(2, 2, 0x000000ff);
    setSurfacePixel(surface, 0, 0, 0xff0000ff);
    expect(getSurfaceCoverage(surface, 0x000000ff)).toBe(0.25);
  });

  it('measures a fully painted surface as full coverage', () => {
    const surface = createSurface(2, 2, 0x000000ff);
    setSurfacePixel(surface, 0, 0, 0xffffffff);
    setSurfacePixel(surface, 1, 0, 0xffffffff);
    setSurfacePixel(surface, 0, 1, 0xffffffff);
    setSurfacePixel(surface, 1, 1, 0xffffffff);
    expect(getSurfaceCoverage(surface, 0x000000ff)).toBe(1);
  });

  it('ignores differences within the channel tolerance', () => {
    const surface = createSurface(2, 1, 0x000000ff);
    setSurfacePixel(surface, 0, 0, 0x050505ff); // 5 per channel
    expect(getSurfaceCoverage(surface, 0x000000ff, 5)).toBe(0);
    expect(getSurfaceCoverage(surface, 0x000000ff, 4)).toBe(0.5);
  });

  it('returns 0 for an empty surface', () => {
    expect(getSurfaceCoverage(createSurface(0, 0), 0x000000ff)).toBe(0);
  });
});
