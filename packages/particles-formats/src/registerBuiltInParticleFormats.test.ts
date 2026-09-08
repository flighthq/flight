import {
  LibgdxParticleFormatKind,
  ParticleDesignerFormatKind,
  PixiParticleFormatKind,
  SpineParticleFormatKind,
  StarlingPexFormatKind,
  UnityParticleFormatKind,
} from '@flighthq/types/contract';

import { getParticleFormatCodec, getRegisteredParticleFormats, unregisterParticleFormat } from './formatRegistry';
import { registerBuiltInParticleFormats } from './registerBuiltInParticleFormats';

const BUILT_IN_KINDS = [
  LibgdxParticleFormatKind,
  StarlingPexFormatKind,
  ParticleDesignerFormatKind,
  UnityParticleFormatKind,
  PixiParticleFormatKind,
  SpineParticleFormatKind,
] as const;

beforeEach(clearBuiltIns);
afterEach(clearBuiltIns);

describe('registerBuiltInParticleFormats', () => {
  it('installs every built-in codec in detection order only when called', () => {
    expect(getRegisteredParticleFormats()).toEqual([]);
    registerBuiltInParticleFormats();
    expect(getRegisteredParticleFormats()).toEqual(BUILT_IN_KINDS);
  });

  it('is idempotent', () => {
    registerBuiltInParticleFormats();
    registerBuiltInParticleFormats();
    expect(getRegisteredParticleFormats()).toEqual(BUILT_IN_KINDS);
  });

  it('exposes Pixi as parse-only and serializers for the other built-ins', () => {
    registerBuiltInParticleFormats();
    expect(getParticleFormatCodec(PixiParticleFormatKind)?.serialize).toBeUndefined();
    for (const kind of BUILT_IN_KINDS.filter((candidate) => candidate !== PixiParticleFormatKind)) {
      expect(getParticleFormatCodec(kind)?.serialize).toEqual(expect.any(Function));
    }
  });
});

function clearBuiltIns(): void {
  for (const kind of BUILT_IN_KINDS) unregisterParticleFormat(kind);
}
