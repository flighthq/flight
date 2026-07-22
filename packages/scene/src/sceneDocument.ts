import { createAnimationChannel, createAnimationClip } from '@flighthq/animation';
import { createEntity } from '@flighthq/entity';
import { setQuaternion, setVector3 } from '@flighthq/geometry';
import { addNodeChild, invalidateNodeLocalTransform } from '@flighthq/node';
import type {
  AnimationChannel,
  Material,
  Mesh,
  Scene,
  SceneAnimationTarget,
  SceneDocument,
  SceneDocumentNode,
  SceneNode,
  Skin,
} from '@flighthq/types';

import { createMesh } from './mesh';
import { createScene } from './scene';
import { createSceneNode } from './sceneNode';

// Assembles a SceneDocument's scene into a live Scene — the inverse of the scene-format parsers, which STOP
// at the format-neutral SceneDocument decomposition rather than building entities inline. This is the single
// assembler every importer shares: `createSceneFromGltf` and its siblings are `createSceneFromDocument(parse
// <Format>(bytes))`. `sceneIndex` selects which of the document's scenes to build (default the first); the
// document's animation clips and metadata are attached to it. An empty or scene-less document yields an
// empty Scene.
//
// The function is a THIN composition of small per-component steps: build one SceneNode per document node
// (Mesh when the node names a mesh, group otherwise), wire the child index lists, resolve each skin's joint
// indices to the built nodes, and rebuild each animation clip's channels against them — no format knowledge
// lives here. Cameras and lights are placement tables the document carries for the caller to read; they are
// not parented into the graph (a camera is a pure entity, not a scene node), so this assembler leaves them
// on the document.
export function createSceneFromDocument(document: Readonly<SceneDocument>, sceneIndex = 0): Scene {
  const nodes = buildDocumentNodes(document);
  applyDocumentSkins(document, nodes);
  const scene = createScene();
  const roots = document.scenes[sceneIndex]?.rootNodes ?? [];
  for (let r = 0; r < roots.length; r++) {
    const node = nodes[roots[r]];
    if (node !== undefined) addNodeChild(scene.root, node);
  }
  attachDocumentAnimations(document, nodes, scene);
  scene.metadata = document.metadata;
  return scene;
}

// Assembles every scene the document declares (each a view of the shared node pool), in declaration order.
// The document's animation clips and metadata are attached to the default scene (index 0), matching the
// per-format multi-scene importers. An empty document yields an empty array.
export function createScenesFromDocument(document: Readonly<SceneDocument>): Scene[] {
  const nodes = buildDocumentNodes(document);
  applyDocumentSkins(document, nodes);
  const scenes: Scene[] = [];
  for (let s = 0; s < document.scenes.length; s++) {
    const scene = createScene();
    const roots = document.scenes[s].rootNodes;
    for (let r = 0; r < roots.length; r++) {
      const node = nodes[roots[r]];
      if (node !== undefined) addNodeChild(scene.root, node);
    }
    scenes.push(scene);
  }
  if (scenes.length > 0) {
    attachDocumentAnimations(document, nodes, scenes[0]);
    scenes[0].metadata = document.metadata;
  }
  return scenes;
}

// Applies a document node's authored TRS transform, marking the local matrix stale so the world matrix
// recomposes from the fields.
function applyDocumentNodeTransform(node: SceneNode, source: Readonly<SceneDocumentNode>): void {
  const t = source.transform;
  setVector3(node.position, t.position.x, t.position.y, t.position.z);
  setQuaternion(node.rotation, t.rotation.x, t.rotation.y, t.rotation.z, t.rotation.w);
  setVector3(node.scale, t.scale.x, t.scale.y, t.scale.z);
  invalidateNodeLocalTransform(node);
}

// Resolves each document skin's joint node indices to the built nodes, constructs a Skeleton3D (with its
// flat inverse-bind matrix array), and binds it onto every mesh whose document entry names that skin.
function applyDocumentSkins(document: Readonly<SceneDocument>, nodes: readonly SceneNode[]): void {
  const skins: (Skin | null)[] = document.skins.map((skin) => {
    const joints: SceneNode[] = [];
    const names: string[] = [];
    for (let j = 0; j < skin.joints.length; j++) {
      const joint = nodes[skin.joints[j]];
      if (joint !== undefined) {
        joints.push(joint);
        names.push(joint.name ?? '');
      }
    }
    const inverseBindMatrices = new Float32Array(joints.length * 16);
    for (let j = 0; j < skin.inverseBind.length && j < joints.length; j++) {
      inverseBindMatrices.set(skin.inverseBind[j].m, j * 16);
    }
    // The Skeleton3D palette (jointMatrices) is filled per-frame by computeSkeleton3DJointMatrices; here it
    // starts zeroed. Built inline through createEntity rather than via @flighthq/skeleton3d because that
    // package depends on @flighthq/scene (createMesh/createSceneNode), which would form a cycle; the
    // Entity shape invariant still holds at this assembly seam.
    // Joint names are recovered from the resolved joint nodes; null when the source named none.
    const skeleton = createEntity({
      inverseBindMatrices,
      jointMatrices: new Float32Array(joints.length * 16),
      joints,
      names: names.some((name) => name.length > 0) ? names : null,
    });
    return { skeleton, skeletonRoot: null };
  });
  for (let i = 0; i < document.nodes.length; i++) {
    const meshIndex = document.nodes[i].mesh;
    if (meshIndex === undefined) continue;
    const skinIndex = document.meshes[meshIndex]?.skin;
    if (skinIndex === undefined) continue;
    const skin = skins[skinIndex];
    if (skin !== null) (nodes[i] as unknown as Mesh).skin = skin;
  }
}

// Rebuilds each document animation into a node-bound AnimationClip and keys it into the scene's animation
// map by name (falling back to `animation${i}`). The document carries each channel's target as a node index
// plus SceneAnimationPath (the animation core's clip is target-free); here they become live
// SceneAnimationTarget bindings against the built nodes.
function attachDocumentAnimations(document: Readonly<SceneDocument>, nodes: readonly SceneNode[], scene: Scene): void {
  for (let a = 0; a < document.animations.length; a++) {
    const source = document.animations[a];
    const channels: AnimationChannel[] = [];
    for (let c = 0; c < source.channels.length; c++) {
      const channel = source.channels[c];
      const node = nodes[channel.node];
      if (node === undefined) continue;
      const target: SceneAnimationTarget = { node, path: channel.path };
      channels.push(createAnimationChannel(channel.track, target));
    }
    if (channels.length === 0) continue;
    scene.animations[source.name ?? `animation${a}`] = createAnimationClip(channels, source.duration);
  }
}

// Builds one SceneNode per document node (a Mesh when the node names a mesh index, a transform-only group
// otherwise), applies each authored transform, and wires the child index lists — returning the node pool
// that skins and animations resolve their indices against. Node identity never leaves the assembler; the
// document addresses everything by index.
function buildDocumentNodes(document: Readonly<SceneDocument>): SceneNode[] {
  const meshes = document.meshes;
  // A document's materials are stored as plain-data MaterialLike, but the importers fill them with real
  // entity-backed materials (createStandardPbrMaterial etc.); treat them as Material for assembly.
  const materials = document.materials as unknown as readonly Material[];
  const nodes: SceneNode[] = document.nodes.map((node) => buildDocumentNode(node, meshes, materials));
  for (let i = 0; i < document.nodes.length; i++) {
    applyDocumentNodeTransform(nodes[i], document.nodes[i]);
    const children = document.nodes[i].children;
    for (let c = 0; c < children.length; c++) {
      const child = nodes[children[c]];
      if (child !== undefined) addNodeChild(nodes[i], child);
    }
  }
  return nodes;
}

// Builds a single node: a Mesh (with its inline geometry, resolved materials, and morph) when the node
// names a mesh index, or a bare transform-only SceneNode otherwise.
function buildDocumentNode(
  node: Readonly<SceneDocumentNode>,
  meshes: Readonly<SceneDocument['meshes']>,
  materials: readonly Material[],
): SceneNode {
  if (node.mesh === undefined) return createSceneNode(node.kind, { name: node.name });
  const documentMesh = meshes[node.mesh];
  const meshMaterials: (Material | null)[] = documentMesh.materials.map((index) => materials[index] ?? null);
  const mesh = createMesh(documentMesh.geometry, meshMaterials, node.kind, { name: node.name });
  if (documentMesh.morph != null) mesh.morph = documentMesh.morph;
  return mesh as unknown as SceneNode;
}
