import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { createMeshGeometry } from '@flighthq/mesh/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';
import type { ColladaElementDecoder, MeshSubset } from '@flighthq/types/contract';

import { colladaChild, colladaDescendants, colladaIdOf, colladaNumbers } from './colladaXml.ts';
import { CANONICAL_FLOATS_PER_VERTEX, CANONICAL_LAYOUT } from './shared.ts';

export const colladaGeometryDecoder: ColladaElementDecoder = {
  decode(context) {
    // Aliased rather than rewritten. The body below is the block `parseCollada` ran inline, and binding
    // its three maps from the context leaves every line of it byte-identical. Substituting `context.`
    // through 150 lines of index arithmetic would have been the far riskier edit.
    const { diagnostics, document, root } = context;
    const geometryIdToMeshIndex = context.geometryIdToMeshIndex;
    const geometryPositions = context.geometryPositions;
    const geometryPrimitiveSymbols = context.geometryPrimitiveSymbols;
    const sources = new Map<string, number[]>();
    for (const source of colladaDescendants(root, 'source')) {
      const id = colladaIdOf(source);
      const array = colladaChild(source, 'float_array');
      if (id && array) sources.set(id, colladaNumbers(array));
    }
    for (const geometry of colladaDescendants(root, 'geometry')) {
      const mesh = colladaChild(geometry, 'mesh') ?? colladaDescendants(geometry, 'mesh')[0];
      if (!mesh) continue;
      const verticesMap = new Map<string, string>();
      const verticesNormalMap = new Map<string, string>();
      for (const vertices of mesh.children.filter((e) => e.name === 'vertices'))
        for (const input of vertices.children.filter((e) => e.name === 'input')) {
          const semantic = input.attributes.semantic;
          const source = input.attributes.source?.replace(/^#/, '');
          if (colladaIdOf(vertices) && source) {
            if (semantic === 'POSITION') verticesMap.set(colladaIdOf(vertices)!, source);
            if (semantic === 'NORMAL') verticesNormalMap.set(colladaIdOf(vertices)!, source);
          }
        }
      const primitives = mesh.children.filter((e) => ['triangles', 'polylist', 'lines'].includes(e.name));
      if (primitives.length === 0) continue;
      const vertexMap = new Map<string, number>();
      const vertexData: number[][] = [];
      const allIndices: number[] = [];
      const primitiveSymbols: string[] = [];
      const subsets: MeshSubset[] = [];
      let hasLines = false;
      for (const primitive of primitives) {
        const inputs = primitive.children.filter((e) => e.name === 'input');
        const stride = Math.max(1, ...inputs.map((e) => Number(e.attributes.offset ?? 0) + 1));
        const semanticSources = new Map<string, string>();
        const offsets = new Map<string, number>();
        for (const input of inputs) {
          let source = input.attributes.source?.replace(/^#/, '') ?? '';
          const semantic = input.attributes.semantic;
          if (semantic === 'VERTEX') {
            const posSource = verticesMap.get(source);
            if (posSource) {
              semanticSources.set('POSITION', posSource);
              offsets.set('POSITION', Number(input.attributes.offset ?? 0));
            }
            const nrmSource = verticesNormalMap.get(source);
            if (nrmSource) {
              semanticSources.set('NORMAL', nrmSource);
              offsets.set('NORMAL', Number(input.attributes.offset ?? 0));
            }
          } else if (source) {
            semanticSources.set(semantic, source);
            offsets.set(semantic, Number(input.attributes.offset ?? 0));
          }
        }
        const pos = sources.get(semanticSources.get('POSITION') ?? '');
        if (!pos) {
          reportImportDiagnostic(
            diagnostics,
            ImportDiagnosticSeverity.Drop,
            'collada.missing-reference',
            'parseCollada',
            {
              element: 'POSITION',
            },
          );
          continue;
        }
        const nrm = sources.get(semanticSources.get('NORMAL') ?? '');
        const uv = sources.get(semanticSources.get('TEXCOORD') ?? '');
        const posOffset = offsets.get('POSITION') ?? 0;
        const nrmOffset = offsets.get('NORMAL');
        const uvOffset = offsets.get('TEXCOORD');
        const raw = colladaNumbers(colladaChild(primitive, 'p'));
        const tuples: number[][] = [];
        if (primitive.name === 'polylist') {
          const counts = colladaNumbers(colladaChild(primitive, 'vcount'));
          let cursor = 0;
          for (const count of counts) {
            for (let i = 1; i + 1 < count; i++) {
              tuples.push(raw.slice(cursor, cursor + stride));
              tuples.push(raw.slice(cursor + i * stride, cursor + i * stride + stride));
              tuples.push(raw.slice(cursor + (i + 1) * stride, cursor + (i + 1) * stride + stride));
            }
            cursor += count * stride;
          }
        } else {
          for (let i = 0; i + stride - 1 < raw.length; i += stride) tuples.push(raw.slice(i, i + stride));
        }
        const subsetIndexOffset = allIndices.length;
        for (const tuple of tuples) {
          const key = tuple.join(',');
          let vertexIndex = vertexMap.get(key);
          if (vertexIndex === undefined) {
            vertexIndex = vertexData.length;
            vertexMap.set(key, vertexIndex);
            const pi = tuple[posOffset];
            const px = pos[pi * 3] ?? 0;
            const py = pos[pi * 3 + 1] ?? 0;
            const pz = pos[pi * 3 + 2] ?? 0;
            let nx = 0,
              ny = 1,
              nz = 0;
            if (nrm && nrmOffset !== undefined) {
              const ni = tuple[nrmOffset];
              nx = nrm[ni * 3] ?? 0;
              ny = nrm[ni * 3 + 1] ?? 1;
              nz = nrm[ni * 3 + 2] ?? 0;
            }
            let u = 0,
              v = 0;
            if (uv && uvOffset !== undefined) {
              const ui = tuple[uvOffset];
              u = uv[ui * 2] ?? 0;
              v = uv[ui * 2 + 1] ?? 0;
            }
            vertexData.push([px, py, pz, nx, ny, nz, 0, 0, 0, 1, u, v]);
          }
          allIndices.push(vertexIndex);
        }
        const subsetIndexCount = allIndices.length - subsetIndexOffset;
        if (subsetIndexCount > 0) subsets.push({ indexCount: subsetIndexCount, indexOffset: subsetIndexOffset });
        if (primitive.name === 'lines') hasLines = true;
        const primitiveSymbol = primitive.attributes.material;
        if (primitiveSymbol) primitiveSymbols.push(primitiveSymbol);
      }
      if (vertexData.length === 0) continue;
      const vertices = new Float32Array(vertexData.length * CANONICAL_FLOATS_PER_VERTEX);
      for (let i = 0; i < vertexData.length; i++) {
        const d = vertexData[i];
        const base = i * CANONICAL_FLOATS_PER_VERTEX;
        for (let j = 0; j < CANONICAL_FLOATS_PER_VERTEX; j++) vertices[base + j] = d[j];
      }
      const pos = sources.get(verticesMap.values().next().value ?? '');
      const topology = hasLines ? 'line-list' : 'triangle-list';
      const geoId = colladaIdOf(geometry);
      if (geoId) {
        geometryIdToMeshIndex.set(geoId, document.meshes.length);
        if (pos) geometryPositions.set(geoId, pos);
        if (primitiveSymbols.length > 0) geometryPrimitiveSymbols.set(geoId, primitiveSymbols);
      }
      document.meshes.push({
        geometry: createMeshGeometry({
          indices: Uint32Array.from(allIndices),
          layout: CANONICAL_LAYOUT,
          subsets,
          topology,
          vertices,
        }),
        materials: [],
        name: geometry.attributes.name,
      });
    }
  },
  elements: ['geometry'],
  features: ['Geometry'],
};
