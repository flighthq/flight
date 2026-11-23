// The TypeScript-root census: every value a package's root lane (`index.ts`, plus the SDK
// barrel's named promotions from that package's contract) exports, classified against the C
// surface this build generated. Each value ends in exactly one class:
//
// - `generated` — the value's Rust function has a generated C wrapper;
// - `by_design` — a committed reason proves the value has no meaning across a C ABI;
// - `actionable` — anything else, keyed by a cause the generator derives mechanically.
//
// The census is driven from TypeScript, not from Rust, so a value the Rust scan never sees (an
// async function, a function behind a glob or module the scanner misses, a constant, a value with
// no Rust implementation) is still counted. Causes are derived, never declared: the committed
// residual must equal the derived one row for row, so a cause can neither be invented nor weakened.
//
// Reasons a by-design row may give are a closed set of classes, each meaning the value is bound to
// a runtime C cannot enter. "Hard to lower", "takes a callback", "async", "optional fields", "not
// re-exported at the crate root" and "no Rust implementation" are causes, never reasons.

use std::collections::{BTreeMap, BTreeSet};
use std::fmt::Write as _;
use std::fs;
use std::path::Path;

use super::public_perimeter;

/// The classes a by-design reason may name, and what each one asserts.
pub const BY_DESIGN_CLASSES: &[(&str, &str)] = &[
    (
        "browser_runtime",
        "operates on browser objects (DOM elements, Canvas 2D contexts, web host APIs) that no native C program can hold",
    ),
    (
        "javascript_runtime",
        "binds a JavaScript host runtime (Electron, Tauri, Capacitor, a WebAssembly loader) that a native C program does not run inside",
    ),
    (
        "build_tooling",
        "a Node build-time or capture tool that runs no code in a shipped application",
    ),
];

/// Words that mark a reason as a lowering cause dressed as a design decision.
const BANNED_REASON_TERMS: &[&str] = &[
    "async",
    "callback",
    "closure",
    "future",
    "generic",
    "hard",
    "lower",
    "not generated",
    "optional",
    "re-export",
    "reexport",
    "rust implementation",
    "unsupported",
];

#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum Status {
    Generated,
    ByDesign(String),
    Actionable(String),
}

#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct Row {
    pub package: String,
    pub export: String,
    pub status: Status,
}

/// What the generator decided for one scanned Rust function, keyed `crate-dir|function`: the C
/// wrappers it emitted, or why it emitted none.
#[derive(Default)]
pub struct Decisions {
    pub generated: BTreeMap<String, BTreeSet<String>>,
    pub skipped: BTreeMap<String, String>,
}

#[derive(Clone)]
struct RustFunction {
    name: String,
    is_async: bool,
    is_generic: bool,
}

#[derive(Default)]
struct RustItems {
    functions: BTreeMap<String, RustFunction>,
    constants: BTreeSet<String>,
    types: BTreeSet<String>,
}

/// A source file of a crate's library, as opposed to a test module beside it: `lib.rs`, or a file
/// `lib.rs` declares as a module without `#[cfg(test)]`. File names do not decide it, since
/// library modules such as `hit_tests.rs` and `register_text_hit_test.rs` read like tests.
pub fn is_library_source(src_dir: &Path, file_name: &str) -> bool {
    if file_name == "lib.rs" {
        return true;
    }
    let Some(stem) = file_name.strip_suffix(".rs") else {
        return false;
    };
    return library_modules(src_dir).contains(stem);
}

/// `is_library_source` for a file path under a crate's `src`.
pub fn is_library_path(path: &Path) -> bool {
    let (Some(src_dir), Some(name)) = (path.parent(), path.file_name()) else {
        return false;
    };
    let name = name.to_string_lossy();
    if !src_dir.join("lib.rs").exists() {
        // A nested module directory: its parent module declares it, and test modules there follow
        // the `_test.rs` convention.
        return name.ends_with(".rs") && !name.ends_with("_test.rs");
    }
    return is_library_source(src_dir, &name);
}

fn library_modules(src_dir: &Path) -> BTreeSet<String> {
    static CACHE: std::sync::OnceLock<
        std::sync::Mutex<BTreeMap<std::path::PathBuf, BTreeSet<String>>>,
    > = std::sync::OnceLock::new();
    let cache = CACHE.get_or_init(Default::default);
    if let Some(modules) = cache.lock().unwrap().get(src_dir) {
        return modules.clone();
    }
    let mut modules = BTreeSet::new();
    if let Ok(content) = fs::read_to_string(src_dir.join("lib.rs"))
        && let Ok(file) = syn::parse_file(&content)
    {
        for item in &file.items {
            if let syn::Item::Mod(module) = item
                && module.content.is_none()
                && !module.attrs.iter().any(is_cfg_test)
            {
                modules.insert(module.ident.to_string());
            }
        }
    }
    cache
        .lock()
        .unwrap()
        .insert(src_dir.to_path_buf(), modules.clone());
    return modules;
}

fn collect_rust_items(src_dir: &Path) -> RustItems {
    let mut items = RustItems::default();
    let Ok(entries) = fs::read_dir(src_dir) else {
        return items;
    };
    let mut paths: Vec<_> = entries
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| is_library_source(src_dir, name))
        })
        .collect();
    paths.sort();
    for path in paths {
        let Ok(content) = fs::read_to_string(&path) else {
            continue;
        };
        let Ok(file) = syn::parse_file(&content) else {
            continue;
        };
        visit_items(&file.items, &mut items);
    }
    return items;
}

fn visit_items(file_items: &[syn::Item], items: &mut RustItems) {
    for item in file_items {
        let is_public = |vis: &syn::Visibility| matches!(vis, syn::Visibility::Public(_));
        match item {
            syn::Item::Fn(function) if is_public(&function.vis) => {
                let name = function.sig.ident.to_string();
                items
                    .functions
                    .entry(public_perimeter::get_export_key(&name))
                    .or_insert(RustFunction {
                        name,
                        is_async: function.sig.asyncness.is_some(),
                        is_generic: function
                            .sig
                            .generics
                            .params
                            .iter()
                            .any(|param| matches!(param, syn::GenericParam::Type(_))),
                    });
            }
            syn::Item::Const(constant) if is_public(&constant.vis) => {
                items.constants.insert(public_perimeter::get_export_key(
                    &constant.ident.to_string(),
                ));
            }
            syn::Item::Static(value) if is_public(&value.vis) => {
                items
                    .constants
                    .insert(public_perimeter::get_export_key(&value.ident.to_string()));
            }
            syn::Item::Struct(value) if is_public(&value.vis) => {
                items
                    .types
                    .insert(public_perimeter::get_export_key(&value.ident.to_string()));
            }
            syn::Item::Enum(value) if is_public(&value.vis) => {
                items
                    .types
                    .insert(public_perimeter::get_export_key(&value.ident.to_string()));
            }
            syn::Item::Mod(module) if !module.attrs.iter().any(is_cfg_test) => {
                if let Some((_, nested)) = &module.content {
                    visit_items(nested, items);
                }
            }
            _ => {}
        }
    }
}

fn is_cfg_test(attribute: &syn::Attribute) -> bool {
    return attribute.path().is_ident("cfg")
        && quote::ToTokens::to_token_stream(attribute)
            .to_string()
            .contains("test");
}

/// The root-lane values of every package, as `(package, export)`.
pub fn collect_root_values(packages_dir: &Path) -> BTreeSet<(String, String)> {
    let mut values = BTreeSet::new();
    let mut packages: Vec<_> = fs::read_dir(packages_dir)
        .unwrap()
        .filter_map(Result::ok)
        .map(|entry| entry.file_name().to_string_lossy().to_string())
        .collect();
    packages.sort();
    let sdk_index = packages_dir.join("sdk/src/index.ts");
    for package in packages {
        let index = packages_dir.join(&package).join("src/index.ts");
        if !index.exists() || package == "sdk" {
            continue;
        }
        println!("cargo::rerun-if-changed={}", index.display());
        let (names, _) = public_perimeter::collect_ts_module_exports(&index);
        let source = format!("@flighthq/{package}/contract");
        let promoted = public_perimeter::collect_ts_external_reexports(&sdk_index, &source);
        for name in names.into_iter().chain(promoted) {
            values.insert((package.clone(), name));
        }
    }
    return values;
}

/// Classifies every root-lane value.
pub fn classify(
    packages_dir: &Path,
    crates_dir: &Path,
    scanned_crates: &[&str],
    decisions: &Decisions,
    unreachable_wrappers: &BTreeSet<String>,
    by_design: &BTreeMap<(String, String), String>,
) -> Vec<Row> {
    let mut crate_items: BTreeMap<String, RustItems> = BTreeMap::new();
    let mut rows = Vec::new();
    for (package, export) in collect_root_values(packages_dir) {
        let crate_dir = format!("flight-{package}");
        let key = public_perimeter::get_export_key(&export);
        let items = crate_items
            .entry(crate_dir.clone())
            .or_insert_with(|| collect_rust_items(&crates_dir.join(&crate_dir).join("src")));
        let function = items.functions.get(&key).cloned();
        // A value counts as generated only when some wrapper of it is reachable from C: every
        // carrier it consumes has a producer. A wrapper nothing can call is not a counterpart.
        let wrappers = function.as_ref().and_then(|function| {
            decisions
                .generated
                .get(&format!("{crate_dir}|{}", function.name))
        });
        if let Some(wrappers) = wrappers
            && wrappers
                .iter()
                .any(|wrapper| !unreachable_wrappers.contains(wrapper))
        {
            rows.push(Row {
                package,
                export,
                status: Status::Generated,
            });
            continue;
        }
        let reason = by_design
            .get(&(package.clone(), export.clone()))
            .or_else(|| by_design.get(&(package.clone(), "*".to_string())));
        if let Some(reason) = reason {
            rows.push(Row {
                package,
                export,
                status: Status::ByDesign(reason.clone()),
            });
            continue;
        }
        let cause = if !crates_dir.join(&crate_dir).join("src").exists() {
            "no_rust_crate".to_string()
        } else if !scanned_crates.contains(&crate_dir.as_str()) {
            "unscanned_crate".to_string()
        } else if wrappers.is_some() {
            "unreachable_carrier".to_string()
        } else if let Some(function) = &function {
            match decisions
                .skipped
                .get(&format!("{crate_dir}|{}", function.name))
            {
                Some(reason) => format!("skip:{}", skip_category(reason)),
                None if function.is_async => "async_function".to_string(),
                None if function.is_generic => "generic_function".to_string(),
                None => "undiscovered_function".to_string(),
            }
        } else if items.constants.contains(&key) {
            "constant_value".to_string()
        } else if items.types.contains(&key) {
            "type_value".to_string()
        } else {
            "no_rust_implementation".to_string()
        };
        rows.push(Row {
            package,
            export,
            status: Status::Actionable(cause),
        });
    }
    return rows;
}

fn skip_category(reason: &str) -> &str {
    return reason.split('(').next().unwrap_or(reason).trim();
}

/// Parses the committed by-design table: `package<TAB>export<TAB>class: prose`, where `export` may
/// be `*` for every value of a package. Comment lines start with `#`.
pub fn parse_by_design(text: &str) -> Result<BTreeMap<(String, String), String>, String> {
    let mut out = BTreeMap::new();
    for (index, line) in text.lines().enumerate() {
        if line.trim().is_empty() || line.starts_with('#') {
            continue;
        }
        let fields: Vec<&str> = line.split('\t').collect();
        let [package, export, reason] = fields[..] else {
            return Err(format!(
                "by-design line {} must have three fields",
                index + 1
            ));
        };
        validate_reason(reason).map_err(|error| format!("{package}\t{export}: {error}"))?;
        if out
            .insert(
                (package.to_string(), export.to_string()),
                reason.to_string(),
            )
            .is_some()
        {
            return Err(format!("duplicate by-design row {package}\t{export}"));
        }
    }
    return Ok(out);
}

/// A by-design reason names one closed class and adds prose that uses no lowering vocabulary.
pub fn validate_reason(reason: &str) -> Result<(), String> {
    let Some((class, prose)) = reason.split_once(": ") else {
        return Err(format!("reason `{reason}` must read `<class>: <prose>`"));
    };
    if !BY_DESIGN_CLASSES.iter().any(|(name, _)| *name == class) {
        return Err(format!("reason class `{class}` is not a by-design class"));
    }
    if prose.trim().is_empty() {
        return Err("reason prose must not be empty".to_string());
    }
    let lower = reason.to_ascii_lowercase();
    if let Some(term) = BANNED_REASON_TERMS
        .iter()
        .find(|term| lower.contains(*term))
    {
        return Err(format!(
            "reason `{reason}` uses `{term}`, a lowering cause, not proof of no C ABI meaning"
        ));
    }
    return Ok(());
}

/// Every by-design row must still cover a value the build does not generate.
pub fn check_by_design_coverage(
    rows: &[Row],
    by_design: &BTreeMap<(String, String), String>,
) -> Result<(), String> {
    let covered: BTreeSet<(String, String)> = rows
        .iter()
        .filter(|row| matches!(row.status, Status::ByDesign(_)))
        .flat_map(|row| {
            [
                (row.package.clone(), row.export.clone()),
                (row.package.clone(), "*".to_string()),
            ]
        })
        .collect();
    let stale: Vec<_> = by_design
        .keys()
        .filter(|key| !covered.contains(*key))
        .map(|(package, export)| format!("{package}\t{export}"))
        .collect();
    if stale.is_empty() {
        return Ok(());
    }
    return Err(format!(
        "by-design rows cover no ungenerated root value: {stale:?}"
    ));
}

/// The full census, one row per value: `package<TAB>export<TAB>class<TAB>detail`.
pub fn render_census(rows: &[Row]) -> String {
    let mut out = String::from("format|ffi-root-census|1\n");
    let generated = rows
        .iter()
        .filter(|row| row.status == Status::Generated)
        .count();
    let by_design = rows
        .iter()
        .filter(|row| matches!(row.status, Status::ByDesign(_)))
        .count();
    let actionable = rows.len() - generated - by_design;
    writeln!(
        out,
        "summary|{} values|{generated} generated|{by_design} by_design|{actionable} actionable",
        rows.len()
    )
    .unwrap();
    for row in rows {
        let (class, detail) = match &row.status {
            Status::Generated => ("generated", ""),
            Status::ByDesign(reason) => ("by_design", reason.as_str()),
            Status::Actionable(cause) => ("actionable", cause.as_str()),
        };
        writeln!(out, "{}\t{}\t{class}\t{detail}", row.package, row.export).unwrap();
    }
    return out;
}

/// The actionable residual, the exact text the committed fixture must equal:
/// `package<TAB>export<TAB>cause`, sorted, one row per value.
pub fn render_residual(rows: &[Row]) -> String {
    let mut out = String::from("# package\texport\tcause\n");
    for row in rows {
        if let Status::Actionable(cause) = &row.status {
            writeln!(out, "{}\t{}\t{cause}", row.package, row.export).unwrap();
        }
    }
    return out;
}

pub fn count_by_status(rows: &[Row]) -> (usize, usize, usize) {
    let generated = rows
        .iter()
        .filter(|row| row.status == Status::Generated)
        .count();
    let by_design = rows
        .iter()
        .filter(|row| matches!(row.status, Status::ByDesign(_)))
        .count();
    return (generated, by_design, rows.len() - generated - by_design);
}

/// The function names a crate module exposes: its own `pub fn` items plus everything its `pub use`
/// items re-export, named, renamed, braced or globbed, following `crate::`, `self::` and
/// `super::` paths into sibling module files. `module` is the module's file under `src_dir`.
pub fn collect_module_function_exports(src_dir: &Path, module: &Path) -> BTreeSet<String> {
    return collect_module_exports(src_dir, module).functions;
}

/// The value and type names a crate module exposes, split by Rust naming case.
#[derive(Default)]
pub struct ModuleExports {
    pub functions: BTreeSet<String>,
    pub types: BTreeSet<String>,
}

pub fn collect_module_exports(src_dir: &Path, module: &Path) -> ModuleExports {
    let mut out = ModuleExports::default();
    let mut visiting = BTreeSet::new();
    collect_module_items(src_dir, module, &mut visiting, &mut out);
    return out;
}

fn insert_export_name(name: String, out: &mut ModuleExports) {
    if name == "self" {
        return;
    }
    if name.chars().next().is_some_and(|c| c.is_lowercase()) {
        out.functions.insert(name);
    } else {
        out.types.insert(name);
    }
}

fn module_file(src_dir: &Path, name: &str) -> Option<std::path::PathBuf> {
    let flat = src_dir.join(format!("{name}.rs"));
    if flat.exists() {
        return Some(flat);
    }
    let nested = src_dir.join(name).join("mod.rs");
    return nested.exists().then_some(nested);
}

fn collect_module_items(
    src_dir: &Path,
    module: &Path,
    visiting: &mut BTreeSet<std::path::PathBuf>,
    out: &mut ModuleExports,
) {
    if !visiting.insert(module.to_path_buf()) {
        return;
    }
    let Ok(content) = fs::read_to_string(module) else {
        return;
    };
    let Ok(file) = syn::parse_file(&content) else {
        return;
    };
    let is_public = |vis: &syn::Visibility| matches!(vis, syn::Visibility::Public(_));
    for item in &file.items {
        match item {
            syn::Item::Fn(function) if is_public(&function.vis) => {
                out.functions.insert(function.sig.ident.to_string());
            }
            syn::Item::Struct(value) if is_public(&value.vis) => {
                out.types.insert(value.ident.to_string());
            }
            syn::Item::Enum(value) if is_public(&value.vis) => {
                out.types.insert(value.ident.to_string());
            }
            syn::Item::Type(value) if is_public(&value.vis) => {
                out.types.insert(value.ident.to_string());
            }
            syn::Item::Trait(value) if is_public(&value.vis) => {
                out.types.insert(value.ident.to_string());
            }
            syn::Item::Use(item) if is_public(&item.vis) => {
                let mut path = Vec::new();
                collect_use_tree(src_dir, &item.tree, &mut path, visiting, out);
            }
            _ => {}
        }
    }
    visiting.remove(module);
}

fn collect_use_tree(
    src_dir: &Path,
    tree: &syn::UseTree,
    path: &mut Vec<String>,
    visiting: &mut BTreeSet<std::path::PathBuf>,
    out: &mut ModuleExports,
) {
    match tree {
        syn::UseTree::Path(segment) => {
            path.push(segment.ident.to_string());
            collect_use_tree(src_dir, &segment.tree, path, visiting, out);
            path.pop();
        }
        syn::UseTree::Name(name) => insert_export_name(name.ident.to_string(), out),
        syn::UseTree::Rename(rename) => insert_export_name(rename.rename.to_string(), out),
        syn::UseTree::Glob(_) => {
            // `crate::m::*`, `self::m::*`, `super::m::*` and a bare `m::*` all name the sibling
            // module file `m` in this crate's flat source layout; other crates are not followed.
            let local: Vec<&String> = path
                .iter()
                .filter(|segment| !matches!(segment.as_str(), "crate" | "self" | "super"))
                .collect();
            if let [name] = local[..]
                && let Some(file) = module_file(src_dir, name)
            {
                collect_module_items(src_dir, &file, visiting, out);
            }
        }
        syn::UseTree::Group(group) => {
            for tree in &group.items {
                collect_use_tree(src_dir, tree, path, visiting, out);
            }
        }
    }
}

/// One public field of a concrete node kind's `data` record, which C reaches through the node
/// handle: `Sprite.data.texture`, with the accessor names that serve it.
pub struct NodeDataField {
    pub package: String,
    pub node_type: String,
    pub field: String,
    pub getter: String,
    pub setter: String,
}

/// Every public field of every scanned node kind's `pub data` record.
pub fn collect_node_data_fields(
    crates_dir: &Path,
    scanned_crates: &[&str],
    node_types: &BTreeSet<String>,
) -> Vec<NodeDataField> {
    // (crate, node type, data type) and every public named field of every public struct.
    let mut owners = Vec::new();
    let mut struct_fields: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for crate_dir in scanned_crates {
        let src_dir = crates_dir.join(crate_dir).join("src");
        let Ok(entries) = fs::read_dir(&src_dir) else {
            continue;
        };
        let mut paths: Vec<_> = entries
            .filter_map(Result::ok)
            .map(|entry| entry.path())
            .filter(|path| is_library_path(path))
            .collect();
        paths.sort();
        for path in paths {
            let Ok(file) = syn::parse_file(&fs::read_to_string(&path).unwrap_or_default()) else {
                continue;
            };
            for item in &file.items {
                let syn::Item::Struct(value) = item else {
                    continue;
                };
                if !matches!(value.vis, syn::Visibility::Public(_)) {
                    continue;
                }
                let name = value.ident.to_string();
                let public_fields: Vec<(String, &syn::Type)> = value
                    .fields
                    .iter()
                    .filter(|field| matches!(field.vis, syn::Visibility::Public(_)))
                    .filter_map(|field| Some((field.ident.as_ref()?.to_string(), &field.ty)))
                    .collect();
                if node_types.contains(&name)
                    && let Some((_, syn::Type::Path(data))) =
                        public_fields.iter().find(|(field, _)| field == "data")
                    && let Some(segment) = data.path.segments.last()
                {
                    owners.push((
                        crate_dir.to_string(),
                        name.clone(),
                        segment.ident.to_string(),
                    ));
                }
                struct_fields
                    .entry(name)
                    .or_default()
                    .extend(public_fields.into_iter().map(|(field, _)| field));
            }
        }
    }
    let mut out = Vec::new();
    for (crate_dir, node_type, data_type) in owners {
        let snake = to_snake_case(&node_type);
        for field in struct_fields.get(&data_type).cloned().unwrap_or_default() {
            out.push(NodeDataField {
                package: crate_dir.trim_start_matches("flight-").to_string(),
                getter: format!("flight_get_{snake}_{field}"),
                setter: format!("flight_set_{snake}_{field}"),
                node_type: node_type.clone(),
                field,
            });
        }
    }
    out.sort_by(|a, b| {
        (&a.package, &a.node_type, &a.field).cmp(&(&b.package, &b.node_type, &b.field))
    });
    return out;
}

/// Census rows for node data fields: generated when both accessors exist and are reachable.
pub fn classify_node_data_fields(
    fields: &[NodeDataField],
    surface: &BTreeSet<String>,
    unreachable_wrappers: &BTreeSet<String>,
) -> Vec<Row> {
    return fields
        .iter()
        .map(|field| {
            let served = [&field.getter, &field.setter]
                .iter()
                .all(|name| surface.contains(*name) && !unreachable_wrappers.contains(*name));
            Row {
                package: field.package.clone(),
                export: format!("{}.data.{}", field.node_type, field.field),
                status: if served {
                    Status::Generated
                } else {
                    Status::Actionable("node_data_field_accessor".to_string())
                },
            }
        })
        .collect();
}

fn to_snake_case(name: &str) -> String {
    let chars: Vec<char> = name.chars().collect();
    let mut out = String::new();
    for (index, &c) in chars.iter().enumerate() {
        if c.is_uppercase() && index > 0 && !chars[index - 1].is_uppercase() {
            out.push('_');
        }
        out.push(c.to_ascii_lowercase());
    }
    return out;
}
