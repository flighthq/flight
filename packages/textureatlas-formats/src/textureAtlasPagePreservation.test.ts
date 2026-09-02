import { createTextureAtlas } from '@flighthq/textureatlas/contract';

import * as contract from './contract';
import { parseTextureAtlasAsepriteJson } from './textureAtlasAsepriteParse';
import { parseTextureAtlasLibgdxAtlas } from './textureAtlasLibgdxParse';
import { parseTextureAtlasStarlingXml } from './textureAtlasStarlingParse';
import { parseTexturePackerAtlasJson } from './texturePackerAtlasParse';

describe('texture atlas format naming', () => {
  it('spells TexturePacker in full on every export, so a reader searching the product name finds them', () => {
    const exported = Object.keys(contract).sort();
    expect(exported).toContain('parseTexturePackerAtlasJson');
    expect(exported).toContain('parseTexturePackerAtlasDocument');
    // The abbreviation is gone outright rather than kept beside the full name: a parallel deprecated
    // spelling would leave the grep that misses these functions still missing them.
    expect(exported.filter((name) => /Packer/.test(name) && !/TexturePacker/.test(name))).toEqual([]);
  });

  it('keeps every other atlas export naming the type it operates on', () => {
    const exported = Object.keys(contract);
    for (const name of exported.filter((candidate) => candidate.startsWith('parse'))) {
      expect(name).toMatch(/TextureAtlas|TexturePackerAtlas/);
    }
  });
});

// The page and meta fields these formats carry were parsed into the schemas and then dropped on the
// floor. A consumer that has the atlas is the one that needs them — to fetch the page bitmap, to
// rescale coordinates, and to compute UVs — so they belong on the atlas and region types.
describe('texture atlas page and meta preservation', () => {
  it('keeps the TexturePacker page image name, size, and scale on the atlas', () => {
    const atlas = createTextureAtlas();
    parseTexturePackerAtlasJson(
      JSON.stringify({
        frames: { 'hero.png': { frame: { h: 8, w: 4, x: 1, y: 2 }, rotated: false, trimmed: false } },
        meta: { image: 'sheet.png', scale: '0.5', size: { h: 128, w: 256 } },
      }),
      atlas,
    );
    expect(atlas.imageName).toBe('sheet.png');
    expect(atlas.imageWidth).toBe(256);
    expect(atlas.imageHeight).toBe(128);
    expect(atlas.scale).toBe(0.5);
  });

  it('keeps the Aseprite page image name and size on the atlas', () => {
    const atlas = createTextureAtlas();
    parseTextureAtlasAsepriteJson(
      JSON.stringify({
        frames: { 'walk 0.ase': { frame: { h: 8, w: 4, x: 0, y: 0 }, rotated: false, trimmed: false } },
        meta: { app: 'http://www.aseprite.org/', image: 'walk.png', size: { h: 32, w: 64 } },
      }),
      atlas,
    );
    expect(atlas.imageName).toBe('walk.png');
    expect(atlas.imageWidth).toBe(64);
    expect(atlas.imageHeight).toBe(32);
  });

  it('keeps the libGDX first page image name on the atlas and every page name on its regions', () => {
    // A multi-page libGDX atlas concatenates its regions, so without a per-region page the caller
    // cannot tell which image any region belongs to — the exact information the parser discarded.
    const atlas = createTextureAtlas();
    parseTextureAtlasLibgdxAtlas(
      [
        'pages0.png',
        'size: 64,64',
        'format: RGBA8888',
        'alpha',
        '  xy: 0, 0',
        '  size: 8, 8',
        '',
        'pages1.png',
        'size: 32,32',
        'beta',
        '  xy: 2, 2',
        '  size: 4, 4',
        '',
      ].join('\n'),
      atlas,
    );
    expect(atlas.imageName).toBe('pages0.png');
    expect(atlas.regions.map((region) => region.name)).toEqual(['alpha', 'beta']);
    expect(atlas.regions.map((region) => region.pageName)).toEqual(['pages0.png', 'pages1.png']);
  });

  it('leaves the atlas meta at its unknown defaults for a format that carries none', () => {
    // Starling XML genuinely has no atlas-level metadata. The defaults have to say "unknown" rather
    // than a plausible-looking zero-by-zero image that a UV caller would divide by.
    const atlas = createTextureAtlas();
    parseTextureAtlasStarlingXml(
      '<TextureAtlas imagePath="s.png"><SubTexture name="a" x="0" y="0" width="4" height="4"/></TextureAtlas>',
      atlas,
    );
    expect(atlas.imageWidth).toBe(0);
    expect(atlas.imageHeight).toBe(0);
    expect(atlas.scale).toBe(1);
    expect(atlas.regions[0].pageName).toBeNull();
  });

  it('resets stale meta when the same atlas is reparsed', () => {
    // Parsers clear regions before filling them; the meta has to be cleared on the same terms or a
    // second parse leaves the previous document's page name attached to the new regions.
    const atlas = createTextureAtlas();
    parseTexturePackerAtlasJson(
      JSON.stringify({
        frames: {},
        meta: { image: 'first.png', scale: '2', size: { h: 16, w: 16 } },
      }),
      atlas,
    );
    parseTexturePackerAtlasJson(JSON.stringify({ frames: {} }), atlas);
    expect(atlas.imageName).toBeNull();
    expect(atlas.imageWidth).toBe(0);
    expect(atlas.scale).toBe(1);
  });
});
