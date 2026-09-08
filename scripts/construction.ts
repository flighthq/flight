import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseSync } from 'oxc-parser';
import pc from 'picocolors';

import { SCAN_SKIP_DIRECTORIES } from './scanSkipDirectories';
import { filterPaths, getSelectors } from './select';

// Construction-model gate. Every `allocateEntity()` call must have a matching `finishEntity()` in the
// same function scope. `createEntity()` is deprecated for new code — the gate blocks regression. See
// [entity construction model](../agents/entity-construction-model.md) for the full discipline.
//
// AST-based (via oxc-parser), scoped per function. A function that calls `allocateEntity` N times but
// `finishEntity` fewer than N times is a violation — the under-construction entity escapes without the
// readonly contract being restored. Nested functions get their own scope: an arrow function inside a
// `create*` that has its own balanced allocate/finish pair does not count against the outer function.

type Rule = 'unpaired-allocate' | 'deprecated-create-entity';

const ALLOW: { rule: Rule; match: (rel: string) => boolean; why: string }[] = [
  {
    rule: 'unpaired-allocate',
    match: (rel) => rel === 'packages/host-electron/src/electronShell.ts',
    why: 'host-electron shell capabilities not yet migrated to finishEntity',
  },
  {
    rule: 'unpaired-allocate',
    match: (rel) => rel === 'packages/host-tauri/src/tauriShell.ts',
    why: 'host-tauri shell capabilities not yet migrated to finishEntity',
  },
  {
    rule: 'unpaired-allocate',
    match: (rel) => rel === 'packages/host-tauri/src/tauriShortcut.ts',
    why: 'host-tauri shortcut backend not yet migrated to finishEntity',
  },
  {
    rule: 'unpaired-allocate',
    match: (rel) => rel === 'packages/host-web/src/webInputTarget.ts',
    why: 'web input target handle not yet migrated to finishEntity',
  },
  {
    rule: 'unpaired-allocate',
    match: (rel) => rel === 'packages/host-web/src/webStoragePersistence.ts',
    why: 'web storage persistence capabilities not yet migrated to finishEntity',
  },
  {
    rule: 'unpaired-allocate',
    match: (rel) => rel === 'packages/host-web/src/webWindow.ts',
    why: 'web window target handles not yet migrated to finishEntity',
  },
  {
    rule: 'unpaired-allocate',
    match: (rel) => rel === 'packages/image/src/imageResource.ts',
    why: 'createImageResource not yet migrated to finishEntity',
  },
  {
    rule: 'unpaired-allocate',
    match: (rel) => rel === 'packages/lighting/src/directionalLight.ts',
    why: 'createDirectionalLight not yet migrated to finishEntity',
  },
  {
    rule: 'unpaired-allocate',
    match: (rel) => rel === 'packages/lighting/src/spotLight.ts',
    why: 'createSpotLight not yet migrated to finishEntity',
  },
  {
    rule: 'unpaired-allocate',
    match: (rel) => rel === 'packages/loader/src/resourceLoader.ts',
    why: 'createResourceLoader not yet migrated to finishEntity',
  },
  {
    rule: 'unpaired-allocate',
    match: (rel) => rel === 'packages/media/src/audioMixer.ts',
    why: 'createAudioMixer not yet migrated to finishEntity',
  },
  {
    rule: 'unpaired-allocate',
    match: (rel) => rel === 'packages/physics2d-abi/src/physics2DAbiBuffer.ts',
    why: 'physics2d ABI buffer not yet migrated to finishEntity',
  },
  {
    rule: 'unpaired-allocate',
    match: (rel) => rel === 'packages/physics2d/src/worldQueries.ts',
    why: 'createShapeCastProbe not yet migrated to finishEntity',
  },
  {
    rule: 'unpaired-allocate',
    match: (rel) => rel === 'packages/physics3d-abi/src/physics3DAbiBuffer.ts',
    why: 'physics3d ABI buffer not yet migrated to finishEntity',
  },
  {
    rule: 'unpaired-allocate',
    match: (rel) => rel === 'packages/physics3d/src/worldQueries.ts',
    why: 'createShapeCastProbe not yet migrated to finishEntity',
  },
  {
    rule: 'unpaired-allocate',
    match: (rel) => rel === 'packages/render-gl/src/glPipeline.ts',
    why: 'createGlPipeline not yet migrated to finishEntity',
  },
  {
    rule: 'unpaired-allocate',
    match: (rel) => rel === 'packages/render-wgpu/src/wgpuDraw.ts',
    why: 'bindWgpuTexture not yet migrated to finishEntity',
  },
  {
    rule: 'unpaired-allocate',
    match: (rel) => rel === 'packages/render-wgpu/src/wgpuExternalTexture.ts',
    why: 'createExternalWgpuTexture not yet migrated to finishEntity',
  },
  {
    rule: 'unpaired-allocate',
    match: (rel) => rel === 'packages/render-wgpu/src/wgpuPipeline.ts',
    why: 'createWgpuPipeline not yet migrated to finishEntity',
  },
  {
    rule: 'unpaired-allocate',
    match: (rel) => rel === 'packages/scene2d-canvas/src/canvasPipeline.ts',
    why: 'createCanvasPipeline not yet migrated to finishEntity',
  },
  {
    rule: 'unpaired-allocate',
    match: (rel) => rel === 'packages/scene2d/src/scene2d.ts',
    why: 'createScene2D not yet migrated to finishEntity',
  },
  {
    rule: 'unpaired-allocate',
    match: (rel) => rel === 'packages/shape/src/morphShape.ts',
    why: 'createMorphShapeData not yet migrated to finishEntity',
  },
  {
    rule: 'unpaired-allocate',
    match: (rel) => rel === 'packages/skeleton2d/src/pathConstraint2D.ts',
    why: 'createScratchPath not yet migrated to finishEntity',
  },
  {
    rule: 'unpaired-allocate',
    match: (rel) => rel === 'packages/skeleton3d/src/skeleton3d.ts',
    why: 'createSkeleton3D and cloneSkeleton3D not yet migrated to finishEntity',
  },
  {
    rule: 'unpaired-allocate',
    match: (rel) => rel === 'packages/socket/src/socket.ts',
    why: 'createSocket not yet migrated to finishEntity',
  },
];

const IGNORED_DIRS = new Set([...SCAN_SKIP_DIRECTORIES, '.claude', '.quimby', 'worktrees', 'incoming']);

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const checkMode = process.argv.includes('--check');
const jsonMode = process.argv.includes('--json');

interface Violation {
  path: string;
  line: number;
  rule: Rule;
  detail: string;
}

interface FunctionScope {
  name: string;
  line: number;
  allocates: number;
  finishes: number;
}

const violations: Violation[] = [];
let allowed = 0;

for (const path of getSourceFiles()) {
  const rel = relative(root, path).replaceAll('\\', '/');
  const text = readFileSync(path, 'utf-8');
  if (!mightContainConstruction(text)) continue;
  const { program } = parseSync(path, text, {
    sourceType: 'module',
    lang: path.endsWith('.tsx') ? 'tsx' : 'ts',
  });
  if (!program) continue;

  const fileViolations: Violation[] = [];
  // Program satisfies AstNode at runtime but lacks the index signature walkConstruction iterates.
  walkConstruction(program as unknown as AstNode, [], null, text, fileViolations);

  for (const v of fileViolations) {
    if (ALLOW.some((a) => a.rule === v.rule && a.match(rel))) {
      allowed++;
    } else {
      violations.push({ ...v, path: rel });
    }
  }
}

violations.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line);

if (jsonMode) {
  console.log(JSON.stringify({ passed: violations.length === 0, allowed, violations }, null, 2));
  process.exit(violations.length > 0 && checkMode ? 1 : 0);
}

if (violations.length === 0) {
  console.log(
    `${pc.green('OK')} ${pc.bold('Entity construction model enforced')} ${pc.dim(`(${allowed} named escape${allowed === 1 ? '' : 's'} allow-listed)`)}`,
  );
  process.exit(0);
}

console.log(
  `${pc.yellow('!')} ${pc.bold(`${violations.length} construction-model violation${violations.length === 1 ? '' : 's'}`)}\n`,
);
for (const v of violations) {
  console.log(`  ${pc.yellow('!')} ${pc.white(`${v.path}:${v.line}`)} ${pc.dim(v.detail)}`);
}
console.log(
  `\n${pc.dim('If a violation is genuinely intentional and contained, add it to ALLOW in scripts/construction.ts with a reason.')}`,
);
process.exit(checkMode ? 1 : 0);

function mightContainConstruction(text: string): boolean {
  return /\b(?:allocateEntity|createEntity)\b/.test(text);
}

function walkConstruction(
  node: AstNode,
  scopes: FunctionScope[],
  contextName: string | null,
  text: string,
  out: Violation[],
): void {
  if (!node || typeof node !== 'object') return;

  const isFn =
    node.type === 'FunctionDeclaration' ||
    node.type === 'FunctionExpression' ||
    node.type === 'ArrowFunctionExpression';

  if (isFn) {
    const name = (node as AstNode).id?.name ?? contextName ?? '<anonymous>';
    scopes.push({ name, line: lineOf(text, node.start as number), allocates: 0, finishes: 0 });
  }

  if (node.type === 'CallExpression') {
    const calleeName = calleeIdentifier(node);
    if (calleeName === 'allocateEntity') {
      if (scopes.length > 0) scopes[scopes.length - 1]!.allocates++;
    }
    if (calleeName === 'finishEntity') {
      if (scopes.length > 0) scopes[scopes.length - 1]!.finishes++;
    }
    if (calleeName === 'createEntity') {
      out.push({
        path: '',
        rule: 'deprecated-create-entity',
        line: lineOf(text, node.start as number),
        detail: 'createEntity() call — use allocateEntity() + initialize*() + finishEntity()',
      });
    }
  }

  for (const key in node) {
    if (key === 'type' || key === 'start' || key === 'end') continue;
    const value = (node as Record<string, unknown>)[key];

    let childCtx: string | null = null;
    if (node.type === 'VariableDeclarator' && key === 'init' && node.id?.type === 'Identifier') {
      childCtx = node.id.name as string;
    }
    if (node.type === 'MethodDefinition' && key === 'value' && node.key?.type === 'Identifier') {
      childCtx = node.key.name as string;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === 'object') walkConstruction(item as AstNode, scopes, childCtx, text, out);
      }
    } else if (typeof value === 'object' && value !== null) {
      walkConstruction(value as AstNode, scopes, childCtx, text, out);
    }
  }

  if (isFn) {
    const scope = scopes.pop()!;
    if (scope.allocates > 0 && scope.finishes < scope.allocates) {
      out.push({
        path: '',
        rule: 'unpaired-allocate',
        line: scope.line,
        detail: `${scope.name}(): ${scope.allocates} allocateEntity() but ${scope.finishes} finishEntity()`,
      });
    }
  }
}

function calleeIdentifier(node: AstNode): string | null {
  const callee = unwrap(node.callee);
  return callee?.type === 'Identifier' ? (callee.name as string) : null;
}

function unwrap(node: AstNode | undefined): AstNode | undefined {
  let current = node;
  while (
    current &&
    (current.type === 'TSAsExpression' ||
      current.type === 'TSNonNullExpression' ||
      current.type === 'TSSatisfiesExpression' ||
      current.type === 'ParenthesizedExpression')
  ) {
    current = current.expression;
  }
  return current;
}

function lineOf(text: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

function getSourceFiles(): string[] {
  const files: string[] = [];
  walkDir(join(root, 'packages'), files);
  const scoped = files.filter((path) => {
    const rel = relative(root, path).replaceAll('\\', '/');
    if (!/^packages\/[^/]+\/src\//.test(rel)) return false;
    if (rel.endsWith('.test.ts') || rel.endsWith('.test.tsx')) return false;
    if (rel.startsWith('packages/tool-')) return false;
    if (/testhelper\.ts$/i.test(rel)) return false;
    return true;
  });
  return filterPaths(scoped, getSelectors()).sort();
}

function walkDir(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      walkDir(path, out);
      continue;
    }
    if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) out.push(path);
  }
}

interface AstNode {
  type: string;
  callee?: AstNode;
  expression?: AstNode;
  id?: AstNode;
  key?: AstNode;
  name?: string;
  start?: number;
  [key: string]: unknown;
}
