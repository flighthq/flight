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
  it('prints the built-in catalog as JSON a consumer can parse and act on', () => {
    const result = run(['catalog', '--json']);
    expect(result.exitCode).toBe(0);
    expect(result.errors).toEqual([]);
    const rows = JSON.parse(result.output.join('')) as readonly Record<string, string>[];
    // The catalog ships populated, so this asserts the CLI relays real rows rather than an empty list.
    // Shape, not count: a row added to a format family must not fail an unrelated CLI test.
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.backend).toBe('parser');
      expect(row.facet).toBe('document.format');
      expect(row.kind).toMatch(/^(swf|awd2)\./);
      expect(row.implementationSymbol.length).toBeGreaterThan(0);
    }
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
