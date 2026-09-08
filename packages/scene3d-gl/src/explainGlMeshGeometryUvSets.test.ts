import { createMeshGeometry } from '@flighthq/mesh/contract';
import type { PbrUvSet, VertexAttribute, VertexSemantic } from '@flighthq/types/contract';

import { explainGlMeshGeometryUvSets } from './explainGlMeshGeometryUvSets';

// One float32x2 per named semantic, which is all this query reads — it looks only at which semantics
// the layout carries, never at the vertex data itself.
function geometryWith(semantics: readonly VertexSemantic[]) {
  const attributes = semantics.map(
    (semantic, index): VertexAttribute => ({ byteOffset: index * 8, format: 'float32x2', semantic }),
  );
  const stride = semantics.length * 8;
  return createMeshGeometry({ layout: { attributes, stride }, vertices: new Float32Array(semantics.length * 2) });
}

describe('explainGlMeshGeometryUvSets', () => {
  it('serves a UV1 request when the layout carries uv1', () => {
    const explanation = explainGlMeshGeometryUvSets(geometryWith(['position', 'uv0', 'uv1']), [0, 1]);
    expect(explanation.availableUvSets).toEqual([0, 1]);
    expect(explanation.unservedUvSets).toEqual([]);
    expect(explanation.samplesAtOrigin).toBe(false);
  });

  it('names UV1 unserved when the layout carries only uv0', () => {
    const explanation = explainGlMeshGeometryUvSets(geometryWith(['position', 'uv0']), [0, 1]);
    expect(explanation.availableUvSets).toEqual([0]);
    expect(explanation.unservedUvSets).toEqual([1]);
    // The whole reason the query exists: the draw succeeds and every texel of that map reads the map's
    // origin texel, so nothing else in the pipeline reports it.
    expect(explanation.samplesAtOrigin).toBe(true);
  });

  it('stays quiet when a uv1-less geometry is only asked for UV0', () => {
    const explanation = explainGlMeshGeometryUvSets(geometryWith(['position', 'uv0']), [0]);
    expect(explanation.samplesAtOrigin).toBe(false);
    expect(explanation.unservedUvSets).toEqual([]);
  });

  it('reports a geometry with no UV channel at all as serving neither set', () => {
    const explanation = explainGlMeshGeometryUvSets(geometryWith(['position', 'normal']), [0, 1]);
    expect(explanation.availableUvSets).toEqual([]);
    expect(explanation.unservedUvSets).toEqual([0, 1]);
  });

  it('collapses a repeated request so a material with many maps on one set reports it once', () => {
    const requested: PbrUvSet[] = [1, 1, 0, 1];
    const explanation = explainGlMeshGeometryUvSets(geometryWith(['position', 'uv0']), requested);
    expect(explanation.requestedUvSets).toEqual([0, 1]);
    expect(explanation.unservedUvSets).toEqual([1]);
  });

  it('retains and mutates nothing, so repeated queries agree', () => {
    const geometry = geometryWith(['position', 'uv0']);
    const first = explainGlMeshGeometryUvSets(geometry, [1]);
    const second = explainGlMeshGeometryUvSets(geometry, [1]);
    expect(second).toEqual(first);
    expect(geometry.layout.attributes).toHaveLength(2);
  });
});
