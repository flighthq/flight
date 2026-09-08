import { createAnisotropyPbrExtension } from '@flighthq/materials/contract';
import { AnisotropyPbrExtensionKind } from '@flighthq/types/contract';

import { anisotropyPbrGlExtension, registerGlAnisotropyPbrExtension } from './anisotropyPbrGlExtension';
import { getGlPbrExtensionRegistration } from './glPbrExtensionRegistry';
import { makeGlScene3DState } from './glScene3DTestHelper';

describe('anisotropyPbrGlExtension', () => {
  it('contributes independent punctual and IBL anisotropy source', () => {
    const contribution = anisotropyPbrGlExtension.createShaderContribution(
      { hasTransmissionSceneColor: () => false, isTextureReady: () => false },
      createAnisotropyPbrExtension(),
    );
    expect(contribution.contributePunctual).toContain('flightDistributionGgxAnisotropic');
    expect(contribution.contributePunctual).toContain('flightVisibilitySmithGgxAnisotropic');
    expect(contribution.contributePunctual).toContain('flightAnisotropyD * flightAnisotropyVis - d * vis');
    expect(contribution.fragmentFunctions).toContain('1.0 + lambdaV + lambdaL');
    expect(contribution.contributeIbl).toContain('flightAnisotropyReflection');
  });
});

describe('registerGlAnisotropyPbrExtension', () => {
  it('registers only the anisotropy extension kind', () => {
    const { state } = makeGlScene3DState();
    registerGlAnisotropyPbrExtension(state);
    expect(getGlPbrExtensionRegistration(state, AnisotropyPbrExtensionKind)).toBe(anisotropyPbrGlExtension);
  });
});
