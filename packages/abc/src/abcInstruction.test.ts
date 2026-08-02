import { AbcOpcode } from '@flighthq/types/contract';

import { readAbcInstructions } from './abcInstruction';

describe('readAbcInstructions', () => {
  it('decodes the constructor prologue every compiled method opens with', () => {
    const instructions = readAbcInstructions(new Uint8Array([0xd0, 0x30, 0x47]));

    expect(instructions).toEqual([
      { offset: 0, opcode: AbcOpcode.GetLocal0, operands: [] },
      { offset: 1, opcode: AbcOpcode.PushScope, operands: [] },
      { offset: 2, opcode: AbcOpcode.ReturnVoid, operands: [] },
    ]);
  });

  it('reads the operand shapes a call site uses, including two-operand calls', () => {
    // findpropstrict <multiname 5>; pushbyte 2; callpropvoid <multiname 5>, 1
    const instructions = readAbcInstructions(new Uint8Array([0x5d, 0x05, 0x24, 0x02, 0x4f, 0x05, 0x01]));

    expect(instructions).toEqual([
      { offset: 0, opcode: AbcOpcode.FindPropStrict, operands: [5] },
      { offset: 2, opcode: AbcOpcode.PushByte, operands: [2] },
      { offset: 4, opcode: AbcOpcode.CallPropVoid, operands: [5, 1] },
    ]);
  });

  it('widens a multi-byte variable-length operand', () => {
    // pushint with a two-byte operand: 0x81 0x01 encodes 129.
    expect(readAbcInstructions(new Uint8Array([0x2d, 0x81, 0x01]))).toEqual([
      { offset: 0, opcode: AbcOpcode.PushInt, operands: [129] },
    ]);
  });

  it('sign-extends a backward branch target', () => {
    // jump -4, as three little-endian bytes.
    expect(readAbcInstructions(new Uint8Array([0x10, 0xfc, 0xff, 0xff]))).toEqual([
      { offset: 0, opcode: AbcOpcode.Jump, operands: [-4] },
    ]);
  });

  it('reads a lookupswitch, whose case count is one less than its target count', () => {
    // default +7, case count 1, then two targets.
    const instructions = readAbcInstructions(
      new Uint8Array([0x1b, 0x07, 0x00, 0x00, 0x01, 0x0a, 0x00, 0x00, 0x0d, 0x00, 0x00]),
    );

    expect(instructions).toEqual([{ offset: 0, opcode: AbcOpcode.LookupSwitch, operands: [7, 1, 10, 13] }]);
  });

  it('stops rather than guessing when an opcode is not one the format defines', () => {
    // There is no way to resynchronize a variable-width stream after an unknown opcode, so returning a
    // partial decode would be returning plausible nonsense.
    expect(readAbcInstructions(new Uint8Array([0xd0, 0xff, 0x47]))).toBeNull();
  });

  it('reports a truncated operand rather than reading past the body', () => {
    expect(readAbcInstructions(new Uint8Array([0x4f, 0x05]))).toBeNull();
    expect(readAbcInstructions(new Uint8Array([0x10, 0xfc]))).toBeNull();
  });

  it('places the deprecated typed coerce forms compilers still emit', () => {
    // Found by decoding real compiler output: omitting these desynchronizes the rest of the body, because
    // the walk then reads the following opcode as an operand.
    expect(readAbcInstructions(new Uint8Array([0x81, 0x83, 0x84, 0x88, 0x89, 0x47]))).toEqual([
      { offset: 0, opcode: AbcOpcode.CoerceBoolean, operands: [] },
      { offset: 1, opcode: AbcOpcode.CoerceInt, operands: [] },
      { offset: 2, opcode: AbcOpcode.CoerceDouble, operands: [] },
      { offset: 3, opcode: AbcOpcode.CoerceUint, operands: [] },
      { offset: 4, opcode: AbcOpcode.CoerceObject, operands: [] },
      { offset: 5, opcode: AbcOpcode.ReturnVoid, operands: [] },
    ]);
  });

  it('decodes an empty body as no instructions', () => {
    expect(readAbcInstructions(new Uint8Array())).toEqual([]);
  });
});
