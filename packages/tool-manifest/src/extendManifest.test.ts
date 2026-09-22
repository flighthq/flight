import { extendManifest, unionManifests } from './extendManifest.js';
import { createManifest } from './manifest.js';

describe('extendManifest', () => {
  it('unions feature arrays rather than replacing them', () => {
    const merged = extendManifest(createManifest({ tags: ['shape'] }), createManifest({ tags: ['bitmap'] }));
    expect(merged.features.tags).toEqual(['bitmap', 'shape']);
  });

  it('keeps a base group the extension never mentions', () => {
    // The regression this guards: treating the extension as the whole truth would silently narrow a
    // build to whatever the last layer happened to name.
    const merged = extendManifest(createManifest({ tags: ['shape'] }), createManifest({ blocks: ['geometry'] }));
    expect(merged.features.tags).toEqual(['shape']);
    expect(merged.features.blocks).toEqual(['geometry']);
  });

  it('lets the extension override a scalar setting', () => {
    const merged = extendManifest(createManifest({}, { mode: 'base' }), createManifest({}, { mode: 'extension' }));
    expect(merged.settings.mode).toBe('extension');
  });

  it('keeps a base setting the extension does not mention', () => {
    expect(extendManifest(createManifest({}, { kept: 1 }), createManifest()).settings.kept).toBe(1);
  });
});

describe('unionManifests', () => {
  it('folds features from every manifest', () => {
    const united = unionManifests([
      createManifest({ tags: ['a'] }),
      createManifest({ tags: ['b'] }),
      createManifest({ blocks: ['c'] }),
    ]);
    expect(united.features).toEqual({ blocks: ['c'], tags: ['a', 'b'] });
  });

  it('resolves a contested setting to the last manifest named', () => {
    const united = unionManifests([createManifest({}, { mode: 'first' }), createManifest({}, { mode: 'last' })]);
    expect(united.settings.mode).toBe('last');
  });

  it('returns the empty manifest for no input', () => {
    expect(unionManifests([])).toEqual(createManifest());
  });
});
