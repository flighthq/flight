import { spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

interface PackageAudit {
  crate: string;
  entries: AuditEntry[];
  package: string;
}

interface AuditEntry {
  kind: 'source' | 'test';
  status: 'blocked' | 'compiler-clean' | 'partial';
}

interface Enrollment {
  crate: string;
  package: string;
}

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const requested = new Set(process.argv.slice(2));
const enrollments = enrolledPackages().filter(
  (entry) => requested.size === 0 || requested.has(entry.package) || requested.has(`@flighthq/${entry.package}`),
);
if (requested.size > 0 && enrollments.length !== requested.size) {
  const found = new Set(enrollments.flatMap((entry) => [entry.package, `@flighthq/${entry.package}`]));
  const missing = [...requested].filter((name) => !found.has(name));
  if (missing.length > 0) throw new Error(`unknown generated Rust package: ${missing.join(', ')}`);
}

const audits = await parallelMap(enrollments, 4, auditPackage);
const counts = {
  production: { blocked: 0, compilerClean: 0, partial: 0, targetNative: 0 },
  tests: { blocked: 0, compilerClean: 0, partial: 0, targetNative: 0 },
};
for (const audit of audits) {
  for (const entry of audit.entries) {
    const bucket = entry.kind === 'source' ? counts.production : counts.tests;
    bucket.targetNative += 1;
    if (entry.status === 'compiler-clean') bucket.compilerClean += 1;
    else bucket[entry.status] += 1;
  }
}
console.log(JSON.stringify({ counts, packages: audits }, null, 2));

function enrolledPackages(): Enrollment[] {
  const enrollments: Enrollment[] = [];
  for (const packageName of readdirSync(join(repositoryRoot, 'packages')).sort()) {
    const manifestPath = join(repositoryRoot, 'packages', packageName, 'package.json');
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      scripts?: { generate?: string };
    };
    const generate = manifest.scripts?.generate;
    const crate = generate === undefined ? undefined : /--crate\s+(\S+)/.exec(generate)?.[1];
    const packageArgument = generate === undefined ? undefined : /--package\s+(\S+)/.exec(generate)?.[1];
    if (crate && packageArgument) enrollments.push({ crate, package: packageArgument });
  }
  return enrollments;
}

async function auditPackage(enrollment: Enrollment): Promise<PackageAudit> {
  const arguments_ = [
    join(repositoryRoot, 'scripts', 'generate-rust-package.ts'),
    '--crate',
    enrollment.crate,
    '--package',
    enrollment.package,
    '--audit-native',
  ];
  const { code, stderr, stdout } = await run(join(repositoryRoot, 'node_modules', '.bin', 'tsx'), arguments_);
  if (code !== 0) throw new Error(`${enrollment.package} audit failed:\n${stderr}`);
  return JSON.parse(stdout) as PackageAudit;
}

async function parallelMap<T, U>(
  values: readonly T[],
  limit: number,
  operation: (value: T) => Promise<U>,
): Promise<U[]> {
  const output = new Array<U>(values.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, values.length) }, async () => {
      while (next < values.length) {
        const index = next;
        next += 1;
        output[index] = await operation(values[index]);
      }
    }),
  );
  return output;
}

function run(command: string, arguments_: string[]): Promise<{ code: number; stderr: string; stdout: string }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, arguments_, { cwd: repositoryRoot, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk));
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) => resolvePromise({ code: code ?? 1, stderr, stdout }));
  });
}
