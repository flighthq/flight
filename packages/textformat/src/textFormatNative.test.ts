import { mergeTextFormat } from './contract.ts';

describe('mergeTextFormat collection ownership', () => {
  it('clones both tabStops input paths while retaining the shared Arc-backed variations', () => {
    const baseStops = [8];
    const variations = [{ axis: 'wght', value: 400 }];
    const fromBase = mergeTextFormat({ tabStops: baseStops, variations }, {});

    expect(fromBase.tabStops).not.toBe(baseStops);
    expect(fromBase.variations).toBe(variations);
    fromBase.tabStops![0] = 12;
    expect(baseStops).toEqual([8]);

    const overrideStops = [16];
    const fromOverride = mergeTextFormat({ tabStops: baseStops }, { tabStops: overrideStops });

    expect(fromOverride.tabStops).not.toBe(baseStops);
    expect(fromOverride.tabStops).not.toBe(overrideStops);
    fromOverride.tabStops![0] = 20;
    expect(baseStops).toEqual([8]);
    expect(overrideStops).toEqual([16]);
  });
});
