import { hitTestCommand, registerShapeCommandHitTest } from './shapeHitTestRegistry';

describe('registerShapeCommandHitTest', () => {
  it('registers a handler that hitTestCommand can retrieve', () => {
    const fn = vi.fn().mockReturnValue(true);
    registerShapeCommandHitTest('drawRect' as never, fn);
    const result = hitTestCommand({ key: 'drawRect', args: [0, 0, 100, 100] }, 50, 50);
    expect(result).toBe(true);
  });

  it('replaces an existing handler when registered again', () => {
    const first = vi.fn().mockReturnValue(false);
    const second = vi.fn().mockReturnValue(true);
    registerShapeCommandHitTest('drawCircle' as never, first);
    registerShapeCommandHitTest('drawCircle' as never, second);
    hitTestCommand({ key: 'drawCircle', args: [50, 50, 25] }, 50, 50);
    expect(second).toHaveBeenCalled();
    expect(first).not.toHaveBeenCalled();
  });
});

describe('hitTestCommand', () => {
  it('returns null for an unregistered command key', () => {
    expect(hitTestCommand({ key: '__unregistered__' as never, args: [] as never }, 0, 0)).toBeNull();
  });

  it('passes x and y to the registered handler', () => {
    const fn = vi.fn().mockReturnValue(false);
    registerShapeCommandHitTest('moveTo' as never, fn);
    hitTestCommand({ key: 'moveTo', args: [10, 20] }, 5, 7);
    expect(fn).toHaveBeenCalledWith(5, 7, 10, 20);
  });

  it('returns the handler return value', () => {
    registerShapeCommandHitTest('endFill' as never, () => true);
    expect(hitTestCommand({ key: 'endFill', args: [] }, 0, 0)).toBe(true);
  });
});
