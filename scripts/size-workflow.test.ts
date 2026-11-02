import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parse } from 'yaml';

const workflowPath = join(import.meta.dirname, '..', '.github', 'workflows', 'hygiene.yml');

describe('minified size workflow', () => {
  it('reports the dedicated size fixtures instead of examples, as a hygiene warning', () => {
    const workflow = parse(readFileSync(workflowPath, 'utf8')) as {
      jobs: { checks: { steps: { id?: string; run?: string; 'continue-on-error'?: boolean }[] } };
    };
    const step = workflow.jobs.checks.steps.find((candidate) => candidate.id === 'size-minified');

    expect(step?.run).toBe('npm run size:minified');
    expect(step?.['continue-on-error']).toBe(true);
  });
});
