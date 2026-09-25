import { createTransmissionVolumePbrExtension } from '@flighthq/materials/contract';
import { TransmissionVolumePbrExtensionKind } from '@flighthq/types/contract';

import { getGlPbrExtensionRegistration } from './glPbrExtensionRegistry.ts';
import { makeGlScene3DState } from './glScene3DTestHelper.ts';
import {
  registerGlTransmissionVolumePbrExtension,
  transmissionVolumePbrGlExtension,
} from './transmissionVolumePbrGlExtension.ts';

describe('registerGlTransmissionVolumePbrExtension', () => {
  it('registers only the transmission-volume kind', () => {
    const { state } = makeGlScene3DState();
    registerGlTransmissionVolumePbrExtension(state);
    expect(getGlPbrExtensionRegistration(state, TransmissionVolumePbrExtensionKind)).toBe(
      transmissionVolumePbrGlExtension,
    );
  });
});

describe('transmissionVolumePbrGlExtension', () => {
  it('contributes projected refraction and Beer-Lambert absorption when scene color is supplied', () => {
    const contribution = transmissionVolumePbrGlExtension.createShaderContribution(
      { hasTransmissionSceneColor: () => true, isTextureReady: () => false },
      createTransmissionVolumePbrExtension(),
    );
    expect(contribution.finalize).toContain('refract');
    expect(contribution.finalize).toContain('v_worldPosition');
    expect(contribution.finalize).toContain('flightTransmissionAbsorption');
  });
});
