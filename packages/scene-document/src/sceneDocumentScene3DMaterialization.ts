import { createCamera3D } from '@flighthq/camera/contract';
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
  FlightDocumentResourceDescriptor,
  FlightDocumentResourceLookup,
  FlightDocumentResourceResolverRegistry,
  FlightDocumentScene3D,
  FlightDocumentScene3DMaterialization,
  FlightDocumentSchemaRegistry,
  NodeAny,
  Scene3D,
  Scene3DDocumentCamera,
  Scene3DDocumentLight,
  Scene3DLights,
} from '@flighthq/types/contract';
import { AmbientLightKind, DirectionalLightKind, FlightDocumentRefusalReason } from '@flighthq/types/contract';

import { explainFlightDocumentText, parseFlightDocumentText } from './flightDocumentText';
import { selectFlightDocumentScene } from './sceneDocumentMaterializationSelection';
import { checkUnregisteredNodeKinds, createSceneRefusal } from './sceneDocumentRefusal';

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
    scene: writeNode(source.root, schemas),
  };
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
  const scene = createScene3D();
  const resources = resolveResources(document.resources, resolvers);
  materializeChildren(scene.root, documentScene.scene.children, schemas, resources);
  const cameras = materializeCameras(documentScene.cameras);
  const lights = materializeLights(documentScene.lights);
  return { cameras, lights, scene };
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
  return checkUnregisteredNodeKinds(selection.scene.scene, schemas, selection.sceneIndex, 'scene');
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
