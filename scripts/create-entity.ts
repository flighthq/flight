import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Node, Project, TypeFormatFlags } from 'ts-morph';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const packagesDir = join(root, 'packages');
const baselinePath = join(root, 'scripts', 'create-entity-baseline.json');

export interface CreateEntityRecord {
  packageName: string;
  name: string;
  returnTypes: string[];
  source: string;
  returnsEntity: boolean;
}

interface Baseline {
  nonEntityCreateFunctions: string[];
}

export function getCreateEntityBaselineIssues(
  currentViolations: readonly string[],
  baselineViolations: readonly string[],
): string[] {
  const current = new Set(currentViolations);
  const baseline = new Set(baselineViolations);
  const issues: string[] = [];
  for (const id of [...current].sort()) {
    if (!baseline.has(id)) issues.push(`new non-Entity create function: ${id}`);
  }
  for (const id of [...baseline].sort()) {
    if (!current.has(id)) issues.push(`resolved or renamed baseline entry must be reviewed and removed: ${id}`);
  }
  return issues;
}

export function collectPublicCreateFunctions(): CreateEntityRecord[] {
  const project = new Project({
    tsConfigFilePath: join(root, 'tsconfig.base.json'),
    skipAddingFilesFromTsConfig: true,
  });
  const entitySource = project.addSourceFileAtPath(join(packagesDir, 'types', 'src', 'Entity.ts'));
  const entityType = entitySource.getInterfaceOrThrow('Entity').getType();
  const packages = readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'sdk')
    .flatMap((entry) => {
      const manifestPath = join(packagesDir, entry.name, 'package.json');
      const indexPath = join(packagesDir, entry.name, 'src', 'index.ts');
      if (!existsSync(manifestPath) || !existsSync(indexPath)) return [];
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { name: string };
      return [{ packageName: manifest.name, indexPath }];
    })
    .sort((a, b) => a.packageName.localeCompare(b.packageName));

  for (const entry of packages) project.addSourceFileAtPath(entry.indexPath);

  const records: CreateEntityRecord[] = [];
  for (const entry of packages) {
    const sourceFile = project.getSourceFileOrThrow(entry.indexPath);
    for (const [name, declarations] of sourceFile.getExportedDeclarations()) {
      if (!/^create[A-Z0-9]/.test(name)) continue;
      const callable = declarations.filter(
        (declaration) => Node.isFunctionDeclaration(declaration) || Node.isVariableDeclaration(declaration),
      );
      const signatures = callable.flatMap((declaration) => declaration.getType().getCallSignatures());
      if (signatures.length === 0) continue;
      const returnTypes = [...new Set(signatures.map((signature) => signature.getReturnType()))];
      records.push({
        packageName: entry.packageName,
        name,
        returnTypes: returnTypes
          .map((type) => type.getText(undefined, TypeFormatFlags.NoTruncation))
          .sort((a, b) => a.localeCompare(b)),
        source: relative(root, callable[0]!.getSourceFile().getFilePath()).replaceAll('\\', '/'),
        returnsEntity: returnTypes.every((type) => type.isAssignableTo(entityType)),
      });
    }
  }
  return records.sort((a, b) => a.packageName.localeCompare(b.packageName) || a.name.localeCompare(b.name));
}

function main(): void {
  const updateBaseline = process.argv.includes('--update-baseline');
  const check = process.argv.includes('--check');
  const json = process.argv.includes('--json');
  const records = collectPublicCreateFunctions();
  const violations = records.filter((record) => !record.returnsEntity);
  const violationIds = violations.map(recordId);

  if (updateBaseline) {
    writeFileSync(baselinePath, `${JSON.stringify({ nonEntityCreateFunctions: violationIds }, null, 2)}\n`);
    console.log(`[api:create-entity] wrote ${relative(root, baselinePath)} with ${violationIds.length} review entries`);
    return;
  }

  if (check) {
    const baseline = JSON.parse(readFileSync(baselinePath, 'utf8')) as Baseline;
    const issues = getCreateEntityBaselineIssues(violationIds, baseline.nonEntityCreateFunctions);
    if (issues.length > 0) {
      console.error(`[api:create-entity] ${issues.length} baseline issue(s):`);
      for (const issue of issues) console.error(`  - ${issue}`);
      process.exit(1);
    }
    console.log(
      `[api:create-entity] ${records.length - violations.length}/${records.length} public create functions return Entity; ` +
        `${violations.length} pre-existing functions remain in the semantic-review baseline`,
    );
    return;
  }

  if (json) {
    console.log(JSON.stringify({ records, totals: summarize(records) }, null, 2));
    return;
  }

  const totals = summarize(records);
  console.log(
    `[api:create-entity] ${totals.entity}/${totals.total} public create functions return Entity; ` +
      `${totals.nonEntity} require semantic review`,
  );
  for (const record of violations) {
    console.log(`  ${record.packageName} ${record.name}: ${record.returnTypes.join(' | ')} (${record.source})`);
  }
}

function summarize(records: readonly CreateEntityRecord[]): { total: number; entity: number; nonEntity: number } {
  const entity = records.filter((record) => record.returnsEntity).length;
  return { total: records.length, entity, nonEntity: records.length - entity };
}

function recordId(record: Readonly<CreateEntityRecord>): string {
  return `${record.packageName} ${record.name}`;
}

if (resolve(process.argv[1] ?? '') === resolve(fileURLToPath(import.meta.url))) main();
