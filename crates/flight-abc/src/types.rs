use flight_entity::Uint8Array;

#[derive(Clone, Debug, PartialEq)]
pub struct AbcFile {
    pub classes: Vec<AbcClass>,
    pub constant_pool: AbcConstantPool,
    pub instances: Vec<AbcInstance>,
    pub major_version: u16,
    pub metadata: Vec<AbcMetadata>,
    pub method_bodies: Vec<AbcMethodBody>,
    pub methods: Vec<AbcMethod>,
    pub minor_version: u16,
    pub scripts: Vec<AbcScript>,
}

// flight-lint: allow(f64) ABC double constants are stored as exact IEEE-754 binary64 values
#[derive(Clone, Debug, PartialEq)]
pub struct AbcConstantPool {
    pub doubles: Vec<f64>,
    pub integers: Vec<i32>,
    pub multinames: Vec<AbcMultiname>,
    pub namespace_sets: Vec<Vec<usize>>,
    pub namespaces: Vec<AbcNamespace>,
    pub strings: Vec<String>,
    pub unsigned_integers: Vec<u32>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AbcNamespace {
    pub kind: u8,
    pub name: usize,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AbcMultiname {
    pub kind: u8,
    pub name: usize,
    pub namespace: usize,
    pub namespace_set: usize,
    pub parameters: Vec<usize>,
    pub type_name: usize,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AbcMethod {
    pub flags: u8,
    pub name: usize,
    pub parameter_names: Vec<usize>,
    pub parameter_types: Vec<usize>,
    pub optional_values: Vec<AbcOptionalValue>,
    pub return_type: usize,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AbcOptionalValue {
    pub kind: u8,
    pub value: usize,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AbcMetadata {
    pub items: Vec<AbcMetadataItem>,
    pub name: usize,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AbcMetadataItem {
    pub key: usize,
    pub value: usize,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AbcInstance {
    pub flags: u8,
    pub initializer: usize,
    pub interfaces: Vec<usize>,
    pub name: usize,
    pub protected_namespace: usize,
    pub super_name: usize,
    pub traits: Vec<AbcTrait>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AbcClass {
    pub initializer: usize,
    pub traits: Vec<AbcTrait>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AbcScript {
    pub initializer: usize,
    pub traits: Vec<AbcTrait>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AbcTrait {
    pub attributes: u8,
    pub class_index: usize,
    pub dispatch_id: usize,
    pub method_index: usize,
    pub metadata: Vec<usize>,
    pub name: usize,
    pub kind: u8,
    pub slot_id: usize,
    pub type_name: usize,
    pub value_index: usize,
    pub value_kind: u8,
}

#[derive(Clone, Debug, PartialEq)]
pub struct AbcMethodBody {
    pub code: Box<Uint8Array>,
    pub exceptions: Vec<AbcException>,
    pub init_scope_depth: usize,
    pub local_count: usize,
    pub max_scope_depth: usize,
    pub max_stack: usize,
    pub method: usize,
    pub traits: Vec<AbcTrait>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AbcException {
    pub from: usize,
    pub target: usize,
    pub to: usize,
    pub exception_type: usize,
    pub variable_name: usize,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum AbcMultinameKind {
    Multiname = 0x09,
    MultinameA = 0x0e,
    MultinameL = 0x1b,
    MultinameLA = 0x1c,
    QName = 0x07,
    QNameA = 0x0d,
    RtqName = 0x0f,
    RtqNameA = 0x10,
    RtqNameL = 0x11,
    RtqNameLA = 0x12,
    TypeName = 0x1d,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum AbcTraitKind {
    Class = 4,
    Const = 6,
    Function = 5,
    Getter = 2,
    Method = 1,
    Setter = 3,
    Slot = 0,
}

// flight-lint: allow(contract-vocabulary) ABC operands share one TS number array across signed 24-bit offsets and unsigned 35-bit decoder values; exact range -8388608..=34359738367 is below 2^53
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AbcInstruction {
    pub offset: usize,
    pub opcode: u8,
    pub operands: Vec<i64>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum AbcOpcode {
    Add = 0xa0,
    AddInt = 0xc5,
    ApplyType = 0x53,
    AsType = 0x86,
    AsTypeLate = 0x87,
    BitAnd = 0xa8,
    BitNot = 0x97,
    BitOr = 0xa9,
    BitXor = 0xaa,
    Breakpoint = 0x01,
    BreakpointLine = 0xf2,
    Call = 0x41,
    CallMethod = 0x43,
    CallProperty = 0x46,
    CallPropLex = 0x4c,
    CallPropVoid = 0x4f,
    CallStatic = 0x44,
    CallSuper = 0x45,
    CallSuperVoid = 0x4e,
    CheckFilter = 0x78,
    Coerce = 0x80,
    CoerceAny = 0x82,
    CoerceBoolean = 0x81,
    CoerceDouble = 0x84,
    CoerceInt = 0x83,
    CoerceObject = 0x89,
    CoerceString = 0x85,
    CoerceUint = 0x88,
    Construct = 0x42,
    ConstructProp = 0x4a,
    ConstructSuper = 0x49,
    ConvertBoolean = 0x76,
    ConvertDouble = 0x75,
    ConvertInt = 0x73,
    ConvertObject = 0x77,
    ConvertString = 0x70,
    ConvertUint = 0x74,
    Debug = 0xef,
    DebugFile = 0xf1,
    DebugLine = 0xf0,
    DecLocal = 0x94,
    DecLocalInt = 0xc3,
    Decrement = 0x93,
    DecrementInt = 0xc1,
    DeleteProperty = 0x6a,
    Divide = 0xa3,
    Dup = 0x2a,
    Dxns = 0x06,
    DxnsLate = 0x07,
    Equals = 0xab,
    FindDef = 0x5f,
    FindProperty = 0x5e,
    FindPropStrict = 0x5d,
    GetDescendants = 0x59,
    GetGlobalScope = 0x64,
    GetGlobalSlot = 0x6e,
    GetLex = 0x60,
    GetLocal = 0x62,
    GetLocal0 = 0xd0,
    GetLocal1 = 0xd1,
    GetLocal2 = 0xd2,
    GetLocal3 = 0xd3,
    GetProperty = 0x66,
    GetScopeObject = 0x65,
    GetSlot = 0x6c,
    GetSuper = 0x04,
    GreaterEquals = 0xb0,
    GreaterThan = 0xaf,
    HasNext = 0x1f,
    HasNext2 = 0x32,
    IfEq = 0x13,
    IfFalse = 0x12,
    IfGe = 0x18,
    IfGt = 0x17,
    IfLe = 0x16,
    IfLt = 0x15,
    IfNe = 0x14,
    IfNge = 0x0f,
    IfNgt = 0x0e,
    IfNle = 0x0d,
    IfNlt = 0x0c,
    IfStrictEq = 0x19,
    IfStrictNe = 0x1a,
    IfTrue = 0x11,
    In = 0xb4,
    IncLocal = 0x92,
    IncLocalInt = 0xc2,
    Increment = 0x91,
    IncrementInt = 0xc0,
    InitProperty = 0x68,
    InstanceOf = 0xb1,
    IsType = 0xb2,
    IsTypeLate = 0xb3,
    Jump = 0x10,
    Kill = 0x08,
    Label = 0x09,
    LessEquals = 0xae,
    LessThan = 0xad,
    LoadFloat32 = 0x38,
    LoadFloat64 = 0x39,
    LoadInt16 = 0x36,
    LoadInt32 = 0x37,
    LoadInt8 = 0x35,
    LookupSwitch = 0x1b,
    LShift = 0xa5,
    Modulo = 0xa4,
    Multiply = 0xa2,
    MultiplyInt = 0xc7,
    Negate = 0x90,
    NegateInt = 0xc4,
    NewActivation = 0x57,
    NewArray = 0x56,
    NewCatch = 0x5a,
    NewClass = 0x58,
    NewFunction = 0x40,
    NewObject = 0x55,
    NextName = 0x1e,
    NextValue = 0x23,
    Nop = 0x02,
    Not = 0x96,
    Pop = 0x29,
    PopScope = 0x1d,
    PushByte = 0x24,
    PushDouble = 0x2f,
    PushFalse = 0x27,
    PushInt = 0x2d,
    PushNamespace = 0x31,
    PushNan = 0x28,
    PushNull = 0x20,
    PushScope = 0x30,
    PushShort = 0x25,
    PushString = 0x2c,
    PushTrue = 0x26,
    PushUint = 0x2e,
    PushUndefined = 0x21,
    PushWith = 0x1c,
    ReturnValue = 0x48,
    ReturnVoid = 0x47,
    RShift = 0xa6,
    SetGlobalSlot = 0x6f,
    SetLocal = 0x63,
    SetLocal0 = 0xd4,
    SetLocal1 = 0xd5,
    SetLocal2 = 0xd6,
    SetLocal3 = 0xd7,
    SetProperty = 0x61,
    SetSlot = 0x6d,
    SetSuper = 0x05,
    SignExtend1 = 0x50,
    SignExtend16 = 0x52,
    SignExtend8 = 0x51,
    StoreFloat32 = 0x3d,
    StoreFloat64 = 0x3e,
    StoreInt16 = 0x3b,
    StoreInt32 = 0x3c,
    StoreInt8 = 0x3a,
    StrictEquals = 0xac,
    Subtract = 0xa1,
    SubtractInt = 0xc6,
    Swap = 0x2b,
    Throw = 0x03,
    Timestamp = 0xf3,
    TypeOf = 0x95,
    URShift = 0xa7,
}
