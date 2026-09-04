import { createCamera3D, setCamera3DViewMatrix4FromMatrix4 } from '@flighthq/camera/contract';
import { allocateEntity, finishEntity, getEntityRuntime } from '@flighthq/entity/contract';
import {
  acquireMatrix4,
  composeMatrix4FromTransform3D,
  createTransform3D,
  decomposeMatrix4ToTransform3D,
  inverseMatrix4,
  releaseMatrix4,
} from '@flighthq/geometry/contract';
import { addNodeChild, getNodeChildren, getNodeWorldMatrix4 } from '@flighthq/node/contract';
import { getRegistryTableEntry } from '@flighthq/registry/contract';
import { createScene3D, createScene3DLightsFromDocument } from '@flighthq/scene3d/contract';
import type {
  Camera3D,
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
  FlightDocumentScene3D,
  FlightDocumentScene3DMaterialization,
  FlightDocumentSchemaRegistry,
  Entity,
  NodeAny,
  Node3D,
  Scene3D,
  Scene3DDocument,
  Scene3DDocumentCamera,
  Scene3DDocumentLight,
  Scene3DLights,
} from '@flighthq/types/contract';
import {
  AmbientLightKind,
  DirectionalLightKind,
  FlightDocumentRefusalReason,
  Node3DTraitsKey,
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

export function createFlightDocumentFromScene3D(
  source: Readonly<Scene3D>,
  cameras: readonly Readonly<Scene3DDocumentCamera>[],
  lights: readonly Readonly<Scene3DDocumentLight>[],
  schemas: Readonly<FlightDocumentSchemaRegistry>,
  interactiveStateBindings: readonly Readonly<FlightDocumentInteractiveStateBinding<Node3D>>[] = [],
  layoutBindings: readonly Readonly<FlightDocumentLayoutBinding<Node3D>>[] = [],
): FlightDocumentScene3D & Entity {
  const bindingLookup = createInteractiveStateBindingLookup(interactiveStateBindings);
  const usedBindings = new Set<Readonly<NodeAny>>();
  const writtenNodes = new Map<Readonly<NodeAny>, FlightDocumentNode>();
  const scene = writeNode(source.root, schemas, bindingLookup, usedBindings, writtenNodes);
  assertAllInteractiveStateBindingsUsed(bindingLookup, usedBindings);
  return createEntity({
    cameras: cameras.map((c) => ({ ...c })),
    kind: 'Scene3D',
    layouts: writeFlightDocumentLayoutBindings(layoutBindings, source.root, writtenNodes),
    lights: lights.map((l) => ({ ...l })),
    scene,
    // Same as the 2D writer: substitution is one-way, so a written entry declares no tokens.
    tokens: [],
  });
}

export function createFlightDocumentScene3DMaterialization(
  document: Readonly<FlightDocument>,
  schemas: Readonly<FlightDocumentSchemaRegistry>,
  resolvers?: Readonly<FlightDocumentResourceResolverRegistry>,
  sceneIndex: number = document.defaultScene,
): FlightDocumentScene3DMaterialization | null {
  const selection = selectFlightDocumentScene(document, 'Scene3D', sceneIndex);
  if (selection.refusal !== null || selection.scene.kind !== 'Scene3D') return null;
  const documentScene = selection.scene;
  const duplicateRefusal = checkDuplicateLights(documentScene.lights, selection.sceneIndex);
  if (duplicateRefusal !== null) return null;
  const unregisteredRefusal = checkUnregisteredNodeKinds(documentScene.scene, schemas, selection.sceneIndex, 'scene');
  if (unregisteredRefusal !== null) return null;
  const fieldRefusal = checkFlightDocumentNodeFields(documentScene.scene, schemas, selection.sceneIndex, 'scene');
  if (fieldRefusal !== null) return null;
  const interactiveRefusal = checkFlightDocumentInteractiveStates(
    documentScene.scene,
    'Scene3D',
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
  const scene = createScene3D();
  const resources = resolveResources(document.resources, resolvers);
  // Same defect as 2D: the authored root's kind and fields were dropped because only its children were
  // materialized, while the writer captured them.
  if (!adoptDocumentRoot3D(scene, documentScene.scene, schemas, resources)) return null;
  const materializedDocumentNodes = new Map<Readonly<FlightDocumentNode>, Node3D>();
  materializedDocumentNodes.set(documentScene.scene, scene.root);
  const interactiveStateBindings: FlightDocumentInteractiveStateBinding<Node3D>[] = [];
  if (!appendInteractiveStateBinding(interactiveStateBindings, scene.root, documentScene.scene, schemas)) return null;
  if (
    !materializeChildren(
      scene.root,
      documentScene.scene.children,
      schemas,
      resources,
      interactiveStateBindings,
      materializedDocumentNodes,
    )
  ) {
    return null;
  }
  const layoutBindings = createFlightDocumentLayoutBindings(
    documentScene.layouts,
    documentScene.scene,
    materializedDocumentNodes,
  );
  if (layoutBindings === null) return null;
  const materializedNodes = getMaterializedNodes(scene.root);
  const cameras = materializeCameras(documentScene.cameras, materializedNodes);
  const lights = materializeLights(documentScene.lights, materializedNodes);
    const out = allocateEntity<FlightDocumentScene3DMaterialization>();
  out.cameras = cameras;
  out.interactiveStateBindings = interactiveStateBindings;
  out.layoutBindings = layoutBindings;
  out.lights = lights;
  out.scene = scene;
  return finishEntity(out);
}

export function createFlightDocumentScene3DMaterializationFromText(
  text: string,
  schemas: Readonly<FlightDocumentSchemaRegistry>,
  resolvers?: Readonly<FlightDocumentResourceResolverRegistry>,
  sceneIndex?: number,
): FlightDocumentScene3DMaterialization | null {
  const document = parseFlightDocumentText(text);
  if (document === null) return null;
  return createFlightDocumentScene3DMaterialization(document, schemas, resolvers, sceneIndex);
}

export function explainFlightDocumentScene3DRefusal(
  document: Readonly<FlightDocument>,
  schemas: Readonly<FlightDocumentSchemaRegistry>,
  sceneIndex: number = document.defaultScene,
): FlightDocumentRefusalExplanation | null {
  const selection = selectFlightDocumentScene(document, 'Scene3D', sceneIndex);
  if (selection.refusal !== null) return selection.refusal;
  if (selection.scene.kind !== 'Scene3D') return null;
  const lightRefusal = checkDuplicateLights(selection.scene.lights, selection.sceneIndex);
  if (lightRefusal !== null) return lightRefusal;
  const unregistered = checkUnregisteredNodeKinds(selection.scene.scene, schemas, selection.sceneIndex, 'scene');
  if (unregistered !== null) return unregistered;
  const fieldRefusal = checkFlightDocumentNodeFields(selection.scene.scene, schemas, selection.sceneIndex, 'scene');
  if (fieldRefusal !== null) return fieldRefusal;
  const interactiveRefusal = checkFlightDocumentInteractiveStates(
    selection.scene.scene,
    'Scene3D',
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
  return checkRootKindDimension3D(selection.scene.scene, schemas, selection.sceneIndex);
}

export function explainFlightDocumentScene3DRefusalFromText(
  text: string,
  schemas: Readonly<FlightDocumentSchemaRegistry>,
  sceneIndex?: number,
): FlightDocumentRefusalExplanation | null {
  const document = parseFlightDocumentText(text);
  if (document === null) return explainFlightDocumentText(text);
  return explainFlightDocumentScene3DRefusal(document, schemas, sceneIndex);
}

function checkDuplicateLights(
  lights: readonly Readonly<Scene3DDocumentLight>[],
  sceneIndex: number,
): FlightDocumentRefusalExplanation | null {
  let ambientCount = 0;
  let directionalCount = 0;
  for (const light of lights) {
    if (light.descriptor.kind === AmbientLightKind) {
      ambientCount++;
      if (ambientCount > 1) {
        return createSceneRefusal(FlightDocumentRefusalReason.DuplicateAmbientLight, sceneIndex, 'lights');
      }
    }
    if (light.descriptor.kind === DirectionalLightKind) {
      directionalCount++;
      if (directionalCount > 1) {
        return createSceneRefusal(FlightDocumentRefusalReason.DuplicateDirectionalLight, sceneIndex, 'lights');
      }
    }
  }
  return null;
}

function materializeCameras(
  cameras: readonly Readonly<Scene3DDocumentCamera>[],
  materializedNodes: readonly Readonly<Node3D>[],
): Camera3D[] {
  const placement = acquireMatrix4();
  const view = acquireMatrix4();
  const out: Camera3D[] = [];
  for (const source of cameras) {
    const camera = createCamera3D({
      far: source.far,
      near: source.near,
      projection: source.projection,
    });
    const boundNode = getBoundMaterializedNode(source.node, materializedNodes);
    if (boundNode === null) {
      composeMatrix4FromTransform3D(placement, source.transform);
      if (inverseMatrix4(view, placement)) setCamera3DViewMatrix4FromMatrix4(camera, view);
    } else if (inverseMatrix4(view, getNodeWorldMatrix4(boundNode))) {
      setCamera3DViewMatrix4FromMatrix4(camera, view);
    }
    out.push(camera);
  }
  releaseMatrix4(view);
  releaseMatrix4(placement);
  return out;
}

function getBoundMaterializedNode(
  index: number | undefined,
  materializedNodes: readonly Readonly<Node3D>[],
): Readonly<Node3D> | null {
  if (index === undefined || !Number.isInteger(index) || index < 0) return null;
  return materializedNodes[index] ?? null;
}

// Scene3DDocument binding indices address a flat node table. A Flight document stores the same logical
// population as a nested tree, so flatten it in the binary format's depth-first order, including the scene
// root at index zero. Keeping this derivation separate from node creation lets the root materializer own how
// that root is instantiated without creating a second placement model here.
function getMaterializedNodes(root: Node3D): Node3D[] {
  const out: Node3D[] = [];
  appendMaterializedNodes(out, root);
  return out;
}

function appendMaterializedNodes(out: Node3D[], node: Node3D): void {
  out.push(node);
  for (const child of getNodeChildren(node)) appendMaterializedNodes(out, child as Node3D);
}

function materializeLights(
  lights: readonly Readonly<Scene3DDocumentLight>[],
  materializedNodes: readonly Readonly<Node3D>[],
): Scene3DLights {
  const resolvedLights: Scene3DDocumentLight[] = lights.map((source) => {
    const boundNode = getBoundMaterializedNode(source.node, materializedNodes);
    if (boundNode === null) return { ...source };
    const transform = createTransform3D();
    decomposeMatrix4ToTransform3D(transform, getNodeWorldMatrix4(boundNode));
    return { ...source, transform };
  });
  const document: Scene3DDocument = {
    animations: [],
    cameras: [],
    lights: resolvedLights,
    materials: [],
    meshes: [],
    metadata: null,
    nodes: [],
    resources: [],
    scenes: [],
    skins: [],
  };
  return createScene3DLightsFromDocument(document);
}

function materializeChildren(
  parent: NodeAny,
  children: readonly Readonly<FlightDocumentNode>[],
  schemas: Readonly<FlightDocumentSchemaRegistry>,
  resources: FlightDocumentResourceLookup,
  interactiveStateBindings: FlightDocumentInteractiveStateBinding<Node3D>[],
  materializedNodes: Map<Readonly<FlightDocumentNode>, Node3D>,
): boolean {
  for (const child of children) {
    const schema = getRegistryTableEntry(schemas.nodeSchemas, child.kind);
    if (schema === null) continue;
    const node = schema.createNode(child.fields, resources);
    if (node === null) continue;
    addNodeChild(parent, node);
    materializedNodes.set(child, node as Node3D);
    if (!appendInteractiveStateBinding(interactiveStateBindings, node as Node3D, child, schemas)) return false;
    if (!materializeChildren(node, child.children, schemas, resources, interactiveStateBindings, materializedNodes)) {
      return false;
    }
  }
  return true;
}

function appendInteractiveStateBinding(
  out: FlightDocumentInteractiveStateBinding<Node3D>[],
  node: Node3D,
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

// Replaces the scene's default root with the authored one, carrying its kind and fields. Returns false
// when the root cannot serve as a 3D root — checked structurally by reading the built node's traits key,
// so a registered kind of the wrong dimension is caught rather than installed.
function adoptDocumentRoot3D(
  scene: Scene3D,
  documentRoot: Readonly<FlightDocumentNode>,
  schemas: Readonly<FlightDocumentSchemaRegistry>,
  resources: FlightDocumentResourceLookup,
): boolean {
  const schema = getRegistryTableEntry(schemas.nodeSchemas, documentRoot.kind);
  if (schema === null) return true;
  const root = schema.createNode(documentRoot.fields, resources);
  if (root === null) return false;
  const runtime = getEntityRuntime(root) as Readonly<{ traits?: unknown }> | undefined;
  if (runtime?.traits !== Node3DTraitsKey) return false;
  scene.root = root as Node3D;
  return true;
}

// The 3D half of the wrong-dimension root refusal.
function checkRootKindDimension3D(
  documentRoot: Readonly<FlightDocumentNode>,
  schemas: Readonly<FlightDocumentSchemaRegistry>,
  sceneIndex: number,
): FlightDocumentRefusalExplanation | null {
  const schema = getRegistryTableEntry(schemas.nodeSchemas, documentRoot.kind);
  if (schema === null) return null;
  const probe = schema.createNode(documentRoot.fields, {});
  if (probe === null) return null;
  const runtime = getEntityRuntime(probe) as Readonly<{ traits?: unknown }> | undefined;
  if (runtime?.traits === Node3DTraitsKey) return null;
  return {
    ...createSceneRefusal(FlightDocumentRefusalReason.RootKindMismatch, sceneIndex, 'scene'),
    kind: documentRoot.kind,
  };
}
