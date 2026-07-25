import { getCanvasShapeCommand, registerCanvasShapeCommand, registerCanvasShapeCommands } from './canvasShapeRegistry';

describe('getCanvasShapeCommand', () => {
  it('returns undefined for an unregistered key', () => {
    expect(getCanvasShapeCommand('__unregistered__')).toBeUndefined();
  });

  it('returns the command after registration', () => {
    const fn = vi.fn();
    registerCanvasShapeCommand({ key: '__test_get__' as never, draw: fn });
    expect(getCanvasShapeCommand('__test_get__')?.draw).toBe(fn);
  });
});

describe('registerCanvasShapeCommand', () => {
  it('stores and retrieves a command by key', () => {
    const fn = vi.fn();
    registerCanvasShapeCommand({ key: '__test_register__' as never, draw: fn });
    expect(getCanvasShapeCommand('__test_register__')?.draw).toBe(fn);
  });

  it('replaces an existing command when called again with the same key', () => {
    const first = vi.fn();
    const second = vi.fn();
    registerCanvasShapeCommand({ key: '__test_replace__' as never, draw: first });
    registerCanvasShapeCommand({ key: '__test_replace__' as never, draw: second });
    expect(getCanvasShapeCommand('__test_replace__')?.draw).toBe(second);
  });
});

describe('registerCanvasShapeCommands', () => {
  it('registers all commands in the array', () => {
    const a = vi.fn();
    const b = vi.fn();
    registerCanvasShapeCommands([
      { key: '__test_arr_a__' as never, draw: a },
      { key: '__test_arr_b__' as never, draw: b },
    ]);
    expect(getCanvasShapeCommand('__test_arr_a__')?.draw).toBe(a);
    expect(getCanvasShapeCommand('__test_arr_b__')?.draw).toBe(b);
  });
});
