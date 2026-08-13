import { describe, expect, it } from 'vitest';

import {
  collectRegistrarIdentities,
  diffRegistrarIdentityManifest,
  hasRegistrarIdentityManifestDrift,
} from './reachability-registrar-manifest';

describe('reachability registrar identity manifest', () => {
  it('deduplicates multi-mapping ownership rows into a sorted registrar identity set', () => {
    expect(
      collectRegistrarIdentities([
        { packageName: 'zeta', registrar: 'registerZeta' },
        { packageName: 'alpha', registrar: 'registerAlpha' },
        { packageName: 'zeta', registrar: 'registerZeta' },
      ]),
    ).toEqual([
      { packageName: 'alpha', registrar: 'registerAlpha' },
      { packageName: 'zeta', registrar: 'registerZeta' },
    ]);
  });

  it('names a lost identity instead of accepting a smaller census', () => {
    const lost = { packageName: 'scene3d-wgpu', registrar: 'registerWgpuUnlitMaterial' };
    const diff = diffRegistrarIdentityManifest([lost], []);
    expect(diff).toEqual({ added: [], lost: [lost] });
    expect(hasRegistrarIdentityManifestDrift(diff)).toBe(true);
  });

  it('does not let a coincidental addition mask a loss with the same count', () => {
    const lost = { packageName: 'scene3d-wgpu', registrar: 'registerWgpuUnlitMaterial' };
    const added = { packageName: 'scene3d-wgpu', registrar: 'registerWgpuUnlitMaterialReplacement' };
    const diff = diffRegistrarIdentityManifest([lost], [added]);
    expect(diff).toEqual({ added: [added], lost: [lost] });
    expect(hasRegistrarIdentityManifestDrift(diff)).toBe(true);
  });

  it('accepts only an exact identity-set match', () => {
    const identity = { packageName: 'scene3d-wgpu', registrar: 'registerWgpuUnlitMaterial' };
    expect(hasRegistrarIdentityManifestDrift(diffRegistrarIdentityManifest([identity], [identity]))).toBe(false);
  });
});
