import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parse } from 'yaml';

// Static acceptance for the promote -> edge-publish dispatch contract. The external gate is a real
// `edge` dist-tag after a future promotion, which nothing here can or should reach: dispatching a
// workflow, promoting, or publishing are all live actions. What IS checkable without any of that is
// the contract itself — that the dispatch exists, is wired to the promoted sha, cannot fail silently,
// and that the receiver re-verifies what it was handed.
//
// ★ THESE ASSERT ABSENCES AS WELL AS PRESENCES, and the absences are the load-bearing half. The defect
// being fixed was an absence — no run, no error, no edge — so a test suite that only checked for the
// presence of a dispatch step would pass against a remedy that never fires.

const WORKFLOWS = join(__dirname, '..', '.github', 'workflows');

function readWorkflow(name: string): string {
  return readFileSync(join(WORKFLOWS, `${name}.yml`), 'utf8');
}

function parseWorkflow(name: string): Record<string, unknown> {
  return parse(readWorkflow(name)) as Record<string, unknown>;
}

function promoteSteps(): { name?: string; if?: string; run?: string; id?: string }[] {
  const promote = parseWorkflow('promote') as {
    jobs: { promote: { steps: { name?: string; if?: string; run?: string; id?: string }[] } };
  };
  return promote.jobs.promote.steps;
}

function stepNamed(steps: { name?: string }[], fragment: string): Record<string, unknown> {
  const found = steps.find((step) => step.name?.includes(fragment));
  if (found === undefined) throw new Error(`no step whose name contains ${JSON.stringify(fragment)}`);
  return found as Record<string, unknown>;
}

describe('edge-publish dispatch contract', () => {
  it('promote dispatches edge-publish.yml with the resolved candidate sha', () => {
    const dispatch = stepNamed(promoteSteps(), 'Dispatch the edge publish');
    const run = String(dispatch.run);
    expect(run).toContain('gh workflow run edge-publish.yml');
    // The exact promoted commit, not a branch name — publishing "whatever main is now" would race a
    // later promotion and publish a commit this run never resolved.
    expect(run).toContain('sha=${CANDIDATE}');
    expect(String(dispatch.if)).toContain("steps.push.outputs.advanced == 'true'");
  });

  it('the dispatch fails the promote job rather than passing silently', () => {
    const dispatch = stepNamed(promoteSteps(), 'Dispatch the edge publish');
    const run = String(dispatch.run);
    // `set -e` is what turns a failed `gh workflow run` into a failed job. Without it the command's
    // exit status is discarded and the promotion goes green having published nothing — the original
    // defect, reintroduced one layer up.
    expect(run).toContain('set -euo pipefail');
    expect(dispatch['continue-on-error']).toBeUndefined();
  });

  it('only a push that actually moved main dispatches a publish', () => {
    const push = stepNamed(promoteSteps(), 'Fast-forward main');
    const run = String(push.run);
    // A no-op push succeeds at the git level; the contract is "non-no-op", so main's tip is compared
    // before and after rather than inferred from the exit code.
    expect(run).toContain('advanced=false');
    expect(run).toContain('advanced=true');
    expect(run).toContain('git ls-remote origin refs/heads/main');
  });

  it('correlation is best-effort and cannot fail the promotion', () => {
    const link = stepNamed(promoteSteps(), 'Link the dispatched edge-publish run');
    // The dispatch already succeeded by this point; a run that has not surfaced yet is a missing link,
    // not a failed promotion. This is the one step that may legitimately fail open.
    expect(link['continue-on-error']).toBe(true);
  });

  it('the receiver is dispatch-only — not workflow_run, not push', () => {
    const receiver = parseWorkflow('edge-publish') as { on: Record<string, unknown> };
    expect(Object.keys(receiver.on)).toEqual(['workflow_dispatch']);
    // workflow_run would chain off a run, and the absent run is the entire problem being solved.
    expect(receiver.on.workflow_run).toBeUndefined();
    expect(receiver.on.push).toBeUndefined();
  });

  it('the receiver requires a sha input and keys concurrency on it', () => {
    const receiver = parseWorkflow('edge-publish') as {
      on: { workflow_dispatch: { inputs: Record<string, { required?: boolean }> } };
      concurrency: { group: string; 'cancel-in-progress': boolean };
    };
    expect(receiver.on.workflow_dispatch.inputs.sha.required).toBe(true);
    // Candidate-keyed, so a retry of the same promotion serializes against itself instead of racing.
    expect(receiver.concurrency.group).toContain('inputs.sha');
    expect(receiver.concurrency['cancel-in-progress']).toBe(false);
  });

  it('the receiver verifies the sha it was handed instead of trusting it', () => {
    const receiver = parseWorkflow('edge-publish') as {
      jobs: { publish: { steps: { name?: string; run?: string }[] } };
    };
    const verify = stepNamed(receiver.jobs.publish.steps, 'Verify the checkout is the dispatched commit');
    const run = String(verify.run);
    // The input is caller-supplied — this workflow is hand-dispatchable too — so the checkout is
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

  it('the receiver is idempotent for a repeated candidate', () => {
    const receiver = parseWorkflow('edge-publish') as {
      jobs: { publish: { steps: { name?: string; id?: string; if?: string }[] } };
    };
    const steps = receiver.jobs.publish.steps;
    expect(stepNamed(steps, 'Skip if this candidate is already on the registry')).toBeDefined();
    // The version is a pure function of the commit, so a second dispatch computes the same version;
    // the publish must be skipped rather than fail on a registry conflict.
    for (const fragment of ['Stamp the graph', 'Publish snapshot to npm']) {
      expect(String(stepNamed(steps, fragment).if)).toContain("steps.published.outputs.skip == 'false'");
    }
  });

  it('no credential beyond the default token is introduced', () => {
    const receiver = readWorkflow('edge-publish');
    const promote = readWorkflow('promote');
    // The whole reason workflow_dispatch was chosen over a PAT/App is that the default token may raise
    // it. A secret appearing here would mean that argument had quietly been abandoned.
    for (const source of [receiver, promote]) {
      expect(source).not.toMatch(/secrets\.(GH_PAT|PAT|APP_ID|APP_PRIVATE_KEY|BOT_TOKEN)/);
    }
    expect(promote).toContain('GH_TOKEN: ${{ github.token }}');
    // NPM_TOKEN is the publish credential and predates this change; it is not a trigger credential.
    expect(receiver).toContain('secrets.NPM_TOKEN');
  });

  it('tests.yml no longer publishes the same channel from a push to main', () => {
    const tests = parseWorkflow('tests') as { jobs: { 'edge-publish': { if: string } } };
    const condition = tests.jobs['edge-publish'].if;
    expect(condition).toContain("github.ref == 'refs/heads/develop'");
    // Two publishers for one dist-tag, on different concurrency keys, could race the same version.
    expect(condition).not.toContain('refs/heads/main');
  });
});
