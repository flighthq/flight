import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parse } from 'yaml';

const workflowPath = join(import.meta.dirname, '..', '.github', 'workflows', 'tests.yml');

describe('reference image CI workflow', () => {
  it('runs as a code leg after changed-area detection', () => {
    const workflow = parse(readFileSync(workflowPath, 'utf8')) as {
      jobs: {
        'reference-image-check': {
          if?: string;
          needs?: string | string[];
        };
      };
    };
    const job = workflow.jobs['reference-image-check'];

    expect(job.needs).toBe('changes');
    expect(job.if).toBe("${{ needs.changes.outputs.code == 'true' }}");
  });
});
