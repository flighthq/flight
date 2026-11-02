import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parse } from 'yaml';

// Static acceptance for the promote -> edge-publish contract. The external gate is a real `edge`
// dist-tag after a future promotion, which nothing here can or should reach: promoting and publishing
// are live actions. What IS checkable without either is the contract itself — that a promotion which
// moves main publishes exactly that commit, that the publish cannot fail silently, that the push job
// never holds the publish credential, and that the publisher re-verifies what it was handed.
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

function promoteJobs(): Record<string, WorkflowJob> {
  return (parseWorkflow('promote') as { jobs: Record<string, WorkflowJob> }).jobs;
}

describe('edge-publish promotion contract', () => {
  it('promote calls edge-publish.yml with the resolved candidate sha after main moved', () => {
    const job = promoteJobs()['edge-publish'];
    expect(job.uses).toBe('./.github/workflows/edge-publish.yml');
    expect(job.needs).toBe('promote');
    // The exact promoted commit, not a branch name — publishing "whatever main is now" would race a
    // later promotion and publish a commit this run never resolved.
    expect(job.with?.sha).toBe('${{ needs.promote.outputs.sha }}');
    expect(job.if).toBe("${{ needs.promote.outputs.advanced == 'true' }}");
    // `advanced` must come from the push step's before/after comparison, not from the candidate alone.
    expect(promoteJobs().promote.outputs?.advanced).toBe('${{ steps.push.outputs.advanced }}');
  });

  it('a failed publish fails the promotion rather than passing silently', () => {
    // The publish is a job of the promotion run, so its failure is the run's failure. A
    // continue-on-error here would let the promotion go green having published nothing.
    expect(promoteJobs()['edge-publish']['continue-on-error']).toBeUndefined();
  });

  it('the job that pushes main holds no publish credential', () => {
    const promote = promoteJobs().promote;
    expect(promote.permissions).toEqual({ actions: 'read', contents: 'write' });
    const publish = promoteJobs()['edge-publish'];
    expect(publish.permissions).toEqual({ actions: 'read', contents: 'read', 'id-token': 'write' });
    expect(Object.keys(publish.secrets ?? {}).sort()).toEqual(['FLIGHT_COMPILER_DISPATCH_TOKEN', 'NPM_TOKEN']);
    // The one credential the push job holds is the deploy key, and only checkout may see it: it pushes
    // main, nothing else. No npm credential, and no other step touching a secret.
    const checkout = (promote.steps ?? []).find((step) => step.uses === 'actions/checkout@v5');
    expect(checkout?.with?.['ssh-key']).toBe('${{ secrets.PROMOTE_DEPLOY_KEY }}');
    for (const step of promote.steps ?? []) {
      const source = JSON.stringify(step);
      const scrubbed = step === checkout ? source.replace('${{ secrets.PROMOTE_DEPLOY_KEY }}', '') : source;
      expect(scrubbed, step.name ?? step.uses).not.toContain('secrets.');
    }
  });

  it('only a push that actually moved main publishes', () => {
    const push = stepNamed(promoteJobs().promote.steps ?? [], 'Fast-forward main');
    const run = String(push.run);
    // A no-op push succeeds at the git level; the contract is "non-no-op", so main's tip is compared
    // before and after rather than inferred from the exit code.
    expect(run).toContain('advanced=false');
    expect(run).toContain('advanced=true');
    expect(run).toContain('git ls-remote origin refs/heads/main');
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
    for (const name of ['promote', 'edge-publish']) {
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
    const promote = readWorkflow('promote');
    // Promote reaches the publisher by calling it, which the default token permits. Its push uses the
    // repository-scoped deploy key; a PAT or App credential appearing here would be a broader one.
    for (const source of [receiver, promote]) {
      expect(source).not.toMatch(/secrets\.(GH_PAT|PAT|APP_ID|APP_PRIVATE_KEY|BOT_TOKEN)/);
    }
    expect(promote).toContain('GH_TOKEN: ${{ github.token }}');
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

  it('tests.yml no longer publishes the same channel from a push to main', () => {
    const tests = parseWorkflow('tests') as { jobs: { 'edge-publish': { if: string } } };
    const condition = tests.jobs['edge-publish'].if;
    expect(condition).toContain("github.ref == 'refs/heads/develop'");
    // Two publishers for one dist-tag, on different concurrency keys, could race the same version.
    expect(condition).not.toContain('refs/heads/main');
  });
});
