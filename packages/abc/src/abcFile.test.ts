// Generated from crates/flight-abc/tests/abc_file_test.rs by flight-compiler.
// Rust is authoritative; run `npm run generate` after changing it.

import { describe, expect, it } from 'vitest';

import { AbcMultinameKind, AbcTraitKind, readAbcFile } from './contract.ts';
import type { AbcNamespace, AbcOptionalValue } from './contract.ts';

describe('readAbcFile', () => {
  function buildAbc(): Uint8Array {
    let bytes: number[] = [];
    function pushDouble(bytes: number[], value: number): void {
      {
        const source = (() => {
          const __b = new Uint8Array(8);
          new DataView(__b.buffer).setFloat64(0, value, true);
          return __b;
        })();
        for (let index = 0, count = source.length; index < count; index++) {
          bytes.push(source[index]);
        }
      }
    }
    function pushString(bytes: number[], value: string): void {
      pushU30(bytes, value.length);
      {
        const source = new TextEncoder().encode(value);
        for (let index = 0, count = source.length; index < count; index++) {
          bytes.push(source[index]);
        }
      }
    }
    function pushU16(bytes: number[], value: number): void {
      {
        const source = (() => {
          const __b = new Uint8Array(2);
          new DataView(__b.buffer).setUint16(0, value, true);
          return __b;
        })();
        for (let index = 0, count = source.length; index < count; index++) {
          bytes.push(source[index]);
        }
      }
    }
    function pushU30(bytes: number[], value: number): void {
      let remaining = value;
      for (;;) {
        const byte_ = (remaining % 0x80) & 0xff;
        remaining = Math.trunc(remaining / 0x80);
        bytes.push(remaining > 0 ? byte_ | 0x80 : byte_);
        if (remaining === 0) {
          break;
        }
      }
    }
    pushU16(bytes, 16);
    pushU16(bytes, 46);
    pushU30(bytes, 2);
    pushU30(bytes, 0xfffffff9);
    pushU30(bytes, 2);
    pushU30(bytes, 9);
    pushU30(bytes, 2);
    pushDouble(bytes, 1.5);
    pushU30(bytes, 4);
    pushString(bytes, 'Main');
    pushString(bytes, 'stop');
    pushString(bytes, 'flash.display');
    pushU30(bytes, 2);
    bytes.push(0x16);
    pushU30(bytes, 3);
    pushU30(bytes, 2);
    pushU30(bytes, 1);
    pushU30(bytes, 1);
    pushU30(bytes, 3);
    bytes.push(AbcMultinameKind.QName & 0xff);
    pushU30(bytes, 1);
    pushU30(bytes, 1);
    bytes.push(AbcMultinameKind.Multiname & 0xff);
    pushU30(bytes, 2);
    pushU30(bytes, 1);
    pushU30(bytes, 2);
    pushU30(bytes, 0);
    pushU30(bytes, 0);
    pushU30(bytes, 2);
    bytes.push(0);
    pushU30(bytes, 1);
    pushU30(bytes, 0);
    pushU30(bytes, 1);
    pushU30(bytes, 1);
    bytes.push(0x08 | 0x80);
    pushU30(bytes, 1);
    pushU30(bytes, 1);
    bytes.push(0x03);
    pushU30(bytes, 1);
    pushU30(bytes, 0);
    pushU30(bytes, 1);
    pushU30(bytes, 1);
    pushU30(bytes, 1);
    bytes.push(0);
    pushU30(bytes, 0);
    pushU30(bytes, 1);
    pushU30(bytes, 1);
    pushU30(bytes, 2);
    bytes.push(AbcTraitKind.Method & 0xff);
    pushU30(bytes, 0);
    pushU30(bytes, 0);
    pushU30(bytes, 0);
    pushU30(bytes, 0);
    pushU30(bytes, 1);
    pushU30(bytes, 0);
    pushU30(bytes, 0);
    pushU30(bytes, 1);
    pushU30(bytes, 0);
    pushU30(bytes, 2);
    pushU30(bytes, 1);
    pushU30(bytes, 1);
    pushU30(bytes, 2);
    pushU30(bytes, 3);
    bytes.push(0xd0);
    bytes.push(0x30);
    bytes.push(0x47);
    pushU30(bytes, 0);
    pushU30(bytes, 0);
    return new Uint8Array(bytes);
  }
  it('never panics on arbitrary bytes', () => {
    const seed: { value: number } = { value: 0x2f6a51b3 };
    function next(seed: { value: number }): number {
      seed.value = ((Math.imul(seed.value, 1664525) >>> 0) + 1013904223) >>> 0;
      return seed.value >>> 0;
    }
    for (let _ = 0; _ < 500; _++) {
      const length = (next(seed) % 200) >>> 0;
      let bytes = new Array(length).fill(0);
      for (let __i = 0; __i < bytes.length; __i++) {
        bytes[__i] = next(seed) & 0xff;
      }
      readAbcFile(new Uint8Array(bytes));
    }
    for (let _ = 0; _ < 500; _++) {
      let mutant = buildAbc();
      for (let _ = 0; _ < 3; _++) {
        const index = (next(seed) >>> 0) % mutant.length;
        mutant[index] = next(seed) & 0xff;
      }
      readAbcFile(new Uint8Array(mutant));
    }
  });
  it('reads instances and classes as parallel lists sharing one count', () => {
    const file = readAbcFile(new Uint8Array(buildAbc()))!;
    expect(file.instances.length).toEqual(1);
    expect(file.classes.length).toEqual(1);
    expect(file.instances[0].initializer).toEqual(1);
    expect(file.instances[0].name).toEqual(1);
    expect(file.instances[0].superName).toEqual(1);
    expect(file.instances[0].traits[0].kind).toEqual(AbcTraitKind.Method & 0xff);
    expect(file.instances[0].traits[0].methodIndex).toEqual(0);
    expect(file.classes[0].initializer).toEqual(0);
  });
  it('reads methods with optional defaults and parameter names', () => {
    const file = readAbcFile(new Uint8Array(buildAbc()))!;
    expect(file.methods.length).toEqual(2);
    expect(file.methods[0].name).toEqual(2);
    expect(file.methods[0].parameterTypes).toEqual([] as never[]);
    expect(file.methods[0].returnType).toEqual(0);
    expect(file.methods[1].optionalValues).toEqual([{ kind: 0x03, value: 1 }]);
    expect(file.methods[1].parameterNames).toEqual([1]);
  });
  it('reads namespaces namespace sets and both multiname shapes', () => {
    const file = readAbcFile(new Uint8Array(buildAbc()))!;
    expect(file.constantPool.namespaces[1]).toEqual({ kind: 0x16, name: 3 });
    expect(file.constantPool.namespaceSets[1]).toEqual([1]);
    const qualified = file.constantPool.multinames[1];
    expect(qualified.kind).toEqual(AbcMultinameKind.QName & 0xff);
    expect(qualified.namespace).toEqual(1);
    expect(file.constantPool.strings[qualified.name]).toEqual('Main');
    const multiname = file.constantPool.multinames[2];
    expect(multiname.kind).toEqual(AbcMultinameKind.Multiname & 0xff);
    expect(file.constantPool.strings[multiname.name]).toEqual('stop');
    expect(multiname.namespaceSet).toEqual(1);
  });
  it('reads script and method body tables keeping instruction bytes unparsed', () => {
    const file = readAbcFile(new Uint8Array(buildAbc()))!;
    expect(file.scripts[0].initializer).toEqual(0);
    expect(file.methodBodies.length).toEqual(1);
    const body = file.methodBodies[0];
    expect(body.localCount).toEqual(1);
    expect(body.maxStack).toEqual(2);
    expect(body.method).toEqual(0);
    expect(Array.from(body.code)).toEqual([0xd0, 0x30, 0x47]);
    expect(body.exceptions.length === 0).toBe(true);
  });
  it('reads version and whole constant pool with reserved zero entry', () => {
    const file = readAbcFile(new Uint8Array(buildAbc()))!;
    expect(file.minorVersion).toEqual(16);
    expect(file.majorVersion).toEqual(46);
    expect(file.constantPool.strings[0]).toEqual('');
    expect(Array.from(file.constantPool.strings.slice(1))).toEqual(['Main', 'stop', 'flash.display']);
    expect(file.constantPool.integers).toEqual([0, -7]);
    expect(file.constantPool.unsignedIntegers).toEqual([0, 9]);
    expect(Math.abs(file.constantPool.doubles[1] - 1.5) < Number.EPSILON).toBe(true);
  });
  it('rejects a multiname with an undefined kind', () => {
    let bytes = buildAbc();
    const index =
      ((i) => (i === -1 ? undefined : i))(
        bytes.slice(20).findIndex((value) => value === (AbcMultinameKind.QName & 0xff)),
      )! + 20;
    bytes[index] = 0x7f;
    expect(readAbcFile(new Uint8Array(bytes)) === null).toBe(true);
  });
  it('returns none instead of panicking for an unreadable container', () => {
    expect(readAbcFile(new Uint8Array([])) === null).toBe(true);
    expect(readAbcFile(new Uint8Array([0x10, 0x00, 0x2e, 0x00])) === null).toBe(true);
    const bytes = buildAbc();
    expect(readAbcFile(new Uint8Array(bytes.slice(0, 12))) === null).toBe(true);
  });
});
