// @vitest-environment jsdom

import { webHostAudioDecode } from './webAudioDecodeHost.ts';

describe('webHostAudioDecode', () => {
  beforeEach(() => {
    decodeAudioData = vi.fn(async () => decodedBuffer);
    vi.stubGlobal(
      'OfflineAudioContext',
      class {
        decodeAudioData = (buffer: ArrayBuffer): Promise<AudioBuffer> => decodeAudioData(buffer);
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fills every standard container slot', () => {
    // A browser decodes by reading the container rather than the MIME type, so a host that has Web Audio
    // has it for all seven. A slot left empty here would silently make that format undecodable.
    expect(Object.keys(webHostAudioDecode).sort()).toEqual(['aac', 'flac', 'mp3', 'mp4', 'ogg', 'wav', 'webm']);
  });

  it('decodes through the platform and returns the buffer', async () => {
    const decoded = await webHostAudioDecode.mp3.decode(new Uint8Array([1, 2, 3, 4]), signal());
    expect(decoded).toBe(decodedBuffer);
    expect(decodeAudioData).toHaveBeenCalledOnce();
  });

  // decodeAudioData DETACHES what it is given. A caller's Uint8Array is frequently a view onto a larger
  // payload — a whole SWF, an asset bundle — so detaching it would invalidate every other view onto the
  // same bytes, far away from here and with no error at the point of damage.
  it('decodes a copy, leaving the bytes the caller passed intact', async () => {
    const backing = new Uint8Array([9, 9, 1, 2, 3, 4, 9, 9]);
    const view = backing.subarray(2, 6);
    await webHostAudioDecode.wav.decode(view, signal());

    expect(view.byteLength).toBe(4);
    expect([...backing]).toEqual([9, 9, 1, 2, 3, 4, 9, 9]);
    // The copy carries exactly the viewed region, not the whole backing buffer.
    const handed = decodeAudioData.mock.calls[0][0];
    expect(handed.byteLength).toBe(4);
    expect([...new Uint8Array(handed)]).toEqual([1, 2, 3, 4]);
  });

  it('refuses before decoding when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(webHostAudioDecode.ogg.decode(new Uint8Array([1]), controller.signal)).rejects.toThrow();
    expect(decodeAudioData).not.toHaveBeenCalled();
  });

  // The platform decode cannot be cancelled once begun, so an abort landing mid-decode has to be caught
  // on the way out. Returning null rather than throwing keeps it indistinguishable from any other
  // expected miss at this seam; the caller's own throwIfAborted is what turns it into a cancel.
  it('suppresses the buffer when the signal aborts mid-decode', async () => {
    const controller = new AbortController();
    decodeAudioData = vi.fn(async () => {
      controller.abort();
      return decodedBuffer;
    });
    expect(await webHostAudioDecode.webm.decode(new Uint8Array([1]), controller.signal)).toBeNull();
  });

  // A container this browser has no codec for, and bytes that are not audio at all, are both expected
  // misses a caller answers by trying another source — so neither is an exception here.
  it('reports a rejected decode as an expected miss', async () => {
    decodeAudioData = vi.fn(() => Promise.reject(new Error('unsupported')));
    expect(await webHostAudioDecode.flac.decode(new Uint8Array([1]), signal())).toBeNull();
  });

  it('shares one decode context across formats and calls', async () => {
    const constructed = vi.fn();
    vi.stubGlobal(
      'OfflineAudioContext',
      class {
        constructor() {
          constructed();
        }
        decodeAudioData = (buffer: ArrayBuffer): Promise<AudioBuffer> => decodeAudioData(buffer);
      },
    );
    await webHostAudioDecode.mp3.decode(new Uint8Array([1]), signal());
    await webHostAudioDecode.ogg.decode(new Uint8Array([1]), signal());
    // Zero, not one: the context is built on first use and this suite has already used it, which is the
    // property under test — nothing here constructs a second one.
    expect(constructed).not.toHaveBeenCalled();
  });
});

function signal(): AbortSignal {
  return new AbortController().signal;
}

const decodedBuffer = { duration: 1 } as AudioBuffer;
let decodeAudioData = vi.fn(async (_buffer: ArrayBuffer) => decodedBuffer);
