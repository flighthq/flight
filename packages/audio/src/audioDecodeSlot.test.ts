import type { HostAudioDecodeCapabilities, HostAudioDecodeFormatCapability } from '@flighthq/types/contract';

import { getAudioDecodeSlot, hasAudioDecodeSlot } from './audioDecodeSlot.ts';

describe('getAudioDecodeSlot', () => {
  it('routes each standard container to its own slot', () => {
    const slots = namedSlots();
    const capabilities = slots as unknown as HostAudioDecodeCapabilities;
    expect(getAudioDecodeSlot(capabilities, 'audio/aac')).toBe(slots.aac);
    expect(getAudioDecodeSlot(capabilities, 'audio/flac')).toBe(slots.flac);
    expect(getAudioDecodeSlot(capabilities, 'audio/mpeg')).toBe(slots.mp3);
    expect(getAudioDecodeSlot(capabilities, 'audio/mp4')).toBe(slots.mp4);
    expect(getAudioDecodeSlot(capabilities, 'audio/ogg')).toBe(slots.ogg);
    expect(getAudioDecodeSlot(capabilities, 'audio/wav')).toBe(slots.wav);
    expect(getAudioDecodeSlot(capabilities, 'audio/webm')).toBe(slots.webm);
  });

  // One codec, several registered spellings. A caller hands us whatever their server or container said,
  // and none of these are wrong, so the slot set does not grow a member per synonym.
  it('accepts the alternate spellings of a format', () => {
    const slots = namedSlots();
    const capabilities = slots as unknown as HostAudioDecodeCapabilities;
    expect(getAudioDecodeSlot(capabilities, 'audio/mp3')).toBe(slots.mp3);
    expect(getAudioDecodeSlot(capabilities, 'audio/x-mpeg')).toBe(slots.mp3);
    expect(getAudioDecodeSlot(capabilities, 'audio/x-wav')).toBe(slots.wav);
    expect(getAudioDecodeSlot(capabilities, 'audio/vnd.wave')).toBe(slots.wav);
    expect(getAudioDecodeSlot(capabilities, 'audio/x-flac')).toBe(slots.flac);
    expect(getAudioDecodeSlot(capabilities, 'audio/x-m4a')).toBe(slots.mp4);
    expect(getAudioDecodeSlot(capabilities, 'application/ogg')).toBe(slots.ogg);
  });

  // The type arrives with its parameters attached — a rate, a codecs list — and the slot is chosen by the
  // essence, because the parameters describe the stream rather than which decoder reads it.
  it('ignores MIME parameters and casing', () => {
    const slots = namedSlots();
    const capabilities = slots as unknown as HostAudioDecodeCapabilities;
    expect(getAudioDecodeSlot(capabilities, 'audio/mp4; codecs="mp4a.40.2"')).toBe(slots.mp4);
    expect(getAudioDecodeSlot(capabilities, '  AUDIO/OGG ; rate=48000')).toBe(slots.ogg);
  });

  it('returns the sentinel for a type outside the standard set', () => {
    expect(
      getAudioDecodeSlot(namedSlots() as unknown as HostAudioDecodeCapabilities, 'audio/vnd.adobe.swf-adpcm'),
    ).toBeNull();
  });

  // A format nothing can read and a format nobody supplied a reader for are deliberately one answer: from
  // the decode path's side they lead to the same place.
  it('returns the sentinel for a standard type whose slot the host left empty', () => {
    expect(getAudioDecodeSlot({}, 'audio/mpeg')).toBeNull();
  });
});

describe('hasAudioDecodeSlot', () => {
  it('reports whether a type resolves to a filled slot', () => {
    const capabilities: HostAudioDecodeCapabilities = { ogg: { decode: async () => null } };
    expect(hasAudioDecodeSlot(capabilities, 'audio/ogg')).toBe(true);
    expect(hasAudioDecodeSlot(capabilities, 'audio/mpeg')).toBe(false);
    expect(hasAudioDecodeSlot(capabilities, 'audio/vnd.acme.custom')).toBe(false);
  });
});

// A distinct object per slot, so a test that asserts which slot answered cannot be satisfied by any other.
function namedSlots(): Record<string, HostAudioDecodeFormatCapability> {
  const slot = (): HostAudioDecodeFormatCapability => ({ decode: async () => null });
  return { aac: slot(), flac: slot(), mp3: slot(), mp4: slot(), ogg: slot(), wav: slot(), webm: slot() };
}
