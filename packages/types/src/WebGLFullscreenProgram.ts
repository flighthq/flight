// A compiled fullscreen-pass program: the clip-space quad vertex shader linked to a fragment shader,
// with its attribute and sampler uniform locations resolved. The substrate-level primitive that
// filter and effect recipes draw through. `textures` holds the `u_texture0..N-1` sampler locations
// for the N-input pass; `texture` aliases textures[0] for the common single-input case.
export interface GlFullscreenProgram {
  readonly program: WebGLProgram;
  readonly locPosition: number;
  readonly locTexCoord: number;
  readonly texture: WebGLUniformLocation;
  readonly textures: ReadonlyArray<WebGLUniformLocation>;
}
