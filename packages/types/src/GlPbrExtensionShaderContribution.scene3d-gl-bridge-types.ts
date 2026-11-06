// GLSL contributed by one registered PBR extension. The core PBR shader owns the surface variables
// named in each stage's contract and composes contributions in descriptor order.
export interface GlPbrExtensionShaderContribution {
  // Statements run after the standard surface has produced normal, viewDir, roughness, metallic,
  // albedo, f0, and diffuseColor. A contribution may update those shared surface values; an
  // extension-only value (for example a clearcoat normal) stays in that extension's punctual/IBL
  // contribution so it does not silently replace the base surface used by every later lobe.
  applySurface: string;
  // Statements run inside the IBL path with ambient, N, V, tangentDir, bitangentDir, rough, F0,
  // diffuseColor, and occ in scope. Names introduced here must be extension-prefixed because every
  // registered contribution is spliced into this same function in descriptor order.
  contributeIbl: string;
  // Statements run inside the punctual-light path with direct, N, V, tangentDir, bitangentDir, L,
  // lightColor, halfVec, nDotL/nDotV/nDotH/vDotH, roughness, metallic, f0, and diffuseColor in scope.
  // The block runs for directional, point, and spot lights; lobe math must not depend on one caller.
  contributePunctual: string;
  // Statements run after standard radiance/emissive evaluation with radiance and alpha in scope.
  finalize: string;
  // Uniform declarations and helper functions inserted before the core shader functions.
  fragmentDeclarations: string;
  fragmentFunctions: string;
  // Stable identity for this contribution's source variant, including active map slots.
  key: string;
  // True when bind() samples the caller-owned transmission scene-color input.
  samplesTransmissionSceneColor?: boolean;
  // Number of fragment texture units bind() consumes for this source variant.
  textureCount: number;
}
