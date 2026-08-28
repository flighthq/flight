import { getEntityRuntime } from '@flighthq/entity/contract';
import { getNodeRuntime } from '@flighthq/node/contract';
import { addNodeChild, getNodeChildren } from '@flighthq/node/contract';
import { getRegistryTableEntry } from '@flighthq/registry/contract';
import { createScene2D } from '@flighthq/scene2d/contract';
import { FlightDocumentRefusalReason, Node2DTraitsKey, Node3DTraitsKey } from '@flighthq/types/contract';
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
  Node2D,
  Node2DRuntime,
  NodeAny,
  Scene2D,
} from '@flighthq/types/contract';

import { explainFlightDocumentText, parseFlightDocumentText } from './flightDocumentText';
import { selectFlightDocumentScene } from './sceneDocumentMaterializationSelection';
import { checkUnregisteredNodeKinds, createSceneRefusal } from './sceneDocumentRefusal';

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
  // The authored root carries a kind and fields like any other node; materializing only its children
  // discarded both, so a document whose root was a Sprite at (100, 200) came back a bare DisplayObject at
  // the origin. The writer always captured them, which made the round trip lossy in one direction only.
  if (!adoptDocumentRoot2D(scene, documentScene.scene, schemas, resources)) return null;
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
  const unregistered = checkUnregisteredNodeKinds(selection.scene.scene, schemas, selection.sceneIndex, 'scene');
  if (unregistered !== null) return unregistered;
  return checkRootKindDimension(selection.scene.scene, dimension, schemas, selection.sceneIndex);
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

// Replaces the scene's default container root with the authored one, carrying its kind and fields.
// Returns false when the root cannot serve as a 2D root, which the caller reports as a refusal.
//
// ★ The dimension check is STRUCTURAL, not a roster: the node is built and its runtime traits key is read.
// A registered kind of the wrong dimension passes the unregistered-kind check — it IS registered — and
// would otherwise be installed as a 2D scene root while actually being a Node3D.
function adoptDocumentRoot2D(
  scene: Scene2D,
  documentRoot: Readonly<FlightDocumentNode>,
  schemas: Readonly<FlightDocumentSchemaRegistry>,
  resources: FlightDocumentResourceLookup,
): boolean {
  const schema = getRegistryTableEntry(schemas.nodeSchemas, documentRoot.kind);
  if (schema === null) return true;
  const root = schema.createNode(documentRoot.fields, resources);
  if (root === null) return false;
  const runtime = getEntityRuntime(root) as Readonly<{ traits?: unknown }> | undefined;
  if (runtime?.traits !== Node2DTraitsKey) return false;
  const previous = scene.root;
  scene.root = root as Node2D;
  (getNodeRuntime(root) as Node2DRuntime).scene2d = scene;
  (getNodeRuntime(previous) as Node2DRuntime).scene2d = null;
  return true;
}

// A registered root kind belonging to the other dimension. Distinct from an unregistered kind — the kind
// IS registered, so that check passes it through — and detected structurally by building the node and
// reading its runtime traits key rather than consulting any per-dimension roster.
function checkRootKindDimension(
  documentRoot: Readonly<FlightDocumentNode>,
  dimension: 'Scene2D' | 'Scene3D',
  schemas: Readonly<FlightDocumentSchemaRegistry>,
  sceneIndex: number,
): FlightDocumentRefusalExplanation | null {
  const schema = getRegistryTableEntry(schemas.nodeSchemas, documentRoot.kind);
  if (schema === null) return null;
  const probe = schema.createNode(documentRoot.fields, createEmptyResourceLookup());
  if (probe === null) return null;
  const runtime = getEntityRuntime(probe) as Readonly<{ traits?: unknown }> | undefined;
  const expected = dimension === 'Scene2D' ? Node2DTraitsKey : Node3DTraitsKey;
  if (runtime?.traits === expected) return null;
  return {
    ...createSceneRefusal(FlightDocumentRefusalReason.RootKindMismatch, sceneIndex, 'scene'),
    kind: documentRoot.kind,
  };
}

function createEmptyResourceLookup(): FlightDocumentResourceLookup {
  return { resolve: () => null } as unknown as FlightDocumentResourceLookup;
}
