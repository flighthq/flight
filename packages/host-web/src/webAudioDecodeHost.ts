import type { HostAudioDecodeCapabilities, HostAudioDecodeFormatCapability } from '@flighthq/types/contract';

// Web Audio decodes every standard container the browser ships a codec for, and it content-sniffs rather
// than reading a MIME type, so one capability serves all seven slots. They are still seven named slots
// rather than one: which formats a browser actually supports differs between engines, and a host that
// wanted to withhold one would do it by leaving that slot empty.

const decodeWithWebAudio: HostAudioDecodeFormatCapability = {
  async decode(bytes: Readonly<Uint8Array>, signal: AbortSignal): Promise<AudioBuffer | null> {
    signal.throwIfAborted();
    // decodeAudioData DETACHES the buffer it is given, so it gets a copy of just the viewed region. A
    // caller's Uint8Array is frequently a view onto a larger payload — a whole SWF, an asset bundle —
    // and detaching that would invalidate every other view onto the same bytes.
    const copy = bytes.slice();
    const buffer = copy.buffer as ArrayBuffer;
    try {
      const decoded = await decodeContext().decodeAudioData(buffer);
      // decodeAudioData cannot be cancelled once begun, so an abort that lands mid-decode has to suppress
      // the result here. Returning null rather than throwing keeps an abort indistinguishable from any
      // other expected miss at this seam; the caller's own throwIfAborted is what turns it into a cancel.
      return signal.aborted ? null : decoded;
    } catch {
      // A container this browser has no codec for, or bytes that are not audio at all. Both are expected
      // misses the caller distinguishes by trying another source, so neither is an exception here.
      return null;
    }
  },
};

// One decode context for the process, built on first use and never closed.
//
// Built lazily because constructing an AudioContext at module scope would violate the package's
// side-effect-free contract, and because some engines warn or refuse before a user gesture. Never closed
// because AudioBuffers outlive the context that produced them — closing it to reclaim the handle would
// buy nothing and risk invalidating decodes still in flight.
//
// OfflineAudioContext rather than AudioContext: decoding needs no output device, and asking for one
// pulls in autoplay policy and an audio thread that a caller who only wants samples never uses.
function decodeContext(): BaseAudioContext {
  _decodeContext ??= new OfflineAudioContext({ length: 1, numberOfChannels: 1, sampleRate: 44100 });
  return _decodeContext;
}

let _decodeContext: BaseAudioContext | null = null;

export const webHostAudioDecode = {
  aac: decodeWithWebAudio,
  flac: decodeWithWebAudio,
  mp3: decodeWithWebAudio,
  mp4: decodeWithWebAudio,
  ogg: decodeWithWebAudio,
  wav: decodeWithWebAudio,
  webm: decodeWithWebAudio,
} as const satisfies HostAudioDecodeCapabilities;
