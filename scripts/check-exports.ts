import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import pc from 'picocolors';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGES_DIR = join(ROOT, 'packages');
const FIX = process.argv.includes('--fix');

const GOVERNED_PACKAGES = [
  'abc',
  'accessibility',
  'adjustments',
  'animation',
  'app',
  'assets',
  'audio',
  'binpack',
  'bitmap',
  'bitmapfont',
  'bitmapfont-formats',
  'bitmaptext',
  'camera',
  'camera-controls',
  'capture',
  'clip',
  'clipboard',
  'clock',
  'collision',
  'color',
  'command',
  'compression',
  'connectivity',
  'debug',
  'device',
  'dialog',
  'easing',
  'effects',
  'effects-canvas',
  'effects-gl',
  'effects-wgpu',
  'encoding',
  'entity',
  'filesystem',
  'flow',
  'font',
  'font-formats',
  'geolocation',
  'geometry',
  'gizmo',
  'glyphatlas',
  'gui',
  'haptics',
  'host',
  'host-capacitor',
  'host-electron',
  'host-tauri',
  'host-web',
  'image',
  'image-codec',
  'importdiagnostics',
  'input',
  'interaction',
  'intl',
  'ipc',
  'keyboard',
  'layout',
  'lifecycle',
  'lighting',
  'loader',
  'log',
  'materials',
  'math',
  'media',
  'mediasession',
  'menu',
  'mesh',
  'midi',
  'motionpath',
  'movieclip',
  'net',
  'node',
  'notification',
  'particleemitter',
  'particles',
  'particles-formats',
  'path',
  'path-boolean',
  'path-formats',
  'permissions',
  'physics2d',
  'physics2d-abi',
  'physics3d',
  'physics3d-abi',
  'picking',
  'platform',
  'power',
  'preferences',
  'protocol',
  'quadbatch',
  'registry',
  'registry-catalog',
  'registry-codegen',
  'render',
  'render-gl',
  'render-wgpu',
  'requirements',
  'scene-document',
  'scene2d',
  'scene2d-canvas',
  'scene2d-dom',
  'scene2d-formats',
  'scene2d-gl',
  'scene2d-resources',
  'scene2d-wgpu',
  'scene3d',
  'scene3d-formats',
  'scene3d-gl',
  'scene3d-resources',
  'scene3d-wgpu',
  'screen',
  'sdk',
  'selection',
  'sensors',
  'shading',
  'shape',
  'shape-formats',
  'share',
  'shell',
  'shortcut',
  'signals',
  'skeleton2d',
  'skeleton2d-formats',
  'skeleton3d',
  'snapshot',
  'socket',
  'spatial',
  'spring',
  'spritesheet',
  'spritesheet-formats',
  'statechart',
  'statusbar',
  'surface',
  'swf',
  'text',
  'text-markup',
  'textbidi',
  'textinput',
  'textlayout',
  'textsegment',
  'textshaper',
  'textshaper-canvas',
  'texture',
  'texture-formats',
  'textureatlas',
  'textureatlas-formats',
  'tilemap',
  'tilemap-formats',
  'timeline',
  'tokens',
  'tool-capture',
  'tool-pipeline',
  'tool-registry',
  'tray',
  'tween',
  // 'types' is excluded: it exports only types via `export *` re-exports, not functions/consts/lets.
  'updater',
  'useragent',
  'velocity',
  'video',
  'webcam',
  'xml',
];

const PROTECTED_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /^initialize\w+/, label: 'initialize*' },
  { pattern: /^populate\w+/, label: 'populate*' },
  { pattern: /ForTest$/, label: '*ForTest' },
  { pattern: /^set\w+Guard$/, label: 'set*Guard' },
  { pattern: /^report\w+/, label: 'report*' },
  { pattern: /^compile\w+/, label: 'compile*' },
  { pattern: /^create\w+Runtime$/, label: 'create*Runtime' },
  { pattern: /^get\w+Runtime$/, label: 'get*Runtime' },
];

function classifierSaysProtected(name: string): boolean {
  return PROTECTED_PATTERNS.some((p) => p.pattern.test(name));
}

// ── Minimal exports.yml parser ───────────────────────────────────────
// Handles: top-level keys, string list items, and `file:` object items.
// No full YAML parser needed for this shape.

interface ExportsPolicy {
  forcePublic: Set<string>;
  forceProtected: Set<string>;
  exclude: Set<string>;
  publicFiles: Set<string>;
  protectedFiles: Set<string>;
  excludeFiles: Set<string>;
}

function parseExportsYml(content: string): ExportsPolicy {
  const policy: ExportsPolicy = {
    forcePublic: new Set(),
    forceProtected: new Set(),
    exclude: new Set(),
    publicFiles: new Set(),
    protectedFiles: new Set(),
    excludeFiles: new Set(),
  };

  const laneMap: Record<string, { symbols: Set<string>; files: Set<string> }> = {
    public: { symbols: policy.forcePublic, files: policy.publicFiles },
    protected: { symbols: policy.forceProtected, files: policy.protectedFiles },
    exclude: { symbols: policy.exclude, files: policy.excludeFiles },
  };

  let currentLane: { symbols: Set<string>; files: Set<string> } | null = null;

  for (const raw of content.split('\n')) {
    const line = raw.replace(/#.*$/, '').trimEnd();
    if (line.trim() === '') continue;

    const keyMatch = line.match(/^(\w+):\s*$/);
    if (keyMatch) {
      currentLane = laneMap[keyMatch[1]] ?? null;
      continue;
    }

    const itemMatch = line.match(/^\s+-\s+(.+)/);
    if (itemMatch && currentLane) {
      const value = itemMatch[1].trim();
      const fileMatch = value.match(/^file:\s*(.+)/);
      if (fileMatch) {
        const filePath = fileMatch[1]
          .trim()
          .replace(/^src\//, '')
          .replace(/\.ts$/, '');
        currentLane.files.add(filePath);
      } else {
        currentLane.symbols.add(value);
      }
    }
  }

  return policy;
}

function loadExportsYml(pkgDir: string): ExportsPolicy {
  const ymlPath = join(pkgDir, 'exports.yml');
  if (!existsSync(ymlPath)) {
    return {
      forcePublic: new Set(),
      forceProtected: new Set(),
      exclude: new Set(),
      publicFiles: new Set(),
      protectedFiles: new Set(),
      excludeFiles: new Set(),
    };
  }
  return parseExportsYml(readFileSync(ymlPath, 'utf8'));
}

// ── Source discovery ─────────────────────────────────────────────────

function getSourceModules(srcDir: string): string[] {
  return readdirSync(srcDir)
    .filter(
      (f) =>
        f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('.d.ts') && f !== 'index.ts' && f !== 'contract.ts',
    )
    .map((f) => f.replace('.ts', ''))
    .sort();
}

function getModuleValueExports(filePath: string): string[] {
  if (!existsSync(filePath)) return [];
  const src = readFileSync(filePath, 'utf8');
  const names: string[] = [];
  const re = /^export (?:async )?(?:function|const|let) (\w+)/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) names.push(m[1]);
  return [...new Set(names)];
}

interface ModuleExports {
  module: string;
  names: string[];
}

function getExportsByModule(srcDir: string): ModuleExports[] {
  const modules = getSourceModules(srcDir);
  const result: ModuleExports[] = [];
  for (const mod of modules) {
    const names = getModuleValueExports(join(srcDir, mod + '.ts'));
    if (names.length > 0) result.push({ module: mod, names });
  }
  return result;
}

// ── Classification ───────────────────────────────────────────────────

type Lane = 'public' | 'protected' | 'exclude';

interface Classification {
  lane: Lane;
  module: string;
  source: string;
}

function classifyExports(exportsByModule: ModuleExports[], policy: ExportsPolicy): Map<string, Classification> {
  const classification = new Map<string, Classification>();

  for (const { module: mod, names } of exportsByModule) {
    const moduleExcluded = policy.excludeFiles.has(mod);
    const moduleProtected = policy.protectedFiles.has(mod);
    const modulePublic = policy.publicFiles.has(mod);

    for (const name of names) {
      let lane: Lane;
      let source: string;

      if (policy.exclude.has(name)) {
        lane = 'exclude';
        source = 'exports.yml';
      } else if (policy.forceProtected.has(name)) {
        lane = 'protected';
        source = 'exports.yml';
      } else if (policy.forcePublic.has(name)) {
        lane = 'public';
        source = 'exports.yml';
      } else if (moduleExcluded) {
        lane = 'exclude';
        source = 'exports.yml (file)';
      } else if (moduleProtected) {
        lane = 'protected';
        source = 'exports.yml (file)';
      } else if (modulePublic) {
        lane = 'public';
        source = 'exports.yml (file)';
      } else if (classifierSaysProtected(name)) {
        lane = 'protected';
        source = 'classifier';
      } else {
        lane = 'public';
        source = 'default';
      }

      classification.set(name, { lane, module: mod, source });
    }
  }

  return classification;
}

// ── Parse current file state ─────────────────────────────────────────

function getModulesFromFile(filePath: string): Set<string> | null {
  if (!existsSync(filePath)) return null;
  const src = readFileSync(filePath, 'utf8');
  const modules = new Set<string>();
  for (const m of src.matchAll(/export \* from '\.\/([^']+)'/g)) modules.add(m[1]);
  for (const m of src.matchAll(/export\s*\{[^}]*\}\s*from\s*'\.\/([^']+)'/g)) modules.add(m[1]);
  return modules;
}

function getExportNamesFromFile(filePath: string, srcDir: string): Set<string> | 'all' | null {
  if (!existsSync(filePath)) return null;
  const src = readFileSync(filePath, 'utf8');
  const names = new Set<string>();

  for (const m of src.matchAll(/export\s*\{([^}]+)\}/g)) {
    for (const item of m[1].split(',')) {
      if (item.includes('type ')) continue;
      const name = item
        .trim()
        .split(/\s+as\s+/)
        .pop()!
        .trim();
      if (name && name !== 'type') names.add(name);
    }
  }

  for (const m of src.matchAll(/export \* from '\.\/([^']+)'/g)) {
    if (m[1] === 'contract') return 'all';
    const fp = join(srcDir, m[1] + '.ts');
    for (const n of getModuleValueExports(fp)) names.add(n);
  }

  return names;
}

function getIndexDuplicateNames(filePath: string, srcDir: string): string[] {
  if (!existsSync(filePath)) return [];
  const src = readFileSync(filePath, 'utf8');
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const m of src.matchAll(/export\s*\{([^}]+)\}/g)) {
    for (const item of m[1].split(',')) {
      if (item.includes('type ')) continue;
      const name = item
        .trim()
        .split(/\s+as\s+/)
        .pop()!
        .trim();
      if (!name || name === 'type') continue;
      if (seen.has(name)) duplicates.add(name);
      seen.add(name);
    }
  }

  for (const m of src.matchAll(/export \* from '\.\/([^']+)'/g)) {
    const fp = join(srcDir, m[1] + '.ts');
    for (const n of getModuleValueExports(fp)) {
      if (seen.has(n)) duplicates.add(n);
      seen.add(n);
    }
  }

  return [...duplicates].sort();
}

// ── Generate file content ────────────────────────────────────────────

function generateContract(exportsByModule: ModuleExports[], classification: Map<string, Classification>): string {
  const modules = exportsByModule
    .filter(({ module: mod, names }) =>
      names.some((n) => {
        const c = classification.get(n);
        return c?.module === mod && c.lane !== 'exclude';
      }),
    )
    .map(({ module: mod }) => mod);

  return modules.map((m) => `export * from './${m}';`).join('\n') + '\n';
}

function generateIndex(exportsByModule: ModuleExports[], classification: Map<string, Classification>): string {
  const lines: string[] = [];

  for (const { module: mod, names } of exportsByModule) {
    const publicNames = names.filter((n) => {
      const c = classification.get(n);
      return c?.lane === 'public' && c.module === mod;
    });
    if (publicNames.length === 0) continue;

    const nonExcluded = names.filter((n) => {
      const c = classification.get(n);
      return c?.lane !== 'exclude' && c?.module === mod;
    });
    const allNonExcludedPublic = nonExcluded.every((n) => classification.get(n)?.lane === 'public');

    if (allNonExcludedPublic && nonExcluded.length === publicNames.length) {
      lines.push(`export * from './${mod}';`);
    } else {
      lines.push('export {');
      for (const n of publicNames) lines.push(`  ${n},`);
      lines.push(`} from './${mod}';`);
    }
  }

  return lines.join('\n') + '\n';
}

// ── Validation ───────────────────────────────────────────────────────

function validatePolicy(policy: ExportsPolicy, allExports: Set<string>): string[] {
  const warnings: string[] = [];
  for (const name of policy.forcePublic) {
    if (!allExports.has(name)) warnings.push(`public override '${name}' not found in source exports`);
  }
  for (const name of policy.forceProtected) {
    if (!allExports.has(name)) warnings.push(`protected override '${name}' not found in source exports`);
  }
  for (const name of policy.exclude) {
    if (!allExports.has(name)) warnings.push(`exclude '${name}' not found in source exports`);
  }
  for (const name of policy.forcePublic) {
    if (policy.forceProtected.has(name)) warnings.push(`'${name}' in both public and protected`);
    if (policy.exclude.has(name)) warnings.push(`'${name}' in both public and exclude`);
  }
  for (const name of policy.forceProtected) {
    if (policy.exclude.has(name)) warnings.push(`'${name}' in both protected and exclude`);
  }
  return warnings;
}

// ── Main ─────────────────────────────────────────────────────────────

let exitCode = 0;

for (const pkg of GOVERNED_PACKAGES) {
  const pkgDir = join(PACKAGES_DIR, pkg);
  const srcDir = join(pkgDir, 'src');
  if (!existsSync(srcDir)) {
    console.log(pc.yellow(`⚠  ${pkg}: no src/, skipping`));
    continue;
  }

  const contractPath = join(srcDir, 'contract.ts');
  const indexPath = join(srcDir, 'index.ts');

  const exportsByModule = getExportsByModule(srcDir);
  const allExports = new Set(exportsByModule.flatMap((m) => m.names));

  const policy = loadExportsYml(pkgDir);
  const policyWarnings = validatePolicy(policy, allExports);
  for (const w of policyWarnings) console.log(pc.yellow(`⚠  ${pkg}: ${w}`));

  const classification = classifyExports(exportsByModule, policy);

  const counts = { public: 0, protected: 0, exclude: 0 };
  for (const { lane } of classification.values()) counts[lane]++;

  const expectedContractModules = new Set(
    exportsByModule
      .filter(({ module: mod, names }) =>
        names.some((n) => {
          const c = classification.get(n);
          return c?.module === mod && c.lane !== 'exclude';
        }),
      )
      .map((m) => m.module),
  );
  const expectedPublicNames = new Set(
    [...classification.entries()].filter(([, v]) => v.lane === 'public').map(([k]) => k),
  );

  const actualContractModules = getModulesFromFile(contractPath);
  const contractMissing = [...expectedContractModules].filter((m) => !actualContractModules?.has(m)).sort();
  const contractExtra = [...(actualContractModules ?? [])].filter((m) => !expectedContractModules.has(m)).sort();
  const contractOk = contractMissing.length === 0 && contractExtra.length === 0;

  const actualPublicNames = getExportNamesFromFile(indexPath, srcDir);
  let indexOk: boolean;
  let indexMissing: string[] = [];
  let indexExtra: string[] = [];
  let indexIsWildcard = false;

  if (actualPublicNames === null) {
    indexOk = false;
    indexMissing = [...expectedPublicNames].sort();
  } else if (actualPublicNames === 'all') {
    indexOk = false;
    indexIsWildcard = true;
  } else {
    indexMissing = [...expectedPublicNames].filter((n) => !actualPublicNames.has(n)).sort();
    indexExtra = [...actualPublicNames].filter((n) => !expectedPublicNames.has(n)).sort();
    indexOk = indexMissing.length === 0 && indexExtra.length === 0;
  }

  const indexDuplicates = getIndexDuplicateNames(indexPath, srcDir);
  const hasDuplicates = indexDuplicates.length > 0;
  if (hasDuplicates) indexOk = false;

  if (contractOk && indexOk) {
    console.log(
      pc.green(`✓  ${pkg}`) +
        `: both files match (${allExports.size} total, ${counts.public} public, ` +
        `${counts.protected} protected, ${counts.exclude} excluded)`,
    );
    continue;
  }

  exitCode = 1;

  if (!contractOk) {
    if (contractMissing.length > 0) {
      console.log(pc.red(`✗  ${pkg} contract.ts`) + `: ${contractMissing.length} source module(s) missing:`);
      for (const m of contractMissing) {
        const names = getModuleValueExports(join(srcDir, m + '.ts'));
        console.log(`   + ${m} (${names.length} exports)`);
      }
    }
    if (contractExtra.length > 0) {
      console.log(pc.red(`✗  ${pkg} contract.ts`) + `: ${contractExtra.length} stale module(s):`);
      for (const m of contractExtra) console.log(`   - ${m}`);
    }
  }

  if (!indexOk) {
    if (hasDuplicates) {
      console.log(
        pc.red(`✗  ${pkg} index.ts`) +
          `: ${indexDuplicates.length} duplicate export name(s): ${indexDuplicates.join(', ')}`,
      );
    }
    if (indexIsWildcard) {
      console.log(
        pc.red(`✗  ${pkg} index.ts`) +
          `: uses 'export * from ./contract' — ` +
          `${counts.protected} exports should be protected, ${counts.exclude} excluded`,
      );
      const protectedNames = [...classification.entries()]
        .filter(([, v]) => v.lane === 'protected')
        .map(([k]) => k)
        .sort();
      if (protectedNames.length > 0) {
        console.log(
          `   Protected (${protectedNames.length}): ` +
            protectedNames.slice(0, 5).join(', ') +
            (protectedNames.length > 5 ? ', ...' : ''),
        );
      }
    } else {
      if (indexMissing.length > 0) {
        console.log(pc.red(`✗  ${pkg} index.ts`) + `: ${indexMissing.length} export(s) should be public:`);
        for (const n of indexMissing.slice(0, 10)) {
          const c = classification.get(n);
          console.log(`   + ${n} (${c?.source})`);
        }
        if (indexMissing.length > 10) console.log(`   ... and ${indexMissing.length - 10} more`);
      }
      if (indexExtra.length > 0) {
        console.log(pc.red(`✗  ${pkg} index.ts`) + `: ${indexExtra.length} export(s) should not be public:`);
        for (const n of indexExtra) {
          const c = classification.get(n);
          if (c) console.log(`   - ${n} (→ ${c.lane}, ${c.source})`);
          else console.log(`   - ${n} (not in source exports)`);
        }
      }
    }
  }

  console.log(
    `   ${allExports.size} total: ${counts.public} public, ` +
      `${counts.protected} protected, ${counts.exclude} excluded`,
  );

  if (FIX) {
    writeFileSync(contractPath, generateContract(exportsByModule, classification));
    writeFileSync(indexPath, generateIndex(exportsByModule, classification));
    console.log(pc.green(`   → fixed: regenerated contract.ts + index.ts`));
  } else {
    console.log(`   Run with --fix to regenerate`);
  }
}

process.exitCode = exitCode;
