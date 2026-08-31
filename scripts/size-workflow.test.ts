import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parse } from 'yaml';

const workflowPath = join(import.meta.dirname, '..', '.github', 'workflows', 'nightly.yml');

describe('minified size workflow', () => {
  it('gates the dedicated size fixtures instead of examples', () => {
    const workflow = parse(readFileSync(workflowPath, 'utf8')) as {
      jobs: {
        'size-minified': {
          steps: { run?: string }[];
        };
      };
    };
    const commands = workflow.jobs['size-minified'].steps.flatMap((step) => step.run ?? []);

    expect(commands).toContain('npm run size:minified -- --fixtures');
  });
});
