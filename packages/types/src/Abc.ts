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
