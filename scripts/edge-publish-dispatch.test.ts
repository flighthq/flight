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

  it('promote holds actions: write, without which the dispatch is a 403', () => {
    const promote = parseWorkflow('promote') as {
      jobs: { promote: { permissions: Record<string, string> } };
    };
    // `gh workflow run` is a write on the actions scope. With `actions: read` the promotion still goes
    // green and the dispatch is refused — the exact silent absence this change removes, reintroduced
    // by a plausible least-privilege trim.
    expect(promote.jobs.promote.permissions.actions).toBe('write');
    expect(promote.jobs.promote.permissions.contents).toBe('write');
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

  it('correlation asks gh for fields it actually returns', () => {
    const run = String(stepNamed(promoteSteps(), 'Link the dispatched edge-publish run').run);
    // ★ `gh run list --json` HAS NO `title`. Requesting it exits non-zero, and since this step is
    // `continue-on-error` that failure is invisible — a correlation step that never correlates. The
    // supported field is `displayTitle`; `headSha` is the exact one, since the dispatch runs `--ref
    // main` right after main was moved to the candidate.
    // Comment lines are stripped first: the rationale above the command necessarily names the wrong
    // field, and matching prose would fail on the explanation rather than on the code.
    const commands = run
      .split('\n')
      .filter((line) => !line.trim().startsWith('#'))
      .join('\n');
    expect(commands).toContain('displayTitle');
    expect(commands).toContain('headSha');
    expect(commands).not.toMatch(/--json[^\n]*(^|[,\s])title([,\s]|$)/m);
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
    const promote = readWorkflow('promote');
    // Unquoted, a value containing whitespace word-splits and a later argument becomes a separate one.
    // These three carry caller-influenced or computed data into commands.
    expect(promote).toContain('--field "sha=${CANDIDATE}"');
    expect(receiver).toContain('npm run version:packages "${EDGE_VERSION}"');
    expect(receiver).toContain('--tag "${EDGE_TAG}"');
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
