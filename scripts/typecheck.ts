import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';

const projects = [
  { label: 'sdk, examples, and scripts', args: ['-b', '--noEmit'] },
  { label: 'functional scenes', args: ['-p', 'functional/tsconfig.json'] },
  { label: 'tools and root configs', args: ['-p', 'tools/tsconfig.json'] },
] as const;

interface TypecheckResult {
  label: string;
  output: string;
  passed: boolean;
}

const configuredConcurrency = Number.parseInt(process.env.FLIGHT_TYPECHECK_CONCURRENCY ?? '', 10);
const concurrency = Number.isFinite(configuredConcurrency)
  ? Math.max(1, configuredConcurrency)
  : Math.max(1, Math.min(projects.length, availableParallelism()));
const results = await runProjects(concurrency);
let failed = false;

for (const result of results) {
  process.stdout.write(`\n▶ typecheck: ${result.label}\n`);
  process.stdout.write(result.output);
  if (!result.passed) failed = true;
}

if (failed) process.exit(1);

async function runProject(project: (typeof projects)[number]): Promise<TypecheckResult> {
  return await new Promise((resolve) => {
    const child = spawn('tsc', project.args, { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks: string[] = [];
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => chunks.push(chunk.toString()));
    child.on('error', (error) => chunks.push(`${error.message}\n`));
    child.on('close', (code) => resolve({ label: project.label, output: chunks.join(''), passed: code === 0 }));
  });
}

async function runProjects(limit: number): Promise<TypecheckResult[]> {
  const results = new Array<TypecheckResult>(projects.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, projects.length) }, async () => {
      for (;;) {
        const index = next++;
        const project = projects[index];
        if (project === undefined) return;
        results[index] = await runProject(project);
      }
    }),
  );
  return results;
}
