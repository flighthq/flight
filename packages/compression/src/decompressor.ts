import type { Compression, Decompressor } from '@flighthq/types/contract';

// The one registry every container format resolves through. A caller registers an algorithm once and
// every consumer that carries a compressed body — SWF's `CWS`/`ZWS`, AWD2's compressed blocks, anything
// added later — can read it, rather than each format owning a private registry keyed by its own
// vocabulary and asking the caller to register the same function twice.
//
// It starts empty and is only ever filled by an explicit `register*` call, so importing a codec module
// registers nothing and a build that never decompresses pays for no codec. Registration is
// last-write-wins, which is what lets a host replace a portable decoder with a native or wasm one.
export function getDecompressor(compression: Compression): Decompressor | null {
  return _decompressors.get(compression) ?? null;
}

export function hasDecompressor(compression: Compression): boolean {
  return _decompressors.has(compression);
}

export function registerDecompressor(compression: Compression, decompress: Decompressor): void {
  _decompressors.set(compression, decompress);
}

export function unregisterDecompressor(compression: Compression): void {
  _decompressors.delete(compression);
}

const _decompressors = new Map<Compression, Decompressor>();
