import { getOrCreateRenderProxy2D } from '@flighthq/render';
import type { DisplayObject, Kind } from '@flighthq/types';

import { getGlRenderStateRuntime } from './glRenderState';
import {
  getGlMaterialShader,
  getGlShader,
  registerGlMaterialShader,
  resolveGlShader,
  setGlShader,
} from './glShaderBinding';
import { makeGlState } from './glTestHelper';

function makeShader() {
  return { locations: {} as never, program: {} as never, bind: vi.fn() };
}

describe('getGlMaterialShader', () => {
  it('returns null when no material shader is registered for the kind', () => {
    const { state } = makeGlState();
    expect(getGlMaterialShader(state, 'Tint' as Kind)).toBeNull();
  });

  it('returns the shader registered for the kind', () => {
    const { state } = makeGlState();
    const shader = makeShader();
    registerGlMaterialShader(state, 'Tint' as Kind, shader);
    expect(getGlMaterialShader(state, 'Tint' as Kind)).toBe(shader);
  });

  it('returns null for a kind other than the one registered', () => {
    const { state } = makeGlState();
    registerGlMaterialShader(state, 'Tint' as Kind, makeShader());
    expect(getGlMaterialShader(state, 'ColorMatrix' as Kind)).toBeNull();
  });
});

describe('getGlShader', () => {
  it('returns the shader bound to a render node', () => {
    const { state } = makeGlState();
    const node = {} as DisplayObject;
    const shader = makeShader();
    setGlShader(state, node, shader);
    const renderProxy = getOrCreateRenderProxy2D(state, node);
    expect(getGlShader(renderProxy)).toBe(shader);
  });

  it('returns undefined for a render node with no binding', () => {
    const { state } = makeGlState();
    const renderProxy = getOrCreateRenderProxy2D(state, {} as DisplayObject);
    expect(getGlShader(renderProxy)).toBeUndefined();
  });
});

describe('registerGlMaterialShader', () => {
  it('makes the shader retrievable by its material kind', () => {
    const { state } = makeGlState();
    const shader = makeShader();
    registerGlMaterialShader(state, 'Tint' as Kind, shader);
    expect(getGlMaterialShader(state, 'Tint' as Kind)).toBe(shader);
  });

  it('overwrites a previous registration for the same kind', () => {
    const { state } = makeGlState();
    const first = makeShader();
    const second = makeShader();
    registerGlMaterialShader(state, 'Tint' as Kind, first);
    registerGlMaterialShader(state, 'Tint' as Kind, second);
    expect(getGlMaterialShader(state, 'Tint' as Kind)).toBe(second);
  });

  it('makes resolveGlShader return the material shader for a matching node', () => {
    const { state } = makeGlState();
    const shader = makeShader();
    registerGlMaterialShader(state, 'Tint' as Kind, shader);
    const renderProxy = getOrCreateRenderProxy2D(state, {} as DisplayObject);
    renderProxy.material = { kind: 'Tint' as Kind } as never;
    expect(resolveGlShader(state, renderProxy)).toBe(shader);
  });

  it('keeps registrations isolated per render state', () => {
    const { state: a } = makeGlState();
    const { state: b } = makeGlState();
    registerGlMaterialShader(a, 'Tint' as Kind, makeShader());
    expect(getGlMaterialShader(b, 'Tint' as Kind)).toBeNull();
  });
});

describe('resolveGlShader', () => {
  it('returns the default bitmap shader when no binding is set', () => {
    const { state } = makeGlState();
    const renderProxy = getOrCreateRenderProxy2D(state, {} as DisplayObject);
    expect(resolveGlShader(state, renderProxy)).toBe(getGlRenderStateRuntime(state).defaultBitmapShader);
  });

  it('returns the bound shader when shader support is enabled', () => {
    const { state } = makeGlState();
    const node = {} as DisplayObject;
    const shader = makeShader();
    setGlShader(state, node, shader);
    const renderProxy = getOrCreateRenderProxy2D(state, node);
    expect(resolveGlShader(state, renderProxy)).toBe(shader);
  });

  it('falls back to the default shader when no binding resolver is installed', () => {
    const { state } = makeGlState();
    const renderProxy = getOrCreateRenderProxy2D(state, {} as DisplayObject);
    // No binding was made, so the resolver is unset — the per-node lookup is skipped.
    expect(resolveGlShader(state, renderProxy)).toBe(getGlRenderStateRuntime(state).defaultBitmapShader);
  });
});

describe('setGlShader', () => {
  it('stores a shader keyed by the per-state render node', () => {
    const { state } = makeGlState();
    const node = {} as DisplayObject;
    const shader = makeShader();
    setGlShader(state, node, shader);
    const renderProxy = getOrCreateRenderProxy2D(state, node);
    expect(getGlShader(renderProxy)).toBe(shader);
  });

  it('installs the per-node shader binding resolver', () => {
    const { state } = makeGlState();
    const runtime = getGlRenderStateRuntime(state);
    expect(runtime.webglShaderBindingResolver).toBeUndefined();
    setGlShader(state, {} as DisplayObject, makeShader());
    expect(runtime.webglShaderBindingResolver).toBe(getGlShader);
  });

  it('clears the binding when passed null', () => {
    const { state } = makeGlState();
    const node = {} as DisplayObject;
    setGlShader(state, node, makeShader());
    setGlShader(state, node, null);
    const renderProxy = getOrCreateRenderProxy2D(state, node);
    expect(getGlShader(renderProxy)).toBeUndefined();
  });

  it('does not leak a binding across render states', () => {
    const { state: a } = makeGlState();
    const { state: b } = makeGlState();
    const node = {} as DisplayObject;
    const shader = makeShader();
    setGlShader(a, node, shader);
    expect(getGlShader(getOrCreateRenderProxy2D(b, node))).toBeUndefined();
    expect(getGlShader(getOrCreateRenderProxy2D(a, node))).toBe(shader);
  });
});
