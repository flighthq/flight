import { BUILT_IN_REQUIREMENT_CATALOG_ENTRIES } from '@flighthq/requirement-catalog/contract';

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
    // ★ THE CATALOG OBJECT, NOT A BARE ARRAY. This output is meant to be read back by
    // `readRequirementCatalogFile`, and a top-level array cannot carry the catalog's other fields —
    // `dispositions` above all, which is how a backend states a requirement it deliberately does not
    // implement. Emitting the rows alone made `tool-registry catalog --json | tool-manifest plan`
    // fail with "catalog must be an object" on the repository's own catalog, and widening the reader
    // to accept arrays would have bought that round trip back at the price of a shape that can never
    // express a disposition.
    io.writeOutput(`${JSON.stringify({ entries: BUILT_IN_REQUIREMENT_CATALOG_ENTRIES }, null, 2)}\n`);
    return 0;
  }
  io.writeError(USAGE);
  return 1;
}
