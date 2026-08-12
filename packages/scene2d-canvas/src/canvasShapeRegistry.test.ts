import { copyRenderStateRegistrations, createRenderState, getRenderStateRuntime } from '@flighthq/render/contract';

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

  it('replaces the table without mutating the earlier snapshot', () => {
    const state = createRenderState();
    const first = vi.fn();
    const second = vi.fn();
    registerCanvasShapeCommand(state, { key: '__test_snapshot__' as never, draw: first });
    const before = getRenderStateRuntime(state).registries.canvasShapeCommands;

    registerCanvasShapeCommand(state, { key: '__test_snapshot__' as never, draw: second });

    expect(before?.entries.get('__test_snapshot__')).toEqual({
      state: 'bound',
      value: { key: '__test_snapshot__', draw: first },
    });
    expect(getCanvasShapeCommand(state, '__test_snapshot__')?.draw).toBe(second);
  });

  it('survives derivation and later registrations diverge from the copied snapshot', () => {
    const source = createRenderState();
    const derived = createRenderState();
    const first = vi.fn();
    const second = vi.fn();
    registerCanvasShapeCommand(source, { key: '__test_derived__' as never, draw: first });

    copyRenderStateRegistrations(derived, source);

    const copied = getRenderStateRuntime(derived).registries.canvasShapeCommands;
    expect(copied).toBe(getRenderStateRuntime(source).registries.canvasShapeCommands);
    expect(getCanvasShapeCommand(derived, '__test_derived__')?.draw).toBe(first);

    registerCanvasShapeCommand(source, { key: '__test_derived__' as never, draw: second });
    expect(getCanvasShapeCommand(source, '__test_derived__')?.draw).toBe(second);
    expect(getCanvasShapeCommand(derived, '__test_derived__')?.draw).toBe(first);
    expect(getRenderStateRuntime(derived).registries.canvasShapeCommands).toBe(copied);
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
