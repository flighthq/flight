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
    pub file: String,
    /// Exported from the package's curated `index.ts` (public API) rather than only from
    /// `contract.ts` (the full contract).
    pub public: bool,
}

struct RsFunction {
    name: String,
    params: Vec<String>,
    file: PathBuf,
    line: usize,
}

/// Resolves the TS source dir for a crate. `ts_root` may be the packages dir
/// (`<root>/<name>/src`) or, for a single crate, the package's `src` dir itself.
pub fn ts_src_for(ts_root: &Path, crate_name: &str, single: bool) -> Option<PathBuf> {
    let pkg = crate_name.strip_prefix("flight-").unwrap_or(crate_name);
    let candidate = ts_root.join(pkg).join("src");
    if candidate.is_dir() {
        return Some(candidate);
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
    let ts_fns = collect_ts(ts_src);
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
                                syn::Pat::Ident(pi) => {
                                    Some(pi.ident.to_string().trim_start_matches('_').to_string())
                                }
                                _ => Some(String::from("_")),
                            },
                            syn::FnArg::Receiver(_) => None,
                        })
                        .collect();
                    rs_fns.push(RsFunction {
                        name: f.sig.ident.to_string(),
                        params,
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
            let name = p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
            name.ends_with(".ts")
                && !name.ends_with(".test.ts")
                && !name.ends_with(".spec.ts")
                && !name.ends_with(".d.ts")
                && !p.components().any(|c| c.as_os_str() == "__tests__")
        })
        .collect();
    files.sort();

    let base = ts_src.parent().and_then(|p| p.parent()).unwrap_or(ts_src);
    let index = fs::read_to_string(ts_src.join("index.ts")).unwrap_or_default();
    let (public_names, public_files) = parse_index(&index);
    let mut out = Vec::new();
    for f in files {
        let Ok(source) = fs::read_to_string(&f) else {
            continue;
        };
        let rel = display_path(f.strip_prefix(base).unwrap_or(&f));
        let stem = f.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
        let whole_file_public = public_files.contains(&stem);
        for mut t in extract_ts_functions(&source, &rel) {
            t.public = whole_file_public || public_names.contains(&t.name);
            out.push(t);
        }
    }
    return out;
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
                    let stem = stem.strip_suffix(".ts").or_else(|| stem.strip_suffix(".js")).unwrap_or(stem);
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
            Some((name, parse_params(&source[decl_start..])))
        } else if let Some(after) = trimmed.strip_prefix("export const ") {
            let name = ident_prefix(after);
            arrow_params(&source[decl_start + "export const ".len() + name.len()..])
                .map(|params| (name, Some(params)))
        } else {
            None
        };
        if let Some((name, params)) = found {
            if !name.is_empty() && !name.starts_with('_') {
                if let Some(&idx) = seen.get(&name) {
                    out[idx].params = None;
                } else {
                    seen.insert(name.clone(), out.len());
                    out.push(TsFunction {
                        name,
                        params,
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
fn arrow_params(rest: &str) -> Option<Vec<String>> {
    let eq = rest.find('=')?;
    if rest[..eq].contains(['\n', ';']) {
        return None;
    }
    let init = rest[eq + 1..].trim_start();
    let init = init.strip_prefix("async ").map(|s| s.trim_start()).unwrap_or(init);
    if init.starts_with("function") {
        return parse_params(init);
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
        if !(between.is_empty() || (between.starts_with(':') && !between.contains([';', '{', '(']))) {
            return None;
        }
        return parse_params(init);
    }
    let name = ident_prefix(init);
    if !name.is_empty() && init[name.len()..].trim_start().starts_with("=>") {
        return Some(vec![name]);
    }
    return None;
}

/// Parses `name<...>(a: T, b?: U = x, ...rest: V)` from the start of an export declaration.
fn parse_params(decl: &str) -> Option<Vec<String>> {
    let chars: Vec<char> = decl.chars().collect();
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
    let names = params
        .iter()
        .map(|p| {
            let p = p.trim().trim_start_matches("...");
            if p.starts_with('{') || p.starts_with('[') {
                return String::from("_");
            }
            let name: String = p
                .chars()
                .take_while(|c| c.is_alphanumeric() || *c == '_' || *c == '$')
                .collect();
            name
        })
        .filter(|n| !n.is_empty() && n != "this")
        .collect();
    return Some(names);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_matches_digit_acronyms() {
        assert_eq!(normalize("createMatrix4From2D"), normalize("create_matrix4_from_2d"));
        assert_eq!(normalize("intersectRay3DCapsule"), normalize("intersect_ray3d_capsule"));
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
        assert_eq!(names, vec!["addVector2", "pick", "easeSmoothstep", "easeIn"]);
        assert_eq!(fns[0].params.as_deref(), Some(&["out".to_string(), "a".into(), "b".into()][..]));
        assert_eq!(fns[1].params.as_deref(), Some(&["random".to_string(), "items".into()][..]));
        assert_eq!(fns[2].params.as_deref(), Some(&["t".to_string()][..]));
    }

    #[test]
    fn params_skip_arrow_types_and_defaults() {
        let p = parse_params("f(cb: (a: number) => void, opts: { x: number } = {}, ...rest: number[]) {").unwrap();
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
        let (names, files) = parse_index("export {\n  a,\n  type B,\n  c as d,\n} from './x.ts';\nexport * from './pool.ts';\n");
        assert!(names.contains("a") && names.contains("B") && names.contains("d"));
        assert!(files.contains("pool"));
    }
}
