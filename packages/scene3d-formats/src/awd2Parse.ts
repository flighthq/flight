import { createAnimationChannel, createAnimationClip, createAnimationTrack } from '@flighthq/animation/contract';
import { getDecompressor } from '@flighthq/compression/contract';
import {
  copyMatrix4,
  createMatrix4,
  createTransform3D,
  createVector3,
  decomposeMatrix4ToTransform3D,
  inverseMatrix4,
  multiplyMatrix4,
  normalizeVector3,
  setQuaternionFromUnitVectors,
} from '@flighthq/geometry/contract';
import { detectImageMimeType } from '@flighthq/image-codec/contract';
import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { createAmbientLight, createDirectionalLight, createPointLight } from '@flighthq/lighting/contract';
import { DEG_TO_RAD } from '@flighthq/math/contract';
import {
  CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT,
  computeMeshGeometryNormals,
  computeMeshGeometryTangents,
  createMeshGeometry,
} from '@flighthq/mesh/contract';
import { createScene3DFromDocument } from '@flighthq/scene3d/contract';
import { createShadedMaterial } from '@flighthq/shading/contract';
import type { Scene3D } from '@flighthq/types/contract';
import type { Decompressor } from '@flighthq/types/contract';
import { Compression } from '@flighthq/types/contract';
import type {
  AnimationClip,
  AnimationTrack,
  ImportDiagnostic,
  Light,
  Material,
  MaterialLike,
  Projection,
  Matrix4,
  Scene3DDocument,
  Scene3DDocumentAnimation,
  Scene3DDocumentAnimationChannel,
  Scene3DDocumentMesh,
  Scene3DDocumentNode,
  Scene3DDocumentSkin,
  Node3D,
  SurfaceMaterial,
  Texture,
  Transform3D,
  SkinInfluence,
} from '@flighthq/types/contract';
import {
  ImportDiagnosticSeverity,
  MeshKind,
  Scene3DAnimationPathRotation,
  Scene3DAnimationPathScale,
  Scene3DAnimationPathTranslation,
  Node3DKind,
} from '@flighthq/types/contract';

import {
  AWD2_BLOCK_CONTAINER,
  AWD2_BLOCK_HEADER_BYTES,
  AWD2_BLOCK_CAMERA,
  AWD2_BLOCK_LIGHT,
  AWD2_BLOCK_LIGHT_PICKER,
  AWD2_BLOCK_MATERIAL,
  AWD2_BLOCK_MESH_INSTANCE,
  AWD2_BLOCK_SKELETON,
  AWD2_BLOCK_SKELETON_ANIMATION,
  AWD2_BLOCK_SKELETON_POSE,
  AWD2_BLOCK_TEXTURE,
  AWD2_BLOCK_TRIANGLE_GEOMETRY,
  AWD2_COMPRESSION_DEFLATE,
  AWD2_COMPRESSION_LZMA,
  AWD2_COMPRESSION_NONE,
  AWD2_DATA_FLOAT32,
  AWD2_DATA_FLOAT64,
  AWD2_DATA_INT16,
  AWD2_DATA_INT32,
  AWD2_DATA_INT8,
  AWD2_DATA_UINT16,
  AWD2_DATA_UINT32,
  AWD2_DATA_UINT8,
  AWD2_FORMAT_VERSION,
  AWD2_HEADER_BYTES,
  AWD2_LIGHT_DEFAULT_AMBIENT,
  AWD2_LIGHT_DEFAULT_DIFFUSE,
  AWD2_LIGHT_DEFAULT_FALLOFF,
  AWD2_LIGHT_DEFAULT_RADIUS,
  AWD2_LIGHT_DEFAULT_RGB,
  AWD2_LIGHT_DEFAULT_SPECULAR,
  AWD2_LIGHT_PROP_AMBIENT,
  AWD2_LIGHT_PROP_AMBIENT_COLOR,
  AWD2_LIGHT_PROP_COLOR,
  AWD2_LIGHT_PROP_DIFFUSE,
  AWD2_LIGHT_PROP_DIRECTION_X,
  AWD2_LIGHT_PROP_DIRECTION_Y,
  AWD2_LIGHT_PROP_DIRECTION_Z,
  AWD2_LIGHT_PROP_FALLOFF,
  AWD2_LIGHT_PROP_RADIUS,
  AWD2_LIGHT_PROP_SHADOW_MAPPER,
  AWD2_LIGHT_PROP_SPECULAR,
  AWD2_CAMERA_PROJECTION_ORTHOGRAPHIC,
  AWD2_CAMERA_PROJECTION_ORTHOGRAPHIC_OFFCENTER,
  AWD2_CAMERA_PROJECTION_PERSPECTIVE,
  AWD2_CAMERA_PROP_FOV,
  AWD2_CAMERA_PROP_ORTHO_BOTTOM,
  AWD2_CAMERA_PROP_ORTHO_LEFT,
  AWD2_CAMERA_PROP_ORTHO_RIGHT,
  AWD2_CAMERA_PROP_ORTHO_TOP,
  AWD2_LIGHT_TYPE_DIRECTIONAL,
  AWD2_LIGHT_TYPE_POINT,
  AWD2_MAGIC_0,
  AWD2_MAGIC_1,
  AWD2_MAGIC_2,
  AWD2_MATERIAL_DEFAULT_GLOSS,
  AWD2_MATERIAL_DEFAULT_SPECULAR_RGB,
  AWD2_MATERIAL_DEFAULT_SPECULAR_STRENGTH,
  AWD2_MATERIAL_PROP_ALPHA,
  AWD2_MATERIAL_PROP_COLOR,
  AWD2_MATERIAL_PROP_DIFFUSE_TEXTURE,
  AWD2_MATERIAL_PROP_GLOSS,
  AWD2_MATERIAL_PROP_NORMAL_TEXTURE,
  AWD2_MATERIAL_PROP_SPECULAR_COLOR,
  AWD2_MATERIAL_PROP_SPECULAR_STRENGTH,
  AWD2_MATERIAL_PROP_SPECULAR_TEXTURE,
  AWD2_NAMESPACE_CORE,
  AWD2_STREAM_INDICES,
  AWD2_STREAM_JOINT_INDICES,
  AWD2_STREAM_JOINT_WEIGHTS,
  AWD2_STREAM_NORMALS,
  AWD2_STREAM_POSITIONS,
  AWD2_STREAM_TANGENTS,
  AWD2_STREAM_UVS,
  AWD2_TEXTURE_TYPE_EMBEDDED,
  AWD2_VERSION_MAJOR_OFFSET,
} from './awd2Schema';
import {
  CANONICAL_FLOATS_PER_VERTEX,
  CANONICAL_LAYOUT,
  convertTransformLhToRh,
  createEmbeddedTextureRef,
  createExternalTextureRef,
  negateVec3Z,
  packSkinInfluences,
  reverseTriangleWinding,
  reverseVertexTriangleWinding,
  SKINNED_FLOATS_PER_VERTEX,
} from './shared';

// Parses an Away3D AWD 2.x binary file into a Scene3D. Convenience over `createScene3DFromDocument(parseAwd2
// (bytes, diagnostics))`. See parseAwd2 for the import model.
export function createScene3DFromAwd2(bytes: Readonly<Uint8Array>, diagnostics?: ImportDiagnostic[]): Scene3D {
  return createScene3DFromDocument(parseAwd2(bytes, diagnostics));
}

// Parses an Away3D AWD 2.x binary file into a format-neutral Scene3DDocument. The 12-byte header (magic
// `AWD`, version, flags, compression, body length) is validated, then the block stream is walked to
// extract geometry blocks (type 1), container blocks (type 22), mesh-instance blocks (type 23), light
// blocks (type 41), light-picker blocks (type 51), material blocks (type 81), texture blocks (type 82),
// and the skeleton block (type 101). Mesh instances reference geometry and material blocks by block ID;
// materials reference texture blocks the same way.
//
// Each AWD light block fills the document's `lights` placement table, in the document's local-descriptor +
// `transform` convention (see Scene3DDocumentLight). One AWD light is a compound — a punctual term plus
// its own ambient term on the same entity — so it imports as a DirectionalLight or
// PointLight PLUS a sibling AmbientLight whenever the file gave it a non-zero ambient; see
// buildAwdDocumentLights. Light-picker blocks are read but never built from: Away3D scopes lights per
// MATERIAL through a picker, and Flight's light set is a scene-wide per-draw argument, so a file whose
// pickers do not all select every light records a Skip diagnostic and imports every light as scene-wide.
//
// The file's skeleton (if any) becomes a skeleton-group + joint node subtree in the document node table
// (`nodes`) plus one entry in `skins` (its `joints` are those joint node indices, its `inverseBind` the
// AWD joint matrices, which ARE the inverse bind pose); each skinned sub-mesh's document mesh names that
// skin by index. Containers become group nodes, mesh instances become mesh nodes (one geometry → one mesh
// node carrying the instance name; several geometries → a named group of anonymous per-subset mesh nodes),
// and parenting is expressed through `children` index lists with the unparented nodes as scene roots. Each
// AWD material becomes a ShadedMaterial in the document `materials` table — AWD's AwayJS MethodMaterial model
// (BlinnPhong base + method array) maps structurally onto ShadedMaterial (base + modifier stack); see the
// resolveAwdMaterial note for why the mapping is uniform. It carries the diffuse color+alpha and/or a
// diffuseMap/normalMap referencing an unresolved AWD texture ImageResourceReference — the parser references,
// it does not fetch or decode; the resolution is
// @flighthq/scene3d-resources's explicit pass. The file's skeleton animations become document `animations`
// whose channels bind by joint node index. Assemble into a live Scene3D with `createScene3DFromDocument`.
//
// A compressed body (Away3D's exporter default — deflate or LZMA) is inflated first when a decompressor
// has been registered for that algorithm in `@flighthq/compression`; with no codec registered
// the file records a diagnostic and returns an empty document. Malformed input records a diagnostic and returns empty rather
// than throwing.
export function parseAwd2(bytes: Readonly<Uint8Array>, diagnostics?: ImportDiagnostic[]): Scene3DDocument {
  const input = bytes as Uint8Array;
  if (input.byteLength < AWD2_HEADER_BYTES) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Reject, 'awd2.header-too-short', 'parseAwd2');
    return emptyAwdDocument();
  }

  if (input[0] !== AWD2_MAGIC_0 || input[1] !== AWD2_MAGIC_1 || input[2] !== AWD2_MAGIC_2) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Reject, 'awd2.bad-magic', 'parseAwd2');
    return emptyAwdDocument();
  }

  if (!isAwd2Version(input, diagnostics)) return emptyAwdDocument();

  // A compressed body is inflated (via a registered decompressor) and spliced back behind the header so
  // the block walk below is identical for compressed and uncompressed input; bails to empty when no codec
  // is registered for the file's compression method.
  const rehydrated = rehydrateAwdBody(input, diagnostics);
  if (rehydrated === null) return emptyAwdDocument();
  const source = rehydrated.source;
  const view = rehydrated.view;

  const bodyLength = view.getUint32(8, true);
  const bodyEnd = Math.min(AWD2_HEADER_BYTES + bodyLength, source.byteLength);

  const geometryBlocks = new Map<number, ParsedGeometry[]>();
  const containerBlocks = new Map<number, ParsedContainer>();
  const meshInstanceBlocks = new Map<number, ParsedMeshInstance>();
  const materialBlocks = new Map<number, ParsedMaterial>();
  const textureBlocks = new Map<number, ParsedTexture>();
  const skeletonBlocks = new Map<number, ParsedSkeleton>();
  const lightBlocks = new Map<number, ParsedLight>();
  const lightPickerBlocks = new Map<number, ParsedLightPicker>();

  // Blocks this walk does not consume, tallied by (namespace, blockType) so one diagnostic is reported per
  // distinct kind rather than one per occurrence — an unknown block type usually repeats for every object
  // in the file, and a per-block report would bury the rest of the diagnostics under thousands of lines.
  const cameraBlocks = new Map<number, ParsedCamera>();
  const unhandledBlocks = new Map<
    string,
    { blockType: number; count: number; firstBlockId: number; namespace: number }
  >();

  let offset = AWD2_HEADER_BYTES;
  while (offset + AWD2_BLOCK_HEADER_BYTES <= bodyEnd) {
    const blockId = view.getUint32(offset, true);
    const namespace = source[offset + 4];
    const blockType = source[offset + 5];
    const blockFlags = source[offset + 6];
    const blockLength = view.getUint32(offset + 7, true);
    const blockDataStart = offset + AWD2_BLOCK_HEADER_BYTES;

    if (blockDataStart + blockLength > bodyEnd) {
      // Drop: the `break` below abandons every remaining block, and nothing stands in for them — a file
      // with an inflated block length comes back with zero nodes. Data absent from the output, no
      // substitute, so not Recover; a document is still returned, so not Reject.
      reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Drop, 'awd2.block-length-past-end', 'parseAwd2');
      break;
    }

    const matrixWide = (blockFlags & 1) !== 0;
    const geometryWide = (blockFlags & 2) !== 0;

    if (namespace === AWD2_NAMESPACE_CORE) {
      if (blockType === AWD2_BLOCK_TRIANGLE_GEOMETRY) {
        const geoms = parseTriangleGeometryBlock(
          view,
          source,
          blockDataStart,
          blockDataStart + blockLength,
          geometryWide,
          diagnostics,
        );
        geometryBlocks.set(blockId, geoms);
      } else if (blockType === AWD2_BLOCK_CONTAINER) {
        const container = parseContainerBlock(
          view,
          source,
          blockDataStart,
          blockDataStart + blockLength,
          matrixWide,
          diagnostics,
        );
        if (container !== null) containerBlocks.set(blockId, container);
      } else if (blockType === AWD2_BLOCK_MESH_INSTANCE) {
        const meshInst = parseMeshInstanceBlock(
          view,
          source,
          blockDataStart,
          blockDataStart + blockLength,
          matrixWide,
          diagnostics,
        );
        if (meshInst !== null) meshInstanceBlocks.set(blockId, meshInst);
      } else if (blockType === AWD2_BLOCK_LIGHT) {
        const light = parseLightBlock(
          view,
          source,
          blockDataStart,
          blockDataStart + blockLength,
          matrixWide,
          diagnostics,
        );
        if (light !== null) lightBlocks.set(blockId, light);
      } else if (blockType === AWD2_BLOCK_CAMERA) {
        const camera = parseCameraBlock(
          view,
          source,
          blockDataStart,
          blockDataStart + blockLength,
          matrixWide,
          diagnostics,
        );
        if (camera !== null) cameraBlocks.set(blockId, camera);
      } else if (blockType === AWD2_BLOCK_LIGHT_PICKER) {
        const picker = parseLightPickerBlock(view, source, blockDataStart, blockDataStart + blockLength, diagnostics);
        if (picker !== null) lightPickerBlocks.set(blockId, picker);
      } else if (blockType === AWD2_BLOCK_MATERIAL) {
        const material = parseMaterialBlock(view, source, blockDataStart, blockDataStart + blockLength, diagnostics);
        if (material !== null) materialBlocks.set(blockId, material);
      } else if (blockType === AWD2_BLOCK_TEXTURE) {
        const texture = parseTextureBlock(view, source, blockDataStart, blockDataStart + blockLength, diagnostics);
        if (texture !== null) textureBlocks.set(blockId, texture);
      } else if (blockType === AWD2_BLOCK_SKELETON) {
        const skeleton = parseSkeletonBlock(
          view,
          source,
          blockDataStart,
          blockDataStart + blockLength,
          matrixWide,
          diagnostics,
        );
        if (skeleton !== null) skeletonBlocks.set(blockId, skeleton);
      } else if (!isAwdBlockHandledLater(blockType)) {
        // Everything the dispatch above does not name. Without this the block was skipped in total
        // silence — the offset advanced and the file looked fully imported — so a format feature nobody
        // has written yet was indistinguishable from a file that has none.
        tallyUnhandledAwdBlock(unhandledBlocks, namespace, blockType, blockId);
      }
    } else {
      // A non-CORE namespace is an extension block (an exporter's own, or a vendor's). Reported for the
      // same reason and separately from an unknown CORE type, because the two mean different things: an
      // unknown CORE type is a gap in our coverage of the spec, an extension namespace is content we were
      // never going to understand without knowing whose it is.
      tallyUnhandledAwdBlock(unhandledBlocks, namespace, blockType, blockId);
    }

    offset = blockDataStart + blockLength;
  }

  // One diagnostic per distinct unhandled (namespace, blockType), carrying the first block's id and how
  // many there were, so a reader learns both what was missed and how much of the file it accounted for.
  for (const entry of unhandledBlocks.values()) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Drop, 'awd2.block-unhandled', 'parseAwd2', {
      blockType: entry.blockType,
      count: entry.count,
      firstBlockId: entry.firstBlockId,
      namespace: entry.namespace,
    });
  }

  const document = emptyAwdDocument();
  // Maps an AWD block id to the document node index it produced (containers + mesh instances), so parenting
  // can rewire the flat node array by index the way the scene graph did by Node3D reference.
  const nodeIndexForBlock = new Map<number, number>();

  // Build the file's skeleton (if any) once as document nodes: a skeleton-group node + joint nodes with
  // their bind-pose local transforms, and one skin entry whose joints are those node indices. AWD binds a
  // mesh to a skeleton through an animator block Flight does not parse yet; with the common single-skeleton
  // file (the shambler) every skinned mesh is bound to that one skeleton.
  let skinIndex: number | undefined;
  let skeletonJointNodeIndices: number[] = [];
  if (skeletonBlocks.size > 0) {
    const built = buildAwdSkeletonDocument(skeletonBlocks.values().next().value!, document);
    skeletonJointNodeIndices = built.jointNodeIndices;
    skinIndex = document.skins.length;
    document.skins.push(built.skin);
    document.scenes[0].rootNodes.push(built.skeletonRootIndex);
    if (skeletonBlocks.size > 1) {
      reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Drop, 'awd2.multiple-skeletons', 'parseAwd2', {
        skeletons: skeletonBlocks.size,
      });
    }
  }

  for (const [blockId, container] of containerBlocks) {
    const nodeIndex = document.nodes.length;
    document.nodes.push({
      children: [],
      kind: Node3DKind,
      name: container.name || undefined,
      transform: awdTransformToTransform3D(container.transform),
    });
    nodeIndexForBlock.set(blockId, nodeIndex);
  }

  // One Flight Material per AWD material block, shared across every subset that references it (and thus one
  // Texture + one Image per shared texture). Keyed by AWD material block id → document material index.
  const resolvedMaterials = new Map<number, number>();
  const materialForSubset = (meshInst: ParsedMeshInstance, subsetIndex: number): number[] => {
    const materialId = subsetIndex < meshInst.materialIds.length ? meshInst.materialIds[subsetIndex] : 0;
    const index = resolveAwdMaterial(
      materialId,
      materialBlocks,
      textureBlocks,
      resolvedMaterials,
      document,
      diagnostics,
    );
    return index >= 0 ? [index] : [];
  };

  for (const [blockId, meshInst] of meshInstanceBlocks) {
    const geometries = geometryBlocks.get(meshInst.geometryId);
    const transform = awdTransformToTransform3D(meshInst.transform);
    let nodeIndex: number;
    if (geometries !== undefined && geometries.length > 0) {
      if (geometries.length === 1) {
        // The single mesh node carries the instance name directly; the multi-geometry branch instead names
        // the wrapping group (its subset meshes stay anonymous parts).
        const meshIndex = document.meshes.length;
        const mesh: Scene3DDocumentMesh = {
          geometry: geometries[0].geometry,
          materials: materialForSubset(meshInst, 0),
        };
        if (skinIndex !== undefined && geometries[0].skinned) mesh.skin = skinIndex;
        document.meshes.push(mesh);
        nodeIndex = document.nodes.length;
        document.nodes.push({
          children: [],
          kind: MeshKind,
          mesh: meshIndex,
          name: meshInst.name || undefined,
          transform,
        });
      } else {
        nodeIndex = document.nodes.length;
        const group: Scene3DDocumentNode = {
          children: [],
          kind: Node3DKind,
          name: meshInst.name || undefined,
          transform,
        };
        document.nodes.push(group);
        for (let i = 0; i < geometries.length; i++) {
          const meshIndex = document.meshes.length;
          const mesh: Scene3DDocumentMesh = {
            geometry: geometries[i].geometry,
            materials: materialForSubset(meshInst, i),
          };
          if (skinIndex !== undefined && geometries[i].skinned) mesh.skin = skinIndex;
          document.meshes.push(mesh);
          const childIndex = document.nodes.length;
          document.nodes.push({
            children: [],
            kind: MeshKind,
            mesh: meshIndex,
            transform: createTransform3D(),
          });
          group.children.push(childIndex);
        }
      }
    } else {
      nodeIndex = document.nodes.length;
      document.nodes.push({
        children: [],
        kind: Node3DKind,
        name: meshInst.name || undefined,
        transform,
      });
      if (meshInst.geometryId !== 0) {
        reportImportDiagnostic(
          diagnostics,
          ImportDiagnosticSeverity.Recover,
          'awd2.mesh-instance-missing-geometry',
          'parseAwd2',
          { block: blockId, geometry: meshInst.geometryId },
        );
      }
    }
    nodeIndexForBlock.set(blockId, nodeIndex);
  }

  const parented = new Set<number>();
  for (const [blockId, container] of containerBlocks) {
    if (container.parentId !== 0) {
      const parentIndex = nodeIndexForBlock.get(container.parentId);
      if (parentIndex !== undefined) {
        document.nodes[parentIndex].children.push(nodeIndexForBlock.get(blockId)!);
        parented.add(blockId);
      }
    }
  }
  for (const [blockId, meshInst] of meshInstanceBlocks) {
    if (meshInst.parentId !== 0) {
      const parentIndex = nodeIndexForBlock.get(meshInst.parentId);
      if (parentIndex !== undefined) {
        document.nodes[parentIndex].children.push(nodeIndexForBlock.get(blockId)!);
        parented.add(blockId);
      }
    }
  }

  for (const blockId of nodeIndexForBlock.keys()) {
    if (!parented.has(blockId)) document.scenes[0].rootNodes.push(nodeIndexForBlock.get(blockId)!);
  }

  // Lights are built after the node passes so a light parented to a container resolves to that container's
  // document node index. They fill the document's `lights` PLACEMENT TABLE, not the node graph — a light is
  // not a scene member in Flight, it is a per-draw argument the caller reads off the document.
  const lightDrops = new Map<string, AwdLightDropTally>();
  for (const light of lightBlocks.values()) {
    buildAwdDocumentLights(light, nodeIndexForBlock.get(light.parentId), document, lightDrops);
  }
  flushAwdLightDrops(lightDrops, diagnostics);

  // Cameras, like lights, fill a PLACEMENT TABLE rather than the node graph, and are built after the node
  // passes so a camera parented to a container resolves to that container's document node index.
  for (const camera of cameraBlocks.values()) {
    buildAwdDocumentCamera(camera, nodeIndexForBlock.get(camera.parentId), document, diagnostics);
  }

  for (const [blockId, picker] of lightPickerBlocks) {
    for (const lightId of picker.lightIds) {
      if (!lightBlocks.has(lightId)) {
        reportImportDiagnostic(
          diagnostics,
          ImportDiagnosticSeverity.Drop,
          'awd2.light-picker-missing-light',
          'parseAwd2',
          { block: blockId, light: lightId },
        );
      }
    }
  }
  if (isAwdLightScopeDropped(new Set(lightBlocks.keys()), lightPickerBlocks)) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Skip, 'awd2.light-scope-dropped', 'parseAwd2', {
      lights: lightBlocks.size,
      pickers: lightPickerBlocks.size,
    });
  }

  // The file's skeleton animations become document animations whose channels bind by joint node index. Uses
  // the same block-walk as the live parseAwd2SkeletonAnimations, but emits node-index-bound document channels.
  // Walks the rehydrated `source` (not the original `bytes`): a compressed file — Away3D's export default —
  // still has a deflated body in `bytes`, so re-walking that would find no blocks and silently drop every
  // animation. `source` is already inflated with the compression byte + body-length rewritten by rehydrate.
  if (skeletonJointNodeIndices.length > 0) {
    document.animations.push(...buildAwdDocumentAnimations(source, skeletonJointNodeIndices, diagnostics));
  }

  return document;
}

// Parses every named skeleton-animation block in an AWD file into a name→clip map. Each clip drives the
// given joint Node3Ds — the joints createScene3DFromAwd2 built and exposed as mesh.skin.skeleton.joints —
// so binding to those same nodes (rather than freshly-created ones) is what lets a clip deform the skinned
// mesh: animation, skeleton, and skin all reference one joint hierarchy. Mirrors parseMd5Anim(source,
// joints). A file may carry several named animations (idle/walk/attack); each is keyed by its block name
// (or `animation${i}` in file order when unnamed), so a caller selects one with `clips['walk']`. Returns
// an empty map when the header is invalid or no skeleton/animation blocks are found. The `joints` array
// must be in AWD skeleton order (index j = joint j); a length mismatch with the file's skeleton records a diagnostic.
export function parseAwd2SkeletonAnimations(
  bytes: Readonly<Uint8Array>,
  joints: readonly Node3D[],
  diagnostics?: ImportDiagnostic[],
): Record<string, AnimationClip> {
  const input = bytes as Uint8Array;
  if (input.byteLength < AWD2_HEADER_BYTES) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Reject,
      'awd2.header-too-short',
      'parseAwd2SkeletonAnimations',
    );
    return {};
  }

  if (input[0] !== AWD2_MAGIC_0 || input[1] !== AWD2_MAGIC_1 || input[2] !== AWD2_MAGIC_2) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Reject,
      'awd2.bad-magic',
      'parseAwd2SkeletonAnimations',
    );
    return {};
  }

  if (!isAwd2Version(input, diagnostics)) return {};

  // Inflate a compressed body and splice it back behind the header so the walk is identical to the
  // uncompressed path; bails to an empty result when no codec is registered for the compression method.
  const rehydrated = rehydrateAwdBody(input, diagnostics);
  if (rehydrated === null) return {};
  const source = rehydrated.source;
  const view = rehydrated.view;

  const bodyLength = view.getUint32(8, true);
  const bodyEnd = Math.min(AWD2_HEADER_BYTES + bodyLength, source.byteLength);

  const skeletonBlocks = new Map<number, ParsedSkeleton>();
  const poseBlocks = new Map<number, ParsedSkeletonPose>();
  const animationBlocks = new Map<number, ParsedSkeletonAnimation>();

  let offset = AWD2_HEADER_BYTES;
  while (offset + AWD2_BLOCK_HEADER_BYTES <= bodyEnd) {
    const blockId = view.getUint32(offset, true);
    const namespace = source[offset + 4];
    const blockType = source[offset + 5];
    const blockFlags = source[offset + 6];
    const blockLength = view.getUint32(offset + 7, true);
    const blockDataStart = offset + AWD2_BLOCK_HEADER_BYTES;

    if (blockDataStart + blockLength > bodyEnd) {
      // Drop, matching the same kind's other emit site: the `break` abandons the remaining blocks and
      // nothing stands in for them. Two sites, one kind, one severity — they were never distinguishable
      // to a caller reading the kind.
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Drop,
        'awd2.block-length-past-end',
        'parseAwd2SkeletonAnimations',
      );
      break;
    }

    const matrixWide = (blockFlags & 1) !== 0;

    if (namespace === AWD2_NAMESPACE_CORE) {
      if (blockType === AWD2_BLOCK_SKELETON) {
        const skeleton = parseSkeletonBlock(
          view,
          source,
          blockDataStart,
          blockDataStart + blockLength,
          matrixWide,
          diagnostics,
        );
        if (skeleton !== null) skeletonBlocks.set(blockId, skeleton);
      } else if (blockType === AWD2_BLOCK_SKELETON_POSE) {
        const pose = parseSkeletonPoseBlock(
          view,
          source,
          blockDataStart,
          blockDataStart + blockLength,
          matrixWide,
          diagnostics,
        );
        if (pose !== null) poseBlocks.set(blockId, pose);
      } else if (blockType === AWD2_BLOCK_SKELETON_ANIMATION) {
        const anim = parseSkeletonAnimationBlock(
          view,
          source,
          blockDataStart,
          blockDataStart + blockLength,
          diagnostics,
        );
        if (anim !== null) animationBlocks.set(blockId, anim);
      }
    }

    offset = blockDataStart + blockLength;
  }

  if (skeletonBlocks.size === 0) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Reject,
      'awd2.no-skeleton-blocks',
      'parseAwd2SkeletonAnimations',
    );
    return {};
  }
  if (animationBlocks.size === 0) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Reject,
      'awd2.no-skeleton-animation-blocks',
      'parseAwd2SkeletonAnimations',
    );
    return {};
  }

  const parsedSkeleton = skeletonBlocks.values().next().value!;
  if (joints.length < parsedSkeleton.joints.length) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Reject,
      'awd2.joint-count-mismatch',
      'parseAwd2SkeletonAnimations',
      {
        jointNodes: joints.length,
        skeletonJoints: parsedSkeleton.joints.length,
      },
    );
    return {};
  }

  // A file can carry several named animations (idle/walk/attack); build a clip for each and key it by the
  // block's name (falling back to file order when unnamed). All bind to the one shared joint hierarchy.
  const out: Record<string, AnimationClip> = {};
  let index = 0;
  for (const parsedAnimation of animationBlocks.values()) {
    const clip = buildAwdSkeletonAnimationClip(
      parsedAnimation,
      parsedSkeleton.joints.length,
      poseBlocks,
      joints,
      diagnostics,
    );
    if (clip !== null) out[parsedAnimation.name || `animation${index}`] = clip;
    index++;
  }
  return out;
}

// Builds one AnimationClip from a parsed AWD skeleton-animation block: samples each pose's per-joint local
// matrix into a translation + rotation track bound to the matching joint node. Null when it has no poses.
function buildAwdSkeletonAnimationClip(
  parsedAnimation: Readonly<ParsedSkeletonAnimation>,
  jointCount: number,
  poseBlocks: ReadonlyMap<number, ParsedSkeletonPose>,
  joints: readonly Node3D[],
  diagnostics?: ImportDiagnostic[],
): AnimationClip | null {
  const poseCount = parsedAnimation.poses.length;
  if (poseCount === 0) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Drop,
      'awd2.animation-no-poses',
      'buildAwdSkeletonAnimationClip',
    );
    return null;
  }

  const times: number[] = [];
  let timeAccumulator = 0;
  for (let p = 0; p < poseCount; p++) {
    times.push(timeAccumulator);
    timeAccumulator += parsedAnimation.poses[p].duration / 1000;
  }

  // Each AWD pose carries a full local joint matrix (rotation + translation). A skeletal animation is
  // driven mostly by joint rotation; emitting only translation leaves every joint at its bind-pose
  // orientation, which compounds down the chain into a wildly deformed mesh. So decompose each pose's
  // 3×3 into a quaternion and drive both the joint's rotation and translation.
  const poseMatrix = createMatrix4();
  const poseTransform = createTransform3D();
  const channels = [];
  // A pose block referenced by the animation can be missing; the same block is re-hit for every joint,
  // so collect the distinct offenders and report once. Only allocated when a collector is engaged.
  const missingPoseBlocks = diagnostics ? new Set<number>() : null;
  for (let j = 0; j < jointCount; j++) {
    const translationValues: number[] = [];
    const rotationValues: number[] = [];
    const scaleValues: number[] = [];
    let hasScale = false;
    for (let p = 0; p < poseCount; p++) {
      const poseBlockId = parsedAnimation.poses[p].poseBlockId;
      const pose = poseBlocks.get(poseBlockId);
      if (pose === undefined) {
        missingPoseBlocks?.add(poseBlockId);
        translationValues.push(0, 0, 0);
        rotationValues.push(0, 0, 0, 1);
        scaleValues.push(1, 1, 1);
      } else if (j < pose.jointTransforms.length && pose.jointTransforms[j] !== null) {
        const transform = pose.jointTransforms[j]!;
        translationValues.push(transform[9], transform[10], transform[11]);
        // Decompose the pose's 3×3 basis into rotation AND scale. A plain setQuaternionFromMatrix4 would
        // read a skewed quaternion off a scaled basis and drop the scale entirely; decompose normalizes
        // the basis first, so both come out correct. The lifted matrix's translation is unused here.
        awdTransformToMatrix4(poseMatrix, transform);
        decomposeMatrix4ToTransform3D(poseTransform, poseMatrix);
        rotationValues.push(
          poseTransform.rotation.x,
          poseTransform.rotation.y,
          poseTransform.rotation.z,
          poseTransform.rotation.w,
        );
        scaleValues.push(poseTransform.scale.x, poseTransform.scale.y, poseTransform.scale.z);
        if (hasNonUnitScale(poseTransform.scale.x, poseTransform.scale.y, poseTransform.scale.z)) hasScale = true;
      } else {
        translationValues.push(0, 0, 0);
        rotationValues.push(0, 0, 0, 1);
        scaleValues.push(1, 1, 1);
      }
    }

    const translationTrack = createAnimationTrack({
      components: 3,
      times,
      values: translationValues,
    });
    channels.push(
      createAnimationChannel(translationTrack, {
        node: joints[j],
        path: Scene3DAnimationPathTranslation,
      }),
    );

    const rotationTrack = createAnimationTrack({
      components: 4,
      quaternion: true,
      times,
      values: rotationValues,
    });
    channels.push(
      createAnimationChannel(rotationTrack, {
        node: joints[j],
        path: Scene3DAnimationPathRotation,
      }),
    );

    // Only emit a scale track when some pose actually scales the joint — AWD skeletons rarely do, and a
    // redundant unit-scale channel would bloat every clip.
    if (hasScale) {
      const scaleTrack = createAnimationTrack({
        components: 3,
        times,
        values: scaleValues,
      });
      channels.push(
        createAnimationChannel(scaleTrack, {
          node: joints[j],
          path: Scene3DAnimationPathScale,
        }),
      );
    }
  }

  if (missingPoseBlocks !== null && missingPoseBlocks.size > 0) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Recover,
      'awd2.pose-block-missing',
      'buildAwdSkeletonAnimationClip',
      {
        distinctPoseBlocks: missingPoseBlocks.size,
        firstPoseBlock: Math.min(...missingPoseBlocks),
      },
    );
  }
  return createAnimationClip(channels, timeAccumulator);
}

// Builds the document animation table from an AWD file's skeleton-animation blocks, binding each channel by
// the joint's document node index (in `jointNodeIndices`, AWD joint order). The block walk mirrors the live
// parseAwd2SkeletonAnimations; the difference is only the sink — document channels carry a node index + path
// + track rather than a live-node-bound AnimationChannel. Every named animation (idle/walk/attack) becomes
// one Scene3DDocumentAnimation keyed by its block name (or `animation${i}` in file order when unnamed). Returns
// an empty array when no skeleton/animation blocks are found. `bytes` must be the REHYDRATED body (compression
// byte NONE, inflated), not the raw file — this helper does not decompress, unlike parseAwd2SkeletonAnimations.
function buildAwdDocumentAnimations(
  bytes: Readonly<Uint8Array>,
  jointNodeIndices: readonly number[],
  diagnostics?: ImportDiagnostic[],
): Scene3DDocumentAnimation[] {
  const source = bytes as Uint8Array;
  const view = new DataView(source.buffer, source.byteOffset, source.byteLength);
  const bodyLength = view.getUint32(8, true);
  const bodyEnd = Math.min(AWD2_HEADER_BYTES + bodyLength, source.byteLength);

  const skeletonBlocks = new Map<number, ParsedSkeleton>();
  const poseBlocks = new Map<number, ParsedSkeletonPose>();
  const animationBlocks = new Map<number, ParsedSkeletonAnimation>();

  let offset = AWD2_HEADER_BYTES;
  while (offset + AWD2_BLOCK_HEADER_BYTES <= bodyEnd) {
    const namespace = source[offset + 4];
    const blockType = source[offset + 5];
    const blockFlags = source[offset + 6];
    const blockLength = view.getUint32(offset + 7, true);
    const blockDataStart = offset + AWD2_BLOCK_HEADER_BYTES;
    if (blockDataStart + blockLength > bodyEnd) break;
    const blockId = view.getUint32(offset, true);
    const matrixWide = (blockFlags & 1) !== 0;
    if (namespace === AWD2_NAMESPACE_CORE) {
      if (blockType === AWD2_BLOCK_SKELETON) {
        const skeleton = parseSkeletonBlock(view, source, blockDataStart, blockDataStart + blockLength, matrixWide);
        if (skeleton !== null) skeletonBlocks.set(blockId, skeleton);
      } else if (blockType === AWD2_BLOCK_SKELETON_POSE) {
        // Pose/animation blocks are NOT parsed by parseAwd2's first walk, so this document-path walk is
        // their only reporting site — thread the sink. The skeleton block above is deliberately left
        // sink-less: the first walk already parses (and reports) it, so threading here would double-report.
        const pose = parseSkeletonPoseBlock(
          view,
          source,
          blockDataStart,
          blockDataStart + blockLength,
          matrixWide,
          diagnostics,
        );
        if (pose !== null) poseBlocks.set(blockId, pose);
      } else if (blockType === AWD2_BLOCK_SKELETON_ANIMATION) {
        const anim = parseSkeletonAnimationBlock(
          view,
          source,
          blockDataStart,
          blockDataStart + blockLength,
          diagnostics,
        );
        if (anim !== null) animationBlocks.set(blockId, anim);
      }
    }
    offset = blockDataStart + blockLength;
  }

  if (skeletonBlocks.size === 0 || animationBlocks.size === 0) return [];
  const parsedSkeleton = skeletonBlocks.values().next().value!;
  const jointCount = parsedSkeleton.joints.length;

  const animations: Scene3DDocumentAnimation[] = [];
  let index = 0;
  for (const parsedAnimation of animationBlocks.values()) {
    const built = buildAwdDocumentAnimation(parsedAnimation, jointCount, poseBlocks, jointNodeIndices, diagnostics);
    if (built !== null) {
      built.name = parsedAnimation.name || `animation${index}`;
      animations.push(built);
    }
    index++;
  }
  return animations;
}

// Builds one Scene3DDocumentAnimation from a parsed AWD skeleton-animation block: samples each pose's per-joint
// local matrix into a translation + rotation track bound to the matching joint node INDEX. Null when it has
// no poses. Mirrors buildAwdSkeletonAnimationClip's per-joint sampling, emitting document channels.
function buildAwdDocumentAnimation(
  parsedAnimation: Readonly<ParsedSkeletonAnimation>,
  jointCount: number,
  poseBlocks: ReadonlyMap<number, ParsedSkeletonPose>,
  jointNodeIndices: readonly number[],
  diagnostics?: ImportDiagnostic[],
): Scene3DDocumentAnimation | null {
  const poseCount = parsedAnimation.poses.length;
  if (poseCount === 0) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Drop,
      'awd2.animation-no-poses',
      'buildAwdDocumentAnimation',
    );
    return null;
  }

  const times: number[] = [];
  let timeAccumulator = 0;
  for (let p = 0; p < poseCount; p++) {
    times.push(timeAccumulator);
    timeAccumulator += parsedAnimation.poses[p].duration / 1000;
  }

  const poseMatrix = createMatrix4();
  const poseTransform = createTransform3D();
  const channels: Scene3DDocumentAnimationChannel[] = [];
  // See buildAwdSkeletonAnimationClip: aggregate the distinct missing pose blocks, report once.
  const missingPoseBlocks = diagnostics ? new Set<number>() : null;
  for (let j = 0; j < jointCount; j++) {
    if (j >= jointNodeIndices.length) break;
    const translationValues: number[] = [];
    const rotationValues: number[] = [];
    const scaleValues: number[] = [];
    let hasScale = false;
    for (let p = 0; p < poseCount; p++) {
      const poseBlockId = parsedAnimation.poses[p].poseBlockId;
      const pose = poseBlocks.get(poseBlockId);
      if (pose === undefined) {
        missingPoseBlocks?.add(poseBlockId);
        translationValues.push(0, 0, 0);
        rotationValues.push(0, 0, 0, 1);
        scaleValues.push(1, 1, 1);
      } else if (j < pose.jointTransforms.length && pose.jointTransforms[j] !== null) {
        const transform = pose.jointTransforms[j]!;
        translationValues.push(transform[9], transform[10], transform[11]);
        // Decompose rotation + scale from the pose basis (see the live-clip path for why decompose,
        // not setQuaternionFromMatrix4 alone).
        awdTransformToMatrix4(poseMatrix, transform);
        decomposeMatrix4ToTransform3D(poseTransform, poseMatrix);
        rotationValues.push(
          poseTransform.rotation.x,
          poseTransform.rotation.y,
          poseTransform.rotation.z,
          poseTransform.rotation.w,
        );
        scaleValues.push(poseTransform.scale.x, poseTransform.scale.y, poseTransform.scale.z);
        if (hasNonUnitScale(poseTransform.scale.x, poseTransform.scale.y, poseTransform.scale.z)) hasScale = true;
      } else {
        translationValues.push(0, 0, 0);
        rotationValues.push(0, 0, 0, 1);
        scaleValues.push(1, 1, 1);
      }
    }

    const translationTrack: AnimationTrack = createAnimationTrack({
      components: 3,
      times,
      values: translationValues,
    });
    channels.push({
      node: jointNodeIndices[j],
      path: Scene3DAnimationPathTranslation,
      track: translationTrack,
    });

    const rotationTrack: AnimationTrack = createAnimationTrack({
      components: 4,
      quaternion: true,
      times,
      values: rotationValues,
    });
    channels.push({
      node: jointNodeIndices[j],
      path: Scene3DAnimationPathRotation,
      track: rotationTrack,
    });

    if (hasScale) {
      const scaleTrack: AnimationTrack = createAnimationTrack({
        components: 3,
        times,
        values: scaleValues,
      });
      channels.push({
        node: jointNodeIndices[j],
        path: Scene3DAnimationPathScale,
        track: scaleTrack,
      });
    }
  }

  if (missingPoseBlocks !== null && missingPoseBlocks.size > 0) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Recover,
      'awd2.pose-block-missing',
      'buildAwdDocumentAnimation',
      {
        distinctPoseBlocks: missingPoseBlocks.size,
        firstPoseBlock: Math.min(...missingPoseBlocks),
      },
    );
  }
  return { channels, duration: timeAccumulator, name: parsedAnimation.name };
}

// Validates the header version-major byte before the block walk. An 'AWD'-magic file with a version other
// than 2 (in practice version 3 — AWD3, AwayJS's Scene3DGraph format) has an entirely different block model,
// so the AWD2 block walk would silently misparse it to an empty/garbage document. Reject it by name here
// instead, pointing at AWD3 as a recognized but not-yet-implemented future format.
function isAwd2Version(input: Readonly<Uint8Array>, diagnostics?: ImportDiagnostic[]): boolean {
  const versionMajor = input[AWD2_VERSION_MAJOR_OFFSET];
  if (versionMajor === AWD2_FORMAT_VERSION) return true;
  reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Reject, 'awd2.unsupported-version', 'isAwd2Version', {
    version: versionMajor,
  });
  return false;
}

// The empty Scene3DDocument returned when AWD parsing fails or before assembly begins — every table present.
function emptyAwdDocument(): Scene3DDocument {
  return {
    animations: [],
    cameras: [],
    lights: [],
    materials: [],
    meshes: [],
    metadata: null,
    nodes: [],
    resources: [],
    scenes: [{ rootNodes: [] }],
    skins: [],
  };
}

// Emits an AWD skeleton block into a Scene3DDocument as a "skeleton" group node + one joint node per AWD
// joint (with its bind-pose local transform), plus a Scene3DDocumentSkin whose joints are those node indices
// and whose inverseBind are the AWD joint matrices (which ARE the inverse bind pose). Appends the nodes to
// `document.nodes` and returns the skeleton-group node index, the joint node indices (in AWD joint order,
// for animation binding), and the skin. The parent chain is wired through the joint nodes' `children` index
// lists (AWD parent index is 1-based, 0 = root; roots hang under the group). Each joint's LOCAL transform
// is seeded to the bind pose so the skinned mesh renders undeformed until the animation poses the joints —
// the same math the live scene path used, decomposed to a Transform3D for the document node.
function buildAwdSkeletonDocument(
  parsedSkeleton: Readonly<ParsedSkeleton>,
  document: Scene3DDocument,
): {
  jointNodeIndices: number[];
  skeletonRootIndex: number;
  skin: Scene3DDocumentSkin;
} {
  const jointCount = parsedSkeleton.joints.length;

  const skeletonRootIndex = document.nodes.length;
  document.nodes.push({
    children: [],
    kind: Node3DKind,
    name: 'skeleton',
    transform: createTransform3D(),
  });

  const jointNodeIndices: number[] = [];
  for (let j = 0; j < jointCount; j++) {
    jointNodeIndices.push(document.nodes.length);
    document.nodes.push({
      children: [],
      kind: Node3DKind,
      name: parsedSkeleton.joints[j].name || undefined,
      transform: createTransform3D(),
    });
  }

  for (let j = 0; j < jointCount; j++) {
    const parentIndex1 = parsedSkeleton.joints[j].parentIndex;
    if (parentIndex1 > 0 && parentIndex1 - 1 < jointCount) {
      document.nodes[jointNodeIndices[parentIndex1 - 1]].children.push(jointNodeIndices[j]);
    } else {
      document.nodes[skeletonRootIndex].children.push(jointNodeIndices[j]);
    }
  }

  // The AWD skeleton joint matrix is the joint's INVERSE bind pose (model→joint at bind), not a local
  // transform — see the AWD format and AwayJS's AWDParser (joint.inverseBindPose). So carry it as the skin's
  // explicit inverse-bind palette, and seed each joint's LOCAL transform to the bind pose so the rig renders
  // undeformed until the animation poses the joints. Bind world = inverseBind⁻¹, and a joint's bind-local =
  // parentBindWorld⁻¹ · jointBindWorld (roots use bind world directly). The animation clip then overrides
  // these locals per frame; the skinning palette is jointWorld · inverseBind, which is identity at bind
  // (undeformed) and the pose delta once animated.
  const inverseBind: Matrix4[] = [];
  const bindWorld: Matrix4[] = [];
  for (let j = 0; j < jointCount; j++) {
    const invBind = createMatrix4();
    awdTransformToMatrix4(invBind, parsedSkeleton.joints[j].transform);
    inverseBind.push(invBind);
    const bw = createMatrix4();
    inverseMatrix4(bw, invBind);
    bindWorld.push(bw);
  }

  const invParent = createMatrix4();
  const local = createMatrix4();
  for (let j = 0; j < jointCount; j++) {
    const parentIndex1 = parsedSkeleton.joints[j].parentIndex;
    if (parentIndex1 > 0 && parentIndex1 - 1 < jointCount) {
      inverseMatrix4(invParent, bindWorld[parentIndex1 - 1]);
      multiplyMatrix4(local, invParent, bindWorld[j]);
    } else {
      copyMatrix4(local, bindWorld[j]);
    }
    decomposeMatrix4ToTransform3D(document.nodes[jointNodeIndices[j]].transform, local);
  }

  const skin: Scene3DDocumentSkin = { inverseBind, joints: jointNodeIndices };
  return { jointNodeIndices, skeletonRootIndex, skin };
}

interface ParsedGeometry {
  geometry: ReturnType<typeof createMeshGeometry>;
  // True when the sub-mesh carried joint-index/weight streams and emitted the skinned layout, so the
  // mesh-instance pass knows to bind the file's skeleton to the produced Mesh via mesh.skin.
  skinned: boolean;
}

interface ParsedContainer {
  name: string;
  parentId: number;
  transform: Float64Array;
}

interface ParsedMeshInstance {
  geometryId: number;
  materialIds: number[];
  name: string;
  parentId: number;
  transform: Float64Array;
}

// A parsed AWD light block (type 41), with every AWD default already resolved (an absent property is a
// defined value in this format, not an absence the document has to carry). `rgb`/`ambientRgb` are 24-bit
// 0xrrggbb; `diffuse` and `ambient` are the two intensities the one block carries. `directionX/Y/Z` are
// still in AWD's LEFT-handed space and meaningful only for a directional light; `radius`/`fallOff` only
// for a point light. `hasRadius` records whether the file actually wrote the falloff-start distance, which
// Flight's single-cutoff `range` cannot hold — the flag is what separates a real drop from a default.
// A parsed AWD camera block (type 42). `projectionType` is the file's own 5001/5002/5003 discriminant and
// the numeric fields carry whichever property set that type uses: `fov` for a perspective camera (VERTICAL,
// in degrees), and the four bounds for an off-center orthographic one. AWD states no near/far and no aspect
// on the block — both live on the runtime viewport in Away3D — so the caller supplies the ecosystem
// defaults rather than inventing values.
interface ParsedCamera {
  bottom: number;
  fov: number;
  left: number;
  name: string;
  parentId: number;
  projectionType: number;
  right: number;
  top: number;
  transform: Float64Array;
}

interface ParsedLight {
  ambient: number;
  ambientRgb: number;
  castsShadow: boolean;
  diffuse: number;
  directionX: number;
  directionY: number;
  directionZ: number;
  fallOff: number;
  hasRadius: boolean;
  lightType: number;
  name: string;
  parentId: number;
  radius: number;
  rgb: number;
  specular: number;
  transform: Float64Array;
}

// A parsed AWD light-picker block (type 51): the set of light block ids one picker selects. Away3D binds a
// picker to a MATERIAL, so a file can light different materials with different subsets. Flight's light set
// is per-draw and scene-wide, so pickers are read to detect and report that scoping, never to build with.
interface ParsedLightPicker {
  lightIds: number[];
  name: string;
}

// A parsed AWD material block (type 81). `diffuseTextureId`/`normalTextureId`/`specularTextureId` are
// texture block ids (0 = absent), `color`/`alpha` the diffuse base and `specularColor`/`specularStrength`/
// `gloss` the specular tuple (null = absent, meaning the AWD2_MATERIAL_DEFAULT_* value applies).
// `numMethods` is the declared shading-method
// count — the method bodies are not walked yet (resolveAwdMaterial records a Skip diagnostic when > 0). Other base flags
// (smoothing/repeat/mipmap) are parsed past but not mapped.
interface ParsedMaterial {
  alpha: number | null;
  color: number | null;
  diffuseTextureId: number;
  gloss: number | null;
  name: string;
  normalTextureId: number;
  numMethods: number;
  specularColor: number | null;
  specularStrength: number | null;
  specularTextureId: number;
}

// A parsed AWD texture block (type 82). Exactly one source form is populated: `bytes` (+ detected
// `mimeType`) for an embedded, self-describing image payload (PNG/JPEG/…), or `url` for an external
// reference (the block's name is the URL in AWD's external form). Both null when an embedded payload
// was not a recognized image format (dropped). The parser emits these as a ImageResourceReference; it does
// not fetch or decode.
interface ParsedTexture {
  bytes: Uint8Array | null;
  mimeType: string | null;
  name: string;
  url: string | null;
}

function readAwdString(
  view: Readonly<DataView>,
  source: Readonly<Uint8Array>,
  offset: number,
): { end: number; value: string } {
  const length = (view as DataView).getUint16(offset, true);
  const stringBytes = (source as Uint8Array).subarray(offset + 2, offset + 2 + length);
  const value = new TextDecoder().decode(stringBytes);
  return { end: offset + 2 + length, value };
}

function readAwdTransform(
  view: Readonly<DataView>,
  offset: number,
  widePrecision: boolean,
): { end: number; transform: Float64Array } {
  const dv = view as DataView;
  const transform = new Float64Array(12);
  const floatSize = widePrecision ? 8 : 4;
  for (let i = 0; i < 12; i++) {
    transform[i] = widePrecision
      ? dv.getFloat64(offset + i * floatSize, true)
      : dv.getFloat32(offset + i * floatSize, true);
  }
  convertTransformLhToRh(transform);
  return { end: offset + 12 * floatSize, transform };
}

// Decomposes an AWD 12-float column-major transform into a document node's authored TRS Transform3D
// (lossy only on shear, which AWD authoring does not produce).
function awdTransformToTransform3D(transform: Readonly<Float64Array>): Transform3D {
  awdTransformToMatrix4(_awdTransformScratch, transform);
  const out = createTransform3D();
  decomposeMatrix4ToTransform3D(out, _awdTransformScratch);
  return out;
}

const _awdTransformScratch = createMatrix4();

// AWD stores transforms as 12 column-major floats: [c0x,c0y,c0z, c1x,c1y,c1z, c2x,c2y,c2z, tx,ty,tz] →
// 4×4 column-major with w-column [0,0,0,1]. Lifts one into `out` (its runtime binding is left intact).
function awdTransformToMatrix4(out: Matrix4, transform: Readonly<Float64Array>): void {
  const m = out.m;
  m[0] = transform[0];
  m[1] = transform[1];
  m[2] = transform[2];
  m[3] = 0;
  m[4] = transform[3];
  m[5] = transform[4];
  m[6] = transform[5];
  m[7] = 0;
  m[8] = transform[6];
  m[9] = transform[7];
  m[10] = transform[8];
  m[11] = 0;
  m[12] = transform[9];
  m[13] = transform[10];
  m[14] = transform[11];
  m[15] = 1;
}

function awdDataTypeByteSize(dataType: number): number {
  switch (dataType) {
    case AWD2_DATA_INT8:
    case AWD2_DATA_UINT8:
      return 1;
    case AWD2_DATA_INT16:
    case AWD2_DATA_UINT16:
      return 2;
    case AWD2_DATA_INT32:
    case AWD2_DATA_UINT32:
    case AWD2_DATA_FLOAT32:
      return 4;
    case AWD2_DATA_FLOAT64:
      return 8;
    default:
      return 4;
  }
}

function readAwdDataValue(view: Readonly<DataView>, offset: number, dataType: number): number {
  const dv = view as DataView;
  switch (dataType) {
    case AWD2_DATA_INT8:
      return dv.getInt8(offset);
    case AWD2_DATA_INT16:
      return dv.getInt16(offset, true);
    case AWD2_DATA_INT32:
      return dv.getInt32(offset, true);
    case AWD2_DATA_UINT8:
      return dv.getUint8(offset);
    case AWD2_DATA_UINT16:
      return dv.getUint16(offset, true);
    case AWD2_DATA_UINT32:
      return dv.getUint32(offset, true);
    case AWD2_DATA_FLOAT32:
      return dv.getFloat32(offset, true);
    case AWD2_DATA_FLOAT64:
      return dv.getFloat64(offset, true);
    default:
      return dv.getFloat32(offset, true);
  }
}

// Skips an AWD attribute list (NumAttrList or UserAttrList). The list is a uint32 byte-length
// prefix followed by that many bytes of attribute data.
function skipAwdAttrList(view: Readonly<DataView>, offset: number, end: number): number {
  if (offset + 4 > end) return offset;
  const byteLength = (view as DataView).getUint32(offset, true);
  return offset + 4 + byteLength;
}

// Parses a TriangleGeometry block (type 1). Layout:
// name(VarString) → numSubMeshes(uint16) → NumAttrList → per sub-mesh:
//   totalByteLen(uint32) → NumAttrList → streams → UserAttrList
function parseTriangleGeometryBlock(
  view: Readonly<DataView>,
  source: Readonly<Uint8Array>,
  start: number,
  end: number,
  geometryWide: boolean,
  diagnostics?: ImportDiagnostic[],
): ParsedGeometry[] {
  const dv = view as DataView;
  let offset = start;

  // Guard the name in two steps: the 2-byte VarString length prefix, then its declared payload — otherwise a
  // truncated name payload slips past readAwdString (which does not bound-check) and mislabels the next
  // guard's field as 'num-submeshes' when the missing bytes actually belong to the name.
  if (offset + 2 > end || offset + 2 + dv.getUint16(offset, true) > end) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Drop,
      'awd2.geometry-truncated',
      'parseTriangleGeometryBlock',
      {
        field: 'name',
      },
    );
    return [];
  }
  const nameResult = readAwdString(view, source, offset);
  offset = nameResult.end;

  if (offset + 2 > end) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Drop,
      'awd2.geometry-truncated',
      'parseTriangleGeometryBlock',
      {
        field: 'num-submeshes',
      },
    );
    return [];
  }
  const numSubMeshes = dv.getUint16(offset, true);
  offset += 2;

  offset = skipAwdAttrList(view, offset, end);

  const geometries: ParsedGeometry[] = [];

  for (let s = 0; s < numSubMeshes; s++) {
    if (offset + 4 > end) {
      // The sub-mesh header is truncated: this and every remaining sub-mesh of the block are omitted.
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Drop,
        'awd2.submesh-truncated',
        'parseTriangleGeometryBlock',
        {
          firstSubMesh: s,
        },
      );
      break;
    }
    const subMeshByteLen = dv.getUint32(offset, true);
    const subMeshEnd = offset + 4 + subMeshByteLen;
    offset += 4;

    // NumAttrList for sub-mesh properties.
    offset = skipAwdAttrList(view, offset, end);

    let positions: number[] | null = null;
    let indices: number[] | null = null;
    let uvs: number[] | null = null;
    let normals: number[] | null = null;
    let tangents: number[] | null = null;
    let jointIndices: number[] | null = null;
    let jointWeights: number[] | null = null;

    // Read streams until we reach the sub-mesh byte boundary (leaving room for UserAttrList).
    while (offset + 6 <= subMeshEnd) {
      const streamType = dv.getUint8(offset);
      offset += 1;
      const dataType = dv.getUint8(offset);
      offset += 1;
      const streamByteLength = dv.getUint32(offset, true);
      offset += 4;

      if (offset + streamByteLength > end) {
        reportImportDiagnostic(
          diagnostics,
          ImportDiagnosticSeverity.Recover,
          'awd2.stream-data-past-end',
          'parseTriangleGeometryBlock',
        );
        break;
      }

      // AWD stores per-vertex joint indices as uint16 (Away3D reads them with readUnsignedShort),
      // regardless of the stream's declared data type — exporters write float32 in that field but
      // pack the payload as tight uint16 indices. Read them as uint16 by byte length; the paired
      // weight stream is genuine float32 and goes through the generic reader below.
      if (streamType === AWD2_STREAM_JOINT_INDICES) {
        const jointCount = Math.floor(streamByteLength / 2);
        const values: number[] = [];
        for (let i = 0; i < jointCount; i++) values.push(dv.getUint16(offset + i * 2, true));
        jointIndices = values;
        offset += streamByteLength;
        continue;
      }

      const elementSize = awdDataTypeByteSize(dataType);
      const count = Math.floor(streamByteLength / elementSize);

      const values: number[] = [];
      for (let i = 0; i < count; i++) {
        values.push(readAwdDataValue(view, offset + i * elementSize, dataType));
      }
      offset += streamByteLength;

      switch (streamType) {
        case AWD2_STREAM_POSITIONS:
          positions = values;
          break;
        case AWD2_STREAM_INDICES:
          indices = values;
          break;
        case AWD2_STREAM_UVS:
          uvs = values;
          break;
        case AWD2_STREAM_NORMALS:
          normals = values;
          break;
        case AWD2_STREAM_TANGENTS:
          tangents = values;
          break;
        case AWD2_STREAM_JOINT_WEIGHTS:
          jointWeights = values;
          break;
        default:
          break;
      }
    }

    // UserAttrList for sub-mesh.
    offset = skipAwdAttrList(view, offset, end);

    if (positions === null || positions.length < 3) {
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Drop,
        'awd2.submesh-no-positions',
        'parseTriangleGeometryBlock',
      );
      continue;
    }

    // Convert from AWD's left-handed Y-up to Flight's right-handed Y-up. Joint indices/weights are
    // index/scalar data — unaffected by the handedness flip, which the skeleton transforms mirror.
    negateVec3Z(positions);
    if (normals !== null) negateVec3Z(normals);
    if (tangents !== null) negateVec3Z(tangents);
    // The reflection above flips triangle winding whether or not the sub-mesh shipped indices. Indexed
    // geometry is corrected here; a non-indexed sub-mesh is corrected on the assembled vertex records
    // below, once they exist. Correcting only the indexed case left non-indexed geometry inside out.
    if (indices !== null) reverseTriangleWinding(indices);

    const vertexCount = positions.length / 3;

    // A sub-mesh is skinned when it carries both influence streams; it then emits the skinned layout
    // (joints0/weights0 past uv0) and feeds the shared packSkinInfluences path. AWD lists an arbitrary
    // number of influences per vertex (shambler uses 8); the top four by weight are kept, renormalized.
    let jointsPerVertex = 0;
    if (jointIndices !== null && jointWeights !== null && vertexCount > 0) {
      jointsPerVertex = Math.floor(jointWeights.length / vertexCount);
      if (jointsPerVertex < 1 || jointIndices.length < vertexCount * jointsPerVertex) {
        reportImportDiagnostic(
          diagnostics,
          ImportDiagnosticSeverity.Recover,
          'awd2.skin-streams-mismatch',
          'parseTriangleGeometryBlock',
        );
        jointsPerVertex = 0;
      }
    }
    const skinned = jointsPerVertex > 0;

    const floatsPerVertex = skinned ? SKINNED_FLOATS_PER_VERTEX : CANONICAL_FLOATS_PER_VERTEX;
    const vertices = new Float32Array(vertexCount * floatsPerVertex);
    const jointScratch = [0, 0, 0, 0];
    const weightScratch = [0, 0, 0, 0];

    for (let v = 0; v < vertexCount; v++) {
      const o = v * floatsPerVertex;
      vertices[o] = positions[v * 3];
      vertices[o + 1] = positions[v * 3 + 1];
      vertices[o + 2] = positions[v * 3 + 2];

      if (normals !== null && v * 3 + 2 < normals.length) {
        vertices[o + 3] = normals[v * 3];
        vertices[o + 4] = normals[v * 3 + 1];
        vertices[o + 5] = normals[v * 3 + 2];
      }

      if (tangents !== null && v * 3 + 2 < tangents.length) {
        vertices[o + 6] = tangents[v * 3];
        vertices[o + 7] = tangents[v * 3 + 1];
        vertices[o + 8] = tangents[v * 3 + 2];
        // Tangent W is the bitangent handedness the shader reconstructs the bitangent with (B = W·N×T).
        // AWD's tangent stream is xyz only, so W must be synthesized: Away3D derives the bitangent as
        // N×T in its LEFT-handed space (one handedness for the whole mesh), and the left→right-handed
        // conversion above (negateVec3Z on N and T is a det=-1 reflection) flips that handedness. So the
        // correct sign in Flight's right-handed space is AWD2_TANGENT_HANDEDNESS. Left 0 (no bitangent) for
        // a vertex the tangent stream does not cover.
        vertices[o + 9] = AWD2_TANGENT_HANDEDNESS;
      }

      if (uvs !== null && v * 2 + 1 < uvs.length) {
        vertices[o + 10] = uvs[v * 2];
        vertices[o + 11] = uvs[v * 2 + 1];
      }

      if (skinned) {
        const influences: SkinInfluence[] = [];
        for (let k = 0; k < jointsPerVertex; k++) {
          const weight = jointWeights![v * jointsPerVertex + k];
          if (weight > 0)
            influences.push({
              jointIndex: jointIndices![v * jointsPerVertex + k],
              weight,
            });
        }
        packSkinInfluences(influences, jointScratch, weightScratch);
        vertices[o + 12] = jointScratch[0];
        vertices[o + 13] = jointScratch[1];
        vertices[o + 14] = jointScratch[2];
        vertices[o + 15] = jointScratch[3];
        vertices[o + 16] = weightScratch[0];
        vertices[o + 17] = weightScratch[1];
        vertices[o + 18] = weightScratch[2];
        vertices[o + 19] = weightScratch[3];
      }
    }

    if (indices === null) reverseVertexTriangleWinding(vertices, floatsPerVertex);

    const indexArray = indices !== null ? Uint32Array.from(indices) : undefined;
    const geometry = createMeshGeometry({
      indices: indexArray,
      layout: skinned ? CANONICAL_SKINNED_MESH_GEOMETRY_LAYOUT : CANONICAL_LAYOUT,
      vertices,
    });
    // Regenerate normals only when the sub-mesh carried none, matching the shared emitter; authored
    // AWD normals (present on skinned models like the shambler) are kept. Not gated on indices:
    // computeMeshGeometryNormals walks a non-indexed stream as sequential triangles, so gating it left
    // non-indexed sub-meshes with the zero normals every lit material then normalizes to nothing.
    if (normals === null) computeMeshGeometryNormals(geometry, geometry);
    // Away3D commonly ships meshes with UVs but NO tangent stream and derives tangents at load time. With
    // no stream the tangent frame above is left zero, so a normal-mapped material renders black (its
    // sampled normal has no basis to transform through). Synthesize a tangent basis (xyz + handedness W)
    // from positions/normals/UVs — the -1 W this yields for real AWD geometry is render-confirmed correct.
    // Only when the stream is absent and there are UVs; an authored tangent stream is kept untouched.
    // The per-triangle UV gradient this needs comes from the shared triangle walker, which reads a
    // non-indexed stream as sequential triangles, so indices are not a precondition.
    if (tangents === null && uvs !== null) {
      computeMeshGeometryTangents(geometry, geometry);
    }
    geometries.push({ geometry, skinned });
  }

  return geometries;
}

// Parses a Container block (type 22). AWD Scene3DHeader layout:
// parentId(uint32) → matrix4x3(12 × floatSize) → name(VarString) → NumAttrList → UserAttrList
function parseContainerBlock(
  view: Readonly<DataView>,
  source: Readonly<Uint8Array>,
  start: number,
  end: number,
  matrixWide: boolean,
  diagnostics?: ImportDiagnostic[],
): ParsedContainer | null {
  const dv = view as DataView;
  let offset = start;

  if (offset + 4 > end) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Drop,
      'awd2.container-truncated',
      'parseContainerBlock',
      {
        field: 'parentId',
      },
    );
    return null;
  }
  const parentId = dv.getUint32(offset, true);
  offset += 4;

  const floatSize = matrixWide ? 8 : 4;
  if (offset + 12 * floatSize > end) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Drop,
      'awd2.container-truncated',
      'parseContainerBlock',
      {
        field: 'transform',
      },
    );
    return null;
  }
  const transformResult = readAwdTransform(view, offset, matrixWide);
  offset = transformResult.end;

  if (offset + 2 > end) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Drop,
      'awd2.container-truncated',
      'parseContainerBlock',
      {
        field: 'name',
      },
    );
    return null;
  }
  const nameResult = readAwdString(view, source, offset);
  offset = nameResult.end;

  offset = skipAwdAttrList(view, offset, end);
  offset = skipAwdAttrList(view, offset, end);

  return {
    name: nameResult.value,
    parentId,
    transform: transformResult.transform,
  };
}

// Parses a MeshInstance block (type 23). Layout:
// Scene3DHeader(parentId → matrix → name) → geometryId(uint32)
// → numMaterials(uint16) → materialIds(uint32 × N) → NumAttrList → UserAttrList
function parseMeshInstanceBlock(
  view: Readonly<DataView>,
  source: Readonly<Uint8Array>,
  start: number,
  end: number,
  matrixWide: boolean,
  diagnostics?: ImportDiagnostic[],
): ParsedMeshInstance | null {
  const dv = view as DataView;
  let offset = start;

  if (offset + 4 > end) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Drop,
      'awd2.mesh-instance-truncated',
      'parseMeshInstanceBlock',
      {
        field: 'parentId',
      },
    );
    return null;
  }
  const parentId = dv.getUint32(offset, true);
  offset += 4;

  const floatSize = matrixWide ? 8 : 4;
  if (offset + 12 * floatSize > end) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Drop,
      'awd2.mesh-instance-truncated',
      'parseMeshInstanceBlock',
      {
        field: 'transform',
      },
    );
    return null;
  }
  const transformResult = readAwdTransform(view, offset, matrixWide);
  offset = transformResult.end;

  if (offset + 2 > end) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Drop,
      'awd2.mesh-instance-truncated',
      'parseMeshInstanceBlock',
      {
        field: 'name',
      },
    );
    return null;
  }
  const nameResult = readAwdString(view, source, offset);
  offset = nameResult.end;

  if (offset + 4 > end) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Drop,
      'awd2.mesh-instance-truncated',
      'parseMeshInstanceBlock',
      {
        field: 'geometryId',
      },
    );
    return null;
  }
  const geometryId = dv.getUint32(offset, true);
  offset += 4;

  // Material block ids, positional per geometry sub-mesh. Previously read-and-discarded; kept now so
  // the diffuse material/texture for each subset can be resolved and attached.
  const materialIds: number[] = [];
  if (offset + 2 <= end) {
    const numMaterials = dv.getUint16(offset, true);
    offset += 2;
    for (let i = 0; i < numMaterials && offset + 4 <= end; i++) {
      materialIds.push(dv.getUint32(offset, true));
      offset += 4;
    }
  }

  // NumAttrList (block properties) and UserAttrList.
  offset = skipAwdAttrList(view, offset, end);
  offset = skipAwdAttrList(view, offset, end);

  return {
    geometryId,
    materialIds,
    name: nameResult.value,
    parentId,
    transform: transformResult.transform,
  };
}

// Parses a Material block (type 81). Layout:
// name(VarString) → matType(uint8) → numMethods(uint8) → PropertyList → methods → UserAttrList.
// The base PropertyList carries the flat color (property 1), diffuse texture id (property 2), normal
// texture id (property 3), alpha (property 10), and the specular tuple — strength (18), gloss (19),
// color (20), and specular texture id (21) — the properties Flight maps onto the ShadedMaterial
// base. `numMethods` is captured so the resolver can record a diagnostic that a method-bearing material's shading methods
// (fog/env/fresnel in Away3D's MethodMaterial model) are not yet imported as modifiers; the
// method bodies themselves (which follow the base PropertyList) are left unwalked pending a real
// method-bearing fixture and the verified AWD2 method-type layout — every AWD2 asset in the reference
// corpus is `numMethods == 0`, so there is nothing to observe or test the walk against yet.
function parseMaterialBlock(
  view: Readonly<DataView>,
  source: Readonly<Uint8Array>,
  start: number,
  end: number,
  diagnostics?: ImportDiagnostic[],
): ParsedMaterial | null {
  let offset = start;

  if (offset + 2 > end) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Drop,
      'awd2.material-truncated',
      'parseMaterialBlock',
      {
        field: 'name',
      },
    );
    return null;
  }
  const nameResult = readAwdString(view, source, offset);
  offset = nameResult.end;

  if (offset + 2 > end) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Drop,
      'awd2.material-truncated',
      'parseMaterialBlock',
      {
        field: 'type',
      },
    );
    return null;
  }
  offset += 1; // matType (uint8) — texture vs color is inferred from which properties are present
  const numMethods = source[offset];
  offset += 1; // numMethods (uint8)

  const props = readAwdProperties(view, offset, end);
  const diffuseTextureId = readAwdPropertyUint32(view, props.values, AWD2_MATERIAL_PROP_DIFFUSE_TEXTURE) ?? 0;
  const normalTextureId = readAwdPropertyUint32(view, props.values, AWD2_MATERIAL_PROP_NORMAL_TEXTURE) ?? 0;
  const specularTextureId = readAwdPropertyUint32(view, props.values, AWD2_MATERIAL_PROP_SPECULAR_TEXTURE) ?? 0;
  const color = readAwdPropertyUint32(view, props.values, AWD2_MATERIAL_PROP_COLOR);
  const alpha = readAwdPropertyFloat32(view, props.values, AWD2_MATERIAL_PROP_ALPHA);
  // Gloss and specular strength are AWD "property numbers": the exporter picks float32 or float64, so
  // the width comes from each record's own byte-length prefix rather than the file's wide-properties flag.
  const gloss = readAwdPropertyNumber(view, props.values, AWD2_MATERIAL_PROP_GLOSS);
  const specularColor = readAwdPropertyUint32(view, props.values, AWD2_MATERIAL_PROP_SPECULAR_COLOR);
  const specularStrength = readAwdPropertyNumber(view, props.values, AWD2_MATERIAL_PROP_SPECULAR_STRENGTH);

  return {
    alpha,
    color,
    diffuseTextureId,
    gloss,
    name: nameResult.value,
    normalTextureId,
    numMethods,
    specularColor,
    specularStrength,
    specularTextureId,
  };
}

// Parses a Camera block (type 42). Layout:
// Scene3DHeader(parentId → matrix → name) → activeFlag(uint8) → lensCount(int16) → projectionType(int16)
// → PropertyList → pivot PropertyList → UserAttrList. The header is the same envelope every placed AWD
// block uses, which is why it reads identically to parseLightBlock.
function parseCameraBlock(
  view: Readonly<DataView>,
  source: Readonly<Uint8Array>,
  start: number,
  end: number,
  matrixWide: boolean,
  diagnostics?: ImportDiagnostic[],
): ParsedCamera | null {
  const dv = view as DataView;
  let offset = start;

  if (offset + 4 > end) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Drop, 'awd2.camera-truncated', 'parseCameraBlock', {
      field: 'parentId',
    });
    return null;
  }
  const parentId = dv.getUint32(offset, true);
  offset += 4;

  const floatSize = matrixWide ? 8 : 4;
  if (offset + 12 * floatSize > end) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Drop, 'awd2.camera-truncated', 'parseCameraBlock', {
      field: 'transform',
    });
    return null;
  }
  const transformResult = readAwdTransform(view, offset, matrixWide);
  offset = transformResult.end;

  if (offset + 2 > end || offset + 2 + dv.getUint16(offset, true) > end) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Drop, 'awd2.camera-truncated', 'parseCameraBlock', {
      field: 'name',
    });
    return null;
  }
  const nameResult = readAwdString(view, source, offset);
  offset = nameResult.end;

  // uint8 active-camera flag, then an int16 lens count the format writes but never uses.
  if (offset + 5 > end) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Drop, 'awd2.camera-truncated', 'parseCameraBlock', {
      field: 'projectionType',
    });
    return null;
  }
  offset += 3;
  const projectionType = dv.getInt16(offset, true);
  offset += 2;

  const props = readAwdProperties(view, offset, end);

  return {
    bottom: readAwdPropertyFloat32(view, props.values, AWD2_CAMERA_PROP_ORTHO_BOTTOM) ?? AWD2_CAMERA_DEFAULT_BOTTOM,
    fov: readAwdPropertyFloat32(view, props.values, AWD2_CAMERA_PROP_FOV) ?? AWD2_CAMERA_DEFAULT_FOV_DEGREES,
    left: readAwdPropertyFloat32(view, props.values, AWD2_CAMERA_PROP_ORTHO_LEFT) ?? AWD2_CAMERA_DEFAULT_LEFT,
    name: nameResult.value,
    parentId,
    projectionType,
    right: readAwdPropertyFloat32(view, props.values, AWD2_CAMERA_PROP_ORTHO_RIGHT) ?? AWD2_CAMERA_DEFAULT_RIGHT,
    top: readAwdPropertyFloat32(view, props.values, AWD2_CAMERA_PROP_ORTHO_TOP) ?? AWD2_CAMERA_DEFAULT_TOP,
    transform: transformResult.transform,
  };
}

// Appends one parsed AWD camera to the document's camera placement table. The block matrix is the
// camera's placement, exactly as it is for a point light.
//
// AWD carries no near/far and no aspect on the camera block — both belong to the runtime viewport in
// Away3D, not to the asset — so the clip planes take that ecosystem's own projection defaults and the
// aspect is 1, the same shape every other importer lands on when the format states none.
function buildAwdDocumentCamera(
  camera: Readonly<ParsedCamera>,
  nodeIndex: number | undefined,
  document: Scene3DDocument,
  diagnostics?: ImportDiagnostic[],
): void {
  let projection: Projection;
  if (camera.projectionType === AWD2_CAMERA_PROJECTION_PERSPECTIVE) {
    // Away3D's fieldOfView drives the VERTICAL scale of the frustum, so it maps to fovY directly.
    projection = { aspect: 1, fovY: camera.fov * DEG_TO_RAD, kind: 'perspective' };
  } else if (camera.projectionType === AWD2_CAMERA_PROJECTION_ORTHOGRAPHIC) {
    projection = {
      halfHeight: AWD2_CAMERA_DEFAULT_ORTHO_HALF_EXTENT,
      halfWidth: AWD2_CAMERA_DEFAULT_ORTHO_HALF_EXTENT,
      kind: 'orthographic',
    };
  } else if (camera.projectionType === AWD2_CAMERA_PROJECTION_ORTHOGRAPHIC_OFFCENTER) {
    projection = {
      halfHeight: Math.abs(camera.top - camera.bottom) / 2,
      halfWidth: Math.abs(camera.right - camera.left) / 2,
      kind: 'orthographic',
    };
    // Flight's orthographic volume is centred on the view axis; AWD's off-center form can sit the volume
    // anywhere. The extents survive, the offset does not — an authored asymmetry the file really stated.
    if (camera.right + camera.left !== 0 || camera.top + camera.bottom !== 0) {
      reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Skip, 'awd2.camera-offcenter-dropped', 'parseAwd2', {
        name: camera.name,
      });
    }
  } else {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Skip,
      'awd2.camera-unsupported-projection',
      'parseAwd2',
      {
        name: camera.name,
        projectionType: camera.projectionType,
      },
    );
    return;
  }

  document.cameras.push({
    far: AWD2_CAMERA_DEFAULT_FAR,
    ...(camera.name.length > 0 ? { name: camera.name } : {}),
    near: AWD2_CAMERA_DEFAULT_NEAR,
    ...(nodeIndex !== undefined ? { node: nodeIndex } : {}),
    projection,
    transform: awdTransformToTransform3D(camera.transform),
  });
}

// Parses a Light block (type 41). Layout:
// Scene3DHeader(parentId → matrix → name) → lightType(uint8) → PropertyList → UserAttrList.
// The matrix is the light's placement; Away3D applies it to a POINT light and ignores it for a
// DIRECTIONAL one (whose aim lives in properties 21/22/23 as a world-space vector), so this parser
// mirrors that rather than baking a rotation a directional light never used.
function parseLightBlock(
  view: Readonly<DataView>,
  source: Readonly<Uint8Array>,
  start: number,
  end: number,
  matrixWide: boolean,
  diagnostics?: ImportDiagnostic[],
): ParsedLight | null {
  const dv = view as DataView;
  let offset = start;

  if (offset + 4 > end) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Drop, 'awd2.light-truncated', 'parseLightBlock', {
      field: 'parentId',
    });
    return null;
  }
  const parentId = dv.getUint32(offset, true);
  offset += 4;

  const floatSize = matrixWide ? 8 : 4;
  if (offset + 12 * floatSize > end) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Drop, 'awd2.light-truncated', 'parseLightBlock', {
      field: 'transform',
    });
    return null;
  }
  const transformResult = readAwdTransform(view, offset, matrixWide);
  offset = transformResult.end;

  if (offset + 2 > end || offset + 2 + dv.getUint16(offset, true) > end) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Drop, 'awd2.light-truncated', 'parseLightBlock', {
      field: 'name',
    });
    return null;
  }
  const nameResult = readAwdString(view, source, offset);
  offset = nameResult.end;

  if (offset + 1 > end) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Drop, 'awd2.light-truncated', 'parseLightBlock', {
      field: 'lightType',
    });
    return null;
  }
  const lightType = (source as Uint8Array)[offset];
  offset += 1;

  const props = readAwdProperties(view, offset, end);
  const values = props.values;
  const hasRadius = values.has(AWD2_LIGHT_PROP_RADIUS);
  return {
    ambient: readAwdPropertyNumber(view, values, AWD2_LIGHT_PROP_AMBIENT) ?? AWD2_LIGHT_DEFAULT_AMBIENT,
    ambientRgb: readAwdPropertyUint32(view, values, AWD2_LIGHT_PROP_AMBIENT_COLOR) ?? AWD2_LIGHT_DEFAULT_RGB,
    castsShadow: (readAwdPropertyUint8(view, values, AWD2_LIGHT_PROP_SHADOW_MAPPER) ?? 0) > 0,
    diffuse: readAwdPropertyNumber(view, values, AWD2_LIGHT_PROP_DIFFUSE) ?? AWD2_LIGHT_DEFAULT_DIFFUSE,
    directionX: readAwdPropertyNumber(view, values, AWD2_LIGHT_PROP_DIRECTION_X) ?? 0,
    directionY: readAwdPropertyNumber(view, values, AWD2_LIGHT_PROP_DIRECTION_Y) ?? -1,
    directionZ: readAwdPropertyNumber(view, values, AWD2_LIGHT_PROP_DIRECTION_Z) ?? 1,
    fallOff: readAwdPropertyNumber(view, values, AWD2_LIGHT_PROP_FALLOFF) ?? AWD2_LIGHT_DEFAULT_FALLOFF,
    hasRadius,
    lightType,
    name: nameResult.value,
    parentId,
    radius: readAwdPropertyNumber(view, values, AWD2_LIGHT_PROP_RADIUS) ?? AWD2_LIGHT_DEFAULT_RADIUS,
    rgb: readAwdPropertyUint32(view, values, AWD2_LIGHT_PROP_COLOR) ?? AWD2_LIGHT_DEFAULT_RGB,
    specular: readAwdPropertyNumber(view, values, AWD2_LIGHT_PROP_SPECULAR) ?? AWD2_LIGHT_DEFAULT_SPECULAR,
    transform: transformResult.transform,
  };
}

// Parses a LightPicker block (type 51). Layout:
// name(VarString) → numLights(uint16) → lightIds(uint32 × N) → UserAttrList. Unlike most AWD blocks it
// carries no property list.
function parseLightPickerBlock(
  view: Readonly<DataView>,
  source: Readonly<Uint8Array>,
  start: number,
  end: number,
  diagnostics?: ImportDiagnostic[],
): ParsedLightPicker | null {
  const dv = view as DataView;
  let offset = start;

  if (offset + 2 > end || offset + 2 + dv.getUint16(offset, true) > end) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Drop,
      'awd2.light-picker-truncated',
      'parseLightPickerBlock',
      { field: 'name' },
    );
    return null;
  }
  const nameResult = readAwdString(view, source, offset);
  offset = nameResult.end;

  if (offset + 2 > end) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Drop,
      'awd2.light-picker-truncated',
      'parseLightPickerBlock',
      { field: 'numLights' },
    );
    return null;
  }
  const numLights = dv.getUint16(offset, true);
  offset += 2;

  if (offset + numLights * 4 > end) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Drop,
      'awd2.light-picker-truncated',
      'parseLightPickerBlock',
      { field: 'lightIds', lights: numLights },
    );
    return null;
  }
  const lightIds: number[] = [];
  for (let i = 0; i < numLights; i++) {
    lightIds.push(dv.getUint32(offset, true));
    offset += 4;
  }

  return { lightIds, name: nameResult.value };
}

// Parses a Texture block (type 82). Layout:
// name(VarString) → texType(uint8) → dataLen(uint32) → data(dataLen bytes) → PropertyList → UserAttrList.
// The embedded form carries a self-describing image payload (PNG/JPEG/…); the external form stores a
// URL Flight cannot fetch at parse time and is returned as an unresolved (byte-less) slot.
function parseTextureBlock(
  view: Readonly<DataView>,
  source: Readonly<Uint8Array>,
  start: number,
  end: number,
  diagnostics?: ImportDiagnostic[],
): ParsedTexture | null {
  const dv = view as DataView;
  let offset = start;

  if (offset + 2 > end) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Drop, 'awd2.texture-truncated', 'parseTextureBlock', {
      field: 'name',
    });
    return null;
  }
  const nameResult = readAwdString(view, source, offset);
  offset = nameResult.end;

  if (offset + 5 > end) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Drop, 'awd2.texture-truncated', 'parseTextureBlock', {
      field: 'payload',
    });
    return null;
  }
  const texType = (source as Uint8Array)[offset];
  offset += 1;
  const dataLen = dv.getUint32(offset, true);
  offset += 4;

  if (offset + dataLen > end) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Drop, 'awd2.texture-truncated', 'parseTextureBlock', {
      bytes: dataLen,
      field: 'data',
    });
    return null;
  }

  if (texType !== AWD2_TEXTURE_TYPE_EMBEDDED) {
    // AWD's external form carries the image URL as the block name; emit it as an External ref for
    // the resolver to fetch, rather than dropping it.
    return {
      bytes: null,
      mimeType: null,
      name: nameResult.value,
      url: nameResult.value,
    };
  }

  const bytes = (source as Uint8Array).slice(offset, offset + dataLen);
  const mimeType = detectImageMimeType(bytes);
  if (mimeType === null) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Recover,
      'awd2.texture-unrecognized-format',
      'parseTextureBlock',
    );
    return { bytes: null, mimeType: null, name: nameResult.value, url: null };
  }

  return { bytes, mimeType, name: nameResult.value, url: null };
}

// Reads an AWD typed-property list: a uint32 byte-length prefix followed by `uint16 key, uint32
// fieldLength, <value>` records. Returns each key's value span so callers decode only the keys they
// know; unknown keys are stepped over by their length.
function readAwdProperties(
  view: Readonly<DataView>,
  offset: number,
  end: number,
): { end: number; values: Map<number, { length: number; offset: number }> } {
  const dv = view as DataView;
  const values = new Map<number, { length: number; offset: number }>();
  if (offset + 4 > end) return { end: offset, values };

  const listLength = dv.getUint32(offset, true);
  offset += 4;
  const listEnd = Math.min(offset + listLength, end);

  while (offset + 6 <= listEnd) {
    const key = dv.getUint16(offset, true);
    offset += 2;
    const fieldLength = dv.getUint32(offset, true);
    offset += 4;
    if (offset + fieldLength > listEnd) break;
    values.set(key, { length: fieldLength, offset });
    offset += fieldLength;
  }

  return { end: listEnd, values };
}

function readAwdPropertyFloat32(
  view: Readonly<DataView>,
  values: Readonly<Map<number, { length: number; offset: number }>>,
  key: number,
): number | null {
  const entry = values.get(key);
  if (entry === undefined || entry.length < 4) return null;
  return (view as DataView).getFloat32(entry.offset, true);
}

// Reads a property whose float width the EXPORTER chose. AWD carries a global "wide properties" header
// flag, but every property record is already byte-length prefixed, so the width is self-describing in the
// data: an 8-byte field is a float64, anything else a float32. Reading the record rather than the flag
// keeps a mixed-width or flag-disagreeing file readable, which a flag-driven reader would silently
// misparse into garbage magnitudes.
function readAwdPropertyNumber(
  view: Readonly<DataView>,
  values: Readonly<Map<number, { length: number; offset: number }>>,
  key: number,
): number | null {
  const entry = values.get(key);
  if (entry === undefined || entry.length < 4) return null;
  const dv = view as DataView;
  return entry.length >= 8 ? dv.getFloat64(entry.offset, true) : dv.getFloat32(entry.offset, true);
}

function readAwdPropertyUint8(
  view: Readonly<DataView>,
  values: Readonly<Map<number, { length: number; offset: number }>>,
  key: number,
): number | null {
  const entry = values.get(key);
  if (entry === undefined || entry.length < 1) return null;
  return (view as DataView).getUint8(entry.offset);
}

function readAwdPropertyUint32(
  view: Readonly<DataView>,
  values: Readonly<Map<number, { length: number; offset: number }>>,
  key: number,
): number | null {
  const entry = values.get(key);
  if (entry === undefined || entry.length < 4) return null;
  return (view as DataView).getUint32(entry.offset, true);
}

// Resolves an AWD material block id to a document material INDEX (appended to `document.materials`),
// memoized so a material shared by several subsets registers one entry (and one Texture/Image per
// shared texture). An EXISTING material block ALWAYS produces a ShadedMaterial — a block with no base
// properties (no color, no textures, alpha-only, or method-only) is a valid material and defaults to
// opaque white, honoring the uniform-ShadedMaterial rule. Only the sentinel id 0 (subset declares no
// material) and a referenced-but-missing block id return -1 (the assembler resolves that to a null material).
//
// AWD materials import as ShadedMaterial UNIFORMLY — including numMethods=0 (empty modifiers[]). AWD's
// material model is a MethodMaterial = a BlinnPhong base + a METHODS ARRAY; ShadedMaterial (base + an
// ordered modifiers[]) is its structural image. An empty stack honestly encodes a method-less material
// and compiles to the same base program as BlinnPhong (zero pixel cost), while (a) preserving losslessness
// if a file/exporter DOES carry methods, and (b) letting a demo author reproduce the original Away3D look
// by APPENDING a fresnel/fog modifier — no material-kind conversion. Do NOT collapse method-less materials
// to BlinnPhong: that discards the format's array-shaped intent to save a type. (Callers who genuinely want
// the leaner kind can down-convert a modifier-less ShadedMaterial to BlinnPhong themselves.)
//
// A method-bearing material (numMethods > 0) records a Skip diagnostic and imports its base only: the AWD2 method-block layout
// is unverified in-sandbox (the whole reference corpus is numMethods=0), so shipping a blind method→modifier
// walk would be speculative. The base carries color(1), diffuseTex(2), normalTex(3), alpha(10), and the
// specular tuple strength(18)/gloss(19)/specularColor(20)/specularTex(21).
//
// The specular tuple is a BASE property group, not a method. AwayJS's parseMaterial_v1 reads all four keys
// off the material's own property list and configures `mat.specularMethod` from them, so a numMethods=0
// material still carries a full specular description — and an ABSENT key means AwayJS's default, not an
// absent term. That is why gloss defaults to 50 rather than createShadedMaterial's own 32: importing a
// shambler material at 32 widens every highlight the file authored tight.
//
// Away3D's separate specular STRENGTH scalar has no Flight counterpart, so it folds into the packed
// `specular` RGB. That is exact rather than approximate: both backends' shaded fragment path multiplies
// the specular term by `specular.rgb` (then by the specular map) and nothing else reads the channel, so
// color × strength and color-then-scale-by-strength are the same product. A strength above 1 cannot
// survive the fold — packed RGBA is 8-bit unsigned — so it clamps and records a diagnostic.
function resolveAwdMaterial(
  materialId: number,
  materialBlocks: Readonly<Map<number, ParsedMaterial>>,
  textureBlocks: Readonly<Map<number, ParsedTexture>>,
  cache: Map<number, number>,
  document: Scene3DDocument,
  diagnostics?: ImportDiagnostic[],
): number {
  if (materialId === 0) return -1;
  const cached = cache.get(materialId);
  if (cached !== undefined) return cached;

  const parsed = materialBlocks.get(materialId);
  if (parsed === undefined) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Drop, 'awd2.material-missing', 'resolveAwdMaterial', {
      material: materialId,
    });
    cache.set(materialId, -1);
    return -1;
  }

  const diffuseTexture =
    parsed.diffuseTextureId !== 0
      ? resolveAwdTexture(parsed.diffuseTextureId, textureBlocks, document, diagnostics)
      : null;
  const normalTexture =
    parsed.normalTextureId !== 0
      ? resolveAwdTexture(parsed.normalTextureId, textureBlocks, document, diagnostics)
      : null;
  if (normalTexture !== null) normalTexture.colorSpace = 'linear';
  // The specular map keeps the default 'srgb': Away3D samples it as a plain color multiplier on the
  // specular term, exactly as the diffuse map is sampled — it is not a linear data mask.
  const specularTexture =
    parsed.specularTextureId !== 0
      ? resolveAwdTexture(parsed.specularTextureId, textureBlocks, document, diagnostics)
      : null;

  // A method-bearing material imports its base only (see the header note) — record a diagnostic rather than silently drop.
  if (parsed.numMethods > 0) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Skip,
      'awd2.material-methods-unsupported',
      'resolveAwdMaterial',
      { methods: parsed.numMethods },
    );
  }

  const diffuse = getAwdDiffuseRgba(parsed.color, parsed.alpha);
  const strength = parsed.specularStrength ?? AWD2_MATERIAL_DEFAULT_SPECULAR_STRENGTH;
  if (strength > 1) {
    reportImportDiagnostic(
      diagnostics,
      // Recover: the clamped value IS written — createShadedMaterial below builds from it. The kind name
      // says clamped and a substitute stands in, so this was never an ignored feature.
      ImportDiagnosticSeverity.Recover,
      'awd2.material-specular-strength-clamped',
      'resolveAwdMaterial',
      { strength },
    );
  }
  const material = createShadedMaterial({
    diffuse,
    diffuseMap: diffuseTexture,
    normalMap: normalTexture,
    shininess: parsed.gloss ?? AWD2_MATERIAL_DEFAULT_GLOSS,
    specular: getAwdSpecularRgba(parsed.specularColor, strength),
    specularMap: specularTexture,
  }) as unknown as Material;
  // An alpha below 1 must actually blend; ShadedMaterial defaults to opaque coverage.
  if (parsed.alpha !== null && parsed.alpha < 1) (material as unknown as SurfaceMaterial).alphaMode = 'blend';
  // Preserve the AWD material block name as the material's authored name (empty → anonymous).
  material.name = parsed.name.length > 0 ? parsed.name : null;
  const index = document.materials.length;
  document.materials.push(material as unknown as MaterialLike);
  cache.set(materialId, index);
  return index;
}

// Resolves an AWD texture block id to a Flight Texture carrying an unresolved ImageResourceReference, or
// null when the texture is missing or its embedded payload was an unrecognized image format. The
// parser references — it does not decode: an embedded block emits an Embedded ref holding the encoded
// bytes; an external block emits an External ref holding the URL. The Texture's `image` stays null
// until @flighthq/scene3d-resources resolves the ref.
function resolveAwdTexture(
  textureId: number,
  textureBlocks: Readonly<Map<number, ParsedTexture>>,
  document: Scene3DDocument,
  diagnostics?: ImportDiagnostic[],
): Texture | null {
  const parsed = textureBlocks.get(textureId);
  if (parsed === undefined) {
    reportImportDiagnostic(diagnostics, ImportDiagnosticSeverity.Drop, 'awd2.texture-missing', 'resolveAwdTexture', {
      texture: textureId,
    });
    return null;
  }
  if (parsed.bytes !== null && parsed.mimeType !== null) {
    return createEmbeddedTextureRef(parsed.bytes, parsed.mimeType, document.resources);
  }
  if (parsed.url !== null) {
    return createExternalTextureRef(parsed.url, null, document.resources);
  }
  return null;
}

// Appends one AWD light block to the document's light table. An AWD light is a COMPOUND: it carries a
// punctual term (`color` × `diffuse`, aimed or placed) and its own ambient term (`ambientColor` ×
// `ambient`) on the same entity. Flight models those as two separate descriptors, so one block emits a
// DirectionalLight/PointLight plus — only when the file gave it a non-zero ambient — a sibling AmbientLight
// named after it. Splitting is what makes the import lossless: folding the ambient into the punctual color
// would tint the wrong term, and dropping it would lose the fill the author set.
//
// `node` binds the light to the document node its AWD parent block produced, so an animated parent carries
// the light with it. Placement follows the document convention (see Scene3DDocumentLight): the descriptor
// holds the light in its own LOCAL space and `transform` places and orients it. AWD states a directional
// aim as a world-space vector, so that vector becomes the transform's rotation off the canonical -Z axis
// rather than being written onto the descriptor.
function buildAwdDocumentLights(
  light: Readonly<ParsedLight>,
  nodeIndex: number | undefined,
  document: Scene3DDocument,
  drops: Map<string, AwdLightDropTally>,
): void {
  let descriptor: Light;
  let transform: Transform3D;
  if (light.lightType === AWD2_LIGHT_TYPE_DIRECTIONAL) {
    // AWD aims its lights in a LEFT-handed space; the whole file is converted to Flight's right-handed one
    // by negating z, the same single-axis flip readAwdTransform applies to every placement matrix.
    const aim = createVector3(light.directionX, light.directionY, -light.directionZ);
    normalizeVector3(aim, aim);
    transform = createTransform3D();
    setQuaternionFromUnitVectors(transform.rotation, DOCUMENT_LIGHT_LOCAL_AXIS, aim);
    descriptor = createDirectionalLight({
      castsShadow: light.castsShadow,
      color: getAwdLightRgba(light.rgb),
      direction: DOCUMENT_LIGHT_LOCAL_AXIS,
      intensity: light.diffuse,
    });
  } else if (light.lightType === AWD2_LIGHT_TYPE_POINT) {
    // The point light's placement is the block matrix, carried on `transform`; the descriptor's own
    // `position` stays at the local origin, which is where the convention puts an unplaced light.
    transform = awdTransformToTransform3D(light.transform);
    descriptor = createPointLight({
      castsShadow: light.castsShadow,
      color: getAwdLightRgba(light.rgb),
      intensity: light.diffuse,
      // Away3D's falloff runs from `radius` (full brightness) to `fallOff` (zero); Flight's `range` is the
      // single cutoff distance, so the END maps and the START has nowhere to go.
      range: light.fallOff,
    });
    if (light.hasRadius) {
      tallyAwdLightDrop(drops, ImportDiagnosticSeverity.Skip, 'awd2.light-radius-dropped', { firstLight: light.name });
    }
  } else {
    tallyAwdLightDrop(drops, ImportDiagnosticSeverity.Skip, 'awd2.light-unsupported-type', {
      firstLight: light.name,
      firstType: light.lightType,
    });
    return;
  }

  // Away3D scales a light's specular response independently of its diffuse one. Flight's punctual lights
  // carry a single intensity that drives both, so a file that pulled them apart loses that separation.
  if (light.specular !== AWD2_LIGHT_DEFAULT_SPECULAR) {
    tallyAwdLightDrop(drops, ImportDiagnosticSeverity.Skip, 'awd2.light-specular-dropped', {
      firstLight: light.name,
      firstSpecular: light.specular,
    });
  }

  document.lights.push({ descriptor, name: light.name || undefined, node: nodeIndex, transform });

  if (light.ambient !== 0) {
    document.lights.push({
      descriptor: createAmbientLight({ color: getAwdLightRgba(light.ambientRgb), intensity: light.ambient }),
      name: light.name ? `${light.name} Ambient` : undefined,
      node: nodeIndex,
      transform: createTransform3D(),
    });
  }
}

// The canonical local aim every placed document light is authored against: -Z, with the light's own
// `transform` supplying the orientation (see Scene3DDocumentLight). Read-only — createDirectionalLight
// clones the direction it is given, and setQuaternionFromUnitVectors only reads its `from`.
const DOCUMENT_LIGHT_LOCAL_AXIS = createVector3(0, 0, -1);

// AWD states no clip planes, aspect, or orthographic extent on the camera block — in Away3D they belong to
// the runtime viewport, not the asset — so these are that ecosystem's own projection defaults rather than
// invented values: a 60-degree vertical field of view, a 20..3000 clip span, and a unit-scale orthographic
// volume (half-extent 0.5). The off-center defaults are the bounds Away3D substitutes when 5003 omits them.
const AWD2_CAMERA_DEFAULT_BOTTOM = -300;
const AWD2_CAMERA_DEFAULT_FAR = 3000;
const AWD2_CAMERA_DEFAULT_FOV_DEGREES = 60;
const AWD2_CAMERA_DEFAULT_LEFT = -400;
const AWD2_CAMERA_DEFAULT_NEAR = 20;
const AWD2_CAMERA_DEFAULT_ORTHO_HALF_EXTENT = 0.5;
const AWD2_CAMERA_DEFAULT_RIGHT = 400;
const AWD2_CAMERA_DEFAULT_TOP = 300;

// Packs an AWD light's 24-bit 0xrrggbb color into a Flight 0xrrggbbaa one. A light has no alpha channel in
// either model, so the imported color is always fully opaque.
function getAwdLightRgba(rgb: number): number {
  return (((rgb << 8) >>> 0) | 0xff) >>> 0;
}

// Packs an AWD material's diffuse into a Flight 0xrrggbbaa color. AWD stores the color as 24-bit 0xrrggbb
// (property 1) and opacity as a separate float32 alpha (property 10); Flight folds them into one packed
// RGBA. A missing color defaults to white, a missing alpha to fully opaque.
function getAwdDiffuseRgba(color: number | null, alpha: number | null): number {
  const rgb = color ?? 0xffffff;
  const alphaByte = alpha !== null ? Math.max(0, Math.min(255, Math.round(alpha * 255))) : 0xff;
  return (((rgb << 8) >>> 0) | alphaByte) >>> 0;
}

// Packs AWD's specular tuple into ShadedMaterial's single packed-RGBA `specular`, folding Away3D's
// separate strength scalar into the channels (see the resolveAwdMaterial note for why that product is
// exact). Alpha stays opaque: nothing in either backend's shaded path reads the specular alpha channel.
function getAwdSpecularRgba(color: number | null, strength: number): number {
  const rgb = color ?? AWD2_MATERIAL_DEFAULT_SPECULAR_RGB;
  const scale = Math.max(0, Math.min(1, strength));
  const red = Math.round(((rgb >>> 16) & 0xff) * scale);
  const green = Math.round(((rgb >>> 8) & 0xff) * scale);
  const blue = Math.round((rgb & 0xff) * scale);
  return ((red << 24) | (green << 16) | (blue << 8) | 0xff) >>> 0;
}

// Parses a Skeleton block (type 101). Layout:
// name(VarString) → jointCount(uint16) → NumAttrList → per joint:
//   jointId(uint16) → parentId(uint16, 1-based, 0=root) → name(VarString)
//   → matrix4x3(12 × floatSize) → NumAttrList → UserAttrList
function parseSkeletonBlock(
  view: Readonly<DataView>,
  source: Readonly<Uint8Array>,
  start: number,
  end: number,
  matrixWide: boolean,
  diagnostics?: ImportDiagnostic[],
): ParsedSkeleton | null {
  const dv = view as DataView;
  let offset = start;

  if (offset + 2 > end) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Drop,
      'awd2.skeleton-truncated',
      'parseSkeletonBlock',
      {
        field: 'name',
      },
    );
    return null;
  }
  const nameResult = readAwdString(view, source, offset);
  offset = nameResult.end;

  if (offset + 2 > end) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Drop,
      'awd2.skeleton-truncated',
      'parseSkeletonBlock',
      {
        field: 'jointCount',
      },
    );
    return null;
  }
  const jointCount = dv.getUint16(offset, true);
  offset += 2;

  offset = skipAwdAttrList(view, offset, end);

  const joints: ParsedJoint[] = [];
  for (let j = 0; j < jointCount; j++) {
    // Joint ID (sequential, 0-based).
    if (offset + 4 > end) {
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Drop,
        'awd2.skeleton-truncated',
        'parseSkeletonBlock',
        {
          field: 'jointFields',
        },
      );
      return null;
    }
    offset += 2; // skip jointId (implicit from array position)
    const parentIndex = dv.getUint16(offset, true);
    offset += 2;

    if (offset + 2 > end) {
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Drop,
        'awd2.skeleton-truncated',
        'parseSkeletonBlock',
        {
          field: 'jointName',
        },
      );
      return null;
    }
    const jointNameResult = readAwdString(view, source, offset);
    offset = jointNameResult.end;

    const floatSize = matrixWide ? 8 : 4;
    if (offset + 12 * floatSize > end) {
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Drop,
        'awd2.skeleton-truncated',
        'parseSkeletonBlock',
        {
          field: 'jointTransform',
        },
      );
      return null;
    }
    const transformResult = readAwdTransform(view, offset, matrixWide);
    offset = transformResult.end;

    offset = skipAwdAttrList(view, offset, end);
    offset = skipAwdAttrList(view, offset, end);

    joints.push({
      name: jointNameResult.value,
      parentIndex,
      transform: transformResult.transform,
    });
  }

  return { joints, name: nameResult.value };
}

// Parses a SkeletonPose block (type 102). Layout:
// name(VarString) → jointCount(uint16) → NumAttrList → per joint:
//   hasTransform(uint8) → optional matrix4x3(12 × floatSize)
function parseSkeletonPoseBlock(
  view: Readonly<DataView>,
  source: Readonly<Uint8Array>,
  start: number,
  end: number,
  matrixWide: boolean,
  diagnostics?: ImportDiagnostic[],
): ParsedSkeletonPose | null {
  const dv = view as DataView;
  let offset = start;

  if (offset + 2 > end) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Drop,
      'awd2.skeleton-pose-truncated',
      'parseSkeletonPoseBlock',
      {
        field: 'name',
      },
    );
    return null;
  }
  const nameResult = readAwdString(view, source, offset);
  offset = nameResult.end;

  if (offset + 2 > end) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Drop,
      'awd2.skeleton-pose-truncated',
      'parseSkeletonPoseBlock',
      {
        field: 'jointCount',
      },
    );
    return null;
  }
  const jointCount = dv.getUint16(offset, true);
  offset += 2;

  offset = skipAwdAttrList(view, offset, end);

  const jointTransforms: (Float64Array | null)[] = [];
  for (let j = 0; j < jointCount; j++) {
    if (offset + 1 > end) {
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Drop,
        'awd2.skeleton-pose-truncated',
        'parseSkeletonPoseBlock',
        {
          field: 'hasTransform',
        },
      );
      return null;
    }
    const hasTransform = dv.getUint8(offset);
    offset += 1;

    if (hasTransform !== 0) {
      const floatSize = matrixWide ? 8 : 4;
      if (offset + 12 * floatSize > end) {
        reportImportDiagnostic(
          diagnostics,
          ImportDiagnosticSeverity.Drop,
          'awd2.skeleton-pose-truncated',
          'parseSkeletonPoseBlock',
          {
            field: 'jointTransform',
          },
        );
        return null;
      }
      const transformResult = readAwdTransform(view, offset, matrixWide);
      offset = transformResult.end;
      jointTransforms.push(transformResult.transform);
    } else {
      jointTransforms.push(null);
    }
  }

  return { jointTransforms, name: nameResult.value };
}

// Parses a SkeletonAnimation block (type 103). Layout:
// name(VarString) → frameCount(uint16) → NumAttrList → per frame:
//   poseBlockId(uint32) → duration(uint16, milliseconds)
function parseSkeletonAnimationBlock(
  view: Readonly<DataView>,
  source: Readonly<Uint8Array>,
  start: number,
  end: number,
  diagnostics?: ImportDiagnostic[],
): ParsedSkeletonAnimation | null {
  const dv = view as DataView;
  let offset = start;

  if (offset + 2 > end) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Drop,
      'awd2.skeleton-animation-truncated',
      'parseSkeletonAnimationBlock',
      {
        field: 'name',
      },
    );
    return null;
  }
  const nameResult = readAwdString(view, source, offset);
  offset = nameResult.end;

  if (offset + 2 > end) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Drop,
      'awd2.skeleton-animation-truncated',
      'parseSkeletonAnimationBlock',
      {
        field: 'frameCount',
      },
    );
    return null;
  }
  const poseCount = dv.getUint16(offset, true);
  offset += 2;

  offset = skipAwdAttrList(view, offset, end);

  const poses: { duration: number; poseBlockId: number }[] = [];
  for (let p = 0; p < poseCount; p++) {
    if (offset + 4 > end) {
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Drop,
        'awd2.skeleton-animation-truncated',
        'parseSkeletonAnimationBlock',
        {
          field: 'poseBlockId',
        },
      );
      return null;
    }
    const poseBlockId = dv.getUint32(offset, true);
    offset += 4;

    if (offset + 2 > end) {
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Drop,
        'awd2.skeleton-animation-truncated',
        'parseSkeletonAnimationBlock',
        {
          field: 'poseDuration',
        },
      );
      return null;
    }
    const duration = dv.getUint16(offset, true);
    offset += 2;

    poses.push({ duration, poseBlockId });
  }

  return { name: nameResult.value, poses };
}

// Resolves the block-stream buffer to walk: the source unchanged for an uncompressed body, or the 12-byte
// header spliced in front of the inflated body for a compressed one — so the caller's walk is identical
// either way (compression byte rewritten to NONE, body-length field to the inflated length). Returns null
// (after recording a diagnostic) when the compression method has no registered decompressor or the codec fails.
function rehydrateAwdBody(
  input: Uint8Array,
  diagnostics?: ImportDiagnostic[],
): { source: Uint8Array; view: DataView } | null {
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const compression = input[7];
  if (compression === AWD2_COMPRESSION_NONE) return { source: input, view };

  const decompressor = resolveAwdDecompressor(compression);
  if (decompressor === null) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Reject,
      'awd2.compression-no-decompressor',
      'rehydrateAwdBody',
      { compression },
    );
    return null;
  }

  // The header's body-length field is the on-disk (compressed) length; the compressed stream is the bytes
  // from the end of the 12-byte header to there.
  const compressedEnd = Math.min(AWD2_HEADER_BYTES + view.getUint32(8, true), input.byteLength);
  // AWD declares no uncompressed length, so the codec is told 0 and decides for itself whether that
  // matters — DEFLATE grows its own buffer, LZMA reads its stream's own end marker.
  const inflated = decompressor(input.subarray(AWD2_HEADER_BYTES, compressedEnd), 0);
  if (inflated === null) {
    reportImportDiagnostic(
      diagnostics,
      ImportDiagnosticSeverity.Reject,
      'awd2.decompression-failed',
      'rehydrateAwdBody',
      { compression },
    );
    return null;
  }

  const rehydrated = new Uint8Array(AWD2_HEADER_BYTES + inflated.byteLength);
  rehydrated.set(input.subarray(0, AWD2_HEADER_BYTES), 0);
  rehydrated.set(inflated, AWD2_HEADER_BYTES);
  const rehydratedView = new DataView(rehydrated.buffer);
  rehydrated[7] = AWD2_COMPRESSION_NONE;
  rehydratedView.setUint32(8, inflated.byteLength, true);
  return { source: rehydrated, view: rehydratedView };
}

// Bitangent handedness written into every AWD tangent's W (B = W·normal×tangent). AWD carries no W and
// Away3D uses a single mesh-wide handedness (bitangent = normal×tangent in its left-handed space); the
// left→right-handed conversion (negateVec3Z, det = -1) inverts it, making -1 the correct Flight-space
// sign. Kept as one named constant so a render proof against a normal-mapped fixture (shambler) can flip
// it in one place if Away3D's convention proves to be the opposite chirality.
const AWD2_TANGENT_HANDEDNESS = -1;

// Maps AWD's header compression byte onto the algorithm the shared registry is keyed by. The file format
// numbers its methods; the registry names them, so one registration serves every container that carries
// the same algorithm.
function resolveAwdDecompressor(compression: number): Decompressor | null {
  if (compression === AWD2_COMPRESSION_DEFLATE) return getDecompressor(Compression.Deflate);
  return compression === AWD2_COMPRESSION_LZMA ? getDecompressor(Compression.Lzma) : null;
}

// Whether a decomposed pose scale departs from unit within tolerance — the gate for emitting a scale
// animation channel (skipped for the common identity-scale skeletons so clips stay lean).
function hasNonUnitScale(sx: number, sy: number, sz: number): boolean {
  return Math.abs(sx - 1) > 1e-4 || Math.abs(sy - 1) > 1e-4 || Math.abs(sz - 1) > 1e-4;
}

interface ParsedJoint {
  name: string;
  parentIndex: number;
  transform: Float64Array;
}

interface ParsedSkeleton {
  joints: ParsedJoint[];
  name: string;
}

interface ParsedSkeletonAnimation {
  name: string;
  poses: { duration: number; poseBlockId: number }[];
}

interface ParsedSkeletonPose {
  jointTransforms: (Float64Array | null)[];
  name: string;
}

// Whether a CORE block type is consumed by a LATER walk rather than this one. Skeleton poses and skeleton
// animations are read by buildAwdDocumentAnimations, which re-walks the block stream once the joint nodes
// exist, so the first walk passing over them is deferral and not a gap. Reporting them as unhandled would
// put a false Drop on every skinned AWD file — including ones that import perfectly.
function isAwdBlockHandledLater(blockType: number): boolean {
  return blockType === AWD2_BLOCK_SKELETON_POSE || blockType === AWD2_BLOCK_SKELETON_ANIMATION;
}

// One accumulated light-import drop: total `count` plus the first offender's `detail`, keyed by kind — a
// file with fifty identically-configured lights states each loss once, not fifty times.
interface AwdLightDropTally {
  count: number;
  detail: Record<string, boolean | number | string>;
  kind: string;
  severity: ImportDiagnosticSeverity;
}

// Records one offender against its kind tally, keeping the first offender's detail and bumping the count
// for later ones. Mirrors tallyUnhandledAwdBlock; flushed by flushAwdLightDrops.
function tallyAwdLightDrop(
  tallies: Map<string, AwdLightDropTally>,
  severity: ImportDiagnosticSeverity,
  kind: string,
  firstDetail: Record<string, boolean | number | string>,
): void {
  const existing = tallies.get(kind);
  if (existing === undefined) tallies.set(kind, { count: 1, detail: firstDetail, kind, severity });
  else existing.count++;
}

// Emits one crumb per accumulated light-drop kind, with buildAwdDocumentLights as the origin — the
// function that detects and reports each of these losses.
function flushAwdLightDrops(tallies: Readonly<Map<string, AwdLightDropTally>>, diagnostics?: ImportDiagnostic[]): void {
  for (const tally of tallies.values()) {
    reportImportDiagnostic(diagnostics, tally.severity, tally.kind, 'buildAwdDocumentLights', {
      ...tally.detail,
      count: tally.count,
    });
  }
}

// Whether the file's light pickers scope lighting in a way Flight's scene-wide light set cannot express.
// Away3D assigns a picker per MATERIAL, so a file can light one material with a subset of its lights;
// Flight passes one light set to a whole draw. The scoping is representable only when every picker selects
// exactly the full set of lights the file declares — then "each material's lights" and "the scene's lights"
// are the same set and nothing is lost.
//
// A file with NO picker at all is not a loss and reports nothing: it expressed no scoping to drop, and the
// document's light table is inert — the caller reads it and chooses what to draw with, so an unpicked
// light lights nothing until someone asks it to.
function isAwdLightScopeDropped(
  lightBlockIds: ReadonlySet<number>,
  pickers: Readonly<Map<number, ParsedLightPicker>>,
): boolean {
  if (lightBlockIds.size === 0) return false;
  for (const picker of pickers.values()) {
    const picked = new Set(picker.lightIds);
    if (picked.size !== lightBlockIds.size) return true;
    for (const id of lightBlockIds) if (!picked.has(id)) return true;
  }
  return false;
}

// Records one unhandled block against its (namespace, blockType) bucket, keeping the first block id seen.
function tallyUnhandledAwdBlock(
  tally: Map<string, { blockType: number; count: number; firstBlockId: number; namespace: number }>,
  namespace: number,
  blockType: number,
  blockId: number,
): void {
  const key = `${namespace}:${blockType}`;
  const entry = tally.get(key);
  if (entry === undefined) {
    tally.set(key, { blockType, count: 1, firstBlockId: blockId, namespace });
    return;
  }
  entry.count++;
}
