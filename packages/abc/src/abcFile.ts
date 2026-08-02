import type {
  AbcClass,
  AbcConstantPool,
  AbcException,
  AbcFile,
  AbcInstance,
  AbcMetadata,
  AbcMetadataItem,
  AbcMethod,
  AbcMethodBody,
  AbcMultiname,
  AbcNamespace,
  AbcOptionalValue,
  AbcScript,
  AbcTrait,
} from '@flighthq/types/contract';
import { AbcMultinameKind, AbcTraitKind } from '@flighthq/types/contract';

// Reads an ABC (AVM2 bytecode) container into plain data, or null when the bytes are not a readable one.
// This parses; it never executes. What comes back is the file's own tables — constant pool, methods,
// classes, instances, scripts, and method bodies — with every cross-reference left as the index the format
// stored, so a consumer resolves only what it needs.
//
// Method bodies keep their instruction stream as raw bytes. Decoding instructions needs the whole opcode
// table and belongs in its own step, so a caller that only wants class names or trait layout never pays
// for it.
export function readAbcFile(source: Uint8Array): AbcFile | null {
  const reader = new AbcReader(source);
  const minorVersion = reader.readUint16();
  const majorVersion = reader.readUint16();
  if (!reader.valid) return null;

  const constantPool = readAbcConstantPool(reader);
  if (constantPool === null) return null;

  const methods: AbcMethod[] = [];
  const methodCount = reader.readVarUint();
  if (!reader.valid || methodCount > MAX_ENTRIES) return null;
  for (let i = 0; i < methodCount; i++) {
    const method = readAbcMethod(reader);
    if (method === null) return null;
    methods.push(method);
  }

  const metadata: AbcMetadata[] = [];
  const metadataCount = reader.readVarUint();
  if (!reader.valid || metadataCount > MAX_ENTRIES) return null;
  for (let i = 0; i < metadataCount; i++) {
    const entry = readAbcMetadata(reader);
    if (entry === null) return null;
    metadata.push(entry);
  }

  // Instances and classes are parallel lists sharing one count: every class has exactly one instance, and
  // the format writes all instances before all classes.
  const classCount = reader.readVarUint();
  if (!reader.valid || classCount > MAX_ENTRIES) return null;
  const instances: AbcInstance[] = [];
  for (let i = 0; i < classCount; i++) {
    const instance = readAbcInstance(reader);
    if (instance === null) return null;
    instances.push(instance);
  }
  const classes: AbcClass[] = [];
  for (let i = 0; i < classCount; i++) {
    const initializer = reader.readVarUint();
    const traits = readAbcTraits(reader);
    if (traits === null) return null;
    classes.push({ initializer, traits });
  }

  const scripts: AbcScript[] = [];
  const scriptCount = reader.readVarUint();
  if (!reader.valid || scriptCount > MAX_ENTRIES) return null;
  for (let i = 0; i < scriptCount; i++) {
    const initializer = reader.readVarUint();
    const traits = readAbcTraits(reader);
    if (traits === null) return null;
    scripts.push({ initializer, traits });
  }

  const methodBodies: AbcMethodBody[] = [];
  const bodyCount = reader.readVarUint();
  if (!reader.valid || bodyCount > MAX_ENTRIES) return null;
  for (let i = 0; i < bodyCount; i++) {
    const body = readAbcMethodBody(reader);
    if (body === null) return null;
    methodBodies.push(body);
  }

  return reader.valid
    ? { classes, constantPool, instances, majorVersion, metadata, methodBodies, methods, minorVersion, scripts }
    : null;
}

// Every constant pool is 1-based: the format writes a count that is one more than the number of entries
// stored, and index 0 is a reserved placeholder no entry ever occupies. The placeholders are materialized
// here so a consumer can index the arrays directly with the indices the file carries.
function readAbcConstantPool(reader: AbcReader): AbcConstantPool | null {
  const integers = [0];
  if (!readAbcPool(reader, integers, () => reader.readVarInt())) return null;
  const unsignedIntegers = [0];
  if (!readAbcPool(reader, unsignedIntegers, () => reader.readVarUint())) return null;
  const doubles = [Number.NaN];
  if (!readAbcPool(reader, doubles, () => reader.readDouble())) return null;
  const strings = [''];
  if (!readAbcPool(reader, strings, () => reader.readString())) return null;

  const namespaces: AbcNamespace[] = [{ kind: 0, name: 0 }];
  if (!readAbcPool(reader, namespaces, () => ({ kind: reader.readUint8(), name: reader.readVarUint() }))) return null;

  const namespaceSets: number[][] = [[]];
  if (
    !readAbcPool(reader, namespaceSets, () => {
      const count = reader.readVarUint();
      if (count > MAX_ENTRIES) return null;
      const set: number[] = [];
      for (let i = 0; i < count; i++) set.push(reader.readVarUint());
      return set;
    })
  ) {
    return null;
  }

  const multinames: AbcMultiname[] = [createAbcMultiname(0)];
  if (!readAbcPool(reader, multinames, () => readAbcMultiname(reader))) return null;

  return reader.valid ? { doubles, integers, multinames, namespaceSets, namespaces, strings, unsignedIntegers } : null;
}

function readAbcPool<T>(reader: AbcReader, out: T[], read: () => T | null): boolean {
  const count = reader.readVarUint();
  if (!reader.valid || count > MAX_ENTRIES) return false;
  for (let i = 1; i < count; i++) {
    const entry = read();
    if (entry === null || !reader.valid) return false;
    out.push(entry);
  }
  return true;
}

function createAbcMultiname(kind: number): AbcMultiname {
  return { kind, name: 0, namespace: 0, namespaceSet: 0, parameters: [], typeName: 0 };
}

function readAbcMultiname(reader: AbcReader): AbcMultiname | null {
  const multiname = createAbcMultiname(reader.readUint8());
  if (multiname.kind === AbcMultinameKind.QName || multiname.kind === AbcMultinameKind.QNameA) {
    multiname.namespace = reader.readVarUint();
    multiname.name = reader.readVarUint();
  } else if (multiname.kind === AbcMultinameKind.RtqName || multiname.kind === AbcMultinameKind.RtqNameA) {
    multiname.name = reader.readVarUint();
  } else if (multiname.kind === AbcMultinameKind.RtqNameL || multiname.kind === AbcMultinameKind.RtqNameLA) {
    // Both parts come off the operand stack at runtime, so the record carries nothing.
  } else if (multiname.kind === AbcMultinameKind.Multiname || multiname.kind === AbcMultinameKind.MultinameA) {
    multiname.name = reader.readVarUint();
    multiname.namespaceSet = reader.readVarUint();
  } else if (multiname.kind === AbcMultinameKind.MultinameL || multiname.kind === AbcMultinameKind.MultinameLA) {
    multiname.namespaceSet = reader.readVarUint();
  } else if (multiname.kind === AbcMultinameKind.TypeName) {
    multiname.typeName = reader.readVarUint();
    const count = reader.readVarUint();
    if (count > MAX_ENTRIES) return null;
    for (let i = 0; i < count; i++) multiname.parameters.push(reader.readVarUint());
  } else {
    return null;
  }
  return reader.valid ? multiname : null;
}

function readAbcMethod(reader: AbcReader): AbcMethod | null {
  const parameterCount = reader.readVarUint();
  if (!reader.valid || parameterCount > MAX_ENTRIES) return null;
  const returnType = reader.readVarUint();
  const parameterTypes: number[] = [];
  for (let i = 0; i < parameterCount; i++) parameterTypes.push(reader.readVarUint());
  const name = reader.readVarUint();
  const flags = reader.readUint8();
  if (!reader.valid) return null;

  const optionalValues: AbcOptionalValue[] = [];
  if ((flags & METHOD_HAS_OPTIONAL) !== 0) {
    const count = reader.readVarUint();
    if (!reader.valid || count > MAX_ENTRIES) return null;
    for (let i = 0; i < count; i++) optionalValues.push({ kind: 0, value: reader.readVarUint() });
    for (const optional of optionalValues) optional.kind = reader.readUint8();
  }

  const parameterNames: number[] = [];
  if ((flags & METHOD_HAS_PARAM_NAMES) !== 0) {
    for (let i = 0; i < parameterCount; i++) parameterNames.push(reader.readVarUint());
  }
  return reader.valid ? { flags, name, optionalValues, parameterNames, parameterTypes, returnType } : null;
}

function readAbcMetadata(reader: AbcReader): AbcMetadata | null {
  const name = reader.readVarUint();
  const count = reader.readVarUint();
  if (!reader.valid || count > MAX_ENTRIES) return null;
  const items: AbcMetadataItem[] = [];
  for (let i = 0; i < count; i++) items.push({ key: reader.readVarUint(), value: reader.readVarUint() });
  return reader.valid ? { items, name } : null;
}

function readAbcInstance(reader: AbcReader): AbcInstance | null {
  const name = reader.readVarUint();
  const superName = reader.readVarUint();
  const flags = reader.readUint8();
  const protectedNamespace = (flags & INSTANCE_PROTECTED_NAMESPACE) !== 0 ? reader.readVarUint() : 0;
  const interfaceCount = reader.readVarUint();
  if (!reader.valid || interfaceCount > MAX_ENTRIES) return null;
  const interfaces: number[] = [];
  for (let i = 0; i < interfaceCount; i++) interfaces.push(reader.readVarUint());
  const initializer = reader.readVarUint();
  const traits = readAbcTraits(reader);
  if (traits === null) return null;
  return { flags, initializer, interfaces, name, protectedNamespace, superName, traits };
}

function readAbcTraits(reader: AbcReader): AbcTrait[] | null {
  const count = reader.readVarUint();
  if (!reader.valid || count > MAX_ENTRIES) return null;
  const traits: AbcTrait[] = [];
  for (let i = 0; i < count; i++) {
    const trait = readAbcTrait(reader);
    if (trait === null) return null;
    traits.push(trait);
  }
  return traits;
}

function readAbcTrait(reader: AbcReader): AbcTrait | null {
  const name = reader.readVarUint();
  const packed = reader.readUint8();
  if (!reader.valid) return null;
  const kind = packed & 0x0f;
  const trait: AbcTrait = {
    attributes: packed >> 4,
    classIndex: 0,
    dispatchId: 0,
    kind,
    metadata: [],
    methodIndex: 0,
    name,
    slotId: 0,
    typeName: 0,
    valueIndex: 0,
    valueKind: 0,
  };

  if (kind === AbcTraitKind.Slot || kind === AbcTraitKind.Const) {
    trait.slotId = reader.readVarUint();
    trait.typeName = reader.readVarUint();
    trait.valueIndex = reader.readVarUint();
    // A default of index 0 has no kind byte, because there is no value to name a pool for.
    if (trait.valueIndex !== 0) trait.valueKind = reader.readUint8();
  } else if (kind === AbcTraitKind.Class) {
    trait.slotId = reader.readVarUint();
    trait.classIndex = reader.readVarUint();
  } else if (kind === AbcTraitKind.Function) {
    trait.slotId = reader.readVarUint();
    trait.methodIndex = reader.readVarUint();
  } else if (kind === AbcTraitKind.Method || kind === AbcTraitKind.Getter || kind === AbcTraitKind.Setter) {
    trait.dispatchId = reader.readVarUint();
    trait.methodIndex = reader.readVarUint();
  } else {
    return null;
  }

  if ((trait.attributes & TRAIT_ATTRIBUTE_METADATA) !== 0) {
    const count = reader.readVarUint();
    if (!reader.valid || count > MAX_ENTRIES) return null;
    for (let i = 0; i < count; i++) trait.metadata.push(reader.readVarUint());
  }
  return reader.valid ? trait : null;
}

function readAbcMethodBody(reader: AbcReader): AbcMethodBody | null {
  const method = reader.readVarUint();
  const maxStack = reader.readVarUint();
  const localCount = reader.readVarUint();
  const initScopeDepth = reader.readVarUint();
  const maxScopeDepth = reader.readVarUint();
  const codeLength = reader.readVarUint();
  if (!reader.valid || codeLength > reader.remaining()) return null;
  const code = reader.readBytes(codeLength);

  const exceptionCount = reader.readVarUint();
  if (!reader.valid || exceptionCount > MAX_ENTRIES) return null;
  const exceptions: AbcException[] = [];
  for (let i = 0; i < exceptionCount; i++) {
    exceptions.push({
      exceptionType: 0,
      from: reader.readVarUint(),
      target: 0,
      to: reader.readVarUint(),
      variableName: 0,
    });
    const exception = exceptions[i];
    exception.target = reader.readVarUint();
    exception.exceptionType = reader.readVarUint();
    exception.variableName = reader.readVarUint();
  }

  const traits = readAbcTraits(reader);
  if (traits === null) return null;
  return { code, exceptions, initScopeDepth, localCount, maxScopeDepth, maxStack, method, traits };
}

// A bounded little-endian reader over the primitives ABC is written in. Like the rest of Flight's byte
// readers it reports an overrun through `valid` rather than throwing, so a caller checks once after a
// group of reads instead of testing each one.
class AbcReader {
  pos = 0;
  valid = true;

  constructor(readonly source: Uint8Array) {}

  readBytes(count: number): Uint8Array {
    if (this.pos + count > this.source.length) {
      this.valid = false;
      return new Uint8Array(0);
    }
    const value = this.source.subarray(this.pos, this.pos + count);
    this.pos += count;
    return value;
  }

  readDouble(): number {
    if (this.pos + 8 > this.source.length) {
      this.valid = false;
      return 0;
    }
    const value = new DataView(this.source.buffer, this.source.byteOffset + this.pos, 8).getFloat64(0, true);
    this.pos += 8;
    return value;
  }

  // The format's variable-length integer: seven bits per byte, least significant group first, at most five
  // bytes. Read as a signed 32-bit value.
  readVarInt(): number {
    return this.readVarUint() | 0;
  }

  readString(): string {
    const length = this.readVarUint();
    return this.valid ? _decoder.decode(this.readBytes(length)) : '';
  }

  readUint8(): number {
    if (this.pos >= this.source.length) {
      this.valid = false;
      return 0;
    }
    return this.source[this.pos++];
  }

  readUint16(): number {
    const low = this.readUint8();
    return low + this.readUint8() * 0x100;
  }

  readVarUint(): number {
    let value = 0;
    for (let i = 0; i < VAR_UINT_MAX_BYTES; i++) {
      const byte = this.readUint8();
      value += (byte & 0x7f) * 2 ** (7 * i);
      if ((byte & 0x80) === 0) break;
    }
    return this.valid ? value : 0;
  }

  remaining(): number {
    return this.source.length - this.pos;
  }
}

const INSTANCE_PROTECTED_NAMESPACE = 0x08;
const MAX_ENTRIES = 1_000_000;
const METHOD_HAS_OPTIONAL = 0x08;
const METHOD_HAS_PARAM_NAMES = 0x80;
const TRAIT_ATTRIBUTE_METADATA = 0x04;
const VAR_UINT_MAX_BYTES = 5;
const _decoder = new TextDecoder();
