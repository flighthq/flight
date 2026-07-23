import { allocateHsvColor, hsvToRgb, rgbToHsv } from './hsvColor';

describe('allocateHsvColor', () => {
  it('allocates a zeroed three-component HSV color', () => {
    expect(allocateHsvColor()).toEqual([0, 0, 0]);
  });
});

describe('hsvToRgb', () => {
  it('produces achromatic RGB for saturation = 0', () => {
    const out: [number, number, number, number] = [0, 0, 0, 1];
    hsvToRgb(out, 0, 0, 0.6);
    expect(out[0]).toBeCloseTo(0.6);
    expect(out[1]).toBeCloseTo(0.6);
    expect(out[2]).toBeCloseTo(0.6);
  });
  it('produces pure red for h=0, s=1, v=1', () => {
    const out: [number, number, number, number] = [0, 0, 0, 1];
    hsvToRgb(out, 0, 1, 1);
    expect(out[0]).toBeCloseTo(1, 5);
    expect(out[1]).toBeCloseTo(0, 5);
    expect(out[2]).toBeCloseTo(0, 5);
  });
  it('round-trips with rgbToHsv for a pure green', () => {
    const out: [number, number, number, number] = [0, 0, 0, 1];
    hsvToRgb(out, 120, 1, 1);
    expect(out[0]).toBeCloseTo(0, 5);
    expect(out[1]).toBeCloseTo(1, 5);
    expect(out[2]).toBeCloseTo(0, 5);
  });
});

describe('rgbToHsv', () => {
  it('converts pure red to hue=0, s=1, v=1', () => {
    const out: [number, number, number] = [0, 0, 0];
    rgbToHsv(out, 0xff0000ff);
    expect(out[0]).toBeCloseTo(0, 3);
    expect(out[1]).toBeCloseTo(1, 5);
    expect(out[2]).toBeCloseTo(1, 5);
  });
  it('converts black to s=0, v=0', () => {
    const out: [number, number, number] = [0, 0, 0];
    rgbToHsv(out, 0x000000ff);
    expect(out[1]).toBe(0);
    expect(out[2]).toBeCloseTo(0, 5);
  });
  it('converts white to s=0, v=1', () => {
    const out: [number, number, number] = [0, 0, 0];
    rgbToHsv(out, 0xffffffff);
    expect(out[1]).toBe(0);
    expect(out[2]).toBeCloseTo(1, 5);
  });
  it('returns the out instance', () => {
    const out: [number, number, number] = [0, 0, 0];
    expect(rgbToHsv(out, 0xff0000ff)).toBe(out);
  });
});
