import { getGlSceneRuntime } from './glSceneRuntime';
import { makeFakeGl2, makeGlSceneState } from './glSceneTestHelper';
import {
  compileGlWireframeProgram,
  ensureGlWireframeProgram,
  getGlWireframeFragmentSource,
  getGlWireframeVertexSource,
} from './glWireframePrelude';

describe('compileGlWireframeProgram', () => {
  it('compiles, links, and resolves the color + transform locations with a null normal matrix', () => {
    const gl = makeFakeGl2();
    const program = compileGlWireframeProgram(gl);
    expect(program.locColor).not.toBeNull();
    expect(program.locViewProjection).not.toBeNull();
    expect(program.locNormalMatrix).toBeNull();
    expect(gl.calls.some((c) => c.name === 'linkProgram')).toBe(true);
  });
});

describe('ensureGlWireframeProgram', () => {
  it('caches the single wireframe program under the wireframe namespace', () => {
    const { state, gl } = makeGlSceneState();
    const first = ensureGlWireframeProgram(state);
    const links = gl.calls.filter((c) => c.name === 'linkProgram').length;
    const second = ensureGlWireframeProgram(state);
    expect(second).toBe(first);
    expect(gl.calls.filter((c) => c.name === 'linkProgram').length).toBe(links);
    expect([...getGlSceneRuntime(state).programCache.keys()].some((k) => k.startsWith('wireframe:'))).toBe(true);
  });
});

describe('getGlWireframeFragmentSource', () => {
  it('outputs the flat color uniform', () => {
    expect(getGlWireframeFragmentSource()).toContain('u_color');
  });
});

describe('getGlWireframeVertexSource', () => {
  it('transforms position by model and view-projection', () => {
    const source = getGlWireframeVertexSource();
    expect(source).toContain('a_position');
    expect(source).toContain('u_viewProjection');
    expect(source).toContain('u_model');
  });
});
