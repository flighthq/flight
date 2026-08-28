import { addNodeChild, getNodeChildren } from '@flighthq/node/contract';
import { getRegistryTableEntry } from '@flighthq/registry/contract';
import { createScene2D } from '@flighthq/scene2d/contract';
import type {
  FlightDocument,
  FlightDocumentFields,
  FlightDocumentNode,
  FlightDocumentNodeSchema,
  FlightDocumentRefusalExplanation,
  FlightDocumentResourceDescriptor,
  FlightDocumentResourceLookup,
  FlightDocumentResourceResolverRegistry,
  FlightDocumentScene2D,
  FlightDocumentScene2DMaterialization,
  FlightDocumentSchemaRegistry,
  NodeAny,
  Scene2D,
} from '@flighthq/types/contract';

import { explainFlightDocumentText, parseFlightDocumentText } from './flightDocumentText';
import { selectFlightDocumentScene } from './sceneDocumentMaterializationSelection';
import { checkUnregisteredNodeKinds } from './sceneDocumentRefusal';

export function createFlightDocumentFromScene2D(
  source: Readonly<Scene2D>,
  schemas: Readonly<FlightDocumentSchemaRegistry>,
): FlightDocumentScene2D {
  return {
    backgroundColor: source.color,
    kind: 'Scene2D',
    scene: writeNode(source.root, schemas),
  };
}

export function createFlightDocumentScene2DMaterialization(
  document: Readonly<FlightDocument>,
  schemas: Readonly<FlightDocumentSchemaRegistry>,
  resolvers?: Readonly<FlightDocumentResourceResolverRegistry>,
  sceneIndex: number = document.defaultScene,
): FlightDocumentScene2DMaterialization | null {
  const selection = selectFlightDocumentScene(document, 'Scene2D', sceneIndex);
  if (selection.refusal !== null || selection.scene.kind !== 'Scene2D') return null;
  const documentScene = selection.scene;
  const unregisteredRefusal = checkUnregisteredNodeKinds(documentScene.scene, schemas, selection.sceneIndex, 'scene');
  if (unregisteredRefusal !== null) return null;
  const scene = createScene2D({ color: documentScene.backgroundColor });
  const resources = resolveResources(document.resources, resolvers);
  materializeChildren(scene.root, documentScene.scene.children, schemas, resources);
  return { scene };
}

export function createFlightDocumentScene2DMaterializationFromText(
  text: string,
  schemas: Readonly<FlightDocumentSchemaRegistry>,
  resolvers?: Readonly<FlightDocumentResourceResolverRegistry>,
  sceneIndex?: number,
): FlightDocumentScene2DMaterialization | null {
  const document = parseFlightDocumentText(text);
  if (document === null) return null;
  return createFlightDocumentScene2DMaterialization(document, schemas, resolvers, sceneIndex);
}

export function explainFlightDocumentRefusal(
  document: Readonly<FlightDocument>,
  dimension: 'Scene2D' | 'Scene3D',
  schemas: Readonly<FlightDocumentSchemaRegistry>,
  sceneIndex: number = document.defaultScene,
): FlightDocumentRefusalExplanation | null {
  const selection = selectFlightDocumentScene(document, dimension, sceneIndex);
  if (selection.refusal !== null) return selection.refusal;
  return checkUnregisteredNodeKinds(selection.scene.scene, schemas, selection.sceneIndex, 'scene');
}

export function explainFlightDocumentRefusalFromText(
  text: string,
  dimension: 'Scene2D' | 'Scene3D',
  schemas: Readonly<FlightDocumentSchemaRegistry>,
  sceneIndex?: number,
): FlightDocumentRefusalExplanation | null {
  const document = parseFlightDocumentText(text);
  if (document === null) return explainFlightDocumentText(text);
  return explainFlightDocumentRefusal(document, dimension, schemas, sceneIndex);
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
