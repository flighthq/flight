import { Node, SymbolFlags } from 'ts-morph';
import type { SourceFile, Symbol as MorphSymbol } from 'ts-morph';

export interface EntryPointInventory {
  names: ReadonlySet<string>;
  valueNames: ReadonlySet<string>;
}

// Resolves a barrel without erasing two distinctions that getExportedDeclarations() erases: the
// declaration's exported name (including aliases), and whether this particular re-export path is a
// runtime value or `export type`. Consumers and capability gates need the entry-point provenance, not
// merely the flags of the declaration at the far end of an alias.
export function collectEntryPointInventory(
  sourceFile: SourceFile,
  cache: Map<string, EntryPointInventory> = new Map(),
): EntryPointInventory {
  const cached = cache.get(sourceFile.getFilePath());
  if (cached !== undefined) return cached;

  const names = new Set(sourceFile.getExportSymbols().map((symbol) => symbol.getName()));
  const valueNames = new Set<string>();
  const inventory = { names, valueNames };
  cache.set(sourceFile.getFilePath(), inventory);

  for (const symbol of sourceFile.getExportSymbols()) {
    if (
      symbol
        .getDeclarations()
        .some(
          (declaration) =>
            declaration.getSourceFile() === sourceFile &&
            !Node.isExportSpecifier(declaration) &&
            !Node.isNamespaceExport(declaration) &&
            hasRuntimeValue(symbol),
        )
    ) {
      valueNames.add(symbol.getName());
    }
  }

  for (const declaration of sourceFile.getExportDeclarations()) {
    const target = declaration.getModuleSpecifierSourceFile();
    const targetInventory = target === undefined ? undefined : collectEntryPointInventory(target, cache);
    const named = declaration.getNamedExports();

    if (named.length === 0) {
      if (
        declaration.compilerNode.exportClause === undefined &&
        targetInventory !== undefined &&
        !declaration.isTypeOnly()
      ) {
        for (const name of targetInventory.valueNames) valueNames.add(name);
      }
      continue;
    }

    for (const specifier of named) {
      const exportedName = specifier.getAliasNode()?.getText() ?? specifier.getName();
      if (declaration.isTypeOnly() || specifier.isTypeOnly()) continue;
      if (targetInventory !== undefined) {
        if (targetInventory.valueNames.has(specifier.getName())) valueNames.add(exportedName);
      } else if (hasRuntimeValue(specifier.getLocalTargetSymbol())) {
        valueNames.add(exportedName);
      }
    }
  }

  return inventory;
}

function hasRuntimeValue(symbol: MorphSymbol | undefined): boolean {
  let current = symbol;
  const seen = new Set<MorphSymbol>();
  while (current !== undefined && !seen.has(current)) {
    seen.add(current);
    if ((current.getFlags() & SymbolFlags.Value) !== 0) return true;
    current = current.getAliasedSymbol();
  }
  return false;
}
