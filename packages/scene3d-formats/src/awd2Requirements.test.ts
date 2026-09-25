import { RequirementFacet } from '@flighthq/types/contract';

import { parseAwd2Requirements } from './awd2Requirements.ts';

describe('parseAwd2Requirements', () => {
  it('reports one requirement per distinct block type, keyed by the AWD2 block name', () => {
    const set = parseAwd2Requirements(createAwd2([createBlock(BLOCK_MATERIAL), createBlock(BLOCK_CAMERA)]), null, null);
    expect(set.requirements).toEqual([
      { facet: RequirementFacet.DocumentFormat, key: 'awd2.Camera' },
      { facet: RequirementFacet.DocumentFormat, key: 'awd2.Material' },
    ]);
  });

  it('declares the facet it inspected, so absence is evidence', () => {
    const set = parseAwd2Requirements(createAwd2([]), null, null);
    expect(set.covers).toEqual([RequirementFacet.DocumentFormat]);
  });

  it('collapses repeats: a requirement is what the file needs, not how often', () => {
    const set = parseAwd2Requirements(
      createAwd2([createBlock(BLOCK_MATERIAL), createBlock(BLOCK_MATERIAL)]),
      null,
      null,
    );
    expect(set.requirements).toEqual([{ facet: RequirementFacet.DocumentFormat, key: 'awd2.Material' }]);
  });

  it('keeps a block type this build does not name rather than shrinking the inventory', () => {
    const set = parseAwd2Requirements(createAwd2([createBlock(UNKNOWN_BLOCK_TYPE)]), null, null);
    expect(set.requirements).toEqual([
      { facet: RequirementFacet.DocumentFormat, key: `awd2.Unknown(${UNKNOWN_BLOCK_TYPE})` },
    ]);
  });

  it('returns an empty set that still declares coverage when the source is unreadable', () => {
    const set = parseAwd2Requirements(new Uint8Array(), null, null);
    expect(set.requirements).toEqual([]);
    expect(set.covers).toEqual([RequirementFacet.DocumentFormat]);
  });
});

const HEADER_BYTES = 12;
const BLOCK_HEADER_BYTES = 11;
const BLOCK_CAMERA = 42;
const BLOCK_MATERIAL = 81;
const UNKNOWN_BLOCK_TYPE = 200;

function createAwd2(blocks: ReadonlyArray<Uint8Array>): Uint8Array {
  let bodyLength = 0;
  for (const block of blocks) bodyLength += block.length;
  const file = new Uint8Array(HEADER_BYTES + bodyLength);
  file.set([0x41, 0x57, 0x44, 2, 1, 0, 0, 0], 0);
  new DataView(file.buffer).setUint32(8, bodyLength, true);
  let offset = HEADER_BYTES;
  for (const block of blocks) {
    file.set(block, offset);
    offset += block.length;
  }
  return file;
}

function createBlock(blockType: number, body: Uint8Array = new Uint8Array()): Uint8Array {
  const block = new Uint8Array(BLOCK_HEADER_BYTES + body.length);
  const view = new DataView(block.buffer);
  view.setUint32(0, 1, true);
  block[4] = 0;
  block[5] = blockType;
  block[6] = 0;
  view.setUint32(7, body.length, true);
  block.set(body, BLOCK_HEADER_BYTES);
  return block;
}
