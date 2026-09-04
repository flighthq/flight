import { createColorScaleBiasAdjustment, initializeColorScaleBiasAdjustment } from './colorScaleBiasAdjustment';

describe('createColorScaleBiasAdjustment', () => {
  it('keeps a legible bridge payload and contributes its diagonal matrix', () => {
    const value = {
      redScale: 0.5,
      greenScale: 1,
      blueScale: 1,
      alphaScale: 1,
      redBias: 0,
      greenBias: 0.25,
      blueBias: 0,
      alphaBias: 0,
    };
    const adjustment = createColorScaleBiasAdjustment(value);
    expect(adjustment.kind).toBe('ColorScaleBiasAdjustment');
    expect(adjustment.colorScaleBias.redScale).toBe(0.5);
    expect(adjustment.colorMatrix[0]).toBe(0.5);
    expect(adjustment.colorMatrix[9]).toBe(0.25);
  });
});
describe('initializeColorScaleBiasAdjustment', () => {
  it('is the construction initializer of createColorScaleBiasAdjustment', () => {
    expect(typeof initializeColorScaleBiasAdjustment).toBe('function');
  });
});
