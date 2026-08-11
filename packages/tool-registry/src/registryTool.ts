import { BUILT_IN_REGISTRY_CATALOG_ENTRIES } from '@flighthq/registry-catalog/contract';

export interface RegistryToolIO {
  readonly writeError: (message: string) => void;
  readonly writeOutput: (message: string) => void;
}

const USAGE = 'Usage: tool-registry catalog --json\n';

export function runRegistryTool(args: readonly string[], io: Readonly<RegistryToolIO>): number {
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
    io.writeOutput(USAGE);
    return 0;
  }
  if (args.length === 2 && args[0] === 'catalog' && args[1] === '--json') {
    io.writeOutput(`${JSON.stringify(BUILT_IN_REGISTRY_CATALOG_ENTRIES, null, 2)}\n`);
    return 0;
  }
  io.writeError(USAGE);
  return 1;
}
