import { awd2MaterialHandler, awd2TextureHandler } from './awd2MaterialHandler.ts';
import { AWD2_BLOCK_MATERIAL, AWD2_BLOCK_TEXTURE, AWD2_BUILD_PHASE_MATERIALS } from './awd2Schema.ts';

describe('awd2MaterialHandler', () => {
  it('claims the material block type', () => {
    expect(awd2MaterialHandler.blockTypes).toEqual([AWD2_BLOCK_MATERIAL]);
  });

  it('has a parse function', () => {
    expect(typeof awd2MaterialHandler.parse).toBe('function');
  });

  it('declares the materials build phase', () => {
    expect(awd2MaterialHandler.buildPhase).toBe(AWD2_BUILD_PHASE_MATERIALS);
    expect(typeof awd2MaterialHandler.build).toBe('function');
  });
});

describe('awd2TextureHandler', () => {
  it('claims the texture block type', () => {
    expect(awd2TextureHandler.blockTypes).toEqual([AWD2_BLOCK_TEXTURE]);
  });

  it('has a parse function', () => {
    expect(typeof awd2TextureHandler.parse).toBe('function');
  });

  it('declares no build phase', () => {
    expect(awd2TextureHandler.buildPhase).toBeUndefined();
    expect(awd2TextureHandler.build).toBeUndefined();
  });
});
