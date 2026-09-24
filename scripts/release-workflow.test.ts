import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parse } from 'yaml';

const workflowPath = join(import.meta.dirname, '..', '.github', 'workflows', 'release.yml');

interface WorkflowStep {
  env?: Record<string, string>;
  name?: string;
  run?: string;
  uses?: string;
  with?: Record<string, unknown>;
}

function workflow(): {
  on: { workflow_dispatch: { inputs: Record<string, unknown> } };
  jobs: { publish: { steps: WorkflowStep[] } };
} {
  return parse(readFileSync(workflowPath, 'utf8')) as {
    on: { workflow_dispatch: { inputs: Record<string, unknown> } };
    jobs: { publish: { steps: WorkflowStep[] } };
  };
}

describe('stable release workflow contract', () => {
  it('dispatches downstream releases after npm publication and before examples', () => {
    const releaseSteps = workflow().jobs.publish.steps;
    const publishIndex = releaseSteps.findIndex((step) => step.name === 'Publish packages to npm');
    const examplesIndex = releaseSteps.findIndex((step) => step.name === 'Build examples site');
    const dispatchIndex = releaseSteps.findIndex((step) => step.name === 'Dispatch downstream releases');
    const dispatch = releaseSteps[dispatchIndex];

    expect(publishIndex).toBeGreaterThan(-1);
    expect(examplesIndex).toBeGreaterThan(publishIndex);
    expect(dispatchIndex).toBeGreaterThan(publishIndex);
    expect(dispatchIndex).toBeLessThan(examplesIndex);
    expect(dispatch?.uses).toBe('./.github/actions/dispatch-downstream');
    expect(dispatch?.with).toEqual({
      commit: '${{ github.sha }}',
      'dist-tag': 'latest',
      'event-type': 'flight-release',
      'flight-compiler-token': '${{ secrets.FLIGHT_COMPILER_DISPATCH_TOKEN }}',
      'flight-rs-token': '${{ secrets.FLIGHT_RS_DISPATCH_TOKEN }}',
      version: '${{ github.ref_name }}',
    });
  });

  it('fetches tag history and generates an ephemeral note before publishing', () => {
    const releaseWorkflow = workflow();
    const releaseSteps = releaseWorkflow.jobs.publish.steps;
    const checkout = releaseSteps.find((step) => step.with?.['fetch-depth'] !== undefined);
    const generateIndex = releaseSteps.findIndex((step) => step.name === 'Generate release notes');
    const publishIndex = releaseSteps.findIndex((step) => step.name === 'Publish packages to npm');
    const generate = String(releaseSteps[generateIndex]?.run);

    expect(checkout?.with?.['fetch-depth']).toBe(0);
    expect(generateIndex).toBeGreaterThan(-1);
    expect(generate).toContain('npm run release:notes');
    expect(generate).toContain('--through "${GITHUB_SHA}"');
    expect(generate).toContain('--output "${RUNNER_TEMP}/release-notes.md"');
    expect(generate).toContain('--description "${description}"');
    expect(publishIndex).toBeGreaterThan(generateIndex);
  });

  it('offers an optional manual description and uses the generated note for create and retry', () => {
    const releaseWorkflow = workflow();
    const attach = releaseWorkflow.jobs.publish.steps.find(
      (step) => step.name === 'Attach examples bundle to the release',
    );
    const run = String(attach?.run);

    expect(releaseWorkflow.on.workflow_dispatch.inputs).toHaveProperty('description');
    expect(run).toContain('gh release create');
    expect(run).toContain('gh release edit');
    expect(run).toContain('--notes-file "${RUNNER_TEMP}/release-notes.md"');
    expect(run).not.toContain('releases/${GITHUB_REF_NAME}.md');
    expect(run).not.toContain('--generate-notes');
  });
});
