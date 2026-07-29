import { createWrappedDiffusePbrExtension } from '@flighthq/materials/contract';
import { WrappedDiffusePbrExtensionKind } from '@flighthq/types/contract';

import { getGlPbrExtensionRegistration } from './glPbrExtensionRegistry';
import { makeGlScene3DState } from './glScene3DTestHelper';
import { registerWrappedDiffusePbrGlExtension, wrappedDiffusePbrGlExtension } from './wrappedDiffusePbrGlExtension';

describe('registerWrappedDiffusePbrGlExtension', () => {
  it('registers the honestly named wrapped-diffuse kind', () => {
    const { state } = makeGlScene3DState();
    registerWrappedDiffusePbrGlExtension(state);
    expect(getGlPbrExtensionRegistration(state, WrappedDiffusePbrExtensionKind)).toBe(wrappedDiffusePbrGlExtension);
  });
});

describe('wrappedDiffusePbrGlExtension', () => {
  it('contributes wrapped diffuse to punctual and IBL lighting', () => {
    const contribution = wrappedDiffusePbrGlExtension.createShaderContribution(
      { hasTransmissionSceneColor: () => false, isTextureReady: () => false },
      createWrappedDiffusePbrExtension(),
    );
    expect(contribution.contributePunctual).toContain('flightWrap');
    expect(contribution.contributeIbl).toContain('flightWrappedIblStrength');
  });
});
