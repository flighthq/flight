import { getCameraViewProjectionMatrix4 } from '@flighthq/camera';
import { createMatrix4, getMatrix4Position, inverseMatrix4 } from '@flighthq/geometry';
import type { LinearColor } from '@flighthq/materials';
import { unpackColorToLinear } from '@flighthq/materials';
import { bindGlTexture } from '@flighthq/render-gl';
import type {
  Camera,
  GlMeshMaterialRenderer,
  GlRenderState,
  Material,
  MeshGeometry,
  SceneLightBlock,
  SceneRenderProxy,
  StandardPbrMaterial,
} from '@flighthq/types';

import { ensureGlMeshUpload } from './glMeshUpload';
import type { GlPbrDefineKey } from './glPbrPrelude';
import type { GlPbrProgram } from './glPbrProgramCache';
import { ensureGlPbrProgram } from './glPbrProgramCache';
import { getGlSceneRuntime } from './glSceneRuntime';

// The built-in StandardPbr forward-lit mesh-material renderer (GlMeshMaterialRenderer for
// StandardPbrMaterialKind). bind selects the uber-shader variant for the material's maps/alpha mode,
// uploads the shared per-run uniforms (camera view-projection + position, the packed light block),
// and the material's scalar/color uniforms and textures. draw uploads the geometry's GPU buffers
// lazily (cached by geometry.version), sets the per-draw model + normal matrices from the proxy, and
// issues the indexed draw over the proxy's subset with depth-test LESS + depth-write on and back-face
// culling unless the material is double-sided. See registerStandardPbrGlMaterial to install it.
export const standardPbrGlMeshMaterialRenderer: GlMeshMaterialRenderer = {
  bind(
    state: GlRenderState,
    material: Readonly<Material> | null,
    lights: Readonly<SceneLightBlock>,
    camera: Readonly<Camera>,
  ): void {
    const gl = state.gl;
    const pbr = material as Readonly<StandardPbrMaterial> | null;
    const program = ensureGlPbrProgram(state, defineKeyForMaterial(pbr));
    getGlSceneRuntime(state).activePbrProgram = program;

    gl.useProgram(program.program);

    // The render-effect pipeline owns enabling depth + binding the rgba16f scene target; this
    // renderer only fixes the test function/write and per-material cull. Depth state is set here so
    // a caller invoking drawScene without the full pipeline still gets correct occlusion.
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.depthMask(true);

    if (pbr !== null && pbr.doubleSided) {
      gl.disable(gl.CULL_FACE);
    } else {
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);
    }

    bindGlPbrCamera(gl, program, camera);
    bindGlPbrLights(gl, program, lights);
    bindGlPbrMaterialUniforms(state, program, pbr);
  },

  draw(state: GlRenderState, proxy: Readonly<SceneRenderProxy>, geometry: Readonly<MeshGeometry>): void {
    const gl = state.gl;
    const program = getGlSceneRuntime(state).activePbrProgram;
    if (program === null) return;

    gl.uniformMatrix4fv(program.locModel, false, proxy.worldMatrix.m);
    gl.uniformMatrix3fv(program.locNormalMatrix, false, proxy.normalMatrix.m);

    const upload = ensureGlMeshUpload(state, geometry);
    const subset = proxy.subset;

    if (upload.indexBuffer !== null) {
      const elementSize = upload.indexType === gl.UNSIGNED_INT ? 4 : 2;
      gl.drawElements(gl.TRIANGLES, subset.indexCount, upload.indexType, subset.indexOffset * elementSize);
    } else {
      gl.drawArrays(gl.TRIANGLES, subset.indexOffset, subset.indexCount);
    }
  },
};

// The feature define key for a StandardPbr material: which optional maps are present and whether
// alpha-mask cutoff is active. Drives both the program-cache variant and the bound textures.
function defineKeyForMaterial(material: Readonly<StandardPbrMaterial> | null): GlPbrDefineKey {
  return {
    alphaMaskEnabled: material !== null && material.alphaMode === 'mask',
    hasBaseColorMap: material !== null && material.baseColorMap !== null && material.baseColorMap.image !== null,
    hasNormalMap: material !== null && material.normalMap !== null && material.normalMap.image !== null,
  };
}

function bindGlPbrCamera(gl: WebGL2RenderingContext, program: Readonly<GlPbrProgram>, camera: Readonly<Camera>): void {
  const aspect = camera.projection.kind === 'perspective' ? camera.projection.aspect : 1;
  getCameraViewProjectionMatrix4(scratchViewProjection, camera, aspect !== 0 ? aspect : 1);
  gl.uniformMatrix4fv(program.locViewProjection, false, scratchViewProjection.m);

  // Camera world position = translation of the inverse view matrix (view is world->view).
  inverseMatrix4(scratchInverseView, camera.view);
  getMatrix4Position(scratchCameraPosition, scratchInverseView);
  gl.uniform3f(program.locCameraPosition, scratchCameraPosition.x, scratchCameraPosition.y, scratchCameraPosition.z);
}

// Uploads the packed light block to the directional/ambient uniforms. The block layout (std140)
// matches SceneLightBlock.data: directional { direction.xyz @0, _pad, radiance.rgb @4, _pad } then
// ambient { radiance.rgb @8, _pad }. Radiance is already linear, premultiplied by intensity.
function bindGlPbrLights(
  gl: WebGL2RenderingContext,
  program: Readonly<GlPbrProgram>,
  lights: Readonly<SceneLightBlock>,
): void {
  const data = lights.data;
  gl.uniform4f(program.locDirectional, data[0], data[1], data[2], 0);
  gl.uniform4f(program.locDirectionalRadiance, data[4], data[5], data[6], 0);
  gl.uniform3f(program.locAmbientRadiance, data[8], data[9], data[10]);
  gl.uniform1f(program.locDirectionalCount, lights.directionalCount);
  gl.uniform1f(program.locAmbientCount, lights.ambientCount);
}

function bindGlPbrMaterialUniforms(
  state: GlRenderState,
  program: Readonly<GlPbrProgram>,
  material: Readonly<StandardPbrMaterial> | null,
): void {
  const gl = state.gl;
  if (material === null) {
    gl.uniform4f(program.locBaseColor, 1, 1, 1, 1);
    gl.uniform1f(program.locMetallic, 0);
    gl.uniform1f(program.locRoughness, 1);
    gl.uniform1f(program.locNormalScale, 1);
    gl.uniform3f(program.locEmissive, 0, 0, 0);
    gl.uniform1f(program.locEmissiveStrength, 1);
    gl.uniform1f(program.locAlphaCutoff, 0.5);
    return;
  }

  unpackColorToLinear(scratchRgba, material.baseColor);
  gl.uniform4f(program.locBaseColor, scratchRgba[0], scratchRgba[1], scratchRgba[2], scratchRgba[3]);
  gl.uniform1f(program.locMetallic, material.metallic);
  gl.uniform1f(program.locRoughness, material.roughness);
  gl.uniform1f(program.locNormalScale, material.normalScale);

  unpackColorToLinear(scratchRgba, material.emissive);
  gl.uniform3f(program.locEmissive, scratchRgba[0], scratchRgba[1], scratchRgba[2]);
  gl.uniform1f(program.locEmissiveStrength, material.emissiveStrength);
  gl.uniform1f(program.locAlphaCutoff, material.alphaCutoff);

  const baseColorMap = material.baseColorMap;
  if (baseColorMap !== null && baseColorMap.image !== null && baseColorMap.image.source !== null) {
    gl.activeTexture(gl.TEXTURE0);
    bindGlTexture(state, baseColorMap.image.source);
    gl.uniform1i(program.locBaseColorMap, 0);
  }

  const normalMap = material.normalMap;
  if (normalMap !== null && normalMap.image !== null && normalMap.image.source !== null) {
    gl.activeTexture(gl.TEXTURE1);
    bindGlTexture(state, normalMap.image.source);
    gl.uniform1i(program.locNormalMap, 1);
  }
}

const scratchViewProjection = createMatrix4();
const scratchInverseView = createMatrix4();
const scratchCameraPosition = { x: 0, y: 0, z: 0 };
const scratchRgba: LinearColor = [0, 0, 0, 0];
