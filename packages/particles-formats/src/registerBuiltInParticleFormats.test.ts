import {
  LibgdxParticleFormatKind,
  ParticleDesignerFormatKind,
  PixiParticleFormatKind,
  SpineParticleFormatKind,
  StarlingPexFormatKind,
  UnityParticleFormatKind,
} from '@flighthq/types/contract';

import { detectParticleFormat } from './detect.ts';
import { getParticleFormatCodec, getRegisteredParticleFormats, unregisterParticleFormat } from './formatRegistry.ts';
import {
  applyParticleImportOptions,
  libgdxParticleFormat,
  particleAllFormats,
  registerBuiltInParticleFormats,
  spineParticleFormat,
  unityParticleFormat,
} from './registerBuiltInParticleFormats.ts';

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

describe('applyParticleImportOptions', () => {
  // ★ A SUBSET INSTALLS ONLY WHAT IT NAMES. This is the whole point of the descriptor list: a build whose
  // content is one format should not carry the codecs for the other five, nor the parse modules behind them.
  it('installs only the formats named, in the order given', () => {
    applyParticleImportOptions({ formats: [spineParticleFormat, libgdxParticleFormat] });
    expect(getRegisteredParticleFormats()).toEqual([SpineParticleFormatKind, LibgdxParticleFormatKind]);
  });

  it('installs nothing for empty options, rather than falling back to the built-ins', () => {
    applyParticleImportOptions({});
    expect(getRegisteredParticleFormats()).toEqual([]);
  });

  // ★ LIST ORDER IS DETECTION ORDER, and this is where that is observable: Unity and Spine both accept a JSON
  // object carrying both of their discriminants, so whichever is installed first wins. Asserted in BOTH
  // directions, because one direction alone would also pass if order were ignored.
  it('makes list order decide which codec wins for a document both accept', () => {
    const both = JSON.stringify({ continuous: true, startLifetime: { mode: 'TwoConstants' } });
    applyParticleImportOptions({ formats: [unityParticleFormat, spineParticleFormat] });
    expect(detectParticleFormat(both)).toBe(UnityParticleFormatKind);
    clearBuiltIns();
    applyParticleImportOptions({ formats: [spineParticleFormat, unityParticleFormat] });
    expect(detectParticleFormat(both)).toBe(SpineParticleFormatKind);
  });

  it('pairs each descriptor with the kind it registers under', () => {
    for (const format of particleAllFormats) {
      applyParticleImportOptions({ formats: [format] });
      expect(getRegisteredParticleFormats()).toEqual([format.kind]);
      expect(getParticleFormatCodec(format.kind)).toBe(format.codec);
      clearBuiltIns();
    }
  });
});

describe('particleAllFormats', () => {
  // The preset has to BE the built-in registration, or a caller who "selected everything" would get a different
  // parse from the zero-config path. Compared on kinds AND order, which is what detection depends on.
  it('installs exactly what registerBuiltInParticleFormats installs, in the same order', () => {
    applyParticleImportOptions({ formats: particleAllFormats });
    const fromPreset = getRegisteredParticleFormats();
    clearBuiltIns();
    registerBuiltInParticleFormats();
    expect(fromPreset).toEqual(getRegisteredParticleFormats());
    expect(fromPreset).toEqual(BUILT_IN_KINDS);
  });

  it('carries each codec identity, so a row naming a descriptor names the real codec', () => {
    registerBuiltInParticleFormats();
    for (const format of particleAllFormats) {
      expect(getParticleFormatCodec(format.kind)).toBe(format.codec);
    }
  });
});

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
