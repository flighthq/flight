import { parseAwd2Header } from './awd2Header.ts';

describe('parseAwd2Header', () => {
  it('returns null for input shorter than the fixed header', () => {
    expect(parseAwd2Header(new Uint8Array([0x41, 0x57, 0x44]), null, null)).toBeNull();
  });

  it('returns null when the magic is not AWD', () => {
    const file = createAwd2([]);
    file[0] = 0x42;
    expect(parseAwd2Header(file, null, null)).toBeNull();
  });

  it('rejects a version it does not read rather than misparsing it', () => {
    const awd3 = createAwd2([]);
    awd3[3] = 3;
    expect(parseAwd2Header(awd3, null, null)).toBeNull();
  });

  it('reads version, flags, compression and body length', () => {
    const header = parseAwd2Header(createAwd2([createBlock(BLOCK_CAMERA)]), null, null)!;
    expect(header.versionMajor).toBe(2);
    expect(header.versionMinor).toBe(1);
    expect(header.flags).toBe(0);
    expect(header.compression).toBe(0);
    expect(header.bodyLength).toBe(BLOCK_HEADER_BYTES);
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
