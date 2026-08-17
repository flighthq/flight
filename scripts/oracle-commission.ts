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
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

import { buildOracleCandidateBundle, stageOracleCandidateImages } from './oracle-candidate';
import { getOracleRequestCells, readOracleRequest } from './oracle-records';

const [subcommand, requestPath, ...rest] = process.argv.slice(2);

if (subcommand !== 'scope' && subcommand !== 'bundle') {
  console.error('usage: oracle-commission <scope|bundle> <request.json> [--artifacts <dir>] [--stage <dir>]');
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
  // The capture tool is scoped by entry and renderer separately, so a multi-target request prints one
  // line per cell. Emitted as shell-ready arguments so the workflow never re-derives the scope itself —
  // a second derivation is a second thing to keep in step with getOracleRequestCells.
  for (const target of request.targets) {
    // ★ `--frames` IS NOT OPTIONAL HERE. `bin.ts` defaults an omitted value to 0, so leaving it off
    // captures at a DIFFERENT frame count than the request commissioned, and the candidate then records
    // conditions the commission did not ask for. flight-oracles rejected exactly that: request frames 1,
    // capture frames 0. The request is the authority on capture conditions; the scope must carry all of
    // them, not just the ones that happen to have no default.
    console.log(
      `--tool=${request.subject} --filter-exact ${target.entry} ` +
        `--renderer ${target.renderer} --frames ${request.frames}`,
    );
  }
  process.exit(0);
}

const artifactsRoot = readOption(rest, '--artifacts') ?? '.artifacts';
// ★ THE IDENTITIES ARE READ FROM A COMMITTED RECORD, NEVER COMPUTED. They are registered in
// `flight-oracles` and copied here verbatim; a value Flight derives would be a second producer of one
// identity, and the two drift the moment either side changes. Overridable by env only for local probes.
const identity = JSON.parse(readFileSync(join(__dirname, 'oracle-capture-identity.json'), 'utf8')) as {
  environmentId: string;
  comparisonPolicyId: string;
};
// One self-contained directory holds the bundle and its images. The archive layout is then a contract
// intake can rely on, rather than a mirror of Flight's internal capture tree.
const stage = readOption(rest, '--stage') ?? 'candidate';
// The landed commit and the environment identity are supplied by the workflow, never invented here (§5):
// an agent-local SHA may be replaced when work lands, and a value this script guessed would be a claim
// about the world it cannot check.

const bundle = buildOracleCandidateBundle({
  artifactsRoot,
  // ★ `uncalibrated` is a deliberate, schema-valid identifier, not a placeholder to tidy later.
  // §8: a comparison policy records the calibrated channelTolerance and mismatch fraction, and §2 says
  // that calibration must choose them before the first policy is published. None has been run, so any
  // other value here would name a policy that does not exist.
  comparisonPolicyId: process.env['ORACLE_COMPARISON_POLICY_ID'] ?? identity.comparisonPolicyId,
  environmentId: process.env['ORACLE_ENVIRONMENT_ID'] ?? identity.environmentId,
  request,
});

// ★ ONE DIRECTORY PER REQUEST, AND THE MANIFEST IS ALWAYS `candidate.json`.
// The fixed name is the Oracle intake contract, and it FORCES the per-request split: two requests
// staged into one tree would collide on the filename, so "one artifact per request" is not a
// preference here, it is the only shape a fixed manifest name admits.
const requestStem = basename(requestPath, '.json');
const stageRoot = join(stage, requestStem);
mkdirSync(stageRoot, { recursive: true });
const staged = stageOracleCandidateImages(bundle, artifactsRoot, stageRoot);
const out = join(stageRoot, 'candidate.json');
writeFileSync(out, `${JSON.stringify(bundle, null, 2)}\n`);

const captured = bundle.captures.filter((capture) => capture.status === 'captured');
const missing = bundle.captures.filter((capture) => capture.status === 'missing');
console.log(`${basename(requestPath)}: ${captured.length} captured, ${missing.length} missing`);
for (const capture of missing) {
  const { entry, renderer, subject } = capture.identity;
  console.log(`  missing  ${subject}/${entry}/${renderer}  ${'error' in capture ? capture.error : ''}`);
}
console.log(`staged ${staged} image(s) and wrote ${out}`);

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

export {};
