import { createAabb, createBoundingSphere, setBoundingSphereFromAabb } from '@flighthq/geometry';
import { selectScene3DForwardLights } from '@flighthq/lighting';
import { getNodeWorldMatrix4 } from '@flighthq/node';
import { packScene3DLightBlock } from '@flighthq/render';
import { getNode3DWorldBounds } from '@flighthq/scene3d';
import type {
  Mesh,
  Scene3DForwardLightSelection,
  Scene3DLightBlock,
  Scene3DLightsLike,
  Scene3DRenderList,
  WgpuRenderState,
  WgpuScene3DForwardLightList,
} from '@flighthq/types';
import { SCENE_LIGHT_BLOCK_FLOATS } from '@flighthq/types';

// WebGPU twin of prepareGlScene3DForwardLights: rank point and spot lights at each visible mesh's
// world-space bounding sphere, pack the nearest/contributing four of each family, and deduplicate
// identical stable index tuples so coherent meshes retain material bind runs.
export function prepareWgpuScene3DForwardLights(
  state: WgpuRenderState,
  sceneRenderList: Readonly<Scene3DRenderList>,
  lights: Readonly<Scene3DLightsLike>,
): WgpuScene3DForwardLightList {
  const prepared = ensurePrepared(state);
  const out = prepared.list;
  prepared.blockCount = 0;
  out.meshLightBlocks.length = sceneRenderList.meshCount;
  out.meshCount = sceneRenderList.meshCount;

  for (let meshIndex = 0; meshIndex < sceneRenderList.meshCount; meshIndex++) {
    setMeshWorldBoundingSphere(sceneRenderList.visibleMeshes[meshIndex]);
    selectScene3DForwardLights(prepared.selection, lights, scratchWorldSphere);
    let blockIndex = findPreparedBlock(prepared, prepared.selection.indices);
    if (blockIndex < 0) {
      blockIndex = prepared.blockCount++;
      const block = ensurePreparedBlock(prepared, blockIndex);
      copyIndices(block.indices, prepared.selection.indices);
      selectedLights.ambient = lights.ambient;
      selectedLights.directional = lights.directional;
      selectedLights.hemisphere = lights.hemisphere;
      selectedLights.point = prepared.selection.point;
      selectedLights.spot = prepared.selection.spot;
      packScene3DLightBlock(block.lights, selectedLights);
    }
    out.meshLightBlocks[meshIndex] = prepared.blocks[blockIndex].lights;
  }
  return out;
}

function createLightBlock(): Scene3DLightBlock {
  return {
    ambientCount: 0,
    data: new Float32Array(SCENE_LIGHT_BLOCK_FLOATS),
    directionalCount: 0,
    hemisphereCount: 0,
    pointCount: 0,
    spotCount: 0,
    version: 0,
  };
}

function ensurePrepared(state: WgpuRenderState): Prepared {
  let prepared = preparedByState.get(state);
  if (prepared === undefined) {
    prepared = {
      blockCount: 0,
      blocks: [],
      list: { meshCount: 0, meshLightBlocks: [] },
      selection: { indices: [], point: [], spot: [] },
    };
    preparedByState.set(state, prepared);
  }
  return prepared;
}

function ensurePreparedBlock(prepared: Prepared, index: number): PreparedBlock {
  let block = prepared.blocks[index];
  if (block === undefined) {
    block = { indices: [], lights: createLightBlock() };
    prepared.blocks[index] = block;
  }
  return block;
}

function findPreparedBlock(prepared: Readonly<Prepared>, indices: readonly number[]): number {
  for (let blockIndex = 0; blockIndex < prepared.blockCount; blockIndex++) {
    const candidate = prepared.blocks[blockIndex].indices;
    if (candidate.length !== indices.length) continue;
    let equal = true;
    for (let index = 0; index < indices.length; index++) {
      if (candidate[index] !== indices[index]) {
        equal = false;
        break;
      }
    }
    if (equal) return blockIndex;
  }
  return -1;
}

function copyIndices(out: number[], source: readonly number[]): void {
  out.length = source.length;
  for (let index = 0; index < source.length; index++) out[index] = source[index];
}

function setMeshWorldBoundingSphere(mesh: Readonly<Mesh>): void {
  getNode3DWorldBounds(scratchWorldBounds, mesh);
  setBoundingSphereFromAabb(scratchWorldSphere, scratchWorldBounds);
  if (scratchWorldSphere.radius >= 0) return;
  const world = getNodeWorldMatrix4(mesh).m;
  scratchWorldSphere.center.x = world[12];
  scratchWorldSphere.center.y = world[13];
  scratchWorldSphere.center.z = world[14];
  scratchWorldSphere.radius = 0;
}

interface PreparedBlock {
  indices: number[];
  lights: Scene3DLightBlock;
}
interface Prepared {
  blockCount: number;
  blocks: PreparedBlock[];
  list: WgpuScene3DForwardLightList;
  selection: Scene3DForwardLightSelection;
}

const preparedByState = new WeakMap<WgpuRenderState, Prepared>();
const scratchWorldBounds = createAabb();
const scratchWorldSphere = createBoundingSphere();
const selectedLights: Scene3DLightsLike = {
  ambient: null,
  directional: null,
  hemisphere: [],
  point: [],
  spot: [],
};
