import { addNodeChild, getNodeChildren } from '@flighthq/node/contract';
import { getRegistryTableEntry } from '@flighthq/registry/contract';
import { createScene2D } from '@flighthq/scene2d/contract';
import type {
  FlightDocument,
  FlightDocumentFields,
  FlightDocumentNode,
  FlightDocumentNodeSchema,
  FlightDocumentRefusalExplanation,
  FlightDocumentRefusalReason as FlightDocumentRefusalReasonType,
  FlightDocumentResourceDescriptor,
  FlightDocumentResourceLookup,
  FlightDocumentResourceResolverRegistry,
  FlightDocumentScene2D,
  FlightDocumentScene2DMaterialization,
  FlightDocumentSchemaRegistry,
  FlightDocumentValue,
  NodeAny,
  Scene2D,
} from '@flighthq/types/contract';
import { FlightDocumentRefusalReason } from '@flighthq/types/contract';

import { parseSceneDocumentYamlSubset } from './sceneDocumentYamlSubset';

export function createFlightDocumentFromScene2D(
  source: Readonly<Scene2D>,
  schemas: Readonly<FlightDocumentSchemaRegistry>,
): FlightDocumentScene2D {
  return {
    backgroundColor: source.color,
    kind: 'Scene2D',
    resources: [],
    scene: writeNode(source.root, schemas),
    version: 1,
  };
}

export function createFlightDocumentScene2DMaterialization(
  document: Readonly<FlightDocument>,
  schemas: Readonly<FlightDocumentSchemaRegistry>,
  resolvers?: Readonly<FlightDocumentResourceResolverRegistry>,
): FlightDocumentScene2DMaterialization | null {
  if (document.kind !== 'Scene2D') return null;
  if (document.version !== 1) return null;
  const scene = createScene2D({ color: document.backgroundColor });
  const resources = resolveResources(document.resources, resolvers);
  materializeChildren(scene.root, document.scene.children, schemas, resources);
  return { scene };
}

export function createFlightDocumentScene2DMaterializationFromText(
  text: string,
  schemas: Readonly<FlightDocumentSchemaRegistry>,
  resolvers?: Readonly<FlightDocumentResourceResolverRegistry>,
): FlightDocumentScene2DMaterialization | null {
  const document = parseFlightDocumentFromText(text);
  if (document === null) return null;
  return createFlightDocumentScene2DMaterialization(document, schemas, resolvers);
}

export function explainFlightDocumentRefusal(
  document: Readonly<FlightDocument>,
  dimension: 'Scene2D' | 'Scene3D',
): FlightDocumentRefusalExplanation | null {
  if (document.kind !== dimension) {
    return createRefusal(FlightDocumentRefusalReason.StructureInvalid, 'kind');
  }
  if (document.version !== 1) {
    return {
      ...createRefusal(FlightDocumentRefusalReason.VersionUnsupported, 'version'),
      version: document.version,
    };
  }
  return null;
}

export function explainFlightDocumentRefusalFromText(
  text: string,
  dimension: 'Scene2D' | 'Scene3D',
): FlightDocumentRefusalExplanation | null {
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
  if (kind !== dimension) {
    return createRefusal(FlightDocumentRefusalReason.StructureInvalid, 'kind');
  }
  return null;
}

export function serializeFlightDocument(document: Readonly<FlightDocument>): string {
  const lines: string[] = [];
  lines.push('flight: ' + String(document.version));
  lines.push('kind: ' + document.kind);
  if (document.kind === 'Scene2D' && document.backgroundColor !== null) {
    lines.push('backgroundColor: ' + String(document.backgroundColor));
  }
  if (document.resources.length > 0) {
    lines.push('resources:');
    for (const resource of document.resources) {
      lines.push('  - kind: ' + resource.kind);
      lines.push('    key: ' + resource.key);
      serializeFields(lines, resource.fields, 4);
    }
  }
  lines.push('scene:');
  serializeNode(lines, document.scene, 2);
  return lines.join('\n') + '\n';
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

function parseFlightDocumentFromText(text: string): FlightDocument | null {
  const result = parseSceneDocumentYamlSubset(text);
  if (!result.ok) return null;
  const value = result.value;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const mapping = value as Record<string, unknown>;
  const version = mapping['flight'];
  if (version !== 1) return null;
  const kind = mapping['kind'];
  if (kind !== 'Scene2D' && kind !== 'Scene3D') return null;
  const sceneRaw = mapping['scene'];
  const scene = parseDocumentNode(sceneRaw) ?? { children: [], fields: {}, kind: 'DisplayObject' };
  const resources = parseResources(mapping['resources']);
  if (kind === 'Scene2D') {
    const bg = mapping['backgroundColor'];
    return {
      backgroundColor: typeof bg === 'number' ? bg : null,
      kind: 'Scene2D',
      resources,
      scene,
      version: 1,
    };
  }
  return null;
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

function serializeFields(lines: string[], fields: Readonly<FlightDocumentFields>, indent: number): void {
  const prefix = ' '.repeat(indent);
  for (const key of Object.keys(fields)) {
    const value = fields[key];
    lines.push(prefix + key + ': ' + serializeScalar(value));
  }
}

function serializeNode(lines: string[], node: Readonly<FlightDocumentNode>, indent: number): void {
  const prefix = ' '.repeat(indent);
  lines.push(prefix + 'kind: ' + node.kind);
  serializeFields(lines, node.fields, indent);
  if (node.children.length > 0) {
    lines.push(prefix + 'children:');
    for (const child of node.children) {
      lines.push(prefix + '  - kind: ' + child.kind);
      serializeFields(lines, child.fields, indent + 4);
      if (child.children.length > 0) {
        lines.push(prefix + '    children:');
        for (const grandchild of child.children) {
          serializeNodeAsSequenceItem(lines, grandchild, indent + 6);
        }
      }
    }
  }
}

function serializeNodeAsSequenceItem(lines: string[], node: Readonly<FlightDocumentNode>, indent: number): void {
  const prefix = ' '.repeat(indent);
  lines.push(prefix + '- kind: ' + node.kind);
  serializeFields(lines, node.fields, indent + 2);
  if (node.children.length > 0) {
    lines.push(prefix + '  children:');
    for (const child of node.children) {
      serializeNodeAsSequenceItem(lines, child, indent + 4);
    }
  }
}

function serializeScalar(value: FlightDocumentValue): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') {
    if (/^[a-zA-Z_][\w.-]*$/.test(value) && value !== 'null' && value !== 'true' && value !== 'false') {
      return value;
    }
    return '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  }
  return String(value);
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
