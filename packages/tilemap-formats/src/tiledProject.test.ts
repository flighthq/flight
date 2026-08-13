import type { ImportDiagnostic, TiledTilesetResolver } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { buildTilemapLayersFromTiled } from './tiledProject';
import { parseTiledTmx } from './tiledXmlParse';

function mapWithLayerData(data: string): ReturnType<typeof parseTiledTmx> {
  return parseTiledTmx(
    '<map version="1" width="2" height="2" tilewidth="16" tileheight="16">' +
      '<tileset firstgid="1" source="a.tsx"/>' +
      '<tileset firstgid="5" source="b.tsx"/>' +
      `<layer id="1" name="g" width="2" height="2"><data encoding="csv">${data}</data></layer>` +
      '<objectgroup id="2" name="o"><object id="1" x="0" y="0"/></objectgroup>' +
      '</map>',
  );
}

const tilesetA = { atlas: null, tileHeight: 16, tileWidth: 16 };
const tilesetB = { atlas: null, tileHeight: 16, tileWidth: 16 };

const resolve: TiledTilesetResolver = (ref) => {
  if (ref.firstGid === 1) return tilesetA;
  if (ref.firstGid === 5) return tilesetB;
  return null;
};

describe('buildTilemapLayersFromTiled', () => {
  // A clean parse is two claims: the values are right AND THE PROJECTION IS NOT COMPLAINING. Every other
  // test here checks the first. This checks the second — the one that catches a layer that projected into
  // plausible-looking tile arrays while quietly reporting that it could not place some of them.
  it('raises no diagnostic at all for a well-formed layer', () => {
    const diagnostics: ImportDiagnostic[] = [];

    buildTilemapLayersFromTiled(mapWithLayerData('1,2,1,2')!, 0, resolve, diagnostics);

    const complaints = diagnostics.map((diagnostic) => diagnostic.kind);
    expect(complaints, `a good Tiled layer made the projection complain: ${complaints.join(', ')}`).toEqual([]);
  });

  it('splits a two-tileset layer into one TilemapData per tileset with local ids', () => {
    const map = mapWithLayerData('1,5,2147483649,6')!;
    const result = buildTilemapLayersFromTiled(map, 0, resolve)!;
    expect(result).toHaveLength(2);

    expect(result[0]).toMatchObject(tilesetA);
    // Cell 2's GID has the flip bit set; its tile id (1) still resolves to tileset A as local id 0.
    expect(Array.from(result[0].tiles)).toEqual([0, -1, 0, -1]);

    expect(result[1]).toMatchObject(tilesetB);
    expect(Array.from(result[1].tiles)).toEqual([-1, 0, -1, 1]);
    expect(result[1].columns).toBe(2);
    expect(result[1].rows).toBe(2);
  });

  it('returns a one-element array for a single-tileset layer', () => {
    const map = mapWithLayerData('1,2,1,2')!;
    const result = buildTilemapLayersFromTiled(map, 0, resolve)!;
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject(tilesetA);
    expect(Array.from(result[0].tiles)).toEqual([0, 1, 0, 1]);
  });

  it('leaves an unresolved tileset empty while projecting the resolved one', () => {
    const map = mapWithLayerData('1,5,1,5')!;
    const onlyA: TiledTilesetResolver = (ref) => (ref.firstGid === 1 ? tilesetA : null);
    const result = buildTilemapLayersFromTiled(map, 0, onlyA)!;
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject(tilesetA);
    expect(Array.from(result[0].tiles)).toEqual([0, -1, 0, -1]);
  });

  it('reports the tiles an unresolved tileset left empty instead of dropping them silently', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const map = mapWithLayerData('1,5,1,5')!;
    const onlyA: TiledTilesetResolver = (ref) => (ref.firstGid === 1 ? tilesetA : null);
    const result = buildTilemapLayersFromTiled(map, 0, onlyA, diagnostics)!;

    // The projection SUCCEEDS and the grid looks complete — the holes are -1 cells that no count
    // distinguishes from genuinely empty ones, which is what earns the crumb.
    expect(Array.from(result[0].tiles)).toEqual([0, -1, 0, -1]);
    expect(diagnostics).toMatchObject([
      { detail: { cells: 2, layerIndex: 0, tilesets: 1 }, kind: 'tiled.tileset-unresolved', severity: 'Drop' },
    ]);
  });

  it('reports a tile whose gid falls outside every declared tileset', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const map = parseTiledTmx(
      '<map version="1" width="2" height="1" tilewidth="16" tileheight="16">' +
        '<tileset firstgid="5" source="b.tsx"/>' +
        '<layer id="1" name="g" width="2" height="1"><data encoding="csv">1,5</data></layer>' +
        '</map>',
    )!;
    buildTilemapLayersFromTiled(map, 0, () => tilesetA, diagnostics);

    expect(diagnostics).toMatchObject([
      { detail: { cells: 1, layerIndex: 0 }, kind: 'tiled.tile-outside-every-tileset', severity: 'Drop' },
    ]);
  });

  it('reports once for a whole layer rather than once per cell', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const map = mapWithLayerData('5,5,5,5')!;
    const onlyA: TiledTilesetResolver = (ref) => (ref.firstGid === 1 ? tilesetA : null);
    buildTilemapLayersFromTiled(map, 0, onlyA, diagnostics);

    // A layer is width x height cells, so a per-cell crumb would drown the report it is making. The
    // count carries the scale instead.
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.detail).toMatchObject({ cells: 4 });
  });

  it('stays silent for a layer whose tilesets all resolve', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const map = mapWithLayerData('1,5,1,5')!;
    const result = buildTilemapLayersFromTiled(map, 0, resolve, diagnostics)!;

    // Asserting the projected tiles keeps the silence from being vacuous.
    expect(result).toHaveLength(2);
    expect(diagnostics).toEqual([]);
  });

  it('returns null when no referenced tileset resolves', () => {
    const map = mapWithLayerData('1,5,2147483649,6')!;
    expect(buildTilemapLayersFromTiled(map, 0, () => null)).toBeNull();
  });

  it('returns null for a non-tile layer or an out-of-range index', () => {
    const map = mapWithLayerData('1,5,2147483649,6')!;
    expect(buildTilemapLayersFromTiled(map, 1, resolve)).toBeNull();
    expect(buildTilemapLayersFromTiled(map, 9, resolve)).toBeNull();
  });
});
