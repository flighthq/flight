import { createTransform3D } from '@flighthq/geometry/contract';
import type {
  FlightDocument,
  FlightDocumentFields,
  FlightDocumentNode,
  FlightDocumentRefusalExplanation,
  FlightDocumentResourceDescriptor,
  FlightDocumentScene,
  FlightDocumentScene2D,
  FlightDocumentScene3D,
  FlightDocumentText,
  FlightDocumentValue,
  Light,
  Projection,
  Scene3DDocumentCamera,
  Scene3DDocumentLight,
  Transform3D,
} from '@flighthq/types/contract';
import { EntityRuntimeKey, FlightDocumentRefusalReason } from '@flighthq/types/contract';

import { createDocumentRefusal } from './sceneDocumentRefusal';
import { parseSceneDocumentYamlSubset } from './sceneDocumentYamlSubset';

export function explainFlightDocumentText(text: FlightDocumentText): FlightDocumentRefusalExplanation | null {
  return readFlightDocumentText(text).refusal;
}

export function formatFlightDocumentText(document: Readonly<FlightDocument>): FlightDocumentText {
  if (document.version !== 1) throw new RangeError('FlightDocument.version must be 1');
  if (document.scenes.length === 0) throw new RangeError('FlightDocument.scenes must not be empty');
  if (
    !Number.isInteger(document.defaultScene) ||
    document.defaultScene < 0 ||
    document.defaultScene >= document.scenes.length
  ) {
    throw new RangeError('FlightDocument.defaultScene must index FlightDocument.scenes');
  }

  const lines = ['flight: 1', 'defaultScene: ' + String(document.defaultScene)];
  if (document.resources.length > 0) appendResources(lines, document.resources);
  lines.push('scenes:');
  for (const scene of document.scenes) appendScene(lines, scene);

  const text = lines.join('\n') + '\n';
  const emitted = parseSceneDocumentYamlSubset(text);
  if (!emitted.ok) {
    throw new RangeError('FlightDocument cannot be represented by the YAML subset: ' + emitted.kind);
  }
  return text;
}

export function parseFlightDocumentText(text: FlightDocumentText): FlightDocument | null {
  return readFlightDocumentText(text).document;
}

interface FlightDocumentTextReadContext {
  refusal: FlightDocumentRefusalExplanation | null;
}

interface FlightDocumentTextReadResult {
  document: FlightDocument | null;
  refusal: FlightDocumentRefusalExplanation | null;
}

interface FlightDocumentTextVector3 {
  x: number;
  y: number;
  z: number;
}

interface FlightDocumentTextQuaternion extends FlightDocumentTextVector3 {
  w: number;
}

function appendCamera(lines: string[], camera: Readonly<Scene3DDocumentCamera>): void {
  lines.push('      - far: ' + formatNumber(camera.far));
  if (camera.name !== undefined) lines.push('        name: ' + formatString(camera.name));
  lines.push('        near: ' + formatNumber(camera.near));
  if (camera.node !== undefined) lines.push('        node: ' + formatNumber(camera.node));
  lines.push('        projection:');
  appendProjection(lines, camera.projection, 10);
  lines.push('        transform:');
  appendTransform3D(lines, camera.transform, 10);
}

function appendFields(
  lines: string[],
  fields: Readonly<FlightDocumentFields>,
  indent: number,
  reserved: readonly string[],
): void {
  for (const key of Object.keys(fields).sort()) {
    if (reserved.includes(key)) throw new TypeError('FlightDocument field collides with structural key: ' + key);
    appendMappingEntry(lines, key, fields[key], indent);
  }
}

function appendLight(lines: string[], light: Readonly<Scene3DDocumentLight>): void {
  lines.push('      - descriptor:');
  lines.push('          kind: ' + formatString(light.descriptor.kind));
  appendObjectEntries(lines, light.descriptor, 10, ['kind']);
  if (light.name !== undefined) lines.push('        name: ' + formatString(light.name));
  if (light.node !== undefined) lines.push('        node: ' + formatNumber(light.node));
  lines.push('        transform:');
  appendTransform3D(lines, light.transform, 10);
}

function appendMappingEntry(lines: string[], key: string, value: unknown, indent: number): void {
  const prefix = ' '.repeat(indent) + formatKey(key) + ':';
  if (isFlightDocumentScalar(value)) {
    lines.push(prefix + ' ' + formatScalar(value));
    return;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      throw new TypeError('The FlightDocument YAML subset cannot represent an empty sequence field');
    }
    lines.push(prefix);
    appendSequence(lines, value, indent + 2);
    return;
  }
  if (!isMapping(value)) throw new TypeError('FlightDocument contains a value outside its YAML subset');
  if (Object.keys(value).length === 0) {
    lines.push(prefix + ' {}');
    return;
  }
  lines.push(prefix);
  appendObjectEntries(lines, value, indent + 2, []);
}

function appendNode(lines: string[], node: Readonly<FlightDocumentNode>, indent: number): void {
  const prefix = ' '.repeat(indent);
  lines.push(prefix + 'kind: ' + formatString(node.kind));
  appendFields(lines, node.fields, indent, NODE_RESERVED_FIELDS);
  if (node.children.length > 0) {
    lines.push(prefix + 'children:');
    for (const child of node.children) appendNodeSequenceItem(lines, child, indent + 2);
  }
}

function appendNodeSequenceItem(lines: string[], node: Readonly<FlightDocumentNode>, indent: number): void {
  const prefix = ' '.repeat(indent);
  lines.push(prefix + '- kind: ' + formatString(node.kind));
  appendFields(lines, node.fields, indent + 2, NODE_RESERVED_FIELDS);
  if (node.children.length > 0) {
    lines.push(prefix + '  children:');
    for (const child of node.children) appendNodeSequenceItem(lines, child, indent + 4);
  }
}

function appendObjectEntries(
  lines: string[],
  value: Readonly<object>,
  indent: number,
  reserved: readonly string[],
): void {
  for (const [key, entry] of Object.entries(value).sort(([left], [right]) => left.localeCompare(right))) {
    if (reserved.includes(key)) continue;
    if (entry !== undefined) appendMappingEntry(lines, key, entry, indent);
  }
}

function appendProjection(lines: string[], projection: Readonly<Projection>, indent: number): void {
  const prefix = ' '.repeat(indent);
  if (projection.kind === 'orthographic') {
    lines.push(prefix + 'halfHeight: ' + formatNumber(projection.halfHeight));
    lines.push(prefix + 'halfWidth: ' + formatNumber(projection.halfWidth));
  } else {
    lines.push(prefix + 'aspect: ' + formatNumber(projection.aspect));
    lines.push(prefix + 'fovY: ' + formatNumber(projection.fovY));
  }
  lines.push(prefix + 'kind: ' + projection.kind);
}

function appendResources(lines: string[], resources: readonly Readonly<FlightDocumentResourceDescriptor>[]): void {
  lines.push('resources:');
  for (const resource of resources) {
    lines.push('  - kind: ' + formatString(resource.kind));
    lines.push('    key: ' + formatString(resource.key));
    appendFields(lines, resource.fields, 4, RESOURCE_RESERVED_FIELDS);
  }
}

function appendScene(lines: string[], scene: Readonly<FlightDocumentScene>): void {
  lines.push('  - kind: ' + scene.kind);
  if (scene.kind === 'Scene2D') {
    if (scene.backgroundColor !== null) {
      lines.push('    backgroundColor: ' + formatNumber(scene.backgroundColor));
    }
  } else {
    if (scene.cameras.length > 0) {
      lines.push('    cameras:');
      for (const camera of scene.cameras) appendCamera(lines, camera);
    }
    if (scene.lights.length > 0) {
      lines.push('    lights:');
      for (const light of scene.lights) appendLight(lines, light);
    }
  }
  lines.push('    scene:');
  appendNode(lines, scene.scene, 6);
}

function appendSequence(lines: string[], values: readonly unknown[], indent: number): void {
  const prefix = ' '.repeat(indent);
  for (const value of values) {
    if (isFlightDocumentScalar(value)) {
      lines.push(prefix + '- ' + formatScalar(value));
      continue;
    }
    if (Array.isArray(value)) {
      if (value.length === 0) {
        throw new TypeError('The FlightDocument YAML subset cannot represent an empty sequence field');
      }
      lines.push(prefix + '-');
      appendSequence(lines, value, indent + 2);
      continue;
    }
    if (!isMapping(value)) throw new TypeError('FlightDocument contains a value outside its YAML subset');
    if (Object.keys(value).length === 0) {
      lines.push(prefix + '- {}');
      continue;
    }
    lines.push(prefix + '-');
    appendObjectEntries(lines, value, indent + 2, []);
  }
}

function appendTransform3D(lines: string[], transform: Readonly<Transform3D>, indent: number): void {
  const prefix = ' '.repeat(indent);
  lines.push(prefix + 'position:');
  appendVector3(lines, transform.position, indent + 2);
  lines.push(prefix + 'rotation:');
  lines.push(' '.repeat(indent + 2) + 'w: ' + formatNumber(transform.rotation.w));
  appendVector3(lines, transform.rotation, indent + 2);
  lines.push(prefix + 'scale:');
  appendVector3(lines, transform.scale, indent + 2);
}

function appendVector3(lines: string[], value: Readonly<FlightDocumentTextVector3>, indent: number): void {
  const prefix = ' '.repeat(indent);
  lines.push(prefix + 'x: ' + formatNumber(value.x));
  lines.push(prefix + 'y: ' + formatNumber(value.y));
  lines.push(prefix + 'z: ' + formatNumber(value.z));
}

function copyFlightDocumentFields(
  mapping: Readonly<Record<string, unknown>>,
  reserved: readonly string[],
  path: string,
  context: FlightDocumentTextReadContext,
): FlightDocumentFields | null {
  const fields: FlightDocumentFields = {};
  for (const key of Object.keys(mapping)) {
    if (reserved.includes(key)) continue;
    const value = copyFlightDocumentValue(mapping[key], appendPath(path, key), context);
    if (value === INVALID_FLIGHT_DOCUMENT_VALUE) return null;
    fields[key] = value;
  }
  return fields;
}

function copyFlightDocumentValue(
  value: unknown,
  path: string,
  context: FlightDocumentTextReadContext,
): FlightDocumentValue | typeof INVALID_FLIGHT_DOCUMENT_VALUE {
  if (isFlightDocumentScalar(value)) return value;
  if (Array.isArray(value)) {
    const out: FlightDocumentValue[] = [];
    for (let index = 0; index < value.length; index++) {
      const item = copyFlightDocumentValue(value[index], `${path}[${index}]`, context);
      if (item === INVALID_FLIGHT_DOCUMENT_VALUE) return item;
      out.push(item);
    }
    return out;
  }
  if (!isMapping(value)) return refuseValue(context, FlightDocumentRefusalReason.StructureInvalid, path);
  const out: FlightDocumentFields = {};
  for (const key of Object.keys(value)) {
    const item = copyFlightDocumentValue(value[key], appendPath(path, key), context);
    if (item === INVALID_FLIGHT_DOCUMENT_VALUE) return item;
    out[key] = item;
  }
  return out;
}

function formatKey(value: string): string {
  return SAFE_PLAIN_SCALAR_PATTERN.test(value) ? value : JSON.stringify(value);
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) throw new RangeError('FlightDocument numbers must be finite');
  if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
    throw new RangeError('FlightDocument integers must be safe integers');
  }
  return String(value);
}

function formatScalar(value: boolean | number | string | null): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return formatNumber(value);
  return formatString(value);
}

function formatString(value: string): string {
  if (SAFE_PLAIN_SCALAR_PATTERN.test(value) && value !== 'false' && value !== 'null' && value !== 'true') {
    return value;
  }
  return JSON.stringify(value);
}

function hasOnlyKeys(mapping: Readonly<Record<string, unknown>>, allowed: readonly string[]): boolean {
  return Object.keys(mapping).every((key) => allowed.includes(key));
}

function isFlightDocumentScalar(value: unknown): value is boolean | number | string | null {
  return value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string';
}

function isMapping(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readCamera(
  value: unknown,
  path: string,
  context: FlightDocumentTextReadContext,
): Scene3DDocumentCamera | null {
  if (!isMapping(value) || !hasOnlyKeys(value, CAMERA_KEYS)) return refuse(context, path);
  const far = value['far'];
  const near = value['near'];
  if (typeof far !== 'number') return refuse(context, appendPath(path, 'far'));
  if (typeof near !== 'number') return refuse(context, appendPath(path, 'near'));
  const projection = readProjection(value['projection'], appendPath(path, 'projection'), context);
  if (projection === null) return null;
  const transform = readTransform3D(value['transform'], appendPath(path, 'transform'), context);
  if (transform === null) return null;
  const camera: Scene3DDocumentCamera = { far, near, projection, transform };
  const name = value['name'];
  if (name !== undefined) {
    if (typeof name !== 'string') return refuse(context, appendPath(path, 'name'));
    camera.name = name;
  }
  const node = readOptionalIndex(value['node'], appendPath(path, 'node'), context);
  if (node === INVALID_OPTIONAL_INDEX) return null;
  if (node !== null) camera.node = node;
  return camera;
}

function readFlightDocumentText(text: FlightDocumentText): FlightDocumentTextReadResult {
  const parsed = parseSceneDocumentYamlSubset(text);
  if (!parsed.ok) {
    return {
      document: null,
      refusal: {
        actual: parsed.actual,
        column: parsed.column,
        kind: null,
        limit: parsed.limit,
        line: parsed.line,
        offset: parsed.offset,
        path: '',
        reason: parsed.kind,
        resourceKey: null,
        version: null,
      },
    };
  }

  const context: FlightDocumentTextReadContext = { refusal: null };
  if (!isMapping(parsed.value) || !hasOnlyKeys(parsed.value, DOCUMENT_KEYS)) {
    return { document: null, refusal: createDocumentRefusal(FlightDocumentRefusalReason.StructureInvalid, '') };
  }
  const mapping = parsed.value;
  const version = mapping['flight'];
  if (typeof version !== 'number') {
    return { document: null, refusal: createDocumentRefusal(FlightDocumentRefusalReason.StructureInvalid, 'flight') };
  }
  if (version !== 1) {
    const refusal = createDocumentRefusal(FlightDocumentRefusalReason.VersionUnsupported, 'version');
    refusal.version = version;
    return { document: null, refusal };
  }

  const scenesRaw = mapping['scenes'];
  if (scenesRaw === null) {
    return { document: null, refusal: createDocumentRefusal(FlightDocumentRefusalReason.ScenesEmpty, 'scenes') };
  }
  if (!Array.isArray(scenesRaw)) {
    return { document: null, refusal: createDocumentRefusal(FlightDocumentRefusalReason.StructureInvalid, 'scenes') };
  }
  if (scenesRaw.length === 0) {
    return { document: null, refusal: createDocumentRefusal(FlightDocumentRefusalReason.ScenesEmpty, 'scenes') };
  }

  const defaultScene = mapping['defaultScene'];
  if (typeof defaultScene !== 'number' || !Number.isInteger(defaultScene)) {
    return {
      document: null,
      refusal: createDocumentRefusal(FlightDocumentRefusalReason.StructureInvalid, 'defaultScene'),
    };
  }
  if (defaultScene < 0 || defaultScene >= scenesRaw.length) {
    const refusal = createDocumentRefusal(FlightDocumentRefusalReason.DefaultSceneOutOfRange, 'defaultScene');
    refusal.actual = defaultScene;
    refusal.limit = scenesRaw.length - 1;
    return { document: null, refusal };
  }

  const resources = readResources(mapping['resources'], context);
  if (resources === null) return { document: null, refusal: context.refusal };
  const scenes: FlightDocumentScene[] = [];
  for (let index = 0; index < scenesRaw.length; index++) {
    const scene = readScene(scenesRaw[index], index, context);
    if (scene === null) return { document: null, refusal: context.refusal };
    scenes.push(scene);
  }
  const firstScene = scenes[0];
  if (firstScene === undefined) {
    return { document: null, refusal: createDocumentRefusal(FlightDocumentRefusalReason.ScenesEmpty, 'scenes') };
  }
  return {
    document: {
      defaultScene,
      resources,
      scenes: [firstScene, ...scenes.slice(1)],
      version: 1,
    },
    refusal: null,
  };
}

function readLight(value: unknown, path: string, context: FlightDocumentTextReadContext): Scene3DDocumentLight | null {
  if (!isMapping(value) || !hasOnlyKeys(value, LIGHT_KEYS)) return refuse(context, path);
  const descriptorRaw = value['descriptor'];
  const descriptorPath = appendPath(path, 'descriptor');
  if (!isMapping(descriptorRaw)) return refuse(context, descriptorPath);
  const kind = descriptorRaw['kind'];
  if (typeof kind !== 'string') return refuse(context, appendPath(descriptorPath, 'kind'));
  const descriptorFields = copyFlightDocumentFields(descriptorRaw, ['kind'], descriptorPath, context);
  if (descriptorFields === null) return null;
  // Light is an open kind family, so the text codec cannot select a closed concrete constructor. The
  // logical descriptor still receives the standard entity runtime slot; materialization owns any
  // kind-specific interpretation and runtime construction.
  const descriptor: Light = Object.assign({ [EntityRuntimeKey]: undefined, kind }, descriptorFields);
  const transform = readTransform3D(value['transform'], appendPath(path, 'transform'), context);
  if (transform === null) return null;
  const light: Scene3DDocumentLight = { descriptor, transform };
  const name = value['name'];
  if (name !== undefined) {
    if (typeof name !== 'string') return refuse(context, appendPath(path, 'name'));
    light.name = name;
  }
  const node = readOptionalIndex(value['node'], appendPath(path, 'node'), context);
  if (node === INVALID_OPTIONAL_INDEX) return null;
  if (node !== null) light.node = node;
  return light;
}

function readNode(value: unknown, path: string, context: FlightDocumentTextReadContext): FlightDocumentNode | null {
  if (!isMapping(value)) return refuse(context, path);
  const kind = value['kind'];
  if (typeof kind !== 'string') return refuse(context, appendPath(path, 'kind'));
  const childrenRaw = value['children'];
  const children: FlightDocumentNode[] = [];
  if (childrenRaw !== undefined) {
    if (!Array.isArray(childrenRaw)) return refuse(context, appendPath(path, 'children'));
    for (let index = 0; index < childrenRaw.length; index++) {
      const child = readNode(childrenRaw[index], `${path}.children[${index}]`, context);
      if (child === null) return null;
      children.push(child);
    }
  }
  const fields = copyFlightDocumentFields(value, NODE_RESERVED_FIELDS, path, context);
  return fields === null ? null : { children, fields, kind };
}

function readOptionalIndex(
  value: unknown,
  path: string,
  context: FlightDocumentTextReadContext,
): number | null | typeof INVALID_OPTIONAL_INDEX {
  if (value === undefined) return null;
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
  refuse(context, path);
  return INVALID_OPTIONAL_INDEX;
}

function readProjection(value: unknown, path: string, context: FlightDocumentTextReadContext): Projection | null {
  if (!isMapping(value)) return refuse(context, path);
  const kind = value['kind'];
  if (kind === 'orthographic') {
    if (!hasOnlyKeys(value, ORTHOGRAPHIC_PROJECTION_KEYS)) return refuse(context, path);
    const halfHeight = value['halfHeight'];
    const halfWidth = value['halfWidth'];
    if (typeof halfHeight !== 'number') return refuse(context, appendPath(path, 'halfHeight'));
    if (typeof halfWidth !== 'number') return refuse(context, appendPath(path, 'halfWidth'));
    return { halfHeight, halfWidth, kind };
  }
  if (kind === 'perspective') {
    if (!hasOnlyKeys(value, PERSPECTIVE_PROJECTION_KEYS)) return refuse(context, path);
    const aspect = value['aspect'];
    const fovY = value['fovY'];
    if (typeof aspect !== 'number') return refuse(context, appendPath(path, 'aspect'));
    if (typeof fovY !== 'number') return refuse(context, appendPath(path, 'fovY'));
    return { aspect, fovY, kind };
  }
  return refuse(context, appendPath(path, 'kind'));
}

function readQuaternion(
  value: unknown,
  path: string,
  context: FlightDocumentTextReadContext,
): FlightDocumentTextQuaternion | null {
  if (!isMapping(value) || !hasOnlyKeys(value, QUATERNION_KEYS)) return refuse(context, path);
  const vector = readVector3(value, path, context, QUATERNION_KEYS);
  if (vector === null) return null;
  const w = value['w'];
  if (typeof w !== 'number') return refuse(context, appendPath(path, 'w'));
  return { ...vector, w };
}

function readResources(
  value: unknown,
  context: FlightDocumentTextReadContext,
): FlightDocumentResourceDescriptor[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return refuse(context, 'resources');
  const resources: FlightDocumentResourceDescriptor[] = [];
  for (let index = 0; index < value.length; index++) {
    const path = `resources[${index}]`;
    const raw = value[index];
    if (!isMapping(raw)) return refuse(context, path);
    const kind = raw['kind'];
    const key = raw['key'];
    if (typeof kind !== 'string') return refuse(context, appendPath(path, 'kind'));
    if (typeof key !== 'string') return refuse(context, appendPath(path, 'key'));
    const fields = copyFlightDocumentFields(raw, RESOURCE_RESERVED_FIELDS, path, context);
    if (fields === null) return null;
    resources.push({ fields, key, kind });
  }
  return resources;
}

function readScene(value: unknown, index: number, context: FlightDocumentTextReadContext): FlightDocumentScene | null {
  const path = `scenes[${index}]`;
  if (!isMapping(value)) return refuse(context, path);
  const kind = value['kind'];
  if (kind === 'Scene2D') return readScene2D(value, path, context);
  if (kind === 'Scene3D') return readScene3D(value, path, context);
  return refuse(context, appendPath(path, 'kind'));
}

function readScene2D(
  mapping: Readonly<Record<string, unknown>>,
  path: string,
  context: FlightDocumentTextReadContext,
): FlightDocumentScene2D | null {
  if (!hasOnlyKeys(mapping, SCENE_2D_KEYS)) return refuse(context, path);
  const backgroundColor = mapping['backgroundColor'];
  if (backgroundColor !== undefined && backgroundColor !== null && typeof backgroundColor !== 'number') {
    return refuse(context, appendPath(path, 'backgroundColor'));
  }
  const scene = readNode(mapping['scene'], appendPath(path, 'scene'), context);
  if (scene === null) return null;
  return { backgroundColor: backgroundColor ?? null, kind: 'Scene2D', scene };
}

function readScene3D(
  mapping: Readonly<Record<string, unknown>>,
  path: string,
  context: FlightDocumentTextReadContext,
): FlightDocumentScene3D | null {
  if (!hasOnlyKeys(mapping, SCENE_3D_KEYS)) return refuse(context, path);
  const camerasRaw = mapping['cameras'];
  const cameras: Scene3DDocumentCamera[] = [];
  if (camerasRaw !== undefined) {
    if (!Array.isArray(camerasRaw)) return refuse(context, appendPath(path, 'cameras'));
    for (let index = 0; index < camerasRaw.length; index++) {
      const camera = readCamera(camerasRaw[index], `${path}.cameras[${index}]`, context);
      if (camera === null) return null;
      cameras.push(camera);
    }
  }
  const lightsRaw = mapping['lights'];
  const lights: Scene3DDocumentLight[] = [];
  if (lightsRaw !== undefined) {
    if (!Array.isArray(lightsRaw)) return refuse(context, appendPath(path, 'lights'));
    for (let index = 0; index < lightsRaw.length; index++) {
      const light = readLight(lightsRaw[index], `${path}.lights[${index}]`, context);
      if (light === null) return null;
      lights.push(light);
    }
  }
  const scene = readNode(mapping['scene'], appendPath(path, 'scene'), context);
  if (scene === null) return null;
  return { cameras, kind: 'Scene3D', lights, scene };
}

function readTransform3D(value: unknown, path: string, context: FlightDocumentTextReadContext): Transform3D | null {
  if (!isMapping(value) || !hasOnlyKeys(value, TRANSFORM_3D_KEYS)) return refuse(context, path);
  const position = readVector3(value['position'], appendPath(path, 'position'), context, VECTOR_3_KEYS);
  if (position === null) return null;
  const rotation = readQuaternion(value['rotation'], appendPath(path, 'rotation'), context);
  if (rotation === null) return null;
  const scale = readVector3(value['scale'], appendPath(path, 'scale'), context, VECTOR_3_KEYS);
  if (scale === null) return null;
  const transform = createTransform3D();
  Object.assign(transform.position, position);
  Object.assign(transform.rotation, rotation);
  Object.assign(transform.scale, scale);
  return transform;
}

function readVector3(
  value: unknown,
  path: string,
  context: FlightDocumentTextReadContext,
  allowed: readonly string[],
): FlightDocumentTextVector3 | null {
  if (!isMapping(value) || !hasOnlyKeys(value, allowed)) return refuse(context, path);
  const x = value['x'];
  const y = value['y'];
  const z = value['z'];
  if (typeof x !== 'number') return refuse(context, appendPath(path, 'x'));
  if (typeof y !== 'number') return refuse(context, appendPath(path, 'y'));
  if (typeof z !== 'number') return refuse(context, appendPath(path, 'z'));
  return { x, y, z };
}

function refuse(context: FlightDocumentTextReadContext, path: string): null {
  context.refusal ??= createDocumentRefusal(FlightDocumentRefusalReason.StructureInvalid, path);
  return null;
}

function refuseValue(
  context: FlightDocumentTextReadContext,
  reason: typeof FlightDocumentRefusalReason.StructureInvalid,
  path: string,
): typeof INVALID_FLIGHT_DOCUMENT_VALUE {
  context.refusal ??= createDocumentRefusal(reason, path);
  return INVALID_FLIGHT_DOCUMENT_VALUE;
}

function appendPath(path: string, key: string): string {
  return path === '' ? key : path + '.' + key;
}

const INVALID_FLIGHT_DOCUMENT_VALUE = Symbol('invalid-flight-document-value');
const INVALID_OPTIONAL_INDEX = Symbol('invalid-flight-document-optional-index');
const CAMERA_KEYS = ['far', 'name', 'near', 'node', 'projection', 'transform'];
const DOCUMENT_KEYS = ['defaultScene', 'flight', 'resources', 'scenes'];
const LIGHT_KEYS = ['descriptor', 'name', 'node', 'transform'];
const NODE_RESERVED_FIELDS = ['children', 'kind'];
const ORTHOGRAPHIC_PROJECTION_KEYS = ['halfHeight', 'halfWidth', 'kind'];
const PERSPECTIVE_PROJECTION_KEYS = ['aspect', 'fovY', 'kind'];
const QUATERNION_KEYS = ['w', 'x', 'y', 'z'];
const RESOURCE_RESERVED_FIELDS = ['key', 'kind'];
const SAFE_PLAIN_SCALAR_PATTERN = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
const SCENE_2D_KEYS = ['backgroundColor', 'kind', 'scene'];
const SCENE_3D_KEYS = ['cameras', 'kind', 'lights', 'scene'];
const TRANSFORM_3D_KEYS = ['position', 'rotation', 'scale'];
const VECTOR_3_KEYS = ['x', 'y', 'z'];
