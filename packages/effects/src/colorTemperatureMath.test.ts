import { computeColorTemperatureRgb, computeWhiteBalanceMultipliers } from './colorTemperatureMath';

describe('computeColorTemperatureRgb', () => {
  it('returns values in [0, 1] range', () => {
    const out: [number, number, number] = [0, 0, 0];
    computeColorTemperatureRgb(6500, out);
    expect(out[0]).toBeGreaterThanOrEqual(0);
    expect(out[0]).toBeLessThanOrEqual(1);
    expect(out[1]).toBeGreaterThanOrEqual(0);
    expect(out[1]).toBeLessThanOrEqual(1);
    expect(out[2]).toBeGreaterThanOrEqual(0);
    expect(out[2]).toBeLessThanOrEqual(1);
  });
  it('warm color (2700 K) has high red, low blue', () => {
    const out: [number, number, number] = [0, 0, 0];
    computeColorTemperatureRgb(2700, out);
    expect(out[0]).toBeGreaterThan(out[2]);
  });
  it('cool color (10000 K) has low red, high blue', () => {
    const out: [number, number, number] = [0, 0, 0];
    computeColorTemperatureRgb(10000, out);
    expect(out[2]).toBeGreaterThan(out[0]);
  });
  it('clamps to [1000, 40000] K range', () => {
    const out1: [number, number, number] = [0, 0, 0];
    const out2: [number, number, number] = [0, 0, 0];
    computeColorTemperatureRgb(500, out1);
    computeColorTemperatureRgb(1000, out2);
    expect(out1).toEqual(out2);
  });
  it('writes result to out without reading from it (alias-safe)', () => {
    const out: [number, number, number] = [99, 99, 99];
    computeColorTemperatureRgb(6500, out);
    expect(out[0]).not.toBe(99);
  });
});

describe('computeWhiteBalanceMultipliers', () => {
  it('neutral (0, 0) returns non-zero multipliers', () => {
    const out: [number, number, number] = [0, 0, 0];
    computeWhiteBalanceMultipliers(0, 0, out);
    expect(out[0]).toBeGreaterThan(0);
    expect(out[1]).toBeGreaterThan(0);
    expect(out[2]).toBeGreaterThan(0);
  });
  it('warm temperature increases red relative to cool', () => {
    const warmOut: [number, number, number] = [0, 0, 0];
    const coolOut: [number, number, number] = [0, 0, 0];
    computeWhiteBalanceMultipliers(0.5, 0, warmOut);
    computeWhiteBalanceMultipliers(-0.5, 0, coolOut);
    expect(warmOut[0]).toBeGreaterThan(coolOut[0]);
  });
  it('positive tint (magenta) reduces green relative to negative tint (green)', () => {
    const magentaOut: [number, number, number] = [0, 0, 0];
    const greenOut: [number, number, number] = [0, 0, 0];
    computeWhiteBalanceMultipliers(0, 0.5, magentaOut);
    computeWhiteBalanceMultipliers(0, -0.5, greenOut);
    expect(greenOut[1]).toBeGreaterThan(magentaOut[1]);
  });
  it('all output channels are non-negative', () => {
    const out: [number, number, number] = [0, 0, 0];
    computeWhiteBalanceMultipliers(-1, -1, out);
    expect(out[0]).toBeGreaterThanOrEqual(0);
    expect(out[1]).toBeGreaterThanOrEqual(0);
    expect(out[2]).toBeGreaterThanOrEqual(0);
  });
});
