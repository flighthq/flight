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
  it('gates main as part of CI · extended, on the commit pushed to next', () => {
    const extended = readWorkflow('ci-extended');
    const job = extended.jobs['reference-image-check'];
    // CI · extended checks the pushed commit itself, so the checkout takes no ref of its own.
    const checkout = job.steps?.find((step) => step.uses === 'actions/checkout@v5');
    expect(checkout).toBeDefined();
    expect(checkout?.with?.ref).toBeUndefined();
    expect(extended.jobs['ready-for-main'].needs).toContain('reference-image-check');
  });

  it('is neither in the per-push product gate nor a Nightly job', () => {
    expect(readWorkflow('tests').jobs['reference-image-check']).toBeUndefined();
    expect(readWorkflow('nightly').jobs['reference-image-check']).toBeUndefined();
  });
});
