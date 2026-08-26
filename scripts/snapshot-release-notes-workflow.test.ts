import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parse } from 'yaml';

const workflowsDir = join(import.meta.dirname, '..', '.github', 'workflows');

interface WorkflowStep {
  name?: string;
  run?: string;
  env?: Record<string, string>;
}

function jobSteps(workflowName: string, jobName: string): WorkflowStep[] {
  const source = readFileSync(join(workflowsDir, `${workflowName}.yml`), 'utf8');
  const workflow = parse(source) as { jobs: Record<string, { steps: WorkflowStep[] }> };
  return workflow.jobs[jobName]!.steps;
}

describe('snapshot release notes contract', () => {
  it.each([
    ['next', 'tests', 'edge-publish'],
    ['edge', 'edge-publish', 'publish'],
  ])('generates cumulative %s notes before publishing to npm', (_channel, workflowName, jobName) => {
    const steps = jobSteps(workflowName, jobName);
    const generateIndex = steps.findIndex((step) => step.name === 'Generate cumulative snapshot release notes');
    const publishIndex = steps.findIndex((step) => step.name === 'Publish snapshot to npm');
    const generate = steps[generateIndex];
    const run = String(generate?.run);

    expect(generateIndex).toBeGreaterThan(-1);
    expect(publishIndex).toBeGreaterThan(generateIndex);
    expect(generate?.env?.SNAPSHOT_VERSION).toBe('${{ steps.edge.outputs.version }}');
    expect(run).toContain('npm run release:notes -- "${SNAPSHOT_VERSION}"');
    expect(run).toContain('--through HEAD');
    expect(run).toContain('--output "${RUNNER_TEMP}/release-notes.md"');
    expect(run).toContain('cat "${RUNNER_TEMP}/release-notes.md" >> "${GITHUB_STEP_SUMMARY}"');
    expect(run).not.toContain('${{');
  });
});
