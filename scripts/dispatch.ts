/**
 * Dispatch a review session's staged guidance into a worker's worktree — the outbound twin of
 * `import:worktree`.
 *
 *   npm run dispatch:worktree ../builder
 *   npm run dispatch:worktree ../builder -- --from=./outgoing/builder --clean --dry-run
 *
 * Why this exists: a review session shapes a blessed workplan and fans it out to several worker
 * agents, each in its own worktree. The reviewer agent lives in a sandbox and must never write across
 * a worktree boundary, so it only *stages* briefs in its own tree under `outgoing/<target>/`. This
 * command runs on the host — where the sibling worktrees are reachable — and *deposits* one target's
 * staged slice into that worktree's `tools/agents/docs/assignments/` inbox (the inbound twin of the
 * flat `status/` outbound tray). The per-target staging directory is the routing: a worker only ever
 * sees its own assignments, never another's.
 *
 * This is a deposit of guidance, not the reverse of import: one review session dispatches to many
 * workers. The command transmits brief files verbatim — it never rewrites their content. Each brief is
 * authored upstream (the frozen `assessment.md › Approved` items plus any session directives, stamped
 * with the originating review session); this script only moves bytes.
 *
 *   --from=<dir>   staging dir to read briefs from (default: outgoing/<basename(target)>)
 *   --clean        remove existing *.md from the target inbox before depositing
 *   --dry-run      report what would be deposited without writing
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

interface Args {
  target: string;
  from?: string;
  clean: boolean;
  dryRun: boolean;
}

const INBOX_REL = path.join('tools', 'agents', 'docs', 'assignments');

function parseArgs(argv: readonly string[]): Args {
  let target: string | undefined;
  let from: string | undefined;
  let clean = false;
  let dryRun = false;
  for (const arg of argv) {
    if (arg === '--clean') clean = true;
    else if (arg === '--dry-run') dryRun = true;
    else if (arg.startsWith('--from=')) from = path.resolve(arg.slice('--from='.length));
    else if (!arg.startsWith('--') && target === undefined) target = arg;
  }
  if (target === undefined) {
    console.error('usage: npm run dispatch:worktree <worktree-path> -- [--from=<dir>] [--clean] [--dry-run]');
    process.exit(1);
  }
  return { target: path.resolve(target), from, clean, dryRun };
}

// The reviewer stages one directory per target worktree under outgoing/<basename>. Default to that.
function resolveStagingDir(target: string, override?: string): string {
  return override ?? path.resolve('outgoing', path.basename(target));
}

function listBriefs(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .sort();
}

const args = parseArgs(process.argv.slice(2));

if (!fs.existsSync(args.target) || !fs.statSync(args.target).isDirectory()) {
  console.error(`Target worktree does not exist: ${args.target}`);
  process.exit(1);
}
const inbox = path.join(args.target, INBOX_REL);
// Sanity-check the destination is a Flight worktree before depositing, so a wrong path fails loudly
// instead of scattering files into an unrelated directory.
if (!fs.existsSync(path.join(args.target, 'tools', 'agents', 'docs'))) {
  console.error(`Not a Flight worktree (no tools/agents/docs): ${args.target}`);
  process.exit(1);
}

const stagingDir = resolveStagingDir(args.target, args.from);
const briefs = listBriefs(stagingDir);
if (briefs.length === 0) {
  console.error(`No briefs staged at ${stagingDir} (expected one or more <pkg>.md). Nothing to dispatch.`);
  process.exit(1);
}

const verb = args.dryRun ? 'would deposit' : 'deposited';
if (!args.dryRun) fs.mkdirSync(inbox, { recursive: true });

if (args.clean) {
  for (const stale of listBriefs(inbox)) {
    const p = path.join(inbox, stale);
    if (args.dryRun) console.log(`would remove stale ${path.join(INBOX_REL, stale)}`);
    else fs.rmSync(p);
  }
} else {
  const pre = listBriefs(inbox).filter((name) => !briefs.includes(name));
  if (pre.length > 0) {
    console.warn(
      `warning: ${pre.length} unrelated brief(s) already in the inbox (left in place; use --clean to clear): ${pre.join(', ')}`,
    );
  }
}

for (const brief of briefs) {
  const dest = path.join(inbox, brief);
  if (!args.dryRun) fs.copyFileSync(path.join(stagingDir, brief), dest);
  console.log(`${verb} ${path.join(INBOX_REL, brief)}`);
}

console.log(`${args.dryRun ? 'dry-run: ' : ''}${briefs.length} brief(s) → ${path.relative(process.cwd(), inbox)}`);
