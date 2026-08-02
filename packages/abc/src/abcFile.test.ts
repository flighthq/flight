import { AbcMultinameKind, AbcTraitKind } from '@flighthq/types/contract';

import { readAbcFile } from './abcFile';

describe('readAbcFile', () => {
  it('reads the version and the whole constant pool, keeping the reserved zero entry', () => {
    const file = readAbcFile(buildAbc());

    expect(file?.minorVersion).toBe(16);
    expect(file?.majorVersion).toBe(46);
    // Index 0 of every pool is the placeholder the format reserves, so pool indices in the file's own
    // records can be used directly.
    expect(file?.constantPool.strings[0]).toBe('');
    expect(file?.constantPool.strings.slice(1)).toEqual(['Main', 'stop', 'flash.display']);
    expect(file?.constantPool.integers).toEqual([0, -7]);
    expect(file?.constantPool.unsignedIntegers).toEqual([0, 9]);
    expect(file?.constantPool.doubles[1]).toBeCloseTo(1.5);
  });

  it('reads namespaces, namespace sets, and both multiname shapes', () => {
    const file = readAbcFile(buildAbc());

    expect(file?.constantPool.namespaces[1]).toEqual({ kind: 0x16, name: 3 });
    expect(file?.constantPool.namespaceSets[1]).toEqual([1]);

    const qualified = file!.constantPool.multinames[1];
    expect(qualified.kind).toBe(AbcMultinameKind.QName);
    expect(qualified.namespace).toBe(1);
    expect(file?.constantPool.strings[qualified.name]).toBe('Main');

    const multiname = file!.constantPool.multinames[2];
    expect(multiname.kind).toBe(AbcMultinameKind.Multiname);
    expect(file?.constantPool.strings[multiname.name]).toBe('stop');
    expect(multiname.namespaceSet).toBe(1);
  });

  it('reads methods with their optional defaults and parameter names', () => {
    const file = readAbcFile(buildAbc());

    expect(file?.methods).toHaveLength(2);
    expect(file?.methods[0]).toMatchObject({ name: 2, parameterTypes: [], returnType: 0 });
    expect(file?.methods[1].optionalValues).toEqual([{ kind: 0x03, value: 1 }]);
    expect(file?.methods[1].parameterNames).toEqual([1]);
  });

  it('reads instances and classes as parallel lists sharing one count', () => {
    const file = readAbcFile(buildAbc());

    expect(file?.instances).toHaveLength(1);
    expect(file?.classes).toHaveLength(1);
    expect(file?.instances[0]).toMatchObject({ initializer: 1, name: 1, superName: 1 });
    expect(file?.instances[0].traits[0]).toMatchObject({ kind: AbcTraitKind.Method, methodIndex: 0 });
    expect(file?.classes[0].initializer).toBe(0);
  });

  it('reads script and method-body tables, keeping instruction bytes unparsed', () => {
    const file = readAbcFile(buildAbc());

    expect(file?.scripts[0]).toMatchObject({ initializer: 0 });
    expect(file?.methodBodies).toHaveLength(1);
    const body = file!.methodBodies[0];
    expect(body).toMatchObject({ localCount: 1, maxStack: 2, method: 0 });
    // The instruction stream is handed back whole: decoding it needs an opcode table and is a later step.
    expect([...body.code]).toEqual([0xd0, 0x30, 0x47]);
    expect(body.exceptions).toEqual([]);
  });

  it('returns null rather than throwing for input that is not a readable container', () => {
    expect(readAbcFile(new Uint8Array())).toBeNull();
    expect(readAbcFile(new Uint8Array([0x10, 0x00, 0x2e, 0x00]))).toBeNull();
    // Truncated part-way through the constant pool.
    expect(readAbcFile(buildAbc().subarray(0, 12))).toBeNull();
  });

  it('never throws on arbitrary bytes, whatever they happen to encode', () => {
    // The reader's whole error contract is a null sentinel, and a container this size is mostly counts
    // and indices, so the property worth asserting is that no byte sequence produces an exception.
    let seed = 0x2f6a51b3;
    const next = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed;
    };

    for (let i = 0; i < 500; i++) {
      const bytes = new Uint8Array(next() % 200);
      for (let b = 0; b < bytes.length; b++) bytes[b] = next() & 0xff;
      expect(() => readAbcFile(bytes)).not.toThrow();
    }
    // And the same for mutations of a file that is otherwise well formed.
    for (let i = 0; i < 500; i++) {
      const mutant = buildAbc();
      for (let f = 0; f < 3; f++) mutant[next() % mutant.length] = next() & 0xff;
      expect(() => readAbcFile(mutant)).not.toThrow();
    }
  });

  it('rejects a multiname whose kind the format does not define', () => {
    const bytes = buildAbc();
    // Overwrite the first multiname's kind byte with one no version of the format uses.
    const index = bytes.indexOf(AbcMultinameKind.QName, 20);
    bytes[index] = 0x7f;

    expect(readAbcFile(bytes)).toBeNull();
  });
});

// Builds a small but structurally complete ABC file: three strings, one namespace and set, two multinames,
// two methods (one with an optional default and a parameter name), one class and instance with a method
// trait, one script, and one method body whose code is `getlocal_0; pushscope; returnvoid`.
function buildAbc(): Uint8Array {
  const bytes: number[] = [];
  const u8 = (value: number): void => void bytes.push(value & 0xff);
  const u16 = (value: number): void => {
    u8(value);
    u8(value >> 8);
  };
  const u30 = (value: number): void => {
    let remaining = value;
    do {
      const byte = remaining % 0x80;
      remaining = Math.floor(remaining / 0x80);
      u8(remaining > 0 ? byte | 0x80 : byte);
    } while (remaining > 0);
  };
  const str = (value: string): void => {
    const encoded = new TextEncoder().encode(value);
    u30(encoded.length);
    for (const byte of encoded) u8(byte);
  };
  const double = (value: number): void => {
    const buffer = new ArrayBuffer(8);
    new DataView(buffer).setFloat64(0, value, true);
    for (const byte of new Uint8Array(buffer)) u8(byte);
  };

  u16(16); // minor version
  u16(46); // major version

  u30(2); // int pool: one entry after the reserved slot
  // A signed constant is written as its full 32-bit two's complement in the same seven-bits-per-byte
  // form, so -7 occupies five bytes rather than one.
  u30(0xfffffff9);
  u30(2); // uint pool
  u30(9);
  u30(2); // double pool
  double(1.5);
  u30(4); // string pool
  str('Main');
  str('stop');
  str('flash.display');
  u30(2); // namespace pool
  u8(0x16);
  u30(3);
  u30(2); // namespace set pool
  u30(1);
  u30(1);
  u30(3); // multiname pool
  u8(AbcMultinameKind.QName);
  u30(1);
  u30(1);
  u8(AbcMultinameKind.Multiname);
  u30(2);
  u30(1);

  u30(2); // method count
  u30(0); // no parameters
  u30(0); // return type
  u30(2); // name -> 'stop'
  u8(0); // flags
  u30(1); // one parameter
  u30(0);
  u30(1);
  u30(1);
  u8(0x08 | 0x80); // has optional defaults, has parameter names
  u30(1);
  u30(1); // optional value index
  u8(0x03); // optional value kind
  u30(1); // parameter name

  u30(0); // metadata count

  u30(1); // class count
  u30(1); // instance name
  u30(1); // super name
  u8(0); // flags
  u30(0); // interface count
  u30(1); // instance initializer
  u30(1); // trait count
  u30(2); // trait name
  u8(AbcTraitKind.Method);
  u30(0); // dispatch id
  u30(0); // method index
  u30(0); // class initializer
  u30(0); // class trait count

  u30(1); // script count
  u30(0); // script initializer
  u30(0); // script trait count

  u30(1); // method body count
  u30(0); // method
  u30(2); // max stack
  u30(1); // local count
  u30(1); // init scope depth
  u30(2); // max scope depth
  u30(3); // code length
  u8(0xd0);
  u8(0x30);
  u8(0x47);
  u30(0); // exception count
  u30(0); // trait count

  return new Uint8Array(bytes);
}
