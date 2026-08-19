import { Buffer } from 'node:buffer';

import { describe, expect, it, vi } from 'vitest';

import { provideCaptureDomRenderPixels } from './captureDomReadback';

describe('provideCaptureDomRenderPixels', () => {
  it('screenshots the registered DOM target and supplies its encoded image to the page bridge', async () => {
    const dispose = vi.fn();
    const screenshot = vi.fn().mockResolvedValue(Buffer.from('pixels'));
    const evaluate = vi.fn().mockResolvedValue(true);
    const page = {
      evaluate,
      evaluateHandle: vi.fn().mockResolvedValue({
        asElement: () => ({ screenshot }),
        dispose,
      }),
    };

    const result = await provideCaptureDomRenderPixels(page as never);
    expect(result.provided).toBe(true);
    expect(result.screenshot).toEqual(Buffer.from('pixels'));
    expect(screenshot).toHaveBeenCalledWith({ animations: 'disabled' });
    expect(evaluate.mock.calls[0]?.[1]).toBe(`data:image/png;base64,${Buffer.from('pixels').toString('base64')}`);
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('reports that no readback was supplied when the page has no DOM target', async () => {
    const dispose = vi.fn();
    const page = {
      evaluateHandle: vi.fn().mockResolvedValue({ asElement: () => null, dispose }),
    };

    const result = await provideCaptureDomRenderPixels(page as never);
    expect(result.provided).toBe(false);
    expect(result.screenshot).toBeNull();
    expect(dispose).toHaveBeenCalledOnce();
  });
});
