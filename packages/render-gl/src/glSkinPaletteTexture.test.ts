import type { GlSkinPaletteTexture } from '@flighthq/types';

import {
  createGlSkinPaletteTexture,
  destroyGlSkinPaletteTexture,
  uploadGlSkinPaletteTexture,
} from './glSkinPaletteTexture';

interface Call {
  name: string;
  args: unknown[];
}

function makeGl(): { gl: WebGL2RenderingContext; calls: Call[] } {
  const calls: Call[] = [];
  const record =
    (name: string, result?: unknown) =>
    (...args: unknown[]): unknown => {
      calls.push({ name, args });
      return result;
    };
  const gl = {
    TEXTURE_2D: 0x0de1,
    RGBA: 0x1908,
    RGBA32F: 0x8814,
    FLOAT: 0x1406,
    NEAREST: 0x2600,
    CLAMP_TO_EDGE: 0x812f,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    createTexture: record('createTexture', { id: 'tex' }),
    deleteTexture: record('deleteTexture'),
    bindTexture: record('bindTexture'),
    texImage2D: record('texImage2D'),
    texSubImage2D: record('texSubImage2D'),
    texParameteri: record('texParameteri'),
  } as unknown as WebGL2RenderingContext;
  return { gl, calls };
}

// Two joints' worth of identity-ish palette (32 floats). Values are irrelevant to the upload path.
function makePalette(jointCount: number): Float32Array {
  return new Float32Array(jointCount * 16);
}

describe('createGlSkinPaletteTexture', () => {
  it('allocates a texture with zero joint capacity', () => {
    const { gl, calls } = makeGl();
    const palette = createGlSkinPaletteTexture(gl);
    expect(palette.jointCapacity).toBe(0);
    expect(calls.some((c) => c.name === 'createTexture')).toBe(true);
  });
});

describe('destroyGlSkinPaletteTexture', () => {
  it('deletes the palette texture', () => {
    const { gl, calls } = makeGl();
    const palette = createGlSkinPaletteTexture(gl);
    destroyGlSkinPaletteTexture(gl, palette);
    const del = calls.find((c) => c.name === 'deleteTexture');
    expect(del?.args[0]).toBe(palette.texture);
  });
});

describe('uploadGlSkinPaletteTexture', () => {
  it('allocates RGBA32F storage width = jointCount*4 and sets NEAREST/CLAMP on first upload', () => {
    const { gl, calls } = makeGl();
    const palette = createGlSkinPaletteTexture(gl);
    uploadGlSkinPaletteTexture(gl, palette, makePalette(3), 3);

    const alloc = calls.find((c) => c.name === 'texImage2D');
    expect(alloc).toBeDefined();
    expect(alloc?.args[3]).toBe(12); // width = 3 joints * 4 texels
    expect(alloc?.args[4]).toBe(1); // height
    expect(alloc?.args[2]).toBe(gl.RGBA32F);
    expect(palette.jointCapacity).toBe(3);
    // NEAREST min+mag, CLAMP_TO_EDGE s+t — four texParameteri calls.
    expect(calls.filter((c) => c.name === 'texParameteri').length).toBe(4);
    expect(calls.some((c) => c.name === 'texParameteri' && c.args[2] === gl.NEAREST)).toBe(true);
    expect(calls.some((c) => c.name === 'texParameteri' && c.args[2] === gl.CLAMP_TO_EDGE)).toBe(true);
  });

  it('binds the palette texture so the caller can set the sampler unit', () => {
    const { gl, calls } = makeGl();
    const palette = createGlSkinPaletteTexture(gl);
    uploadGlSkinPaletteTexture(gl, palette, makePalette(1), 1);
    const bind = calls.find((c) => c.name === 'bindTexture');
    expect(bind?.args[0]).toBe(gl.TEXTURE_2D);
    expect(bind?.args[1]).toBe(palette.texture);
  });

  it('writes in place with texSubImage2D when the palette fits the current capacity', () => {
    const { gl, calls } = makeGl();
    const palette = createGlSkinPaletteTexture(gl);
    uploadGlSkinPaletteTexture(gl, palette, makePalette(4), 4);
    calls.length = 0;

    uploadGlSkinPaletteTexture(gl, palette, makePalette(2), 2);

    expect(calls.some((c) => c.name === 'texImage2D')).toBe(false);
    const sub = calls.find((c) => c.name === 'texSubImage2D');
    expect(sub).toBeDefined();
    expect(sub?.args[4]).toBe(8); // width = 2 joints * 4 (texSubImage2D arg order: target,level,x,y,w,h,…)
    expect(palette.jointCapacity).toBe(4); // capacity unchanged; no reallocation
    expect(calls.some((c) => c.name === 'texParameteri')).toBe(false);
  });

  it('grows storage (reallocates) when the palette exceeds the current capacity', () => {
    const { gl, calls } = makeGl();
    const palette = createGlSkinPaletteTexture(gl);
    uploadGlSkinPaletteTexture(gl, palette, makePalette(2), 2);
    calls.length = 0;

    uploadGlSkinPaletteTexture(gl, palette, makePalette(5), 5);

    const alloc = calls.find((c) => c.name === 'texImage2D');
    expect(alloc?.args[3]).toBe(20); // width = 5 joints * 4
    expect(palette.jointCapacity).toBe(5);
  });

  it('is alias-safe: reads jointCount before growing capacity', () => {
    const { gl } = makeGl();
    const palette: GlSkinPaletteTexture = createGlSkinPaletteTexture(gl);
    uploadGlSkinPaletteTexture(gl, palette, makePalette(6), 6);
    expect(palette.jointCapacity).toBe(6);
  });
});
