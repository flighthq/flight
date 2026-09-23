import { collectAwd2BlockCounts, getAwd2BlockName } from './awd2BlockCensus';

describe('collectAwd2BlockCounts', () => {
  it('returns null for input that is not a readable AWD2 file', () => {
    expect(collectAwd2BlockCounts(new Uint8Array(), null, null)).toBeNull();
  });

  it('counts each block type it walked past', () => {
    const counts = collectAwd2BlockCounts(
      createAwd2([createBlock(BLOCK_MATERIAL), createBlock(BLOCK_MATERIAL), createBlock(BLOCK_CAMERA)]),
      null,
      null,
    )!;
    expect(counts.get('Material')).toBe(2);
    expect(counts.get('Camera')).toBe(1);
  });

  it('reads a block of an unknown type by its length without parsing its body', () => {
    const counts = collectAwd2BlockCounts(
      createAwd2([createBlock(UNKNOWN_BLOCK_TYPE, new Uint8Array([9, 9, 9])), createBlock(BLOCK_CAMERA)]),
      null,
      null,
    )!;
    expect(counts.get(`Unknown(${UNKNOWN_BLOCK_TYPE})`)).toBe(1);
    expect(counts.get('Camera')).toBe(1);
  });

  it('rejects a block whose declared length runs past the end', () => {
    const file = createAwd2([createBlock(BLOCK_CAMERA)]);
    // Overwrite the first block's length field with one larger than the bytes that follow it.
    new DataView(file.buffer).setUint32(HEADER_BYTES + 7, 0xffff, true);
    expect(collectAwd2BlockCounts(file, null, null)).toBeNull();
  });
});

describe('getAwd2BlockName', () => {
  it('names a core-namespace block type', () => {
    expect(getAwd2BlockName(0, BLOCK_MATERIAL)).toBe('Material');
    expect(getAwd2BlockName(0, BLOCK_CAMERA)).toBe('Camera');
  });

  it('labels an unnamed core type stably rather than dropping it', () => {
    expect(getAwd2BlockName(0, UNKNOWN_BLOCK_TYPE)).toBe(`Unknown(${UNKNOWN_BLOCK_TYPE})`);
  });

  it('keeps a non-core namespace distinct from the core type of the same number', () => {
    expect(getAwd2BlockName(1, BLOCK_MATERIAL)).toBe(`Namespace1Block(${BLOCK_MATERIAL})`);
    expect(getAwd2BlockName(1, BLOCK_MATERIAL)).not.toBe(getAwd2BlockName(0, BLOCK_MATERIAL));
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
