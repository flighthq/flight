import { existsSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { BindingPattern, Declaration, ModuleExportName, VariableDeclarator } from 'oxc-parser';

import { getParsedOxcSource } from './oxc-source';

export interface FastEntryPointInventory {
  functions: ReadonlyMap<string, readonly FastFunctionInfo[]>;
  names: ReadonlySet<string>;
  valueNames: ReadonlySet<string>;
}

export interface FastFunctionInfo {
  parameters: string;
  returnType: string | null;
  sourcePath: string;
}

interface ImportBinding {
  imported: string | null;
  namespace: boolean;
  source: string | null;
  typeOnly: boolean;
}

interface ExportRule {
  exported: string | null;
  imported: string | null;
  local: string | null;
  namespace: boolean;
  source: string | null;
  star: boolean;
  typeOnly: boolean;
}

interface ModuleDescriptor {
  imports: Map<string, ImportBinding>;
  inventory: { functions: Map<string, readonly FastFunctionInfo[]>; names: Set<string>; valueNames: Set<string> };
  localFunctions: Map<string, FastFunctionInfo[]>;
  localValues: Set<string>;
  path: string;
  rules: ExportRule[];
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const descriptors = new Map<string, ModuleDescriptor>();
const resolutionCache = new Map<string, string | null>();

export function collectFastEntryPointInventory(filePath: string): FastEntryPointInventory {
  addDescriptor(resolve(filePath));
  resolveInventories();
  return descriptors.get(resolve(filePath))!.inventory;
}

function addBindingNames(pattern: BindingPattern, names: Set<string>): void {
  if (pattern.type === 'Identifier') {
    names.add(pattern.name);
  } else if (pattern.type === 'ArrayPattern') {
    for (const element of pattern.elements) {
      if (element === null) continue;
      addBindingNames(element.type === 'RestElement' ? element.argument : element, names);
    }
  } else if (pattern.type === 'ObjectPattern') {
    for (const property of pattern.properties) {
      if (property.type === 'RestElement') addBindingNames(property.argument, names);
      else addBindingNames(property.value, names);
    }
  } else if (pattern.type === 'AssignmentPattern') {
    addBindingNames(pattern.left, names);
  }
}

function addDeclarationValues(declaration: Declaration, names: Set<string>): void {
  if (declaration.type === 'VariableDeclaration') {
    for (const variable of declaration.declarations) addBindingNames(variable.id, names);
    return;
  }

  if (declaration.type === 'FunctionDeclaration' || declaration.type === 'ClassDeclaration') {
    if (declaration.id !== null) names.add(declaration.id.name);
  } else if (declaration.type === 'TSEnumDeclaration') {
    names.add(declaration.id.name);
  } else if (declaration.type === 'TSModuleDeclaration' && declaration.id.type === 'Identifier') {
    names.add(declaration.id.name);
  }
}

function addDescriptor(filePath: string): ModuleDescriptor {
  const cached = descriptors.get(filePath);
  if (cached !== undefined) return cached;

  const parsed = getParsedOxcSource(filePath);
  const imports = new Map<string, ImportBinding>();
  const localFunctions = new Map<string, FastFunctionInfo[]>();
  const localValues = new Set<string>();
  const rules: ExportRule[] = [];
  const descriptor: ModuleDescriptor = {
    imports,
    inventory: { functions: new Map(), names: new Set(), valueNames: new Set() },
    localFunctions,
    localValues,
    path: filePath,
    rules,
  };
  descriptors.set(filePath, descriptor);

  for (const statement of parsed.program.body) {
    if (statement.type === 'ExportNamedDeclaration' && statement.declaration !== null) {
      addDeclarationValues(statement.declaration, localValues);
      addDeclarationFunctions(statement.declaration, filePath, parsed.text, localFunctions);
    } else if (isValueDeclaration(statement)) {
      addDeclarationValues(statement, localValues);
      addDeclarationFunctions(statement, filePath, parsed.text, localFunctions);
    } else if (statement.type === 'ExportDefaultDeclaration') {
      const declaration = statement.declaration;
      if (
        (declaration.type === 'FunctionDeclaration' || declaration.type === 'ClassDeclaration') &&
        declaration.id !== null
      ) {
        localValues.add(declaration.id.name);
        if (declaration.type === 'FunctionDeclaration')
          addFunctionInfo(
            localFunctions,
            declaration.id.name,
            filePath,
            parsed.text,
            declaration.params,
            declaration.returnType,
          );
      } else if (declaration.type === 'FunctionDeclaration') {
        addFunctionInfo(localFunctions, 'default', filePath, parsed.text, declaration.params, declaration.returnType);
      }
    }
  }

  for (const statement of parsed.module.staticImports) {
    const source = resolveModule(filePath, statement.moduleRequest.value);
    if (source !== null) addDescriptor(source);
    for (const entry of statement.entries) {
      imports.set(entry.localName.value, {
        imported: entry.importName.kind === 'Name' ? entry.importName.name : null,
        namespace: entry.importName.kind === 'NamespaceObject',
        source,
        typeOnly: entry.isType,
      });
    }
  }

  for (const statement of parsed.module.staticExports) {
    for (const entry of statement.entries) {
      const source = entry.moduleRequest === null ? null : resolveModule(filePath, entry.moduleRequest.value);
      if (source !== null) addDescriptor(source);
      rules.push({
        exported: exportName(entry.exportName),
        imported: entry.importName.kind === 'Name' ? entry.importName.name : null,
        local: entry.localName.kind === 'Name' ? entry.localName.name : null,
        namespace: entry.importName.kind === 'All',
        source,
        star: entry.importName.kind === 'AllButDefault',
        typeOnly: entry.isType,
      });
    }
  }

  return descriptor;
}

function addSet(target: Set<string>, source: ReadonlySet<string>, excludeDefault = false): boolean {
  let changed = false;
  for (const name of source) {
    if (excludeDefault && name === 'default') continue;
    if (target.has(name)) continue;
    target.add(name);
    changed = true;
  }
  return changed;
}

function addDeclarationFunctions(
  declaration: Declaration,
  filePath: string,
  sourceText: string,
  functions: Map<string, FastFunctionInfo[]>,
): void {
  if (declaration.type === 'FunctionDeclaration' || declaration.type === 'TSDeclareFunction') {
    if (declaration.id !== null)
      addFunctionInfo(functions, declaration.id.name, filePath, sourceText, declaration.params, declaration.returnType);
  } else if (declaration.type === 'VariableDeclaration') {
    for (const variable of declaration.declarations) addVariableFunction(variable, filePath, sourceText, functions);
  }
}

function addFunctionInfo(
  functions: Map<string, FastFunctionInfo[]>,
  name: string,
  sourcePath: string,
  sourceText: string,
  parameters: readonly { start: number; end: number }[],
  annotation: { typeAnnotation: { start: number; end: number } } | null | undefined,
): void {
  const info = {
    parameters: parameters.map((parameter) => sourceText.slice(parameter.start, parameter.end)).join(', '),
    returnType:
      annotation === null || annotation === undefined
        ? null
        : sourceText.slice(annotation.typeAnnotation.start, annotation.typeAnnotation.end),
    sourcePath,
  };
  const existing = functions.get(name);
  if (existing === undefined) functions.set(name, [info]);
  else if (
    !existing.some(
      (item) =>
        item.parameters === info.parameters &&
        item.returnType === info.returnType &&
        item.sourcePath === info.sourcePath,
    )
  )
    existing.push(info);
}

function addVariableFunction(
  variable: VariableDeclarator,
  filePath: string,
  sourceText: string,
  functions: Map<string, FastFunctionInfo[]>,
): void {
  if (
    variable.id.type !== 'Identifier' ||
    variable.init === null ||
    (variable.init.type !== 'ArrowFunctionExpression' && variable.init.type !== 'FunctionExpression')
  )
    return;
  addFunctionInfo(functions, variable.id.name, filePath, sourceText, variable.init.params, variable.init.returnType);
}

function exportName(name: ModuleExportName | { kind: string; name: string | null }): string | null {
  if ('kind' in name) return name.kind === 'Default' ? 'default' : name.name;
  return name.type === 'Identifier' ? name.name : name.value;
}

function isLocalValue(descriptor: ModuleDescriptor, local: string): boolean {
  if (descriptor.localValues.has(local)) return true;
  const binding = descriptor.imports.get(local);
  if (binding === undefined || binding.typeOnly) return false;
  if (binding.namespace) return true;
  if (binding.source === null || binding.imported === null) return binding.source === null;
  return descriptors.get(binding.source)?.inventory.valueNames.has(binding.imported) ?? false;
}

function getLocalFunctions(descriptor: ModuleDescriptor, local: string): readonly FastFunctionInfo[] | undefined {
  const direct = descriptor.localFunctions.get(local);
  if (direct !== undefined) return direct;
  const binding = descriptor.imports.get(local);
  if (
    binding === undefined ||
    binding.typeOnly ||
    binding.namespace ||
    binding.imported === null ||
    binding.source === null
  )
    return undefined;
  return descriptors.get(binding.source)?.inventory.functions.get(binding.imported);
}

function isValueDeclaration(statement: Declaration | { type: string }): statement is Declaration {
  return (
    statement.type === 'VariableDeclaration' ||
    statement.type === 'FunctionDeclaration' ||
    statement.type === 'ClassDeclaration' ||
    statement.type === 'TSEnumDeclaration' ||
    statement.type === 'TSModuleDeclaration'
  );
}

function resolveInventories(): void {
  let changed = true;
  while (changed) {
    changed = false;
    for (const descriptor of descriptors.values()) {
      for (const rule of descriptor.rules) {
        const target = rule.source === null ? null : descriptors.get(rule.source);
        if (rule.star) {
          if (target === undefined || target === null) continue;
          changed = addSet(descriptor.inventory.names, target.inventory.names, true) || changed;
          if (!rule.typeOnly)
            changed = addSet(descriptor.inventory.valueNames, target.inventory.valueNames, true) || changed;
          if (!rule.typeOnly) {
            for (const [name, functions] of target.inventory.functions) {
              if (name === 'default' || descriptor.inventory.functions.has(name)) continue;
              descriptor.inventory.functions.set(name, functions);
              changed = true;
            }
          }
          continue;
        }

        if (rule.exported === null) continue;
        if (!descriptor.inventory.names.has(rule.exported)) {
          descriptor.inventory.names.add(rule.exported);
          changed = true;
        }
        if (!rule.typeOnly && !descriptor.inventory.valueNames.has(rule.exported)) {
          const isValue = rule.namespace
            ? true
            : target !== null && target !== undefined && rule.imported !== null
              ? target.inventory.valueNames.has(rule.imported)
              : rule.local !== null
                ? isLocalValue(descriptor, rule.local)
                : true;
          if (isValue) {
            descriptor.inventory.valueNames.add(rule.exported);
            changed = true;
          }
        }
        if (rule.typeOnly || descriptor.inventory.functions.has(rule.exported)) continue;
        const functions =
          target !== null && target !== undefined && rule.imported !== null
            ? target.inventory.functions.get(rule.imported)
            : rule.local !== null
              ? getLocalFunctions(descriptor, rule.local)
              : descriptor.localFunctions.get(rule.exported);
        if (functions !== undefined) {
          descriptor.inventory.functions.set(rule.exported, functions);
          changed = true;
        }
      }
    }
  }
}

function resolveModule(fromPath: string, specifier: string): string | null {
  const key = `${fromPath}\0${specifier}`;
  const cached = resolutionCache.get(key);
  if (cached !== undefined) return cached;

  let base: string | null = null;
  if (specifier.startsWith('.')) {
    base = resolve(dirname(fromPath), specifier);
  } else if (specifier.startsWith('@flighthq/')) {
    const parts = specifier.split('/');
    const packageName = parts[1];
    if (packageName !== undefined && (parts.length === 2 || (parts.length === 3 && parts[2] === 'contract'))) {
      base = join(root, 'packages', packageName, 'src', parts[2] === 'contract' ? 'contract' : 'index');
    }
  }

  const resolved = base === null ? null : resolveSourcePath(base);
  resolutionCache.set(key, resolved);
  return resolved;
}

function resolveSourcePath(base: string): string | null {
  const extension = extname(base);
  const withoutRuntimeExtension =
    extension === '.js' || extension === '.mjs' || extension === '.cjs' ? base.slice(0, -extension.length) : base;
  const candidates =
    extension === '.ts' || extension === '.tsx'
      ? [base]
      : [
          `${withoutRuntimeExtension}.ts`,
          `${withoutRuntimeExtension}.tsx`,
          join(withoutRuntimeExtension, 'index.ts'),
          join(withoutRuntimeExtension, 'index.tsx'),
        ];
  return candidates.find(existsSync) ?? null;
}
