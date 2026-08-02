import { describe, expect, it } from 'vitest';

import { GL_MESH_FRAGMENT_TAIL } from './glMeshFragmentTail';

describe('GL_MESH_FRAGMENT_TAIL', () => {
  it('applies node alpha before premultiplying', () => {
    const objectAlpha = GL_MESH_FRAGMENT_TAIL.indexOf('u_objectAlpha');
    const premultiply = GL_MESH_FRAGMENT_TAIL.indexOf('fragColor.rgb *= fragColor.a');
    expect(objectAlpha).toBeGreaterThanOrEqual(0);
    expect(premultiply).toBeGreaterThan(objectAlpha);
  });

  it('premultiplies rgb by the final alpha as the last statement', () => {
    expect(GL_MESH_FRAGMENT_TAIL.trimEnd().endsWith('fragColor.rgb *= fragColor.a;')).toBe(true);
  });
});
