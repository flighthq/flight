import { createCustomShaderEffect } from './customShaderEffect';

describe('createCustomShaderEffect', () => {
  it('carries options', () => {
    expect(createCustomShaderEffect({ shaderKey: 'myEffect', uniforms: { intensity: 0.5 } })).toMatchObject({
      shaderKey: 'myEffect',
      uniforms: { intensity: 0.5 },
    });
  });

  it('tags the intent type', () => {
    expect(createCustomShaderEffect({ shaderKey: 'test' }).kind).toBe('CustomShaderEffect');
  });
});
