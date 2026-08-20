// Standalone corpus view of the fixture-background state that the functional parity report prints
// beside every measured distance. Useful for auditing the whole fixture population without launching a
// browser; it reports and never gates.
//
// ★ THE BODY LIVES IN THE PACKAGE, AND THE DETECTOR IS SHARED WITH THE PER-RUN REPORT. This file is a
// thin entry point over `@flighthq/tool-capture`, and the colour reader it ultimately calls is
// `findCaptureFixtureBackground` — the same one `fixtureBackgroundMismatch` is computed from. They used
// to be two independent regexes with no join, which is how a corpus scan could report clean while a run
// reported a distance nothing had qualified.
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
