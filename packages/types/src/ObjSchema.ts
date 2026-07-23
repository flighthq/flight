// Wavefront OBJ/MTL wire-format types — the subset @flighthq/scene-formats imports. These are
// format-internal: only `ObjMaterialLibrary` is re-exported from the package barrel (it is the
// public input shape of `createSceneFromObj`); the rest stay module-internal.

// A single material parsed from a `.mtl` file.
export interface ObjMaterial {
  // Ambient color (Ka), defaults to [0, 0, 0].
  ambient: readonly [number, number, number];
  // Diffuse color (Kd), defaults to [0.8, 0.8, 0.8].
  diffuse: readonly [number, number, number];
  // Dissolve / opacity (d), 1 = fully opaque.
  dissolve: number;
  // Illumination model (illum), 0–10 per the MTL spec.
  illumination: number;
  // Ambient texture map file name (map_Ka), null when absent.
  mapAmbient: string | null;
  // Bump/normal map file name (map_Bump / bump), null when absent.
  mapBump: string | null;
  // Diffuse texture map file name (map_Kd), null when absent.
  mapDiffuse: string | null;
  // Specular texture map file name (map_Ks), null when absent.
  mapSpecular: string | null;
  // Material name as declared by `newmtl`.
  name: string;
  // Specular color (Ks), defaults to [0, 0, 0].
  specular: readonly [number, number, number];
  // Specular exponent (Ns), defaults to 0.
  specularExponent: number;
}

// A parsed `.mtl` file: a name-keyed map of materials.
export interface ObjMaterialLibrary {
  materials: ReadonlyMap<string, ObjMaterial>;
}
