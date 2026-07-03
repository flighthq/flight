import type { LinearColor } from '@flighthq/materials';
import { unpackColorToLinear } from '@flighthq/materials';
import type {
  Camera,
  GlMeshMaterialRenderer,
  GlRenderState,
  Material,
  MeshGeometry,
  SceneLightBlock,
  SceneRenderProxy,
  TransmissionVolumePbrMaterial,
} from '@flighthq/types';
import { TransmissionVolumePbrMaterialKind } from '@flighthq/types';

import { bindGlMeshLightBlock } from './glLitProgram';
import { registerGlMeshMaterialRenderer } from './glMeshMaterialRegistry';
import { beginGlMeshDraw, drawGlMeshSubset, setGlMeshCameraPosition, setGlMeshViewProjection } from './glMeshProgram';
import { ensureGlPbrProgram } from './glPbrProgramCache';
import { bindGlPbrStandardBlock, buildGlPbrStandardDefineKey } from './glPbrStandardBlock';
import { getGlSceneRuntime } from './glSceneRuntime';

// The built-in TransmissionVolume (KHR_materials_transmission + KHR_materials_volume) forward-lit
// mesh-material renderer for refractive, see-through surfaces (glass, liquid).
//
// APPROXIMATION (not physically refractive yet): a true transmission path needs the Phase-5
// opaque-scene-color capture pass to sample what lies behind the surface and refract it through the
// surface IOR, with Beer-Lambert absorption over the volume `thickness`. Until that pass exists, this
// renderer models transmission cheaply behind `#define TRANSMISSION`: it attenuates the fragment's
// coverage (alpha) by the `transmission` factor so the surface reads as translucent, and tints the lit
// radiance by `attenuationColor`. The surface is therefore drawn as a tinted, partially transparent
// lit shell rather than a refracting lens. `thickness`, `attenuationDistance`, and `ior` are accepted
// on the material but only `transmission`/`attenuationColor` drive the current shader.
//
// bind composes the material's `standard` block through the shared bindGlPbrStandardBlock and uploads
// the transmission factor + linear-decoded attenuationColor. The transmission/thickness maps are
// reserved but not yet sampled. See registerTransmissionVolumePbrGlMaterial.
export const transmissionVolumePbrGlMeshMaterialRenderer: GlMeshMaterialRenderer = {
  bind(
    state: GlRenderState,
    material: Readonly<Material> | null,
    lights: Readonly<SceneLightBlock>,
    camera: Readonly<Camera>,
  ): void {
    const gl = state.gl;
    const transmission = material as Readonly<TransmissionVolumePbrMaterial> | null;
    const standard = transmission !== null ? transmission.standard : null;
    const key = buildGlPbrStandardDefineKey(standard, transmission !== null && transmission.alphaMode === 'mask');
    key.transmissionEnabled = true;
    const program = ensureGlPbrProgram(state, key);
    beginGlMeshDraw(state, program, transmission !== null && transmission.doubleSided);

    setGlMeshViewProjection(gl, program.locViewProjection, camera);
    setGlMeshCameraPosition(gl, program.locCameraPosition, camera);
    bindGlMeshLightBlock(state, program, lights);
    bindGlPbrStandardBlock(state, program, standard);
    gl.uniform1f(program.locAlphaCutoff, transmission !== null ? transmission.alphaCutoff : 0.5);

    if (transmission !== null) {
      unpackColorToLinear(scratchRgba, transmission.attenuationColor);
      gl.uniform1f(program.locTransmission, transmission.transmission);
      gl.uniform3f(program.locAttenuationColor, scratchRgba[0], scratchRgba[1], scratchRgba[2]);
    } else {
      gl.uniform1f(program.locTransmission, 0);
      gl.uniform3f(program.locAttenuationColor, 1, 1, 1);
    }
  },

  draw(state: GlRenderState, proxy: Readonly<SceneRenderProxy>, geometry: Readonly<MeshGeometry>): void {
    const program = getGlSceneRuntime(state).activeMeshProgram;
    if (program === null) return;
    drawGlMeshSubset(state, program, proxy, geometry);
  },
};

// Installs the built-in TransmissionVolume renderer for TransmissionVolumePbrMaterialKind on this
// state. Opt-in (no top-level side effect): drawScene only draws TransmissionVolume subsets once
// this is called.
export function registerTransmissionVolumePbrGlMaterial(state: GlRenderState): void {
  registerGlMeshMaterialRenderer(state, TransmissionVolumePbrMaterialKind, transmissionVolumePbrGlMeshMaterialRenderer);
}

const scratchRgba: LinearColor = [0, 0, 0, 0];
