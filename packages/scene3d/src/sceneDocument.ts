import { createAnimationChannel, createAnimationClip } from '@flighthq/animation/contract';
import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { setQuaternion, setVector3 } from '@flighthq/geometry/contract';
import { createMaterial } from '@flighthq/materials/contract';
import { addNodeChild, invalidateNodeLocalTransform } from '@flighthq/node/contract';
import type {
  AnimationChannel,
  EntityConstruction,
  Material,
  MaterialLike,
  Mesh,
  Scene3D,
  Scene3DAnimationTarget,
  Scene3DDocument,
  Scene3DDocumentNode,
  Node3D,
  Skeleton3D,
  Skin,
} from '@flighthq/types/contract';
import { EntityRuntimeKey } from '@flighthq/types/contract';

import { createMesh } from './mesh';
import { createScene3D } from './scene';
import { createNode3D } from './sceneNode';

// Assembles a Scene3DDocument's scene into a live Scene3D — the inverse of the scene-format parsers, which STOP
// at the format-neutral Scene3DDocument decomposition rather than building entities inline. This is the single
// assembler every importer shares: `createScene3DFromGltf` and its siblings are `createScene3DFromDocument(parse
// <Format>(bytes))`. `sceneIndex` selects which of the document's scenes to build (default the first); the
// document's animation clips and metadata are attached to it. An empty or scene-less document yields an
// empty Scene3D.
//
// The function is a THIN composition of small per-component steps: build one Node3D per document node
// (Mesh when the node names a mesh, group otherwise), wire the child index lists, resolve each skin's joint
// indices to the built nodes, and rebuild each animation clip's channels against them — no format knowledge
// lives here. Cameras and lights are placement tables the document carries for the caller to read; they are
// not parented into the graph (a camera is a pure entity, not a scene node), so this assembler leaves them
// on the document. Use createScene3DLightsFromDocument when the parsed light table should become a
// renderer-ready, separately passed Scene3DLights draw argument.
export function createScene3DFromDocument(document: Readonly<Scene3DDocument>, sceneIndex = 0): Scene3D {
  const nodes = buildDocumentNodes(document);
  applyDocumentSkins(document, nodes);
  const scene = createScene3D();
  const roots = document.scenes[sceneIndex]?.rootNodes ?? [];
  for (let r = 0; r < roots.length; r++) {
    const node = nodes[roots[r]];
    if (node !== undefined) addNodeChild(scene.root, node);
  }
  attachDocumentAnimations(document, nodes, scene);
  scene.metadata = document.metadata;
  scene.resources = document.resources.slice();
  return scene;
}

// Assembles every scene the document declares (each a view of the shared node pool), in declaration order.
// The document's animation clips and metadata are attached to the default scene (index 0), matching the
// per-format multi-scene importers. An empty document yields an empty array.
export function createScene3DsFromDocument(document: Readonly<Scene3DDocument>): Scene3D[] {
  const nodes = buildDocumentNodes(document);
  applyDocumentSkins(document, nodes);
  const scenes: Scene3D[] = [];
  for (let s = 0; s < document.scenes.length; s++) {
    const scene = createScene3D();
    const roots = document.scenes[s].rootNodes;
    for (let r = 0; r < roots.length; r++) {
      const node = nodes[roots[r]];
      if (node !== undefined) addNodeChild(scene.root, node);
    }
    scenes.push(scene);
    scene.resources = document.resources.slice();
  }
  if (scenes.length > 0) {
    attachDocumentAnimations(document, nodes, scenes[0]);
    scenes[0].metadata = document.metadata;
  }
  return scenes;
}

export function initializeSkeleton3D(
  out: EntityConstruction<Skeleton3D>,
  inverseBindMatrices: Float32Array,
  jointMatrices: Float32Array,
  joints: Node3D[],
  names: Skeleton3D['names'],
  normalMatrices: Float32Array,
): void {
  out.inverseBindMatrices = inverseBindMatrices;
  out.jointMatrices = jointMatrices;
  out.joints = joints;
  out.names = names;
  out.normalMatrices = normalMatrices;
}

// Applies a document node's authored TRS transform, marking the local matrix stale so the world matrix
// recomposes from the fields.
function applyDocumentNodeTransform(node: Node3D, source: Readonly<Scene3DDocumentNode>): void {
  const t = source.transform;
  setVector3(node.position, t.position.x, t.position.y, t.position.z);
  setQuaternion(node.rotation, t.rotation.x, t.rotation.y, t.rotation.z, t.rotation.w);
  setVector3(node.scale, t.scale.x, t.scale.y, t.scale.z);
  invalidateNodeLocalTransform(node);
}

// Resolves each document skin's joint node indices to the built nodes, constructs a Skeleton3D (with its
// flat inverse-bind matrix array), and binds it onto every mesh whose document entry names that skin.
function applyDocumentSkins(document: Readonly<Scene3DDocument>, nodes: readonly Node3D[]): void {
  const skins: (Skin | null)[] = document.skins.map((skin) => {
    const joints: Node3D[] = [];
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
    // starts zeroed. Built inline through allocateEntity rather than via @flighthq/skeleton3d because that
    // package depends on @flighthq/scene3d (createMesh/createNode3D), which would form a cycle; the
    // Entity shape invariant still holds at this assembly seam.
    // Joint names are recovered from the resolved joint nodes; null when the source named none.
    const skeleton = (() => {
      const out = allocateEntity<Skeleton3D>();
      initializeSkeleton3D(
        out,
        inverseBindMatrices,
        new Float32Array(joints.length * 16),
        joints,
        names.some((name) => name.length > 0) ? names : null,
        new Float32Array(joints.length * 12),
      );
      return finishEntity(out);
    })();
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
// plus Scene3DAnimationPath (the animation core's clip is target-free); here they become live
// Scene3DAnimationTarget bindings against the built nodes.
function attachDocumentAnimations(document: Readonly<Scene3DDocument>, nodes: readonly Node3D[], scene: Scene3D): void {
  for (let a = 0; a < document.animations.length; a++) {
    const source = document.animations[a];
    const channels: AnimationChannel[] = [];
    for (let c = 0; c < source.channels.length; c++) {
      const channel = source.channels[c];
      const node = nodes[channel.node];
      if (node === undefined) continue;
      const target: Scene3DAnimationTarget = { node, path: channel.path };
      channels.push(createAnimationChannel(channel.track, target));
    }
    if (channels.length === 0) continue;
    scene.animations[source.name ?? `animation${a}`] = createAnimationClip(channels, source.duration);
  }
}

// Builds one Node3D per document node (a Mesh when the node names a mesh index, a transform-only group
// otherwise), applies each authored transform, and wires the child index lists — returning the node pool
// that skins and animations resolve their indices against. Node identity never leaves the assembler; the
// document addresses everything by index.
function buildDocumentNodes(document: Readonly<Scene3DDocument>): Node3D[] {
  const meshes = document.meshes;
  const materials = document.materials.map(materializeDocumentMaterial);
  const nodes: Node3D[] = document.nodes.map((node) => buildDocumentNode(node, meshes, materials));
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

// A document accepts serializable MaterialLike literals, while a live Mesh requires Material entities.
// Preserve an entity supplied by an importer so material sharing and batching identity survive assembly;
// otherwise copy the structural fields onto the canonical material entity rather than installing the
// caller's plain document object into the live scene.
function materializeDocumentMaterial(source: MaterialLike): Material {
  if (isMaterialEntity(source)) return source;
  return Object.assign(createMaterial(source.kind), source);
}

function isMaterialEntity(source: MaterialLike): source is Material {
  return EntityRuntimeKey in source;
}

// Builds a single node: a Mesh (with its inline geometry, resolved materials, and morph) when the node
// names a mesh index, or a bare transform-only Node3D otherwise.
function buildDocumentNode(
  node: Readonly<Scene3DDocumentNode>,
  meshes: Readonly<Scene3DDocument['meshes']>,
  materials: readonly Material[],
): Node3D {
  if (node.mesh === undefined) return createNode3D(node.kind, { name: node.name });
  const documentMesh = meshes[node.mesh];
  const meshMaterials: (Material | null)[] = documentMesh.materials.map((index) => materials[index] ?? null);
  const mesh = createMesh(documentMesh.geometry, meshMaterials, node.kind, { name: node.name });
  if (documentMesh.morph != null) mesh.morph = documentMesh.morph;
  return mesh as unknown as Node3D;
}
