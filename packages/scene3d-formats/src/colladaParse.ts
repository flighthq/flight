import { createAnimationTrack } from '@flighthq/animation/contract';
import { createOrthographicProjection, createPerspectiveProjection } from '@flighthq/camera/contract';
import { packLinearToColor } from '@flighthq/color/contract';
import {
  composeMatrix4FromTransform3D,
  createMatrix4,
  createTransform3D,
  decomposeMatrix4ToTransform3D,
  multiplyMatrix4,
  setMatrix4,
} from '@flighthq/geometry/contract';
import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import {
  createAmbientLight,
  createDirectionalLight,
  createPointLight,
  createSpotLight,
} from '@flighthq/lighting/contract';
import { DEG_TO_RAD } from '@flighthq/math/contract';
import { createMeshGeometry } from '@flighthq/mesh/contract';
import type {
  AnimationInterpolation,
  ColladaImportOptions,
  ColladaParseResult,
  ColladaUpAxis,
  ImportDiagnostic,
  Light,
  Matrix4Like,
  MeshMorph,
  MorphTarget,
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
type ColladaLightKind = 'ambient' | 'directional' | 'point' | 'spot';
interface ColladaLightDefinition {
  color: number;
  decay: number;
  innerConeDegrees: number;
  intensity: number;
  kind: ColladaLightKind;
  name?: string;
  outerConeDegrees: number;
  spotBlend: number;
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

// Decodes the reusable light definitions without adding uninstantiated library entries to the document.
// A null value records an ID whose definition was present but malformed, so an instance of it is skipped
// without also being mislabeled as a missing reference.
function parseColladaLightDefinitions(
  root: XmlElement,
  diagnostics: ImportDiagnostic[],
): Map<string, ColladaLightDefinition | null> {
  const definitions = new Map<string, ColladaLightDefinition | null>();
  for (const lightElement of children(child(root, 'library_lights'), 'light')) {
    const id = idOf(lightElement);
    if (id === null || id.length === 0) {
      reportMalformedColladaLight(diagnostics, '(missing)', 'id');
      continue;
    }
    definitions.set(id, parseColladaLightDefinition(lightElement, id, diagnostics));
  }
  return definitions;
}

function parseColladaLightDefinition(
  lightElement: XmlElement,
  id: string,
  diagnostics: ImportDiagnostic[],
): ColladaLightDefinition | null {
  const techniqueCommon = child(lightElement, 'technique_common');
  if (techniqueCommon === undefined) {
    reportMalformedColladaLight(diagnostics, id, 'technique_common');
    return null;
  }
  const techniques = techniqueCommon.children.filter((entry) => {
    const name = localName(entry);
    return name === 'ambient' || name === 'directional' || name === 'point' || name === 'spot';
  });
  if (techniques.length !== 1) {
    reportMalformedColladaLight(diagnostics, id, 'type');
    return null;
  }

  const technique = techniques[0];
  const kind = localName(technique) as ColladaLightKind;
  const colorValues = parseFiniteNumberList(child(technique, 'color'));
  if (colorValues === null || colorValues.length !== 3 || colorValues.some((value) => value < 0)) {
    reportMalformedColladaLight(diagnostics, id, 'color');
    return null;
  }

  // Flight stores radiance as packed color × intensity. Pull HDR energy out of COLLADA's unbounded
  // linear RGB so packing does not clip it, while ordinary [0, 1] colors retain unit intensity.
  const colorIntensity = Math.max(1, colorValues[0], colorValues[1], colorValues[2]);
  const color = packLinearToColor([
    colorValues[0] / colorIntensity,
    colorValues[1] / colorIntensity,
    colorValues[2] / colorIntensity,
    1,
  ]);
  const definition: ColladaLightDefinition = {
    color,
    decay: 0,
    innerConeDegrees: 0,
    intensity: colorIntensity,
    kind,
    name: lightElement.attributes.name,
    outerConeDegrees: 0,
    spotBlend: 0,
  };

  if (kind === 'point' || kind === 'spot') {
    const constant = parseNonnegativeColladaLightScalar(technique, 'constant_attenuation', 1, id, diagnostics);
    const linear = parseNonnegativeColladaLightScalar(technique, 'linear_attenuation', 0, id, diagnostics);
    const quadratic = parseNonnegativeColladaLightScalar(technique, 'quadratic_attenuation', 0, id, diagnostics);
    if (constant === null || linear === null || quadratic === null) return null;
    const denominatorAtUnitDistance = constant + linear + quadratic;
    if (!(denominatorAtUnitDistance > 0)) {
      reportMalformedColladaLight(diagnostics, id, 'attenuation');
      return null;
    }

    // COLLADA uses 1/(c + l*d + q*d²), while Flight has intensity/d^decay. Matching the value and
    // logarithmic slope at d=1 gives an exact mapping whenever only one coefficient is non-zero and a
    // stable local approximation for mixed polynomials.
    definition.intensity *= 1 / denominatorAtUnitDistance;
    definition.decay = (linear + 2 * quadratic) / denominatorAtUnitDistance;
    if ([constant, linear, quadratic].filter((value) => value > 0).length > 1) {
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Recover,
        'collada.light-attenuation-approximated',
        'parseColladaLightDefinition',
        { constant, light: id, linear, quadratic },
      );
    }
  }

  if (kind === 'spot') {
    const angle = parseNonnegativeColladaLightScalar(technique, 'falloff_angle', 180, id, diagnostics);
    const exponent = parseNonnegativeColladaLightScalar(technique, 'falloff_exponent', 0, id, diagnostics);
    if (angle === null || exponent === null) return null;
    if (angle > 180) {
      reportMalformedColladaLight(diagnostics, id, 'falloff_angle');
      return null;
    }
    // COLLADA states a full cone aperture; Flight stores half-angles. Its normalized blend has no
    // unbounded exponent representation, so x/(x+1) preserves zero and orders every finite exponent.
    definition.outerConeDegrees = angle / 2;
    definition.spotBlend = exponent / (exponent + 1);
  }

  return definition;
}

function parseNonnegativeColladaLightScalar(
  parent: XmlElement,
  name: string,
  defaultValue: number,
  id: string,
  diagnostics: ImportDiagnostic[],
): number | null {
  const element = child(parent, name);
  if (element === undefined) return defaultValue;
  const values = parseFiniteNumberList(element);
  if (values === null || values.length !== 1 || values[0] < 0) {
    reportMalformedColladaLight(diagnostics, id, name);
    return null;
  }
  return values[0];
}

function parseFiniteNumberList(element: XmlElement | undefined): number[] | null {
  if (element === undefined) return null;
  const tokens = element.text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;
  const values = tokens.map(Number);
  return values.every(Number.isFinite) ? values : null;
}

function reportMalformedColladaLight(diagnostics: ImportDiagnostic[], light: string, field: string): void {
  reportImportDiagnostic(
    diagnostics,
    ImportDiagnosticSeverity.Drop,
    'collada.light-malformed',
    'parseColladaLightDefinition',
    { field, light },
  );
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
  return decodeColladaMorphsFromRoot(root, diagnostics);
}

function decodeColladaMorphsFromRoot(root: XmlElement, diagnostics: ImportDiagnostic[]): ColladaDecodedMorph[] {
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
      ln !== 'instance_material' &&
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
  const geometryPositions = new Map<string, number[]>();
  const geometryPrimitiveSymbols = new Map<string, string[]>();
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
    const verticesNormalMap = new Map<string, string>();
    for (const vertices of mesh.children.filter((e) => e.name === 'vertices'))
      for (const input of vertices.children.filter((e) => e.name === 'input')) {
        const semantic = input.attributes.semantic;
        const source = input.attributes.source?.replace(/^#/, '');
        if (idOf(vertices) && source) {
          if (semantic === 'POSITION') verticesMap.set(idOf(vertices)!, source);
          if (semantic === 'NORMAL') verticesNormalMap.set(idOf(vertices)!, source);
        }
      }
    const primitives = mesh.children.filter((e) => ['triangles', 'polylist', 'lines'].includes(e.name));
    if (primitives.length === 0) continue;
    const vertexMap = new Map<string, number>();
    const vertexData: number[][] = [];
    const allIndices: number[] = [];
    const primitiveSymbols: string[] = [];
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
      const raw = numbers(child(primitive, 'p'));
      const tuples: number[][] = [];
      if (primitive.name === 'polylist') {
        const counts = numbers(child(primitive, 'vcount'));
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
    const geoId = idOf(geometry);
    if (geoId) {
      geometryIdToMeshIndex.set(geoId, document.meshes.length);
      if (pos) geometryPositions.set(geoId, pos);
      if (primitiveSymbols.length > 0) geometryPrimitiveSymbols.set(geoId, primitiveSymbols);
    }
    document.meshes.push({
      geometry: createMeshGeometry({
        indices: Uint32Array.from(allIndices),
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

  const decodedMorphs = decodeColladaMorphsFromRoot(root, diagnostics);
  const morphMap = new Map<string, ColladaDecodedMorph>();
  for (const morph of decodedMorphs) morphMap.set(morph.controllerId, morph);

  const decodedAnimChannels = decodeColladaAnimationsFromRoot(root, diagnostics);
  const lightDefinitions = parseColladaLightDefinitions(root, diagnostics);

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
    geometryPositions,
    geometryPrimitiveSymbols,
    materialIndices,
    controllerMap,
    morphMap,
    decodedAnimChannels,
    lightDefinitions,
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
  materialOverrides: ReadonlyMap<string, number>;
  nodeIndex: number;
  skeletonRoot: string | null;
}

interface ColladaDeferredCameraBinding {
  cameraId: string;
  nodeIndex: number;
}

interface ColladaDeferredLightBinding {
  nodeIndex: number;
  url: string;
}

function buildColladaSceneHierarchy(
  document: Scene3DDocument,
  root: XmlElement,
  visualSceneLibrary: Map<string, XmlElement>,
  nodeLibrary: Map<string, XmlElement>,
  rootTransform: readonly number[],
  geometryIdToMeshIndex: ReadonlyMap<string, number>,
  cameraDefinitions: ReadonlyMap<string, ColladaCameraDefinition | null>,
  geometryPositions: ReadonlyMap<string, number[]>,
  geometryPrimitiveSymbols: ReadonlyMap<string, string[]>,
  materialIndices: ReadonlyMap<string, number>,
  controllerMap: ReadonlyMap<string, ColladaDecodedSkin>,
  morphMap: ReadonlyMap<string, ColladaDecodedMorph>,
  decodedAnimChannels: readonly ColladaDecodedAnimationChannel[],
  lightDefinitions: ReadonlyMap<string, ColladaLightDefinition | null>,
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
  const deferredLights: ColladaDeferredLightBinding[] = [];
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
        geometryPrimitiveSymbols,
        materialIndices,
        nodeIdMap,
        deferredCameras,
        deferredControllers,
        deferredLights,
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
  resolveColladaLights(document, deferredLights, lightDefinitions, rootNodeIndices, diagnostics);
  resolveColladaSkins(
    document,
    deferredControllers,
    controllerMap,
    morphMap,
    geometryIdToMeshIndex,
    geometryPositions,
    geometryPrimitiveSymbols,
    nodeIdMap,
    diagnostics,
  );
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
  geometryPrimitiveSymbols: ReadonlyMap<string, string[]>,
  materialIndices: ReadonlyMap<string, number>,
  nodeIdMap: Map<string, number>,
  deferredCameras: ColladaDeferredCameraBinding[],
  deferredControllers: ColladaDeferredControllerBinding[],
  deferredLights: ColladaDeferredLightBinding[],
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
          geometryPrimitiveSymbols,
          materialIndices,
          nodeIdMap,
          deferredCameras,
          deferredControllers,
          deferredLights,
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
          geometryPrimitiveSymbols,
          materialIndices,
          nodeIdMap,
          deferredCameras,
          deferredControllers,
          deferredLights,
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
        const geoId = url.slice(1);
        const meshIndex = geometryIdToMeshIndex.get(geoId);
        if (meshIndex !== undefined) {
          node.mesh = applyColladaBindMaterial(
            document,
            meshIndex,
            childElement,
            geometryPrimitiveSymbols.get(geoId),
            materialIndices,
          );
        }
      }
    } else if (name === 'instance_controller') {
      const url = childElement.attributes.url;
      if (url?.startsWith('#')) {
        const skeletonEl = child(childElement, 'skeleton');
        const skeletonRoot = skeletonEl?.text.trim().replace(/^#/, '') ?? null;
        const materialOverrides = parseColladaBindMaterial(childElement, materialIndices);
        deferredControllers.push({
          controllerId: url.slice(1),
          materialOverrides,
          nodeIndex,
          skeletonRoot,
        });
      }
    } else if (name === 'instance_light') {
      const url = childElement.attributes.url;
      // The generic instance validation above diagnoses an absent URL exactly once. Preserve every
      // present URL here so resolution can distinguish malformed/external and unresolved local targets.
      if (url !== undefined) deferredLights.push({ nodeIndex, url });
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

function resolveColladaLights(
  document: Scene3DDocument,
  deferred: readonly ColladaDeferredLightBinding[],
  definitions: ReadonlyMap<string, ColladaLightDefinition | null>,
  rootNodeIndices: readonly number[],
  diagnostics: ImportDiagnostic[],
): void {
  const worldMatrices = buildColladaNodeWorldMatrices(document.nodes, rootNodeIndices);
  for (const binding of deferred) {
    if (!binding.url.startsWith('#') || binding.url.length === 1) {
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Recover,
        'collada.missing-reference',
        'resolveColladaLights',
        { element: 'instance_light', url: binding.url },
      );
      continue;
    }
    const id = binding.url.slice(1);
    const definition = definitions.get(id);
    if (definition === undefined) {
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Recover,
        'collada.missing-reference',
        'resolveColladaLights',
        { element: 'instance_light', url: binding.url },
      );
      continue;
    }
    if (definition === null) continue;
    const worldMatrix = worldMatrices[binding.nodeIndex];
    if (worldMatrix === undefined) continue;
    const transform = createTransform3D();
    decomposeMatrix4ToTransform3D(transform, worldMatrix);
    document.lights.push({
      descriptor: createColladaLight(definition),
      name: definition.name,
      node: binding.nodeIndex,
      transform,
    });
  }
}

function createColladaLight(definition: Readonly<ColladaLightDefinition>): Light {
  const common = { color: definition.color, intensity: definition.intensity };
  if (definition.kind === 'ambient') return createAmbientLight(common);
  if (definition.kind === 'directional') {
    return createDirectionalLight({ ...common, direction: { x: 0, y: 0, z: -1 } });
  }
  if (definition.kind === 'point') {
    return createPointLight({ ...common, decay: definition.decay, range: -1 });
  }
  return createSpotLight({
    ...common,
    decay: definition.decay,
    direction: { x: 0, y: 0, z: -1 },
    innerConeDegrees: definition.innerConeDegrees,
    outerConeDegrees: definition.outerConeDegrees,
    range: -1,
    spotBlend: definition.spotBlend,
  });
}

function parseColladaBindMaterial(
  instanceElement: XmlElement,
  materialIndices: ReadonlyMap<string, number>,
): Map<string, number> {
  const symbolToIndex = new Map<string, number>();
  const bindMaterial = child(instanceElement, 'bind_material');
  if (!bindMaterial) return symbolToIndex;
  const technique = child(bindMaterial, 'technique_common');
  if (!technique) return symbolToIndex;
  for (const inst of children(technique, 'instance_material')) {
    const symbol = inst.attributes.symbol;
    const target = inst.attributes.target?.replace(/^#/, '');
    if (symbol && target) {
      const materialIndex = materialIndices.get(target);
      if (materialIndex !== undefined) symbolToIndex.set(symbol, materialIndex);
    }
  }
  return symbolToIndex;
}

function resolveColladaPrimitiveSymbols(
  symbols: readonly string[] | undefined,
  symbolToIndex: ReadonlyMap<string, number>,
): number[] {
  if (!symbols || symbolToIndex.size === 0) return [];
  const resolved: number[] = [];
  for (const sym of symbols) {
    const idx = symbolToIndex.get(sym);
    if (idx !== undefined) resolved.push(idx);
  }
  return resolved;
}

function applyColladaBindMaterial(
  document: Scene3DDocument,
  meshIndex: number,
  instanceElement: XmlElement,
  primitiveSymbols: readonly string[] | undefined,
  materialIndices: ReadonlyMap<string, number>,
): number {
  const symbolToIndex = parseColladaBindMaterial(instanceElement, materialIndices);
  return applyColladaMaterialOverrides(document, meshIndex, primitiveSymbols, symbolToIndex);
}

function applyColladaMaterialOverrides(
  document: Scene3DDocument,
  meshIndex: number,
  primitiveSymbols: readonly string[] | undefined,
  symbolToIndex: ReadonlyMap<string, number>,
): number {
  const resolved = resolveColladaPrimitiveSymbols(primitiveSymbols, symbolToIndex);
  if (resolved.length === 0) return meshIndex;
  const mesh = document.meshes[meshIndex];
  if (mesh.materials.length === 0) {
    mesh.materials = resolved;
    return meshIndex;
  }
  if (mesh.materials.length === resolved.length && mesh.materials.every((m, i) => m === resolved[i])) {
    return meshIndex;
  }
  const cloneIndex = document.meshes.length;
  document.meshes.push({ geometry: mesh.geometry, materials: resolved, name: mesh.name, skin: mesh.skin });
  return cloneIndex;
}

function resolveColladaSkins(
  document: Scene3DDocument,
  deferred: readonly ColladaDeferredControllerBinding[],
  controllerMap: ReadonlyMap<string, ColladaDecodedSkin>,
  morphMap: ReadonlyMap<string, ColladaDecodedMorph>,
  geometryIdToMeshIndex: ReadonlyMap<string, number>,
  geometryPositions: ReadonlyMap<string, number[]>,
  geometryPrimitiveSymbols: ReadonlyMap<string, string[]>,
  nodeIdMap: ReadonlyMap<string, number>,
  diagnostics: ImportDiagnostic[],
): void {
  for (const binding of deferred) {
    const decoded = controllerMap.get(binding.controllerId);
    const morph = decoded ? morphMap.get(decoded.geometryRef) : morphMap.get(binding.controllerId);

    if (!decoded && !morph) {
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Recover,
        'collada.missing-reference',
        'parseCollada',
        { element: 'instance_controller', url: `#${binding.controllerId}` },
      );
      continue;
    }

    const geometryRef = morph ? morph.baseGeometry : decoded!.geometryRef;
    let meshIndex = geometryIdToMeshIndex.get(geometryRef);
    if (meshIndex !== undefined) {
      meshIndex = applyColladaMaterialOverrides(
        document,
        meshIndex,
        geometryPrimitiveSymbols.get(geometryRef),
        binding.materialOverrides,
      );
      document.nodes[binding.nodeIndex].mesh = meshIndex;
    }

    if (morph && meshIndex !== undefined) {
      const morphResult = buildColladaMeshMorph(morph, geometryPositions, diagnostics);
      if (morphResult) document.meshes[meshIndex].morph = morphResult;
    }

    if (decoded) {
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
}

function buildColladaMeshMorph(
  morph: ColladaDecodedMorph,
  geometryPositions: ReadonlyMap<string, number[]>,
  diagnostics: ImportDiagnostic[],
): MeshMorph | null {
  const basePos = geometryPositions.get(morph.baseGeometry);
  if (!basePos) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Recover, 'collada.missing-reference', 'parseCollada', {
      element: 'morph base geometry',
      geometry: morph.baseGeometry,
    });
    return null;
  }
  const vertexCount = Math.floor(basePos.length / 3);
  const targets: MorphTarget[] = [];
  for (const targetId of morph.targets) {
    const targetPos = geometryPositions.get(targetId);
    if (!targetPos) {
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Recover,
        'collada.missing-reference',
        'parseCollada',
        { element: 'morph target geometry', geometry: targetId },
      );
      continue;
    }
    const positionDeltas = new Float32Array(vertexCount * 3);
    for (let i = 0; i < vertexCount * 3; i++) {
      positionDeltas[i] = morph.method === 'NORMALIZED' ? (targetPos[i] ?? 0) - (basePos[i] ?? 0) : (targetPos[i] ?? 0);
    }
    targets.push({ normalDeltas: null, positionDeltas, tangentDeltas: null });
  }
  if (targets.length === 0) return null;
  return { targets, weights: Float32Array.from(morph.weights.slice(0, targets.length)) };
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
