import { CustomShaderMaterialKind } from '@flighthq/types';

import { createCustomShaderMaterial } from './customShaderMaterial';

describe('createCustomShaderMaterial', () => {
  it('creates a custom shader material with default sentinel values', () => {
    const material = createCustomShaderMaterial();
    expect(material.kind).toBe(CustomShaderMaterialKind);
    expect(material.shaderKey).toBe('');
    expect(material.uniforms).toBeNull();
    expect(material.textures).toBeNull();
  });

  it('applies overrides', () => {
    const uniforms = { u_time: 1.5, u_scale: [2, 3] };
    const material = createCustomShaderMaterial({ shaderKey: 'myShader', uniforms });
    expect(material.shaderKey).toBe('myShader');
    expect(material.uniforms).toBe(uniforms);
  });
});
