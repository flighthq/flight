import { createRenderState } from '@flighthq/render/contract';

import { getCanvasShapeCommand, registerCanvasShapeCommand, registerCanvasShapeCommands } from './canvasShapeRegistry';

describe('getCanvasShapeCommand', () => {
  it('returns null for an unregistered key', () => {
    expect(getCanvasShapeCommand(createRenderState(), '__unregistered__')).toBeNull();
  });

  it('returns the command after registration', () => {
    const state = createRenderState();
    const fn = vi.fn();
    registerCanvasShapeCommand(state, { key: '__test_get__' as never, draw: fn });
    expect(getCanvasShapeCommand(state, '__test_get__')?.draw).toBe(fn);
  });

  it('does not see a command registered on a different state', () => {
    // The point of the per-state registry: one state's wiring is not another's, so a scene rendered
    // through an unwired state reports a miss instead of quietly borrowing a global.
    const wired = createRenderState();
    registerCanvasShapeCommand(wired, { key: '__test_isolation__' as never, draw: vi.fn() });
    expect(getCanvasShapeCommand(createRenderState(), '__test_isolation__')).toBeNull();
  });
});

describe('registerCanvasShapeCommand', () => {
  it('stores and retrieves a command by key', () => {
    const state = createRenderState();
    const fn = vi.fn();
    registerCanvasShapeCommand(state, { key: '__test_register__' as never, draw: fn });
    expect(getCanvasShapeCommand(state, '__test_register__')?.draw).toBe(fn);
  });

  it('replaces an existing command when called again with the same key', () => {
    const state = createRenderState();
    const first = vi.fn();
    const second = vi.fn();
    registerCanvasShapeCommand(state, { key: '__test_replace__' as never, draw: first });
    registerCanvasShapeCommand(state, { key: '__test_replace__' as never, draw: second });
    expect(getCanvasShapeCommand(state, '__test_replace__')?.draw).toBe(second);
  });
});

describe('registerCanvasShapeCommands', () => {
  it('registers all commands in the array', () => {
    const state = createRenderState();
    const a = vi.fn();
    const b = vi.fn();
    registerCanvasShapeCommands(state, [
      { key: '__test_arr_a__' as never, draw: a },
      { key: '__test_arr_b__' as never, draw: b },
    ]);
    expect(getCanvasShapeCommand(state, '__test_arr_a__')?.draw).toBe(a);
    expect(getCanvasShapeCommand(state, '__test_arr_b__')?.draw).toBe(b);
  });
});
