import { createTransform3D } from '@flighthq/geometry/contract';
import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import type {
  Awd2BlockHandler,
  Awd2ParsedContainer,
  Awd2ParsedMeshInstance,
  Awd2ParseState,
  ImportDiagnostic,
  Scene3DDocumentMesh,
  Scene3DDocumentNode,
} from '@flighthq/types/contract';
import { ImportDiagnosticSeverity, MeshKind, Node3DKind } from '@flighthq/types/contract';

import { awdTransformToTransform3D, readAwdString, readAwdTransform, skipAwdAttrList } from './awd2Reader.ts';
import { AWD2_BLOCK_CONTAINER, AWD2_BLOCK_MESH_INSTANCE, AWD2_BUILD_PHASE_SCENE_STRUCTURE } from './awd2Schema.ts';

// Containers and mesh instances: the scene hierarchy itself. This is the handler that turns parsed blocks
// into document nodes and wires their parenting.
//
// It reads geometry and material content through the shared state rather than importing either handler,
// which is what lets it be registered without them: a mesh instance whose geometry block nobody parsed
// becomes a bare node, and one whose material nobody resolved gets an empty material list. Both are the
// same graceful miss a file referencing an absent block would produce.

// Containers: the file's group nodes. Built first, so a mesh instance parented to one finds its node.
export const awd2ContainerHandler: Awd2BlockHandler = {
  blockTypes: [AWD2_BLOCK_CONTAINER],
  buildPhase: AWD2_BUILD_PHASE_SCENE_STRUCTURE,
  parse(state, block) {
    const container = parseContainerBlock(
      block.view,
      block.source,
      block.dataStart,
      block.dataEnd,
      block.matrixWide,
      state.diagnostics,
    );
    if (container !== null) state.containers.set(block.blockId, container);
  },
  build(state) {
    for (const [blockId, container] of state.containers) {
      const nodeIndex = state.document.nodes.length;
      state.document.nodes.push({
        children: [],
        kind: Node3DKind,
        name: container.name || undefined,
        transform: awdTransformToTransform3D(container.transform),
      });
      state.nodeIndexForBlock.set(blockId, nodeIndex);
    }
  },
};

// Mesh instances: the drawable placements, and the parenting pass that seats every node produced so far.
export const awd2MeshInstanceHandler: Awd2BlockHandler = {
  blockTypes: [AWD2_BLOCK_MESH_INSTANCE],
  buildPhase: AWD2_BUILD_PHASE_SCENE_STRUCTURE,
  parse(state, block) {
    const meshInstance = parseMeshInstanceBlock(
      block.view,
      block.source,
      block.dataStart,
      block.dataEnd,
      block.matrixWide,
      state.diagnostics,
    );
    if (meshInstance !== null) state.meshInstances.set(block.blockId, meshInstance);
  },
  build(state) {
    buildAwdMeshInstanceNodes(state);
    parentAwdSceneNodes(state);
  },
};

// Parses a Container block (type 22). AWD Scene3DHeader layout:
// parentId(uint32) → matrix4x3(12 × floatSize) → name(VarString) → NumAttrList → UserAttrList
function parseContainerBlock(
  view: Readonly<DataView>,
  source: Readonly<Uint8Array>,
  start: number,
  end: number,
  matrixWide: boolean,
  diagnostics?: ImportDiagnostic[],
): Awd2ParsedContainer | null {
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
): Awd2ParsedMeshInstance | null {
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

// Turns the parsed mesh instances into document nodes and meshes.
//
// Every cross-family read here goes through the shared state rather than an import: geometry through
// `state.geometries`, materials through the resolver the materials handler installed, the skin through
// `state.skinIndex`. A build that registered none of those still produces the hierarchy — bare nodes with
// no meshes — which is the same result a file whose geometry blocks were all missing would give.
function buildAwdMeshInstanceNodes(state: Awd2ParseState): void {
  const { diagnostics, document, nodeIndexForBlock } = state;

  // A material the caller did not register resolves to nothing, so the subset draws untextured rather
  // than the import failing.
  const materialsForSubset = (materialIds: readonly number[], subsetIndex: number): number[] => {
    if (state.resolveMaterial === null) return [];
    const materialId = subsetIndex < materialIds.length ? materialIds[subsetIndex] : 0;
    const index = state.resolveMaterial(materialId);
    return index >= 0 ? [index] : [];
  };

  for (const [blockId, meshInstance] of state.meshInstances) {
    const geometries = state.geometries.get(meshInstance.geometryId);
    const transform = awdTransformToTransform3D(meshInstance.transform);
    let nodeIndex: number;
    if (geometries !== undefined && geometries.length > 0) {
      if (geometries.length === 1) {
        // The single mesh node carries the instance name directly; the multi-geometry branch instead
        // names the wrapping group, whose subset meshes stay anonymous parts.
        const meshIndex = document.meshes.length;
        const mesh: Scene3DDocumentMesh = {
          geometry: geometries[0].geometry,
          materials: materialsForSubset(meshInstance.materialIds, 0),
        };
        if (state.skinIndex !== undefined && geometries[0].skinned) mesh.skin = state.skinIndex;
        document.meshes.push(mesh);
        nodeIndex = document.nodes.length;
        document.nodes.push({
          children: [],
          kind: MeshKind,
          mesh: meshIndex,
          name: meshInstance.name || undefined,
          transform,
        });
      } else {
        nodeIndex = document.nodes.length;
        const group: Scene3DDocumentNode = {
          children: [],
          kind: Node3DKind,
          name: meshInstance.name || undefined,
          transform,
        };
        document.nodes.push(group);
        for (let i = 0; i < geometries.length; i++) {
          const meshIndex = document.meshes.length;
          const mesh: Scene3DDocumentMesh = {
            geometry: geometries[i].geometry,
            materials: materialsForSubset(meshInstance.materialIds, i),
          };
          if (state.skinIndex !== undefined && geometries[i].skinned) mesh.skin = state.skinIndex;
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
        name: meshInstance.name || undefined,
        transform,
      });
      if (meshInstance.geometryId !== 0) {
        reportImportDiagnostic(
          diagnostics,
          ImportDiagnosticSeverity.Recover,
          'awd2.mesh-instance-missing-geometry',
          'parseAwd2',
          { block: blockId, geometry: meshInstance.geometryId },
        );
      }
    }
    nodeIndexForBlock.set(blockId, nodeIndex);
  }
}

// Seats every node the scene-structure pass produced under its declared parent, and promotes the rest to
// scene roots. Runs once both node passes are done, because a container can be parented to a mesh
// instance and vice versa.
function parentAwdSceneNodes(state: Awd2ParseState): void {
  const parented = new Set<number>();
  for (const [blockId, container] of state.containers) {
    parentAwdNode(state, parented, blockId, container.parentId);
  }
  for (const [blockId, meshInstance] of state.meshInstances) {
    parentAwdNode(state, parented, blockId, meshInstance.parentId);
  }
  for (const blockId of state.nodeIndexForBlock.keys()) {
    if (!parented.has(blockId)) state.document.scenes[0].rootNodes.push(state.nodeIndexForBlock.get(blockId)!);
  }
}

// Attaches one block's node to its parent's, when the file named a parent that produced a node. A parent
// block nobody parsed leaves the child unparented, which makes it a scene root rather than losing it.
function parentAwdNode(state: Awd2ParseState, parented: Set<number>, blockId: number, parentId: number): void {
  if (parentId === 0) return;
  const parentIndex = state.nodeIndexForBlock.get(parentId);
  if (parentIndex === undefined) return;
  state.document.nodes[parentIndex].children.push(state.nodeIndexForBlock.get(blockId)!);
  parented.add(blockId);
}
