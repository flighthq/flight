import { getCanvasShapeRenderer, registerCanvasShapeCommand, registerCanvasShapeCommands } from './canvasShapeRegistry';

describe('getCanvasShapeRenderer', () => {
  it('returns undefined for an unregistered key', () => {
    expect(getCanvasShapeRenderer('__unregistered__')).toBeUndefined();
  });

  it('returns the handler after registration', () => {
    const fn = vi.fn();
    registerCanvasShapeCommand('__test_get__' as never, fn);
    expect(getCanvasShapeRenderer('__test_get__')).toBe(fn);
  });
});

describe('registerCanvasShapeCommand', () => {
  it('stores and retrieves a handler by key', () => {
    const fn = vi.fn();
    registerCanvasShapeCommand('__test_register__' as never, fn);
    expect(getCanvasShapeRenderer('__test_register__')).toBe(fn);
  });

  it('replaces an existing handler when called again with the same key', () => {
    const first = vi.fn();
    const second = vi.fn();
    registerCanvasShapeCommand('__test_replace__' as never, first);
    registerCanvasShapeCommand('__test_replace__' as never, second);
    expect(getCanvasShapeRenderer('__test_replace__')).toBe(second);
  });
});

describe('registerCanvasShapeCommands', () => {
  it('registers all handlers in the map', () => {
    const a = vi.fn();
    const b = vi.fn();
    registerCanvasShapeCommands({ __test_map_a__: a, __test_map_b__: b } as never);
    expect(getCanvasShapeRenderer('__test_map_a__')).toBe(a);
    expect(getCanvasShapeRenderer('__test_map_b__')).toBe(b);
  });

  it('skips undefined entries', () => {
    registerCanvasShapeCommands({ __test_undef__: undefined } as never);
    expect(getCanvasShapeRenderer('__test_undef__')).toBeUndefined();
  });
});
