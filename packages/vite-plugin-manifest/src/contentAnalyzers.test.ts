import { RequirementFacet } from '@flighthq/types/contract';

import { DEFAULT_CONTENT_ANALYZERS } from './contentAnalyzers';

describe('DEFAULT_CONTENT_ANALYZERS', () => {
  it('covers the formats Flight analyzes, keyed by lowercase extension', () => {
    expect(Object.keys(DEFAULT_CONTENT_ANALYZERS).sort()).toEqual(['.awd', '.swf']);
  });

  it('is frozen, so one project cannot mutate the table another build reads', () => {
    expect(Object.isFrozen(DEFAULT_CONTENT_ANALYZERS)).toBe(true);
  });

  it('delegates to the SWF analyzer rather than reimplementing the walk', () => {
    const set = DEFAULT_CONTENT_ANALYZERS['.swf'](createSwfWithShowFrame());
    expect(set.covers).toEqual([RequirementFacet.DocumentFormat]);
    expect(set.requirements).toEqual([{ facet: RequirementFacet.DocumentFormat, key: 'ShowFrame' }]);
  });

  it('delegates to the AWD2 analyzer rather than reimplementing the walk', () => {
    const set = DEFAULT_CONTENT_ANALYZERS['.awd'](createAwd2WithCamera());
    expect(set.covers).toEqual([RequirementFacet.DocumentFormat]);
    expect(set.requirements).toEqual([{ facet: RequirementFacet.DocumentFormat, key: 'Camera' }]);
  });

  it('reports an empty but covered set for content it cannot read', () => {
    const set = DEFAULT_CONTENT_ANALYZERS['.swf'](new Uint8Array());
    expect(set.requirements).toEqual([]);
    expect(set.covers).toEqual([RequirementFacet.DocumentFormat]);
  });
});

function createSwfWithShowFrame(): Uint8Array {
  const body = new Uint8Array([0x00, 0x00, 0x18, 0x01, 0x00, 0x40, 0x00, 0x00, 0x00]);
  const file = new Uint8Array(8 + body.length);
  file.set([0x46, 0x57, 0x53, 9], 0);
  new DataView(file.buffer).setUint32(4, file.length, true);
  file.set(body, 8);
  return file;
}

function createAwd2WithCamera(): Uint8Array {
  const file = new Uint8Array(12 + 11);
  file.set([0x41, 0x57, 0x44, 2, 1, 0, 0, 0], 0);
  const view = new DataView(file.buffer);
  view.setUint32(8, 11, true);
  view.setUint32(12, 1, true);
  file[16] = 0;
  file[17] = 42;
  file[18] = 0;
  view.setUint32(19, 0, true);
  return file;
}
