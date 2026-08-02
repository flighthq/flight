// The ABC (AVM2 bytecode) container as plain data. Every cross-reference is an index into one of the
// constant pool's arrays or into the file's own method, class, or instance lists, exactly as the format
// stores them — nothing is resolved into object references at parse time. That keeps the model flat,
// cheap to build, and portable to a language without a garbage collector, and it means a consumer
// resolves only the handful of entries it actually cares about.
//
// Pool indices are 1-based: entry 0 of every pool is a reserved placeholder the format never uses for
// real data, and a 0 index means "none" wherever a field is optional.
export interface AbcFile {
  classes: AbcClass[];
  constantPool: AbcConstantPool;
  instances: AbcInstance[];
  majorVersion: number;
  metadata: AbcMetadata[];
  methodBodies: AbcMethodBody[];
  methods: AbcMethod[];
  minorVersion: number;
  scripts: AbcScript[];
}

export interface AbcConstantPool {
  doubles: number[];
  integers: number[];
  multinames: AbcMultiname[];
  namespaceSets: number[][];
  namespaces: AbcNamespace[];
  strings: string[];
  unsignedIntegers: number[];
}

export interface AbcNamespace {
  kind: number;
  // Index into `strings`.
  name: number;
}

// One name, in any of the forms AVM2 uses. Which fields carry meaning depends on `kind`: a qualified name
// has `namespace` and `name`; a multiname has `name` and `namespaceSet`; a runtime-qualified name resolves
// part of itself from the operand stack and so carries less; a parameterized type carries `typeName` and
// `parameters`. Unused fields are 0 or empty rather than absent, so the shape never varies.
export interface AbcMultiname {
  kind: number;
  // Index into `strings`, or 0 when the form does not name one.
  name: number;
  // Index into `namespaces`, or 0.
  namespace: number;
  // Index into `namespaceSets`, or 0.
  namespaceSet: number;
  // Indices into `multinames` for a parameterized type, empty otherwise.
  parameters: number[];
  // Index into `multinames` for a parameterized type's base, or 0.
  typeName: number;
}

export interface AbcMethod {
  flags: number;
  // Index into `strings`.
  name: number;
  // Indices into `strings`, empty unless the method declares parameter names.
  parameterNames: number[];
  // Indices into `multinames`.
  parameterTypes: number[];
  // Trailing optional parameter defaults, empty when the method declares none.
  optionalValues: AbcOptionalValue[];
  // Index into `multinames`.
  returnType: number;
}

export interface AbcOptionalValue {
  kind: number;
  // Index into the pool named by `kind`.
  value: number;
}

export interface AbcMetadata {
  items: AbcMetadataItem[];
  // Index into `strings`.
  name: number;
}

export interface AbcMetadataItem {
  // Indices into `strings`.
  key: number;
  value: number;
}

export interface AbcInstance {
  flags: number;
  // Index into the file's `methods`: the instance constructor.
  initializer: number;
  // Indices into `multinames`.
  interfaces: number[];
  name: number;
  // Index into `namespaces`, or 0 unless the flags declare a protected namespace.
  protectedNamespace: number;
  superName: number;
  traits: AbcTrait[];
}

export interface AbcClass {
  // Index into the file's `methods`: the static initializer.
  initializer: number;
  traits: AbcTrait[];
}

export interface AbcScript {
  // Index into the file's `methods`: the script initializer.
  initializer: number;
  traits: AbcTrait[];
}

// One member of a class, instance, script, or method body. `kind` selects which of the payload fields
// carry meaning; the rest are 0 or empty. Kept as one flat shape rather than a discriminated union so the
// model stays a plain table, which is what a downstream port and a disassembler both want.
export interface AbcTrait {
  // The high nibble of the trait's kind byte: final, override, and metadata-present.
  attributes: number;
  // Index into the file's `classes`, for a class trait.
  classIndex: number;
  // Method dispatch id, for a method, getter, or setter trait.
  dispatchId: number;
  // Index into the file's `methods`, for a method, getter, setter, or function trait.
  methodIndex: number;
  // Indices into the file's `metadata`, empty unless the attributes declare some.
  metadata: number[];
  // Index into `multinames`.
  name: number;
  kind: number;
  slotId: number;
  // Index into `multinames`, for a slot or constant trait.
  typeName: number;
  // Index into the pool named by `valueKind`, for a slot or constant trait with a default.
  valueIndex: number;
  valueKind: number;
}

export interface AbcMethodBody {
  // The method's instruction stream, unparsed. Decoding it is a separate step so a consumer that only
  // needs the container never pays for an opcode table.
  code: Uint8Array;
  exceptions: AbcException[];
  initScopeDepth: number;
  localCount: number;
  maxScopeDepth: number;
  maxStack: number;
  // Index into the file's `methods`.
  method: number;
  traits: AbcTrait[];
}

export interface AbcException {
  // Byte offsets into the owning body's `code`.
  from: number;
  target: number;
  to: number;
  // Indices into `multinames`.
  exceptionType: number;
  variableName: number;
}

export const AbcMultinameKind = {
  Multiname: 0x09,
  MultinameA: 0x0e,
  MultinameL: 0x1b,
  MultinameLA: 0x1c,
  QName: 0x07,
  QNameA: 0x0d,
  RtqName: 0x0f,
  RtqNameA: 0x10,
  RtqNameL: 0x11,
  RtqNameLA: 0x12,
  TypeName: 0x1d,
} as const;

export type AbcMultinameKind = (typeof AbcMultinameKind)[keyof typeof AbcMultinameKind];

export const AbcTraitKind = {
  Class: 4,
  Const: 6,
  Function: 5,
  Getter: 2,
  Method: 1,
  Setter: 3,
  Slot: 0,
} as const;

export type AbcTraitKind = (typeof AbcTraitKind)[keyof typeof AbcTraitKind];

// One decoded instruction. `operands` holds the values in the order the opcode declares them, already
// widened from the format's variable-length encodings, so a consumer reads them positionally without
// knowing how they were stored. `offset` is the instruction's byte position within its method body, which
// is what branch and exception targets refer to.
export interface AbcInstruction {
  offset: number;
  opcode: number;
  operands: number[];
}

// The AVM2 instruction set, by opcode byte. Transcribed from the published bytecode format description —
// an opcode's number and the shape of its operands are facts about the format, and nothing here derives
// from any implementation of it.
export const AbcOpcode = {
  Add: 0xa0,
  AddInt: 0xc5,
  ApplyType: 0x53,
  AsType: 0x86,
  AsTypeLate: 0x87,
  BitAnd: 0xa8,
  BitNot: 0x97,
  BitOr: 0xa9,
  BitXor: 0xaa,
  Breakpoint: 0x01,
  BreakpointLine: 0xf2,
  Call: 0x41,
  CallMethod: 0x43,
  CallProperty: 0x46,
  CallPropLex: 0x4c,
  CallPropVoid: 0x4f,
  CallStatic: 0x44,
  CallSuper: 0x45,
  CallSuperVoid: 0x4e,
  CheckFilter: 0x78,
  Coerce: 0x80,
  CoerceAny: 0x82,
  // The typed coerce forms are deprecated in favour of `coerce` with an explicit type, but compilers
  // still emit them and a walk that does not know them desynchronizes.
  CoerceBoolean: 0x81,
  CoerceDouble: 0x84,
  CoerceInt: 0x83,
  CoerceObject: 0x89,
  CoerceString: 0x85,
  CoerceUint: 0x88,
  Construct: 0x42,
  ConstructProp: 0x4a,
  ConstructSuper: 0x49,
  ConvertBoolean: 0x76,
  ConvertDouble: 0x75,
  ConvertInt: 0x73,
  ConvertObject: 0x77,
  ConvertString: 0x70,
  ConvertUint: 0x74,
  Debug: 0xef,
  DebugFile: 0xf1,
  DebugLine: 0xf0,
  DecLocal: 0x94,
  DecLocalInt: 0xc3,
  Decrement: 0x93,
  DecrementInt: 0xc1,
  DeleteProperty: 0x6a,
  Divide: 0xa3,
  Dup: 0x2a,
  Dxns: 0x06,
  DxnsLate: 0x07,
  Equals: 0xab,
  FindDef: 0x5f,
  FindProperty: 0x5e,
  FindPropStrict: 0x5d,
  GetDescendants: 0x59,
  GetGlobalScope: 0x64,
  GetGlobalSlot: 0x6e,
  GetLex: 0x60,
  GetLocal: 0x62,
  GetLocal0: 0xd0,
  GetLocal1: 0xd1,
  GetLocal2: 0xd2,
  GetLocal3: 0xd3,
  GetProperty: 0x66,
  GetScopeObject: 0x65,
  GetSlot: 0x6c,
  GetSuper: 0x04,
  GreaterEquals: 0xb0,
  GreaterThan: 0xaf,
  HasNext: 0x1f,
  HasNext2: 0x32,
  IfEq: 0x13,
  IfFalse: 0x12,
  IfGe: 0x18,
  IfGt: 0x17,
  IfLe: 0x16,
  IfLt: 0x15,
  IfNe: 0x14,
  IfNge: 0x0f,
  IfNgt: 0x0e,
  IfNle: 0x0d,
  IfNlt: 0x0c,
  IfStrictEq: 0x19,
  IfStrictNe: 0x1a,
  IfTrue: 0x11,
  In: 0xb4,
  IncLocal: 0x92,
  IncLocalInt: 0xc2,
  Increment: 0x91,
  IncrementInt: 0xc0,
  InitProperty: 0x68,
  InstanceOf: 0xb1,
  IsType: 0xb2,
  IsTypeLate: 0xb3,
  Jump: 0x10,
  Kill: 0x08,
  Label: 0x09,
  LessEquals: 0xae,
  LessThan: 0xad,
  LoadFloat32: 0x38,
  LoadFloat64: 0x39,
  LoadInt16: 0x36,
  LoadInt32: 0x37,
  LoadInt8: 0x35,
  LookupSwitch: 0x1b,
  LShift: 0xa5,
  Modulo: 0xa4,
  Multiply: 0xa2,
  MultiplyInt: 0xc7,
  Negate: 0x90,
  NegateInt: 0xc4,
  NewActivation: 0x57,
  NewArray: 0x56,
  NewCatch: 0x5a,
  NewClass: 0x58,
  NewFunction: 0x40,
  NewObject: 0x55,
  NextName: 0x1e,
  NextValue: 0x23,
  Nop: 0x02,
  Not: 0x96,
  Pop: 0x29,
  PopScope: 0x1d,
  PushByte: 0x24,
  PushDouble: 0x2f,
  PushFalse: 0x27,
  PushInt: 0x2d,
  PushNamespace: 0x31,
  PushNan: 0x28,
  PushNull: 0x20,
  PushScope: 0x30,
  PushShort: 0x25,
  PushString: 0x2c,
  PushTrue: 0x26,
  PushUint: 0x2e,
  PushUndefined: 0x21,
  PushWith: 0x1c,
  ReturnValue: 0x48,
  ReturnVoid: 0x47,
  RShift: 0xa6,
  SetGlobalSlot: 0x6f,
  SetLocal: 0x63,
  SetLocal0: 0xd4,
  SetLocal1: 0xd5,
  SetLocal2: 0xd6,
  SetLocal3: 0xd7,
  SetProperty: 0x61,
  SetSlot: 0x6d,
  SetSuper: 0x05,
  SignExtend1: 0x50,
  SignExtend16: 0x52,
  SignExtend8: 0x51,
  StoreFloat32: 0x3d,
  StoreFloat64: 0x3e,
  StoreInt16: 0x3b,
  StoreInt32: 0x3c,
  StoreInt8: 0x3a,
  StrictEquals: 0xac,
  Subtract: 0xa1,
  SubtractInt: 0xc6,
  Swap: 0x2b,
  Throw: 0x03,
  Timestamp: 0xf3,
  TypeOf: 0x95,
  URShift: 0xa7,
} as const;

export type AbcOpcode = (typeof AbcOpcode)[keyof typeof AbcOpcode];
