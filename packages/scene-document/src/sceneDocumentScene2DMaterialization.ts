import { allocateEntity, finishEntity, getEntityRuntime } from '@flighthq/entity/contract';
import { getNodeRuntime } from '@flighthq/node/contract';
import { addNodeChild, getNodeChildren } from '@flighthq/node/contract';
import { getRegistryTableEntry } from '@flighthq/registry/contract';
import { createScene2D } from '@flighthq/scene2d/contract';
import { FlightDocumentRefusalReason, Node2DTraitsKey, Node3DTraitsKey } from '@flighthq/types/contract';
import type {
  FlightDocument,
  FlightDocumentFields,
  FlightDocumentInteractiveStateBinding,
  FlightDocumentLayoutBinding,
  FlightDocumentNode,
  FlightDocumentNodeSchema,
  FlightDocumentRefusalExplanation,
  FlightDocumentResourceDescriptor,
  FlightDocumentResourceLookup,
  FlightDocumentResourceResolverRegistry,
  FlightDocumentScene2D,
  FlightDocumentScene2DMaterialization,
  FlightDocumentSchemaRegistry,
  EntityConstruction,
  Entity,
  Node2D,
  Node2DRuntime,
  NodeAny,
  Scene2D,
} from '@flighthq/types/contract';

import { explainFlightDocumentText, parseFlightDocumentText } from './flightDocumentText';
import {
  assertAllInteractiveStateBindingsUsed,
  createInteractiveStateBindingLookup,
  isInteractiveStateBindingTargetSupported,
  readInteractiveStateBindingMetadata,
} from './sceneDocumentInteractiveStateBindings';
import {
  checkFlightDocumentLayoutTargets,
  createFlightDocumentLayoutBindings,
  writeFlightDocumentLayoutBindings,
} from './sceneDocumentLayoutBindings';
import { selectFlightDocumentScene } from './sceneDocumentMaterializationSelection';
import {
  checkFlightDocumentInteractiveStates,
  checkFlightDocumentNodeFields,
  checkUnregisteredNodeKinds,
  createSceneRefusal,
} from './sceneDocumentRefusal';

export function createFlightDocumentFromScene2D(
  source: Readonly<Scene2D>,
  schemas: Readonly<FlightDocumentSchemaRegistry>,
  interactiveStateBindings: readonly Readonly<FlightDocumentInteractiveStateBinding<Node2D>>[] = [],
  layoutBindings: readonly Readonly<FlightDocumentLayoutBinding<Node2D>>[] = [],
): FlightDocumentScene2D & Entity {
  const bindingLookup = createInteractiveStateBindingLookup(interactiveStateBindings);
  const usedBindings = new Set<Readonly<NodeAny>>();
  const writtenNodes = new Map<Readonly<NodeAny>, FlightDocumentNode>();
  const scene = writeNode(source.root, schemas, bindingLookup, usedBindings, writtenNodes);
  assertAllInteractiveStateBindingsUsed(bindingLookup, usedBindings);
  const out = allocateEntity<FlightDocumentScene2D & Entity>();
  initializeFlightDocumentFromScene2D(out, source, scene, layoutBindings, writtenNodes);
  return finishEntity(out);
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
  const fieldRefusal = checkFlightDocumentNodeFields(documentScene.scene, schemas, selection.sceneIndex, 'scene');
  if (fieldRefusal !== null) return null;
  const interactiveRefusal = checkFlightDocumentInteractiveStates(
    documentScene.scene,
    'Scene2D',
    schemas,
    selection.sceneIndex,
    'scene',
  );
  if (interactiveRefusal !== null) return null;
  const layoutRefusal = checkFlightDocumentLayoutTargets(
    documentScene.layouts,
    documentScene.scene,
    selection.sceneIndex,
  );
  if (layoutRefusal !== null) return null;
  const scene = createScene2D({ color: documentScene.backgroundColor });
  const resources = resolveResources(document.resources, resolvers);
  // The authored root carries a kind and fields like any other node; materializing only its children
  // discarded both, so a document whose root was a Sprite at (100, 200) came back a bare DisplayObject at
  // the origin. The writer always captured them, which made the round trip lossy in one direction only.
  if (!adoptDocumentRoot2D(scene, documentScene.scene, schemas, resources)) return null;
  const materializedNodes = new Map<Readonly<FlightDocumentNode>, Node2D>();
  materializedNodes.set(documentScene.scene, scene.root);
  const interactiveStateBindings: FlightDocumentInteractiveStateBinding<Node2D>[] = [];
  if (!appendInteractiveStateBinding(interactiveStateBindings, scene.root, documentScene.scene, schemas)) return null;
  if (
    !materializeChildren(
      scene.root,
      documentScene.scene.children,
      schemas,
      resources,
      interactiveStateBindings,
      materializedNodes,
    )
  ) {
    return null;
  }
  const layoutBindings = createFlightDocumentLayoutBindings(
    documentScene.layouts,
    documentScene.scene,
    materializedNodes,
  );
  if (layoutBindings === null) return null;
  const out = allocateEntity<FlightDocumentScene2DMaterialization>();
  initializeFlightDocumentScene2DMaterialization(out, interactiveStateBindings, layoutBindings, scene);
  return finishEntity(out);
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
  const fieldRefusal = checkFlightDocumentNodeFields(selection.scene.scene, schemas, selection.sceneIndex, 'scene');
  if (fieldRefusal !== null) return fieldRefusal;
  const interactiveRefusal = checkFlightDocumentInteractiveStates(
    selection.scene.scene,
    dimension,
    schemas,
    selection.sceneIndex,
    'scene',
  );
  if (interactiveRefusal !== null) return interactiveRefusal;
  const layoutRefusal = checkFlightDocumentLayoutTargets(
    selection.scene.layouts,
    selection.scene.scene,
    selection.sceneIndex,
  );
  if (layoutRefusal !== null) return layoutRefusal;
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

export function initializeFlightDocumentFromScene2D(
  out: EntityConstruction<FlightDocumentScene2D & Entity>,
  source: Readonly<Scene2D>,
  scene: FlightDocumentNode,
  layoutBindings: readonly Readonly<FlightDocumentLayoutBinding<Node2D>>[],
  writtenNodes: ReadonlyMap<Readonly<NodeAny>, FlightDocumentNode>,
): void {
  out.backgroundColor = source.color;
  out.kind = 'Scene2D';
  out.layouts = writeFlightDocumentLayoutBindings(layoutBindings, source.root, writtenNodes);
  out.scene = scene;
  out.tokens = [];
}

export function initializeFlightDocumentScene2DMaterialization(
  out: EntityConstruction<FlightDocumentScene2DMaterialization>,
  interactiveStateBindings: FlightDocumentInteractiveStateBinding<Node2D>[],
  layoutBindings: FlightDocumentLayoutBinding<Node2D>[],
  scene: Scene2D,
): void {
  out.interactiveStateBindings = interactiveStateBindings;
  out.layoutBindings = layoutBindings;
  out.scene = scene;
}

function materializeChildren(
  parent: NodeAny,
  children: readonly Readonly<FlightDocumentNode>[],
  schemas: Readonly<FlightDocumentSchemaRegistry>,
  resources: FlightDocumentResourceLookup,
  interactiveStateBindings: FlightDocumentInteractiveStateBinding<Node2D>[],
  materializedNodes: Map<Readonly<FlightDocumentNode>, Node2D>,
): boolean {
  for (const child of children) {
    const schema = getRegistryTableEntry(schemas.nodeSchemas, child.kind);
    if (schema === null) continue;
    const node = schema.createNode(child.fields, resources);
    if (node === null) continue;
    addNodeChild(parent, node);
    materializedNodes.set(child, node as Node2D);
    if (!appendInteractiveStateBinding(interactiveStateBindings, node as Node2D, child, schemas)) return false;
    if (!materializeChildren(node, child.children, schemas, resources, interactiveStateBindings, materializedNodes)) {
      return false;
    }
  }
  return true;
}

function appendInteractiveStateBinding(
  out: FlightDocumentInteractiveStateBinding<Node2D>[],
  node: Node2D,
  documentNode: Readonly<FlightDocumentNode>,
  schemas: Readonly<FlightDocumentSchemaRegistry>,
): boolean {
  if (documentNode.interactiveStates == null) return true;
  if (!isInteractiveStateBindingTargetSupported(node, documentNode, schemas)) return false;
  out.push({
    interactiveStates: documentNode.interactiveStates,
    node,
    transition: documentNode.transition ?? null,
  });
  return true;
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

function writeNode(
  source: Readonly<NodeAny>,
  schemas: Readonly<FlightDocumentSchemaRegistry>,
  bindings: ReadonlyMap<Readonly<NodeAny>, Readonly<FlightDocumentInteractiveStateBinding>>,
  usedBindings: Set<Readonly<NodeAny>>,
  writtenNodes: Map<Readonly<NodeAny>, FlightDocumentNode>,
): FlightDocumentNode {
  const fields: FlightDocumentFields = {};
  const schema = getRegistryTableEntry(schemas.nodeSchemas, source.kind);
  if (schema !== null) {
    writeFieldsWithDefaults(fields, source, schema);
  }
  const children = getNodeChildren(source);
  const metadata = readInteractiveStateBindingMetadata(source, bindings, usedBindings, schemas);
  const documentNode: FlightDocumentNode = {
    children: children.map((child) => writeNode(child, schemas, bindings, usedBindings, writtenNodes)),
    fields,
    interactiveStates: metadata.interactiveStates,
    kind: source.kind,
    transition: metadata.transition,
  };
  writtenNodes.set(source, documentNode);
  return documentNode;
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
  return {};
}
