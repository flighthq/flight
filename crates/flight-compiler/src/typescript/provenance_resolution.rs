use std::collections::{BTreeMap, BTreeSet, HashSet};

use syn::{GenericArgument, Item, ItemUse, PathArguments, Type, UseTree};

use crate::CompileError;
use crate::model::Program;

use super::{PROVENANCE_SEPARATOR, compile_error, is_public, resolve_type_path};

// One path introduced by a `use`: the prefix segments as written, and the imported item with the
// name it binds (`None` for a glob).
pub(super) struct UsePath {
    pub(super) item: Option<(String, String)>,
    pub(super) prefix: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub(super) struct ProvenanceIdentity {
    pub(super) declaration: String,
    pub(super) module: String,
}

impl ProvenanceIdentity {
    pub(super) fn description(&self) -> String {
        return format!("`{}` in `{}`", self.declaration, self.module);
    }

    pub(super) fn encoded(&self) -> String {
        return format!("{}{PROVENANCE_SEPARATOR}{}", self.module, self.declaration);
    }

    pub(super) fn encoded_description(encoded: &str) -> String {
        let Some((module, declaration)) = encoded.split_once(PROVENANCE_SEPARATOR) else {
            return format!("`{encoded}`");
        };
        return format!("`{declaration}` in `{module}`");
    }
}

pub(super) type ProvenanceDeclarations = BTreeMap<String, BTreeSet<ProvenanceIdentity>>;

pub(super) type ProvenanceBindings = BTreeMap<String, BTreeSet<ProvenanceIdentity>>;

pub(super) type ProvenanceModuleBindings = BTreeMap<String, ProvenanceBindings>;

#[derive(Clone, Debug)]
pub(crate) enum ProvenanceImportRule {
    Explicit {
        exported: String,
        imported: String,
        module: Option<String>,
    },
    Wildcard {
        module: String,
    },
}

pub(super) fn foreign_wildcard_modules(uses: &[&syn::ItemUse]) -> Vec<String> {
    fn collect(tree: &syn::UseTree, root: Option<&str>, modules: &mut BTreeSet<String>) {
        match tree {
            syn::UseTree::Path(path) => {
                let ident = path.ident.to_string();
                collect(&path.tree, Some(root.unwrap_or(&ident)), modules);
            }
            syn::UseTree::Group(group) => {
                for item in &group.items {
                    collect(item, root, modules);
                }
            }
            syn::UseTree::Glob(_) => {
                if let Some(package) = root.and_then(|root| root.strip_prefix("flight_")) {
                    modules.insert(format!("@flighthq/{}/contract", package.replace('_', "-")));
                }
            }
            syn::UseTree::Name(_) | syn::UseTree::Rename(_) => {}
        }
    }

    let mut modules = BTreeSet::new();
    for item_use in uses {
        collect(&item_use.tree, None, &mut modules);
    }
    return modules.into_iter().collect();
}

pub(super) fn source_module_name(source: &str) -> String {
    let normalized = source.replace('\\', "/");
    let relative = normalized
        .rsplit_once("/src/")
        .map(|(_, relative)| relative)
        .or_else(|| normalized.strip_prefix("src/"))
        .unwrap_or(&normalized);
    let without_extension = relative.strip_suffix(".rs").unwrap_or(relative);
    let without_mod = without_extension
        .strip_suffix("/mod")
        .unwrap_or(without_extension);
    return without_mod.replace('/', "::");
}

// Every path a `use` declaration introduces, in source order: the full prefix and either the imported
// item and the name it is bound to, or `None` for a glob.
pub(super) fn use_tree_paths<'a>(uses: impl Iterator<Item = &'a ItemUse>) -> Vec<UsePath> {
    fn collect(paths: &mut Vec<UsePath>, tree: &UseTree, prefix: &mut Vec<String>) {
        match tree {
            UseTree::Glob(_) => paths.push(UsePath {
                item: None,
                prefix: prefix.clone(),
            }),
            UseTree::Group(group) => {
                for tree in &group.items {
                    collect(paths, tree, prefix);
                }
            }
            UseTree::Name(name) if name.ident != "self" => {
                let name = name.ident.to_string();
                paths.push(UsePath {
                    item: Some((name.clone(), name)),
                    prefix: prefix.clone(),
                });
            }
            UseTree::Rename(rename) => paths.push(UsePath {
                item: Some((rename.ident.to_string(), rename.rename.to_string())),
                prefix: prefix.clone(),
            }),
            UseTree::Path(path) => {
                prefix.push(path.ident.to_string());
                collect(paths, &path.tree, prefix);
                prefix.pop();
            }
            UseTree::Name(_) => {}
        }
    }

    let mut paths = Vec::new();
    for rust_use in uses {
        collect(&mut paths, &rust_use.tree, &mut Vec::new());
    }
    return paths;
}

pub(crate) fn provenance_import_rules<'a>(
    uses: impl Iterator<Item = &'a ItemUse>,
    source_module: Option<&str>,
) -> Vec<ProvenanceImportRule> {
    fn module_name(prefix: &[String], source_module: Option<&str>) -> Option<String> {
        let first = prefix.first()?;
        if first == "crate" {
            if prefix.len() == 1 {
                return Some("crate".to_string());
            }
            let mut module = Vec::new();
            if let Some(source_module) = source_module
                && !source_module.contains(['/', '\\'])
                && let Some(crate_name) = source_module_name(source_module).split("::").next()
                && source_module.contains("::")
            {
                module.push(crate_name.to_string());
            }
            module.extend(prefix[1..].iter().cloned());
            return Some(module.join("::"));
        }
        if first == "self" {
            if prefix.len() == 1 {
                return None;
            }
            let mut module = source_module
                .map(source_module_name)
                .filter(|module| !module.is_empty())
                .map(|module| module.split("::").map(str::to_string).collect::<Vec<_>>())
                .unwrap_or_default();
            module.extend(prefix[1..].iter().cloned());
            return (!module.is_empty()).then(|| module.join("::"));
        }
        if first == "super" {
            let mut module = source_module
                .map(source_module_name)
                .filter(|module| !module.is_empty())
                .map(|module| module.split("::").map(str::to_string).collect::<Vec<_>>())
                .unwrap_or_default();
            let mut index = 0;
            while prefix.get(index).is_some_and(|segment| segment == "super") {
                module.pop();
                index += 1;
            }
            module.extend(prefix[index..].iter().cloned());
            return (!module.is_empty()).then(|| module.join("::"));
        }
        return Some(prefix.join("::"));
    }

    return use_tree_paths(uses)
        .into_iter()
        .filter_map(|path| match path.item {
            None => module_name(&path.prefix, source_module)
                .map(|module| ProvenanceImportRule::Wildcard { module }),
            Some((imported, exported)) => Some(ProvenanceImportRule::Explicit {
                exported,
                imported,
                module: module_name(&path.prefix, source_module),
            }),
        })
        .collect();
}

pub(super) fn contract_export_rules(
    source: &str,
) -> Result<Vec<ProvenanceImportRule>, CompileError> {
    let file = syn::parse_file(source)
        .map_err(|error| compile_error(format!("failed to parse Rust contract source: {error}")))?;
    return Ok(provenance_import_rules(
        file.items.iter().filter_map(|item| {
            let Item::Use(rust_use) = item else {
                return None;
            };
            is_public(&rust_use.vis).then_some(rust_use)
        }),
        None,
    ));
}

pub(super) fn identities_in_module(
    declarations: &ProvenanceDeclarations,
    module: &str,
    declaration: Option<&str>,
) -> BTreeSet<ProvenanceIdentity> {
    return declarations
        .iter()
        .filter(|(name, _)| declaration.is_none_or(|declaration| declaration == name.as_str()))
        .flat_map(|(_, identities)| identities)
        .filter(|identity| source_module_name(&identity.module) == module)
        .cloned()
        .collect();
}

pub(super) fn resolved_production_type_identities(
    rust_type: &Type,
    type_path_context: &HashSet<String>,
    declarations: &ProvenanceDeclarations,
    local_bindings: &BTreeMap<String, BTreeSet<ProvenanceIdentity>>,
    crate_root: &BTreeMap<String, BTreeSet<ProvenanceIdentity>>,
    module_bindings: &ProvenanceModuleBindings,
) -> BTreeSet<ProvenanceIdentity> {
    let rust_type = match rust_type {
        Type::Group(group) => {
            return resolved_production_type_identities(
                &group.elem,
                type_path_context,
                declarations,
                local_bindings,
                crate_root,
                module_bindings,
            );
        }
        Type::Paren(paren) => {
            return resolved_production_type_identities(
                &paren.elem,
                type_path_context,
                declarations,
                local_bindings,
                crate_root,
                module_bindings,
            );
        }
        Type::Reference(reference) => {
            return resolved_production_type_identities(
                &reference.elem,
                type_path_context,
                declarations,
                local_bindings,
                crate_root,
                module_bindings,
            );
        }
        Type::Path(path) if path.qself.is_none() => path,
        _ => return BTreeSet::new(),
    };
    let entity_ref =
        resolve_type_path(&rust_type.path, type_path_context).is_some_and(|resolved| {
            matches!(
                resolved
                    .iter()
                    .map(String::as_str)
                    .collect::<Vec<_>>()
                    .as_slice(),
                ["flight_entity", "Ref"] | ["flight_entity", "ir", "Ref"]
            )
        });
    if entity_ref {
        let Some(segment) = rust_type.path.segments.last() else {
            return BTreeSet::new();
        };
        let PathArguments::AngleBracketed(arguments) = &segment.arguments else {
            return BTreeSet::new();
        };
        let [GenericArgument::Type(inner)] = arguments.args.iter().collect::<Vec<_>>()[..] else {
            return BTreeSet::new();
        };
        return resolved_production_type_identities(
            inner,
            type_path_context,
            declarations,
            local_bindings,
            crate_root,
            module_bindings,
        );
    }
    let segments = rust_type
        .path
        .segments
        .iter()
        .map(|segment| segment.ident.to_string())
        .collect::<Vec<_>>();
    let Some((declaration, prefix)) = segments.split_last() else {
        return BTreeSet::new();
    };
    if prefix.is_empty() || prefix == ["self"] {
        return local_bindings.get(declaration).cloned().unwrap_or_default();
    }
    if prefix == ["crate"] {
        return crate_root.get(declaration).cloned().unwrap_or_default();
    }
    if let Some(first) = prefix.first()
        && first.starts_with("flight_")
    {
        return BTreeSet::new();
    }
    let module = prefix
        .iter()
        .filter(|segment| !matches!(segment.as_str(), "crate" | "self" | "super"))
        .cloned()
        .collect::<Vec<_>>()
        .join("::");
    if module.is_empty() {
        return BTreeSet::new();
    }
    if let Some(bindings) = module_bindings.get(&module) {
        return bindings.get(declaration).cloned().unwrap_or_default();
    }
    return identities_in_module(declarations, &module, Some(declaration));
}

pub(super) fn resolve_import_rules(
    declarations: &ProvenanceDeclarations,
    rules: &[ProvenanceImportRule],
    seed: BTreeMap<String, BTreeSet<ProvenanceIdentity>>,
    crate_root: &BTreeMap<String, BTreeSet<ProvenanceIdentity>>,
    module_bindings: &ProvenanceModuleBindings,
) -> BTreeMap<String, BTreeSet<ProvenanceIdentity>> {
    let mut bindings = seed;
    for rule in rules {
        match rule {
            ProvenanceImportRule::Wildcard { module } => {
                let exports = if module == "crate" {
                    crate_root.clone()
                } else if let Some(bindings) = module_bindings.get(module) {
                    bindings.clone()
                } else {
                    identities_in_module(declarations, module, None)
                        .into_iter()
                        .fold(ProvenanceBindings::new(), |mut bindings, identity| {
                            bindings
                                .entry(identity.declaration.clone())
                                .or_default()
                                .insert(identity);
                            bindings
                        })
                };
                for (exported, identities) in exports {
                    bindings.entry(exported).or_default().extend(identities);
                }
            }
            ProvenanceImportRule::Explicit {
                exported,
                imported,
                module: Some(module),
            } => {
                let identities = if module == "crate" {
                    crate_root.get(imported).cloned().unwrap_or_default()
                } else if let Some(bindings) = module_bindings.get(module) {
                    bindings.get(imported).cloned().unwrap_or_default()
                } else {
                    identities_in_module(declarations, module, Some(imported))
                };
                bindings
                    .entry(exported.clone())
                    .or_default()
                    .extend(identities);
            }
            ProvenanceImportRule::Explicit { module: None, .. } => {}
        }
    }
    loop {
        let mut changed = false;
        for rule in rules {
            let ProvenanceImportRule::Explicit {
                exported,
                imported,
                module: None,
            } = rule
            else {
                continue;
            };
            let resolved = bindings.get(imported).cloned().unwrap_or_default();
            let target = bindings.entry(exported.clone()).or_default();
            let previous = target.len();
            target.extend(resolved);
            changed |= target.len() != previous;
        }
        if !changed {
            break;
        }
    }
    return bindings;
}

pub(super) fn public_module_bindings(
    declarations: &ProvenanceDeclarations,
    programs: &[(&str, &Program)],
) -> ProvenanceModuleBindings {
    let mut direct = ProvenanceModuleBindings::new();
    for identity in declarations.values().flatten() {
        direct
            .entry(source_module_name(&identity.module))
            .or_default()
            .entry(identity.declaration.clone())
            .or_default()
            .insert(identity.clone());
    }
    let rules = programs
        .iter()
        .map(|(module, program)| {
            (
                source_module_name(module),
                provenance_import_rules(
                    program
                        .uses
                        .iter()
                        .filter(|rust_use| is_public(&rust_use.vis)),
                    Some(module),
                ),
            )
        })
        .collect::<BTreeMap<_, _>>();
    let mut bindings = direct.clone();
    loop {
        let mut next = direct.clone();
        for (module, rules) in &rules {
            let seed = next.remove(module).unwrap_or_default();
            let resolved =
                resolve_import_rules(declarations, rules, seed, &BTreeMap::new(), &bindings);
            next.insert(module.clone(), resolved);
        }
        if next == bindings {
            return bindings;
        }
        bindings = next;
    }
}

pub(super) fn provenance_bindings(
    declarations: &ProvenanceDeclarations,
    module_bindings: &ProvenanceModuleBindings,
    contract_rules: Option<&[ProvenanceImportRule]>,
    kind: &str,
) -> Result<BTreeMap<String, ProvenanceIdentity>, CompileError> {
    let candidates = contract_rules.map_or_else(
        || declarations.clone(),
        |rules| {
            let mut bindings = BTreeMap::new();
            loop {
                let next = resolve_import_rules(
                    declarations,
                    rules,
                    bindings.clone(),
                    &bindings,
                    module_bindings,
                );
                if next == bindings {
                    break;
                }
                bindings = next;
            }
            bindings
        },
    );
    let mut bindings = BTreeMap::new();
    for (exported, matches) in candidates {
        if matches.is_empty() {
            continue;
        }
        if matches.len() != 1 {
            let owners = matches
                .iter()
                .map(ProvenanceIdentity::description)
                .collect::<Vec<_>>()
                .join(", ");
            let guidance = if contract_rules.is_some() {
                "make the contract re-export select exactly one source owner"
            } else {
                "provide contract.rs with --contract-source so its public re-export selects the source owner"
            };
            return Err(compile_error(format!(
                "ambiguous public {kind} export `{exported}` resolves to {owners}; {guidance}"
            )));
        }
        if let Some(binding) = matches.into_iter().next() {
            bindings.insert(exported, binding);
        }
    }
    return Ok(bindings);
}
