// CLI the Flight capture workflow calls: read one outstanding request, print the capture scope it needs,
// and (after that capture has run) assemble the candidate bundle for dispatch.
// agents/render-oracle-repository.md §7 step 2, §8.
//
// ★ THIS PROCESS HOLDS NO CROSS-REPOSITORY CREDENTIAL AND MUST NEVER NEED ONE. It runs in the job that
// checks out a commissioned Flight commit, which is untrusted-code execution: whoever can land a request
// can run arbitrary code here. It reads the repository, writes one bundle into the workspace, and stops.
// Dispatch is a separate privileged workflow that never executes this checkout (§7, credential boundary).
//
// Two subcommands rather than one, because the capture happens BETWEEN them and is not this script's job:
//   scope   → prints the --filter-exact / --renderer arguments the request implies, for the capture step
//   bundle  → reads the captures that step produced and writes candidate-bundle.json
import { writeFileSync } from 'node:fs';
import { basename } from 'node:path';

import { buildOracleCandidateBundle, hashOracleFile } from './oracle-candidate';
import { getOracleRequestCells, readOracleRequest } from './oracle-records';

const [subcommand, requestPath, ...rest] = process.argv.slice(2);

if (subcommand !== 'scope' && subcommand !== 'bundle') {
  console.error('usage: oracle-commission <scope|bundle> <request.json> [--artifacts <dir>] [--out <file>]');
  process.exit(2);
}
if (requestPath === undefined) {
  console.error('oracle-commission: a request path is required');
  process.exit(2);
}

const parsed = readOracleRequest(requestPath);
if ('problems' in parsed) {
  // A malformed request fails loudly HERE rather than producing an empty bundle downstream: an empty
  // bundle and an unparsable request look identical to intake, and only one of them is a mistake anyone
  // can act on.
  for (const problem of parsed.problems) console.error(`  ${problem.kind}: ${problem.detail}`);
  console.error(`oracle-commission: ${requestPath} is not a valid request`);
  process.exit(1);
}
const request = parsed.request;

if (subcommand === 'scope') {
  // The capture tool is scoped by entry and renderer separately, so a multi-entry request prints one
  // line per entry. Emitted as shell-ready arguments so the workflow never re-derives the scope itself —
  // a second derivation is a second thing to keep in step with getOracleRequestCells.
  for (const target of request.targets) {
    console.log(`--tool=${request.subject} --filter-exact ${target.entry} --renderer ${target.renderers.join(',')}`);
  }
  process.exit(0);
}

const artifactsRoot = readOption(rest, '--artifacts') ?? '.artifacts';
const out = readOption(rest, '--out') ?? 'candidate-bundle.json';
// The landed commit and the environment identity are supplied by the workflow, never invented here (§5):
// an agent-local SHA may be replaced when work lands, and a value this script guessed would be a claim
// about the world it cannot check.
const flightCommit = requireEnv('ORACLE_FLIGHT_COMMIT');
const environmentId = requireEnv('ORACLE_ENVIRONMENT_ID');

const bundle = buildOracleCandidateBundle({
  artifactsRoot,
  environmentId,
  flightCommit,
  request,
  requestSha256: hashOracleFile(requestPath),
});

writeFileSync(out, `${JSON.stringify(bundle, null, 2)}\n`);

const captured = bundle.images.filter((image) => image.state === 'captured');
const missing = bundle.images.filter((image) => image.state === 'missing');
console.log(`${basename(requestPath)}: ${captured.length} captured, ${missing.length} missing`);
for (const image of missing) console.log(`  missing  ${image.identity}  ${'reason' in image ? image.reason : ''}`);
console.log(`wrote ${out}`);

// ★ A BUNDLE WITH NOTHING IN IT IS A FAILURE, NOT AN EMPTY SUCCESS. Dispatching it would open an Oracle
// PR proposing to bless no images, which a reviewer can only reject — and the run that produced it would
// have reported success. Every requested cell missing means the capture did not work.
if (captured.length === 0) {
  console.error(`oracle-commission: no requested cell captured (${getOracleRequestCells(request).length} asked for)`);
  process.exit(1);
}

function readOption(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    console.error(`oracle-commission: ${name} is required — the workflow supplies it, this script never guesses it`);
    process.exit(2);
  }
  return value;
}

export {};
