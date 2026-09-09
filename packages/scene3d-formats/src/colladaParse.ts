import { createAnimationTrack } from '@flighthq/animation/contract';
import { createOrthographicProjection, createPerspectiveProjection } from '@flighthq/camera/contract';
import {
  composeMatrix4FromTransform3D,
  createMatrix4,
  createTransform3D,
  decomposeMatrix4ToTransform3D,
  multiplyMatrix4,
  setMatrix4,
} from '@flighthq/geometry/contract';
import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { DEG_TO_RAD } from '@flighthq/math/contract';
import { createMeshGeometry } from '@flighthq/mesh/contract';
import type {
  AnimationInterpolation,
  ColladaImportOptions,
  ColladaParseResult,
  ColladaUpAxis,
  ImportDiagnostic,
  Matrix4Like,
  Scene3DAnimationPath,
  Scene3DDocument,
  Scene3DDocumentAnimationChannel,
  Scene3DDocumentCamera,
  Scene3DDocumentNode,
  Scene3DDocumentScene,
  Scene3DDocumentSkin,
  Transform3D,
  XmlElement,
} from '@flighthq/types/contract';
import { ImportDiagnosticSeverity, Node3DKind } from '@flighthq/types/contract';
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
function children(element: XmlElement | undefined, name: string): XmlElement[] {
  if (element === undefined) return [];
  return element.children.filter((entry) => entry.name === name || entry.name.endsWith(`:${name}`));
}
function text(element: XmlElement | undefined, name: string): string | null {
  return child(element, name)?.text.trim() || null;
}
function localName(element: XmlElement): string {
  const colon = element.name.indexOf(':');
  return colon >= 0 ? element.name.slice(colon + 1) : element.name;
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
  bindShapeMatrix: number[];
  controllerId: string;
  geometryRef: string;
  influences: Array<Array<{ joint: string; weight: number }>>;
  inverseBindMatrices: number[][];
  jointNames: string[];
  jointSids: string[];
}
interface ColladaDecodedAnimationChannel {
  target: string;
  times: number[];
  values: number[];
  interpolation: string[];
  inTangents: number[];
  outTangents: number[];
}
interface ColladaPerspectiveCameraDefinition {
  aspect: number;
  far: number;
  fovY: number;
  kind: 'perspective';
  name?: string;
  near: number;
}
interface ColladaOrthographicCameraDefinition {
  far: number;
  halfHeight: number;
  halfWidth: number;
  kind: 'orthographic';
  name?: string;
  near: number;
}
type ColladaCameraDefinition = ColladaOrthographicCameraDefinition | ColladaPerspectiveCameraDefinition;
interface ColladaDecodedMorph {
  controllerId: string;
  baseGeometry: string;
  method: 'RELATIVE' | 'NORMALIZED';
  targets: string[];
  weights: number[];
}

function decodeColladaCameraDefinitions(
  root: XmlElement,
  diagnostics: ImportDiagnostic[],
): Map<string, ColladaCameraDefinition | null> {
  const definitions = new Map<string, ColladaCameraDefinition | null>();
  for (const library of descendants(root, 'library_cameras')) {
    for (const camera of children(library, 'camera')) {
      const id = idOf(camera);
      if (id === null) continue;
      const technique = child(child(camera, 'optics'), 'technique_common');
      const perspective = child(technique, 'perspective');
      const orthographic = child(technique, 'orthographic');
      const name = camera.attributes.name;

      if (perspective !== undefined) {
        const missing: string[] = [];
        const fovDegrees = colladaCameraNumber(perspective, 'yfov', COLLADA_CAMERA_DEFAULT_FOV_DEGREES, missing);
        const aspect = colladaCameraNumber(perspective, 'aspect_ratio', COLLADA_CAMERA_DEFAULT_ASPECT, undefined);
        const near = colladaCameraNumber(perspective, 'znear', COLLADA_CAMERA_DEFAULT_NEAR, missing);
        const far = colladaCameraNumber(perspective, 'zfar', COLLADA_CAMERA_DEFAULT_FAR, missing);
        if (
          !Number.isFinite(fovDegrees) ||
          !(fovDegrees > 0) ||
          fovDegrees >= 180 ||
          !Number.isFinite(aspect) ||
          !(aspect > 0) ||
          !Number.isFinite(near) ||
          !(near > 0) ||
          !Number.isFinite(far) ||
          !(far > near)
        ) {
          reportImportDiagnostic(
            diagnostics,
            ImportDiagnosticSeverity.Drop,
            'collada.camera-invalid-perspective',
            'parseCollada',
            { camera: id },
          );
          definitions.set(id, null);
          continue;
        }
        reportIncompleteColladaCamera(diagnostics, id, 'perspective', missing);
        definitions.set(id, {
          aspect,
          far,
          fovY: fovDegrees * DEG_TO_RAD,
          kind: 'perspective',
          ...(name !== undefined && name.length > 0 ? { name } : {}),
          near,
        });
        continue;
      }

      if (orthographic !== undefined) {
        const missing: string[] = [];
        const halfWidth = colladaCameraNumber(orthographic, 'xmag', COLLADA_CAMERA_DEFAULT_ORTHO_HALF_EXTENT, missing);
        const halfHeight = colladaCameraNumber(orthographic, 'ymag', COLLADA_CAMERA_DEFAULT_ORTHO_HALF_EXTENT, missing);
        const near = colladaCameraNumber(orthographic, 'znear', COLLADA_CAMERA_DEFAULT_NEAR, missing);
        const far = colladaCameraNumber(orthographic, 'zfar', COLLADA_CAMERA_DEFAULT_FAR, missing);
        if (
          !Number.isFinite(halfWidth) ||
          !(halfWidth > 0) ||
          !Number.isFinite(halfHeight) ||
          !(halfHeight > 0) ||
          !Number.isFinite(near) ||
          !(near >= 0) ||
          !Number.isFinite(far) ||
          !(far > near)
        ) {
          reportImportDiagnostic(
            diagnostics,
            ImportDiagnosticSeverity.Drop,
            'collada.camera-invalid-orthographic',
            'parseCollada',
            { camera: id },
          );
          definitions.set(id, null);
          continue;
        }
        reportIncompleteColladaCamera(diagnostics, id, 'orthographic', missing);
        definitions.set(id, {
          far,
          halfHeight,
          halfWidth,
          kind: 'orthographic',
          ...(name !== undefined && name.length > 0 ? { name } : {}),
          near,
        });
        continue;
      }

      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Drop,
        'collada.camera-missing-descriptor',
        'parseCollada',
        { camera: id },
      );
      definitions.set(id, null);
    }
  }
  return definitions;
}

function colladaCameraNumber(
  descriptor: XmlElement,
  field: string,
  fallback: number,
  missing: string[] | undefined,
): number {
  const source = text(descriptor, field);
  if (source === null) {
    missing?.push(field);
    return fallback;
  }
  return Number(source);
}

function reportIncompleteColladaCamera(
  diagnostics: ImportDiagnostic[],
  camera: string,
  projection: 'orthographic' | 'perspective',
  missing: readonly string[],
): void {
  if (missing.length === 0) return;
  reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Recover, 'collada.camera-incomplete', 'parseCollada', {
    camera,
    fields: missing.join(','),
    projection,
  });
}
/** Internal Arc 6a seam; channel targets remain authored ID/SID paths for later hierarchy binding. */
export function decodeColladaAnimations(
  xml: string,
  diagnostics: ImportDiagnostic[] = [],
): ColladaDecodedAnimationChannel[] {
  const root = parseXmlDocument(xml);
  if (!root) return [];
  return decodeColladaAnimationsFromRoot(root, diagnostics);
}
/** Internal Arc 5a seam; intentionally not re-exported from the package contract. */
export function decodeColladaControllers(xml: string, diagnostics: ImportDiagnostic[] = []): ColladaDecodedSkin[] {
  const root = parseXmlDocument(xml);
  if (!root) return [];
  return decodeColladaControllersFromRoot(root, diagnostics);
}

function decodeColladaAnimationsFromRoot(
  root: XmlElement,
  diagnostics: ImportDiagnostic[],
): ColladaDecodedAnimationChannel[] {
  const out: ColladaDecodedAnimationChannel[] = [];
  for (const animation of descendants(root, 'animation')) {
    const values = new Map<string, string[] | number[]>();
    for (const source of animation.children.filter((e) => e.name === 'source')) {
      const id = idOf(source);
      const arr = child(source, 'float_array') ?? child(source, 'Name_array');
      if (id && arr)
        values.set(id, arr.name === 'float_array' ? numbers(arr) : arr.text.trim().split(/\s+/).filter(Boolean));
    }
    const sampler = child(animation, 'sampler');
    const channel = child(animation, 'channel');
    if (!sampler || !channel) {
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Recover,
        'collada.missing-reference',
        'decodeColladaAnimations',
        { element: 'sampler/channel' },
      );
      continue;
    }
    const input = sampler.children.find((e) => e.name === 'input' && e.attributes.semantic === 'INPUT');
    const output = sampler.children.find((e) => e.name === 'input' && e.attributes.semantic === 'OUTPUT');
    const interp = sampler.children.find((e) => e.name === 'input' && e.attributes.semantic === 'INTERPOLATION');
    const times = (values.get(input?.attributes.source?.replace(/^#/, '') ?? '') as number[] | undefined) ?? [];
    const outputValues = (values.get(output?.attributes.source?.replace(/^#/, '') ?? '') as number[] | undefined) ?? [];
    const interpolation =
      (values.get(interp?.attributes.source?.replace(/^#/, '') ?? '') as string[] | undefined) ?? [];
    for (const mode of interpolation)
      if (mode !== 'LINEAR' && mode !== 'STEP' && mode !== 'BEZIER')
        reportImportDiagnostic(
          diagnostics,
          ImportDiagnosticSeverity.Skip,
          'collada.unsupported-interpolation',
          'decodeColladaAnimations',
          { interpolation: mode },
        );
    if (!times.length || !outputValues.length) {
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Recover,
        'collada.missing-reference',
        'decodeColladaAnimations',
        { element: 'animation source' },
      );
      continue;
    }
    out.push({
      target: channel.attributes.target ?? '',
      times,
      values: outputValues,
      interpolation,
      inTangents: [],
      outTangents: [],
    });
  }
  return out;
}
/** Internal morph-controller seam for later binding to MeshMorph/document nodes. */
export function decodeColladaMorphs(xml: string, diagnostics: ImportDiagnostic[] = []): ColladaDecodedMorph[] {
  const root = parseXmlDocument(xml);
  if (!root) return [];
  const out: ColladaDecodedMorph[] = [];
  for (const controller of descendants(root, 'controller')) {
    const morph = child(controller, 'morph');
    if (!morph || !idOf(controller)) continue;
    const method = morph.attributes.method === 'NORMALIZED' ? 'NORMALIZED' : 'RELATIVE';
    if (morph.attributes.method && morph.attributes.method !== 'RELATIVE' && morph.attributes.method !== 'NORMALIZED')
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Skip,
        'collada.unsupported-morph-method',
        'decodeColladaMorphs',
        { method: morph.attributes.method },
      );
    const targets = child(morph, 'targets');
    const targetInput = targets?.children.find((e) => e.name === 'input' && e.attributes.semantic === 'MORPH_TARGET');
    const weightInput = targets?.children.find((e) => e.name === 'input' && e.attributes.semantic === 'MORPH_WEIGHT');
    const source = (ref: string | undefined, name: string) =>
      descendants(morph, 'source')
        .find((e) => idOf(e) === ref?.replace(/^#/, ''))
        ?.children.find((e) => e.name === name)
        ?.text.trim()
        .split(/\s+/)
        .filter(Boolean) ?? [];
    const targetIds = source(targetInput?.attributes.source, 'IDREF_array');
    const weights = source(weightInput?.attributes.source, 'float_array').map(Number).filter(Number.isFinite);
    if (!targetIds.length || !weights.length) {
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Recover,
        'collada.missing-reference',
        'decodeColladaMorphs',
        { controller: idOf(controller)! },
      );
      continue;
    }
    out.push({
      controllerId: idOf(controller)!,
      baseGeometry: morph.attributes.source?.replace(/^#/, '') ?? '',
      method,
      targets: targetIds,
      weights: weights.slice(0, targetIds.length),
    });
  }
  return out;
}

function decodeColladaControllersFromRoot(root: XmlElement, diagnostics: ImportDiagnostic[]): ColladaDecodedSkin[] {
  const out: ColladaDecodedSkin[] = [];
  for (const controller of descendants(root, 'controller')) {
    const skin = child(controller, 'skin');
    if (!skin || !idOf(controller)) continue;
    const geometryRef = skin.attributes.source?.replace(/^#/, '') ?? '';
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
      bindShapeMatrix: numbers(child(skin, 'bind_shape_matrix')),
      controllerId: idOf(controller)!,
      geometryRef,
      influences,
      inverseBindMatrices,
      jointNames,
      jointSids: jointNames.slice(),
    });
  }
  return out;
}

/** Parses COLLADA metadata, coordinate conventions, materials, geometry, and scene hierarchy into a format-neutral document. */
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
    const ln = localName(element);
    if (
      ln.startsWith('instance_') &&
      ln !== 'instance_visual_scene' &&
      ln !== 'instance_node' &&
      !element.attributes.url
    )
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
  const cameraDefinitions = decodeColladaCameraDefinitions(root, diagnostics);
  const geometryIdToMeshIndex = new Map<string, number>();
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
    const geoId = idOf(geometry);
    if (geoId) geometryIdToMeshIndex.set(geoId, document.meshes.length);
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

  const decodedSkins = decodeColladaControllersFromRoot(root, diagnostics);
  const controllerMap = new Map<string, ColladaDecodedSkin>();
  for (const skin of decodedSkins) controllerMap.set(skin.controllerId, skin);

  const decodedAnimChannels = decodeColladaAnimationsFromRoot(root, diagnostics);

  const nodeLibrary = buildColladaIdMap(child(root, 'library_nodes'), 'node');
  const visualSceneLibrary = buildColladaIdMap(child(root, 'library_visual_scenes'), 'visual_scene');
  buildColladaSceneHierarchy(
    document,
    root,
    visualSceneLibrary,
    nodeLibrary,
    rootTransform,
    geometryIdToMeshIndex,
    cameraDefinitions,
    controllerMap,
    decodedAnimChannels,
    diagnostics,
  );

  return { document, diagnostics, upAxis, rootTransform };
}

function buildColladaIdMap(library: XmlElement | undefined, elementName: string): Map<string, XmlElement> {
  const map = new Map<string, XmlElement>();
  if (library === undefined) return map;
  for (const element of children(library, elementName)) {
    const id = element.attributes.id;
    if (id !== undefined) map.set(id, element);
  }
  return map;
}

interface ColladaDeferredControllerBinding {
  controllerId: string;
  nodeIndex: number;
  skeletonRoot: string | null;
}

interface ColladaDeferredCameraBinding {
  cameraId: string;
  nodeIndex: number;
}

function buildColladaSceneHierarchy(
  document: Scene3DDocument,
  root: XmlElement,
  visualSceneLibrary: Map<string, XmlElement>,
  nodeLibrary: Map<string, XmlElement>,
  rootTransform: readonly number[],
  geometryIdToMeshIndex: ReadonlyMap<string, number>,
  cameraDefinitions: ReadonlyMap<string, ColladaCameraDefinition | null>,
  controllerMap: ReadonlyMap<string, ColladaDecodedSkin>,
  decodedAnimChannels: readonly ColladaDecodedAnimationChannel[],
  diagnostics: ImportDiagnostic[],
): void {
  const sceneElement = child(root, 'scene');
  if (sceneElement === undefined) return;
  const instanceVisualScene = child(sceneElement, 'instance_visual_scene');
  if (instanceVisualScene === undefined) return;
  const url = instanceVisualScene.attributes.url;
  if (url === undefined || !url.startsWith('#')) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Recover, 'collada.missing-reference', 'parseCollada', {
      element: 'instance_visual_scene',
      url: url ?? '(missing)',
    });
    return;
  }
  const visualScene = visualSceneLibrary.get(url.slice(1));
  if (visualScene === undefined) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Recover, 'collada.missing-reference', 'parseCollada', {
      element: 'instance_visual_scene',
      url,
    });
    return;
  }

  const rootMatrix = createMatrix4();
  rootMatrix.m.set(rootTransform);
  const isIdentityRoot =
    rootTransform[0] === 1 &&
    rootTransform[5] === 1 &&
    rootTransform[10] === 1 &&
    rootTransform[15] === 1 &&
    rootTransform[1] === 0 &&
    rootTransform[2] === 0 &&
    rootTransform[3] === 0 &&
    rootTransform[4] === 0 &&
    rootTransform[6] === 0 &&
    rootTransform[7] === 0 &&
    rootTransform[8] === 0 &&
    rootTransform[9] === 0 &&
    rootTransform[11] === 0 &&
    rootTransform[12] === 0 &&
    rootTransform[13] === 0 &&
    rootTransform[14] === 0;

  const nodeIdMap = new Map<string, number>();
  const deferredCameras: ColladaDeferredCameraBinding[] = [];
  const deferredControllers: ColladaDeferredControllerBinding[] = [];
  const instanceStack = new Set<string>();
  const rootNodeIndices: number[] = [];
  for (const nodeElement of children(visualScene, 'node')) {
    rootNodeIndices.push(
      buildColladaNode(
        document,
        nodeElement,
        nodeLibrary,
        instanceStack,
        geometryIdToMeshIndex,
        nodeIdMap,
        deferredCameras,
        deferredControllers,
        diagnostics,
      ),
    );
  }

  if (!isIdentityRoot) {
    for (const nodeIndex of rootNodeIndices) {
      applyColladaRootTransform(document.nodes[nodeIndex], rootMatrix);
    }
  }

  resolveColladaCameras(document, deferredCameras, cameraDefinitions, rootNodeIndices, diagnostics);
  resolveColladaSkins(document, deferredControllers, controllerMap, geometryIdToMeshIndex, nodeIdMap, diagnostics);
  resolveColladaAnimations(document, decodedAnimChannels, nodeIdMap, diagnostics);

  const scene: Scene3DDocumentScene = {
    name: visualScene.attributes.name,
    rootNodes: rootNodeIndices,
  };
  document.scenes.push(scene);
}

function applyColladaRootTransform(node: Scene3DDocumentNode, rootMatrix: Matrix4Like): void {
  const local = createMatrix4();
  const composed = createMatrix4();
  composeMatrix4FromTransform3D(local, node.transform);
  multiplyMatrix4(composed, rootMatrix, local);
  decomposeMatrix4ToTransform3D(node.transform, composed);
}

function buildColladaNode(
  document: Scene3DDocument,
  nodeElement: XmlElement,
  nodeLibrary: Map<string, XmlElement>,
  instanceStack: Set<string>,
  geometryIdToMeshIndex: ReadonlyMap<string, number>,
  nodeIdMap: Map<string, number>,
  deferredCameras: ColladaDeferredCameraBinding[],
  deferredControllers: ColladaDeferredControllerBinding[],
  diagnostics: ImportDiagnostic[],
): number {
  const nodeIndex = document.nodes.length;
  const transform = composeColladaTransformElements(nodeElement);
  const node: Scene3DDocumentNode = {
    children: [],
    kind: Node3DKind,
    name: nodeElement.attributes.name ?? nodeElement.attributes.id,
    transform,
  };
  document.nodes.push(node);

  const nodeId = nodeElement.attributes.id;
  const nodeSid = nodeElement.attributes.sid;
  if (nodeId !== undefined) {
    instanceStack.add(nodeId);
    nodeIdMap.set(nodeId, nodeIndex);
  }
  if (nodeSid !== undefined) nodeIdMap.set(nodeSid, nodeIndex);

  for (const childElement of nodeElement.children) {
    const name = localName(childElement);
    if (name === 'node') {
      node.children.push(
        buildColladaNode(
          document,
          childElement,
          nodeLibrary,
          instanceStack,
          geometryIdToMeshIndex,
          nodeIdMap,
          deferredCameras,
          deferredControllers,
          diagnostics,
        ),
      );
    } else if (name === 'instance_node') {
      const url = childElement.attributes.url;
      if (url === undefined || !url.startsWith('#')) {
        reportImportDiagnostic(
          diagnostics,
          ImportDiagnosticSeverity.Recover,
          'collada.missing-reference',
          'parseCollada',
          { element: 'instance_node', url: url ?? '(missing)' },
        );
        continue;
      }
      const refId = url.slice(1);
      if (instanceStack.has(refId)) {
        reportImportDiagnostic(
          diagnostics,
          ImportDiagnosticSeverity.Recover,
          'collada.instance-cycle',
          'parseCollada',
          { node: refId },
        );
        continue;
      }
      const referenced = nodeLibrary.get(refId);
      if (referenced === undefined) {
        reportImportDiagnostic(
          diagnostics,
          ImportDiagnosticSeverity.Recover,
          'collada.missing-reference',
          'parseCollada',
          { element: 'instance_node', url },
        );
        continue;
      }
      node.children.push(
        buildColladaNode(
          document,
          referenced,
          nodeLibrary,
          instanceStack,
          geometryIdToMeshIndex,
          nodeIdMap,
          deferredCameras,
          deferredControllers,
          diagnostics,
        ),
      );
    } else if (name === 'instance_camera') {
      const url = childElement.attributes.url;
      if (url?.startsWith('#')) {
        deferredCameras.push({ cameraId: url.slice(1), nodeIndex });
      } else if (url !== undefined) {
        reportImportDiagnostic(
          diagnostics,
          ImportDiagnosticSeverity.Recover,
          'collada.missing-reference',
          'parseCollada',
          { element: 'instance_camera', url },
        );
      }
    } else if (name === 'instance_geometry') {
      const url = childElement.attributes.url;
      if (url?.startsWith('#')) {
        const meshIndex = geometryIdToMeshIndex.get(url.slice(1));
        if (meshIndex !== undefined) node.mesh = meshIndex;
      }
    } else if (name === 'instance_controller') {
      const url = childElement.attributes.url;
      if (url?.startsWith('#')) {
        const skeletonEl = child(childElement, 'skeleton');
        const skeletonRoot = skeletonEl?.text.trim().replace(/^#/, '') ?? null;
        deferredControllers.push({ controllerId: url.slice(1), nodeIndex, skeletonRoot });
      }
    }
  }

  if (nodeId !== undefined) instanceStack.delete(nodeId);
  return nodeIndex;
}

function resolveColladaCameras(
  document: Scene3DDocument,
  deferred: readonly ColladaDeferredCameraBinding[],
  definitions: ReadonlyMap<string, ColladaCameraDefinition | null>,
  rootNodeIndices: readonly number[],
  diagnostics: ImportDiagnostic[],
): void {
  const worldMatrices = buildColladaNodeWorldMatrices(document.nodes, rootNodeIndices);
  for (const binding of deferred) {
    const definition = definitions.get(binding.cameraId);
    if (definition === undefined) {
      reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Drop, 'collada.missing-reference', 'parseCollada', {
        element: 'instance_camera',
        url: `#${binding.cameraId}`,
      });
      continue;
    }
    if (definition === null) continue;
    const worldMatrix = worldMatrices[binding.nodeIndex];
    if (worldMatrix === undefined) continue;
    const transform = createTransform3D();
    decomposeMatrix4ToTransform3D(transform, worldMatrix);
    let camera: Scene3DDocumentCamera;
    if (definition.kind === 'perspective') {
      camera = {
        far: definition.far,
        ...(definition.name !== undefined ? { name: definition.name } : {}),
        near: definition.near,
        node: binding.nodeIndex,
        projection: createPerspectiveProjection({ aspect: definition.aspect, fovY: definition.fovY }),
        transform,
      };
    } else {
      camera = {
        far: definition.far,
        ...(definition.name !== undefined ? { name: definition.name } : {}),
        near: definition.near,
        node: binding.nodeIndex,
        projection: createOrthographicProjection({
          halfHeight: definition.halfHeight,
          halfWidth: definition.halfWidth,
        }),
        transform,
      };
    }
    document.cameras.push(camera);
  }
}

// Camera entries carry composed placement even though their `node` link remains available for later
// animation, matching buildGltfCameras. The COLLADA graph is already acyclic here: instance_node cycles
// were cut while materializing fresh document nodes, so an iterative root walk is sufficient.
function buildColladaNodeWorldMatrices(
  nodes: readonly Scene3DDocumentNode[],
  rootNodeIndices: readonly number[],
): (Matrix4Like | undefined)[] {
  const worldMatrices: (Matrix4Like | undefined)[] = new Array(nodes.length);
  const pending: { nodeIndex: number; parent: Matrix4Like | null }[] = [];
  for (let i = rootNodeIndices.length - 1; i >= 0; i--) pending.push({ nodeIndex: rootNodeIndices[i], parent: null });
  while (pending.length > 0) {
    const entry = pending.pop()!;
    const node = nodes[entry.nodeIndex];
    if (node === undefined) continue;
    const local = createMatrix4();
    const world = createMatrix4();
    composeMatrix4FromTransform3D(local, node.transform);
    if (entry.parent === null) world.m.set(local.m);
    else multiplyMatrix4(world, entry.parent, local);
    worldMatrices[entry.nodeIndex] = world;
    for (let i = node.children.length - 1; i >= 0; i--) {
      pending.push({ nodeIndex: node.children[i], parent: world });
    }
  }
  return worldMatrices;
}

function resolveColladaSkins(
  document: Scene3DDocument,
  deferred: readonly ColladaDeferredControllerBinding[],
  controllerMap: ReadonlyMap<string, ColladaDecodedSkin>,
  geometryIdToMeshIndex: ReadonlyMap<string, number>,
  nodeIdMap: ReadonlyMap<string, number>,
  diagnostics: ImportDiagnostic[],
): void {
  for (const binding of deferred) {
    const decoded = controllerMap.get(binding.controllerId);
    if (!decoded) {
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Recover,
        'collada.missing-reference',
        'parseCollada',
        { element: 'instance_controller', url: `#${binding.controllerId}` },
      );
      continue;
    }
    const meshIndex = geometryIdToMeshIndex.get(decoded.geometryRef);
    if (meshIndex !== undefined) document.nodes[binding.nodeIndex].mesh = meshIndex;

    const joints: number[] = [];
    const inverseBind: Scene3DDocumentSkin['inverseBind'] = [];
    for (let i = 0; i < decoded.jointNames.length; i++) {
      const jointName = decoded.jointNames[i];
      const jointIndex = nodeIdMap.get(jointName);
      if (jointIndex === undefined) {
        reportImportDiagnostic(
          diagnostics,
          ImportDiagnosticSeverity.Recover,
          'collada.missing-reference',
          'parseCollada',
          { element: 'skin joint', joint: jointName },
        );
        continue;
      }
      joints.push(jointIndex);
      // COLLADA inverse-bind matrices are row-major; transpose to column-major.
      const rowMajor = decoded.inverseBindMatrices[i];
      const m = new Float32Array(16);
      if (rowMajor && rowMajor.length >= 16) {
        for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) m[c * 4 + r] = rowMajor[r * 4 + c];
      } else {
        m[0] = 1;
        m[5] = 1;
        m[10] = 1;
        m[15] = 1;
      }
      inverseBind.push({ m });
    }

    const skinIndex = document.skins.length;
    document.skins.push({ inverseBind, joints });
    if (meshIndex !== undefined) document.meshes[meshIndex].skin = skinIndex;
  }
}

function resolveColladaAnimations(
  document: Scene3DDocument,
  channels: readonly ColladaDecodedAnimationChannel[],
  nodeIdMap: ReadonlyMap<string, number>,
  diagnostics: ImportDiagnostic[],
): void {
  if (channels.length === 0) return;

  const resolvedChannels: Scene3DDocumentAnimationChannel[] = [];
  let duration = 0;

  for (const ch of channels) {
    const slashIndex = ch.target.indexOf('/');
    if (slashIndex < 0) {
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Skip,
        'collada.unsupported-animation-target',
        'parseCollada',
        { target: ch.target },
      );
      continue;
    }
    const nodeId = ch.target.slice(0, slashIndex);
    const property = ch.target.slice(slashIndex + 1);

    const nodeIndex = nodeIdMap.get(nodeId);
    if (nodeIndex === undefined) {
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Drop,
        'collada.animation-target-unresolved',
        'parseCollada',
        { target: ch.target },
      );
      continue;
    }

    const interp = mapColladaInterpolation(ch.interpolation);
    const maxTime = ch.times.length > 0 ? ch.times[ch.times.length - 1] : 0;

    if (property === 'matrix' || property === 'transform') {
      if (ch.values.length < ch.times.length * 16) {
        reportImportDiagnostic(
          diagnostics,
          ImportDiagnosticSeverity.Drop,
          'collada.animation-cardinality',
          'parseCollada',
          { target: ch.target, expected: ch.times.length * 16, actual: ch.values.length },
        );
        continue;
      }
      const tValues: number[] = [];
      const rValues: number[] = [];
      const sValues: number[] = [];
      for (let k = 0; k < ch.times.length; k++) {
        const offset = k * 16;
        const rv = ch.values;
        // Row-major → column-major, then decompose.
        setMatrix4(
          __scratch,
          rv[offset],
          rv[offset + 4],
          rv[offset + 8],
          rv[offset + 12],
          rv[offset + 1],
          rv[offset + 5],
          rv[offset + 9],
          rv[offset + 13],
          rv[offset + 2],
          rv[offset + 6],
          rv[offset + 10],
          rv[offset + 14],
          rv[offset + 3],
          rv[offset + 7],
          rv[offset + 11],
          rv[offset + 15],
        );
        const trs = createTransform3D();
        decomposeMatrix4ToTransform3D(trs, __scratch);
        tValues.push(trs.position.x, trs.position.y, trs.position.z);
        rValues.push(trs.rotation.x, trs.rotation.y, trs.rotation.z, trs.rotation.w);
        sValues.push(trs.scale.x, trs.scale.y, trs.scale.z);
      }
      resolvedChannels.push(
        {
          node: nodeIndex,
          path: 'Translation',
          track: createAnimationTrack({ components: 3, interpolation: interp, times: ch.times, values: tValues }),
        },
        {
          node: nodeIndex,
          path: 'Rotation',
          track: createAnimationTrack({
            components: 4,
            interpolation: interp,
            quaternion: true,
            times: ch.times,
            values: rValues,
          }),
        },
        {
          node: nodeIndex,
          path: 'Scale',
          track: createAnimationTrack({ components: 3, interpolation: interp, times: ch.times, values: sValues }),
        },
      );
      duration = Math.max(duration, maxTime);
      continue;
    }

    let path: Scene3DAnimationPath;
    let components: number;
    let quaternion = false;
    let values: ArrayLike<number> = ch.values;

    if (property === 'translate' || property === 'translation') {
      path = 'Translation';
      components = 3;
    } else if (property === 'scale') {
      path = 'Scale';
      components = 3;
    } else if (property.endsWith('.ANGLE')) {
      const axisName = property.slice(0, -6);
      let ax = 0;
      let ay = 0;
      let az = 0;
      if (axisName === 'rotateX' || axisName === 'rotationX') ax = 1;
      else if (axisName === 'rotateY' || axisName === 'rotationY') ay = 1;
      else if (axisName === 'rotateZ' || axisName === 'rotationZ') az = 1;
      else {
        reportImportDiagnostic(
          diagnostics,
          ImportDiagnosticSeverity.Skip,
          'collada.unsupported-animation-target',
          'parseCollada',
          { target: ch.target },
        );
        continue;
      }
      path = 'Rotation';
      components = 4;
      quaternion = true;
      const qValues: number[] = [];
      for (let k = 0; k < ch.values.length; k++) {
        const halfRad = ((ch.values[k] * Math.PI) / 180) * 0.5;
        const s = Math.sin(halfRad);
        qValues.push(ax * s, ay * s, az * s, Math.cos(halfRad));
      }
      values = qValues;
    } else {
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Skip,
        'collada.unsupported-animation-target',
        'parseCollada',
        { target: ch.target },
      );
      continue;
    }

    resolvedChannels.push({
      node: nodeIndex,
      path,
      track: createAnimationTrack({ components, interpolation: interp, quaternion, times: ch.times, values }),
    });
    duration = Math.max(duration, maxTime);
  }

  if (resolvedChannels.length > 0) {
    document.animations.push({ channels: resolvedChannels, duration });
  }
}

function mapColladaInterpolation(modes: readonly string[]): AnimationInterpolation {
  if (modes.length === 0) return 'Linear';
  const first = modes[0];
  if (modes.every((m) => m === first)) {
    if (first === 'STEP') return 'Step';
    if (first === 'BEZIER') return 'Linear';
    return 'Linear';
  }
  return 'Linear';
}

function composeColladaTransformElements(nodeElement: XmlElement): Transform3D {
  const transform = createTransform3D();
  const transformElements = nodeElement.children.filter((c) => {
    const n = localName(c);
    return n === 'matrix' || n === 'translate' || n === 'rotate' || n === 'scale' || n === 'lookat';
  });
  if (transformElements.length === 0) return transform;

  const composed = createMatrix4();
  setMatrix4(composed, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);

  for (const element of transformElements) {
    const name = localName(element);
    const values = parseFloats(element.text);
    if (name === 'matrix' && values.length >= 16) {
      applyColladaMatrix(composed, values);
    } else if (name === 'translate' && values.length >= 3) {
      applyColladaTranslate(composed, values);
    } else if (name === 'rotate' && values.length >= 4) {
      applyColladaRotate(composed, values);
    } else if (name === 'scale' && values.length >= 3) {
      applyColladaScale(composed, values);
    } else if (name === 'lookat' && values.length >= 9) {
      applyColladaLookat(composed, values);
    }
  }

  decomposeMatrix4ToTransform3D(transform, composed);
  return transform;
}

function parseFloats(text: string): number[] {
  const parts = text.trim().split(/\s+/);
  const result: number[] = [];
  for (let i = 0; i < parts.length; i++) {
    const v = Number(parts[i]);
    if (!Number.isFinite(v)) continue;
    result.push(v);
  }
  return result;
}

function applyColladaMatrix(composed: Matrix4Like, values: number[]): void {
  // COLLADA matrices are row-major; Flight/OpenGL is column-major — transpose on load.
  setMatrix4(
    __scratch,
    values[0],
    values[4],
    values[8],
    values[12],
    values[1],
    values[5],
    values[9],
    values[13],
    values[2],
    values[6],
    values[10],
    values[14],
    values[3],
    values[7],
    values[11],
    values[15],
  );
  multiplyMatrix4(composed, composed, __scratch);
}

function applyColladaTranslate(composed: Matrix4Like, values: number[]): void {
  setMatrix4(__scratch, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, values[0], values[1], values[2], 1);
  multiplyMatrix4(composed, composed, __scratch);
}

function applyColladaRotate(composed: Matrix4Like, values: number[]): void {
  const ax = values[0];
  const ay = values[1];
  const az = values[2];
  const angleDeg = values[3];
  const angleRad = (angleDeg * Math.PI) / 180;
  const c = Math.cos(angleRad);
  const s = Math.sin(angleRad);
  const t = 1 - c;
  const len = Math.sqrt(ax * ax + ay * ay + az * az);
  if (len < 1e-10) return;
  const nx = ax / len;
  const ny = ay / len;
  const nz = az / len;
  setMatrix4(
    __scratch,
    t * nx * nx + c,
    t * nx * ny + s * nz,
    t * nx * nz - s * ny,
    0,
    t * nx * ny - s * nz,
    t * ny * ny + c,
    t * ny * nz + s * nx,
    0,
    t * nx * nz + s * ny,
    t * ny * nz - s * nx,
    t * nz * nz + c,
    0,
    0,
    0,
    0,
    1,
  );
  multiplyMatrix4(composed, composed, __scratch);
}

function applyColladaScale(composed: Matrix4Like, values: number[]): void {
  setMatrix4(__scratch, values[0], 0, 0, 0, 0, values[1], 0, 0, 0, 0, values[2], 0, 0, 0, 0, 1);
  multiplyMatrix4(composed, composed, __scratch);
}

function applyColladaLookat(composed: Matrix4Like, values: number[]): void {
  const ex = values[0],
    ey = values[1],
    ez = values[2];
  const tx = values[3],
    ty = values[4],
    tz = values[5];
  const ux = values[6],
    uy = values[7],
    uz = values[8];
  let fx = tx - ex,
    fy = ty - ey,
    fz = tz - ez;
  const fl = Math.sqrt(fx * fx + fy * fy + fz * fz);
  if (fl < 1e-10) return;
  fx /= fl;
  fy /= fl;
  fz /= fl;
  let sx = fy * uz - fz * uy,
    sy = fz * ux - fx * uz,
    sz = fx * uy - fy * ux;
  const sl = Math.sqrt(sx * sx + sy * sy + sz * sz);
  if (sl < 1e-10) return;
  sx /= sl;
  sy /= sl;
  sz /= sl;
  const upx = sy * fz - sz * fy;
  const upy = sz * fx - sx * fz;
  const upz = sx * fy - sy * fx;
  // COLLADA lookat builds a camera-like placement matrix (not a view matrix).
  // Columns: side, recomputed-up, -forward, eye.
  setMatrix4(__scratch, sx, upx, -fx, 0, sy, upy, -fy, 0, sz, upz, -fz, 0, ex, ey, ez, 1);
  multiplyMatrix4(composed, composed, __scratch);
}

// COLLADA requires the projection shape and clip distances, but damaged/exporter-minimal files often
// omit one. Recovery uses a neutral Flight camera: square 60° perspective (or unit orthographic
// half-extents) across a 0.1..1000 span.
// An omitted perspective aspect_ratio is valid and stays the SDK-wide authored fallback of 1.
const COLLADA_CAMERA_DEFAULT_ASPECT = 1;
const COLLADA_CAMERA_DEFAULT_FAR = 1000;
const COLLADA_CAMERA_DEFAULT_FOV_DEGREES = 60;
const COLLADA_CAMERA_DEFAULT_NEAR = 0.1;
const COLLADA_CAMERA_DEFAULT_ORTHO_HALF_EXTENT = 1;
const __scratch = createMatrix4();
