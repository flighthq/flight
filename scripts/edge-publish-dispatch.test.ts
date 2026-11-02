import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parse } from 'yaml';

// Static acceptance for the promotion and edge-publish contract: develop → CI (Ready for next) →
// Promote (npm next, `next`) → CI · extended (Ready for main) → Nightly (`main`, edge on crates.io, then
// npm). The external gate is a real `edge`
// dist-tag after a future Nightly, which nothing here can or should reach: promoting and publishing are
// live actions. What IS checkable without either is the contract itself — that each promotion moves
// only forward to a commit that passed its gate, that the push jobs hold only the promotion App and
// never a publish credential, that crates.io goes before npm, and that the publisher re-verifies what
// it was handed.
//
// ★ THESE ASSERT ABSENCES AS WELL AS PRESENCES, and the absences are the load-bearing half. The defect
// these guard against was an absence — no run, no error, no edge — so a test suite that only checked
// for the presence of a publish job would pass against a remedy that never fires.

const WORKFLOWS = join(__dirname, '..', '.github', 'workflows');

function readWorkflow(name: string): string {
  return readFileSync(join(WORKFLOWS, `${name}.yml`), 'utf8');
}

function parseWorkflow(name: string): Record<string, unknown> {
  return parse(readWorkflow(name)) as Record<string, unknown>;
}

function stepNamed(steps: { name?: string }[], fragment: string): Record<string, unknown> {
  const found = steps.find((step) => step.name?.includes(fragment));
  if (found === undefined) throw new Error(`no step whose name contains ${JSON.stringify(fragment)}`);
  return found as Record<string, unknown>;
}

interface WorkflowJob {
  'continue-on-error'?: boolean;
  if?: string;
  needs?: string | string[];
  outputs?: Record<string, string>;
  permissions?: Record<string, string>;
  secrets?: Record<string, string>;
  steps?: { name?: string; if?: string; run?: string; id?: string; uses?: string; with?: Record<string, string> }[];
  uses?: string;
  with?: Record<string, string>;
}

function jobsOf(name: string): Record<string, WorkflowJob> {
  return (parseWorkflow(name) as { jobs: Record<string, WorkflowJob> }).jobs;
}

// The promotion App is the only credential a push job may hold: only the step that mints its token
// reads the key, the step before it reads only the App's ID, and checkout receives the minted token.
function expectOnlyThePromotionApp(job: WorkflowJob, label: string): void {
  expect(job.permissions, label).toEqual({ contents: 'write' });
  const steps = job.steps ?? [];
  const allowed = new Map<string | undefined, string[]>([
    ['app', ['${{ secrets.PROMOTE_APP_ID }}']],
    ['app-token', ['${{ secrets.PROMOTE_APP_ID }}', '${{ secrets.PROMOTE_APP_PRIVATE_KEY }}']],
  ]);
  const mint = steps.find((step) => step.id === 'app-token');
  expect(mint?.uses, label).toBe('actions/create-github-app-token@v3');
  expect(mint?.with?.['permission-contents'], label).toBe('write');
  expect(mint?.with?.['permission-workflows'], label).toBe('write');
  const checkout = steps.find((step) => step.uses === 'actions/checkout@v5');
  expect(checkout?.with?.token, label).toBe('${{ steps.app-token.outputs.token || github.token }}');
  for (const step of steps) {
    let source = JSON.stringify(step);
    for (const reference of allowed.get(step.id) ?? []) source = source.replaceAll(reference, '');
    expect(source, `${label}: ${step.name ?? step.uses}`).not.toContain('secrets.');
  }
}

describe('edge-publish promotion contract', () => {
  it('CI publishes nothing and holds no publish credential', () => {
    const ci = readWorkflow('tests');
    expect(ci).not.toContain('secrets.');
    expect(Object.keys(jobsOf('tests'))).not.toContain('promote-next');
    expect(jobsOf('tests')['ready-for-next'].needs).toEqual([
      'rust-test',
      'ts-test',
      'compliance',
      'package-npm',
      'package-crates',
      'package-wasm',
      // Functional render smoke: SDK rendering is part of what `next` means. Example smoke is not —
      // a stale example is upkeep, reported by Hygiene.
      'render-test',
    ]);
  });

  it('Promote acts only on a develop push whose Ready for next succeeded', () => {
    const check = String(jobsOf('promote').eligible.steps?.find((step) => step.id === 'check')?.run);
    // Decided from the CI run itself, by the gate job's name — not from CI's overall conclusion, which
    // includes Render smoke, a signal rather than a gate for next.
    expect(check).toContain('select(.name == "Ready for next")');
    expect(check).toContain('[ "$branch" = develop ] && [ "$event" = push ] && [ "$ready" = success ]');
    expect(jobsOf('promote').publish.if).toBe("${{ needs.eligible.outputs.eligible == 'true' }}");
  });

  it('Promote moves next only after npm next is published, and only forward', () => {
    const job = jobsOf('promote')['promote-next'];
    // Published first, so the `next` branch never names a commit npm `next` lacks.
    expect(job.needs).toEqual(['eligible', 'publish']);
    expect(String(job.steps?.at(-1)?.run)).toBe('bash scripts/fast-forward-branch.sh next "$CANDIDATE"');
    expectOnlyThePromotionApp(job, 'promote-next');
  });

  it('Promote publishes the exact build CI checked, on the next channel', () => {
    const publish = jobsOf('promote').publish;
    const downloads = (publish.steps ?? []).filter((step) => step.uses === 'actions/download-artifact@v7');
    expect(downloads.map((step) => step.with?.['run-id'])).toEqual([
      '${{ needs.eligible.outputs.run_id }}',
      '${{ needs.eligible.outputs.run_id }}',
    ]);
    // A workflow_run job runs on the default branch with a detached checkout, so the channel is named.
    expect(readWorkflow('promote')).toContain('scripts/edge-version.ts develop');
    expect(publish.permissions).toEqual({ actions: 'read', contents: 'read', 'id-token': 'write' });
  });

  it('Nightly promotes only the newest validated commit on next, and only forward', () => {
    const jobs = jobsOf('nightly');
    const resolve = String(stepNamed(jobs.resolve.steps ?? [], 'Find the newest validated commit on next').run);
    // Candidates are commits on next ahead of main with a successful CI · extended run.
    expect(resolve).toContain('git rev-list refs/remotes/origin/main..refs/remotes/origin/next');
    expect(resolve).toContain('actions/workflows/ci-extended.yml/runs?branch=next&status=success&event=push');
    expect(jobs.promote.if).toBe("${{ needs.resolve.outputs.candidate != '' }}");
    expect(String(jobs.promote.steps?.at(-1)?.run)).toBe('bash scripts/fast-forward-branch.sh main "$CANDIDATE"');
    expectOnlyThePromotionApp(jobs.promote, 'nightly promote');
  });

  it('Nightly publishes edge to crates.io before npm, for the commit main points at', () => {
    const jobs = jobsOf('nightly');
    expect(jobs['crates-edge'].uses).toBe('./.github/workflows/rust-publish.yml');
    expect(jobs['crates-edge'].with?.ref).toBe('${{ needs.edge-version.outputs.sha }}');
    expect(jobs['npm-edge'].uses).toBe('./.github/workflows/edge-publish.yml');
    expect(jobs['npm-edge'].with?.sha).toBe('${{ needs.edge-version.outputs.sha }}');
    // npm waits for crates.io: if crates.io fails, npm is not published, so a version never exists on
    // one registry without the other.
    expect(jobs['npm-edge'].needs).toEqual(['edge-version', 'crates-edge']);
    expect(String(jobs['npm-edge'].if)).toContain("needs.crates-edge.result == 'success'");
    for (const name of ['crates-edge', 'npm-edge']) expect(jobs[name]['continue-on-error'], name).toBeUndefined();
    // Only the npm publish holds the npm credential, and with only the permissions it needs.
    expect(jobs['npm-edge'].permissions).toEqual({ actions: 'read', contents: 'read', 'id-token': 'write' });
    expect(Object.keys(jobs['npm-edge'].secrets ?? {}).sort()).toEqual(['FLIGHT_COMPILER_DISPATCH_TOKEN', 'NPM_TOKEN']);
  });

  it('Nightly never skips npm on a single-package probe', () => {
    // ★ npm's publisher completes a partial graph package by package; a probe of one package could
    // report "published" for a half-published graph and skip it forever. npm runs on promotion, on a
    // crates.io publish, on a manual run, and after any failed Nightly instead.
    const source = readWorkflow('nightly');
    expect(source).not.toContain('registry.npmjs.org');
    expect(source).not.toContain('npm view');
    const check = String(jobsOf('nightly')['edge-version'].steps?.find((step) => step.id === 'check')?.run);
    expect(check).toContain('[ "$ADVANCED" = true ] || [ "$crates" = true ] || [ "$RETRY" = true ]');
  });

  it('the receiver is called or dispatched — not workflow_run, not push', () => {
    const receiver = parseWorkflow('edge-publish') as { on: Record<string, unknown> };
    expect(Object.keys(receiver.on).sort()).toEqual(['workflow_call', 'workflow_dispatch']);
    // A push made with the default token starts no run, so a push-triggered publisher never fires,
    // and workflow_run would chain off that same absent run.
    expect(receiver.on.workflow_run).toBeUndefined();
    expect(receiver.on.push).toBeUndefined();
  });

  it('the receiver requires a sha input and keys concurrency on it', () => {
    const receiver = parseWorkflow('edge-publish') as {
      on: Record<'workflow_call' | 'workflow_dispatch', { inputs: Record<string, { required?: boolean }> }>;
      concurrency: { group: string; 'cancel-in-progress': boolean };
    };
    expect(receiver.on.workflow_call.inputs.sha.required).toBe(true);
    expect(receiver.on.workflow_dispatch.inputs.sha.required).toBe(true);
    // ★ CHANNEL-GLOBAL. `edge` is one dist-tag; two concurrent publishes race on it and last-write-wins
    // can leave the OLDER build on the tag. Keying on the candidate would permit exactly that, so the
    // group must NOT vary with the input.
    expect(receiver.concurrency.group).toBe('edge-publish-main');
    expect(receiver.concurrency.group).not.toContain('inputs.sha');
    expect(receiver.concurrency['cancel-in-progress']).toBe(false);
  });

  it('the receiver verifies the sha it was handed instead of trusting it', () => {
    const receiver = parseWorkflow('edge-publish') as {
      jobs: { publish: { steps: { name?: string; run?: string }[] } };
    };
    const verify = stepNamed(receiver.jobs.publish.steps, 'Verify the checkout is the dispatched commit');
    const run = String(verify.run);
    // The input is caller-supplied — this workflow is hand-dispatchable as well as called — so the checkout is
    // re-read and the commit's membership of main is re-established from the repository.
    expect(run).toContain('git rev-parse HEAD');
    expect(run).toContain('merge-base --is-ancestor');
    // And CI is re-proved for the exact sha, never inherited from the caller's say-so.
    expect(stepNamed(receiver.jobs.publish.steps, 'Verify the dispatched commit passed CI')).toBeDefined();
  });

  it('the receiver names the channel explicitly, because its checkout is detached', () => {
    const receiver = readWorkflow('edge-publish');
    // edge-version falls back to the current branch to choose the dist-tag, and a detached checkout of
    // a sha names no branch. Without the explicit argument the tag is whatever the fallback resolves.
    expect(receiver).toContain('scripts/edge-version.ts main');
  });

  it('the publisher always runs — no outer skip may gate the whole graph', () => {
    const source = readWorkflow('edge-publish');
    const receiver = parseWorkflow('edge-publish') as {
      jobs: { publish: { steps: { name?: string; if?: string }[] } };
    };
    const steps = receiver.jobs.publish.steps;
    // ★ publish-packages.ts is idempotent PER PACKAGE and completes a partial set on re-run. An outer
    // guard keyed on one package (`npm view @flighthq/sdk@…`) would report "already published" for a
    // graph that is half published, and make that state permanent. So neither the stamp nor the publish
    // may carry a skip condition, and no single-package existence probe may appear at all.
    for (const fragment of ['Stamp the graph', 'Publish snapshot to npm']) {
      expect(stepNamed(steps, fragment).if).toBeUndefined();
    }
    expect(source).not.toContain('npm view');
    expect(source).not.toMatch(/outputs\.skip/);
  });

  it('no run: block interpolates a workflow expression directly', () => {
    // ★ THE CLASS, NOT THE SITES. `${{ inputs.sha }}` inside a `run:` block is substituted by Actions
    // BEFORE bash parses the script, so the value becomes shell source rather than data — the standard
    // script-injection shape, and a Markdown summary table is no safer than a command line. Every value
    // must arrive through `env`, where bash sees it as an ordinary variable. Asserting over every step
    // of both workflows means a new step cannot reintroduce it at a site nobody thought to check.
    for (const name of ['nightly', 'edge-publish', 'promote']) {
      const doc = parseWorkflow(name) as { jobs: Record<string, { steps?: { name?: string; run?: string }[] }> };
      for (const job of Object.values(doc.jobs)) {
        for (const step of job.steps ?? []) {
          if (typeof step.run !== 'string') continue;
          expect({ step: step.name, workflow: name, interpolations: step.run.match(/\$\{\{[^}]*\}\}/g) }).toEqual({
            step: step.name,
            workflow: name,
            interpolations: null,
          });
        }
      }
    }
  });

  it('the values that carry candidate data are quoted where they are used', () => {
    const receiver = readWorkflow('edge-publish');
    // Unquoted, a value containing whitespace word-splits and a later argument becomes a separate one.
    // These carry caller-influenced or computed data into commands.
    expect(receiver).toContain('npm run version:packages "${EDGE_VERSION}"');
    expect(receiver).toContain('--tag "${EDGE_TAG}"');
  });

  it('no credential beyond the default token is introduced', () => {
    const receiver = readWorkflow('edge-publish');
    const nightly = readWorkflow('nightly');
    // Nightly reaches the publisher by calling it, which the default token permits. The pushes use the
    // promotion App's repository-scoped token; a PAT or a generic App credential would be broader.
    for (const source of [receiver, nightly, readWorkflow('promote')]) {
      expect(source).not.toMatch(/secrets\.(GH_PAT|PAT|APP_ID|APP_PRIVATE_KEY|BOT_TOKEN)/);
    }
    expect(nightly).toContain('GH_TOKEN: ${{ github.token }}');
    // NPM_TOKEN is the publish credential, passed only to the publish job; it is not a trigger credential.
    expect(receiver).toContain('secrets.NPM_TOKEN');
  });

  it('the hand re-publish is written down where the operator will be', () => {
    const receiver = readWorkflow('edge-publish');
    // The manual path must be spelled out as a command, and the acceptance must be the dist-tag rather
    // than a green run — every local gate proves wiring, never that a package was published.
    expect(receiver).toContain('gh workflow run edge-publish.yml --ref main');
    expect(receiver).toContain('npm dist-tag ls @flighthq/sdk');
  });

  it('npm next is published only from develop, and edge only by Nightly', () => {
    // Two publishers for one dist-tag, on different concurrency keys, could race the same version.
    expect(String(jobsOf('promote').eligible.steps?.find((step) => step.id === 'check')?.run)).toContain(
      '[ "$branch" = develop ]',
    );
    expect(readWorkflow('tests')).not.toContain('npm run release');
    expect(readWorkflow('promote')).not.toContain('edge-publish.yml');
  });
});
