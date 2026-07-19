import type {
  DepthMaterial,
  EmissiveMaterial,
  MatcapMaterial,
  NormalMaterial,
  ToonMaterial,
  UnlitMaterial,
  VertexColorMaterial,
  WireframeMaterial,
} from '@flighthq/types';
import {
  DepthMaterialKind,
  EmissiveMaterialKind,
  MatcapMaterialKind,
  NormalMaterialKind,
  ToonMaterialKind,
  UnlitMaterialKind,
  VertexColorMaterialKind,
  WireframeMaterialKind,
} from '@flighthq/types';

import { createSurfaceMaterial } from './surfaceMaterial';

// Depth-output pass material. `near`/`far` default to a unit range; the depth pass overrides
// them with the camera's range when used as pass infrastructure.
export function createDepthMaterial(opts?: Readonly<Partial<DepthMaterial>>): DepthMaterial {
  const material = createSurfaceMaterial(DepthMaterialKind) as DepthMaterial;
  material.far = opts?.far ?? 1;
  material.near = opts?.near ?? 0;
  return material;
}

// Self-illuminating, lighting-independent material. `emissive` defaults to white,
// `emissiveStrength` to 1 (> 1 drives bloom on GPU backends), the map to null.
export function createEmissiveMaterial(opts?: Readonly<Partial<EmissiveMaterial>>): EmissiveMaterial {
  const material = createSurfaceMaterial(EmissiveMaterialKind) as EmissiveMaterial;
  material.emissive = opts?.emissive ?? 0xffffffff;
  material.emissiveMap = opts?.emissiveMap ?? null;
  material.emissiveStrength = opts?.emissiveStrength ?? 1;
  return material;
}

// Material-capture (matcap) material: a prebaked lit sphere sampled by the view-space normal.
// `matcap` defaults to null, `tint` to white. Lighting-independent.
export function createMatcapMaterial(opts?: Readonly<Partial<MatcapMaterial>>): MatcapMaterial {
  const material = createSurfaceMaterial(MatcapMaterialKind) as MatcapMaterial;
  material.matcap = opts?.matcap ?? null;
  material.tint = opts?.tint ?? 0xffffffff;
  return material;
}

// Normal-output pass material. `normalMap` defaults to null, `normalScale` to 1.
export function createNormalMaterial(opts?: Readonly<Partial<NormalMaterial>>): NormalMaterial {
  const material = createSurfaceMaterial(NormalMaterialKind) as NormalMaterial;
  material.normalMap = opts?.normalMap ?? null;
  material.normalScale = opts?.normalScale ?? 1;
  return material;
}

// Cel-shaded material: diffuse N·L quantized through a 1D ramp into stepped bands. `baseColor`
// defaults to white, maps to null, `steps` to 3 (the band count used when no ramp is bound).
export function createToonMaterial(opts?: Readonly<Partial<ToonMaterial>>): ToonMaterial {
  const material = createSurfaceMaterial(ToonMaterialKind) as ToonMaterial;
  material.baseColor = opts?.baseColor ?? 0xffffffff;
  material.baseColorMap = opts?.baseColorMap ?? null;
  material.ramp = opts?.ramp ?? null;
  material.steps = opts?.steps ?? 3;
  return material;
}

// Lighting-independent flat-color material. `baseColor` defaults to white, `baseColorMap` and
// `baseColorVideoMap` to null. Full fidelity on every backend including Canvas2D; a bound
// `baseColorVideoMap` (live video stream) is sampled only on the GL backend today.
export function createUnlitMaterial(opts?: Readonly<Partial<UnlitMaterial>>): UnlitMaterial {
  const material = createSurfaceMaterial(UnlitMaterialKind) as UnlitMaterial;
  material.baseColor = opts?.baseColor ?? 0xffffffff;
  material.baseColorMap = opts?.baseColorMap ?? null;
  material.baseColorVideoMap = opts?.baseColorVideoMap ?? null;
  return material;
}

// Uses the mesh's `color0` vertex attribute as unlit surface color. `tint` defaults to white.
export function createVertexColorMaterial(opts?: Readonly<Partial<VertexColorMaterial>>): VertexColorMaterial {
  const material = createSurfaceMaterial(VertexColorMaterialKind) as VertexColorMaterial;
  material.tint = opts?.tint ?? 0xffffffff;
  return material;
}

// Edge-only debug material. `color` defaults to white, `thickness` to 1 pixel. No maps.
export function createWireframeMaterial(opts?: Readonly<Partial<WireframeMaterial>>): WireframeMaterial {
  const material = createSurfaceMaterial(WireframeMaterialKind) as WireframeMaterial;
  material.color = opts?.color ?? 0xffffffff;
  material.thickness = opts?.thickness ?? 1;
  return material;
}
