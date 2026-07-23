// The minimal handoff every mesh-material family shares between a renderer's bind() and draw(). bind
// compiles/selects the family's program (extending this base with its own material uniform
// locations) and stores it on the scene runtime's activeMeshProgram slot; draw reads it back to set
// the per-draw model/normal matrices and issue the indexed draw. The three locations here are the
// ones every family's vertex stage needs (model + normal matrix + view-projection); a family program
// interface extends GlMeshProgram with whatever fragment/material uniforms it additionally binds.
export interface GlMeshProgram {
  // The per-object opacity uniform location, resolved lazily on first draw and cached: undefined = not
  // yet resolved, null = this program's fragment shader has no u_objectAlpha (silent no-op), a location
  // = present (drawGlMeshSubset uploads proxy.alpha to it). Lazy so any family whose fragment stage
  // declares u_objectAlpha honors node opacity with no per-family factory edit.
  locObjectAlpha?: WebGLUniformLocation | null;
  // The u_jointTexture bone-palette sampler location — present (and non-null) only on a HAS_SKIN
  // variant, so draw uploads and binds the skin palette data texture exactly when the compiled program
  // consumes it. Optional because families not yet wired for GPU skinning omit it entirely (their
  // skinned meshes draw rigid). The palette is an RGBA32F texture read via texelFetch, not a uniform
  // array, so the joint count is bounded by MAX_TEXTURE_SIZE rather than the vertex-uniform budget.
  locJointTexture?: WebGLUniformLocation | null;
  locModel: WebGLUniformLocation | null;
  locNormalMatrix: WebGLUniformLocation | null;
  // The u_uvTransform mat3 location, resolved lazily by bindGlUvTransform (undefined = unresolved,
  // null = a HAS_UV_TRANSFORM-less variant that omits the uniform → cheap no-op, a location = present).
  // Lazy like locObjectAlpha so only a material whose primary texture is non-identity ever binds it.
  locUvTransform?: WebGLUniformLocation | null;
  locViewProjection: WebGLUniformLocation | null;
  program: WebGLProgram;
}
