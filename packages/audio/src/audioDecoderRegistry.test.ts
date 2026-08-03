import type { AudioDecoder } from '@flighthq/types/contract';

import {
  getAudioDecoder,
  getAudioDecoderMimeTypes,
  hasAudioDecoder,
  registerAudioDecoder,
  unregisterAudioDecoder,
} from './audioDecoderRegistry';
import { createAudioResource } from './audioResource';

const decoder: AudioDecoder = async () => createAudioResource();

afterEach(() => {
  for (const mimeType of [...getAudioDecoderMimeTypes()]) unregisterAudioDecoder(mimeType);
});

describe('getAudioDecoder', () => {
  it('returns null for an unregistered type rather than throwing', () => {
    expect(getAudioDecoder('audio/vnd.acme.nothing')).toBeNull();
  });

  it('matches a registration regardless of the parameters the caller carries', () => {
    registerAudioDecoder('audio/vnd.adobe.swf-adpcm', decoder);
    // A container tags every sound with the parameters that sound needs, so a registry keyed on the whole
    // string would miss every one of them.
    expect(getAudioDecoder('audio/vnd.adobe.swf-adpcm; rate=22050; channels=1')).toBe(decoder);
    expect(getAudioDecoder('AUDIO/VND.ADOBE.SWF-ADPCM')).toBe(decoder);
  });
});

describe('getAudioDecoderMimeTypes', () => {
  it('is empty until something registers', () => {
    expect(getAudioDecoderMimeTypes()).toEqual([]);
  });

  it('snapshots the registered essences and cannot be mutated into the registry', () => {
    registerAudioDecoder('audio/vnd.adobe.swf-adpcm; rate=8000', decoder);
    const types = getAudioDecoderMimeTypes();
    expect(types).toEqual(['audio/vnd.adobe.swf-adpcm']);
    (types as string[]).push('audio/fake');
    expect(getAudioDecoderMimeTypes()).toEqual(['audio/vnd.adobe.swf-adpcm']);
  });
});

describe('hasAudioDecoder', () => {
  it('reports registration by essence', () => {
    expect(hasAudioDecoder('audio/vnd.acme.thing')).toBe(false);
    registerAudioDecoder('audio/vnd.acme.thing', decoder);
    expect(hasAudioDecoder('audio/vnd.acme.thing; rate=1')).toBe(true);
  });
});

describe('registerAudioDecoder', () => {
  it('lets a later registration win so a host can override a default', () => {
    const replacement: AudioDecoder = async () => createAudioResource();
    registerAudioDecoder('audio/vnd.acme.thing', decoder);
    registerAudioDecoder('audio/vnd.acme.thing', replacement);
    expect(getAudioDecoder('audio/vnd.acme.thing')).toBe(replacement);
  });
});

describe('unregisterAudioDecoder', () => {
  it('removes a registration by essence', () => {
    registerAudioDecoder('audio/vnd.acme.thing', decoder);
    unregisterAudioDecoder('audio/vnd.acme.thing; rate=2');
    expect(hasAudioDecoder('audio/vnd.acme.thing')).toBe(false);
  });

  it('is a no-op for a type that was never registered', () => {
    expect(() => unregisterAudioDecoder('audio/missing')).not.toThrow();
  });
});
