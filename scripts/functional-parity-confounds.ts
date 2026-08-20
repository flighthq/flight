// Standalone corpus view of the fixture-confound state that the functional parity report now prints
// beside every measured distance. This remains useful for auditing the whole fixture population without
// launching a browser; it reports and never gates.
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  findFunctionalParityConfounds,
  formatFunctionalParityConfoundReport,
  readFunctionalSceneSources,
} from '../packages/tool-capture/src/functionalParityConfounds.js';

export {
  describeFunctionalParityFixtureState,
  findFunctionalParityConfounds,
  findFunctionalSceneClearColor,
  formatFunctionalParityConfoundReport,
  readFunctionalSceneSources,
} from '../packages/tool-capture/src/functionalParityConfounds.js';
export type {
  FunctionalParityConfound,
  FunctionalParityConfoundReport,
} from '../packages/tool-capture/src/functionalParityConfounds.js';

const SCRIPT_PATH = fileURLToPath(import.meta.url);

if (resolve(process.argv[1] ?? '') === resolve(SCRIPT_PATH)) {
  const scenesDirectory = join(resolve(dirname(SCRIPT_PATH), '..'), 'functional', 'scenes');
  process.stdout.write(
    `${formatFunctionalParityConfoundReport(findFunctionalParityConfounds(readFunctionalSceneSources(scenesDirectory)))}\n`,
  );
}
