import type { ShellProcess, HostShellProcessCapability, ShellProcessExitStatus, ShellProcessOptions } from './Shell.ts';

describe('HostShellProcessCapability', () => {
  it('spawns one process from an argument vector and optional process options', () => {
    expectTypeOf<HostShellProcessCapability['spawn']>().parameters.toEqualTypeOf<
      [string, readonly string[], Readonly<ShellProcessOptions>?]
    >();
    expectTypeOf<HostShellProcessCapability['spawn']>().returns.toEqualTypeOf<ShellProcess>();
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
