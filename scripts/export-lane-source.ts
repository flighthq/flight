import { existsSync, readFileSync } from 'node:fs';

import { parseSync } from 'oxc-parser';
import type { BindingPattern, Declaration } from 'oxc-parser';

/**
 * Returns the runtime names a source module exports directly.
 *
 * Plain relative re-exports are owned by the sibling module scanned separately, while their published
 * names are retained to keep wildcard barrels from leaking a protected sibling value. Package
 * re-exports and local aliases belong to this module, including aliases whose backing declaration is
 * intentionally private.
 */
export function getModulePublishedValueExports(filePath: string): string[] {
  if (!existsSync(filePath)) return [];
  return getSourceValueExportInventory(readFileSync(filePath, 'utf8'), filePath).publishedNames;
}

export function getModuleValueExports(filePath: string): string[] {
  if (!existsSync(filePath)) return [];
  return getSourceValueExportInventory(readFileSync(filePath, 'utf8'), filePath).ownedNames;
}

export function getSourcePublishedValueExports(source: string, filePath = 'source.ts'): string[] {
  return getSourceValueExportInventory(source, filePath).publishedNames;
}

export function getSourceValueExports(source: string, filePath = 'source.ts'): string[] {
  return getSourceValueExportInventory(source, filePath).ownedNames;
}

interface SourceValueExportInventory {
  ownedNames: string[];
  publishedNames: string[];
}

function getSourceValueExportInventory(source: string, filePath: string): SourceValueExportInventory {
  const ownedNames: string[] = [];
  const publishedNames: string[] = [];
  const parsed = parseSync(filePath, source, { lang: 'ts', sourceType: 'module' });
  if (parsed.errors.length > 0)
    throw new Error(`Could not parse ${filePath}: ${parsed.errors[0]?.message ?? 'unknown parse error'}`);

  const localValues = new Set<string>();
  for (const statement of parsed.program.body) {
    if (statement.type === 'ExportNamedDeclaration' && statement.declaration !== null) {
      addLocalValues(statement.declaration, localValues);
    } else if (statement.type === 'FunctionDeclaration' || statement.type === 'VariableDeclaration') {
      addLocalValues(statement, localValues);
    }
  }

  for (const declaration of parsed.module.staticExports) {
    for (const entry of declaration.entries) {
      const exportedName = entry.exportName.kind === 'Name' ? entry.exportName.name : null;
      if (entry.isType || exportedName === null) continue;
      const request = entry.moduleRequest?.value;
      const localName = entry.localName.kind === 'Name' ? entry.localName.name : null;
      const isSupportedLocalValue = request === undefined && localName !== null && localValues.has(localName);
      const isPackageReExport = request !== undefined && !request.startsWith('.');
      const isRelativeReExport = request?.startsWith('.') === true;
      if (!isSupportedLocalValue && !isPackageReExport && !isRelativeReExport) continue;

      publishedNames.push(exportedName);

      // Oxc retains the origin even for `import { value } from './sibling'; export { value }`. A plain
      // same-package forwarding export is owned by the sibling scanned separately; an alias is a new
      // package-surface name owned here. Published names remain separate so a wildcard can never leak a
      // forwarded protected value merely because this module does not own its declaration.
      const isRelativeForward =
        request?.startsWith('.') === true && entry.importName.kind === 'Name' && entry.importName.name === exportedName;
      if (!isRelativeForward) ownedNames.push(exportedName);
    }
  }

  return {
    ownedNames: [...new Set(ownedNames)],
    publishedNames: [...new Set(publishedNames)],
  };
}

function addBindingNames(pattern: BindingPattern, names: Set<string>): void {
  if (pattern.type === 'Identifier') {
    names.add(pattern.name);
  } else if (pattern.type === 'ArrayPattern') {
    for (const element of pattern.elements) {
      if (element !== null) addBindingNames(element.type === 'RestElement' ? element.argument : element, names);
    }
  } else if (pattern.type === 'ObjectPattern') {
    for (const property of pattern.properties) {
      addBindingNames(property.type === 'RestElement' ? property.argument : property.value, names);
    }
  } else if (pattern.type === 'AssignmentPattern') {
    addBindingNames(pattern.left, names);
  }
}

function addLocalValues(declaration: Declaration, names: Set<string>): void {
  if (declaration.type === 'FunctionDeclaration') {
    if (declaration.id !== null) names.add(declaration.id.name);
  } else if (declaration.type === 'VariableDeclaration' && declaration.kind !== 'var') {
    for (const variable of declaration.declarations) addBindingNames(variable.id, names);
  }
}
