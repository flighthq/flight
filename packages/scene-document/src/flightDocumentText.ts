import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { createTransform3D } from '@flighthq/geometry/contract';
import type {
  EntityConstruction,
  FlightDocument,
  FlightDocumentFields,
  FlightDocumentInteractiveState,
  FlightDocumentInteractiveStateExtensionDescriptor,
  FlightDocumentInteractiveStateTransitionDescriptor,
  FlightDocumentInteractiveStates,
  FlightDocumentLayoutDescriptor,
  FlightDocumentLayoutNode,
  FlightDocumentNode,
  FlightDocumentRefusalExplanation,
  FlightDocumentResourceDescriptor,
  FlightDocumentScene,
  FlightDocumentScene2D,
  FlightDocumentScene3D,
  FlightDocumentText,
  FlightDocumentToken,
  FlightDocumentTokenValues,
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
  appendNodeInteractiveMetadata(lines, node, indent);
  if (node.children.length > 0) {
    lines.push(prefix + 'children:');
    for (const child of node.children) appendNodeSequenceItem(lines, child, indent + 2);
  }
}

function appendNodeSequenceItem(lines: string[], node: Readonly<FlightDocumentNode>, indent: number): void {
  const prefix = ' '.repeat(indent);
  lines.push(prefix + '- kind: ' + formatString(node.kind));
  appendFields(lines, node.fields, indent + 2, NODE_RESERVED_FIELDS);
  appendNodeInteractiveMetadata(lines, node, indent + 2);
  if (node.children.length > 0) {
    lines.push(prefix + '  children:');
    for (const child of node.children) appendNodeSequenceItem(lines, child, indent + 4);
  }
}

function appendInteractiveState(
  lines: string[],
  state: Readonly<FlightDocumentInteractiveState>,
  indent: number,
): void {
  const entries = getInteractiveStateEntries(state);
  if (entries.length === 0 && state.extensions.length === 0) {
    throw new TypeError('FlightDocument interactive state must not be empty');
  }
  for (const [property, value] of entries) appendMappingEntry(lines, property, value, indent);
  if (state.extensions.length === 0) return;
  lines.push(' '.repeat(indent) + 'extensions:');
  for (const extension of state.extensions) {
    lines.push(' '.repeat(indent + 2) + '- kind: ' + formatString(extension.kind));
    appendFields(lines, extension.fields, indent + 4, DESCRIPTOR_RESERVED_FIELDS);
  }
}

function appendNodeInteractiveMetadata(lines: string[], node: Readonly<FlightDocumentNode>, indent: number): void {
  const prefix = ' '.repeat(indent);
  if (node.interactiveStates == null) {
    if (node.transition != null) throw new TypeError('FlightDocument transition requires interactiveStates');
    return;
  }
  const phases = getInteractiveStatePhases(node.interactiveStates);
  if (phases.length === 0) throw new TypeError('FlightDocument interactiveStates must not be empty');
  lines.push(prefix + 'interactiveStates:');
  for (const [phase, state] of phases) {
    lines.push(prefix + '  ' + phase + ':');
    appendInteractiveState(lines, state, indent + 4);
  }
  if (node.transition != null) {
    lines.push(prefix + 'transition:');
    lines.push(prefix + '  kind: ' + formatString(node.transition.kind));
    appendFields(lines, node.transition.fields, indent + 2, DESCRIPTOR_RESERVED_FIELDS);
  }
}

function getInteractiveStateEntries(
  state: Readonly<FlightDocumentInteractiveState>,
): Array<[string, boolean | number]> {
  const out: Array<[string, boolean | number]> = [];
  for (const property of INTERACTIVE_STATE_PROPERTIES) {
    const value = state[property];
    if (value !== undefined) out.push([property, value]);
  }
  return out;
}

function getInteractiveStatePhases(
  states: Readonly<FlightDocumentInteractiveStates>,
): Array<[string, Readonly<FlightDocumentInteractiveState>]> {
  const out: Array<[string, Readonly<FlightDocumentInteractiveState>]> = [];
  for (const phase of INTERACTIVE_STATE_PHASES) {
    const state = states[phase];
    if (state !== null) out.push([phase, state]);
  }
  return out;
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
  appendLayouts(lines, scene.layouts);
  appendTokens(lines, scene.tokens);
}

function appendLayouts(lines: string[], layouts: readonly Readonly<FlightDocumentLayoutDescriptor>[]): void {
  if (layouts.length === 0) return;
  const seenTargets = new Set<string>();
  lines.push('    layouts:');
  for (const layout of layouts) {
    const nodes = layout.tree.nodes;
    if (nodes.length === 0) throw new RangeError('FlightDocument layout tree must not be empty');
    if (layout.targets.length !== nodes.length) {
      throw new RangeError('FlightDocument layout targets must match its tree nodes index-for-index');
    }
    lines.push('      - targets:');
    for (const target of layout.targets) {
      if (target.length === 0) throw new RangeError('FlightDocument layout target names must not be empty');
      if (seenTargets.has(target)) throw new RangeError('FlightDocument layout targets must be unique per scene');
      seenTargets.add(target);
      lines.push('          - ' + formatString(target));
    }
    lines.push('        tree:');
    lines.push('          nodes:');
    for (let index = 0; index < nodes.length; index++) appendLayoutNode(lines, nodes[index], index);
  }
}

function appendLayoutNode(lines: string[], node: Readonly<FlightDocumentLayoutNode>, index: number): void {
  if (node.kind.length === 0) throw new RangeError('FlightDocument layout node kinds must not be empty');
  if (!Number.isInteger(node.parentIndex) || node.parentIndex < -1 || node.parentIndex >= index) {
    throw new RangeError('FlightDocument layout parentIndex must be -1 or precede its node');
  }
  lines.push('            - kind: ' + formatString(node.kind));
  lines.push('              parentIndex: ' + String(node.parentIndex));
  if (node.containerStyle !== null) appendMappingEntry(lines, 'containerStyle', node.containerStyle, 14);
  if (node.itemStyle !== null) appendMappingEntry(lines, 'itemStyle', node.itemStyle, 14);
}

function appendTokens(lines: string[], tokens: readonly Readonly<FlightDocumentToken>[]): void {
  if (tokens.length === 0) return;
  lines.push('    tokens:');
  for (const token of tokens) {
    lines.push('      - kind: ' + formatString(token.kind));
    lines.push('        key: ' + formatString(token.key));
    // Mode names are sorted so a formatted document is stable, while the token ROWS keep the order
    // they were authored in: row order is the author's, mode order is not meaningful.
    appendFields(lines, token.values, 8, TOKEN_RESERVED_FIELDS);
  }
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
      refusal: (() => {
        const out = allocateEntity<FlightDocumentText>();
        out.actual = parsed.actual;
        out.column = parsed.column;
        out.kind = null;
        out.limit = parsed.limit;
        out.line = parsed.line;
        out.mode = null;
        out.offset = parsed.offset;
        out.path = '';
        out.reason = parsed.kind;
        out.resourceKey = null;
        out.tokenKey = null;
        out.version = null;
        return finishEntity(out);
      })(),
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

function readInteractiveState(
  value: unknown,
  path: string,
  dimension: 'Scene2D' | 'Scene3D',
  context: FlightDocumentTextReadContext,
): FlightDocumentInteractiveState | null {
  if (!isMapping(value) || !hasOnlyKeys(value, INTERACTIVE_STATE_KEYS)) return refuse(context, path);
  const state: FlightDocumentInteractiveState = { extensions: [] };
  for (const property of INTERACTIVE_STATE_PROPERTIES) {
    const propertyValue = value[property];
    if (propertyValue === undefined) continue;
    if (property === 'visible') {
      if (typeof propertyValue !== 'boolean') return refuse(context, appendPath(path, property));
    } else if (typeof propertyValue !== 'number' || !Number.isFinite(propertyValue)) {
      return refuse(context, appendPath(path, property));
    }
    if (dimension === 'Scene3D' && INTERACTIVE_STATE_2D_PROPERTIES.includes(property)) {
      return refuse(context, appendPath(path, property));
    }
    Object.assign(state, { [property]: propertyValue });
  }

  const extensionsRaw = value['extensions'];
  if (extensionsRaw !== undefined) {
    if (!Array.isArray(extensionsRaw)) return refuse(context, appendPath(path, 'extensions'));
    const kinds = new Set<string>();
    for (let i = 0; i < extensionsRaw.length; i++) {
      const extensionPath = `${path}.extensions[${i}]`;
      const extension = readInteractiveStateExtension(extensionsRaw[i], extensionPath, context);
      if (extension === null) return null;
      if (kinds.has(extension.kind)) {
        return refuseWithReason(
          context,
          FlightDocumentRefusalReason.InteractiveStateExtensionKindDuplicate,
          extensionPath,
          extension.kind,
        );
      }
      kinds.add(extension.kind);
      state.extensions.push(extension);
    }
  }
  if (getInteractiveStateEntries(state).length === 0 && state.extensions.length === 0) return refuse(context, path);
  return state;
}

function readInteractiveStateExtension(
  value: unknown,
  path: string,
  context: FlightDocumentTextReadContext,
): FlightDocumentInteractiveStateExtensionDescriptor | null {
  if (!isMapping(value)) return refuse(context, path);
  const kind = value['kind'];
  if (typeof kind !== 'string') return refuse(context, appendPath(path, 'kind'));
  const fields = copyFlightDocumentFields(value, DESCRIPTOR_RESERVED_FIELDS, path, context);
  return fields === null ? null : { fields, kind };
}

function readInteractiveStates(
  value: unknown,
  path: string,
  dimension: 'Scene2D' | 'Scene3D',
  context: FlightDocumentTextReadContext,
): FlightDocumentInteractiveStates | null {
  if (!isMapping(value) || !hasOnlyKeys(value, INTERACTIVE_STATE_PHASES)) return refuse(context, path);
  const states: FlightDocumentInteractiveStates = { disabled: null, hover: null, pressed: null };
  let count = 0;
  for (const phase of INTERACTIVE_STATE_PHASES) {
    const stateRaw = value[phase];
    if (stateRaw === undefined) continue;
    const state = readInteractiveState(stateRaw, appendPath(path, phase), dimension, context);
    if (state === null) return null;
    states[phase] = state;
    count++;
  }
  return count === 0 ? refuse(context, path) : states;
}

function readInteractiveStateTransition(
  value: unknown,
  path: string,
  context: FlightDocumentTextReadContext,
): FlightDocumentInteractiveStateTransitionDescriptor | null {
  if (!isMapping(value)) return refuse(context, path);
  const kind = value['kind'];
  if (typeof kind !== 'string') return refuse(context, appendPath(path, 'kind'));
  const fields = copyFlightDocumentFields(value, DESCRIPTOR_RESERVED_FIELDS, path, context);
  return fields === null ? null : { fields, kind };
}

function readNode(
  value: unknown,
  path: string,
  dimension: 'Scene2D' | 'Scene3D',
  context: FlightDocumentTextReadContext,
): FlightDocumentNode | null {
  if (!isMapping(value)) return refuse(context, path);
  const kind = value['kind'];
  if (typeof kind !== 'string') return refuse(context, appendPath(path, 'kind'));
  const childrenRaw = value['children'];
  const children: FlightDocumentNode[] = [];
  if (childrenRaw !== undefined) {
    if (!Array.isArray(childrenRaw)) return refuse(context, appendPath(path, 'children'));
    for (let index = 0; index < childrenRaw.length; index++) {
      const child = readNode(childrenRaw[index], `${path}.children[${index}]`, dimension, context);
      if (child === null) return null;
      children.push(child);
    }
  }
  const interactiveStatesRaw = value['interactiveStates'];
  let interactiveStates: FlightDocumentInteractiveStates | null = null;
  if (interactiveStatesRaw !== undefined) {
    interactiveStates = readInteractiveStates(
      interactiveStatesRaw,
      appendPath(path, 'interactiveStates'),
      dimension,
      context,
    );
    if (interactiveStates === null) return null;
  }
  const transitionRaw = value['transition'];
  if (transitionRaw !== undefined && interactiveStates === null) return refuse(context, appendPath(path, 'transition'));
  let transition: FlightDocumentInteractiveStateTransitionDescriptor | null = null;
  if (transitionRaw !== undefined) {
    transition = readInteractiveStateTransition(transitionRaw, appendPath(path, 'transition'), context);
    if (transition === null) return null;
  }
  const fields = copyFlightDocumentFields(value, NODE_RESERVED_FIELDS, path, context);
  return fields === null ? null : { children, fields, interactiveStates, kind, transition };
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
  const scene = readNode(mapping['scene'], appendPath(path, 'scene'), 'Scene2D', context);
  if (scene === null) return null;
  const layouts = readLayouts(mapping['layouts'], path, context);
  if (layouts === null) return null;
  const tokens = readTokens(mapping['tokens'], path, context);
  if (tokens === null) return null;
  return { backgroundColor: backgroundColor ?? null, kind: 'Scene2D', layouts, scene, tokens };
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
  const scene = readNode(mapping['scene'], appendPath(path, 'scene'), 'Scene3D', context);
  if (scene === null) return null;
  const layouts = readLayouts(mapping['layouts'], path, context);
  if (layouts === null) return null;
  const tokens = readTokens(mapping['tokens'], path, context);
  if (tokens === null) return null;
  return { cameras, kind: 'Scene3D', layouts, lights, scene, tokens };
}

function readLayouts(
  value: unknown,
  scenePath: string,
  context: FlightDocumentTextReadContext,
): FlightDocumentLayoutDescriptor[] | null {
  if (value === undefined) return [];
  const layoutsPath = appendPath(scenePath, 'layouts');
  if (!Array.isArray(value)) return refuse(context, layoutsPath);
  const layouts: FlightDocumentLayoutDescriptor[] = [];
  const seenTargets = new Set<string>();
  for (let layoutIndex = 0; layoutIndex < value.length; layoutIndex++) {
    const layoutPath = `${layoutsPath}[${layoutIndex}]`;
    const raw = value[layoutIndex];
    if (!isMapping(raw) || !hasOnlyKeys(raw, LAYOUT_KEYS)) return refuse(context, layoutPath);

    const targetsPath = appendPath(layoutPath, 'targets');
    const targetsRaw = raw['targets'];
    if (!Array.isArray(targetsRaw) || targetsRaw.length === 0) return refuse(context, targetsPath);
    const targets: string[] = [];
    for (let targetIndex = 0; targetIndex < targetsRaw.length; targetIndex++) {
      const targetPath = `${targetsPath}[${targetIndex}]`;
      const target = targetsRaw[targetIndex];
      if (typeof target !== 'string' || target.length === 0 || seenTargets.has(target)) {
        return refuse(context, targetPath);
      }
      seenTargets.add(target);
      targets.push(target);
    }

    const treePath = appendPath(layoutPath, 'tree');
    const treeRaw = raw['tree'];
    if (!isMapping(treeRaw) || !hasOnlyKeys(treeRaw, LAYOUT_TREE_KEYS)) return refuse(context, treePath);
    const nodesPath = appendPath(treePath, 'nodes');
    const nodesRaw = treeRaw['nodes'];
    if (!Array.isArray(nodesRaw) || nodesRaw.length === 0) return refuse(context, nodesPath);
    const nodes: FlightDocumentLayoutNode[] = [];
    for (let nodeIndex = 0; nodeIndex < nodesRaw.length; nodeIndex++) {
      const node = readLayoutNode(nodesRaw[nodeIndex], nodeIndex, `${nodesPath}[${nodeIndex}]`, context);
      if (node === null) return null;
      nodes.push(node);
    }
    if (targets.length !== nodes.length) return refuse(context, targetsPath);
    layouts.push({ targets, tree: { nodes } });
  }
  return layouts;
}

function readLayoutNode(
  value: unknown,
  index: number,
  path: string,
  context: FlightDocumentTextReadContext,
): FlightDocumentLayoutNode | null {
  if (!isMapping(value) || !hasOnlyKeys(value, LAYOUT_NODE_KEYS)) return refuse(context, path);
  const kind = value['kind'];
  if (typeof kind !== 'string' || kind.length === 0) return refuse(context, appendPath(path, 'kind'));
  const parentIndex = value['parentIndex'];
  if (!Number.isInteger(parentIndex) || (parentIndex as number) < -1 || (parentIndex as number) >= index) {
    return refuse(context, appendPath(path, 'parentIndex'));
  }
  const containerStyle = readLayoutStyle(value['containerStyle'], appendPath(path, 'containerStyle'), context);
  if (containerStyle === INVALID_LAYOUT_STYLE) return null;
  const itemStyle = readLayoutStyle(value['itemStyle'], appendPath(path, 'itemStyle'), context);
  if (itemStyle === INVALID_LAYOUT_STYLE) return null;
  return { containerStyle, itemStyle, kind, parentIndex: parentIndex as number };
}

function readLayoutStyle(
  value: unknown,
  path: string,
  context: FlightDocumentTextReadContext,
): FlightDocumentFields | null | typeof INVALID_LAYOUT_STYLE {
  if (value === undefined || value === null) return null;
  if (!isMapping(value)) {
    refuse(context, path);
    return INVALID_LAYOUT_STYLE;
  }
  const fields = copyFlightDocumentFields(value, [], path, context);
  return fields ?? INVALID_LAYOUT_STYLE;
}

function readTokens(
  value: unknown,
  path: string,
  context: FlightDocumentTextReadContext,
): FlightDocumentToken[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return refuse(context, appendPath(path, 'tokens'));
  const tokens: FlightDocumentToken[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < value.length; index++) {
    const rowPath = `${path}.tokens[${index}]`;
    const raw = value[index];
    if (!isMapping(raw)) return refuse(context, rowPath);
    const kind = raw['kind'];
    const key = raw['key'];
    if (typeof kind !== 'string') return refuse(context, appendPath(rowPath, 'kind'));
    if (typeof key !== 'string') return refuse(context, appendPath(rowPath, 'key'));
    if (!SAFE_PLAIN_SCALAR_PATTERN.test(key)) {
      return refuseToken(context, FlightDocumentRefusalReason.TokenKeyInvalid, appendPath(rowPath, 'key'), key, null);
    }
    if (seen.has(key)) {
      return refuseToken(context, FlightDocumentRefusalReason.TokenKeyDuplicate, appendPath(rowPath, 'key'), key, null);
    }
    seen.add(key);
    const values: FlightDocumentTokenValues = {};
    for (const mode of Object.keys(raw)) {
      if (TOKEN_RESERVED_FIELDS.includes(mode)) continue;
      const modePath = appendPath(rowPath, mode);
      if (!SAFE_PLAIN_SCALAR_PATTERN.test(mode)) {
        return refuseToken(context, FlightDocumentRefusalReason.TokenModeInvalid, modePath, key, mode);
      }
      const modeValue = copyFlightDocumentValue(raw[mode], modePath, context);
      if (modeValue === INVALID_FLIGHT_DOCUMENT_VALUE) return null;
      values[mode] = modeValue;
    }
    tokens.push({ key, kind, values });
  }
  return tokens;
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

function refuseWithReason(
  context: FlightDocumentTextReadContext,
  reason: typeof FlightDocumentRefusalReason.InteractiveStateExtensionKindDuplicate,
  path: string,
  kind: string,
): null {
  if (context.refusal === null) {
    context.refusal = createDocumentRefusal(reason, path);
    context.refusal.kind = kind;
  }
  return null;
}

function refuseToken(
  context: FlightDocumentTextReadContext,
  reason:
    | typeof FlightDocumentRefusalReason.TokenKeyDuplicate
    | typeof FlightDocumentRefusalReason.TokenKeyInvalid
    | typeof FlightDocumentRefusalReason.TokenModeInvalid,
  path: string,
  tokenKey: string,
  mode: string | null,
): null {
  const refusal = createDocumentRefusal(reason, path);
  refusal.mode = mode;
  refusal.tokenKey = tokenKey;
  context.refusal ??= refusal;
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
const INVALID_LAYOUT_STYLE = Symbol('invalid-layout-style');
const INVALID_OPTIONAL_INDEX = Symbol('invalid-flight-document-optional-index');
const CAMERA_KEYS = ['far', 'name', 'near', 'node', 'projection', 'transform'];
const DESCRIPTOR_RESERVED_FIELDS = ['kind'];
const DOCUMENT_KEYS = ['defaultScene', 'flight', 'resources', 'scenes'];
const INTERACTIVE_STATE_2D_PROPERTIES = ['scaleX', 'scaleY', 'x', 'y'];
const INTERACTIVE_STATE_KEYS = ['alpha', 'extensions', 'scaleX', 'scaleY', 'visible', 'x', 'y'];
const INTERACTIVE_STATE_PHASES = ['disabled', 'hover', 'pressed'] as const;
const INTERACTIVE_STATE_PROPERTIES = ['alpha', 'scaleX', 'scaleY', 'visible', 'x', 'y'] as const;
const LIGHT_KEYS = ['descriptor', 'name', 'node', 'transform'];
const LAYOUT_KEYS = ['targets', 'tree'];
const LAYOUT_NODE_KEYS = ['containerStyle', 'itemStyle', 'kind', 'parentIndex'];
const LAYOUT_TREE_KEYS = ['nodes'];
const NODE_RESERVED_FIELDS = ['children', 'interactiveStates', 'kind', 'transition'];
const ORTHOGRAPHIC_PROJECTION_KEYS = ['halfHeight', 'halfWidth', 'kind'];
const PERSPECTIVE_PROJECTION_KEYS = ['aspect', 'fovY', 'kind'];
const QUATERNION_KEYS = ['w', 'x', 'y', 'z'];
const RESOURCE_RESERVED_FIELDS = ['key', 'kind'];
const SAFE_PLAIN_SCALAR_PATTERN = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
const SCENE_2D_KEYS = ['backgroundColor', 'kind', 'layouts', 'scene', 'tokens'];
const SCENE_3D_KEYS = ['cameras', 'kind', 'layouts', 'lights', 'scene', 'tokens'];
// A token row flattens its mode variants beside kind and key, exactly as a resource row flattens
// its fields, so these two names are structural and can never be authored as mode names.
const TOKEN_RESERVED_FIELDS = ['key', 'kind'];
const TRANSFORM_3D_KEYS = ['position', 'rotation', 'scale'];
const VECTOR_3_KEYS = ['x', 'y', 'z'];
