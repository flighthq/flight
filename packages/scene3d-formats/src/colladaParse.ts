import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { createMeshGeometry } from '@flighthq/mesh/contract';
import type {
  ColladaImportOptions,
  ColladaParseResult,
  ColladaUpAxis,
  ImportDiagnostic,
  Scene3DDocument,
  XmlElement,
} from '@flighthq/types/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';
import { parseXmlDocument } from '@flighthq/xml/contract';

import { appendColladaMaterials } from './colladaMaterial';
import { CANONICAL_FLOATS_PER_VERTEX, CANONICAL_LAYOUT } from './shared';
const Y_UP_ROOT = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const;
const Z_UP_ROOT = [1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1] as const;
const X_UP_ROOT = [0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1] as const;
function emptyDocument(): Scene3DDocument {
  return {
    animations: [],
    cameras: [],
    lights: [],
    materials: [],
    meshes: [],
    metadata: null,
    nodes: [],
    resources: [],
    scenes: [],
    skins: [],
  };
}
function child(element: XmlElement | undefined, name: string): XmlElement | undefined {
  return element?.children.find((entry) => entry.name === name || entry.name.endsWith(`:${name}`));
}
function text(element: XmlElement | undefined, name: string): string | null {
  return child(element, name)?.text.trim() || null;
}
function walk(element: XmlElement, visit: (entry: XmlElement) => void): void {
  visit(element);
  for (const entry of element.children) walk(entry, visit);
}
function descendants(element: XmlElement, name: string): XmlElement[] {
  const out: XmlElement[] = [];
  walk(element, (e) => {
    if (e.name === name || e.name.endsWith(`:${name}`)) out.push(e);
  });
  return out;
}
function idOf(element: XmlElement): string | null {
  return element.attributes.id ?? null;
}
function numbers(element: XmlElement | undefined): number[] {
  return element?.text.trim().split(/\s+/).filter(Boolean).map(Number).filter(Number.isFinite) ?? [];
}
interface ColladaDecodedSkin {
  controllerId: string;
  jointNames: string[];
  jointSids: string[];
  inverseBindMatrices: number[][];
  influences: Array<Array<{ joint: string; weight: number }>>;
  bindShapeMatrix: number[];
}
/** Internal Arc 5a seam; intentionally not re-exported from the package contract. */
export function decodeColladaControllers(xml: string, diagnostics: ImportDiagnostic[] = []): ColladaDecodedSkin[] {
  const root = parseXmlDocument(xml);
  if (!root) return [];
  const out: ColladaDecodedSkin[] = [];
  for (const controller of descendants(root, 'controller')) {
    const skin = child(controller, 'skin');
    if (!skin || !idOf(controller)) continue;
    const sourceValues = new Map<string, string[] | number[]>();
    for (const source of skin.children.filter((e) => e.name === 'source')) {
      const id = idOf(source);
      if (!id) continue;
      const arr = child(source, 'Name_array') ?? child(source, 'IDREF_array') ?? child(source, 'float_array');
      if (arr)
        sourceValues.set(id, arr.name === 'float_array' ? numbers(arr) : arr.text.trim().split(/\s+/).filter(Boolean));
    }
    const joints = child(skin, 'joints');
    const jointInput = joints?.children.find((e) => e.name === 'input' && e.attributes.semantic === 'JOINT');
    const matrixInput = joints?.children.find((e) => e.name === 'input' && e.attributes.semantic === 'INV_BIND_MATRIX');
    const jointNames =
      (sourceValues.get(jointInput?.attributes.source?.replace(/^#/, '') ?? '') as string[] | undefined) ?? [];
    const matrixValues =
      (sourceValues.get(matrixInput?.attributes.source?.replace(/^#/, '') ?? '') as number[] | undefined) ?? [];
    const inverseBindMatrices: number[][] = [];
    for (let i = 0; i + 15 < matrixValues.length; i += 16) inverseBindMatrices.push(matrixValues.slice(i, i + 16));
    const weights = child(skin, 'vertex_weights');
    const vcount = numbers(child(weights, 'vcount'));
    const v = numbers(child(weights, 'v'));
    const weightInputs = weights?.children.filter((e) => e.name === 'input') ?? [];
    const jointOffset = Number(weightInputs.find((e) => e.attributes.semantic === 'JOINT')?.attributes.offset ?? 0);
    const weightOffset = Number(weightInputs.find((e) => e.attributes.semantic === 'WEIGHT')?.attributes.offset ?? 1);
    const stride = Math.max(1, ...weightInputs.map((e) => Number(e.attributes.offset ?? 0) + 1));
    const weightSource = sourceValues.get(
      weightInputs.find((e) => e.attributes.semantic === 'WEIGHT')?.attributes.source?.replace(/^#/, '') ?? '',
    ) as number[] | undefined;
    const influences: Array<Array<{ joint: string; weight: number }>> = [];
    let cursor = 0;
    for (const count of vcount) {
      const values: Array<{ joint: string; weight: number }> = [];
      for (let i = 0; i < count; i++) {
        const ji = v[cursor + i * stride + jointOffset];
        const wi = v[cursor + i * stride + weightOffset];
        if (jointNames[ji] !== undefined && weightSource?.[wi] !== undefined)
          values.push({ joint: jointNames[ji], weight: weightSource[wi] });
      }
      const sum = values.reduce((s, x) => s + x.weight, 0);
      for (const x of values) x.weight = sum > 0 ? x.weight / sum : 0;
      influences.push(values);
      cursor += count * stride;
    }
    if (cursor !== v.length)
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Recover,
        'collada.vertex-weight-count-mismatch',
        'decodeColladaControllers',
        { controller: idOf(controller)! },
      );
    out.push({
      controllerId: idOf(controller)!,
      jointNames,
      jointSids: jointNames.slice(),
      inverseBindMatrices,
      influences,
      bindShapeMatrix: numbers(child(skin, 'bind_shape_matrix')),
    });
  }
  return out;
}

/** Parses COLLADA metadata, coordinate conventions, and common-profile materials into a format-neutral document. */
export function parseCollada(xml: string, options?: Readonly<ColladaImportOptions>): ColladaParseResult {
  const diagnostics: ImportDiagnostic[] = [];
  const document = emptyDocument();
  const root = parseXmlDocument(xml);
  if (root === null || !(root.name === 'COLLADA' || root.name.endsWith(':COLLADA'))) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Reject, 'collada.invalid-document', 'parseCollada');
    return { document, diagnostics, upAxis: 'Y_UP', rootTransform: Y_UP_ROOT };
  }
  const asset = child(root, 'asset');
  const axis = text(asset, 'up_axis');
  const upAxis: ColladaUpAxis = axis === 'Z_UP' || axis === 'X_UP' ? axis : 'Y_UP';
  const rootTransform = upAxis === 'Z_UP' ? Z_UP_ROOT : upAxis === 'X_UP' ? X_UP_ROOT : Y_UP_ROOT;
  document.metadata = {
    copyright: text(asset, 'copyright'),
    generator: text(child(asset, 'contributor'), 'authoring_tool'),
    version: root.attributes.version ?? null,
  };
  if (upAxis !== 'Y_UP')
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Recover,
      'collada.coordinate-conversion',
      'parseCollada',
      { from: upAxis, to: 'Y_UP' },
    );
  walk(root, (element) => {
    if (element.name.startsWith('instance_') && !element.attributes.url)
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Recover,
        'collada.missing-reference',
        'parseCollada',
        { element: element.name },
      );
  });
  const materialIndices = new Map<string, number>();
  appendColladaMaterials(
    root,
    document.materials,
    document.resources,
    materialIndices,
    options?.baseUrl ?? null,
    diagnostics,
  );
  const sources = new Map<string, number[]>();
  for (const source of descendants(root, 'source')) {
    const id = idOf(source);
    const array = child(source, 'float_array');
    if (id && array) sources.set(id, numbers(array));
  }
  for (const geometry of descendants(root, 'geometry')) {
    const mesh = child(geometry, 'mesh') ?? descendants(geometry, 'mesh')[0];
    if (!mesh) continue;
    const verticesMap = new Map<string, string>();
    for (const vertices of mesh.children.filter((e) => e.name === 'vertices'))
      for (const input of vertices.children.filter((e) => e.name === 'input')) {
        const semantic = input.attributes.semantic;
        const source = input.attributes.source?.replace(/^#/, '');
        if (semantic === 'POSITION' && idOf(vertices) && source) verticesMap.set(idOf(vertices)!, source);
      }
    const primitive =
      mesh.children.find((e) => ['triangles', 'polylist', 'lines'].includes(e.name)) ??
      descendants(mesh, 'triangles')[0] ??
      descendants(mesh, 'polylist')[0] ??
      descendants(mesh, 'lines')[0];
    if (!primitive) continue;
    const inputs = primitive.children.filter((e) => e.name === 'input');
    const stride = Math.max(1, ...inputs.map((e) => Number(e.attributes.offset ?? 0) + 1));
    const semanticSources = new Map<string, string>();
    const offsets = new Map<string, number>();
    for (const input of inputs) {
      let source = input.attributes.source?.replace(/^#/, '') ?? '';
      if (input.attributes.semantic === 'VERTEX') source = verticesMap.get(source) ?? '';
      if (source) {
        const semantic = input.attributes.semantic === 'VERTEX' ? 'POSITION' : input.attributes.semantic;
        semanticSources.set(semantic, source);
        offsets.set(semantic, Number(input.attributes.offset ?? 0));
      }
    }
    const pos =
      sources.get(semanticSources.get('POSITION') ?? '') ??
      (sources.size === 1 ? sources.values().next().value : undefined);
    if (!pos) {
      reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Drop, 'collada.missing-reference', 'parseCollada', {
        element: 'POSITION',
      });
      continue;
    }
    const raw = numbers(child(primitive, 'p'));
    const vertexCount = Math.floor(pos.length / 3);
    const indices: number[] = [];
    if (primitive.name === 'polylist') {
      const counts = numbers(child(primitive, 'vcount'));
      let cursor = 0;
      for (const count of counts) {
        for (let i = 1; i + 1 < count; i++) {
          indices.push(
            raw[cursor + offsets.get('POSITION')!],
            raw[cursor + i * stride + offsets.get('POSITION')!],
            raw[cursor + (i + 1) * stride + offsets.get('POSITION')!],
          );
        }
        cursor += count * stride;
      }
    } else for (let i = 0; i + stride - 1 < raw.length; i += stride) indices.push(raw[i + offsets.get('POSITION')!]);
    const vertices = new Float32Array(vertexCount * CANONICAL_FLOATS_PER_VERTEX);
    for (let i = 0; i < vertexCount; i++) {
      vertices[i * 12] = pos[i * 3] ?? 0;
      vertices[i * 12 + 1] = pos[i * 3 + 1] ?? 0;
      vertices[i * 12 + 2] = pos[i * 3 + 2] ?? 0;
      vertices[i * 12 + 3] = 0;
      vertices[i * 12 + 4] = 1;
      vertices[i * 12 + 7] = 1;
    }
    const topology = primitive.name === 'lines' ? 'line-list' : 'triangle-list';
    document.meshes.push({
      geometry: createMeshGeometry({
        indices: Uint32Array.from(indices),
        layout: CANONICAL_LAYOUT,
        topology,
        vertices,
      }),
      materials: [],
      name: geometry.attributes.name,
    });
  }
  return { document, diagnostics, upAxis, rootTransform };
}
