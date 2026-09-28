import { awd2LightHandler, awd2LightPickerHandler } from './awd2LightingHandler.ts';
import { AWD2_BLOCK_LIGHT, AWD2_BLOCK_LIGHT_PICKER, AWD2_BUILD_PHASE_LIGHTING } from './awd2Schema.ts';

describe('awd2LightHandler', () => {
  it('claims the light block type', () => {
    expect(awd2LightHandler.blockTypes).toEqual([AWD2_BLOCK_LIGHT]);
  });

  it('has a parse function', () => {
    expect(typeof awd2LightHandler.parse).toBe('function');
  });

  it('declares the lighting build phase', () => {
    expect(awd2LightHandler.buildPhase).toBe(AWD2_BUILD_PHASE_LIGHTING);
    expect(typeof awd2LightHandler.build).toBe('function');
  });
});

describe('awd2LightPickerHandler', () => {
  it('claims the light picker block type', () => {
    expect(awd2LightPickerHandler.blockTypes).toEqual([AWD2_BLOCK_LIGHT_PICKER]);
  });

  it('has a parse function', () => {
    expect(typeof awd2LightPickerHandler.parse).toBe('function');
  });

  it('declares the lighting build phase', () => {
    expect(awd2LightPickerHandler.buildPhase).toBe(AWD2_BUILD_PHASE_LIGHTING);
    expect(typeof awd2LightPickerHandler.build).toBe('function');
  });
});
