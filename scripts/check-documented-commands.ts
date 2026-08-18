import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import pc from 'picocolors';

// Finds `npm run <name>` citations in the docs that name no script the root manifest has.
//
// A doc naming a command is making a checkable claim, and scripts get renamed under it. The failure is
// quiet in the worst way: the reader runs the command, npm says "missing script", and the doc still looks
// authoritative — so the reader concludes their checkout is broken rather than the doc.
//
// ★ THE INSTRUMENT'S OWN POPULATION IS THE HARD PART, AND A HAND-ROLLED PASS GOT IT WRONG BOTH WAYS.
// One reported 12 dead commands where 5 were real, and the same pass simultaneously MISSED three real
// ones by never walking `.claude/`. Over- and under-counting are not opposite mistakes you can average
// out; they are the same mistake — a scope nobody stated — and fixing the visible direction does not
// touch the other. Hence: this walks the FULL tracked-markdown set, and prints every number it used.
//
// Two citation forms look dead to a naive check and are not. Both are reported rather than dropped, so
// the skip is visible instead of being a silent narrowing of the same kind:
//   1. WORKSPACE-SCOPED (`npm run build --workspace=examples/x`) resolves against that workspace's own
//      manifest, so the root manifest says nothing about it.
//   2. METASYNTACTIC (`npm run X`, `npm run <name>`) is a placeholder standing for any script, not a
//      citation of one. `agents/inert-gate-audit.md` uses `npm run X` while explaining script closures.
//
// A doc may also cite a command as a bare backticked name with no `npm run` lead — `examples/README.md`
// does this for `dev:examples:wasm`. Those are real citations and real rot, and this check does NOT see
// them: a bare token cannot be told from prose without a script-name dictionary that would match common
// English. Stated so the gate's silence on them is not read as their absence.

// One `npm run <name>` citation found in a doc.
export interface DocumentedCommand {
  command: string;
  docLine: number;
  docPath: string;
}

export type DocumentedCommandVerdict = 'metasyntactic' | 'missing' | 'resolved' | 'workspace-scoped';

const metasyntacticCommands = new Set(['X', 'Y', 'Z', '<name>', '<script>']);

const scriptPath = fileURLToPath(import.meta.url);

// Sorts citations into the four verdicts. `scriptNames` is the root manifest's script keys; a citation
// resolves exactly when it is one of them.
export function classifyDocumentedCommands(
  citations: readonly DocumentedCommand[],
  scriptNames: ReadonlySet<string>,
  workspaceScopedLines: ReadonlySet<string>,
): Map<DocumentedCommandVerdict, DocumentedCommand[]> {
  const byVerdict = new Map<DocumentedCommandVerdict, DocumentedCommand[]>([
    ['metasyntactic', []],
    ['missing', []],
    ['resolved', []],
    ['workspace-scoped', []],
  ]);

  for (const citation of citations) {
    byVerdict.get(getDocumentedCommandVerdict(citation, scriptNames, workspaceScopedLines))!.push(citation);
  }

  return byVerdict;
}

// Pulls every `npm run <name>` citation out of one doc's text.
export function parseDocumentedCommands(docPath: string, text: string): DocumentedCommand[] {
  const citations: DocumentedCommand[] = [];
  const lines = text.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const pattern = /npm run ([\w:.@<>-]+)/g;
    let match = pattern.exec(lines[index]!);
    while (match !== null) {
      citations.push({ command: match[1]!, docLine: index + 1, docPath });
      match = pattern.exec(lines[index]!);
    }
  }
  return citations;
}

function getDocumentedCommandVerdict(
  citation: Readonly<DocumentedCommand>,
  scriptNames: ReadonlySet<string>,
  workspaceScopedLines: ReadonlySet<string>,
): DocumentedCommandVerdict {
  if (workspaceScopedLines.has(`${citation.docPath}:${citation.docLine}`)) return 'workspace-scoped';
  if (metasyntacticCommands.has(citation.command)) return 'metasyntactic';
  return scriptNames.has(citation.command) ? 'resolved' : 'missing';
}

function main(): void {
  const isGate = process.argv.includes('--check');
  const root = resolve(dirname(scriptPath), '..');
  const scriptNames = new Set(
    Object.keys(JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).scripts ?? {}),
  );

  const docPaths = listTrackedMarkdown(root);
  const citations: DocumentedCommand[] = [];
  const workspaceScopedLines = new Set<string>();

  for (const docPath of docPaths) {
    const text = readFileSync(resolve(root, docPath), 'utf8');
    text.split('\n').forEach((line, index) => {
      if (line.includes('--workspace=')) workspaceScopedLines.add(`${docPath}:${index + 1}`);
    });
    citations.push(...parseDocumentedCommands(docPath, text));
  }

  const byVerdict = classifyDocumentedCommands(citations, scriptNames, workspaceScopedLines);
  const missing = byVerdict.get('missing')!;
  const unique = new Set(citations.map((c) => c.command)).size;

  console.log(
    `documented commands: ${citations.length} citation(s) of ${unique} distinct command(s) across ` +
      `${docPaths.length} tracked markdown file(s) — ${byVerdict.get('resolved')!.length} resolved, ` +
      `${byVerdict.get('workspace-scoped')!.length} workspace-scoped, ` +
      `${byVerdict.get('metasyntactic')!.length} metasyntactic placeholder(s)\n`,
  );

  if (missing.length === 0) {
    console.log(pc.green(`✓ every cited command resolves against the root manifest`));
    return;
  }

  console.log(pc.red(`${missing.length} citation(s) name no script in the root manifest:`));
  for (const citation of missing) {
    console.log(`  ${pc.red('✗')} ${citation.docPath}:${citation.docLine}  ${citation.command}`);
  }
  if (isGate) process.exitCode = 1;
}

// Uses git's index rather than a directory walk so generated and ignored trees cannot join the
// population — the same reason a census here is taken with `git ls-files` rather than `readdirSync`.
function listTrackedMarkdown(root: string): string[] {
  return execFileSync('git', ['ls-files', '*.md'], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .filter((line) => line.length > 0)
    .sort();
}

if (resolve(process.argv[1] ?? '') === resolve(scriptPath)) main();
