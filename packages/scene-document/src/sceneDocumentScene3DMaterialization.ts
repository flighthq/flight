import { createCamera3D } from '@flighthq/camera/contract';
import { createTransform3D } from '@flighthq/geometry/contract';
import { createScene3DLights } from '@flighthq/lighting/contract';
import { addNodeChild, getNodeChildren } from '@flighthq/node/contract';
import { getRegistryTableEntry } from '@flighthq/registry/contract';
import { createScene3D } from '@flighthq/scene3d/contract';
import type {
  AmbientLight,
  Camera3D,
  DirectionalLight,
  FlightDocument,
  FlightDocumentFields,
  FlightDocumentNode,
  FlightDocumentNodeSchema,
  FlightDocumentRefusalExplanation,
  FlightDocumentRefusalReason as FlightDocumentRefusalReasonType,
  FlightDocumentResourceDescriptor,
  FlightDocumentResourceLookup,
  FlightDocumentResourceResolverRegistry,
  FlightDocumentScene3D,
  FlightDocumentScene3DMaterialization,
  FlightDocumentSchemaRegistry,
  FlightDocumentValue,
  NodeAny,
  Scene3D,
  Scene3DDocumentCamera,
  Scene3DDocumentLight,
  Scene3DLights,
  Transform3D,
} from '@flighthq/types/contract';
import { AmbientLightKind, DirectionalLightKind, FlightDocumentRefusalReason } from '@flighthq/types/contract';

import { parseSceneDocumentYamlSubset } from './sceneDocumentYamlSubset';

export function createFlightDocumentFromScene3D(
  source: Readonly<Scene3D>,
  cameras: readonly Readonly<Scene3DDocumentCamera>[],
  lights: readonly Readonly<Scene3DDocumentLight>[],
  schemas: Readonly<FlightDocumentSchemaRegistry>,
): FlightDocumentScene3D {
  return {
    cameras: cameras.map((c) => ({ ...c })),
    kind: 'Scene3D',
    lights: lights.map((l) => ({ ...l })),
    resources: [],
    scene: writeNode(source.root, schemas),
    version: 1,
  };
}

export function createFlightDocumentScene3DMaterialization(
  document: Readonly<FlightDocument>,
  schemas: Readonly<FlightDocumentSchemaRegistry>,
  resolvers?: Readonly<FlightDocumentResourceResolverRegistry>,
): FlightDocumentScene3DMaterialization | null {
  if (document.kind !== 'Scene3D') return null;
  if (document.version !== 1) return null;
  const duplicateRefusal = checkDuplicateLights(document.lights);
  if (duplicateRefusal !== null) return null;
  const scene = createScene3D();
  const resources = resolveResources(document.resources, resolvers);
  materializeChildren(scene.root, document.scene.children, schemas, resources);
  const cameras = materializeCameras(document.cameras);
  const lights = materializeLights(document.lights);
  return { cameras, lights, scene };
}

export function createFlightDocumentScene3DMaterializationFromText(
  text: string,
  schemas: Readonly<FlightDocumentSchemaRegistry>,
  resolvers?: Readonly<FlightDocumentResourceResolverRegistry>,
): FlightDocumentScene3DMaterialization | null {
  const document = parseFlightDocumentFromText(text);
  if (document === null) return null;
  return createFlightDocumentScene3DMaterialization(document, schemas, resolvers);
}

export function explainFlightDocumentScene3DRefusal(
  document: Readonly<FlightDocument>,
): FlightDocumentRefusalExplanation | null {
  if (document.kind !== 'Scene3D') {
    return createRefusal(FlightDocumentRefusalReason.StructureInvalid, 'kind');
  }
  if (document.version !== 1) {
    return {
      ...createRefusal(FlightDocumentRefusalReason.VersionUnsupported, 'version'),
      version: document.version,
    };
  }
  return checkDuplicateLights(document.lights);
}

export function explainFlightDocumentScene3DRefusalFromText(text: string): FlightDocumentRefusalExplanation | null {
  const result = parseSceneDocumentYamlSubset(text);
  if (!result.ok) {
    return {
      actual: result.actual,
      column: result.column,
      kind: null,
      limit: result.limit,
      line: result.line,
      offset: result.offset,
      path: '',
      reason: result.kind as FlightDocumentRefusalReasonType,
      resourceKey: null,
      version: null,
    };
  }
  const value = result.value;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return createRefusal(FlightDocumentRefusalReason.StructureInvalid, '');
  }
  const mapping = value as Record<string, unknown>;
  const version = mapping['flight'];
  if (typeof version !== 'number') {
    return createRefusal(FlightDocumentRefusalReason.StructureInvalid, 'flight');
  }
  if (version !== 1) {
    return {
      ...createRefusal(FlightDocumentRefusalReason.VersionUnsupported, 'version'),
      version,
    };
  }
  const kind = mapping['kind'];
  if (kind !== 'Scene3D') {
    return createRefusal(FlightDocumentRefusalReason.StructureInvalid, 'kind');
  }
  return checkDuplicateLightsFromRaw(mapping['lights']);
}

function checkDuplicateLights(
  lights: readonly Readonly<Scene3DDocumentLight>[],
): FlightDocumentRefusalExplanation | null {
  let ambientCount = 0;
  let directionalCount = 0;
  for (const light of lights) {
    if (light.descriptor.kind === AmbientLightKind) {
      ambientCount++;
      if (ambientCount > 1) {
        return createRefusal(FlightDocumentRefusalReason.DuplicateAmbientLight, 'lights');
      }
    }
    if (light.descriptor.kind === DirectionalLightKind) {
      directionalCount++;
      if (directionalCount > 1) {
        return createRefusal(FlightDocumentRefusalReason.DuplicateDirectionalLight, 'lights');
      }
    }
  }
  return null;
}

function checkDuplicateLightsFromRaw(value: unknown): FlightDocumentRefusalExplanation | null {
  if (!Array.isArray(value)) return null;
  let ambientCount = 0;
  let directionalCount = 0;
  for (const item of value) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) continue;
    const mapping = item as Record<string, unknown>;
    const descriptor = mapping['descriptor'];
    if (descriptor === null || descriptor === undefined || typeof descriptor !== 'object') continue;
    const kind = (descriptor as Record<string, unknown>)['kind'];
    if (kind === AmbientLightKind) {
      ambientCount++;
      if (ambientCount > 1) {
        return createRefusal(FlightDocumentRefusalReason.DuplicateAmbientLight, 'lights');
      }
    }
    if (kind === DirectionalLightKind) {
      directionalCount++;
      if (directionalCount > 1) {
        return createRefusal(FlightDocumentRefusalReason.DuplicateDirectionalLight, 'lights');
      }
    }
  }
  return null;
}

function createRefusal(reason: FlightDocumentRefusalReasonType, path: string): FlightDocumentRefusalExplanation {
  return {
    actual: null,
    column: null,
    kind: null,
    limit: null,
    line: null,
    offset: null,
    path,
    reason,
    resourceKey: null,
    version: null,
  };
}

function materializeCameras(cameras: readonly Readonly<Scene3DDocumentCamera>[]): Camera3D[] {
  return cameras.map((cam) =>
    createCamera3D({
      far: cam.far,
      near: cam.near,
      projection: cam.projection,
    }),
  );
}

function materializeChildren(
  parent: NodeAny,
  children: readonly Readonly<FlightDocumentNode>[],
  schemas: Readonly<FlightDocumentSchemaRegistry>,
  resources: FlightDocumentResourceLookup,
): void {
  for (const child of children) {
    const schema = getRegistryTableEntry(schemas.nodeSchemas, child.kind);
    if (schema === null) continue;
    const node = schema.createNode(child.fields, resources);
    if (node === null) continue;
    addNodeChild(parent, node);
    materializeChildren(node, child.children, schemas, resources);
  }
}

function materializeLights(lights: readonly Readonly<Scene3DDocumentLight>[]): Scene3DLights {
  const ambientEntry = lights.find((l) => l.descriptor.kind === AmbientLightKind);
  const directionalEntry = lights.find((l) => l.descriptor.kind === DirectionalLightKind);
  return createScene3DLights({
    ambient: ambientEntry !== undefined ? (ambientEntry.descriptor as AmbientLight) : null,
    directional: directionalEntry !== undefined ? (directionalEntry.descriptor as DirectionalLight) : null,
  });
}

function parseFlightDocumentFromText(text: string): FlightDocument | null {
  const result = parseSceneDocumentYamlSubset(text);
  if (!result.ok) return null;
  const value = result.value;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const mapping = value as Record<string, unknown>;
  const version = mapping['flight'];
  if (version !== 1) return null;
  const kind = mapping['kind'];
  if (kind !== 'Scene3D') return null;
  const sceneRaw = mapping['scene'];
  const scene = parseDocumentNode(sceneRaw) ?? { children: [], fields: {}, kind: 'Node3D' };
  const resources = parseResources(mapping['resources']);
  const cameras = parseCameras(mapping['cameras']);
  const documentLights = parseLights(mapping['lights']);
  return {
    cameras,
    kind: 'Scene3D',
    lights: documentLights,
    resources,
    scene,
    version: 1,
  };
}

function parseCameras(value: unknown): Scene3DDocumentCamera[] {
  if (!Array.isArray(value)) return [];
  const out: Scene3DDocumentCamera[] = [];
  for (const item of value) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) continue;
    const mapping = item as Record<string, unknown>;
    const far = mapping['far'];
    const near = mapping['near'];
    const projection = mapping['projection'];
    if (typeof far !== 'number' || typeof near !== 'number') continue;
    if (projection === null || projection === undefined || typeof projection !== 'object') continue;
    const transform = parseTransform3D(mapping['transform']);
    const cam: Scene3DDocumentCamera = {
      far,
      near,
      projection: projection as Scene3DDocumentCamera['projection'],
      transform,
    };
    const name = mapping['name'];
    if (typeof name === 'string') cam.name = name;
    out.push(cam);
  }
  return out;
}

function parseLights(value: unknown): Scene3DDocumentLight[] {
  if (!Array.isArray(value)) return [];
  const out: Scene3DDocumentLight[] = [];
  for (const item of value) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) continue;
    const mapping = item as Record<string, unknown>;
    const descriptorRaw = mapping['descriptor'];
    if (descriptorRaw === null || descriptorRaw === undefined || typeof descriptorRaw !== 'object') continue;
    const descriptor = descriptorRaw as Scene3DDocumentLight['descriptor'];
    if (typeof descriptor.kind !== 'string') continue;
    const transform = parseTransform3D(mapping['transform']);
    const light: Scene3DDocumentLight = { descriptor, transform };
    const name = mapping['name'];
    if (typeof name === 'string') light.name = name;
    out.push(light);
  }
  return out;
}

function parseDocumentNode(value: unknown): FlightDocumentNode | null {
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const mapping = value as Record<string, unknown>;
  const kind = mapping['kind'];
  if (typeof kind !== 'string') return null;
  const childrenRaw = mapping['children'];
  const children: FlightDocumentNode[] = [];
  if (Array.isArray(childrenRaw)) {
    for (const item of childrenRaw) {
      const child = parseDocumentNode(item);
      if (child !== null) children.push(child);
    }
  }
  const fields: FlightDocumentFields = {};
  for (const key of Object.keys(mapping)) {
    if (key === 'kind' || key === 'children') continue;
    fields[key] = mapping[key] as FlightDocumentValue;
  }
  return { children, fields, kind };
}

function parseResources(value: unknown): FlightDocumentResourceDescriptor[] {
  if (!Array.isArray(value)) return [];
  const out: FlightDocumentResourceDescriptor[] = [];
  for (const item of value) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) continue;
    const mapping = item as Record<string, unknown>;
    const kind = mapping['kind'];
    const key = mapping['key'];
    if (typeof kind !== 'string' || typeof key !== 'string') continue;
    const fields: FlightDocumentFields = {};
    for (const k of Object.keys(mapping)) {
      if (k === 'kind' || k === 'key') continue;
      fields[k] = mapping[k] as FlightDocumentValue;
    }
    out.push({ fields, key, kind });
  }
  return out;
}

function parseTransform3D(value: unknown): Transform3D {
  const identity = createTransform3D();
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) {
    return identity;
  }
  const mapping = value as Record<string, unknown>;
  const out = createTransform3D();
  parseVector3Into(out.position, mapping['position']);
  parseQuaternionInto(out.rotation, mapping['rotation']);
  parseVector3Into(out.scale, mapping['scale'], identity.scale);
  return out;
}

function parseVector3Into(
  out: { x: number; y: number; z: number },
  value: unknown,
  fallback?: Readonly<{ x: number; y: number; z: number }>,
): void {
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) {
    if (fallback !== undefined) {
      out.x = fallback.x;
      out.y = fallback.y;
      out.z = fallback.z;
    }
    return;
  }
  const mapping = value as Record<string, unknown>;
  if (typeof mapping['x'] === 'number') out.x = mapping['x'];
  if (typeof mapping['y'] === 'number') out.y = mapping['y'];
  if (typeof mapping['z'] === 'number') out.z = mapping['z'];
}

function parseQuaternionInto(out: { w: number; x: number; y: number; z: number }, value: unknown): void {
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) return;
  const mapping = value as Record<string, unknown>;
  if (typeof mapping['w'] === 'number') out.w = mapping['w'];
  if (typeof mapping['x'] === 'number') out.x = mapping['x'];
  if (typeof mapping['y'] === 'number') out.y = mapping['y'];
  if (typeof mapping['z'] === 'number') out.z = mapping['z'];
}

function resolveResources(
  descriptors: readonly Readonly<FlightDocumentResourceDescriptor>[],
  resolvers?: Readonly<FlightDocumentResourceResolverRegistry>,
): FlightDocumentResourceLookup {
  const out: Record<string, unknown> = {};
  if (resolvers === undefined) return out;
  for (const descriptor of descriptors) {
    const resolver = getRegistryTableEntry(resolvers.resolvers, descriptor.kind);
    if (resolver === null) continue;
    const resolved = resolver(descriptor.key, descriptor);
    if (resolved !== null) out[descriptor.key] = resolved;
  }
  return out;
}

function writeNode(source: Readonly<NodeAny>, schemas: Readonly<FlightDocumentSchemaRegistry>): FlightDocumentNode {
  const fields: FlightDocumentFields = {};
  const schema = getRegistryTableEntry(schemas.nodeSchemas, source.kind);
  if (schema !== null) {
    writeFieldsWithDefaults(fields, source, schema);
  }
  const children = getNodeChildren(source);
  return {
    children: children.map((child) => writeNode(child, schemas)),
    fields,
    kind: source.kind,
  };
}

function writeFieldsWithDefaults(
  out: FlightDocumentFields,
  source: Readonly<NodeAny>,
  schema: Readonly<FlightDocumentNodeSchema>,
): void {
  schema.writeNodeFields(out, source, {});
  for (const field of schema.fields) {
    if (field.defaultValue !== undefined && out[field.name] === field.defaultValue) {
      delete out[field.name];
    }
  }
}
