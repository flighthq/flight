import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parse } from 'yaml';

const workflowPath = join(import.meta.dirname, '..', '.github', 'workflows', 'release.yml');

interface WorkflowStep {
  name?: string;
  run?: string;
}

function steps(): WorkflowStep[] {
  const workflow = parse(readFileSync(workflowPath, 'utf8')) as {
    jobs: { publish: { steps: WorkflowStep[] } };
  };
  return workflow.jobs.publish.steps;
}

describe('stable release notes contract', () => {
  it('checks the note before publishing anything', () => {
    const releaseSteps = steps();
    const checkIndex = releaseSteps.findIndex(
      (step) => step.name === 'Verify curated release notes and tested candidate',
    );
    const publishIndex = releaseSteps.findIndex((step) => step.name === 'Publish packages to npm');

    expect(checkIndex).toBeGreaterThan(-1);
    expect(String(releaseSteps[checkIndex]?.run)).toContain('release:notes:check');
    expect(String(releaseSteps[checkIndex]?.run)).toContain('GITHUB_REF_NAME');
    expect(publishIndex).toBeGreaterThan(checkIndex);
  });

  it('uses the checked repository note as the GitHub release body', () => {
    const attach = steps().find((step) => step.name === 'Attach examples bundle to the release');
    const run = String(attach?.run);

    expect(run).toContain('--notes-file "releases/${GITHUB_REF_NAME}.md"');
    expect(run).not.toContain('--generate-notes');
  });
});
