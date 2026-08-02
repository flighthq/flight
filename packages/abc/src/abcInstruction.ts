import type { AbcInstruction } from '@flighthq/types/contract';
import { AbcOpcode } from '@flighthq/types/contract';

// Decodes a method body's instruction stream into a flat list, or null when it does not decode cleanly.
//
// Walking AVM2 bytecode requires knowing every opcode's operand shape, because instructions are variable
// width and there is no way to resynchronize after a miss — an unrecognized opcode therefore stops the
// walk and reports null rather than guessing a width and returning plausible nonsense.
//
// The operand-shape table below is written from the published bytecode format description. An opcode's
// number and the operands it declares are facts about the format; nothing here is derived from any
// implementation of it, so this carries no third-party licence obligation.
export function readAbcInstructions(code: Readonly<Uint8Array>): AbcInstruction[] | null {
  const source = code as Uint8Array;
  const instructions: AbcInstruction[] = [];
  let pos = 0;

  while (pos < source.length) {
    const offset = pos;
    const opcode = source[pos++];
    const operands: number[] = [];

    if (opcode === AbcOpcode.LookupSwitch) {
      // The one variable-length instruction: a default target, a case count, and one more target than the
      // count says, because the count is the highest index rather than the number of cases.
      const target = readAbcSignedOffset(source, pos);
      if (target === null) return null;
      operands.push(target);
      pos += 3;
      const count = readAbcVarUint(source, pos);
      if (count === null || count.value > MAX_SWITCH_CASES) return null;
      operands.push(count.value);
      pos = count.pos;
      for (let i = 0; i <= count.value; i++) {
        const caseTarget = readAbcSignedOffset(source, pos);
        if (caseTarget === null) return null;
        operands.push(caseTarget);
        pos += 3;
      }
      instructions.push({ offset, opcode, operands });
      continue;
    }

    const shape = OPERAND_SHAPES[opcode];
    if (shape === undefined) return null;
    for (const kind of shape) {
      if (kind === OPERAND_BYTE) {
        if (pos >= source.length) return null;
        operands.push(source[pos++]);
      } else if (kind === OPERAND_SIGNED_OFFSET) {
        const value = readAbcSignedOffset(source, pos);
        if (value === null) return null;
        operands.push(value);
        pos += 3;
      } else {
        const value = readAbcVarUint(source, pos);
        if (value === null) return null;
        operands.push(value.value);
        pos = value.pos;
      }
    }
    instructions.push({ offset, opcode, operands });
  }
  return instructions;
}

// A branch target: three bytes, little-endian, sign-extended from 24 bits. Targets are relative to the
// instruction that follows the branch.
function readAbcSignedOffset(source: Uint8Array, pos: number): number | null {
  if (pos + 3 > source.length) return null;
  const value = source[pos] + source[pos + 1] * 0x100 + source[pos + 2] * 0x10000;
  return value >= 0x800000 ? value - 0x1000000 : value;
}

function readAbcVarUint(source: Uint8Array, pos: number): { pos: number; value: number } | null {
  let value = 0;
  let cursor = pos;
  for (let i = 0; i < VAR_UINT_MAX_BYTES; i++) {
    if (cursor >= source.length) return null;
    const byte = source[cursor++];
    value += (byte & 0x7f) * 2 ** (7 * i);
    if ((byte & 0x80) === 0) return { pos: cursor, value };
  }
  return { pos: cursor, value };
}

const OPERAND_BYTE = 0;
const OPERAND_SIGNED_OFFSET = 1;
const OPERAND_VAR_UINT = 2;

const NONE: readonly number[] = [];
const ONE_VAR_UINT: readonly number[] = [OPERAND_VAR_UINT];
const TWO_VAR_UINT: readonly number[] = [OPERAND_VAR_UINT, OPERAND_VAR_UINT];
const ONE_OFFSET: readonly number[] = [OPERAND_SIGNED_OFFSET];
const ONE_BYTE: readonly number[] = [OPERAND_BYTE];

// Opcode to operand shape. Every opcode the format defines appears here; anything absent stops a walk.
const OPERAND_SHAPES: Readonly<Record<number, readonly number[]>> = {
  [AbcOpcode.Add]: NONE,
  [AbcOpcode.AddInt]: NONE,
  [AbcOpcode.ApplyType]: ONE_VAR_UINT,
  [AbcOpcode.AsType]: ONE_VAR_UINT,
  [AbcOpcode.AsTypeLate]: NONE,
  [AbcOpcode.BitAnd]: NONE,
  [AbcOpcode.BitNot]: NONE,
  [AbcOpcode.BitOr]: NONE,
  [AbcOpcode.BitXor]: NONE,
  [AbcOpcode.Breakpoint]: NONE,
  [AbcOpcode.BreakpointLine]: ONE_VAR_UINT,
  [AbcOpcode.Call]: ONE_VAR_UINT,
  [AbcOpcode.CallMethod]: TWO_VAR_UINT,
  [AbcOpcode.CallPropLex]: TWO_VAR_UINT,
  [AbcOpcode.CallPropVoid]: TWO_VAR_UINT,
  [AbcOpcode.CallProperty]: TWO_VAR_UINT,
  [AbcOpcode.CallStatic]: TWO_VAR_UINT,
  [AbcOpcode.CallSuper]: TWO_VAR_UINT,
  [AbcOpcode.CallSuperVoid]: TWO_VAR_UINT,
  [AbcOpcode.CheckFilter]: NONE,
  [AbcOpcode.Coerce]: ONE_VAR_UINT,
  [AbcOpcode.CoerceAny]: NONE,
  [AbcOpcode.CoerceBoolean]: NONE,
  [AbcOpcode.CoerceDouble]: NONE,
  [AbcOpcode.CoerceInt]: NONE,
  [AbcOpcode.CoerceObject]: NONE,
  [AbcOpcode.CoerceString]: NONE,
  [AbcOpcode.CoerceUint]: NONE,
  [AbcOpcode.Construct]: ONE_VAR_UINT,
  [AbcOpcode.ConstructProp]: TWO_VAR_UINT,
  [AbcOpcode.ConstructSuper]: ONE_VAR_UINT,
  [AbcOpcode.ConvertBoolean]: NONE,
  [AbcOpcode.ConvertDouble]: NONE,
  [AbcOpcode.ConvertInt]: NONE,
  [AbcOpcode.ConvertObject]: NONE,
  [AbcOpcode.ConvertString]: NONE,
  [AbcOpcode.ConvertUint]: NONE,
  [AbcOpcode.Debug]: [OPERAND_BYTE, OPERAND_VAR_UINT, OPERAND_BYTE, OPERAND_VAR_UINT],
  [AbcOpcode.DebugFile]: ONE_VAR_UINT,
  [AbcOpcode.DebugLine]: ONE_VAR_UINT,
  [AbcOpcode.DecLocal]: ONE_VAR_UINT,
  [AbcOpcode.DecLocalInt]: ONE_VAR_UINT,
  [AbcOpcode.Decrement]: NONE,
  [AbcOpcode.DecrementInt]: NONE,
  [AbcOpcode.DeleteProperty]: ONE_VAR_UINT,
  [AbcOpcode.Divide]: NONE,
  [AbcOpcode.Dup]: NONE,
  [AbcOpcode.Dxns]: ONE_VAR_UINT,
  [AbcOpcode.DxnsLate]: NONE,
  [AbcOpcode.Equals]: NONE,
  [AbcOpcode.FindDef]: ONE_VAR_UINT,
  [AbcOpcode.FindPropStrict]: ONE_VAR_UINT,
  [AbcOpcode.FindProperty]: ONE_VAR_UINT,
  [AbcOpcode.GetDescendants]: ONE_VAR_UINT,
  [AbcOpcode.GetGlobalScope]: NONE,
  [AbcOpcode.GetGlobalSlot]: ONE_VAR_UINT,
  [AbcOpcode.GetLex]: ONE_VAR_UINT,
  [AbcOpcode.GetLocal]: ONE_VAR_UINT,
  [AbcOpcode.GetLocal0]: NONE,
  [AbcOpcode.GetLocal1]: NONE,
  [AbcOpcode.GetLocal2]: NONE,
  [AbcOpcode.GetLocal3]: NONE,
  [AbcOpcode.GetProperty]: ONE_VAR_UINT,
  [AbcOpcode.GetScopeObject]: ONE_BYTE,
  [AbcOpcode.GetSlot]: ONE_VAR_UINT,
  [AbcOpcode.GetSuper]: ONE_VAR_UINT,
  [AbcOpcode.GreaterEquals]: NONE,
  [AbcOpcode.GreaterThan]: NONE,
  [AbcOpcode.HasNext]: NONE,
  [AbcOpcode.HasNext2]: TWO_VAR_UINT,
  [AbcOpcode.IfEq]: ONE_OFFSET,
  [AbcOpcode.IfFalse]: ONE_OFFSET,
  [AbcOpcode.IfGe]: ONE_OFFSET,
  [AbcOpcode.IfGt]: ONE_OFFSET,
  [AbcOpcode.IfLe]: ONE_OFFSET,
  [AbcOpcode.IfLt]: ONE_OFFSET,
  [AbcOpcode.IfNe]: ONE_OFFSET,
  [AbcOpcode.IfNge]: ONE_OFFSET,
  [AbcOpcode.IfNgt]: ONE_OFFSET,
  [AbcOpcode.IfNle]: ONE_OFFSET,
  [AbcOpcode.IfNlt]: ONE_OFFSET,
  [AbcOpcode.IfStrictEq]: ONE_OFFSET,
  [AbcOpcode.IfStrictNe]: ONE_OFFSET,
  [AbcOpcode.IfTrue]: ONE_OFFSET,
  [AbcOpcode.In]: NONE,
  [AbcOpcode.IncLocal]: ONE_VAR_UINT,
  [AbcOpcode.IncLocalInt]: ONE_VAR_UINT,
  [AbcOpcode.Increment]: NONE,
  [AbcOpcode.IncrementInt]: NONE,
  [AbcOpcode.InitProperty]: ONE_VAR_UINT,
  [AbcOpcode.InstanceOf]: NONE,
  [AbcOpcode.IsType]: ONE_VAR_UINT,
  [AbcOpcode.IsTypeLate]: NONE,
  [AbcOpcode.Jump]: ONE_OFFSET,
  [AbcOpcode.Kill]: ONE_VAR_UINT,
  [AbcOpcode.LShift]: NONE,
  [AbcOpcode.Label]: NONE,
  [AbcOpcode.LessEquals]: NONE,
  [AbcOpcode.LessThan]: NONE,
  [AbcOpcode.LoadFloat32]: NONE,
  [AbcOpcode.LoadFloat64]: NONE,
  [AbcOpcode.LoadInt16]: NONE,
  [AbcOpcode.LoadInt32]: NONE,
  [AbcOpcode.LoadInt8]: NONE,
  [AbcOpcode.Modulo]: NONE,
  [AbcOpcode.Multiply]: NONE,
  [AbcOpcode.MultiplyInt]: NONE,
  [AbcOpcode.Negate]: NONE,
  [AbcOpcode.NegateInt]: NONE,
  [AbcOpcode.NewActivation]: NONE,
  [AbcOpcode.NewArray]: ONE_VAR_UINT,
  [AbcOpcode.NewCatch]: ONE_VAR_UINT,
  [AbcOpcode.NewClass]: ONE_VAR_UINT,
  [AbcOpcode.NewFunction]: ONE_VAR_UINT,
  [AbcOpcode.NewObject]: ONE_VAR_UINT,
  [AbcOpcode.NextName]: NONE,
  [AbcOpcode.NextValue]: NONE,
  [AbcOpcode.Nop]: NONE,
  [AbcOpcode.Not]: NONE,
  [AbcOpcode.Pop]: NONE,
  [AbcOpcode.PopScope]: NONE,
  [AbcOpcode.PushByte]: ONE_BYTE,
  [AbcOpcode.PushDouble]: ONE_VAR_UINT,
  [AbcOpcode.PushFalse]: NONE,
  [AbcOpcode.PushInt]: ONE_VAR_UINT,
  [AbcOpcode.PushNamespace]: ONE_VAR_UINT,
  [AbcOpcode.PushNan]: NONE,
  [AbcOpcode.PushNull]: NONE,
  [AbcOpcode.PushScope]: NONE,
  [AbcOpcode.PushShort]: ONE_VAR_UINT,
  [AbcOpcode.PushString]: ONE_VAR_UINT,
  [AbcOpcode.PushTrue]: NONE,
  [AbcOpcode.PushUint]: ONE_VAR_UINT,
  [AbcOpcode.PushUndefined]: NONE,
  [AbcOpcode.PushWith]: NONE,
  [AbcOpcode.RShift]: NONE,
  [AbcOpcode.ReturnValue]: NONE,
  [AbcOpcode.ReturnVoid]: NONE,
  [AbcOpcode.SetGlobalSlot]: ONE_VAR_UINT,
  [AbcOpcode.SetLocal]: ONE_VAR_UINT,
  [AbcOpcode.SetLocal0]: NONE,
  [AbcOpcode.SetLocal1]: NONE,
  [AbcOpcode.SetLocal2]: NONE,
  [AbcOpcode.SetLocal3]: NONE,
  [AbcOpcode.SetProperty]: ONE_VAR_UINT,
  [AbcOpcode.SetSlot]: ONE_VAR_UINT,
  [AbcOpcode.SetSuper]: ONE_VAR_UINT,
  [AbcOpcode.SignExtend1]: NONE,
  [AbcOpcode.SignExtend16]: NONE,
  [AbcOpcode.SignExtend8]: NONE,
  [AbcOpcode.StoreFloat32]: NONE,
  [AbcOpcode.StoreFloat64]: NONE,
  [AbcOpcode.StoreInt16]: NONE,
  [AbcOpcode.StoreInt32]: NONE,
  [AbcOpcode.StoreInt8]: NONE,
  [AbcOpcode.StrictEquals]: NONE,
  [AbcOpcode.Subtract]: NONE,
  [AbcOpcode.SubtractInt]: NONE,
  [AbcOpcode.Swap]: NONE,
  [AbcOpcode.Throw]: NONE,
  [AbcOpcode.Timestamp]: ONE_VAR_UINT,
  [AbcOpcode.TypeOf]: NONE,
  [AbcOpcode.URShift]: NONE,
};

const MAX_SWITCH_CASES = 100_000;
const VAR_UINT_MAX_BYTES = 5;
