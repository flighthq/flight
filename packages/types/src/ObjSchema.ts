// Wavefront OBJ/MTL wire-format types — the subset @flighthq/scene3d-formats imports. These are
// format-internal: only `ObjMaterialLibrary` is re-exported from the package barrel (it is the
// public input shape of `createScene3DFromObj`); the rest stay module-internal.

// A single material parsed from a `.mtl` file.
//
// The classic Wavefront block (Ka/Kd/Ks/Ns/d/illum and its maps) is Blinn-Phong by construction. The
// PBR-EXTENSION block below it — the metallic-roughness directives modern exporters write — is the later
// addition, and every one of its fields is nullable so ABSENT stays distinguishable from a stated zero.
// That distinction is load-bearing: it is what decides whether an importer reads the file as Blinn-Phong
// or as metallic-roughness PBR, rather than guessing a roughness from a specular exponent.
//
// `emissive`/`mapEmissive` sit in the extension block by position but are deliberately NOT part of that
// decision — they state a channel both shading models could carry, not a shading model.
export interface ObjMaterial {
  // Ambient color (Ka), defaults to [0, 0, 0].
  ambient: readonly [number, number, number];
  // Anisotropy (aniso), null when absent.
  anisotropy: number | null;
  // Anisotropy rotation (anisor), null when absent.
  anisotropyRotation: number | null;
  // Clearcoat thickness (Pc), null when absent.
  clearcoat: number | null;
  // Clearcoat roughness (Pcr), null when absent.
  clearcoatRoughness: number | null;
  // Diffuse color (Kd), defaults to [0.8, 0.8, 0.8].
  diffuse: readonly [number, number, number];
  // Dissolve / opacity (d), 1 = fully opaque.
  dissolve: number;
  // Emissive color (Ke), null when absent.
  emissive: readonly [number, number, number] | null;
  // Illumination model (illum), 0–10 per the MTL spec.
  illumination: number;
  // Ambient texture map file name (map_Ka), null when absent.
  mapAmbient: string | null;
  // Bump/normal map file name (map_Bump / bump), null when absent.
  mapBump: string | null;
  // Diffuse texture map file name (map_Kd), null when absent.
  mapDiffuse: string | null;
  // Dissolve/opacity texture map file name (map_d), null when absent. A dedicated coverage image,
  // separate from the diffuse map's own alpha channel.
  mapDissolve: string | null;
  // Emissive texture map file name (map_Ke), null when absent.
  mapEmissive: string | null;
  // Metallic texture map file name (map_Pm), null when absent.
  mapMetallic: string | null;
  // Tangent-space normal map file name (norm), null when absent. Distinct from `mapBump`, which is a
  // grayscale height field — this one is a real normal map and binds directly.
  mapNormal: string | null;
  // Roughness texture map file name (map_Pr), null when absent.
  mapRoughness: string | null;
  // Specular texture map file name (map_Ks), null when absent.
  mapSpecular: string | null;
  // Metallic factor (Pm), null when absent.
  metallic: number | null;
  // Material name as declared by `newmtl`.
  name: string;
  // Roughness factor (Pr), null when absent.
  roughness: number | null;
  // Sheen (Ps), null when absent.
  sheen: number | null;
  // Specular color (Ks), defaults to [0, 0, 0].
  specular: readonly [number, number, number];
  // Specular exponent (Ns), defaults to 0.
  specularExponent: number;
}

// A parsed `.mtl` file: a name-keyed map of materials.
export interface ObjMaterialLibrary {
  materials: ReadonlyMap<string, ObjMaterial>;
}
