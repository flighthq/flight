import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parse } from 'yaml';

const workflowsDir = join(import.meta.dirname, '..', '.github', 'workflows');

interface Workflow {
  jobs: Record<string, { needs?: string | string[]; steps?: { uses?: string; with?: { ref?: string } }[] }>;
}

function readWorkflow(name: string): Workflow {
  return parse(readFileSync(join(workflowsDir, `${name}.yml`), 'utf8')) as Workflow;
}

describe('reference image CI workflow', () => {
  it('runs nightly against the pinned develop commit', () => {
    const job = readWorkflow('nightly').jobs['reference-image-check'];

    expect(job.needs).toBe('resolve');
    const checkout = job.steps?.find((step) => step.uses === 'actions/checkout@v4');
    expect(checkout?.with?.ref).toBe('${{ needs.resolve.outputs.sha }}');
  });

  it('is not part of the per-push product gate', () => {
    expect(readWorkflow('tests').jobs['reference-image-check']).toBeUndefined();
  });
});
