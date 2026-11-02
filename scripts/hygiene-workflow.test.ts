import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parse } from 'yaml';

const workflowsDir = join(import.meta.dirname, '..', '.github', 'workflows');

interface Step {
  'continue-on-error'?: boolean;
  env?: Record<string, string>;
  id?: string;
  name?: string;
  run?: string;
  uses?: string;
}

interface Workflow {
  jobs: Record<string, { 'continue-on-error'?: boolean; steps: Step[] }>;
}

function readWorkflow(name: string): Workflow {
  return parse(readFileSync(join(workflowsDir, `${name}.yml`), 'utf8')) as Workflow;
}

// Setup steps may fail the job: a hygiene run that cannot install has nothing to report. Every
// step after that either checks something (and must not fail the job) or reports.
const SETUP_RUNS = new Set(['npm ci']);

describe('hygiene workflow', () => {
  const hygiene = readWorkflow('hygiene');

  it('never fails a job on a check', () => {
    for (const [name, job] of Object.entries(hygiene.jobs)) {
      // Job-level continue-on-error still publishes a red check run, which marks the commit red.
      expect(job['continue-on-error'], name).toBeUndefined();
      for (const step of job.steps) {
        if (step.run === undefined || SETUP_RUNS.has(step.run) || step.name === 'Report') continue;
        expect(step['continue-on-error'], `${name}: ${step.id ?? step.run}`).toBe(true);
      }
    }
  });

  it('reports every check step it runs', () => {
    for (const [name, job] of Object.entries(hygiene.jobs)) {
      const report = job.steps.find((step) => step.name === 'Report');
      expect(report, name).toBeDefined();
      for (const step of job.steps) {
        if (step['continue-on-error'] !== true) continue;
        expect(report?.env?.OUTCOMES, `${name}: ${step.id}`).toContain(`\${{ steps.${step.id}.outcome }}`);
      }
    }
  });
});

describe('CI product gate', () => {
  it('blocks on license provenance, and the publish waits for it', () => {
    const jobs = readWorkflow('tests').jobs as Record<string, Workflow['jobs'][string] & { needs?: string[] }>;
    const gates = jobs.compliance.steps.map((step) => step.env?.FLIGHT_CHECK_GATES ?? '').join(',');
    expect(gates).toContain('license-provenance:check');
    expect(jobs['edge-publish'].needs).toContain('compliance');
  });
});
