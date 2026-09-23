import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parse } from 'yaml';

const workflowPath = join(import.meta.dirname, '..', '.github', 'workflows', 'release.yml');

interface WorkflowStep {
  env?: Record<string, string>;
  name?: string;
  run?: string;
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
    const targets = [
      {
        name: 'Dispatch Flight-RS release',
        repository: 'flight-rs',
        token: '${{ secrets.FLIGHT_RS_DISPATCH_TOKEN }}',
      },
      {
        name: 'Dispatch Flight-Compiler release',
        repository: 'flight-compiler',
        token: '${{ secrets.FLIGHT_COMPILER_DISPATCH_TOKEN }}',
      },
    ];

    expect(publishIndex).toBeGreaterThan(-1);
    expect(examplesIndex).toBeGreaterThan(publishIndex);
    for (const target of targets) {
      const dispatchIndex = releaseSteps.findIndex((step) => step.name === target.name);
      const dispatch = releaseSteps[dispatchIndex];
      const run = String(dispatch?.run);

      expect(dispatchIndex).toBeGreaterThan(publishIndex);
      expect(dispatchIndex).toBeLessThan(examplesIndex);
      expect(dispatch?.env?.GH_TOKEN).toBe(target.token);
      expect(run).toContain(`repos/flighthq/${target.repository}/dispatches`);
      expect(run).toContain('--raw-field event_type=flight-release');
      expect(run).toContain('--raw-field "client_payload[version]=${GITHUB_REF_NAME}"');
      expect(run).toContain('--raw-field "client_payload[commit]=${GITHUB_SHA}"');
    }
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
