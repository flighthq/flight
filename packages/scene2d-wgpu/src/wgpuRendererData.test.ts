import { EntityRuntimeKey } from '@flighthq/types/contract';

import { createWgpuRendererData, getWgpuRendererData, initializeWgpuRendererData } from './wgpuRendererData';

describe('createWgpuRendererData', () => {
  it('adds the RendererData entity slot to the input object', () => {
    const data = { x: 1, y: 2 };
    const result = createWgpuRendererData(data);
    expect(result).toBe(data);
    expect(EntityRuntimeKey in result).toBe(true);
    expect(result[EntityRuntimeKey]).toBeUndefined();
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
describe('initializeWgpuRendererData', () => {
  it('is the construction initializer of createWgpuRendererData', () => {
    expect(typeof initializeWgpuRendererData).toBe('function');
  });
});
