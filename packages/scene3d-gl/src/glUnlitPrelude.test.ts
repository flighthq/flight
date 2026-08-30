import { createImageResource } from '@flighthq/image/contract';
import {
  getGlRenderStateRuntime,
  registerGlImageTextureResolver,
  registerGlRenderTextureResolver,
} from '@flighthq/render-gl/contract';
import {
  advanceVideoTexture,
  createRenderTexture,
  createTexture,
  createVideoTexture,
} from '@flighthq/texture/contract';
import type { GlUnlitDefineKey, LinearColor } from '@flighthq/types/contract';

import { getGlScene3DRuntime } from './glScene3DRuntime';
import { makeFakeGl2, makeGlScene3DState } from './glScene3DTestHelper';
import {
  bindGlUnlitSurface,
  buildGlUnlitDefineKey,
  compileGlUnlitProgram,
  ensureGlUnlitProgram,
  getGlUnlitFragmentSourceForKey,
  getGlUnlitVertexSourceForKey,
} from './glUnlitPrelude';

const FLAT: GlUnlitDefineKey = {
  alphaMaskEnabled: false,
  hasColorMap: false,
  hasUvTransform: false,
  vertexColor: false,
};
const COLOR: LinearColor = [0.5, 0.25, 0.1, 1];

describe('bindGlUnlitSurface', () => {
  it('uploads the color, intensity, and alpha cutoff', () => {
    const { state, gl } = makeGlScene3DState();
    const program = compileGlUnlitProgram(gl, FLAT);
    bindGlUnlitSurface(state, program, COLOR, 2, null, 0.5);
    expect(gl.calls.some((c) => c.name === 'uniform4f')).toBe(true);
    expect(gl.calls.filter((c) => c.name === 'uniform1f').length).toBeGreaterThanOrEqual(2);
    // No color map → no texture bind.
    expect(gl.calls.some((c) => c.name === 'bindTexture')).toBe(false);
  });

  it('routes a still map through the registered Texture resolver', () => {
    const { state, gl } = makeGlScene3DState();
    const program = compileGlUnlitProgram(gl, { ...FLAT, hasColorMap: true });
    const image = createImageResource(globalThis.document.createElement('img'));
    image.width = 1;
    image.height = 1;
    const texture = createTexture({ dimension: '2d', source: image });
    texture.sampler.mipmaps = false;
    registerGlImageTextureResolver(state);
    getGlRenderStateRuntime(state).context.anisotropyExt = null;

    bindGlUnlitSurface(state, program, COLOR, 1, texture, 0.5);

    expect(gl.calls.some((call) => call.name === 'texImage2D')).toBe(true);
    expect(gl.calls.some((call) => call.name === 'uniform1i')).toBe(true);
  });

  it('routes an unrendered render Texture to the null sentinel without a CPU upload', () => {
    const { state, gl } = makeGlScene3DState();
    const program = compileGlUnlitProgram(gl, { ...FLAT, hasColorMap: true });
    const texture = createRenderTexture({ height: 16, width: 16 });
    texture.sampler.mipmaps = false;
    registerGlRenderTextureResolver(state);
    getGlRenderStateRuntime(state).context.anisotropyExt = null;
    const uploads = gl.calls.filter((call) => call.name === 'texImage2D').length;

    bindGlUnlitSurface(state, program, COLOR, 1, texture, 0.5);

    expect(gl.calls.some((call) => call.name === 'bindTexture' && call.args[1] === null)).toBe(true);
    expect(gl.calls.filter((call) => call.name === 'texImage2D')).toHaveLength(uploads);
    expect(gl.calls.some((call) => call.name === 'uniform1i')).toBe(false);
  });

  it('routes a video-backed Texture through the registered Texture resolver', () => {
    const { state, gl } = makeGlScene3DState();
    const program = compileGlUnlitProgram(gl, { ...FLAT, hasColorMap: true });
    const videoMap = createVideoTexture({
      element: { readyState: 4, videoWidth: 320, videoHeight: 240 } as HTMLVideoElement,
      objectUrl: null,
      ownsElement: false,
    });
    videoMap.sampler.mipmaps = false;
    advanceVideoTexture(videoMap);
    registerGlImageTextureResolver(state);
    registerGlImageTextureResolver(state);
    getGlRenderStateRuntime(state).context.anisotropyExt = null;

    bindGlUnlitSurface(state, program, COLOR, 1, videoMap, 0.5);

    expect(gl.calls.some((c) => c.name === 'uniform4f')).toBe(true);
    expect(gl.calls.some((c) => c.name === 'texImage2D')).toBe(true);
    expect(gl.calls.some((c) => c.name === 'bindTexture')).toBe(true);
    expect(gl.calls.some((c) => c.name === 'uniform1i')).toBe(true);
  });

  it('does not upload a video frame whose source version has not advanced', () => {
    const { state, gl } = makeGlScene3DState();
    const program = compileGlUnlitProgram(gl, { ...FLAT, hasColorMap: true });
    const videoMap = createVideoTexture({
      element: { readyState: 4, videoWidth: 320, videoHeight: 240 } as HTMLVideoElement,
      objectUrl: null,
      ownsElement: false,
    });
    videoMap.sampler.mipmaps = false;
    advanceVideoTexture(videoMap);
    registerGlImageTextureResolver(state);
    registerGlImageTextureResolver(state);
    getGlRenderStateRuntime(state).context.anisotropyExt = null;
    bindGlUnlitSurface(state, program, COLOR, 1, videoMap, 0.5);
    const uploads = gl.calls.filter((c) => c.name === 'texImage2D').length;
    bindGlUnlitSurface(state, program, COLOR, 1, videoMap, 0.5);
    expect(gl.calls.filter((c) => c.name === 'texImage2D').length).toBe(uploads);
  });
});

describe('buildGlUnlitDefineKey', () => {
  it('produces distinct stable strings per flag set', () => {
    expect(buildGlUnlitDefineKey(FLAT)).toBe('-----');
    expect(
      buildGlUnlitDefineKey({ alphaMaskEnabled: true, hasColorMap: true, hasUvTransform: true, vertexColor: true }),
    ).toBe('mcvu-');
    expect(buildGlUnlitDefineKey({ ...FLAT, vertexColor: true })).toBe('--v--');
  });

  it('encodes a non-identity uv transform with a u slot and keys it distinctly', () => {
    expect(buildGlUnlitDefineKey({ ...FLAT, hasUvTransform: true })).toBe('---u-');
    expect(buildGlUnlitDefineKey({ ...FLAT, hasUvTransform: true })).not.toBe(buildGlUnlitDefineKey(FLAT));
  });

  it('encodes the skinned variant with a trailing k and keys it distinctly', () => {
    expect(buildGlUnlitDefineKey({ ...FLAT, hasSkin: true }).endsWith('k')).toBe(true);
    expect(buildGlUnlitDefineKey({ ...FLAT, hasSkin: true })).not.toBe(buildGlUnlitDefineKey(FLAT));
  });
});

describe('compileGlUnlitProgram', () => {
  it('compiles, links, and resolves the unlit uniforms with a null normal matrix', () => {
    const gl = makeFakeGl2();
    const program = compileGlUnlitProgram(gl, FLAT);
    expect(program.locColor).not.toBeNull();
    expect(program.locIntensity).not.toBeNull();
    expect(program.locNormalMatrix).toBeNull();
    expect(gl.calls.some((c) => c.name === 'linkProgram')).toBe(true);
  });
});

describe('ensureGlUnlitProgram', () => {
  it('caches a variant under the unlit namespace and reuses it', () => {
    const { state, gl } = makeGlScene3DState();
    const first = ensureGlUnlitProgram(state, FLAT);
    const links = gl.calls.filter((c) => c.name === 'linkProgram').length;
    const second = ensureGlUnlitProgram(state, FLAT);
    expect(second).toBe(first);
    expect(gl.calls.filter((c) => c.name === 'linkProgram').length).toBe(links);
    expect([...getGlScene3DRuntime(state).programCache.keys()].some((k) => k.startsWith('unlit:'))).toBe(true);
  });

  it('compiles the skinned variant as a distinct cache entry', () => {
    const { state } = makeGlScene3DState();
    ensureGlUnlitProgram(state, FLAT);
    getGlScene3DRuntime(state).activeSkinnedRun = true;
    ensureGlUnlitProgram(state, FLAT);
    const keys = [...getGlScene3DRuntime(state).programCache.keys()];
    expect(keys.some((k) => k.startsWith('unlit:') && k.endsWith('k'))).toBe(true);
    expect(keys.filter((k) => k.startsWith('unlit:')).length).toBe(2);
  });
});

describe('getGlUnlitFragmentSourceForKey', () => {
  it('includes feature defines only when their flag is set', () => {
    expect(getGlUnlitFragmentSourceForKey(FLAT)).not.toContain('#define HAS_COLOR_MAP');
    expect(getGlUnlitFragmentSourceForKey({ ...FLAT, hasColorMap: true })).toContain('#define HAS_COLOR_MAP');
    expect(getGlUnlitFragmentSourceForKey({ ...FLAT, alphaMaskEnabled: true })).toContain('#define ALPHA_MASK');
  });
});

describe('getGlUnlitVertexSourceForKey', () => {
  it('defines VERTEX_COLOR only in the vertex-color variant', () => {
    expect(getGlUnlitVertexSourceForKey(FLAT)).not.toContain('#define VERTEX_COLOR');
    expect(getGlUnlitVertexSourceForKey({ ...FLAT, vertexColor: true })).toContain('#define VERTEX_COLOR');
    // The color0 attribute lives behind the #ifdef, so it is present in the body string either way.
    expect(getGlUnlitVertexSourceForKey({ ...FLAT, vertexColor: true })).toContain('a_color0');
  });

  it('defines HAS_UV_TRANSFORM and applies the transform only in the uv-transform variant', () => {
    // applyUvTransform is always in the body (identity when undefined); the define + uniform are gated.
    expect(getGlUnlitVertexSourceForKey(FLAT)).not.toContain('#define HAS_UV_TRANSFORM');
    const transformed = getGlUnlitVertexSourceForKey({ ...FLAT, hasColorMap: true, hasUvTransform: true });
    expect(transformed).toContain('#define HAS_UV_TRANSFORM');
    expect(transformed).toContain('uniform mat3 u_uvTransform');
    expect(transformed).toContain('v_uv0 = applyUvTransform(a_uv0)');
  });

  it('splices the skin declarations and HAS_SKIN defines only in the skinned variant', () => {
    const skinned = getGlUnlitVertexSourceForKey({ ...FLAT, hasSkin: true });
    expect(skinned).toContain('#define HAS_SKIN');
    expect(skinned).not.toContain('#define MAX_JOINTS');
    expect(skinned).toContain('sampler2D u_jointTexture');
    expect(skinned).toContain('texelFetch');
    expect(skinned).toContain('mat4 skinMatrix()');
    expect(skinned).toContain('a_joints0');
    const flat = getGlUnlitVertexSourceForKey(FLAT);
    expect(flat).not.toContain('#define HAS_SKIN');
    expect(flat).not.toContain('a_joints0');
  });
});
