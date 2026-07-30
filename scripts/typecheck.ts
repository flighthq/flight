import { spawnSync } from 'node:child_process';

const projects = [
  { label: 'sdk, examples, and scripts', args: ['-b', '--noEmit'] },
  { label: 'functional scenes', args: ['-p', 'functional/tsconfig.json'] },
  { label: 'tools and root configs', args: ['-p', 'tools/tsconfig.json'] },
] as const;

let failed = false;

for (const project of projects) {
  process.stdout.write(`\n▶ typecheck: ${project.label}\n`);
  const result = spawnSync('tsc', project.args, { stdio: 'inherit' });
  if (result.status !== 0) failed = true;
}

if (failed) process.exit(1);
