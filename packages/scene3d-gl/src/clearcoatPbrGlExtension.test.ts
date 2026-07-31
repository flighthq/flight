import { createClearcoatPbrExtension } from '@flighthq/materials/contract';
import { ClearcoatPbrExtensionKind } from '@flighthq/types/contract';

import { clearcoatPbrGlExtension, registerGlClearcoatPbrExtension } from './clearcoatPbrGlExtension';
import { getGlPbrExtensionRegistration } from './glPbrExtensionRegistry';
import { makeGlScene3DState } from './glScene3DTestHelper';

describe('clearcoatPbrGlExtension', () => {
  it('contributes energy-conserving punctual and IBL clearcoat source', () => {
    const contribution = clearcoatPbrGlExtension.createShaderContribution(
      { hasTransmissionSceneColor: () => false, isTextureReady: () => false },
      createClearcoatPbrExtension(),
    );
    expect(contribution.contributePunctual).toContain('direct * (1.0 - flightClearcoatF)');
    expect(contribution.contributeIbl).toContain('ambient * (1.0 - flightClearcoatF)');
  });
});

describe('registerGlClearcoatPbrExtension', () => {
  it('registers only the clearcoat extension kind', () => {
    const { state } = makeGlScene3DState();
    registerGlClearcoatPbrExtension(state);
    expect(getGlPbrExtensionRegistration(state, ClearcoatPbrExtensionKind)).toBe(clearcoatPbrGlExtension);
  });
});
