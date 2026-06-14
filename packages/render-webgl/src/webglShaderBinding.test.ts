import { getOrCreateDisplayObjectRenderNode, hasRenderFeatures } from '@flighthq/render';
import { type DisplayObject, RenderFeatures } from '@flighthq/types';

import { getWebGLShader, resolveWebGLShader, setWebGLShader } from './webglShaderBinding';
import { makeWebGLState } from './webglTestHelper';

function makeShader() {
  return { locations: {} as never, program: {} as never, bind: vi.fn() };
}

describe('getWebGLShader', () => {
  it('returns the shader bound to a render node', () => {
    const { state } = makeWebGLState();
    const node = {} as DisplayObject;
    const shader = makeShader();
    setWebGLShader(state, node, shader);
    const renderNode = getOrCreateDisplayObjectRenderNode(state, node);
    expect(getWebGLShader(renderNode)).toBe(shader);
  });

  it('returns undefined for a render node with no binding', () => {
    const { state } = makeWebGLState();
    const renderNode = getOrCreateDisplayObjectRenderNode(state, {} as DisplayObject);
    expect(getWebGLShader(renderNode)).toBeUndefined();
  });
});

describe('resolveWebGLShader', () => {
  it('returns the default bitmap shader when no binding is set', () => {
    const { state } = makeWebGLState();
    const renderNode = getOrCreateDisplayObjectRenderNode(state, {} as DisplayObject);
    expect(resolveWebGLShader(state, renderNode)).toBe(state.defaultBitmapShader);
  });

  it('returns the bound shader when shader support is enabled', () => {
    const { state } = makeWebGLState();
    const node = {} as DisplayObject;
    const shader = makeShader();
    setWebGLShader(state, node, shader);
    const renderNode = getOrCreateDisplayObjectRenderNode(state, node);
    expect(resolveWebGLShader(state, renderNode)).toBe(shader);
  });

  it('falls back to the default shader when the feature is disabled', () => {
    const { state } = makeWebGLState();
    const renderNode = getOrCreateDisplayObjectRenderNode(state, {} as DisplayObject);
    // No binding was made, so RenderFeatures.Shaders is off — lookup is skipped.
    expect(resolveWebGLShader(state, renderNode)).toBe(state.defaultBitmapShader);
  });
});

describe('setWebGLShader', () => {
  it('stores a shader keyed by the per-state render node', () => {
    const { state } = makeWebGLState();
    const node = {} as DisplayObject;
    const shader = makeShader();
    setWebGLShader(state, node, shader);
    const renderNode = getOrCreateDisplayObjectRenderNode(state, node);
    expect(getWebGLShader(renderNode)).toBe(shader);
  });

  it('enables the Shaders render feature', () => {
    const { state } = makeWebGLState();
    setWebGLShader(state, {} as DisplayObject, makeShader());
    expect(hasRenderFeatures(state, RenderFeatures.Shaders)).toBe(true);
  });

  it('clears the binding when passed null', () => {
    const { state } = makeWebGLState();
    const node = {} as DisplayObject;
    setWebGLShader(state, node, makeShader());
    setWebGLShader(state, node, null);
    const renderNode = getOrCreateDisplayObjectRenderNode(state, node);
    expect(getWebGLShader(renderNode)).toBeUndefined();
  });

  it('does not leak a binding across render states', () => {
    const { state: a } = makeWebGLState();
    const { state: b } = makeWebGLState();
    const node = {} as DisplayObject;
    const shader = makeShader();
    setWebGLShader(a, node, shader);
    expect(getWebGLShader(getOrCreateDisplayObjectRenderNode(b, node))).toBeUndefined();
    expect(getWebGLShader(getOrCreateDisplayObjectRenderNode(a, node))).toBe(shader);
  });
});
