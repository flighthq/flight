//! TS conformance: compares each crate's pub free functions with the exported functions of
//! the matching TS package (`flight-<name>` ↔ `<ts-root>/<name>/src`), by name and by
//! parameter names/order.

use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

use syn::Item;

use crate::allow::{FileAllows, MarkerKind};
use crate::model::{Violation, crate_files, display_path};
use crate::structure::is_pub;

pub struct TsFunction {
    pub name: String,
    pub params: Option<Vec<String>>,
    /// Type text per parameter (aligned with `params`) and the return type text.
    pub param_types: Vec<String>,
    pub return_type: String,
    pub file: String,
    /// Exported from the package's curated `index.ts` (public API) rather than only from
    /// `contract.ts` (the full contract).
    pub public: bool,
}

struct RsFunction {
    name: String,
    params: Vec<String>,
    /// The TS array kind each parameter's Rust type maps to, if it is a numeric array.
    param_kinds: Vec<Option<String>>,
    return_kind: Option<String>,
    file: PathBuf,
    line: usize,
}

struct TsFunctionRelocation {
    from_crate: &'static str,
    name: &'static str,
    source_file: &'static str,
    source_package: &'static str,
    to_crate: &'static str,
}

const TS_FUNCTION_RELOCATIONS: &[TsFunctionRelocation] = &[TsFunctionRelocation {
    from_crate: "flight-meshgeometry",
    name: "updateMeshMorph",
    source_file: "updateMeshMorph.ts",
    source_package: "mesh",
    to_crate: "flight-scene3d",
}];

/// Resolves the TS source directory, or the exact file for an approved type-owner relocation.
/// `ts_root` may be the packages directory or, for a single crate, the package's `src` directory.
pub fn ts_src_for(ts_root: &Path, crate_name: &str, single: bool) -> Option<PathBuf> {
    let pkg = match crate_name {
        "flight-meshgeometry" => "mesh",
        _ => crate_name.strip_prefix("flight-").unwrap_or(crate_name),
    };
    let candidate = ts_root.join(pkg).join("src");
    if candidate.is_dir() {
        return Some(candidate);
    }
    if crate_name == "flight-textformat" {
        let relocated = ts_root.join("textlayout/src/textFormatRange.ts");
        if relocated.is_file() {
            return Some(relocated);
        }
    }
    if single && dir_has_ts(ts_root) {
        return Some(ts_root.to_owned());
    }
    return None;
}

fn dir_has_ts(dir: &Path) -> bool {
    return fs::read_dir(dir)
        .map(|rd| {
            rd.flatten()
                .any(|e| e.file_name().to_string_lossy().ends_with(".ts"))
        })
        .unwrap_or(false);
}

pub fn conform_crate(crate_name: &str, ts_src: &Path) -> Vec<Violation> {
    let crate_dir = Path::new("crates").join(crate_name);
    let ts_fns = collect_ts_for_crate(crate_name, ts_src);
    let mut rs_fns: Vec<RsFunction> = Vec::new();
    let mut allows_by_file: HashMap<PathBuf, FileAllows> = HashMap::new();
    let mut skips: HashSet<String> = HashSet::new();

    for path in crate_files(crate_name, "src") {
        let Ok(source) = fs::read_to_string(&path) else {
            continue;
        };
        let allows = FileAllows::new(&source);
        for m in &allows.markers {
            if m.kind == MarkerKind::ConformSkip {
                for n in &m.names {
                    skips.insert(normalize(n));
                }
            }
        }
        if let Ok(file) = syn::parse_file(&source) {
            for item in &file.items {
                if let Item::Fn(f) = item
                    && is_pub(&f.vis)
                {
                    let params = f
                        .sig
                        .inputs
                        .iter()
                        .filter_map(|a| match a {
                            syn::FnArg::Typed(t) => match &*t.pat {
                                syn::Pat::Ident(pi) => Some(
                                    pi.ident
                                        .to_string()
                                        .trim_start_matches("r#")
                                        .trim_start_matches('_')
                                        .to_string(),
                                ),
                                _ => Some(String::from("_")),
                            },
                            syn::FnArg::Receiver(_) => None,
                        })
                        .collect();
                    let param_kinds = f
                        .sig
                        .inputs
                        .iter()
                        .filter_map(|a| match a {
                            syn::FnArg::Typed(t) => Some(rust_array_kind(&t.ty)),
                            syn::FnArg::Receiver(_) => None,
                        })
                        .collect();
                    let return_kind = match &f.sig.output {
                        syn::ReturnType::Type(_, t) => rust_array_kind(t),
                        syn::ReturnType::Default => None,
                    };
                    rs_fns.push(RsFunction {
                        name: f.sig.ident.to_string().trim_start_matches("r#").to_string(),
                        params,
                        param_kinds,
                        return_kind,
                        file: path.clone(),
                        line: f.sig.fn_token.span.start().line,
                    });
                }
            }
        }
        allows_by_file.insert(path, allows);
    }

    let mut out = Vec::new();
    let rs_by_key: HashMap<String, &RsFunction> =
        rs_fns.iter().map(|r| (normalize(&r.name), r)).collect();
    let mut ts_by_key: HashMap<String, &TsFunction> = HashMap::new();
    for t in &ts_fns {
        ts_by_key.entry(normalize(&t.name)).or_insert(t);
    }

    let mut ts_sorted: Vec<&TsFunction> = ts_by_key.values().copied().collect();
    ts_sorted.sort_by(|a, b| a.name.cmp(&b.name));
    for t in ts_sorted {
        let key = normalize(&t.name);
        if skips.contains(&key) {
            continue;
        }
        match rs_by_key.get(&key) {
            None => out.push(Violation::new(
                &crate_dir,
                0,
                "conform-missing",
                format!(
                    "missing `{}` (TS `{}` in {}, {})",
                    camel_to_snake(&t.name),
                    t.name,
                    t.file,
                    if t.public { "public" } else { "contract-only" }
                ),
            )),
            Some(r) => {
                let Some(ts_params) = &t.params else {
                    continue;
                };
                check_arrays(&mut out, r, t, ts_params, &allows_by_file[&r.file]);
                let rs_norm: Vec<String> = r.params.iter().map(|p| normalize(p)).collect();
                let ts_norm: Vec<String> = ts_params.iter().map(|p| normalize(p)).collect();
                if rs_norm != ts_norm {
                    let allows = &allows_by_file[&r.file];
                    if !allows.is_allowed("conform-params", &[r.line]) {
                        out.push(Violation::new(
                            &r.file,
                            r.line,
                            "conform-params",
                            format!(
                                "`{}` params ({}) differ from TS ({})",
                                r.name,
                                r.params.join(", "),
                                ts_params
                                    .iter()
                                    .map(|p| camel_to_snake(p))
                                    .collect::<Vec<_>>()
                                    .join(", ")
                            ),
                        ));
                    }
                }
            }
        }
    }

    for r in &rs_fns {
        if ts_by_key.contains_key(&normalize(&r.name)) {
            continue;
        }
        let allows = &allows_by_file[&r.file];
        if !allows.is_allowed("conform-extra", &[r.line]) {
            out.push(Violation::new(
                &r.file,
                r.line,
                "conform-extra",
                format!("extra `{}` (not exported by TS)", r.name),
            ));
        }
    }

    return out;
}

/// Name identity across casing styles: `createMatrix4From2D` ↔ `create_matrix4_from_2d`.
pub fn normalize(name: &str) -> String {
    return name
        .chars()
        .filter(|c| *c != '_')
        .flat_map(|c| c.to_lowercase())
        .collect();
}

pub fn camel_to_snake(s: &str) -> String {
    let chars: Vec<char> = s.chars().collect();
    let mut result = String::new();
    for i in 0..chars.len() {
        let c = chars[i];
        if c.is_uppercase() {
            if i > 0 {
                let prev = chars[i - 1];
                let next_is_lower = chars.get(i + 1).map(|c| c.is_lowercase()).unwrap_or(false);
                // A capital after a digit starts a word only when a lowercase run follows
                // (`Vector3Length` → `vector3_length`), not for unit suffixes (`Ray3D` → `ray3d`).
                if prev.is_lowercase()
                    || (prev.is_ascii_digit() && next_is_lower)
                    || (prev.is_uppercase() && next_is_lower)
                {
                    result.push('_');
                }
            }
            result.push(c.to_lowercase().next().unwrap());
        } else {
            result.push(c);
        }
    }
    return result;
}

// ---------------------------------------------------------------------------
// TS extraction
// ---------------------------------------------------------------------------

fn collect_ts(ts_src: &Path) -> Vec<TsFunction> {
    let mut files: Vec<PathBuf> = walkdir::WalkDir::new(ts_src)
        .into_iter()
        .filter_map(|e| e.ok())
        .map(|e| e.path().to_owned())
        .filter(|p| {
            let name = p
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();
            name.ends_with(".ts")
                && !name.ends_with(".test.ts")
                && !name.ends_with(".spec.ts")
                && !name.ends_with(".d.ts")
                && !p.components().any(|c| c.as_os_str() == "__tests__")
        })
        .collect();
    files.sort();

    let src_dir = if ts_src.is_file() {
        ts_src.parent().unwrap_or(ts_src)
    } else {
        ts_src
    };
    let base = src_dir.parent().and_then(|p| p.parent()).unwrap_or(src_dir);
    let index = fs::read_to_string(src_dir.join("index.ts")).unwrap_or_default();
    let (public_names, public_files) = parse_index(&index);
    let mut out = Vec::new();
    for f in files {
        let Ok(source) = fs::read_to_string(&f) else {
            continue;
        };
        let rel = display_path(f.strip_prefix(base).unwrap_or(&f));
        let stem = f
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default();
        let whole_file_public = public_files.contains(&stem);
        for mut t in extract_ts_functions(&source, &rel) {
            t.public = whole_file_public || public_names.contains(&t.name);
            out.push(t);
        }
    }
    return out;
}

fn collect_ts_for_crate(crate_name: &str, ts_src: &Path) -> Vec<TsFunction> {
    return collect_ts_for_crate_with_relocations(crate_name, ts_src, |relocation| {
        crate_has_public_function(relocation.to_crate, relocation.name)
    });
}

fn collect_ts_for_crate_with_relocations(
    crate_name: &str,
    ts_src: &Path,
    is_active: impl Fn(&TsFunctionRelocation) -> bool,
) -> Vec<TsFunction> {
    let mut out = collect_ts(ts_src);
    for relocation in TS_FUNCTION_RELOCATIONS {
        if !is_active(relocation) {
            continue;
        }
        if crate_name == relocation.from_crate {
            out.retain(|function| normalize(&function.name) != normalize(relocation.name));
        }
        if crate_name != relocation.to_crate
            || out
                .iter()
                .any(|function| normalize(&function.name) == normalize(relocation.name))
        {
            continue;
        }
        let Some(packages) = ts_src
            .is_dir()
            .then_some(ts_src)
            .or_else(|| ts_src.parent())
            .and_then(Path::parent)
            .and_then(Path::parent)
        else {
            continue;
        };
        let source = packages
            .join(relocation.source_package)
            .join("src")
            .join(relocation.source_file);
        out.extend(
            collect_ts(&source)
                .into_iter()
                .filter(|function| normalize(&function.name) == normalize(relocation.name)),
        );
    }
    return out;
}

fn crate_has_public_function(crate_name: &str, name: &str) -> bool {
    for path in crate_files(crate_name, "src") {
        let Ok(source) = fs::read_to_string(path) else {
            continue;
        };
        let Ok(file) = syn::parse_file(&source) else {
            continue;
        };
        if file.items.iter().any(|item| {
            let Item::Fn(function) = item else {
                return false;
            };
            return is_pub(&function.vis)
                && normalize(&function.sig.ident.to_string()) == normalize(name);
        }) {
            return true;
        }
    }
    return false;
}

/// Names re-exported by `export { a, b } from` and file stems re-exported by `export * from`.
fn parse_index(index: &str) -> (HashSet<String>, HashSet<String>) {
    let mut names = HashSet::new();
    let mut files = HashSet::new();
    let mut rest = index;
    while let Some(pos) = rest.find("export") {
        rest = &rest[pos + "export".len()..];
        let trimmed = rest.trim_start();
        if let Some(after) = trimmed.strip_prefix('*') {
            if let Some(q) = after.find(['\'', '"']) {
                let tail = &after[q + 1..];
                if let Some(end) = tail.find(['\'', '"']) {
                    let spec = &tail[..end];
                    let stem = spec.rsplit('/').next().unwrap_or(spec);
                    let stem = stem
                        .strip_suffix(".ts")
                        .or_else(|| stem.strip_suffix(".js"))
                        .unwrap_or(stem);
                    files.insert(stem.to_string());
                }
            }
        } else if let Some(after) = trimmed.strip_prefix('{')
            && let Some(end) = after.find('}')
        {
            for part in after[..end].split(',') {
                let part = part.trim().trim_start_matches("type ").trim();
                let name = part.split(" as ").last().unwrap_or(part).trim();
                if !name.is_empty() {
                    names.insert(name.to_string());
                }
            }
        }
    }
    return (names, files);
}

/// Exported functions with their parameter names. Overloaded names get `params: None`.
pub fn extract_ts_functions(source: &str, file: &str) -> Vec<TsFunction> {
    let mut out: Vec<TsFunction> = Vec::new();
    let mut seen: HashMap<String, usize> = HashMap::new();
    let mut offset = 0;
    for line in source.split_inclusive('\n') {
        let trimmed = line.trim_start();
        let decl_start = offset + (line.len() - trimmed.len());
        let found = if let Some(after) = trimmed
            .strip_prefix("export function ")
            .or_else(|| trimmed.strip_prefix("export async function "))
        {
            let name = ident_prefix(after);
            Some((name, parse_signature(&source[decl_start..])))
        } else if let Some(after) = trimmed.strip_prefix("export const ") {
            let name = ident_prefix(after);
            arrow_signature(&source[decl_start + "export const ".len() + name.len()..])
                .map(|sig| (name, Some(sig)))
        } else {
            None
        };
        if let Some((name, signature)) = found {
            let params = signature.as_ref().map(|s| s.names.clone());
            if !name.is_empty() && !name.starts_with('_') {
                if let Some(&idx) = seen.get(&name) {
                    out[idx].params = None;
                } else {
                    seen.insert(name.clone(), out.len());
                    let (param_types, return_type) = match &signature {
                        Some(sig) => (sig.types.clone(), sig.return_type.clone()),
                        None => (Vec::new(), String::new()),
                    };
                    out.push(TsFunction {
                        name,
                        params,
                        param_types,
                        return_type,
                        file: file.to_string(),
                        public: false,
                    });
                }
            }
        }
        offset += line.len();
    }
    return out;
}

fn ident_prefix(s: &str) -> String {
    return s
        .chars()
        .take_while(|c| c.is_alphanumeric() || *c == '_' || *c == '$')
        .collect();
}

/// For `export const NAME<rest>`, returns the parameters when the initializer is a function:
/// `= (a, b) =>`, `: T = (a): R =>`, `= async (a) =>`, `= a =>`, or `= function (a)`.
fn arrow_signature(rest: &str) -> Option<Signature> {
    let blanked = blank_ts_comments(rest);
    let rest = blanked.as_str();
    let eq = rest.find('=')?;
    if rest[..eq].contains(['\n', ';']) {
        return None;
    }
    let init = rest[eq + 1..].trim_start();
    let init = init
        .strip_prefix("async ")
        .map(|s| s.trim_start())
        .unwrap_or(init);
    if init.starts_with("function") {
        return parse_signature(init);
    }
    if init.starts_with('(') {
        let chars: Vec<char> = init.chars().collect();
        let mut depth = 0;
        let mut close = None;
        for (i, c) in chars.iter().enumerate() {
            match c {
                '(' => depth += 1,
                ')' => {
                    depth -= 1;
                    if depth == 0 {
                        close = Some(i);
                        break;
                    }
                }
                _ => {}
            }
        }
        let close = close?;
        let after: String = chars[close + 1..].iter().collect();
        let arrow = after.find("=>")?;
        let between = after[..arrow].trim();
        if !(between.is_empty() || (between.starts_with(':') && !between.contains([';', '{', '('])))
        {
            return None;
        }
        return parse_signature(init);
    }
    let name = ident_prefix(init);
    if !name.is_empty() && init[name.len()..].trim_start().starts_with("=>") {
        return Some(Signature {
            names: vec![name],
            types: vec![String::new()],
            return_type: String::new(),
        });
    }
    return None;
}

/// Replaces every TS `//` line comment and `/* */` block comment with spaces (newlines kept), so the
/// signature scanners never see comment text: commas, parentheses, braces or angles inside a comment
/// must not perturb nesting or parameter order. Quoted and template literal contents are copied
/// verbatim (comment-like text in a legal default or literal type is not a comment). The scan is
/// left to right, so text after the declaration cannot change how the declaration itself is read.
fn blank_ts_comments(source: &str) -> String {
    let chars: Vec<char> = source.chars().collect();
    let mut out = String::with_capacity(source.len());
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        let next = chars.get(i + 1).copied();
        if c == '/' && next == Some('/') {
            while i < chars.len() && chars[i] != '\n' {
                out.push(' ');
                i += 1;
            }
            continue;
        }
        if c == '/' && next == Some('*') {
            out.push_str("  ");
            i += 2;
            while i < chars.len() && !(chars[i] == '*' && chars.get(i + 1) == Some(&'/')) {
                out.push(if chars[i] == '\n' { '\n' } else { ' ' });
                i += 1;
            }
            if i < chars.len() {
                out.push_str("  ");
                i += 2;
            }
            continue;
        }
        if c == '\'' || c == '"' || c == '`' {
            out.push(c);
            i += 1;
            while i < chars.len() && chars[i] != c {
                if chars[i] == '\\' && i + 1 < chars.len() {
                    out.push(chars[i]);
                    i += 1;
                }
                out.push(chars[i]);
                i += 1;
            }
            if i < chars.len() {
                out.push(chars[i]);
                i += 1;
            }
            continue;
        }
        out.push(c);
        i += 1;
    }
    return out;
}

#[derive(Clone)]
pub struct Signature {
    pub names: Vec<String>,
    pub types: Vec<String>,
    pub return_type: String,
}

#[cfg(test)]
fn parse_params(decl: &str) -> Option<Vec<String>> {
    return parse_signature(decl).map(|s| s.names);
}

/// Parses `name<...>(a: T, b?: U = x, ...rest: V): R` from the start of an export declaration.
fn parse_signature(decl: &str) -> Option<Signature> {
    let chars: Vec<char> = blank_ts_comments(decl).chars().collect();
    let mut i = 0;
    // Skip to the parameter list's `(`, stepping over generic `<...>`.
    let mut angle = 0i32;
    while i < chars.len() {
        match chars[i] {
            '<' => angle += 1,
            '>' if i > 0 && chars[i - 1] != '=' => angle -= 1,
            '(' if angle == 0 => break,
            '{' | ';' if angle == 0 => return None,
            _ => {}
        }
        i += 1;
    }
    if i >= chars.len() {
        return None;
    }
    i += 1;
    let mut depth = 0i32;
    let mut current = String::new();
    let mut params = Vec::new();
    while i < chars.len() {
        let c = chars[i];
        match c {
            '(' | '[' | '{' => depth += 1,
            '<' => depth += 1,
            '>' if chars[i - 1] != '=' => depth -= 1,
            ')' | ']' | '}' if depth > 0 => depth -= 1,
            ')' => {
                if !current.trim().is_empty() {
                    params.push(current.clone());
                }
                i += 1;
                break;
            }
            ',' if depth == 0 => {
                params.push(current.clone());
                current.clear();
                i += 1;
                continue;
            }
            _ => {}
        }
        current.push(c);
        i += 1;
    }
    let mut names = Vec::new();
    let mut types = Vec::new();
    for p in &params {
        let p = p.trim().trim_start_matches("...");
        let name: String = if p.starts_with('{') || p.starts_with('[') {
            String::from("_")
        } else {
            p.chars()
                .take_while(|c| c.is_alphanumeric() || *c == '_' || *c == '$')
                .collect()
        };
        if name.is_empty() || name == "this" {
            continue;
        }
        names.push(name);
        types.push(param_type_text(p));
    }

    // Return type: `: R` up to the body `{`, an arrow `=>`, or `;`, at depth 0.
    let rest: String = chars[i.min(chars.len())..].iter().collect();
    let rest = rest.trim_start();
    let mut return_type = String::new();
    if let Some(r) = rest.strip_prefix(':') {
        let mut depth = 0i32;
        let rc: Vec<char> = r.chars().collect();
        for k in 0..rc.len() {
            let c = rc[k];
            match c {
                '(' | '[' | '<' => depth += 1,
                ')' | ']' => depth -= 1,
                '>' if k > 0 && rc[k - 1] != '=' => depth -= 1,
                '{' | ';' if depth == 0 => break,
                '=' if depth == 0 && rc.get(k + 1) == Some(&'>') => break,
                _ => {}
            }
            return_type.push(c);
        }
    }
    return Some(Signature {
        names,
        types,
        return_type: return_type.trim().to_string(),
    });
}

/// The type text of one parameter: after the first top-level `:`, before a top-level `=`.
fn param_type_text(p: &str) -> String {
    let chars: Vec<char> = p.chars().collect();
    let mut depth = 0i32;
    let mut start = None;
    let mut end = chars.len();
    for k in 0..chars.len() {
        let c = chars[k];
        match c {
            '(' | '[' | '{' | '<' => depth += 1,
            ')' | ']' | '}' => depth -= 1,
            '>' if k > 0 && chars[k - 1] != '=' => depth -= 1,
            ':' if depth == 0 && start.is_none() => start = Some(k + 1),
            '=' if depth == 0 && start.is_some() && chars.get(k + 1) != Some(&'>') => {
                end = k;
                break;
            }
            _ => {}
        }
    }
    return match start {
        Some(s) if s <= end => chars[s..end].iter().collect::<String>().trim().to_string(),
        _ => String::new(),
    };
}

// ---------------------------------------------------------------------------
// Array kinds (conform-array)
// ---------------------------------------------------------------------------

const TYPED_ARRAYS: &[(&str, &str)] = &[
    ("f32", "Float32Array"),
    ("f64", "Float64Array"),
    ("u8", "Uint8Array"),
    ("u16", "Uint16Array"),
    ("u32", "Uint32Array"),
    ("i8", "Int8Array"),
    ("i16", "Int16Array"),
    ("i32", "Int32Array"),
];
const ARRAY_LIKE: &str = "ArrayLike<number>";
const NUMBER_ARRAY: &str = "number[]";

fn typed_alias(name: &str) -> Option<&'static str> {
    return TYPED_ARRAYS
        .iter()
        .find(|(_, t)| *t == name)
        .map(|(_, t)| *t);
}

fn numeric_elem(ty: &syn::Type) -> Option<&'static str> {
    if let syn::Type::Path(p) = ty
        && let Some(id) = p.path.get_ident()
    {
        let name = id.to_string();
        return TYPED_ARRAYS
            .iter()
            .find(|(r, _)| *r == name)
            .map(|(_, t)| *t);
    }
    return None;
}

fn single_generic(seg: &syn::PathSegment) -> Option<&syn::Type> {
    if let syn::PathArguments::AngleBracketed(a) = &seg.arguments
        && let Some(syn::GenericArgument::Type(t)) = a.args.first()
    {
        return Some(t);
    }
    return None;
}

/// The TS array type a Rust type maps to under the vocabulary, for numeric arrays only.
pub fn rust_array_kind(ty: &syn::Type) -> Option<String> {
    match ty {
        syn::Type::Reference(r) => {
            if let syn::Type::Slice(s) = &*r.elem {
                let typed = numeric_elem(&s.elem)?;
                return Some(if r.mutability.is_some() {
                    typed.to_string()
                } else {
                    ARRAY_LIKE.to_string()
                });
            }
            if let syn::Type::Path(p) = &*r.elem
                && let Some(seg) = p.path.segments.last()
            {
                // Specific containers map to specific TS types: &Vec<N> → number[],
                // &Box<[N]> → the typed array. Only a bare slice is the general ArrayLike.
                if seg.ident == "Vec" {
                    numeric_elem(single_generic(seg)?)?;
                    return Some(NUMBER_ARRAY.to_string());
                }
                // Typed-array aliases name the TS type exactly, for reads and writes.
                if let Some(name) = typed_alias(&seg.ident.to_string()) {
                    return Some(name.to_string());
                }
            }
            return None;
        }
        syn::Type::Array(a) => return numeric_elem(&a.elem).map(|t| t.to_string()),
        syn::Type::Path(p) => {
            let seg = p.path.segments.last()?;
            let inner = single_generic(seg)?;
            if seg.ident == "Vec" {
                numeric_elem(inner)?;
                return Some(NUMBER_ARRAY.to_string());
            }
            if seg.ident == "Box"
                && let syn::Type::Slice(s) = inner
            {
                return numeric_elem(&s.elem).map(|t| t.to_string());
            }
            if seg.ident == "Box"
                && let syn::Type::Path(ip) = inner
                && let Some(id) = ip.path.get_ident()
                && let Some(name) = typed_alias(&id.to_string())
            {
                return Some(name.to_string());
            }
            if seg.ident == "Option" {
                return rust_array_kind(inner);
            }
            return None;
        }
        _ => return None,
    }
}

/// The array kind named by a TS type, ignoring `readonly`, `Readonly<>`, `| null`, `| undefined`.
pub fn ts_array_kind(text: &str) -> Option<String> {
    let mut parts: Vec<String> = Vec::new();
    for part in split_union(text) {
        let mut p = part.trim().to_string();
        if p == "null" || p == "undefined" {
            continue;
        }
        if let Some(inner) = p
            .strip_prefix("Readonly<")
            .and_then(|x| x.strip_suffix('>'))
        {
            p = inner.trim().to_string();
        }
        p = p.trim_start_matches("readonly ").trim().to_string();
        let kind = if p == "number[]" || p == "Array<number>" || p == "ReadonlyArray<number>" {
            NUMBER_ARRAY.to_string()
        } else if p == ARRAY_LIKE {
            ARRAY_LIKE.to_string()
        } else if TYPED_ARRAYS.iter().any(|(_, t)| *t == p) || p == "Uint8ClampedArray" {
            p
        } else {
            return None;
        };
        parts.push(kind);
    }
    if parts.is_empty() {
        return None;
    }
    parts.sort();
    parts.dedup();
    return Some(parts.join(" | "));
}

fn split_union(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut depth = 0i32;
    let mut cur = String::new();
    for c in text.chars() {
        match c {
            '<' | '(' | '[' | '{' => depth += 1,
            '>' | ')' | ']' | '}' => depth -= 1,
            '|' if depth == 0 => {
                out.push(cur.clone());
                cur.clear();
                continue;
            }
            _ => {}
        }
        cur.push(c);
    }
    out.push(cur);
    return out;
}

fn check_arrays(
    out: &mut Vec<Violation>,
    r: &RsFunction,
    t: &TsFunction,
    ts_params: &[String],
    allows: &FileAllows,
) {
    if allows.is_allowed("conform-array", &[r.line]) {
        return;
    }
    let mut pairs: Vec<(String, Option<String>, Option<String>)> = Vec::new();
    if ts_params.len() == r.params.len() {
        for k in 0..r.params.len() {
            let ts_kind = t.param_types.get(k).and_then(|x| ts_array_kind(x));
            pairs.push((
                format!("param `{}`", r.params[k]),
                r.param_kinds[k].clone(),
                ts_kind,
            ));
        }
    }
    pairs.push((
        String::from("return"),
        r.return_kind.clone(),
        ts_array_kind(&t.return_type),
    ));
    for (what, rk, tk) in pairs {
        let (Some(rk), Some(tk)) = (rk, tk) else {
            continue;
        };
        // Specific over permissive (user, 2026-10-20): widening a specific TS input to
        // ArrayLike is a change to negotiate too, not an automatic consequence.
        if rk == tk {
            continue;
        }
        out.push(Violation::new(
            &r.file,
            r.line,
            "conform-array",
            format!(
                "`{}` {}: Rust maps to `{}`, TS has `{}` (negotiate, then mark `allow(conform-array) <reason>`)",
                r.name, what, rk, tk
            ),
        ));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn textformat_relocation_checks_only_its_source_file_and_keeps_export_lanes() {
        let root =
            std::env::temp_dir().join(format!("flight-textformat-mapping-{}", std::process::id()));
        let src = root.join("textlayout/src");
        std::fs::create_dir_all(&src).unwrap();
        let range = src.join("textFormatRange.ts");
        std::fs::write(&range, "export function createTextFormatRange(format: TextFormat, start: number, end: number): TextFormatRange {}\nexport function initializeTextFormatRange(out: TextFormatRange, format: TextFormat, start: number, end: number): void {}\n").unwrap();
        std::fs::write(src.join("index.ts"), "export { createTextFormatRange } from './textFormatRange.ts';\nexport * from './unrelated.ts';\n").unwrap();
        std::fs::write(
            src.join("unrelated.ts"),
            "export function unrelatedTextLayout(): void {}\n",
        )
        .unwrap();
        let selected = ts_src_for(&root, "flight-textformat", false).unwrap();
        assert_eq!(selected, range);
        let functions = collect_ts(&selected);
        assert_eq!(functions.len(), 2);
        assert!(
            functions
                .iter()
                .any(|f| f.name == "createTextFormatRange" && f.public)
        );
        assert!(
            functions
                .iter()
                .any(|f| f.name == "initializeTextFormatRange" && !f.public)
        );
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn renamed_meshgeometry_resolves_original_mesh_package() {
        let root = std::env::temp_dir().join(format!("flight-mesh-mapping-{}", std::process::id()));
        let mesh = root.join("mesh/src");
        std::fs::create_dir_all(&mesh).unwrap();
        assert_eq!(ts_src_for(&root, "flight-meshgeometry", false), Some(mesh));
        assert_eq!(ts_src_for(&root, "flight-unknown", false), None);
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn update_mesh_morph_relocation_changes_only_its_conform_owner() {
        let root = std::env::temp_dir().join(format!(
            "flight-update-mesh-morph-relocation-{}",
            std::process::id()
        ));
        let mesh = root.join("mesh/src");
        let scene3d = root.join("scene3d/src");
        std::fs::create_dir_all(&mesh).unwrap();
        std::fs::create_dir_all(&scene3d).unwrap();
        std::fs::write(
            mesh.join("updateMeshMorph.ts"),
            "export function updateMeshMorph(mesh: Readonly<Mesh>): void {}\n",
        )
        .unwrap();
        std::fs::write(
            mesh.join("keepMeshFunction.ts"),
            "export function keepMeshFunction(value: number): void {}\n",
        )
        .unwrap();
        std::fs::write(
            mesh.join("index.ts"),
            "export * from './updateMeshMorph.ts';\nexport * from './keepMeshFunction.ts';\n",
        )
        .unwrap();
        std::fs::write(
            scene3d.join("scene.ts"),
            "export function createScene3D(): Scene3D {}\n",
        )
        .unwrap();
        std::fs::write(scene3d.join("index.ts"), "export * from './scene.ts';\n").unwrap();

        let scene_functions =
            collect_ts_for_crate_with_relocations("flight-scene3d", &scene3d, |_| true);
        assert!(
            scene_functions
                .iter()
                .any(|function| function.name == "createScene3D")
        );
        assert!(
            scene_functions
                .iter()
                .any(|function| { function.name == "updateMeshMorph" && function.public })
        );
        assert!(
            !scene_functions
                .iter()
                .any(|function| function.name == "keepMeshFunction")
        );

        let mesh_functions =
            collect_ts_for_crate_with_relocations("flight-meshgeometry", &mesh, |_| true);
        assert!(
            !mesh_functions
                .iter()
                .any(|function| function.name == "updateMeshMorph")
        );
        assert!(
            mesh_functions
                .iter()
                .any(|function| function.name == "keepMeshFunction")
        );

        let dormant_scene_functions =
            collect_ts_for_crate_with_relocations("flight-scene3d", &scene3d, |_| false);
        assert!(
            !dormant_scene_functions
                .iter()
                .any(|function| function.name == "updateMeshMorph")
        );
        let dormant_mesh_functions =
            collect_ts_for_crate_with_relocations("flight-meshgeometry", &mesh, |_| false);
        assert!(
            dormant_mesh_functions
                .iter()
                .any(|function| function.name == "updateMeshMorph")
        );
        std::fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn normalize_matches_digit_acronyms() {
        assert_eq!(
            normalize("createMatrix4From2D"),
            normalize("create_matrix4_from_2d")
        );
        assert_eq!(
            normalize("intersectRay3DCapsule"),
            normalize("intersect_ray3d_capsule")
        );
    }

    #[test]
    fn camel_to_snake_keeps_unit_suffixes() {
        assert_eq!(camel_to_snake("createRay3D"), "create_ray3d");
        assert_eq!(camel_to_snake("getVector3Length"), "get_vector3_length");
        assert_eq!(camel_to_snake("parseXMLDocument"), "parse_xml_document");
    }

    #[test]
    fn extracts_functions_and_params() {
        let src = "export function addVector2(out: Vector2Like, a: Readonly<Vector2Like>, b: Readonly<Vector2Like>): void {}\n\
                   export function pick<T>(\n  random: RandomSource,\n  items: readonly T[],\n): T | undefined {}\n\
                   export const easeSmoothstep: EasingFunction = (t) => t * t;\n\
                   export const easeIn = (t: number): number => t;\n\
                   export const TABLE = [1, 2];\n\
                   export const factory = (() => { return 1; })();\n\
                   export function _internal() {}\n";
        let fns = extract_ts_functions(src, "x.ts");
        let names: Vec<&str> = fns.iter().map(|f| f.name.as_str()).collect();
        assert_eq!(
            names,
            vec!["addVector2", "pick", "easeSmoothstep", "easeIn"]
        );
        assert_eq!(
            fns[0].params.as_deref(),
            Some(&["out".to_string(), "a".into(), "b".into()][..])
        );
        assert_eq!(
            fns[1].params.as_deref(),
            Some(&["random".to_string(), "items".into()][..])
        );
        assert_eq!(fns[2].params.as_deref(), Some(&["t".to_string()][..]));
    }

    #[test]
    fn classifies_array_kinds() {
        let ty = |s: &str| -> syn::Type { syn::parse_str(s).unwrap() };
        assert_eq!(
            rust_array_kind(&ty("&mut [f32]")).as_deref(),
            Some("Float32Array")
        );
        assert_eq!(
            rust_array_kind(&ty("&[f32]")).as_deref(),
            Some("ArrayLike<number>")
        );
        assert_eq!(
            rust_array_kind(&ty("Vec<f32>")).as_deref(),
            Some("number[]")
        );
        assert_eq!(
            rust_array_kind(&ty("Box<[u16]>")).as_deref(),
            Some("Uint16Array")
        );
        assert_eq!(
            rust_array_kind(&ty("[f32; 9]")).as_deref(),
            Some("Float32Array")
        );
        assert_eq!(
            rust_array_kind(&ty("&Vec<f32>")).as_deref(),
            Some("number[]")
        );
        assert_eq!(
            rust_array_kind(&ty("&Float32Array")).as_deref(),
            Some("Float32Array")
        );
        assert_eq!(
            rust_array_kind(&ty("&mut Uint16Array")).as_deref(),
            Some("Uint16Array")
        );
        assert_eq!(
            rust_array_kind(&ty("Box<Float32Array>")).as_deref(),
            Some("Float32Array")
        );
        assert_eq!(rust_array_kind(&ty("&[Vector2]")), None);
        assert_eq!(
            ts_array_kind("Readonly<Float32Array>").as_deref(),
            Some("Float32Array")
        );
        assert_eq!(
            ts_array_kind("readonly number[] | null").as_deref(),
            Some("number[]")
        );
        assert_eq!(
            ts_array_kind("number[] | Float32Array").as_deref(),
            Some("Float32Array | number[]")
        );
        assert_eq!(ts_array_kind("Vector2Like"), None);
    }

    #[test]
    fn signature_captures_types_and_return() {
        let sig =
            parse_signature("f(out: number[], source: Readonly<Float32Array>, n = 3): number[] {")
                .unwrap();
        assert_eq!(sig.types, vec!["number[]", "Readonly<Float32Array>", ""]);
        assert_eq!(sig.return_type, "number[]");
    }

    #[test]
    fn signature_skips_a_line_comment_inside_the_parameter_list() {
        // The pinned textshaper itemizeText declaration, verbatim.
        let decl = "itemizeText(\n  text: string,\n  // Itemization splits on Unicode script/bidi properties alone and does not consult the font; the\n  // parameter is kept for call-site symmetry with shapeTextRuns (both take text, format, options).\n  _format: Readonly<TextFormat>,\n  options?: Readonly<TextShaperOptions>,\n): readonly TextItem[] {";
        let sig = parse_signature(decl).unwrap();
        assert_eq!(sig.names, vec!["text", "_format", "options"]);
        assert_eq!(
            sig.types,
            vec![
                "string",
                "Readonly<TextFormat>",
                "Readonly<TextShaperOptions>"
            ]
        );
        assert_eq!(sig.return_type, "readonly TextItem[]");
    }

    #[test]
    fn signature_skips_multiline_block_comments_with_nesting_punctuation() {
        let decl = "f(/* leading (a, b) <c> { d } */ a: number, /* multi\n line, ) ] } > \n */ b: number[] /* trailing, */, c?: string): void {";
        let sig = parse_signature(decl).unwrap();
        assert_eq!(sig.names, vec!["a", "b", "c"]);
        assert_eq!(sig.types, vec!["number", "number[]", "string"]);
        assert_eq!(sig.return_type, "void");
    }

    #[test]
    fn signature_keeps_comment_like_text_inside_literals() {
        // The literals hold comment openers that must not start a comment; were they blanked, `/*`
        // would swallow `b` and `c`. (The pre-existing splitter is not string-aware for commas, so
        // the literals here carry none.)
        let decl = "f(a: string = '//not-a-comment', b = \"/*still-text\", c: `x//${string}` = `/*`, d: number): void {";
        let sig = parse_signature(decl).unwrap();
        assert_eq!(sig.names, vec!["a", "b", "c", "d"]);
        assert_eq!(sig.types[0], "string");
        assert_eq!(sig.types[2], "`x//${string}`");
        assert_eq!(sig.types[3], "number");
        assert!(blank_ts_comments(decl).contains("'//not-a-comment'"));
    }

    #[test]
    fn signature_honours_escaped_quotes_in_literals() {
        let sig = parse_signature("f(a = 'it\\'s // fine', b: number): void {").unwrap();
        assert_eq!(sig.names, vec!["a", "b"]);
    }

    #[test]
    fn signature_ignores_a_comment_between_the_name_and_parameters() {
        let sig = parse_signature("f /* (x, y) */ <T> /* { */ (a: T): T {").unwrap();
        assert_eq!(sig.names, vec!["a"]);
    }

    #[test]
    fn arrow_signature_skips_comments_in_its_parameter_list() {
        let src = "export const ease = (\n  t: number, // (a, b)\n  /* c, */ k?: number,\n): number => t * k;\n";
        let fns = extract_ts_functions(src, "x.ts");
        assert_eq!(
            fns[0].params.as_deref(),
            Some(&["t".to_string(), "k".into()][..])
        );
    }

    #[test]
    fn blanking_preserves_length_and_newlines() {
        let source = "a // b\nc /* d\ne */ f";
        let blanked = blank_ts_comments(source);
        assert_eq!(blanked.chars().count(), source.chars().count());
        assert_eq!(blanked, "a     \nc     \n     f");
    }

    #[test]
    fn params_skip_arrow_types_and_defaults() {
        let p = parse_params(
            "f(cb: (a: number) => void, opts: { x: number } = {}, ...rest: number[]) {",
        )
        .unwrap();
        assert_eq!(p, vec!["cb", "opts", "rest"]);
    }

    #[test]
    fn overloads_disable_param_check() {
        let src = "export function f(a: number): void;\nexport function f(a: string): void;\nexport function f(a: unknown): void {}\n";
        let fns = extract_ts_functions(src, "x.ts");
        assert_eq!(fns.len(), 1);
        assert!(fns[0].params.is_none());
    }

    #[test]
    fn parses_index_exports() {
        let (names, files) = parse_index(
            "export {\n  a,\n  type B,\n  c as d,\n} from './x.ts';\nexport * from './pool.ts';\n",
        );
        assert!(names.contains("a") && names.contains("B") && names.contains("d"));
        assert!(files.contains("pool"));
    }
}
