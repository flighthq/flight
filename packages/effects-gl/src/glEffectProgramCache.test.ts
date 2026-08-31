import * as renderGlContract from '@flighthq/render-gl/contract';
import type { GlFullscreenProgram, GlRenderState } from '@flighthq/types/contract';

import { getGlEffectProgram, getGlEffectUniformLocation } from './glEffectProgramCache';

beforeEach(() => {
  // The cache's whole job is deciding when NOT to call this, so it has to be observable.
  vi.spyOn(renderGlContract, 'compileGlFullscreenProgram').mockImplementation(((_gl: unknown, source: string) => ({
    program: { source },
    textures: [],
  })) as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// A distinct object per call, so "same context" and "same program" are identity questions the cache can
// actually get wrong — two fakes that compared equal would hide a cache keyed by the wrong thing.
function createContext(): WebGL2RenderingContext {
  const locations = new Map<string, unknown>();
  return {
    getUniformLocation: vi.fn((program: unknown, name: string) => {
      const key = `${JSON.stringify(program)}:${name}`;
      if (!locations.has(key)) locations.set(key, name === 'u_missing' ? null : { key });
      return locations.get(key);
    }),
  } as unknown as WebGL2RenderingContext;
}

function createState(gl: WebGL2RenderingContext): GlRenderState {
  return { gl } as unknown as GlRenderState;
}

describe('getGlEffectProgram', () => {
  // ★ WHY THIS FILE IS WORTH MORE THAN ONE EFFECT'S. Every Gl effect recipe reaches its shader through
  // this cache, so a mistake here is a mistake in all of them at once — and because the cache returns
  // SOMETHING plausible under every wrong keying, the symptom is a wrong shader rather than a crash.
  //
  // ★ NO HISTORICAL DEFECT EXISTS FOR THIS FILE, so the cases below are CONSTRUCTED, not restored: its
  // history holds only packaging and lane refactors, no fix. That makes it the branch-2 shape — the
  // discriminating case is one I had to invent, and the measured output recorded per test came from
  // mutating the shipped code deliberately, not from a line git already had.
  it('compiles a key once per context and hands back the same program', () => {
    vi.mocked(renderGlContract.compileGlFullscreenProgram).mockClear();
    const state = createState(createContext());

    const first = getGlEffectProgram(state, 'blur', 'SOURCE_A');
    const second = getGlEffectProgram(state, 'blur', 'SOURCE_A');

    expect(second).toBe(first);
    expect(vi.mocked(renderGlContract.compileGlFullscreenProgram)).toHaveBeenCalledTimes(1);
  });

  it('compiles each key separately, so two recipes never share one program', () => {
    vi.mocked(renderGlContract.compileGlFullscreenProgram).mockClear();
    const state = createState(createContext());

    const blur = getGlEffectProgram(state, 'blur', 'SOURCE_A');
    const bloom = getGlEffectProgram(state, 'bloom', 'SOURCE_B');

    expect(bloom).not.toBe(blur);
    expect(vi.mocked(renderGlContract.compileGlFullscreenProgram)).toHaveBeenCalledTimes(2);
  });

  // ★ CONSTRUCTED CASE: keyed by CONTEXT, not by state and not globally. A WebGL program belongs to the
  // context that compiled it and cannot be bound in another, so handing a second canvas the first
  // canvas's program is not a slow path — it is a program that does not work there, in every effect at
  // once.
  // MEASURED by replacing the per-context WeakMap with one module-level Map — 4 of 9 failed:
  //   AssertionError: expected "vi.fn()" to be called 2 times, but got 1 times
  //   AssertionError: expected { …(2) } not to be { …(2) } // Object.is equality
  //   AssertionError: expected "vi.fn()" to be called 1 times, but got 0 times
  //   AssertionError: expected "vi.fn()" to be called 1 times, but got 0 times
  // The last two are collateral and explained: one shared Map also survives BETWEEN tests, so keys a
  // later test compiles for the first time are already present. Recorded rather than trimmed, because a
  // failure count that does not match the prediction is a signal about the cause, not noise.
  it('gives each context its own program, since a program cannot cross contexts', () => {
    vi.mocked(renderGlContract.compileGlFullscreenProgram).mockClear();
    const first = getGlEffectProgram(createState(createContext()), 'blur', 'SOURCE_A');
    const second = getGlEffectProgram(createState(createContext()), 'blur', 'SOURCE_A');

    expect(second).not.toBe(first);
    expect(vi.mocked(renderGlContract.compileGlFullscreenProgram)).toHaveBeenCalledTimes(2);
  });

  // Two states over ONE context share the cache — the direction the WeakMap keying buys, and the reason
  // it is keyed by `state.gl` rather than by `state`.
  it('shares one program across two states on the same context', () => {
    vi.mocked(renderGlContract.compileGlFullscreenProgram).mockClear();
    const gl = createContext();

    const first = getGlEffectProgram(createState(gl), 'blur', 'SOURCE_A');
    const second = getGlEffectProgram(createState(gl), 'blur', 'SOURCE_A');

    expect(second).toBe(first);
    expect(vi.mocked(renderGlContract.compileGlFullscreenProgram)).toHaveBeenCalledTimes(1);
  });

  // The stated limit of the contract, asserted so nobody assumes otherwise: the KEY identifies the
  // program, not the source text. An effect that varies its shader must vary its key too — which is
  // exactly what glGodRaysEffect does by baking the sample count into `atmospheric.godRays.<n>`.
  it('ignores a changed source under a key it has already compiled', () => {
    vi.mocked(renderGlContract.compileGlFullscreenProgram).mockClear();
    const state = createState(createContext());

    const first = getGlEffectProgram(state, 'blur', 'SOURCE_A');
    const second = getGlEffectProgram(state, 'blur', 'SOURCE_B_DIFFERENT');

    expect(second).toBe(first);
    expect(vi.mocked(renderGlContract.compileGlFullscreenProgram)).toHaveBeenCalledTimes(1);
  });
});

describe('getGlEffectUniformLocation', () => {
  it('asks the driver once per name and caches the answer', () => {
    const gl = createContext();
    const state = createState(gl);
    const program = getGlEffectProgram(state, 'uniforms', 'SOURCE_A') as GlFullscreenProgram;

    const first = getGlEffectUniformLocation(state, program, 'u_intensity');
    const second = getGlEffectUniformLocation(state, program, 'u_intensity');

    expect(second).toBe(first);
    expect(gl.getUniformLocation).toHaveBeenCalledTimes(1);
  });

  // ★ CONSTRUCTED CASE: the location cache is keyed by PROGRAM. `u_intensity` is a different location in
  // every program that declares it, so a cache keyed by name alone would hand one program's location to
  // another and write the uniform into the wrong slot — a wrong picture, never an error.
  // MEASURED by replacing the per-program WeakMap with one Map keyed by name — 1 of 9 failed, the
  // predicted one and only it:
  //   AssertionError: expected { Object (key) } not to be { Object (key) } // Object.is equality
  it('keeps each program locations apart, since one name is a different slot in each', () => {
    const state = createState(createContext());
    const first = getGlEffectProgram(state, 'programOne', 'SOURCE_A') as GlFullscreenProgram;
    const second = getGlEffectProgram(state, 'programTwo', 'SOURCE_B') as GlFullscreenProgram;

    const fromFirst = getGlEffectUniformLocation(state, first, 'u_intensity');
    const fromSecond = getGlEffectUniformLocation(state, second, 'u_intensity');

    expect(fromSecond).not.toBe(fromFirst);
  });

  // A uniform the shader optimised away resolves to null, and null is a real answer the cache must keep.
  // Re-asking every frame is the cost this whole file exists to remove, and `null` is the value most
  // likely to be mistaken for "not cached yet".
  it('caches a null location rather than re-asking the driver every frame', () => {
    const gl = createContext();
    const state = createState(gl);
    const program = getGlEffectProgram(state, 'nullUniform', 'SOURCE_A') as GlFullscreenProgram;

    expect(getGlEffectUniformLocation(state, program, 'u_missing')).toBeNull();
    expect(getGlEffectUniformLocation(state, program, 'u_missing')).toBeNull();
    expect(gl.getUniformLocation).toHaveBeenCalledTimes(1);
  });

  it('resolves each name separately within one program', () => {
    const state = createState(createContext());
    const program = getGlEffectProgram(state, 'twoNames', 'SOURCE_A') as GlFullscreenProgram;

    expect(getGlEffectUniformLocation(state, program, 'u_a')).not.toBe(
      getGlEffectUniformLocation(state, program, 'u_b'),
    );
  });
});
