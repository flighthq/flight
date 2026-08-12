import { createAnimationTrack } from '@flighthq/animation/contract';
import { packLinearToColor } from '@flighthq/color/contract';
import {
  composeMatrix4FromTransform3D,
  createMatrix4,
  createTransform3D,
  decomposeMatrix4ToTransform3D,
  multiplyMatrix4,
} from '@flighthq/geometry/contract';
import { detectImageMimeType } from '@flighthq/image-codec/contract';
import { createEmbeddedImageResourceReference, createExternalImageResourceReference } from '@flighthq/image/contract';
import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { createStandardPbrMaterial } from '@flighthq/materials/contract';
import {
  CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT,
  computeMeshGeometryFlatNormals,
  computeMeshGeometryTangents,
  createMeshGeometry,
  expandMeshGeometryIndices,
  getMeshGeometryVertexCount,
  indexMeshGeometryVertices,
} from '@flighthq/mesh/contract';
import { createScene3DFromDocument, createScene3DsFromDocument } from '@flighthq/scene3d/contract';
import { createTexture } from '@flighthq/texture/contract';
import type { Scene3D } from '@flighthq/types/contract';
import type {
  AnimationInterpolation,
  ImageResourceReference,
  ImportDiagnostic,
  Material,
  MaterialLike,
  MeshGeometry,
  MeshMorph,
  MorphTarget,
  PrimitiveTopology,
  Scene3DAnimationPath,
  Scene3DDocument,
  Scene3DDocumentAnimation,
  Scene3DDocumentAnimationChannel,
  Scene3DDocumentCamera,
  Scene3DDocumentMesh,
  Scene3DDocumentNode,
  Scene3DDocumentSkin,
  Texture,
  TextureColorSpace,
  TextureFilter,
  TextureWrap,
  Transform3D,
  GltfExtensionContext,
  GltfDracoMesh,
  GltfExtensionHandler,
  GltfImportOptions,
  GltfAccessor,
  GltfBuffer,
  GltfBufferView,
  GltfComponentType,
  GltfDocument,
  GltfImage,
  GltfMaterial,
  GltfMorphTarget,
  GltfNode,
  GltfPrimitive,
  GltfSampler,
  GltfTextureInfo,
} from '@flighthq/types/contract';
import {
  ImportDiagnosticSeverity,
  MeshKind,
  Scene3DAnimationPathRotation,
  Scene3DAnimationPathScale,
  Scene3DAnimationPathTranslation,
  Scene3DAnimationPathWeights,
  Node3DKind,
} from '@flighthq/types/contract';

// Parses a binary glTF (`.glb`) container into a Scene3D — the file's default scene (`doc.scene`).
// Convenience over `createScene3DFromDocument(parseGlb(bytes), defaultScene3D)`; malformed containers return an
// empty Scene3D.
export function createScene3DFromGlb(
  bytes: Readonly<Uint8Array>,
  diagnostics?: ImportDiagnostic[],
  options?: Readonly<GltfImportOptions>,
): Scene3D {
  const container = readGlbContainer(bytes, diagnostics);
  if (container === null) return createScene3DFromDocument(createEmptyGltfDocument());
  return createScene3DFromDocument(
    buildGltfDocument(container.document, container.binary, options, diagnostics),
    container.document.scene ?? 0,
  );
}

// Parses a glTF 2.0 document (JSON string or already-parsed object) into a Scene3D — the file's default scene
// (`doc.scene`). Convenience over `createScene3DFromDocument(parseGltf(source), defaultScene3D)`; a malformed
// JSON string returns an empty Scene3D.
export function createScene3DFromGltf(
  source: GltfDocument | string,
  diagnostics?: ImportDiagnostic[],
  options?: Readonly<GltfImportOptions>,
): Scene3D {
  const doc = parseGltfSource(source, diagnostics);
  if (doc === null) return createScene3DFromDocument(createEmptyGltfDocument());
  return createScene3DFromDocument(buildGltfDocument(doc, null, options, diagnostics), doc.scene ?? 0);
}

// Parses a binary glTF (`.glb`) container into every scene it declares (`Scene3D[]`), each carrying its
// geometry; the file's animation clips are attached to the default scene. Malformed containers return an
// empty array.
export function createScene3DsFromGlb(
  bytes: Readonly<Uint8Array>,
  diagnostics?: ImportDiagnostic[],
  options?: Readonly<GltfImportOptions>,
): Scene3D[] {
  return createScene3DsFromDocument(parseGlb(bytes, diagnostics, options));
}

// Parses a glTF 2.0 document into every scene it declares (`Scene3D[]`), each carrying its geometry; the
// file's animation clips are attached to the default scene. Reach for this over createScene3DFromGltf when the
// file declares multiple scenes. A malformed JSON string returns an empty array.
export function createScene3DsFromGltf(
  source: GltfDocument | string,
  diagnostics?: ImportDiagnostic[],
  options?: Readonly<GltfImportOptions>,
): Scene3D[] {
  return createScene3DsFromDocument(parseGltf(source, diagnostics, options));
}

// Parses a binary glTF (`.glb`) container into a format-neutral Scene3DDocument. The 12-byte header (magic
// `glTF`, version, length) is validated, then the chunk stream is walked to extract the embedded JSON
// document and the optional BIN chunk; the BIN chunk backs any buffer that has no `uri`. `options` supplies
// external buffer bytes and a base path for any external URIs the GLB still references. Malformed containers
// return an empty document and push a warning rather than throwing. Assemble it into a live Scene3D with
// `createScene3DFromDocument`.
export function parseGlb(
  bytes: Readonly<Uint8Array>,
  diagnostics?: ImportDiagnostic[],
  options?: Readonly<GltfImportOptions>,
): Scene3DDocument {
  const container = readGlbContainer(bytes, diagnostics);
  if (container === null) return createEmptyGltfDocument();
  return buildGltfDocument(container.document, container.binary, options, diagnostics);
}

// Parses a glTF 2.0 document (JSON string or already-parsed object) into a format-neutral Scene3DDocument:
// the node hierarchy with transforms, meshes (inline geometry + materials), skins, morph, and animation.
// A malformed JSON string returns an empty document and pushes a warning rather than throwing. Assemble it
// into a live Scene3D with `createScene3DFromDocument`.
//
// Imported today: POSITION + optional NORMAL / TANGENT / TEXCOORD_0 + indices, interleaved into the
// canonical PBR vertex layout (or the skinned layout when JOINTS_0/WEIGHTS_0 are present); skins (joint
// hierarchy + inverse-bind matrices); every `primitives[]` entry of a mesh (multi-primitive → sub-mesh
// child nodes); strided (`byteStride`) and normalized-integer accessors; sparse accessors; materials
// (metallic-roughness PBR → StandardPbrMaterial); textures with their sampler (wrap/filter), color space
// (srgb for baseColor/emissive, linear for data maps), and KHR_texture_transform UV remap, resolving
// embedded bytes to Embedded refs and external URIs to External refs (against `options.basePath`); external
// (`.bin`) buffers via `options.externalBuffers`.
export function parseGltf(
  source: GltfDocument | string,
  diagnostics?: ImportDiagnostic[],
  options?: Readonly<GltfImportOptions>,
): Scene3DDocument {
  const doc = parseGltfSource(source, diagnostics);
  if (doc === null) return createEmptyGltfDocument();
  return buildGltfDocument(doc, null, options, diagnostics);
}

// Parses the JSON string or accepts the already-parsed object, returning null (with a warning) on invalid
// JSON or a non-object document.
function parseGltfSource(source: GltfDocument | string, diagnostics?: ImportDiagnostic[]): GltfDocument | null {
  let doc: GltfDocument;
  if (typeof source === 'string') {
    try {
      doc = JSON.parse(source) as GltfDocument;
    } catch {
      reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Reject, 'gltf.invalid-json', 'parseGltfSource');
      return null;
    }
  } else {
    doc = source;
  }
  if (doc === null || typeof doc !== 'object') {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Reject, 'gltf.not-an-object', 'parseGltfSource');
    return null;
  }
  return doc;
}

// The empty Scene3DDocument returned when parsing fails — every table present and empty, so callers and the
// assembler never special-case a partial document.
function createEmptyGltfDocument(): Scene3DDocument {
  return {
    animations: [],
    cameras: [],
    lights: [],
    materials: [],
    meshes: [],
    metadata: null,
    nodes: [],
    resources: [],
    scenes: [],
    skins: [],
  };
}

// Builds the format-neutral Scene3DDocument from a parsed glTF document plus an optional GLB binary chunk
// (null for the JSON path). This is the decomposition the importer stops at: inline mesh geometry, resolved
// materials, node tables with index refs, skins by joint index, and node-index-bound animation channels —
// `createScene3DFromDocument` assembles it into live entities. A multi-primitive glTF mesh expands into a
// group node with one child mesh node per primitive, so every document mesh carries exactly one geometry.
function buildGltfDocument(
  doc: Readonly<GltfDocument>,
  binary: Readonly<Uint8Array> | null,
  options: Readonly<GltfImportOptions> | undefined,
  diagnostics?: ImportDiagnostic[],
): Scene3DDocument {
  // buildGltfDocument is the single physical emitter for every aggregated document-build crumb (hence the
  // origin); the tallies store no origin. Every per-node/per-primitive/per-accessor fault it fans out to
  // aggregates here and flushes once at the end. The pre-parse gates (parseGltfSource/readGlbContainer)
  // report their whole-input Rejects directly with their own origins.
  const gltfDrops = diagnostics ? new Map<string, GltfDropTally>() : null;
  const version = doc.asset?.version;
  if (version === undefined || !isSupportedGltfVersion(version)) {
    tallyGltfDrop(gltfDrops, ImportDiagnosticSeverity.Recover, 'gltf.unsupported-version', '', {
      version: version ?? '(missing)',
    });
  }
  if (doc.extensionsRequired !== undefined) {
    for (const extension of doc.extensionsRequired) {
      if (isSupportedGltfExtension(extension, options?.extensionHandlers)) continue;
      tallyGltfDrop(gltfDrops, ImportDiagnosticSeverity.Skip, 'gltf.unsupported-required-extension', '', {
        firstExtension: extension,
      });
    }
  }

  const buffers = (doc.buffers ?? []).map((buffer) => decodeGltfBuffer(buffer, binary, options, gltfDrops));
  const imageResources = (doc.images ?? []).map((image, i) =>
    buildGltfImageResourceReference(doc, buffers, image, options, i, gltfDrops),
  );
  const resources = imageResources.filter((resource): resource is ImageResourceReference => resource !== null);
  const materials: MaterialLike[] = (doc.materials ?? []).map(
    (material) => gltfMaterialToPbr(doc, imageResources, material, gltfDrops) as MaterialLike,
  );

  // One document mesh per glTF primitive (inline geometry + morph + material indices). Track, per glTF
  // mesh, the list of document-mesh indices it expands to, so a node can point at the right ones.
  const meshes: Scene3DDocumentMesh[] = [];
  const gltfMeshToDocMeshes: number[][] = (doc.meshes ?? []).map((gltfMesh) => {
    const docMeshIndices: number[] = [];
    for (let p = 0; p < gltfMesh.primitives.length; p++) {
      const primitive = gltfMesh.primitives[p];
      const geometry = primitiveToGeometry(doc, buffers, primitive, gltfDrops);
      // A primitive with no usable position data yields no geometry and is dropped (its gltf.primitive-no-
      // position crumb already fired) — it produces no document mesh, so a mesh whose every primitive drops
      // becomes a bare node with no children.
      if (geometry === null) continue;
      const morph = buildGltfMorph(
        doc,
        buffers,
        primitive,
        gltfMesh.weights,
        getMeshGeometryVertexCount(geometry),
        gltfDrops,
      );
      const documentMesh: Scene3DDocumentMesh = {
        geometry,
        materials: primitive.material !== undefined ? [primitive.material] : [],
      };
      if (morph !== null) documentMesh.morph = morph;
      docMeshIndices.push(meshes.length);
      meshes.push(documentMesh);
    }
    return docMeshIndices;
  });

  const gltfNodes = doc.nodes ?? [];
  const nodes: Scene3DDocumentNode[] = [];
  // Maps a glTF node index to the document node index that carries its transform + hierarchy. For a
  // multi-primitive mesh the group node holds the transform and the extra primitives become its children.
  const gltfNodeToDocNode: number[] = new Array(gltfNodes.length);
  // For a glTF node whose mesh has N>1 primitives, the document node indices of its per-primitive child
  // mesh nodes (so an animation weights channel can fan out to each). Empty for single-primitive nodes.
  const gltfNodePrimitiveNodes: number[][] = gltfNodes.map(() => []);

  for (let i = 0; i < gltfNodes.length; i++) {
    const gltfNode = gltfNodes[i];
    const transform = gltfNodeTransform(gltfNode);
    const docMeshes = gltfNode.mesh !== undefined ? gltfMeshToDocMeshes[gltfNode.mesh] : undefined;
    const nodeIndex = nodes.length;
    gltfNodeToDocNode[i] = nodeIndex;
    if (docMeshes !== undefined && docMeshes.length === 1) {
      nodes.push({ children: [], kind: MeshKind, mesh: docMeshes[0], name: gltfNode.name, transform });
    } else if (docMeshes !== undefined && docMeshes.length > 1) {
      // Group node holds the transform; one child mesh node per primitive (identity transform).
      const group: Scene3DDocumentNode = { children: [], kind: Node3DKind, name: gltfNode.name, transform };
      nodes.push(group);
      for (let m = 0; m < docMeshes.length; m++) {
        const childIndex = nodes.length;
        group.children.push(childIndex);
        gltfNodePrimitiveNodes[i].push(childIndex);
        nodes.push({ children: [], kind: MeshKind, mesh: docMeshes[m], transform: createIdentityTransform() });
      }
    } else {
      nodes.push({ children: [], kind: Node3DKind, name: gltfNode.name, transform });
    }
  }

  // Wire the glTF child hierarchy onto the document group/leaf nodes (each glTF node's own doc node).
  for (let i = 0; i < gltfNodes.length; i++) {
    const children = gltfNodes[i].children;
    if (children === undefined) continue;
    const parent = nodes[gltfNodeToDocNode[i]];
    for (let c = 0; c < children.length; c++) parent.children.push(gltfNodeToDocNode[children[c]]);
  }

  const skins = buildGltfSkins(doc, buffers, gltfNodeToDocNode, gltfDrops);
  // Bind each glTF node's skin onto the document mesh(es) it produced (mesh.skin = skin index).
  for (let i = 0; i < gltfNodes.length; i++) {
    const skinIndex = gltfNodes[i].skin;
    if (skinIndex === undefined || gltfNodes[i].mesh === undefined) continue;
    const meshIndicesForNode = gltfMeshToDocMeshes[gltfNodes[i].mesh as number] ?? [];
    for (let m = 0; m < meshIndicesForNode.length; m++) meshes[meshIndicesForNode[m]].skin = skinIndex;
  }

  const scenes = (doc.scenes ?? [{ nodes: topLevelNodeIndices(gltfNodes) }]).map((scene) => ({
    name: scene.name,
    rootNodes: (scene.nodes ?? []).map((n) => gltfNodeToDocNode[n]),
  }));

  const animations = buildGltfAnimations(
    doc,
    buffers,
    gltfNodeToDocNode,
    gltfNodePrimitiveNodes,
    nodes,
    meshes,
    gltfDrops,
  );
  const nodeWorldTransforms = buildGltfNodeWorldTransforms(gltfNodes, gltfDrops);
  const cameras = buildGltfCameras(doc, gltfNodes, gltfNodeToDocNode, nodeWorldTransforms, gltfDrops);
  const document: Scene3DDocument = {
    animations,
    cameras,
    lights: [],
    materials,
    meshes,
    metadata: buildGltfMetadata(doc),
    nodes,
    resources,
    scenes,
    skins,
  };
  applyGltfExtensionHandlers(
    document,
    doc,
    imageResources,
    gltfNodeToDocNode,
    nodeWorldTransforms,
    options?.extensionHandlers,
    gltfDrops,
    diagnostics,
  );

  if (gltfDrops !== null) {
    for (const tally of gltfDrops.values()) {
      reportImportDiagnostic(diagnostics, tally.severity, tally.kind, 'buildGltfDocument', {
        ...tally.detail,
        count: tally.count,
      });
    }
  }
  return document;
}

// Builds one placed document camera per glTF node that references a camera definition. Clip distances
// remain explicit document facts; an omitted perspective zfar is retained as the glTF infinite-far model.
// The projection's stored aspect is only the authored fallback—the draw-time viewport remains authoritative.
function buildGltfCameras(
  doc: Readonly<GltfDocument>,
  nodes: readonly GltfNode[],
  nodeIndices: readonly number[],
  nodeWorldTransforms: readonly Transform3D[],
  gltfDrops: Map<string, GltfDropTally> | null,
): Scene3DDocumentCamera[] {
  const cameras: Scene3DDocumentCamera[] = [];
  const definitions = doc.cameras ?? [];
  for (let node = 0; node < nodes.length; node++) {
    const cameraIndex = nodes[node].camera;
    if (cameraIndex === undefined) continue;
    const definition = definitions[cameraIndex];
    if (definition === undefined) {
      tallyGltfDrop(gltfDrops, ImportDiagnosticSeverity.Drop, 'gltf.camera-missing', '', {
        firstCamera: cameraIndex,
        firstNode: node,
      });
      continue;
    }
    if (definition.type === 'perspective' && definition.perspective !== undefined) {
      const perspective = definition.perspective;
      if (
        !(perspective.yfov > 0) ||
        perspective.yfov >= Math.PI ||
        !(perspective.znear > 0) ||
        (perspective.zfar !== undefined && !(perspective.zfar > perspective.znear)) ||
        (perspective.aspectRatio !== undefined && !(perspective.aspectRatio > 0))
      ) {
        tallyGltfDrop(gltfDrops, ImportDiagnosticSeverity.Drop, 'gltf.camera-invalid-perspective', '', {
          firstCamera: cameraIndex,
        });
        continue;
      }
      cameras.push({
        far: perspective.zfar ?? Number.POSITIVE_INFINITY,
        name: definition.name,
        near: perspective.znear,
        node: nodeIndices[node],
        projection: {
          aspect: perspective.aspectRatio ?? 1,
          fovY: perspective.yfov,
          kind: 'perspective',
        },
        transform: cloneGltfTransform(nodeWorldTransforms[node]),
      });
      continue;
    }
    if (definition.type === 'orthographic' && definition.orthographic !== undefined) {
      const orthographic = definition.orthographic;
      if (
        !(orthographic.xmag > 0) ||
        !(orthographic.ymag > 0) ||
        !(orthographic.znear >= 0) ||
        !(orthographic.zfar > orthographic.znear)
      ) {
        tallyGltfDrop(gltfDrops, ImportDiagnosticSeverity.Drop, 'gltf.camera-invalid-orthographic', '', {
          firstCamera: cameraIndex,
        });
        continue;
      }
      cameras.push({
        far: orthographic.zfar,
        name: definition.name,
        near: orthographic.znear,
        node: nodeIndices[node],
        projection: {
          halfHeight: orthographic.ymag,
          halfWidth: orthographic.xmag,
          kind: 'orthographic',
        },
        transform: cloneGltfTransform(nodeWorldTransforms[node]),
      });
      continue;
    }
    tallyGltfDrop(gltfDrops, ImportDiagnosticSeverity.Drop, 'gltf.camera-missing-descriptor', '', {
      firstCamera: cameraIndex,
      firstType: definition.type,
    });
  }
  return cameras;
}

function applyGltfExtensionHandlers(
  document: Scene3DDocument,
  source: Readonly<GltfDocument>,
  imageResources: readonly (ImageResourceReference | null)[],
  nodeIndices: readonly number[],
  nodeWorldTransforms: readonly Transform3D[],
  handlers: readonly GltfExtensionHandler[] | undefined,
  gltfDrops: Map<string, GltfDropTally> | null,
  diagnostics: ImportDiagnostic[] | undefined,
): void {
  if (handlers === undefined || handlers.length === 0) return;
  const selected = new Map<string, GltfExtensionHandler>();
  for (const handler of handlers) {
    if (selected.has(handler.kind)) {
      tallyGltfDrop(gltfDrops, ImportDiagnosticSeverity.Recover, 'gltf.duplicate-extension-handler', '', {
        firstKind: handler.kind,
      });
    }
    selected.set(handler.kind, handler);
  }
  // Handlers push structured crumbs straight onto the raw diagnostics array (aggregating their own
  // per-element faults, as the built-in punctual-lights handler does); this is why the context carries the
  // array, not the parser-private tally.
  const context: GltfExtensionContext = {
    buildNodeTransform(node) {
      return cloneGltfTransform(nodeWorldTransforms[node] ?? createIdentityTransform());
    },
    diagnostics,
    document,
    nodeIndices,
    // The core's own resolver, bound to this parse's image table, so an extension's textures become the
    // same Unresolved refs the base material's do rather than a parallel dialect of them.
    resolveTexture(info, colorSpace) {
      return resolveGltfTexture(source, imageResources, info, colorSpace, gltfDrops);
    },
    source,
  };
  for (const handler of selected.values()) handler.apply(context);
}

// Resolves the authored local TRS hierarchy into one world-space placement per glTF node. Camera/light
// document tables are standalone placements, so their transform must remain useful even before a caller
// binds the optional node index. A malformed cycle or second parent degrades deterministically with a
// warning instead of recursing forever.
function buildGltfNodeWorldTransforms(
  nodes: readonly GltfNode[],
  gltfDrops: Map<string, GltfDropTally> | null,
): Transform3D[] {
  const parents = new Int32Array(nodes.length);
  parents.fill(-1);
  for (let parent = 0; parent < nodes.length; parent++) {
    for (const child of nodes[parent].children ?? []) {
      if (child < 0 || child >= nodes.length) {
        // A child index outside the node table — the malformed reference is ignored (the rest of the
        // hierarchy still resolves), so this is a Recover, like the multiple-parents/cycle guards below.
        tallyGltfDrop(gltfDrops, ImportDiagnosticSeverity.Recover, 'gltf.node-child-out-of-range', '', {
          firstChild: child,
        });
        continue;
      }
      if (parents[child] !== -1) {
        tallyGltfDrop(gltfDrops, ImportDiagnosticSeverity.Recover, 'gltf.node-multiple-parents', '', {
          firstChild: child,
          firstParent: parents[child],
        });
        continue;
      }
      parents[child] = parent;
    }
  }
  const localMatrices = nodes.map((node) => {
    const matrix = createMatrix4();
    composeMatrix4FromTransform3D(matrix, gltfNodeTransform(node));
    return matrix;
  });
  const worldMatrices = nodes.map(() => createMatrix4());
  const state = new Uint8Array(nodes.length);
  const stack: number[] = [];
  const transforms: Transform3D[] = [];
  for (let start = 0; start < nodes.length; start++) {
    while (state[start] !== 2) {
      stack.length = 0;
      let node = start;
      let cycle = false;
      while (node >= 0 && state[node] !== 2) {
        if (state[node] === 1) {
          tallyGltfDrop(gltfDrops, ImportDiagnosticSeverity.Recover, 'gltf.node-hierarchy-cycle', '', {
            firstNode: node,
          });
          parents[node] = -1;
          for (let i = 0; i < stack.length; i++) state[stack[i]] = 0;
          cycle = true;
          break;
        }
        state[node] = 1;
        stack.push(node);
        node = parents[node];
      }
      if (cycle) continue;
      while (stack.length > 0) {
        node = stack.pop()!;
        const parent = parents[node];
        if (parent >= 0) {
          multiplyMatrix4(worldMatrices[node], worldMatrices[parent], localMatrices[node]);
        } else {
          worldMatrices[node].m.set(localMatrices[node].m);
        }
        state[node] = 2;
      }
    }
  }
  for (let node = 0; node < nodes.length; node++) {
    const transform = createTransform3D();
    decomposeMatrix4ToTransform3D(transform, worldMatrices[node]);
    transforms.push(transform);
  }
  return transforms;
}

function cloneGltfTransform(source: Readonly<Transform3D>): Transform3D {
  const transform = createTransform3D();
  transform.position.x = source.position.x;
  transform.position.y = source.position.y;
  transform.position.z = source.position.z;
  transform.rotation.x = source.rotation.x;
  transform.rotation.y = source.rotation.y;
  transform.rotation.z = source.rotation.z;
  transform.rotation.w = source.rotation.w;
  transform.scale.x = source.scale.x;
  transform.scale.y = source.scale.y;
  transform.scale.z = source.scale.z;
  return transform;
}

// Builds the document's skin table: each glTF `skins[]` entry becomes a Scene3DDocumentSkin whose `joints` are
// document node indices and whose `inverseBind` is one Matrix4 per joint (identity per the spec when the
// accessor is absent).
function buildGltfSkins(
  doc: Readonly<GltfDocument>,
  buffers: readonly Uint8Array[],
  gltfNodeToDocNode: readonly number[],
  gltfDrops: Map<string, GltfDropTally> | null,
): Scene3DDocumentSkin[] {
  return (doc.skins ?? []).map((gltfSkin) => {
    const joints = gltfSkin.joints.map((jointNodeIndex) => gltfNodeToDocNode[jointNodeIndex]);
    const inverseBind: { m: Float32Array }[] = [];
    if (gltfSkin.inverseBindMatrices !== undefined) {
      const ibm = readAccessor(doc, buffers, gltfSkin.inverseBindMatrices, gltfDrops, 'MAT4');
      if (ibm.fault !== null) {
        // The IBM accessor is unreadable. glTF treats absent inverse-bind matrices as identity, so fall
        // back to identity per joint — the skin survives in bind pose rather than collapsing to a zero
        // matrix (which would send the mesh to the origin). Degraded-but-usable = Recover.
        reportGltfAccessorFault(gltfDrops, ImportDiagnosticSeverity.Recover, ibm.fault);
        for (let j = 0; j < joints.length; j++) inverseBind.push({ m: identityMatrix16() });
      } else if (ibm.count < joints.length) {
        // Present but too few matrices to cover every joint: filling the missing joints with a zero matrix
        // would collapse the mesh, so recover to identity for ALL joints (bind pose) rather than a partial,
        // corrupt palette. Recover — the skin stays usable.
        tallyGltfDrop(gltfDrops, ImportDiagnosticSeverity.Recover, 'gltf.skin-ibm-count-mismatch', '', {
          firstActual: ibm.count,
          firstExpected: joints.length,
        });
        for (let j = 0; j < joints.length; j++) inverseBind.push({ m: identityMatrix16() });
      } else {
        const flat = ibm.data;
        for (let j = 0; j < joints.length; j++) {
          inverseBind.push({ m: Float32Array.from({ length: 16 }, (_, k) => flat[j * 16 + k] ?? 0) });
        }
      }
    } else {
      for (let j = 0; j < joints.length; j++) inverseBind.push({ m: identityMatrix16() });
    }
    return { inverseBind, joints };
  });
}

// Builds the document's animation table. Each glTF animation becomes a Scene3DDocumentAnimation whose channels
// carry a document node index + Scene3DAnimationPath + a sampled AnimationTrack. A `weights` (morph) channel
// fans out to each morphable mesh node the target produced (the group's per-primitive children, or the leaf
// mesh node itself), its track width set to that mesh's morph-target count.
function buildGltfAnimations(
  doc: Readonly<GltfDocument>,
  buffers: readonly Uint8Array[],
  gltfNodeToDocNode: readonly number[],
  gltfNodePrimitiveNodes: readonly number[][],
  nodes: readonly Scene3DDocumentNode[],
  meshes: readonly Scene3DDocumentMesh[],
  gltfDrops: Map<string, GltfDropTally> | null,
): Scene3DDocumentAnimation[] {
  const animations: Scene3DDocumentAnimation[] = [];
  const gltfAnimations = doc.animations ?? [];
  for (let a = 0; a < gltfAnimations.length; a++) {
    const animation = gltfAnimations[a];
    const channels: Scene3DDocumentAnimationChannel[] = [];
    let duration = 0;
    for (const channel of animation.channels) {
      const targetNodeIndex = channel.target.node;
      if (targetNodeIndex === undefined || gltfNodeToDocNode[targetNodeIndex] === undefined) {
        // The channel targets no node, or a node index outside the table — it cannot be bound, so the
        // channel is omitted (Drop). If every channel of an animation drops this way the animation vanishes
        // (see the channels.length > 0 guard below), which the crumb makes visible.
        tallyGltfDrop(gltfDrops, ImportDiagnosticSeverity.Drop, 'gltf.animation-target-unresolved', '', {
          firstTarget: targetNodeIndex ?? -1,
        });
        continue;
      }
      const sampler = animation.samplers[channel.sampler];
      if (sampler === undefined) {
        tallyGltfDrop(gltfDrops, ImportDiagnosticSeverity.Drop, 'gltf.animation-missing-sampler', '', {
          firstSampler: channel.sampler,
        });
        continue;
      }
      // Time keys are SCALAR; the output element type is fixed by the path (rotation VEC4, translation/scale
      // VEC3, weights SCALAR). readAccessor faults on a type mismatch, so a VEC3 "rotation" output is caught
      // here as a fault rather than silently sampled as a 4-component quaternion.
      const inputResult = readAccessor(doc, buffers, sampler.input, gltfDrops, 'SCALAR');
      const outputResult = readAccessor(
        doc,
        buffers,
        sampler.output,
        gltfDrops,
        GLTF_ANIMATION_OUTPUT_TYPES[channel.target.path],
      );
      if (inputResult.fault !== null || outputResult.fault !== null) {
        // A sampler whose time or value accessor is unreadable or the wrong type cannot produce a track — drop
        // this channel (Drop), consistent with the unresolved-target and missing-sampler channel drops above.
        // No partial track survives, so this is not a Recover.
        reportGltfAccessorFault(gltfDrops, ImportDiagnosticSeverity.Drop, inputResult.fault ?? outputResult.fault!);
        continue;
      }
      const times = inputResult.data;
      const values = outputResult.data;
      if (inputResult.count === 0 || outputResult.count === 0) {
        // A usable track needs at least one keyframe — an empty sampler yields no usable track, so drop the
        // channel (Drop) rather than create an animation with an empty channel.
        tallyGltfDrop(gltfDrops, ImportDiagnosticSeverity.Drop, 'gltf.animation-sampler-empty', '', {
          firstSampler: channel.sampler,
        });
        continue;
      }
      // Validate output cardinality against the keyframe count by INTERPOLATION (element counts, not flattened
      // lengths — a VEC4 output with 1 element against 2 keys has length 4, which a `% keys` check wrongly
      // admits). LINEAR/STEP: one output element per key; CUBICSPLINE: three (in-tangent, value, out-tangent).
      // A mismatch is a malformed track → drop the channel. Weights are SCALAR but target-width-scaled, so
      // their cardinality is validated per-mesh in appendGltfWeightsChannels where the target count is known.
      const cubic = sampler.interpolation === 'CUBICSPLINE';
      if (channel.target.path !== 'weights' && outputResult.count !== (cubic ? 3 : 1) * inputResult.count) {
        tallyGltfDrop(gltfDrops, ImportDiagnosticSeverity.Drop, 'gltf.animation-sampler-cardinality', '', {
          firstSampler: channel.sampler,
        });
        continue;
      }
      duration = Math.max(duration, times.length > 0 ? times[times.length - 1] : 0);

      if (channel.target.path === 'weights') {
        // A multi-primitive mesh's morphable mesh nodes are its per-primitive children; a single-primitive
        // mesh is the target's own document node. Fan the per-mesh glTF weights channel to each.
        const meshNodeIndices =
          gltfNodePrimitiveNodes[targetNodeIndex].length > 0
            ? gltfNodePrimitiveNodes[targetNodeIndex]
            : [gltfNodeToDocNode[targetNodeIndex]];
        appendGltfWeightsChannels(
          channels,
          meshNodeIndices,
          nodes,
          meshes,
          times,
          values,
          sampler.interpolation,
          gltfDrops,
        );
        continue;
      }
      const path = GLTF_ANIMATION_PATHS[channel.target.path];
      if (path === undefined) {
        tallyGltfDrop(gltfDrops, ImportDiagnosticSeverity.Skip, 'gltf.animation-unsupported-path', '', {
          firstPath: channel.target.path,
        });
        continue;
      }
      const quaternion = path === Scene3DAnimationPathRotation;
      const track = createAnimationTrack({
        components: quaternion ? 4 : 3,
        interpolation: GLTF_SAMPLER_INTERPOLATIONS[sampler.interpolation ?? 'LINEAR'],
        quaternion,
        times,
        values,
      });
      channels.push({ node: gltfNodeToDocNode[targetNodeIndex], path, track });
    }
    if (channels.length > 0) animations.push({ channels, duration, name: animation.name ?? `animation${a}` });
  }
  return animations;
}

// Appends a Weights (morph) animation channel for each morphable mesh node the target produced (already
// resolved to document node indices: a single-primitive mesh's own node, or a multi-primitive mesh's
// per-primitive child mesh nodes — glTF weights are per-mesh and applied to every primitive). Each channel's
// track width is that mesh's morph-target count so the per-keyframe value block samples straight into the
// mesh's weight array. A target with no morphable mesh yields no channel (silently dropped).
function appendGltfWeightsChannels(
  channels: Scene3DDocumentAnimationChannel[],
  meshNodeIndices: readonly number[],
  nodes: readonly Scene3DDocumentNode[],
  meshes: readonly Scene3DDocumentMesh[],
  times: ArrayLike<number>,
  values: ArrayLike<number>,
  interpolation: string | undefined,
  gltfDrops: Map<string, GltfDropTally> | null,
): void {
  // SCALAR weight keys, so `times.length` is the keyframe count and `values.length` packs the per-key weights.
  // Each key carries one weight per morph target (×3 for CUBICSPLINE tangents), so the output must be exactly
  // (perKey · keys · targetWidth) long; a mismatch cannot drive that mesh's morph and its channel is dropped.
  const perKey = interpolation === 'CUBICSPLINE' ? 3 : 1;
  let bound = 0;
  let cardinalityDropped = false;
  for (let i = 0; i < meshNodeIndices.length; i++) {
    const meshIndex = nodes[meshNodeIndices[i]]?.mesh;
    const morph = meshIndex !== undefined ? meshes[meshIndex]?.morph : null;
    if (morph == null || morph.targets.length === 0) continue;
    if (values.length !== perKey * times.length * morph.targets.length) {
      tallyGltfDrop(gltfDrops, ImportDiagnosticSeverity.Drop, 'gltf.weights-cardinality-mismatch', '', {
        firstExpected: perKey * times.length * morph.targets.length,
        firstActual: values.length,
      });
      cardinalityDropped = true;
      continue;
    }
    const track = createAnimationTrack({
      components: morph.targets.length,
      interpolation: GLTF_SAMPLER_INTERPOLATIONS[interpolation ?? 'LINEAR'],
      times,
      values,
    });
    channels.push({ node: meshNodeIndices[i], path: Scene3DAnimationPathWeights, track });
    bound++;
  }
  if (bound === 0 && !cardinalityDropped) {
    tallyGltfDrop(gltfDrops, ImportDiagnosticSeverity.Drop, 'gltf.weights-no-morphable-mesh', '', {});
  }
}

// The document metadata for a glTF file — currently null, since the imported glTF schema subset carries no
// provenance fields (asset.generator/copyright are not read). Kept as a named seam so a future asset-block
// read populates it in one place.
function buildGltfMetadata(_doc: Readonly<GltfDocument>): null {
  return null;
}

// An identity decomposed transform for a synthesized child mesh node (a multi-primitive mesh's per-primitive
// children draw at the group's transform, so their own local transform is identity).
function createIdentityTransform(): Transform3D {
  return createTransform3D();
}

// The document transform for a glTF node: its 16-float column-major `matrix` decomposed to TRS (lossy only
// on shear, which glTF authoring does not produce), or its explicit translation/rotation/scale fields, or
// the identity when the node authors neither.
function gltfNodeTransform(gltfNode: Readonly<GltfNode>): Transform3D {
  const transform = createTransform3D();
  if (gltfNode.matrix !== undefined) {
    decomposeMatrix4ToTransform3D(transform, { m: new Float32Array(gltfNode.matrix) });
    return transform;
  }
  const t = gltfNode.translation;
  const r = gltfNode.rotation;
  const s = gltfNode.scale;
  if (t !== undefined) {
    transform.position.x = t[0] ?? 0;
    transform.position.y = t[1] ?? 0;
    transform.position.z = t[2] ?? 0;
  }
  if (r !== undefined) {
    transform.rotation.x = r[0] ?? 0;
    transform.rotation.y = r[1] ?? 0;
    transform.rotation.z = r[2] ?? 0;
    transform.rotation.w = r[3] ?? 1;
  }
  if (s !== undefined) {
    transform.scale.x = s[0] ?? 1;
    transform.scale.y = s[1] ?? 1;
    transform.scale.z = s[2] ?? 1;
  }
  return transform;
}

// A fresh 16-float identity matrix for a skin joint with no inverse-bind accessor (spec default).
function identityMatrix16(): Float32Array {
  const m = new Float32Array(16);
  m[0] = 1;
  m[5] = 1;
  m[10] = 1;
  m[15] = 1;
  return m;
}

// Converts a glTF material to Flight's StandardPbrMaterial — glTF's own metallic-roughness model. The
// pbrMetallicRoughness factors/textures, the normal/occlusion/emissive channels, and the alpha mode
// map field-for-field; absent factors take the spec defaults. Textures resolve to Unresolved refs
// carrying their sampler, color space, and KHR_texture_transform (the parser references, it does not
// decode). baseColor/emissive maps are sampled in 'srgb'; the data maps (normal/metallic-roughness/
// occlusion) in 'linear', so a shader does not gamma-decode data channels. glTF's baseColorFactor and
// emissiveFactor are LINEAR, but StandardPbrMaterial.baseColor/emissive are packed sRGB (scene-gl
// gamma-decodes them via unpackColorToLinear), so the linear factor is sRGB-encoded with
// packLinearToColor before packing — the documented inverse of that decode. This is the faithful
// decode: glTF is natively PBR, so unlike the classic formats it is NOT reinterpreted.
function gltfMaterialToPbr(
  doc: Readonly<GltfDocument>,
  imageResources: readonly (ImageResourceReference | null)[],
  material: Readonly<GltfMaterial>,
  gltfDrops: Map<string, GltfDropTally> | null,
): Material {
  const pbr = material.pbrMetallicRoughness ?? {};
  const result = createStandardPbrMaterial({
    baseColor: packGltfLinearColor(pbr.baseColorFactor ?? [1, 1, 1, 1], 4),
    baseColorMap: resolveGltfTexture(doc, imageResources, pbr.baseColorTexture, 'srgb', gltfDrops),
    emissive: packGltfLinearColor(material.emissiveFactor ?? [0, 0, 0], 3),
    emissiveMap: resolveGltfTexture(doc, imageResources, material.emissiveTexture, 'srgb', gltfDrops),
    metallic: pbr.metallicFactor ?? 1,
    metallicRoughnessMap: resolveGltfTexture(doc, imageResources, pbr.metallicRoughnessTexture, 'linear', gltfDrops),
    normalMap: resolveGltfTexture(doc, imageResources, material.normalTexture, 'linear', gltfDrops),
    normalScale: material.normalTexture?.scale ?? 1,
    occlusionMap: resolveGltfTexture(doc, imageResources, material.occlusionTexture, 'linear', gltfDrops),
    occlusionStrength: material.occlusionTexture?.strength ?? 1,
    roughness: pbr.roughnessFactor ?? 1,
  });
  result.alphaMode = material.alphaMode === 'MASK' ? 'mask' : material.alphaMode === 'BLEND' ? 'blend' : 'opaque';
  result.alphaCutoff = material.alphaCutoff ?? 0.5;
  result.doubleSided = material.doubleSided ?? false;
  result.name = material.name ?? null;
  return result as unknown as Material;
}

// Resolves a glTF material texture reference to a Flight Texture carrying an Unresolved resource ref
// plus its sampled state: a `data:` URI or bufferView-embedded image becomes an Embedded ref (bytes in
// hand), an external URI becomes an External ref against `options.basePath`. The referenced glTF
// `sampler` (wrap/filter) maps onto the Texture's Sampler + wrap; `colorSpace` selects the GPU
// sample-time decode (sRGB for color maps, linear for data maps); a KHR_texture_transform on the
// textureInfo sets the Texture's uvOffset/uvRotation/uvScale. Returns null when the reference or its
// image cannot be resolved.
function resolveGltfTexture(
  doc: Readonly<GltfDocument>,
  imageResources: readonly (ImageResourceReference | null)[],
  info: Readonly<GltfTextureInfo> | undefined,
  colorSpace: TextureColorSpace,
  gltfDrops: Map<string, GltfDropTally> | null,
): Texture | null {
  if (info === undefined) return null; // the material simply has no texture in this slot — spec-valid, silent
  const texture = doc.textures?.[info.index];
  // KHR_texture_basisu points the texture at a KTX2/Basis image instead, and makes the plain `source` an
  // optional fallback — so a basisu texture often has none, and reading only `source` would drop the map
  // entirely. Resolving the reference is the parser's whole share of that extension: the transcode
  // happens later, when an explicit resource pass decodes the payload by mime type.
  const source = texture?.extensions?.KHR_texture_basisu?.source ?? texture?.source;
  if (source === undefined) {
    // The textureInfo points at a missing texture, or a texture with no image source — the material keeps
    // its factor and renders without the map (degraded but usable) → Recover.
    tallyGltfDrop(gltfDrops, ImportDiagnosticSeverity.Recover, 'gltf.texture-source-missing', '', {
      firstTexture: info.index,
    });
    return null;
  }
  const resource = imageResources[source];
  if (resource == null) {
    // The referenced image failed to build (already tallied as an image Drop); the material loses this map
    // but survives → Recover.
    tallyGltfDrop(gltfDrops, ImportDiagnosticSeverity.Recover, 'gltf.texture-image-unresolved', '', {
      firstImage: source,
    });
    return null;
  }
  const result = createTexture({ resource });

  // The UV set this map asks for. Geometry import carries TEXCOORD_0 only, so any other set is not
  // there to sample and the map silently reads set 0 — the right texels from the wrong coordinates,
  // which renders as a plausible but wrong image rather than a visible failure. Report it rather than
  // let it pass: importing the higher sets is a separate (cross-package) step, but a caller is
  // entitled to know the file asked for something this parser did not deliver. KHR_texture_transform
  // may override the set, so it is the one that decides.
  const requestedUvSet = info.extensions?.KHR_texture_transform?.texCoord ?? info.texCoord ?? 0;
  if (requestedUvSet !== 0) {
    tallyGltfDrop(gltfDrops, ImportDiagnosticSeverity.Recover, 'gltf.texcoord-set-unsupported', '', {
      firstTexture: info.index,
      firstUvSet: requestedUvSet,
    });
  }

  result.colorSpace = colorSpace;
  applyGltfSampler(result, texture?.sampler !== undefined ? doc.samplers?.[texture.sampler] : undefined);
  applyGltfTextureTransform(result, info.extensions?.KHR_texture_transform);
  return result;
}

// Maps a glTF sampler's GL wrap/filter enums onto the Texture's Sampler and wrap fields. Absent
// samplers/fields take the Flight sampler defaults (createTexture already supplied them). Mip-aware
// glTF min filters imply a generated mip chain (Sampler.mipmaps = true); the non-mip nearest/linear
// filters imply none. Anisotropy is not a glTF concept, so it stays at the default.
function applyGltfSampler(texture: Texture, sampler: Readonly<GltfSampler> | undefined): void {
  if (sampler === undefined) return;
  if (sampler.wrapS !== undefined) texture.sampler.wrapU = GLTF_TEXTURE_WRAP[sampler.wrapS];
  if (sampler.wrapT !== undefined) texture.sampler.wrapV = GLTF_TEXTURE_WRAP[sampler.wrapT];
  if (sampler.magFilter !== undefined) texture.sampler.magFilter = GLTF_TEXTURE_FILTER[sampler.magFilter];
  if (sampler.minFilter !== undefined) {
    texture.sampler.minFilter = GLTF_TEXTURE_FILTER[sampler.minFilter];
    texture.sampler.mipmaps = GLTF_MIN_FILTER_MIPMAPS[sampler.minFilter];
  }
}

// Applies a KHR_texture_transform block to the Texture's KHR_texture_transform fields (the identity is
// already in place from createTexture). offset → uvOffset, rotation (radians) → uvRotation, scale →
// uvScale. Absent sub-fields take the extension's spec defaults ([0,0] / 0 / [1,1]).
function applyGltfTextureTransform(
  texture: Texture,
  transform: NonNullable<GltfTextureInfo['extensions']>['KHR_texture_transform'] | undefined,
): void {
  if (transform === undefined) return;
  texture.uvOffset.x = transform.offset?.[0] ?? 0;
  texture.uvOffset.y = transform.offset?.[1] ?? 0;
  texture.uvRotation = transform.rotation ?? 0;
  texture.uvScale.x = transform.scale?.[0] ?? 1;
  texture.uvScale.y = transform.scale?.[1] ?? 1;
}

// Builds one shared resource reference from a glTF image: a `data:` URI decodes its base64 payload to an Embedded ref
// (MIME from the URI header, the declared `mimeType`, or sniffed from the bytes); an external URI
// becomes an External ref against `options.basePath`; a bufferView slices the encoded bytes out of its
// buffer as an Embedded ref.
function buildGltfImageResourceReference(
  doc: Readonly<GltfDocument>,
  buffers: readonly Uint8Array[],
  image: Readonly<GltfImage>,
  options: Readonly<GltfImportOptions> | undefined,
  imageIndex: number,
  gltfDrops: Map<string, GltfDropTally> | null,
): ImageResourceReference | null {
  if (image.uri !== undefined) {
    if (image.uri.startsWith('data:')) {
      const comma = image.uri.indexOf(',');
      if (comma < 0) {
        // A data: URI with no comma has no decodable payload — the image is omitted from the resource set.
        tallyGltfDrop(gltfDrops, ImportDiagnosticSeverity.Drop, 'gltf.image-malformed-uri', '', {
          firstImage: imageIndex,
        });
        return null;
      }
      const semicolon = image.uri.indexOf(';');
      const declared = semicolon > 5 ? image.uri.slice(5, semicolon) : (image.mimeType ?? null);
      const bytes = decodeBase64(image.uri.slice(comma + 1));
      return createEmbeddedImageResourceReference(bytes, declared ?? detectImageMimeType(bytes));
    }
    return createExternalImageResourceReference(image.uri, options?.basePath ?? null);
  }
  if (image.bufferView !== undefined) {
    const bufferView = doc.bufferViews?.[image.bufferView];
    const buffer = bufferView !== undefined ? buffers[bufferView.buffer] : undefined;
    if (bufferView === undefined || buffer === undefined) {
      // The image's bufferView (or its backing buffer) is out of range — the image is omitted.
      tallyGltfDrop(gltfDrops, ImportDiagnosticSeverity.Drop, 'gltf.image-bufferview-out-of-range', '', {
        firstBufferView: image.bufferView,
        firstImage: imageIndex,
      });
      return null;
    }
    // `Uint8Array.slice` is bounds-safe at the upper end but not the lower: a negative start counts back
    // from the END of the buffer, so an out-of-spec byteOffset would hand the decoder unrelated tail bytes
    // instead of the declared window, with no signal. The window is validated in both directions first —
    // the same nonnegative-integer rule the accessor reads apply, here against the buffer the slice indexes.
    const start = bufferView.byteOffset ?? 0;
    if (!isGltfByteCount(start) || !isGltfByteCount(bufferView.byteLength)) {
      tallyGltfDrop(gltfDrops, ImportDiagnosticSeverity.Drop, 'gltf.image-bufferview-out-of-range', '', {
        firstBufferView: image.bufferView,
        firstImage: imageIndex,
      });
      return null;
    }
    const bytes = buffer.slice(start, start + bufferView.byteLength);
    return createEmbeddedImageResourceReference(bytes, image.mimeType ?? detectImageMimeType(bytes));
  }
  // A glTF image must carry a uri or a bufferView; one with neither cannot be resolved and is omitted.
  tallyGltfDrop(gltfDrops, ImportDiagnosticSeverity.Drop, 'gltf.image-no-source', '', { firstImage: imageIndex });
  return null;
}

// Packs the first `channels` of a glTF LINEAR-space color factor (each in [0,1]) into a 0xRRGGBBAA
// integer, sRGB-encoding the RGB channels so scene-gl's unpackColorToLinear gamma-decode recovers the
// authored linear value (packLinearToColor is the documented inverse of that decode). With 3 channels
// alpha is forced opaque; with 4 the 4th is the (linear coverage) alpha, passed through unencoded.
function packGltfLinearColor(factor: readonly number[], channels: number): number {
  const a = channels === 4 ? (factor[3] ?? 0) : 1;
  return packLinearToColor([factor[0] ?? 0, factor[1] ?? 0, factor[2] ?? 0, a]);
}

// Decodes a buffer into bytes. A `data:` URI base64-decodes; a buffer with no `uri` is backed by the
// GLB binary chunk when present. An external (`.bin`) URI is served from `options.externalBuffers`
// (the caller fetched it, since parse is synchronous), keyed by the exact `uri` string. A URI missing
// from that map, or a uri-less buffer with no binary chunk, decodes to empty with a warning.
function decodeGltfBuffer(
  buffer: Readonly<GltfBuffer>,
  binary: Readonly<Uint8Array> | null,
  options: Readonly<GltfImportOptions> | undefined,
  gltfDrops: Map<string, GltfDropTally> | null,
): Uint8Array {
  const uri = buffer.uri;
  if (uri === undefined) {
    if (binary !== null) return binary as Uint8Array;
    tallyGltfDrop(gltfDrops, ImportDiagnosticSeverity.Recover, 'gltf.buffer-empty', 'no-uri', {
      reason: 'no-uri-no-binary',
    });
    return new Uint8Array(0);
  }
  const comma = uri.indexOf(',');
  if (uri.startsWith('data:') && comma >= 0) {
    return decodeBase64(uri.slice(comma + 1));
  }
  const supplied = options?.externalBuffers?.[uri];
  if (supplied !== undefined) return Uint8Array.from(supplied);
  tallyGltfDrop(gltfDrops, ImportDiagnosticSeverity.Recover, 'gltf.buffer-empty', 'external-missing', {
    firstUri: uri,
    reason: 'external-not-supplied',
  });
  return new Uint8Array(0);
}

// Portable base64 decode that works in Node.js (Vitest) and browsers alike, avoiding the
// browser-only atob() global.
function decodeBase64(s: string): Uint8Array {
  const table = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const stripped = s.replace(/[^A-Za-z0-9+/]/g, '');
  const out: number[] = [];
  for (let i = 0; i < stripped.length; i += 4) {
    // A trailing quantum shorter than 4 chars encodes 1 or 2 bytes; the absent sextets contribute
    // zero to the value and their bytes are not emitted. (`indexOf` must not feed -1 into the bit
    // math, or it poisons the high byte — the reason padding is stripped and length-checked here.)
    const c0 = table.indexOf(stripped[i]);
    const c1 = table.indexOf(stripped[i + 1]);
    const c2 = i + 2 < stripped.length ? table.indexOf(stripped[i + 2]) : -1;
    const c3 = i + 3 < stripped.length ? table.indexOf(stripped[i + 3]) : -1;
    const n = (c0 << 18) | (c1 << 12) | ((c2 < 0 ? 0 : c2) << 6) | (c3 < 0 ? 0 : c3);
    out.push((n >> 16) & 0xff);
    if (c2 >= 0) out.push((n >> 8) & 0xff);
    if (c3 >= 0) out.push(n & 0xff);
  }
  return new Uint8Array(out);
}

function isSupportedGltfVersion(version: string): boolean {
  return Number.parseInt(version, 10) === 2;
}

// Names only the extensions the core parser actually consumes today. This prevents required-extension
// diagnostics from contradicting visible behavior while the open handler registry remains a separate
// depth step; adding a schema field alone must not count as support.
function isSupportedGltfExtension(extension: string, handlers: readonly GltfExtensionHandler[] | undefined): boolean {
  // Draco is supported exactly when a decoder is registered — the only extension whose support is a
  // RUNTIME fact rather than a property of this parser. Reporting it unsupported until a caller plugs one
  // in is the honest answer, and reporting it supported afterwards is equally honest.
  if (extension === 'KHR_draco_mesh_compression') return hasGltfDracoDecoder();
  return CORE_GLTF_EXTENSIONS.has(extension) || handlers?.some((handler) => handler.kind === extension) === true;
}

// Extensions the CORE parser satisfies with no handler, so a file requiring one is not reported
// unsupported. KHR_mesh_quantization needs no code at all: it only widens which component types an
// accessor may use for POSITION/NORMAL/TANGENT/TEXCOORD, and the accessor reader already reads every
// integer width and applies the spec normalization exactly when `normalized` is set — a non-normalized
// quantized position passes through raw, which is correct, because its scale rides the node transform.
const CORE_GLTF_EXTENSIONS = new Set(['KHR_mesh_quantization', 'KHR_texture_transform']);

// Normalizes a raw integer component to its float range per the glTF spec: unsigned types map onto
// [0, 1] by dividing by their max; signed types map onto [-1, 1] via max(c / MAX, -1). Float
// components pass through unchanged.
function normalizeComponent(componentType: GltfComponentType, value: number): number {
  switch (componentType) {
    case 5120:
      return Math.max(value / 127, -1);
    case 5121:
      return value / 255;
    case 5122:
      return Math.max(value / 32767, -1);
    case 5123:
      return value / 65535;
    case 5125:
      return value / 4294967295;
    default:
      return value;
  }
}

function primitiveToGeometry(
  doc: Readonly<GltfDocument>,
  buffers: readonly Uint8Array[],
  primitive: Readonly<GltfPrimitive>,
  gltfDrops: Map<string, GltfDropTally> | null,
): MeshGeometry | null {
  // Position is mandatory in glTF; a primitive with no usable position data (the attribute absent, or its
  // accessor unreadable so it yields zero vertices) is an unusable empty shell — DROP it (return null so the
  // mesh is not emitted) rather than push an empty mesh node. Drop matches md5mesh.mesh-empty. The primitive
  // crumb is the honest classification; the subsuming accessor fault is not emitted as a contradictory
  // Recover (a dropped primitive did not recover).
  // A Draco primitive's values live in the compressed payload, not in any bufferView, so it is decoded
  // ONCE here and every attribute read below prefers the decoded array. Null means either that the
  // primitive is not compressed or that no decoder is registered — resolveGltfDracoMesh reports the
  // latter, because a Draco primitive with no decoder would otherwise fail as a malformed accessor and
  // send the reader hunting for a broken file instead of a missing decoder.
  const draco = resolveGltfDracoMesh(doc, buffers, primitive, gltfDrops);

  const positionIndex = primitive.attributes.POSITION;
  if (positionIndex === undefined) {
    tallyGltfDrop(gltfDrops, ImportDiagnosticSeverity.Drop, 'gltf.primitive-no-position', '', {});
    return null;
  }
  const position = readGltfAttribute(draco, 'POSITION', doc, buffers, positionIndex, gltfDrops, 'VEC3');
  const vertexCount = position.count;
  if (vertexCount === 0) {
    tallyGltfDrop(gltfDrops, ImportDiagnosticSeverity.Drop, 'gltf.primitive-no-position', '', {
      firstAccessor: positionIndex,
    });
    return null;
  }

  // Optional attributes: a failed, type-mismatched, or count-mismatched accessor is treated as absent (its
  // vertex slots zero-fill with finite defaults) and Recover-crumbed — the mesh stays drawable, the usable
  // survivor a Recover requires. Each expected type is fixed by the vertex layout the loop below reads.
  const normal = readOptionalGltfAttribute(
    draco,
    'NORMAL',
    doc,
    buffers,
    primitive.attributes.NORMAL,
    vertexCount,
    'VEC3',
    gltfDrops,
  );
  const tangent = readOptionalGltfAttribute(
    draco,
    'TANGENT',
    doc,
    buffers,
    primitive.attributes.TANGENT,
    vertexCount,
    'VEC4',
    gltfDrops,
  );
  const uv = readOptionalGltfAttribute(
    draco,
    'TEXCOORD_0',
    doc,
    buffers,
    primitive.attributes.TEXCOORD_0,
    vertexCount,
    'VEC2',
    gltfDrops,
  );

  // A primitive is skinned when it carries both influence channels; it then emits the skinned layout
  // (joints0/weights0 past uv0). JOINTS_0 is unsigned-integer indices (not normalized); WEIGHTS_0 is
  // float or normalized-integer weights, renormalized per vertex so any quantization drift still sums 1.
  // A failed influence accessor drops just that channel (Recover), so the mesh falls back to unskinned.
  const joints = readOptionalGltfAttribute(
    draco,
    'JOINTS_0',
    doc,
    buffers,
    primitive.attributes.JOINTS_0,
    vertexCount,
    'VEC4',
    gltfDrops,
  );
  const weights = readOptionalGltfAttribute(
    draco,
    'WEIGHTS_0',
    doc,
    buffers,
    primitive.attributes.WEIGHTS_0,
    vertexCount,
    'VEC4',
    gltfDrops,
  );
  const skinned = joints !== null && weights !== null;

  const floatsPerVertex = skinned ? SKINNED_FLOATS_PER_VERTEX : CANONICAL_FLOATS_PER_VERTEX;
  const vertices = new Float32Array(vertexCount * floatsPerVertex);
  for (let v = 0; v < vertexCount; v++) {
    const o = v * floatsPerVertex;
    vertices[o] = position.data[v * 3];
    vertices[o + 1] = position.data[v * 3 + 1];
    vertices[o + 2] = position.data[v * 3 + 2];
    if (normal !== null) {
      vertices[o + 3] = normal.data[v * 3];
      vertices[o + 4] = normal.data[v * 3 + 1];
      vertices[o + 5] = normal.data[v * 3 + 2];
    }
    if (tangent !== null) {
      vertices[o + 6] = tangent.data[v * 4];
      vertices[o + 7] = tangent.data[v * 4 + 1];
      vertices[o + 8] = tangent.data[v * 4 + 2];
      vertices[o + 9] = tangent.data[v * 4 + 3];
    }
    if (uv !== null) {
      vertices[o + 10] = uv.data[v * 2];
      vertices[o + 11] = uv.data[v * 2 + 1];
    }
    if (skinned) {
      vertices[o + 12] = joints.data[v * 4];
      vertices[o + 13] = joints.data[v * 4 + 1];
      vertices[o + 14] = joints.data[v * 4 + 2];
      vertices[o + 15] = joints.data[v * 4 + 3];
      const w0 = weights.data[v * 4];
      const w1 = weights.data[v * 4 + 1];
      const w2 = weights.data[v * 4 + 2];
      const w3 = weights.data[v * 4 + 3];
      const sum = w0 + w1 + w2 + w3;
      const inv = sum > 0 ? 1 / sum : 0;
      vertices[o + 16] = w0 * inv;
      vertices[o + 17] = w1 * inv;
      vertices[o + 18] = w2 * inv;
      vertices[o + 19] = w3 * inv;
    }
  }

  // glTF index accessors are ubyte/ushort/uint; normalize to Uint32Array (createMeshGeometry promotes/
  // accepts 16- or 32-bit index buffers). The index buffer defines the primitive's topology; an unreadable
  // or empty one leaves the vertex storage order — which is not a sane triangle list — so no usable
  // primitive survives and the primitive is DROPPED (Drop, mandatory role) rather than kept undrawable.
  let sourceIndices: Uint32Array<ArrayBuffer> | undefined;
  if (draco?.indices != null) {
    // The compressed payload carries the connectivity too, so the indices accessor — which under this
    // extension has no bufferView either — is not consulted.
    sourceIndices = Uint32Array.from(draco.indices);
  } else if (primitive.indices !== undefined) {
    const indexResult = readAccessor(doc, buffers, primitive.indices, gltfDrops, 'SCALAR');
    if (indexResult.fault !== null) {
      reportGltfAccessorFault(gltfDrops, ImportDiagnosticSeverity.Drop, indexResult.fault);
      return null;
    }
    if (indexResult.count === 0) {
      tallyGltfDrop(gltfDrops, ImportDiagnosticSeverity.Drop, 'gltf.primitive-empty-indices', '', {
        firstAccessor: primitive.indices,
      });
      return null;
    }
    sourceIndices = Uint32Array.from(indexResult.data);
  }
  const primitiveElements = buildGltfPrimitiveElements(primitive.mode ?? 4, sourceIndices, vertexCount, gltfDrops);
  if (primitiveElements === null) return null; // unsupported primitive mode → drop (no drawable topology)
  const geometry = createMeshGeometry({
    indices: primitiveElements.indices,
    layout: skinned ? CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT : CANONICAL_LAYOUT,
    topology: primitiveElements.topology,
    vertices,
  });

  return completeGltfShadingAttributes(doc, primitive, geometry, normal !== null, tangent !== null, uv !== null);
}

// glTF requires a client to CALCULATE flat normals when a primitive omits NORMAL, and says it SHOULD
// calculate tangents when a normal texture is bound without TANGENT. Emitting the zero-filled slots
// instead leaves every lit material normalizing a zero vector — undefined shading, not a dim surface —
// and collapses the TBN basis a normal map is sampled through. Every other importer in this package
// already generates what its source omits (OBJ, AWD2, MD5, 3DS); glTF alone shipped the zeros.
function completeGltfShadingAttributes(
  doc: Readonly<GltfDocument>,
  primitive: Readonly<GltfPrimitive>,
  geometry: MeshGeometry,
  hasNormals: boolean,
  hasTangents: boolean,
  hasUvs: boolean,
): MeshGeometry {
  // Only a surface has a normal. A point or line primitive has no facing to compute and no material
  // that samples one, so fabricating a value there would be inventing data rather than deriving it.
  const topology = geometry.topology;
  if (topology !== 'triangle-list' && topology !== 'triangle-strip') return geometry;

  let out = geometry;
  if (!hasNormals) {
    // Flat shading needs each face to own its corners, so shared vertices are un-welded first —
    // otherwise the last triangle touching a vertex overwrites its neighbours' contributions and the
    // result is neither flat nor smooth. Re-indexed straight after: the expansion is what makes the
    // normals exact, but shipping the geometry non-indexed would change how every backend draws it,
    // and a de-indexed mesh does not draw at all on a WebGPU build without the non-indexed draw fix.
    // Sequential re-indexing keeps the drawn shape identical to what the expansion produced.
    //
    // A morph target's deltas are addressed by the ORIGINAL vertex indices, so expanding a morphed
    // primitive would silently misalign every blend shape. Those keep their vertex identity and take
    // the in-place result, where a vertex shared between faces carries the last face's normal — a real
    // facing rather than the zero vector, which is the defect being repaired.
    const morphed = (primitive.targets?.length ?? 0) > 0;
    if (!morphed) out = indexMeshGeometryVertices(expandMeshGeometryIndices(out));
    computeMeshGeometryFlatNormals(out, out);
  }

  // The tangent basis is only meaningful with a UV parameterization to derive it from, and only needed
  // when something samples tangent space. Both conditions are the spec's own.
  if (!hasTangents && hasUvs && readsGltfTangentSpace(doc, primitive)) {
    computeMeshGeometryTangents(out, out);
  }
  return out;
}

// True when something will read this primitive's tangent space, which is what makes a missing TANGENT
// attribute a defect rather than an absent optional.
//
// The predicate matches the CONSUMER, not the spec sentence about normal textures. glPbrPrelude builds
// its basis under `HAS_NORMAL_MAP || HAS_PBR_EXTENSIONS`, and the extension path reaches it too — an
// anisotropy material with no normal map still evaluates normalize(tangent), which on a zero tangent is
// undefined. Gating on the normal texture alone left exactly that case collapsed.
//
// Extension handlers are supplied by the caller and are not knowable here, so a material that DECLARES
// any extension is treated as a possible reader. That over-generates for an extension which ignores
// tangent space; the cost is import-time work producing a valid basis, against undefined shading for
// guessing the other way.
function readsGltfTangentSpace(doc: Readonly<GltfDocument>, primitive: Readonly<GltfPrimitive>): boolean {
  const materialIndex = primitive.material;
  if (materialIndex === undefined) return false;
  const material = doc.materials?.[materialIndex];
  if (material === undefined) return false;
  if (material.normalTexture !== undefined) return true;
  const extensions = material.extensions;
  return extensions !== undefined && Object.keys(extensions).length > 0;
}

// Maps a glTF primitive mode to its index buffer + topology, or null when the mode is unsupported — an
// unknown mode has no sane drawable interpretation (reinterpreting it as another topology would draw wrong
// geometry), so the caller drops the primitive rather than keep zero-element geometry labeled as recovered.
function buildGltfPrimitiveElements(
  mode: number,
  source: Uint32Array<ArrayBuffer> | undefined,
  vertexCount: number,
  gltfDrops: Map<string, GltfDropTally> | null,
): { indices: Uint32Array<ArrayBuffer> | undefined; topology: PrimitiveTopology } | null {
  switch (mode) {
    case 0:
      return { indices: source, topology: 'point-list' };
    case 1:
      return { indices: source, topology: 'line-list' };
    case 2:
      return { indices: buildGltfLineLoopIndices(source, vertexCount), topology: 'line-list' };
    case 3:
      return { indices: source, topology: 'line-strip' };
    case 4:
      return { indices: source, topology: 'triangle-list' };
    case 5:
      return { indices: source, topology: 'triangle-strip' };
    case 6:
      return { indices: buildGltfTriangleFanIndices(source, vertexCount), topology: 'triangle-list' };
    default:
      tallyGltfDrop(gltfDrops, ImportDiagnosticSeverity.Drop, 'gltf.primitive-unsupported-mode', '', {
        firstMode: mode,
      });
      return null;
  }
}

function buildGltfLineLoopIndices(
  source: Readonly<Uint32Array<ArrayBuffer>> | undefined,
  vertexCount: number,
): Uint32Array<ArrayBuffer> {
  const count = source?.length ?? vertexCount;
  if (count < 2) return new Uint32Array(0);
  const out = new Uint32Array(count * 2);
  for (let i = 0; i < count; i++) {
    out[i * 2] = source?.[i] ?? i;
    out[i * 2 + 1] = source?.[(i + 1) % count] ?? (i + 1) % count;
  }
  return out;
}

function buildGltfTriangleFanIndices(
  source: Readonly<Uint32Array<ArrayBuffer>> | undefined,
  vertexCount: number,
): Uint32Array<ArrayBuffer> {
  const count = source?.length ?? vertexCount;
  if (count < 3) return new Uint32Array(0);
  const out = new Uint32Array((count - 2) * 3);
  const first = source?.[0] ?? 0;
  for (let i = 1; i + 1 < count; i++) {
    const offset = (i - 1) * 3;
    out[offset] = first;
    out[offset + 1] = source?.[i] ?? i;
    out[offset + 2] = source?.[i + 1] ?? i + 1;
  }
  return out;
}

// Builds a MeshMorph from a primitive's `targets` (blend shapes), or null when the primitive carries
// none. Each target's POSITION delta accessor (always present) plus optional NORMAL/TANGENT delta
// accessors are read into de-interleaved Float32Array delta buffers aligned with the base vertices —
// the SoA shape blendMeshGeometryMorph consumes. glTF morph tangent deltas are VEC3 (the handedness
// `w` is not morphed), so the tangent delta is copied as 3 floats per vertex. `weights` seeds the live
// weight array from the mesh's default weights (spec: mesh.weights), zero-filled when absent; a
// `weights` animation channel overrides it at runtime.
//
// Target index is identity: the Nth target corresponds to mesh.weights[N] and to weight-animation output
// index N. So an invalid target is NOT dropped in isolation (that would renumber the survivors and shift
// every weight/animation correspondence); the WHOLE morph set is dropped instead, keeping indexing honest.
// A target is valid only when its POSITION delta reads cleanly with exactly `baseVertexCount` elements.
function buildGltfMorph(
  doc: Readonly<GltfDocument>,
  buffers: readonly Uint8Array[],
  primitive: Readonly<GltfPrimitive>,
  meshWeights: readonly number[] | undefined,
  baseVertexCount: number,
  gltfDrops: Map<string, GltfDropTally> | null,
): MeshMorph | null {
  const gltfTargets = primitive.targets;
  if (gltfTargets === undefined || gltfTargets.length === 0) return null;

  const targets: MorphTarget[] = [];
  for (let t = 0; t < gltfTargets.length; t++) {
    const target: Readonly<GltfMorphTarget> = gltfTargets[t];
    if (target.POSITION === undefined) {
      tallyGltfDrop(gltfDrops, ImportDiagnosticSeverity.Drop, 'gltf.morph-target-no-position', '', {
        firstTarget: t,
      });
      return null;
    }
    const positionResult = readAccessor(doc, buffers, target.POSITION, gltfDrops, 'VEC3');
    if (positionResult.fault !== null) {
      tallyGltfDrop(gltfDrops, ImportDiagnosticSeverity.Drop, 'gltf.morph-target-no-position', '', {
        firstTarget: t,
      });
      return null;
    }
    if (positionResult.count !== baseVertexCount) {
      // A delta shorter or longer than the base mesh would blend past the base vertices (NaN) or leave
      // vertices unmorphed — not a usable target, and it invalidates the index correspondence, so drop the
      // whole set (Drop) rather than keep a mismatched target.
      tallyGltfDrop(gltfDrops, ImportDiagnosticSeverity.Drop, 'gltf.morph-target-count-mismatch', '', {
        firstActual: positionResult.count,
        firstExpected: baseVertexCount,
        firstTarget: t,
      });
      return null;
    }
    const positionDeltas = Float32Array.from(positionResult.data);
    // glTF morph deltas are VEC3 for all three channels (the tangent handedness w is not morphed).
    const normal = readOptionalGltfAttribute(
      null,
      'NORMAL',
      doc,
      buffers,
      target.NORMAL,
      baseVertexCount,
      'VEC3',
      gltfDrops,
    );
    const tangent = readOptionalGltfAttribute(
      null,
      'TANGENT',
      doc,
      buffers,
      target.TANGENT,
      baseVertexCount,
      'VEC3',
      gltfDrops,
    );
    const normalDeltas = normal !== null ? Float32Array.from(normal.data) : null;
    const tangentDeltas = tangent !== null ? Float32Array.from(tangent.data) : null;
    targets.push({ normalDeltas, positionDeltas, tangentDeltas });
  }

  // Every target survived, so targets index-aligns 1:1 with gltfTargets and with mesh.weights.
  const weights = new Float32Array(targets.length);
  if (meshWeights !== undefined) {
    for (let i = 0; i < weights.length && i < meshWeights.length; i++) weights[i] = meshWeights[i];
  }
  return { targets, weights };
}

// A decoded accessor plus the fault that made it unreadable, if any. readAccessor never decides the
// severity of a fault — the meaning of an unreadable accessor depends on its call-site role (a failed
// POSITION drops the primitive; a failed optional normal degrades it). So it returns the fault kind and
// leaves severity + recovery to the caller (reportGltfAccessorFault). `fault` is null on success.
interface GltfAccessorResult {
  count: number;
  data: ArrayLike<number>;
  fault: GltfAccessorFault | null;
}

interface GltfAccessorFault {
  detail: Record<string, number>;
  kind: string;
}

// Emits an accessor fault at the severity its call-site role dictates: Drop where the fault leaves no
// usable survivor (mandatory POSITION/indices, an unsamplable animation channel), Recover where a
// non-empty, non-NaN, drawable element remains after substituting a sane default (optional attributes,
// identity inverse-bind matrices, an omitted morph delta).
function reportGltfAccessorFault(
  gltfDrops: Map<string, GltfDropTally> | null,
  severity: ImportDiagnosticSeverity,
  fault: Readonly<GltfAccessorFault>,
): void {
  tallyGltfDrop(gltfDrops, severity, fault.kind, '', fault.detail);
}

// Reads an optional vertex attribute (normal/tangent/uv/joints/weights). Returns null — the attribute is
// treated as absent, so the vertex loop zero-fills its slots with finite defaults — when the index is
// undefined, when the accessor faults (Recover-crumbed: the mesh stays drawable without it), or when its
// element count does not match the primitive's vertex count (a count mismatch would read past the shorter
// array into non-finite territory; also Recover-crumbed with the expected/actual counts). A present,
// correctly-sized attribute returns its decoded data.
// Decodes a primitive's KHR_draco_mesh_compression payload through the registered decoder, or returns
// null when the primitive is uncompressed or nothing is registered.
//
// The no-decoder case is reported HERE rather than being left to fail downstream: under this extension a
// primitive's accessors carry no bufferView, so without this the read would fault as
// `gltf.accessor-bufferview-not-found` — technically true and actively misleading, since the bufferView
// is not missing, the data is simply somewhere the reader cannot go. That is an asset fact the consumer
// can act on (register a decoder), which is why it is a crumb rather than a coverage-doc entry.
function resolveGltfDracoMesh(
  doc: Readonly<GltfDocument>,
  buffers: readonly Uint8Array[],
  primitive: Readonly<GltfPrimitive>,
  gltfDrops: Map<string, GltfDropTally> | null,
): GltfDracoMesh | null {
  const block = primitive.extensions?.KHR_draco_mesh_compression;
  if (block === undefined) return null;

  const decoder = getGltfDracoDecoder();
  if (decoder === null) {
    tallyGltfDrop(gltfDrops, ImportDiagnosticSeverity.Drop, 'gltf.draco-decoder-missing', '', {});
    return null;
  }

  const view = doc.bufferViews?.[block.bufferView];
  const bytes = view !== undefined ? buffers[view.buffer] : undefined;
  if (view === undefined || bytes === undefined) {
    tallyGltfDrop(gltfDrops, ImportDiagnosticSeverity.Drop, 'gltf.draco-payload-missing', '', {
      firstBufferView: block.bufferView,
    });
    return null;
  }

  const start = view.byteOffset ?? 0;
  const payload = bytes.subarray(start, start + view.byteLength);
  // A decoder is third-party code by design, so a throw from it is contained here: a broken payload
  // degrades to a dropped primitive rather than taking the whole import down.
  let decoded: GltfDracoMesh | null = null;
  try {
    decoded = decoder(payload, block.attributes);
  } catch {
    decoded = null;
  }
  if (decoded === null) {
    tallyGltfDrop(gltfDrops, ImportDiagnosticSeverity.Drop, 'gltf.draco-decode-failed', '', {
      firstBufferView: block.bufferView,
    });
  }
  return decoded;
}

// Reads one attribute, preferring the Draco-decoded array when the decoder supplied that semantic and
// falling back to the accessor otherwise. The accessor stays authoritative for COUNT even under Draco:
// the file declared it, so a decoder disagreeing is a fault the caller should see rather than a silent
// reinterpretation of the mesh.
function readGltfAttribute(
  draco: GltfDracoMesh | null,
  semantic: string,
  doc: Readonly<GltfDocument>,
  buffers: readonly Uint8Array[],
  index: number,
  gltfDrops: Map<string, GltfDropTally> | null,
  expectedType: string,
): GltfAccessorResult {
  const decoded = draco?.attributes[semantic];
  if (decoded !== undefined) {
    return { count: draco?.vertexCount ?? 0, data: decoded, fault: null };
  }
  return readAccessor(doc, buffers, index, gltfDrops, expectedType);
}

function readOptionalGltfAttribute(
  draco: GltfDracoMesh | null,
  semantic: string,
  doc: Readonly<GltfDocument>,
  buffers: readonly Uint8Array[],
  index: number | undefined,
  vertexCount: number,
  expectedType: string,
  gltfDrops: Map<string, GltfDropTally> | null,
): { data: ArrayLike<number> } | null {
  if (index === undefined) return null;
  const result = readGltfAttribute(draco, semantic, doc, buffers, index, gltfDrops, expectedType);
  if (result.fault !== null) {
    reportGltfAccessorFault(gltfDrops, ImportDiagnosticSeverity.Recover, result.fault);
    return null;
  }
  if (result.count !== vertexCount) {
    reportGltfAccessorFault(gltfDrops, ImportDiagnosticSeverity.Recover, {
      detail: { firstAccessor: index, firstActual: result.count, firstExpected: vertexCount },
      kind: 'gltf.accessor-count-mismatch',
    });
    return null;
  }
  return { data: result.data };
}

// Decodes a glTF accessor into a flat array, de-striding per `bufferView.byteStride` and decoding
// `normalized` integer attributes to their float ranges. Reads through a DataView (little-endian, as
// the spec mandates) so unaligned accessor/bufferView offsets are safe. Normalized accessors return a
// Float32Array; others return an array of the accessor's native component type (so uint32 index values
// stay exact).
function readAccessor(
  doc: Readonly<GltfDocument>,
  buffers: readonly Uint8Array[],
  accessorIndex: number,
  gltfDrops: Map<string, GltfDropTally> | null,
  expectedType?: string,
): GltfAccessorResult {
  const accessor = doc.accessors?.[accessorIndex];
  if (accessor === undefined) {
    return {
      count: 0,
      data: new Float32Array(0),
      fault: { detail: { firstAccessor: accessorIndex }, kind: 'gltf.accessor-not-found' },
    };
  }
  // Validate the element TYPE against the consumer's expectation before reading. Every consumer reads a
  // fixed component count (POSITION VEC3, indices SCALAR, rotation VEC4…); a wrong-width accessor (a VEC3
  // "rotation", say) would otherwise be silently reinterpreted, striding the read across tuple boundaries.
  // A mismatch is a fault the caller classifies by role (mandatory → Drop, optional → Recover-absent).
  if (expectedType !== undefined && accessor.type !== expectedType) {
    return {
      count: 0,
      data: new Float32Array(0),
      fault: { detail: { firstAccessor: accessorIndex }, kind: 'gltf.accessor-type-mismatch' },
    };
  }

  // Element width and element count decide the allocation, so both are proven before it. An unrecognized
  // `type` or `componentType` leaves the width undefined, which propagates as NaN through every later
  // bound test and makes each one pass; a fractional or negative `count` throws RangeError out of the
  // whole import at the typed-array allocation below.
  const componentCount = TYPE_COMPONENTS[accessor.type];
  const componentByteSize = COMPONENT_BYTE_SIZE[accessor.componentType];
  if (!isGltfByteCount(componentCount) || !isGltfByteCount(componentByteSize) || !isGltfByteCount(accessor.count)) {
    return {
      count: 0,
      data: new Float32Array(0),
      fault: { detail: { firstAccessor: accessorIndex }, kind: 'gltf.accessor-invalid-read' },
    };
  }
  const normalize = accessor.normalized === true && accessor.componentType !== 5126;
  const total = accessor.count * componentCount;
  const out = normalize ? new Float32Array(total) : createComponentArray(accessor.componentType, total);

  // Base values from the accessor's bufferView. A sparse accessor may omit the bufferView entirely, in
  // which case the base is a valid zero-fill that `sparse` then overrides at specific indices.
  const bufferViewIndex = accessor.bufferView ?? -1;
  const view = bufferViewIndex >= 0 ? doc.bufferViews?.[bufferViewIndex] : undefined;
  if (view !== undefined) {
    const bytes = buffers[view.buffer];
    if (bytes === undefined) {
      return {
        count: 0,
        data: new Float32Array(0),
        fault: {
          detail: { firstAccessor: accessorIndex, firstBuffer: view.buffer },
          kind: 'gltf.accessor-buffer-not-found',
        },
      };
    }
    const elementByteSize = componentCount * componentByteSize;
    // An absent byteStride means tightly packed, and a declared 0 is an out-of-spec but common exporter
    // shorthand for the same thing. Any other declared value is honored verbatim — including one narrower
    // than an element, which resolveGltfReadOffset rejects rather than silently retightening.
    const stride = view.byteStride === undefined || view.byteStride === 0 ? elementByteSize : view.byteStride;
    const baseOffset = resolveGltfReadOffset(
      bytes,
      view,
      accessor.byteOffset ?? 0,
      elementByteSize,
      stride,
      accessor.count,
    );
    if (baseOffset < 0) {
      return {
        count: 0,
        data: new Float32Array(0),
        fault: { detail: { firstAccessor: accessorIndex }, kind: 'gltf.accessor-invalid-read' },
      };
    }
    const dataView = new DataView(bytes.buffer);
    for (let i = 0; i < accessor.count; i++) {
      const elementOffset = baseOffset + i * stride;
      for (let c = 0; c < componentCount; c++) {
        const raw = readComponent(dataView, accessor.componentType, elementOffset + c * componentByteSize);
        out[i * componentCount + c] = normalize ? normalizeComponent(accessor.componentType, raw) : raw;
      }
    }
  } else if (accessor.sparse === undefined) {
    return {
      count: 0,
      data: new Float32Array(0),
      fault: {
        detail: { firstAccessor: accessorIndex, firstBufferView: bufferViewIndex },
        kind: 'gltf.accessor-bufferview-not-found',
      },
    };
  }

  if (accessor.sparse !== undefined) {
    applyAccessorSparse(
      doc,
      buffers,
      accessor.sparse,
      accessor.count,
      accessor.componentType,
      componentCount,
      normalize,
      out,
      gltfDrops,
    );
  }

  return { count: accessor.count, data: out, fault: null };
}

// Applies an accessor's sparse override in place: reads `sparse.count` element indices and the matching
// replacement elements, writing each element (componentCount values) over the base `out` array. Indices
// and values are tightly packed in their own bufferViews (no byteStride, per the spec).
function applyAccessorSparse(
  doc: Readonly<GltfDocument>,
  buffers: readonly Uint8Array[],
  sparse: NonNullable<GltfAccessor['sparse']>,
  accessorCount: number,
  valueComponentType: GltfComponentType,
  componentCount: number,
  normalize: boolean,
  out: { [index: number]: number },
  gltfDrops: Map<string, GltfDropTally> | null,
): void {
  const indicesView = doc.bufferViews?.[sparse.indices.bufferView];
  const valuesView = doc.bufferViews?.[sparse.values.bufferView];
  if (indicesView === undefined || valuesView === undefined) {
    tallyGltfDrop(gltfDrops, ImportDiagnosticSeverity.Recover, 'gltf.sparse-bufferview-not-found', '', {});
    return;
  }
  const indexBytes = buffers[indicesView.buffer];
  const valueBytes = buffers[valuesView.buffer];
  if (indexBytes === undefined || valueBytes === undefined) {
    tallyGltfDrop(gltfDrops, ImportDiagnosticSeverity.Recover, 'gltf.sparse-buffer-not-found', '', {});
    return;
  }
  const indexView = new DataView(indexBytes.buffer);
  const valueView = new DataView(valueBytes.buffer);
  const indexSize = COMPONENT_BYTE_SIZE[sparse.indices.componentType];
  const valueSize = COMPONENT_BYTE_SIZE[valueComponentType];

  // Sparse index and value bufferViews are tightly packed by spec — byteStride must not be declared on
  // them — so a declared stride means the file's real element layout is not the one this reads. Reject the
  // override rather than pull tight bytes out of a strided view.
  //
  // Both reads are then resolved through the same geometry guard the base read uses: each stays inside its
  // own declared window and its real buffer. The base accessor data is already valid, so a bad override is
  // skipped and the accessor survives with its base values — Recover.
  const indexBase =
    indicesView.byteStride === undefined
      ? resolveGltfReadOffset(
          indexBytes,
          indicesView,
          sparse.indices.byteOffset ?? 0,
          indexSize,
          indexSize,
          sparse.count,
        )
      : -1;
  const valueElementSize = componentCount * valueSize;
  const valueBase =
    valuesView.byteStride === undefined
      ? resolveGltfReadOffset(
          valueBytes,
          valuesView,
          sparse.values.byteOffset ?? 0,
          valueElementSize,
          valueElementSize,
          sparse.count,
        )
      : -1;
  if (indexBase < 0 || valueBase < 0) {
    tallyGltfDrop(gltfDrops, ImportDiagnosticSeverity.Recover, 'gltf.sparse-invalid-read', '', {
      firstCount: sparse.count,
    });
    return;
  }

  // Every sparse override replaces a base element, so its destination index must be within [0, accessorCount).
  // A typed-array write past the base length is SILENTLY ignored — the override would vanish with no signal —
  // so pre-scan the indices and, if any is out of range, skip the whole override and keep the base (Recover).
  for (let s = 0; s < sparse.count; s++) {
    const targetIndex = readComponent(indexView, sparse.indices.componentType, indexBase + s * indexSize);
    if (targetIndex < 0 || targetIndex >= accessorCount) {
      tallyGltfDrop(gltfDrops, ImportDiagnosticSeverity.Recover, 'gltf.sparse-index-out-of-range', '', {
        firstCount: accessorCount,
        firstIndex: targetIndex,
      });
      return;
    }
  }

  for (let s = 0; s < sparse.count; s++) {
    const targetIndex = readComponent(indexView, sparse.indices.componentType, indexBase + s * indexSize);
    for (let c = 0; c < componentCount; c++) {
      const raw = readComponent(valueView, valueComponentType, valueBase + (s * componentCount + c) * valueSize);
      out[targetIndex * componentCount + c] = normalize ? normalizeComponent(valueComponentType, raw) : raw;
    }
  }
}

// Reads one component at a byte offset, little-endian per the glTF spec.
// Every offset, length, stride, and count in a glTF accessor read is a byte quantity coming from untrusted
// JSON. The spec declares them nonnegative integers and the TypeScript view of the schema repeats that, but
// neither is checked at runtime — there is no JSON schema validator behind the parse — so nothing about the
// declaration constrains the actual value. A negative one walks the read backward out of its window; a
// fractional or NaN one is silently coerced by DataView's ToIndex, shifting every element by a partial
// stride or collapsing the read to offset 0. Both import real bytes from the wrong place.
function isGltfByteCount(value: number | undefined): boolean {
  return value !== undefined && Number.isInteger(value) && value >= 0;
}

// Resolves the absolute byte offset a strided read begins at, having first proven the read's geometry
// sound. Returns -1 when it is not; the caller classifies that by the read's role, as with any other
// accessor fault. Three independent properties have to hold, and each one alone is insufficient:
//
// - Every byte quantity is a nonnegative integer. This is what pins the read's LOWER bound: an upper-bound
//   test passes happily for a read that starts before its window and imports whatever bytes precede it.
// - `stride >= elementByteSize`. This is the width invariant: a narrower stride makes element N+1 re-read
//   the tail of element N, so a VEC3 over a 4-byte stride imports overlapping garbage while every bound
//   still holds.
// - The whole span ends inside the declared bufferView window AND the real backing buffer, whichever is
//   tighter. A declared window may overhang its buffer, so a read fitting only the declaration must fault.
function resolveGltfReadOffset(
  bytes: Readonly<Uint8Array>,
  view: Readonly<GltfBufferView>,
  byteOffset: number,
  elementByteSize: number,
  stride: number,
  count: number,
): number {
  const viewOffset = view.byteOffset ?? 0;
  if (!isGltfByteCount(viewOffset) || !isGltfByteCount(view.byteLength) || !isGltfByteCount(byteOffset)) return -1;
  if (!isGltfByteCount(count) || !isGltfByteCount(elementByteSize) || elementByteSize === 0) return -1;
  if (!isGltfByteCount(stride) || stride < elementByteSize) return -1;
  const start = bytes.byteOffset + viewOffset + byteOffset;
  const limit = Math.min(bytes.byteOffset + viewOffset + view.byteLength, bytes.byteOffset + bytes.byteLength);
  const end = count > 0 ? start + (count - 1) * stride + elementByteSize : start;
  if (end > limit) return -1;
  return start;
}

function readComponent(view: Readonly<DataView>, componentType: GltfComponentType, offset: number): number {
  switch (componentType) {
    case 5120:
      return view.getInt8(offset);
    case 5121:
      return view.getUint8(offset);
    case 5122:
      return view.getInt16(offset, true);
    case 5123:
      return view.getUint16(offset, true);
    case 5125:
      return view.getUint32(offset, true);
    default:
      return view.getFloat32(offset, true);
  }
}

// Walks a GLB container: validates the 12-byte header and returns the parsed JSON document plus the
// optional BIN chunk. Returns null (with a warning) on any malformed header or chunk.
function readGlbContainer(
  bytes: Readonly<Uint8Array>,
  diagnostics?: ImportDiagnostic[],
): { binary: Uint8Array | null; document: GltfDocument } | null {
  if (bytes.byteLength < GLB_HEADER_BYTES) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Reject, 'glb.header-too-small', 'readGlbContainer');
    return null;
  }
  const source = bytes as Uint8Array;
  const view = new DataView(source.buffer, source.byteOffset, source.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Reject, 'glb.wrong-magic', 'readGlbContainer');
    return null;
  }
  const version = view.getUint32(4, true);
  if (version !== 2) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Reject,
      'glb.unsupported-version',
      'readGlbContainer',
      {
        version,
      },
    );
    return null;
  }
  const declaredLength = view.getUint32(8, true);
  const end = Math.min(declaredLength, source.byteLength);

  let document: GltfDocument | null = null;
  let binary: Uint8Array | null = null;
  let offset = GLB_HEADER_BYTES;
  while (offset + GLB_CHUNK_HEADER_BYTES <= end) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    const dataStart = offset + GLB_CHUNK_HEADER_BYTES;
    if (dataStart + chunkLength > end) {
      // Recover, not Reject: this stops the chunk walk and keeps whatever chunks parsed before it. If a valid
      // JSON chunk was already read, the container is still usable and returned; if none was, the whole-input
      // refusal is the separate glb.no-json-chunk Reject below (which returns the null sentinel).
      reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Recover, 'glb.chunk-past-end', 'readGlbContainer');
      break;
    }
    const chunkData = source.subarray(dataStart, dataStart + chunkLength);
    if (chunkType === GLB_JSON_CHUNK && document === null) {
      const json = new TextDecoder().decode(chunkData);
      try {
        document = JSON.parse(json) as GltfDocument;
      } catch {
        reportImportDiagnostic(
          diagnostics,
          ImportDiagnosticSeverity.Reject,
          'glb.json-chunk-invalid',
          'readGlbContainer',
        );
        return null;
      }
    } else if (chunkType === GLB_BIN_CHUNK && binary === null) {
      binary = chunkData;
    }
    offset = dataStart + chunkLength;
  }

  if (document === null) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Reject, 'glb.no-json-chunk', 'readGlbContainer');
    return null;
  }
  return { binary, document };
}

function topLevelNodeIndices(nodes: readonly Readonly<GltfNode>[]): number[] {
  const referenced = new Set<number>();
  for (const node of nodes) {
    if (node.children !== undefined) for (const c of node.children) referenced.add(c);
  }
  const roots: number[] = [];
  for (let i = 0; i < nodes.length; i++) if (!referenced.has(i)) roots.push(i);
  return roots;
}

type ComponentArray = Float32Array | Int8Array | Int16Array | Uint8Array | Uint16Array | Uint32Array;

// Allocates a typed array matching the accessor's component type, so integer (e.g. uint32 index)
// values survive without a float round-trip.
function createComponentArray(componentType: GltfComponentType, length: number): ComponentArray {
  switch (componentType) {
    case 5120:
      return new Int8Array(length);
    case 5121:
      return new Uint8Array(length);
    case 5122:
      return new Int16Array(length);
    case 5123:
      return new Uint16Array(length);
    case 5125:
      return new Uint32Array(length);
    default:
      return new Float32Array(length);
  }
}

const COMPONENT_BYTE_SIZE: Record<GltfComponentType, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_COMPONENTS: Record<string, number> = { MAT2: 4, MAT3: 9, MAT4: 16, SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

// glTF TRS animation target paths → Flight Scene3DAnimationPath. The 'weights' (morph) path is handled
// separately by the caller (appendGltfWeightsChannels), because it binds to a mesh's weight array with a
// mesh-specific track width rather than a fixed-width transform component, so it is not in this map.
const GLTF_ANIMATION_PATHS: Record<string, Scene3DAnimationPath | undefined> = {
  rotation: Scene3DAnimationPathRotation,
  scale: Scene3DAnimationPathScale,
  translation: Scene3DAnimationPathTranslation,
};

// The required output-accessor element type per animated path (glTF spec). rotation is a VEC4 quaternion,
// translation/scale are VEC3, weights are SCALAR (target-width-scaled by element count). An output whose type
// disagrees would be silently reinterpreted at the wrong stride, so a mismatch faults the channel.
const GLTF_ANIMATION_OUTPUT_TYPES: Record<string, string | undefined> = {
  rotation: 'VEC4',
  scale: 'VEC3',
  translation: 'VEC3',
  weights: 'SCALAR',
};

// glTF sampler interpolation → Flight AnimationInterpolation (same three modes, same CUBICSPLINE
// in-tangent/value/out-tangent layout).
const GLTF_SAMPLER_INTERPOLATIONS: Record<string, AnimationInterpolation> = {
  CUBICSPLINE: 'Cubic',
  LINEAR: 'Linear',
  STEP: 'Step',
};

// glTF sampler min/mag filter GL enums → Flight TextureFilter. glTF's mip-aware min filters
// (LINEAR_MIPMAP_LINEAR etc.) map onto Flight's mip-aware filter names; the mag filter is always a
// non-mip mode (NEAREST/LINEAR).
const GLTF_TEXTURE_FILTER: Record<number, TextureFilter> = {
  9728: 'nearest',
  9729: 'linear',
  9984: 'nearest-mipmap-nearest',
  9985: 'linear-mipmap-nearest',
  9986: 'nearest-mipmap-linear',
  9987: 'linear-mipmap-linear',
};

// Whether a glTF min-filter GL enum implies a sampled mip chain — the four *_MIPMAP_* modes do, the
// plain NEAREST/LINEAR do not. Sets Sampler.mipmaps so a non-mip filter does not force mip generation.
const GLTF_MIN_FILTER_MIPMAPS: Record<number, boolean> = {
  9728: false,
  9729: false,
  9984: true,
  9985: true,
  9986: true,
  9987: true,
};

// glTF sampler wrap GL enums → Flight TextureWrap. REPEAT (10497), CLAMP_TO_EDGE (33071),
// MIRRORED_REPEAT (33648).
const GLTF_TEXTURE_WRAP: Record<number, TextureWrap> = {
  10497: 'repeat',
  33071: 'clamp-to-edge',
  33648: 'mirror-repeat',
};

// GLB container constants: the header magic (`glTF` little-endian), chunk-type tags (`JSON` and
// `BIN\0` little-endian), and the fixed header/chunk-header byte sizes.
const GLB_MAGIC = 0x46546c67;
const GLB_JSON_CHUNK = 0x4e4f534a;
const GLB_BIN_CHUNK = 0x004e4942;
const GLB_HEADER_BYTES = 12;
const GLB_CHUNK_HEADER_BYTES = 8;

// The canonical interleaved PBR vertex layout the mesh builders and scene-{gl,wgpu} renderers share,
// plus the skinned record's floats-per-vertex — the same constants every scene-formats importer emits.
import { getGltfDracoDecoder, hasGltfDracoDecoder } from './gltfDraco';
import { CANONICAL_FLOATS_PER_VERTEX, CANONICAL_LAYOUT, SKINNED_FLOATS_PER_VERTEX } from './shared';

// One accumulated glTF document-build drop: a total occurrence `count` plus the first offender's `detail`,
// keyed by kind + discriminator. No origin is stored — buildGltfDocument flushes (physically reports) every
// aggregated crumb, so it is their origin per the collector's emitting-function contract; `kind` carries the
// drop-site granularity. The pre-parse gates (parseGltfSource/readGlbContainer) report their whole-input
// Rejects directly and are not tallied.
interface GltfDropTally {
  count: number;
  detail: Record<string, boolean | number | string>;
  kind: string;
  severity: ImportDiagnosticSeverity;
}

// Records one offender against its (kind, discriminator) tally — the aggregate-once alternative to a
// per-node/per-primitive/per-accessor `reportImportDiagnostic` (readAccessor alone runs once per attribute
// per primitive). No-op (never allocates) when no collector is engaged. `firstDetail` is kept from the FIRST
// offender; later ones only bump the count. The discriminator is the categorical sub-reason (never an
// instance index/uri), so faults of the same kind across many elements collapse to one crumb.
function tallyGltfDrop(
  tallies: Map<string, GltfDropTally> | null,
  severity: ImportDiagnosticSeverity,
  kind: string,
  discriminator: string,
  firstDetail: Record<string, boolean | number | string>,
): void {
  if (tallies === null) return;
  const key = `${kind}|${discriminator}`;
  const existing = tallies.get(key);
  if (existing === undefined) tallies.set(key, { count: 1, detail: firstDetail, kind, severity });
  else existing.count++;
}
