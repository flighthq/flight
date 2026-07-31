import { createIridescencePbrExtension } from '@flighthq/materials/contract';
import { IridescencePbrExtensionKind } from '@flighthq/types/contract';

import { getGlPbrExtensionRegistration } from './glPbrExtensionRegistry';
import { makeGlScene3DState } from './glScene3DTestHelper';
import { iridescencePbrGlExtension, registerGlIridescencePbrExtension } from './iridescencePbrGlExtension';

describe('iridescencePbrGlExtension', () => {
  it('contributes thin-film surface source', () => {
    const contribution = iridescencePbrGlExtension.createShaderContribution(
      { hasTransmissionSceneColor: () => false, isTextureReady: () => false },
      createIridescencePbrExtension(),
    );
    expect(contribution.applySurface).toContain('flightIridescentFresnel');
  });
});

describe('registerGlIridescencePbrExtension', () => {
  it('registers only the iridescence extension kind', () => {
    const { state } = makeGlScene3DState();
    registerGlIridescencePbrExtension(state);
    expect(getGlPbrExtensionRegistration(state, IridescencePbrExtensionKind)).toBe(iridescencePbrGlExtension);
  });
});
