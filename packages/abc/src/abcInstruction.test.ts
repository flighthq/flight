// Generated from crates/flight-abc/tests/abc_instruction_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import { AbcOpcode, readAbcInstructions } from './contract.ts';
import type { AbcInstruction } from './contract.ts';

describe('readAbcInstructions', () => {
  it('decodes an empty body as no instructions', () => {
    expect(readAbcInstructions(new Uint8Array([]))).toEqual([] as never[]);
  });
  it('decodes constructor prologue', () => {
    expect(readAbcInstructions(new Uint8Array([0xd0, 0x30, 0x47]))).toEqual([
      { offset: 0, opcode: AbcOpcode.GetLocal0 & 0xff, operands: [] },
      { offset: 1, opcode: AbcOpcode.PushScope & 0xff, operands: [] },
      { offset: 2, opcode: AbcOpcode.ReturnVoid & 0xff, operands: [] },
    ]);
  });
  it('places deprecated typed coerce forms', () => {
    const instructions = readAbcInstructions(new Uint8Array([0x81, 0x83, 0x84, 0x88, 0x89, 0x47]))!;
    expect(instructions.map((value) => value.opcode)).toEqual([0x81, 0x83, 0x84, 0x88, 0x89, 0x47]);
    expect(instructions.every((value) => value.operands.length === 0)).toBe(true);
  });
  it('reads a lookup switch with one more target than case count', () => {
    expect(
      readAbcInstructions(new Uint8Array([0x1b, 0x07, 0x00, 0x00, 0x01, 0x0a, 0x00, 0x00, 0x0d, 0x00, 0x00])),
    ).toEqual([{ offset: 0, opcode: AbcOpcode.LookupSwitch & 0xff, operands: [7, 1, 10, 13] }]);
  });
  it('reads call site operand shapes including two operand calls', () => {
    expect(readAbcInstructions(new Uint8Array([0x5d, 0x05, 0x24, 0x02, 0x4f, 0x05, 0x01]))).toEqual([
      { offset: 0, opcode: AbcOpcode.FindPropStrict & 0xff, operands: [5] },
      { offset: 2, opcode: AbcOpcode.PushByte & 0xff, operands: [2] },
      { offset: 4, opcode: AbcOpcode.CallPropVoid & 0xff, operands: [5, 1] },
    ]);
  });
  it('reports a truncated operand', () => {
    expect(readAbcInstructions(new Uint8Array([0x4f, 0x05])) === null).toBe(true);
    expect(readAbcInstructions(new Uint8Array([0x10, 0xfc])) === null).toBe(true);
  });
  it('sign extends a backward branch target', () => {
    expect(readAbcInstructions(new Uint8Array([0x10, 0xfc, 0xff, 0xff]))).toEqual([
      { offset: 0, opcode: AbcOpcode.Jump & 0xff, operands: [-4] },
    ]);
  });
  it('stops on an undefined opcode', () => {
    expect(readAbcInstructions(new Uint8Array([0xd0, 0xff, 0x47])) === null).toBe(true);
  });
  it('widens a multi byte variable length operand', () => {
    expect(readAbcInstructions(new Uint8Array([0x2d, 0x81, 0x01]))).toEqual([
      { offset: 0, opcode: AbcOpcode.PushInt & 0xff, operands: [129] },
    ]);
  });
});
