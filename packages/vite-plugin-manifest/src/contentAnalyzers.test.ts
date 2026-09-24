import { deflateSync } from 'node:zlib';

import { sdkHostDecompressDeflate } from '@flighthq/compression/contract';
import { RequirementFacet } from '@flighthq/types/contract';

import { DEFAULT_CONTENT_ANALYZERS } from './contentAnalyzers';

// Regression for the downstream report: a CWS SWF and a deflate AWD analyzed to an EMPTY requirement
// set with no diagnostic, which is a bundle missing every handler the content needed. isReadable is
// what separates "requires nothing" from "could not be read".
describe('compressed content readability', () => {
  it('reports a CWS SWF as unreadable without a deflate capability, and readable with one', () => {
    const compressed = compressedSwf();
    expect(DEFAULT_CONTENT_ANALYZERS['.swf'].isReadable(compressed, NO_DECOMPRESSORS)).toBe(false);
    expect(
      DEFAULT_CONTENT_ANALYZERS['.swf'].isReadable(compressed, { deflate: sdkHostDecompressDeflate, lzma: null }),
    ).toBe(true);
  });

  it('still reads what a compressed SWF requires once a decompressor is supplied', () => {
    const set = DEFAULT_CONTENT_ANALYZERS['.swf'].analyze(compressedSwf(), {
      deflate: sdkHostDecompressDeflate,
      lzma: null,
    });
    expect(set.requirements.map((requirement) => requirement.key)).toEqual(['ShowFrame']);
  });

  it('reports an uncompressed file as readable, so the probe does not reject good content', () => {
    expect(DEFAULT_CONTENT_ANALYZERS['.swf'].isReadable(createSwfWithShowFrame(), NO_DECOMPRESSORS)).toBe(true);
    expect(DEFAULT_CONTENT_ANALYZERS['.awd'].isReadable(createAwd2WithCamera(), NO_DECOMPRESSORS)).toBe(true);
  });

  it('reports a truncated file as unreadable rather than as requiring nothing', () => {
    expect(DEFAULT_CONTENT_ANALYZERS['.swf'].isReadable(new Uint8Array([0x46]), NO_DECOMPRESSORS)).toBe(false);
    expect(DEFAULT_CONTENT_ANALYZERS['.awd'].isReadable(new Uint8Array([0x41]), NO_DECOMPRESSORS)).toBe(false);
  });
});

function createSwfWithShowFrame(): Uint8Array {
  const body = new Uint8Array([0x00, 0x00, 0x18, 0x01, 0x00, 0x40, 0x00, 0x00, 0x00]);
  const file = new Uint8Array(8 + body.length);
  file.set([0x46, 0x57, 0x53, 9], 0);
  new DataView(file.buffer).setUint32(4, file.length, true);
  file.set(body, 8);
  return file;
}

function createAwd2WithCamera(): Uint8Array {
  const file = new Uint8Array(12 + 11);
  file.set([0x41, 0x57, 0x44, 2, 1, 0, 0, 0], 0);
  const view = new DataView(file.buffer);
  view.setUint32(8, 11, true);
  view.setUint32(12, 1, true);
  file[16] = 0;
  file[17] = 42;
  file[18] = 0;
  view.setUint32(19, 0, true);
  return file;
}

const NO_DECOMPRESSORS = { deflate: null, lzma: null };

describe('DEFAULT_CONTENT_ANALYZERS', () => {
  it('covers the formats Flight analyzes, keyed by lowercase extension', () => {
    expect(Object.keys(DEFAULT_CONTENT_ANALYZERS).sort()).toEqual(['.awd', '.awd2', '.swf']);
  });

  it('is frozen, so one project cannot mutate the table another build reads', () => {
    expect(Object.isFrozen(DEFAULT_CONTENT_ANALYZERS)).toBe(true);
  });

  it('delegates to the SWF analyzer rather than reimplementing the walk', () => {
    const set = DEFAULT_CONTENT_ANALYZERS['.swf'].analyze(createSwfWithShowFrame(), NO_DECOMPRESSORS);
    expect(set.covers).toEqual([RequirementFacet.DocumentFormat]);
    expect(set.requirements).toEqual([{ facet: RequirementFacet.DocumentFormat, key: 'ShowFrame' }]);
  });

  it('accepts either AWD suffix, resolving both to the same analyzer', () => {
    const fromAwd = DEFAULT_CONTENT_ANALYZERS['.awd'].analyze(createAwd2WithCamera(), NO_DECOMPRESSORS);
    const fromAwd2 = DEFAULT_CONTENT_ANALYZERS['.awd2'].analyze(createAwd2WithCamera(), NO_DECOMPRESSORS);
    expect(fromAwd2.requirements).toEqual(fromAwd.requirements);
  });

  it('delegates to the AWD2 analyzer rather than reimplementing the walk', () => {
    const set = DEFAULT_CONTENT_ANALYZERS['.awd'].analyze(createAwd2WithCamera(), NO_DECOMPRESSORS);
    expect(set.covers).toEqual([RequirementFacet.DocumentFormat]);
    expect(set.requirements).toEqual([{ facet: RequirementFacet.DocumentFormat, key: 'Camera' }]);
  });

  it('reports an empty but covered set for content it cannot read', () => {
    const set = DEFAULT_CONTENT_ANALYZERS['.swf'].analyze(new Uint8Array(), NO_DECOMPRESSORS);
    expect(set.requirements).toEqual([]);
    expect(set.covers).toEqual([RequirementFacet.DocumentFormat]);
  });
});

// A real zlib-compressed SWF: 'CWS', version, total uncompressed length, then the deflated body.
function compressedSwf(): Uint8Array {
  const uncompressed = createSwfWithShowFrame();
  const body = new Uint8Array(deflateSync(Buffer.from(uncompressed.subarray(8))));
  const file = new Uint8Array(8 + body.length);
  file.set(uncompressed.subarray(0, 8), 0);
  file[0] = 0x43; // 'C' — zlib-compressed container
  file.set(body, 8);
  return file;
}
