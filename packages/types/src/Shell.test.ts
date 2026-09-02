import type { ShellProcess, ShellProcessBackend, ShellProcessExitStatus, ShellProcessOptions } from './Shell';

describe('ShellProcess', () => {
  it('uses byte streams for standard input and output', () => {
    expectTypeOf<ShellProcess['stdin']>().toEqualTypeOf<WritableStream<Uint8Array>>();
    expectTypeOf<ShellProcess['stdout']>().toEqualTypeOf<ReadableStream<Uint8Array>>();
    expectTypeOf<ShellProcess['stderr']>().toEqualTypeOf<ReadableStream<Uint8Array>>();
  });

  it('exposes asynchronous exit status and explicit termination', () => {
    expectTypeOf<ShellProcess['exit']>().toEqualTypeOf<Promise<Readonly<ShellProcessExitStatus>>>();
    expectTypeOf<ShellProcess['terminate']>().toEqualTypeOf<() => void>();
  });
});

describe('ShellProcessBackend', () => {
  it('spawns one process from an argument vector and optional process options', () => {
    expectTypeOf<ShellProcessBackend['spawn']>().parameters.toEqualTypeOf<
      [string, readonly string[], Readonly<ShellProcessOptions>?]
    >();
    expectTypeOf<ShellProcessBackend['spawn']>().returns.toEqualTypeOf<ShellProcess>();
  });
});
