import { createAabb, createBoundingSphere, setBoundingSphereFromAabb } from '@flighthq/geometry';
import { selectSceneForwardLights } from '@flighthq/lighting';
import { getNodeWorldMatrix4 } from '@flighthq/node';
import { packSceneLightBlock } from '@flighthq/render';
import { getSceneNodeWorldBounds } from '@flighthq/scene';
import type {
  GlRenderState,
  GlSceneForwardLightList,
  Mesh,
  SceneForwardLightSelection,
  SceneLightBlock,
  SceneLightsLike,
  SceneRenderList,
} from '@flighthq/types';
import { SCENE_LIGHT_BLOCK_FLOATS } from '@flighthq/types';

// Prepares one punctual-light block for each visible mesh after prepareSceneRender. The selection is
// opt-in and explicit: scenes within the forward budget need not import or run it. Point and spot
// lights compete by estimated contribution at each mesh's world bounding sphere; directional,
// ambient, and hemisphere terms remain scene-global.
//
// Identical stable light-index tuples reuse the same packed block, so spatially coherent meshes keep
// material bind runs. The returned list, all blocks, selection arrays, and bounds are state-owned
// scratch; steady-state calls allocate nothing and the result must not be retained past the draw.
export function prepareGlSceneForwardLights(
  state: GlRenderState,
  sceneRenderList: Readonly<SceneRenderList>,
  lights: Readonly<SceneLightsLike>,
): GlSceneForwardLightList {
  const prepared = ensurePreparedGlSceneForwardLights(state);
  const out = prepared.list;
  prepared.blockCount = 0;
  out.meshLightBlocks.length = sceneRenderList.meshCount;
  out.meshCount = sceneRenderList.meshCount;

  for (let meshIndex = 0; meshIndex < sceneRenderList.meshCount; meshIndex++) {
    const mesh = sceneRenderList.visibleMeshes[meshIndex];
    setMeshWorldBoundingSphere(mesh);
    selectSceneForwardLights(prepared.selection, lights, scratchWorldSphere);

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
      packSceneLightBlock(block.lights, selectedLights);
    }
    out.meshLightBlocks[meshIndex] = prepared.blocks[blockIndex].lights;
  }

  return out;
}

function copyIndices(out: number[], indices: readonly number[]): void {
  out.length = indices.length;
  for (let i = 0; i < indices.length; i++) out[i] = indices[i];
}

function createSceneLightBlock(): SceneLightBlock {
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

function ensurePreparedBlock(prepared: PreparedGlSceneForwardLights, index: number): PreparedForwardLightBlock {
  let block = prepared.blocks[index];
  if (block === undefined) {
    block = { indices: [], lights: createSceneLightBlock() };
    prepared.blocks[index] = block;
  }
  return block;
}

function ensurePreparedGlSceneForwardLights(state: GlRenderState): PreparedGlSceneForwardLights {
  let prepared = preparedGlSceneForwardLights.get(state);
  if (prepared === undefined) {
    prepared = {
      blockCount: 0,
      blocks: [],
      list: { meshCount: 0, meshLightBlocks: [] },
      selection: { indices: [], point: [], spot: [] },
    };
    preparedGlSceneForwardLights.set(state, prepared);
  }
  return prepared;
}

function findPreparedBlock(prepared: Readonly<PreparedGlSceneForwardLights>, indices: readonly number[]): number {
  for (let blockIndex = 0; blockIndex < prepared.blockCount; blockIndex++) {
    const candidate = prepared.blocks[blockIndex].indices;
    if (candidate.length !== indices.length) continue;
    let equal = true;
    for (let i = 0; i < indices.length; i++) {
      if (candidate[i] !== indices[i]) {
        equal = false;
        break;
      }
    }
    if (equal) return blockIndex;
  }
  return -1;
}

function setMeshWorldBoundingSphere(mesh: Readonly<Mesh>): void {
  getSceneNodeWorldBounds(scratchWorldBounds, mesh);
  setBoundingSphereFromAabb(scratchWorldSphere, scratchWorldBounds);
  if (scratchWorldSphere.radius < 0) {
    const world = getNodeWorldMatrix4(mesh).m;
    scratchWorldSphere.center.x = world[12];
    scratchWorldSphere.center.y = world[13];
    scratchWorldSphere.center.z = world[14];
    scratchWorldSphere.radius = 0;
  }
}

interface PreparedForwardLightBlock {
  indices: number[];
  lights: SceneLightBlock;
}

interface PreparedGlSceneForwardLights {
  blockCount: number;
  blocks: PreparedForwardLightBlock[];
  list: GlSceneForwardLightList;
  selection: SceneForwardLightSelection;
}

const preparedGlSceneForwardLights = new WeakMap<GlRenderState, PreparedGlSceneForwardLights>();
const scratchWorldBounds = createAabb();
const scratchWorldSphere = createBoundingSphere();
const selectedLights: SceneLightsLike = {
  ambient: null,
  directional: null,
  hemisphere: [],
  point: [],
  spot: [],
};
