import { runRegistryTool } from './registryTool';

function run(args: readonly string[]): { errors: string[]; exitCode: number; output: string[] } {
  const errors: string[] = [];
  const output: string[] = [];
  const exitCode = runRegistryTool(args, {
    writeError: (message) => errors.push(message),
    writeOutput: (message) => output.push(message),
  });
  return { errors, exitCode, output };
}

describe('runRegistryTool', () => {
  it('prints the deliberately empty built-in catalog as JSON', () => {
    expect(run(['catalog', '--json'])).toEqual({ errors: [], exitCode: 0, output: ['[]\n'] });
  });

  it('prints help successfully', () => {
    expect(run(['--help'])).toEqual({
      errors: [],
      exitCode: 0,
      output: ['Usage: tool-registry catalog --json\n'],
    });
  });

  it('rejects source-emission and unknown commands at the tool boundary', () => {
    expect(run(['generate'])).toEqual({
      errors: ['Usage: tool-registry catalog --json\n'],
      exitCode: 1,
      output: [],
    });
  });
});
