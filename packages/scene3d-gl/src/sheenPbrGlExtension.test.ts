import { createSheenPbrExtension } from '@flighthq/materials/contract';
import { SheenPbrExtensionKind } from '@flighthq/types/contract';

import { getGlPbrExtensionRegistration } from './glPbrExtensionRegistry';
import { makeGlScene3DState } from './glScene3DTestHelper';
import { registerGlSheenPbrExtension, sheenPbrGlExtension } from './sheenPbrGlExtension';

describe('registerGlSheenPbrExtension', () => {
  it('registers only the sheen extension kind', () => {
    const { state } = makeGlScene3DState();
    registerGlSheenPbrExtension(state);
    expect(getGlPbrExtensionRegistration(state, SheenPbrExtensionKind)).toBe(sheenPbrGlExtension);
  });
});

describe('sheenPbrGlExtension', () => {
  it('contributes Charlie sheen to punctual and IBL lighting', () => {
    const contribution = sheenPbrGlExtension.createShaderContribution(
      { hasTransmissionSceneColor: () => false, isTextureReady: () => false },
      createSheenPbrExtension(),
    );
    expect(contribution.contributePunctual).toContain('flightDistributionCharlie');
    expect(contribution.contributeIbl).toContain('u_iblPrefiltered');
  });
});
