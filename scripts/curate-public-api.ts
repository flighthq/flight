// Interactive terminal curator for the public/contract export lanes.
//
// Each package's `index.ts` is the hand-authored public-API allowlist (a subset re-exported from
// the full `./contract` barrel). This tool reads every package's contract surface + current public
// set, lets you scroll and toggle each symbol's status with a keypress, and on save rewrites the
// touched `index.ts` files. The endorsement record stays the resulting `git diff`.
//
//   npm run api:curate            interactive
//   npm run api:curate -- --list  non-interactive status dump (pkg  public/total)
//
// Keys: ↑/↓ move · PgUp/PgDn page · space toggle symbol / collapse package · a toggle-all in package
//       v cycle view (contract-only → public-only → all) · / filter · s save · q quit

import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import readline from 'node:readline';

import { Project } from 'ts-morph';

const root = process.cwd();
const targets = readdirSync(join(root, 'packages'))
  .filter((p) => !/^(sdk|types)$/.test(p) && !/^(host|tool)-/.test(p) && !p.endsWith('-rs'))
  .filter((p) => existsSync(join(root, 'packages', p, 'src', 'contract.ts')))
  .sort();

process.stderr.write('loading export lanes…\n');
const project = new Project({ tsConfigFilePath: join(root, 'tsconfig.base.json'), skipAddingFilesFromTsConfig: true });
for (const p of targets) project.addSourceFilesAtPaths(join(root, 'packages', p, 'src', '*.ts'));

interface Pkg {
  name: string;
  all: string[];
  pub: Set<string>;
  orig: Set<string>;
}

const pkgs: Pkg[] = [];
for (const name of targets) {
  const contract = project.getSourceFile(join(root, 'packages', name, 'src', 'contract.ts'));
  if (!contract) continue;
  const index = project.getSourceFile(join(root, 'packages', name, 'src', 'index.ts'));
  const all = [...contract.getExportedDeclarations().keys()].filter((n) => n !== 'default').sort();
  const pub = new Set(index ? [...index.getExportedDeclarations().keys()].filter((n) => n !== 'default') : []);
  pkgs.push({ name, all, pub, orig: new Set(pub) });
}

function writePackageIndex(pkg: Pkg): void {
  const names = pkg.all.filter((n) => pkg.pub.has(n));
  const body =
    names.length === 0
      ? `export {} from './contract';\n`
      : `export {\n${names.map((n) => `  ${n},`).join('\n')}\n} from './contract';\n`;
  writeFileSync(join(root, 'packages', pkg.name, 'src', 'index.ts'), body);
}

if (process.argv.includes('--list')) {
  for (const p of pkgs) console.log(`${p.name}\t${p.pub.size}/${p.all.length}`);
  process.exit(0);
}

// ---- interactive state ----
type View = 'contract' | 'public' | 'all';
let view: View = 'contract';
let filter = '';
let filtering = false;
let cursor = 0;
let quitArmed = false;
const collapsed = new Set<string>();

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  rev: '\x1b[7m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
};

function symbolsFor(p: Pkg): string[] {
  let syms = p.all;
  if (view === 'contract') syms = syms.filter((s) => !p.pub.has(s));
  else if (view === 'public') syms = syms.filter((s) => p.pub.has(s));
  if (filter) {
    const f = filter.toLowerCase();
    syms = syms.filter((s) => s.toLowerCase().includes(f));
  }
  return syms;
}

interface Row {
  header: boolean;
  pkg: Pkg;
  name?: string;
}

function buildRows(): Row[] {
  const rows: Row[] = [];
  for (const p of pkgs) {
    const syms = symbolsFor(p);
    if (syms.length === 0 && (view !== 'all' || filter)) continue;
    rows.push({ header: true, pkg: p });
    if (!collapsed.has(p.name)) for (const s of syms) rows.push({ header: false, pkg: p, name: s });
  }
  return rows;
}

function dirtyCount(): number {
  return pkgs.filter((p) => p.pub.size !== p.orig.size || [...p.pub].some((s) => !p.orig.has(s))).length;
}

function render(): void {
  const rows = buildRows();
  if (cursor >= rows.length) cursor = Math.max(0, rows.length - 1);
  if (cursor < 0) cursor = 0;
  const height = Math.max(6, (process.stdout.rows ?? 24) - 3);
  let top = Math.max(0, cursor - Math.floor(height / 2));
  top = Math.min(top, Math.max(0, rows.length - height));

  const totalPub = pkgs.reduce((n, p) => n + p.pub.size, 0);
  const totalAll = pkgs.reduce((n, p) => n + p.all.length, 0);
  const dirty = dirtyCount();

  const out: string[] = [];
  out.push('\x1b[H\x1b[2J');
  out.push(
    `${C.bold}${C.cyan}curate public api${C.reset}  ${totalPub}/${totalAll} public  ` +
      `${C.dim}view:${C.reset}${C.yellow}${view}${C.reset}  ` +
      (dirty ? `${C.yellow}${dirty} pkg unsaved${C.reset}` : `${C.dim}saved${C.reset}`),
  );
  out.push(
    `${C.dim}↑↓ move · space toggle · a all-in-pkg · t all-visible · v view · / filter · s save · q quit${C.reset}`,
  );

  for (let i = top; i < Math.min(rows.length, top + height); i++) {
    const r = rows[i];
    const sel = i === cursor;
    let line: string;
    if (r.header) {
      const mark = collapsed.has(r.pkg.name) ? '▸' : '▾';
      line = sel
        ? `${mark} ${r.pkg.name} ${r.pkg.pub.size}/${r.pkg.all.length}`
        : `${C.bold}${mark} ${r.pkg.name}${C.reset} ${C.dim}${r.pkg.pub.size}/${r.pkg.all.length}${C.reset}`;
    } else {
      const on = r.pkg.pub.has(r.name!);
      line = sel
        ? `  ${on ? '●' : '○'} ${r.name!}`
        : `  ${on ? `${C.green}●${C.reset}` : `${C.dim}○${C.reset}`} ${on ? r.name! : `${C.dim}${r.name!}${C.reset}`}`;
    }
    out.push(sel ? `${C.rev}${line}${C.reset}` : line);
  }

  out.push('');
  out.push(
    filtering
      ? `${C.yellow}/${filter}${C.reset}${C.dim}  (enter to apply, esc to clear)${C.reset}`
      : filter
        ? `${C.dim}filter: ${filter}${C.reset}`
        : '',
  );
  process.stdout.write(out.join('\n'));
}

function toggleSymbol(p: Pkg, name: string): void {
  if (p.pub.has(name)) p.pub.delete(name);
  else p.pub.add(name);
}

function onKey(str: string, key: readline.Key): void {
  if (filtering) {
    if (key.name === 'return') filtering = false;
    else if (key.name === 'escape') {
      filtering = false;
      filter = '';
      cursor = 0;
    } else if (key.name === 'backspace') filter = filter.slice(0, -1);
    else if (str && str.length === 1 && !key.ctrl) filter += str;
    render();
    return;
  }

  const rows = buildRows();
  const r = rows[cursor];
  quitArmed = key.name === 'q' && quitArmed;

  switch (key.name) {
    case 'up':
      cursor = Math.max(0, cursor - 1);
      break;
    case 'down':
      cursor = Math.min(rows.length - 1, cursor + 1);
      break;
    case 'pageup':
      cursor = Math.max(0, cursor - 10);
      break;
    case 'pagedown':
      cursor = Math.min(rows.length - 1, cursor + 10);
      break;
    case 'space':
      if (r?.header) {
        if (collapsed.has(r.pkg.name)) collapsed.delete(r.pkg.name);
        else collapsed.add(r.pkg.name);
      } else if (r) toggleSymbol(r.pkg, r.name!);
      break;
    case 'a':
      if (r) {
        const syms = symbolsFor(r.pkg);
        const allOn = syms.every((s) => r.pkg.pub.has(s));
        for (const s of syms)
          if (allOn) r.pkg.pub.delete(s);
          else r.pkg.pub.add(s);
      }
      break;
    case 'v':
      view = view === 'contract' ? 'public' : view === 'public' ? 'all' : 'contract';
      cursor = 0;
      break;
    default:
      if (str === '/') {
        filtering = true;
      } else if (str === 't') {
        // Bulk-toggle every symbol currently visible (respects the active filter + view) across all
        // packages: filter a pattern (e.g. "Data"), then flip the whole matching set in one keypress.
        const visible = buildRows().filter((row) => !row.header);
        const allOn = visible.every((row) => row.pkg.pub.has(row.name!));
        for (const row of visible)
          if (allOn) row.pkg.pub.delete(row.name!);
          else row.pkg.pub.add(row.name!);
      } else if (str === 's') {
        for (const p of pkgs)
          if (p.pub.size !== p.orig.size || [...p.pub].some((s) => !p.orig.has(s))) {
            writePackageIndex(p);
            p.orig = new Set(p.pub);
          }
      } else if (str === 'q') {
        if (dirtyCount() > 0 && !quitArmed) {
          quitArmed = true;
          render();
          process.stdout.write(`\n${C.yellow}unsaved changes — press s to save or q again to discard${C.reset}`);
          return;
        }
        quit();
        return;
      }
  }
  render();
}

function quit(): void {
  process.stdout.write('\x1b[?25h\x1b[?1049l');
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  process.exit(0);
}

if (!process.stdin.isTTY) {
  console.error('curate-public-api needs an interactive terminal (or run with --list).');
  process.exit(1);
}

readline.emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);
process.stdin.resume();
process.stdout.write('\x1b[?1049h\x1b[?25l');
process.stdout.on('resize', render);
process.stdin.on('keypress', (str, key) => {
  if (key && key.ctrl && key.name === 'c') quit();
  else onKey(str, key ?? ({} as readline.Key));
});
render();
