import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';

import { runTypechecks, typecheckProjects } from './typecheck-core';
import type { TypecheckProject, TypecheckResult } from './typecheck-core';

const configuredConcurrency = Number.parseInt(process.env.FLIGHT_TYPECHECK_CONCURRENCY ?? '', 10);
const concurrency = Number.isFinite(configuredConcurrency)
  ? Math.max(1, configuredConcurrency)
  : Math.max(1, Math.min(typecheckProjects.length, availableParallelism()));
const results = await runTypechecks(concurrency, runProject);
let failed = false;

for (const result of results) {
  process.stdout.write(`\n▶ typecheck: ${result.label}\n`);
  process.stdout.write(result.output);
  if (!result.passed) failed = true;
}

if (failed) process.exit(1);

async function runProject(project: Readonly<TypecheckProject>): Promise<TypecheckResult> {
  return await new Promise((resolve) => {
    const child = spawn('tsc', [...project.args], { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks: string[] = [];
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => chunks.push(chunk.toString()));
    child.on('error', (error) => chunks.push(`${error.message}\n`));
    child.on('close', (code) => resolve({ label: project.label, output: chunks.join(''), passed: code === 0 }));
  });
}
