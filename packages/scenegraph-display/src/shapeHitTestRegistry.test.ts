import type { ShapeCommandKey } from '@flighthq/types';

import { hitTestShapeCommand, registerShapeHitTestCommand } from './shapeHitTestRegistry';

describe('hitTestShapeCommand', () => {
  it('returns null for an unregistered command key', () => {
    const buf: unknown[] = ['__unregistered__', 0];
    expect(hitTestShapeCommand(buf, 0, 0, 0)).toBeNull();
  });

  it('passes x, y, buf, and i+2 to the registered handler', () => {
    const fn = vi.fn().mockReturnValue(false);
    registerShapeHitTestCommand({ key: 'moveTo' as ShapeCommandKey, hitTest: fn });
    const buf: unknown[] = ['moveTo', 2, 10, 20];
    hitTestShapeCommand(buf, 0, 5, 7);
    expect(fn).toHaveBeenCalledWith(5, 7, buf, 2);
  });

  it('returns the handler return value', () => {
    registerShapeHitTestCommand({ key: 'endFill' as ShapeCommandKey, hitTest: () => true });
    const buf: unknown[] = ['endFill', 0];
    expect(hitTestShapeCommand(buf, 0, 0, 0)).toBe(true);
  });
});

describe('registerShapeHitTestCommand', () => {
  it('registers a handler that hitTestShapeCommand can retrieve', () => {
    const fn = vi.fn().mockReturnValue(true);
    registerShapeHitTestCommand({ key: 'drawRectangle' as ShapeCommandKey, hitTest: fn });
    const buf: unknown[] = ['drawRectangle', 4, 0, 0, 100, 100];
    const result = hitTestShapeCommand(buf, 0, 50, 50);
    expect(result).toBe(true);
  });

  it('replaces an existing handler when registered again', () => {
    const first = vi.fn().mockReturnValue(false);
    const second = vi.fn().mockReturnValue(true);
    registerShapeHitTestCommand({ key: 'drawCircle' as ShapeCommandKey, hitTest: first });
    registerShapeHitTestCommand({ key: 'drawCircle' as ShapeCommandKey, hitTest: second });
    const buf: unknown[] = ['drawCircle', 3, 50, 50, 25];
    hitTestShapeCommand(buf, 0, 50, 50);
    expect(second).toHaveBeenCalled();
    expect(first).not.toHaveBeenCalled();
  });
});
