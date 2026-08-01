import type { AssetDescriptor } from '@flighthq/types/contract';

import {
  acquireAsset,
  createAssetLibrary,
  registerAssetDescriptor,
  registerAssetLoader,
  releaseAsset,
} from './assetLibrary';
import { explainAssetLoad } from './explainAssetLoad';

describe('explainAssetLoad', () => {
  it('distinguishes catalog, adapter, loading, resident, and freed states', async () => {
    const library = createAssetLibrary();
    expect(explainAssetLoad(library, 'hero')).toEqual({
      id: 'hero',
      refCount: 0,
      status: 'missing-descriptor',
      type: null,
    });

    const descriptor: AssetDescriptor = { id: 'hero', type: 'image', url: 'hero.bin' };
    registerAssetDescriptor(library, descriptor);
    expect(explainAssetLoad(library, 'hero')).toEqual({
      id: 'hero',
      refCount: 0,
      status: 'missing-loader',
      type: 'image',
    });

    let settle!: (value: { id: string }) => void;
    registerAssetLoader(library, 'image', {
      dispose(): void {},
      load(): Promise<{ id: string }> {
        return new Promise((resolve) => {
          settle = resolve;
        });
      },
    });
    expect(explainAssetLoad(library, 'hero')).toMatchObject({ refCount: 0, status: 'never-acquired' });

    const pending = acquireAsset(library, 'hero');
    expect(explainAssetLoad(library, 'hero')).toMatchObject({ refCount: 1, status: 'loading' });
    settle({ id: 'hero' });
    await pending;
    expect(explainAssetLoad(library, 'hero')).toMatchObject({ refCount: 1, status: 'resident' });

    releaseAsset(library, 'hero');
    expect(explainAssetLoad(library, 'hero')).toMatchObject({ refCount: 0, status: 'freed' });
  });

  it('treats a replacement descriptor as a new never-acquired catalog entry', async () => {
    const library = createAssetLibrary();
    registerAssetLoader(library, 'image', {
      dispose(): void {},
      load: async () => ({ id: 'hero' }),
    });
    registerAssetDescriptor(library, { id: 'hero', type: 'image', url: 'hero-a.bin' });
    await acquireAsset(library, 'hero');
    releaseAsset(library, 'hero');
    registerAssetDescriptor(library, { id: 'hero', type: 'image', url: 'hero-b.bin' });
    expect(explainAssetLoad(library, 'hero')).toMatchObject({ status: 'never-acquired' });
  });
});
