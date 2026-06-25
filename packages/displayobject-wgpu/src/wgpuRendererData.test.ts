import { createWgpuRendererData, getWgpuRendererData } from './wgpuRendererData';

describe('createWgpuRendererData', () => {
  it('returns the input data cast to RendererData', () => {
    const data = { x: 1, y: 2 };
    const result = createWgpuRendererData(data);
    expect(result).toBe(data);
  });

  it('round-trips through getWgpuRendererData', () => {
    const data = { value: 42 };
    const rendererData = createWgpuRendererData(data);
    const recovered = getWgpuRendererData<{ value: number }>(rendererData);
    expect(recovered).toBe(data);
    expect(recovered?.value).toBe(42);
  });
});

describe('getWgpuRendererData', () => {
  it('returns null when data is null', () => {
    expect(getWgpuRendererData(null)).toBeNull();
  });

  it('returns the original object', () => {
    const data = { canvas: null, lastContentId: -1 };
    const result = getWgpuRendererData(createWgpuRendererData(data));
    expect(result).toBe(data);
  });
});
