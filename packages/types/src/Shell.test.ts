import type { ShellProcess, HostShellProcessProvider, ShellProcessExitStatus, ShellProcessOptions } from './Shell';

describe('HostShellProcessProvider', () => {
  it('spawns one process from an argument vector and optional process options', () => {
    expectTypeOf<HostShellProcessProvider['spawn']>().parameters.toEqualTypeOf<
      [string, readonly string[], Readonly<ShellProcessOptions>?]
    >();
    expectTypeOf<HostShellProcessProvider['spawn']>().returns.toEqualTypeOf<ShellProcess>();
  });
});

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
