import type { StandardPbrMaterial, TransmissionVolumePbrMaterial } from '@flighthq/types';

import { createTransmissionVolumePbrMaterial } from './pbrExtensionMaterials';
import { createStandardPbrMaterial } from './pbrMaterials';

// Named presets for common real-world materials using glTF metallic-roughness PBR values.
// These are thin wrappers over `createStandardPbrMaterial` / `createTransmissionVolumePbrMaterial`
// with canonical default parameters. Each function is individually tree-shakable.
//
// IOR and specular-tint values follow the glTF PBR extensions specification and standard
// material-science references (BRDF Explorer, Substance Painter's material presets, etc.).

// Brushed aluminum: moderate roughness, fully metallic, warm gray base.
// Metallic: 1 · roughness: 0.35 · baseColor: 0xB0B0B0
export function createAluminumStandardPbrMaterial(opts?: Readonly<Partial<StandardPbrMaterial>>): StandardPbrMaterial {
  return createStandardPbrMaterial({
    baseColor: 0xb0b0b0ff,
    metallic: 1,
    roughness: 0.35,
    ...opts,
  });
}

// Solid carbon / black matte: very dark, dielectric, rough.
// Metallic: 0 · roughness: 0.95 · baseColor: 0x1A1A1A
export function createCarbonStandardPbrMaterial(opts?: Readonly<Partial<StandardPbrMaterial>>): StandardPbrMaterial {
  return createStandardPbrMaterial({
    baseColor: 0x1a1a1aff,
    metallic: 0,
    roughness: 0.95,
    ...opts,
  });
}

// Clear glass preset (use with TransmissionVolumePbrMaterial for transmission).
// Metallic: 0 · roughness: 0.0 · IOR: 1.5 · transmission: 1 · baseColor: white.
export function createGlassTransmissionVolumePbrMaterial(
  opts?: Readonly<Partial<TransmissionVolumePbrMaterial>>,
): TransmissionVolumePbrMaterial {
  return createTransmissionVolumePbrMaterial({
    ior: 1.5,
    transmission: 1,
    ...opts,
  });
}

// Gold: fully metallic, moderate roughness, warm saturated base color.
// Metallic: 1 · roughness: 0.25 · baseColor: 0xFFD700 (gold yellow in sRGB)
export function createGoldStandardPbrMaterial(opts?: Readonly<Partial<StandardPbrMaterial>>): StandardPbrMaterial {
  return createStandardPbrMaterial({
    baseColor: 0xffd700ff,
    metallic: 1,
    roughness: 0.25,
    ...opts,
  });
}

// Iron / cast iron: metallic, moderately rough, dark gray.
// Metallic: 1 · roughness: 0.7 · baseColor: 0x444444
export function createIronStandardPbrMaterial(opts?: Readonly<Partial<StandardPbrMaterial>>): StandardPbrMaterial {
  return createStandardPbrMaterial({
    baseColor: 0x444444ff,
    metallic: 1,
    roughness: 0.7,
    ...opts,
  });
}

// Marble: dielectric, very smooth, white with a hint of gray.
// Metallic: 0 · roughness: 0.05 · baseColor: 0xF5F5F5
export function createMarbleStandardPbrMaterial(opts?: Readonly<Partial<StandardPbrMaterial>>): StandardPbrMaterial {
  return createStandardPbrMaterial({
    baseColor: 0xf5f5f5ff,
    metallic: 0,
    roughness: 0.05,
    ...opts,
  });
}

// Hard glossy plastic: dielectric, smooth, neutral.
// Metallic: 0 · roughness: 0.05 · baseColor: 0xFFFFFF (caller supplies tint via baseColor override)
export function createPlasticStandardPbrMaterial(opts?: Readonly<Partial<StandardPbrMaterial>>): StandardPbrMaterial {
  return createStandardPbrMaterial({
    baseColor: 0xffffffff,
    metallic: 0,
    roughness: 0.05,
    ...opts,
  });
}

// Matte rubber: dielectric, very rough, dark.
// Metallic: 0 · roughness: 0.9 · baseColor: 0x1C1C1C
export function createRubberStandardPbrMaterial(opts?: Readonly<Partial<StandardPbrMaterial>>): StandardPbrMaterial {
  return createStandardPbrMaterial({
    baseColor: 0x1c1c1cff,
    metallic: 0,
    roughness: 0.9,
    ...opts,
  });
}

// Silver: fully metallic, polished.
// Metallic: 1 · roughness: 0.1 · baseColor: 0xC0C0C0
export function createSilverStandardPbrMaterial(opts?: Readonly<Partial<StandardPbrMaterial>>): StandardPbrMaterial {
  return createStandardPbrMaterial({
    baseColor: 0xc0c0c0ff,
    metallic: 1,
    roughness: 0.1,
    ...opts,
  });
}

// Skin (light tone): dielectric, slight roughness, warm pinkish base.
// Metallic: 0 · roughness: 0.4 · baseColor: 0xFFCC99 (a neutral Caucasian tone in sRGB)
export function createSkinStandardPbrMaterial(opts?: Readonly<Partial<StandardPbrMaterial>>): StandardPbrMaterial {
  return createStandardPbrMaterial({
    baseColor: 0xffcc99ff,
    metallic: 0,
    roughness: 0.4,
    ...opts,
  });
}

// Wood (unfinished): dielectric, rough, medium brown.
// Metallic: 0 · roughness: 0.8 · baseColor: 0x8B5A2B
export function createWoodStandardPbrMaterial(opts?: Readonly<Partial<StandardPbrMaterial>>): StandardPbrMaterial {
  return createStandardPbrMaterial({
    baseColor: 0x8b5a2bff,
    metallic: 0,
    roughness: 0.8,
    ...opts,
  });
}
