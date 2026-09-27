import { deflateSync } from 'node:zlib';

import { sdkHostDecompressDeflate } from '@flighthq/compression/contract';
import { encodeUTF8 } from '@flighthq/encoding/contract';
import { MD2_HEADER_SIZE, MD2_MAGIC, MD2_VERSION } from '@flighthq/scene3d-formats/contract';
import { RequirementFacet } from '@flighthq/types/contract';

import { DEFAULT_CONTENT_ANALYZERS } from './contentAnalyzers.ts';

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
    expect(set.requirements.map((requirement) => requirement.key)).toContain('swf.DefineShape');
  });

  it('reports an uncompressed file as readable, so the probe does not reject good content', () => {
    expect(DEFAULT_CONTENT_ANALYZERS['.swf'].isReadable(createSwfWithDefineShape(), NO_DECOMPRESSORS)).toBe(true);
    expect(DEFAULT_CONTENT_ANALYZERS['.awd'].isReadable(createAwd2WithCamera(), NO_DECOMPRESSORS)).toBe(true);
  });

  it('reports a truncated file as unreadable rather than as requiring nothing', () => {
    expect(DEFAULT_CONTENT_ANALYZERS['.swf'].isReadable(new Uint8Array([0x46]), NO_DECOMPRESSORS)).toBe(false);
    expect(DEFAULT_CONTENT_ANALYZERS['.awd'].isReadable(new Uint8Array([0x41]), NO_DECOMPRESSORS)).toBe(false);
  });
});

describe('content-aware 3D analyzers', () => {
  describe('.3ds', () => {
    it('reports unreadable for truncated bytes', () => {
      expect(DEFAULT_CONTENT_ANALYZERS['.3ds'].isReadable(new Uint8Array([0x4d]), NO_DECOMPRESSORS)).toBe(false);
    });

    it('emits content-aware requirements for a valid file', () => {
      const set = DEFAULT_CONTENT_ANALYZERS['.3ds'].analyze(createMinimal3ds(), NO_DECOMPRESSORS);
      expect(set.covers).toContain(RequirementFacet.DocumentFormat);
    });
  });

  describe('.dae', () => {
    it('reports readable for a valid COLLADA document', () => {
      expect(DEFAULT_CONTENT_ANALYZERS['.dae'].isReadable(encodeUTF8(MINIMAL_COLLADA), NO_DECOMPRESSORS)).toBe(true);
    });

    it('reports unreadable for non-COLLADA XML', () => {
      expect(DEFAULT_CONTENT_ANALYZERS['.dae'].isReadable(encodeUTF8('<root/>'), NO_DECOMPRESSORS)).toBe(false);
    });

    it('emits geometry requirement for a COLLADA with geometry', () => {
      const set = DEFAULT_CONTENT_ANALYZERS['.dae'].analyze(encodeUTF8(FULL_COLLADA), NO_DECOMPRESSORS);
      expect(set.requirements).toContainEqual({ facet: RequirementFacet.DocumentFormat, key: 'dae.Geometry' });
    });

    it('emits fewer requirements for minimal content than for full content', () => {
      const minimal = DEFAULT_CONTENT_ANALYZERS['.dae'].analyze(encodeUTF8(MINIMAL_COLLADA), NO_DECOMPRESSORS);
      const full = DEFAULT_CONTENT_ANALYZERS['.dae'].analyze(encodeUTF8(FULL_COLLADA), NO_DECOMPRESSORS);
      expect(minimal.requirements.length).toBeLessThan(full.requirements.length);
    });
  });

  describe('.md2', () => {
    it('reports readable for a valid MD2 header', () => {
      expect(DEFAULT_CONTENT_ANALYZERS['.md2'].isReadable(buildMd2Header(1, 10, 0), NO_DECOMPRESSORS)).toBe(true);
    });

    it('reports unreadable for truncated bytes', () => {
      expect(DEFAULT_CONTENT_ANALYZERS['.md2'].isReadable(new Uint8Array(10), NO_DECOMPRESSORS)).toBe(false);
    });

    it('emits content-aware requirements for a mesh-only model', () => {
      const set = DEFAULT_CONTENT_ANALYZERS['.md2'].analyze(buildMd2Header(1, 10, 0), NO_DECOMPRESSORS);
      expect(set.requirements).toContainEqual({ facet: RequirementFacet.DocumentFormat, key: 'md2.Mesh' });
      expect(set.requirements.some((r) => r.key === 'md2.Material')).toBe(false);
    });

    it('emits more requirements for a full model than a minimal one', () => {
      const minimal = DEFAULT_CONTENT_ANALYZERS['.md2'].analyze(buildMd2Header(1, 1, 0), NO_DECOMPRESSORS);
      const full = DEFAULT_CONTENT_ANALYZERS['.md2'].analyze(buildMd2Header(10, 50, 1), NO_DECOMPRESSORS);
      expect(minimal.requirements.length).toBeLessThan(full.requirements.length);
    });
  });

  describe('.md5anim', () => {
    it('is registered in DEFAULT_CONTENT_ANALYZERS', () => {
      expect(DEFAULT_CONTENT_ANALYZERS['.md5anim']).toBeDefined();
    });

    it('reports readable for any text', () => {
      expect(DEFAULT_CONTENT_ANALYZERS['.md5anim'].isReadable(encodeUTF8(''), NO_DECOMPRESSORS)).toBe(true);
    });

    it('emits hierarchy requirement for md5anim with hierarchy', () => {
      const source = 'hierarchy {\n}\n';
      const set = DEFAULT_CONTENT_ANALYZERS['.md5anim'].analyze(encodeUTF8(source), NO_DECOMPRESSORS);
      expect(set.requirements).toContainEqual({ facet: RequirementFacet.DocumentFormat, key: 'md5.Hierarchy' });
    });

    it('emits more requirements for full anim than minimal', () => {
      const minimal = DEFAULT_CONTENT_ANALYZERS['.md5anim'].analyze(encodeUTF8('hierarchy {\n}\n'), NO_DECOMPRESSORS);
      const full = DEFAULT_CONTENT_ANALYZERS['.md5anim'].analyze(
        encodeUTF8('hierarchy {\n}\nframe 0 {\n}\n'),
        NO_DECOMPRESSORS,
      );
      expect(minimal.requirements.length).toBeLessThan(full.requirements.length);
    });
  });

  describe('.md5mesh', () => {
    it('reports readable for any text', () => {
      expect(DEFAULT_CONTENT_ANALYZERS['.md5mesh'].isReadable(encodeUTF8(''), NO_DECOMPRESSORS)).toBe(true);
    });

    it('emits skeleton requirement for md5mesh with joints', () => {
      const source = 'joints {\n}\n';
      const set = DEFAULT_CONTENT_ANALYZERS['.md5mesh'].analyze(encodeUTF8(source), NO_DECOMPRESSORS);
      expect(set.requirements).toContainEqual({ facet: RequirementFacet.DocumentFormat, key: 'md5.Skeleton' });
    });

    it('emits more requirements for full mesh than minimal', () => {
      const minimal = DEFAULT_CONTENT_ANALYZERS['.md5mesh'].analyze(encodeUTF8('joints {\n}\n'), NO_DECOMPRESSORS);
      const full = DEFAULT_CONTENT_ANALYZERS['.md5mesh'].analyze(
        encodeUTF8('joints {\n}\nmesh {\nshader "body"\n}\n'),
        NO_DECOMPRESSORS,
      );
      expect(minimal.requirements.length).toBeLessThan(full.requirements.length);
    });
  });

  describe('.obj', () => {
    it('reports readable for any text', () => {
      expect(DEFAULT_CONTENT_ANALYZERS['.obj'].isReadable(encodeUTF8(''), NO_DECOMPRESSORS)).toBe(true);
    });

    it('emits geometry requirement for OBJ with vertices and faces', () => {
      const source = 'v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n';
      const set = DEFAULT_CONTENT_ANALYZERS['.obj'].analyze(encodeUTF8(source), NO_DECOMPRESSORS);
      expect(set.requirements).toContainEqual({ facet: RequirementFacet.DocumentFormat, key: 'obj.Face' });
    });

    it('emits fewer requirements for empty content than a full model', () => {
      const empty = DEFAULT_CONTENT_ANALYZERS['.obj'].analyze(encodeUTF8(''), NO_DECOMPRESSORS);
      const full = DEFAULT_CONTENT_ANALYZERS['.obj'].analyze(
        encodeUTF8('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\nmtllib foo.mtl\nusemtl bar\n'),
        NO_DECOMPRESSORS,
      );
      expect(empty.requirements.length).toBeLessThan(full.requirements.length);
    });
  });
});

function createSwfWithDefineShape(): Uint8Array {
  const body = new Uint8Array([0x00, 0x00, 0x18, 0x01, 0x00, 0x80, 0x00, 0x00, 0x00]);
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
    expect(Object.keys(DEFAULT_CONTENT_ANALYZERS).sort()).toEqual([
      '.3ds',
      '.awd',
      '.awd2',
      '.dae',
      '.md2',
      '.md5anim',
      '.md5mesh',
      '.obj',
      '.riv',
      '.skel',
      '.swf',
    ]);
  });

  it('is frozen, so one project cannot mutate the table another build reads', () => {
    expect(Object.isFrozen(DEFAULT_CONTENT_ANALYZERS)).toBe(true);
  });

  it('delegates to the SWF analyzer rather than reimplementing the walk', () => {
    const set = DEFAULT_CONTENT_ANALYZERS['.swf'].analyze(createSwfWithDefineShape(), NO_DECOMPRESSORS);
    expect(set.covers).toContain(RequirementFacet.DocumentFormat);
    expect(set.requirements).toContainEqual({ facet: RequirementFacet.DocumentFormat, key: 'swf.DefineShape' });
  });

  it('accepts either AWD suffix, resolving both to the same analyzer', () => {
    const fromAwd = DEFAULT_CONTENT_ANALYZERS['.awd'].analyze(createAwd2WithCamera(), NO_DECOMPRESSORS);
    const fromAwd2 = DEFAULT_CONTENT_ANALYZERS['.awd2'].analyze(createAwd2WithCamera(), NO_DECOMPRESSORS);
    expect(fromAwd2.requirements).toEqual(fromAwd.requirements);
  });

  it('delegates to the AWD2 analyzer rather than reimplementing the walk', () => {
    const set = DEFAULT_CONTENT_ANALYZERS['.awd'].analyze(createAwd2WithCamera(), NO_DECOMPRESSORS);
    expect(set.covers).toEqual([RequirementFacet.DocumentFormat]);
    expect(set.requirements).toEqual([{ facet: RequirementFacet.DocumentFormat, key: 'awd2.Camera' }]);
  });

  it('reports an empty but covered set for content it cannot read', () => {
    const set = DEFAULT_CONTENT_ANALYZERS['.swf'].analyze(new Uint8Array(), NO_DECOMPRESSORS);
    expect(set.requirements).toEqual([]);
    expect(set.covers).toEqual([RequirementFacet.DocumentFormat]);
  });
});

// A real zlib-compressed SWF: 'CWS', version, total uncompressed length, then the deflated body.
function compressedSwf(): Uint8Array {
  const uncompressed = createSwfWithDefineShape();
  const body = new Uint8Array(deflateSync(Buffer.from(uncompressed.subarray(8))));
  const file = new Uint8Array(8 + body.length);
  file.set(uncompressed.subarray(0, 8), 0);
  file[0] = 0x43; // 'C' — zlib-compressed container
  file.set(body, 8);
  return file;
}

function buildMd2Header(numFrames: number, numTriangles: number, numSkins: number): Uint8Array {
  const buf = new ArrayBuffer(MD2_HEADER_SIZE);
  const view = new DataView(buf);
  view.setInt32(0, MD2_MAGIC, true);
  view.setInt32(4, MD2_VERSION, true);
  view.setInt32(20, numSkins, true);
  view.setInt32(32, numTriangles, true);
  view.setInt32(40, numFrames, true);
  return new Uint8Array(buf);
}

function createMinimal3ds(): Uint8Array {
  const file = new Uint8Array(12);
  const view = new DataView(file.buffer);
  view.setUint16(0, 0x4d4d, true);
  view.setUint32(2, 12, true);
  view.setUint16(6, 0x0002, true);
  view.setUint32(8, 10, true);
  return file;
}

const MINIMAL_COLLADA = [
  '<?xml version="1.0"?>',
  '<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">',
  '</COLLADA>',
].join('\n');

const FULL_COLLADA = [
  '<?xml version="1.0"?>',
  '<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">',
  '<library_geometries><geometry id="g"><mesh></mesh></geometry></library_geometries>',
  '<library_cameras><camera id="c"></camera></library_cameras>',
  '</COLLADA>',
].join('\n');

describe('OBJ material library references', () => {
  const analyzer = DEFAULT_CONTENT_ANALYZERS['.obj'];
  const obj = new TextEncoder().encode('mtllib a.mtl\nusemtl Red\nv 0 0 0\nf 1 1 1\n');

  it('declares the libraries it needs rather than reading them', () => {
    expect(analyzer.collectReferences?.(obj)).toEqual(['a.mtl']);
  });

  // ★ THE SAME OBJ, THREE ANSWERS, DECIDED ENTIRELY BY THE LIBRARY TEXT. That is the whole point of widening
  // the seam: the analyzer is still a pure function of text, and the precision comes from being handed one
  // more text rather than from it acquiring a filesystem.
  it('narrows the material model from the library text it is handed', () => {
    const classic = keysOf(analyzer.analyze(obj, NO_DECOMPRESSORS, ['newmtl Red\nKd 1 0 0\n']));
    expect(classic).toContain('obj.MaterialBlinnPhong');
    expect(classic).not.toContain('obj.MaterialStandardPbr');

    const pbr = keysOf(analyzer.analyze(obj, NO_DECOMPRESSORS, ['newmtl Red\nPr 0.3\n']));
    expect(pbr).toContain('obj.MaterialStandardPbr');
    expect(pbr).not.toContain('obj.MaterialBlinnPhong');

    const unknown = keysOf(analyzer.analyze(obj, NO_DECOMPRESSORS, []));
    expect(unknown).toContain('obj.MaterialBlinnPhong');
    expect(unknown).toContain('obj.MaterialStandardPbr');
  });

  it('is the only analyzer that needs a sibling file, so the rest stay pure two-argument reads', () => {
    for (const [extension, candidate] of Object.entries(DEFAULT_CONTENT_ANALYZERS)) {
      if (extension === '.obj') continue;
      expect(candidate.collectReferences, extension).toBeUndefined();
    }
  });
});

function keysOf(set: { requirements: readonly { key: string }[] }): readonly string[] {
  return set.requirements.map((requirement) => requirement.key);
}
