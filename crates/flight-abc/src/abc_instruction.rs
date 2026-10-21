use flight_entity::Uint8Array;

use crate::types::{AbcInstruction, AbcOpcode};

const MAX_SWITCH_CASES: i64 = 100_000;
const VAR_UINT_MAX_BYTES: usize = 5;

const NONE_OPCODES: &[u8] = &[
    AbcOpcode::Add as u8,
    AbcOpcode::AddInt as u8,
    AbcOpcode::AsTypeLate as u8,
    AbcOpcode::BitAnd as u8,
    AbcOpcode::BitNot as u8,
    AbcOpcode::BitOr as u8,
    AbcOpcode::BitXor as u8,
    AbcOpcode::Breakpoint as u8,
    AbcOpcode::CheckFilter as u8,
    AbcOpcode::CoerceAny as u8,
    AbcOpcode::CoerceBoolean as u8,
    AbcOpcode::CoerceDouble as u8,
    AbcOpcode::CoerceInt as u8,
    AbcOpcode::CoerceObject as u8,
    AbcOpcode::CoerceString as u8,
    AbcOpcode::CoerceUint as u8,
    AbcOpcode::ConvertBoolean as u8,
    AbcOpcode::ConvertDouble as u8,
    AbcOpcode::ConvertInt as u8,
    AbcOpcode::ConvertObject as u8,
    AbcOpcode::ConvertString as u8,
    AbcOpcode::ConvertUint as u8,
    AbcOpcode::Decrement as u8,
    AbcOpcode::DecrementInt as u8,
    AbcOpcode::Divide as u8,
    AbcOpcode::Dup as u8,
    AbcOpcode::DxnsLate as u8,
    AbcOpcode::Equals as u8,
    AbcOpcode::GetGlobalScope as u8,
    AbcOpcode::GetLocal0 as u8,
    AbcOpcode::GetLocal1 as u8,
    AbcOpcode::GetLocal2 as u8,
    AbcOpcode::GetLocal3 as u8,
    AbcOpcode::GreaterEquals as u8,
    AbcOpcode::GreaterThan as u8,
    AbcOpcode::HasNext as u8,
    AbcOpcode::In as u8,
    AbcOpcode::Increment as u8,
    AbcOpcode::IncrementInt as u8,
    AbcOpcode::InstanceOf as u8,
    AbcOpcode::IsTypeLate as u8,
    AbcOpcode::Label as u8,
    AbcOpcode::LessEquals as u8,
    AbcOpcode::LessThan as u8,
    AbcOpcode::LoadFloat32 as u8,
    AbcOpcode::LoadFloat64 as u8,
    AbcOpcode::LoadInt16 as u8,
    AbcOpcode::LoadInt32 as u8,
    AbcOpcode::LoadInt8 as u8,
    AbcOpcode::LShift as u8,
    AbcOpcode::Modulo as u8,
    AbcOpcode::Multiply as u8,
    AbcOpcode::MultiplyInt as u8,
    AbcOpcode::Negate as u8,
    AbcOpcode::NegateInt as u8,
    AbcOpcode::NewActivation as u8,
    AbcOpcode::NextName as u8,
    AbcOpcode::NextValue as u8,
    AbcOpcode::Nop as u8,
    AbcOpcode::Not as u8,
    AbcOpcode::Pop as u8,
    AbcOpcode::PopScope as u8,
    AbcOpcode::PushFalse as u8,
    AbcOpcode::PushNan as u8,
    AbcOpcode::PushNull as u8,
    AbcOpcode::PushScope as u8,
    AbcOpcode::PushTrue as u8,
    AbcOpcode::PushUndefined as u8,
    AbcOpcode::PushWith as u8,
    AbcOpcode::ReturnValue as u8,
    AbcOpcode::ReturnVoid as u8,
    AbcOpcode::RShift as u8,
    AbcOpcode::SetLocal0 as u8,
    AbcOpcode::SetLocal1 as u8,
    AbcOpcode::SetLocal2 as u8,
    AbcOpcode::SetLocal3 as u8,
    AbcOpcode::SignExtend1 as u8,
    AbcOpcode::SignExtend16 as u8,
    AbcOpcode::SignExtend8 as u8,
    AbcOpcode::StoreFloat32 as u8,
    AbcOpcode::StoreFloat64 as u8,
    AbcOpcode::StoreInt16 as u8,
    AbcOpcode::StoreInt32 as u8,
    AbcOpcode::StoreInt8 as u8,
    AbcOpcode::StrictEquals as u8,
    AbcOpcode::Subtract as u8,
    AbcOpcode::SubtractInt as u8,
    AbcOpcode::Swap as u8,
    AbcOpcode::Throw as u8,
    AbcOpcode::TypeOf as u8,
    AbcOpcode::URShift as u8,
];

const ONE_VAR_UINT_OPCODES: &[u8] = &[
    AbcOpcode::ApplyType as u8,
    AbcOpcode::AsType as u8,
    AbcOpcode::BreakpointLine as u8,
    AbcOpcode::Call as u8,
    AbcOpcode::Coerce as u8,
    AbcOpcode::Construct as u8,
    AbcOpcode::ConstructSuper as u8,
    AbcOpcode::DebugFile as u8,
    AbcOpcode::DebugLine as u8,
    AbcOpcode::DecLocal as u8,
    AbcOpcode::DecLocalInt as u8,
    AbcOpcode::DeleteProperty as u8,
    AbcOpcode::Dxns as u8,
    AbcOpcode::FindDef as u8,
    AbcOpcode::FindProperty as u8,
    AbcOpcode::FindPropStrict as u8,
    AbcOpcode::GetDescendants as u8,
    AbcOpcode::GetGlobalSlot as u8,
    AbcOpcode::GetLex as u8,
    AbcOpcode::GetLocal as u8,
    AbcOpcode::GetProperty as u8,
    AbcOpcode::GetSlot as u8,
    AbcOpcode::GetSuper as u8,
    AbcOpcode::IncLocal as u8,
    AbcOpcode::IncLocalInt as u8,
    AbcOpcode::InitProperty as u8,
    AbcOpcode::IsType as u8,
    AbcOpcode::Kill as u8,
    AbcOpcode::NewArray as u8,
    AbcOpcode::NewCatch as u8,
    AbcOpcode::NewClass as u8,
    AbcOpcode::NewFunction as u8,
    AbcOpcode::NewObject as u8,
    AbcOpcode::PushDouble as u8,
    AbcOpcode::PushInt as u8,
    AbcOpcode::PushNamespace as u8,
    AbcOpcode::PushShort as u8,
    AbcOpcode::PushString as u8,
    AbcOpcode::PushUint as u8,
    AbcOpcode::SetGlobalSlot as u8,
    AbcOpcode::SetLocal as u8,
    AbcOpcode::SetProperty as u8,
    AbcOpcode::SetSlot as u8,
    AbcOpcode::SetSuper as u8,
    AbcOpcode::Timestamp as u8,
];

const TWO_VAR_UINT_OPCODES: &[u8] = &[
    AbcOpcode::CallMethod as u8,
    AbcOpcode::CallProperty as u8,
    AbcOpcode::CallPropLex as u8,
    AbcOpcode::CallPropVoid as u8,
    AbcOpcode::CallStatic as u8,
    AbcOpcode::CallSuper as u8,
    AbcOpcode::CallSuperVoid as u8,
    AbcOpcode::ConstructProp as u8,
    AbcOpcode::HasNext2 as u8,
];

const OFFSET_OPCODES: &[u8] = &[
    AbcOpcode::IfEq as u8,
    AbcOpcode::IfFalse as u8,
    AbcOpcode::IfGe as u8,
    AbcOpcode::IfGt as u8,
    AbcOpcode::IfLe as u8,
    AbcOpcode::IfLt as u8,
    AbcOpcode::IfNe as u8,
    AbcOpcode::IfNge as u8,
    AbcOpcode::IfNgt as u8,
    AbcOpcode::IfNle as u8,
    AbcOpcode::IfNlt as u8,
    AbcOpcode::IfStrictEq as u8,
    AbcOpcode::IfStrictNe as u8,
    AbcOpcode::IfTrue as u8,
    AbcOpcode::Jump as u8,
];

const BYTE_OPCODES: &[u8] = &[AbcOpcode::GetScopeObject as u8, AbcOpcode::PushByte as u8];

const NONE: &[OperandKind] = &[];
const ONE_VAR_UINT: &[OperandKind] = &[OperandKind::VarUint];
const TWO_VAR_UINT: &[OperandKind] = &[OperandKind::VarUint, OperandKind::VarUint];
const ONE_OFFSET: &[OperandKind] = &[OperandKind::SignedOffset];
const ONE_BYTE: &[OperandKind] = &[OperandKind::Byte];
const DEBUG: &[OperandKind] = &[
    OperandKind::Byte,
    OperandKind::VarUint,
    OperandKind::Byte,
    OperandKind::VarUint,
];

#[derive(Clone, Copy)]
enum OperandKind {
    Byte,
    SignedOffset,
    VarUint,
}

struct AbcVarUint {
    pos: usize,
    value: i64,
}

fn operand_shape(opcode: u8) -> Option<&'static [OperandKind]> {
    if NONE_OPCODES.contains(&opcode) {
        return Some(NONE);
    }
    if ONE_VAR_UINT_OPCODES.contains(&opcode) {
        return Some(ONE_VAR_UINT);
    }
    if TWO_VAR_UINT_OPCODES.contains(&opcode) {
        return Some(TWO_VAR_UINT);
    }
    if OFFSET_OPCODES.contains(&opcode) {
        return Some(ONE_OFFSET);
    }
    if BYTE_OPCODES.contains(&opcode) {
        return Some(ONE_BYTE);
    }
    if opcode == AbcOpcode::Debug as u8 {
        return Some(DEBUG);
    }
    return None;
}

pub fn read_abc_instructions(code: &Uint8Array) -> Option<Vec<AbcInstruction>> {
    let mut instructions = Vec::new();
    let mut pos = 0usize;

    while pos < code.len() {
        let offset = pos;
        let opcode = code[pos];
        pos += 1;
        let mut operands = Vec::new();

        if opcode == AbcOpcode::LookupSwitch as u8 {
            let target = read_abc_signed_offset(code, pos)?;
            operands.push(target);
            pos += 3;
            let count = read_abc_var_uint(code, pos)?;
            if count.value > MAX_SWITCH_CASES {
                return None;
            }
            operands.push(count.value);
            pos = count.pos;
            for _ in 0..=count.value as usize {
                operands.push(read_abc_signed_offset(code, pos)?);
                pos += 3;
            }
            instructions.push(AbcInstruction {
                offset,
                opcode,
                operands,
            });
            continue;
        }

        let shape = operand_shape(opcode)?;
        for kind in shape {
            match kind {
                OperandKind::Byte => {
                    if pos >= code.len() {
                        return None;
                    }
                    operands.push(code[pos] as i64);
                    pos += 1;
                }
                OperandKind::SignedOffset => {
                    operands.push(read_abc_signed_offset(code, pos)?);
                    pos += 3;
                }
                OperandKind::VarUint => {
                    let value = read_abc_var_uint(code, pos)?;
                    operands.push(value.value);
                    pos = value.pos;
                }
            }
        }
        instructions.push(AbcInstruction {
            offset,
            opcode,
            operands,
        });
    }
    return Some(instructions);
}

fn read_abc_signed_offset(source: &Uint8Array, pos: usize) -> Option<i64> {
    if pos > source.len() || source.len() - pos < 3 {
        return None;
    }
    let value =
        source[pos] as i64 + (source[pos + 1] as i64) * 0x100 + (source[pos + 2] as i64) * 0x10000;
    return Some(if value >= 0x800000 {
        value - 0x1000000
    } else {
        value
    });
}

fn read_abc_var_uint(source: &Uint8Array, pos: usize) -> Option<AbcVarUint> {
    let mut value = 0i64;
    let mut cursor = pos;
    for i in 0..VAR_UINT_MAX_BYTES {
        if cursor >= source.len() {
            return None;
        }
        let byte = source[cursor];
        cursor += 1;
        value += ((byte & 0x7f) as i64) << (7 * i);
        if byte & 0x80 == 0 {
            return Some(AbcVarUint { pos: cursor, value });
        }
    }
    return Some(AbcVarUint { pos: cursor, value });
}
