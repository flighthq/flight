// The public-lane perimeter for generic carriers (agents/ffi-public-lane.md): the names a package's
// TypeScript root really exports, and the functions whose returned disposer may cross the ABI.
//
// The export reader is a bounded TypeScript reader, not a full parser. It strips comments, keeps
// string literals whole, and reads only `export` statements: declarations, `{ a, b as c }` lists with
// or without `from`, `* as name`, and `export *` chains, which it follows through relative modules
// (`./x`, `./x.ts`, `./x/index.ts`) with a visited set. Type-only exports, `export default`, and
// re-exports from other packages' modules contribute no function names to this package's lane.
use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

// The only functions whose `Arc<dyn Fn() + Send + Sync>` return lowers to a callable disposer
// handle. A matching type alone is not consent: each entry is a consumption-side disposer for work
// the call itself started, with no caller-provided behavior captured.
pub const DISPOSER_FUNCTIONS: &[&str] = &["reveal_scene3d_resources_on_resolve"];

// The value names `entry` exports, and every module file read while resolving them.
pub fn collect_ts_module_exports(entry: &Path) -> (BTreeSet<String>, Vec<PathBuf>) {
    let mut names = BTreeSet::new();
    let mut visited = BTreeSet::new();
    let mut files = Vec::new();
    visit_module(entry, &mut names, &mut visited, &mut files);
    return (names, files);
}

// `reveal_scene3d_resources_on_resolve` and `revealScene3DResourcesOnResolve` share one key.
pub fn get_export_key(name: &str) -> String {
    name.chars()
        .filter(|c| *c != '_')
        .map(|c| c.to_ascii_lowercase())
        .collect()
}

// A returned disposer maps only for an allowlisted function with no caller-provided callback
// parameter, whose context the disposer could otherwise capture.
pub fn is_disposer_function(name: &str, param_types: &[&str]) -> bool {
    DISPOSER_FUNCTIONS.contains(&name)
        && !param_types
            .iter()
            .any(|ty| ty.contains("Fn(") || ty.contains("FnMut(") || ty.contains("FnOnce("))
}

#[derive(Debug, PartialEq)]
enum Token {
    Ident(String),
    Punct(char),
    Str(String),
}

fn visit_module(
    path: &Path,
    names: &mut BTreeSet<String>,
    visited: &mut BTreeSet<PathBuf>,
    files: &mut Vec<PathBuf>,
) {
    let key = fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    if !visited.insert(key) {
        return;
    }
    files.push(path.to_path_buf());
    let Ok(source) = fs::read_to_string(path) else {
        return;
    };
    let tokens = tokenize(&source);
    let mut index = 0;
    while index < tokens.len() {
        let starts_export = tokens[index] == Token::Ident("export".to_string())
            && (index == 0 || tokens[index - 1] != Token::Punct('.'));
        if !starts_export {
            index += 1;
            continue;
        }
        index = read_export(&tokens, index + 1, path, names, visited, files);
    }
}

// Reads one export statement starting after `export`, returning the index after it.
fn read_export(
    tokens: &[Token],
    mut index: usize,
    path: &Path,
    names: &mut BTreeSet<String>,
    visited: &mut BTreeSet<PathBuf>,
    files: &mut Vec<PathBuf>,
) -> usize {
    while let Some(Token::Ident(word)) = tokens.get(index) {
        if !matches!(word.as_str(), "declare" | "async" | "abstract") {
            break;
        }
        index += 1;
    }
    match tokens.get(index) {
        Some(Token::Ident(word)) if word == "type" || word == "interface" || word == "default" => {
            return index + 1;
        }
        Some(Token::Punct('*')) => {
            index += 1;
            if let Some(Token::Ident(word)) = tokens.get(index) {
                if word == "as" {
                    if let Some(Token::Ident(namespace)) = tokens.get(index + 1) {
                        names.insert(namespace.clone());
                    }
                    return index + 2;
                }
            }
            if let (Some(Token::Ident(from)), Some(Token::Str(specifier))) =
                (tokens.get(index), tokens.get(index + 1))
            {
                if from == "from" {
                    if let Some(module) = resolve_relative_module(path, specifier) {
                        visit_module(&module, names, visited, files);
                    }
                    return index + 2;
                }
            }
            return index;
        }
        Some(Token::Punct('{')) => {
            return read_export_list(tokens, index + 1, names);
        }
        Some(Token::Ident(word)) => {
            let declared = match word.as_str() {
                "function" | "class" | "enum" | "namespace" | "module" => {
                    let mut next = index + 1;
                    if tokens.get(next) == Some(&Token::Punct('*')) {
                        next += 1;
                    }
                    tokens.get(next)
                }
                // `export const enum Kind`.
                "const" if tokens.get(index + 1) == Some(&Token::Ident("enum".to_string())) => {
                    tokens.get(index + 2)
                }
                "const" | "let" | "var" => tokens.get(index + 1),
                _ => None,
            };
            if let Some(Token::Ident(name)) = declared {
                names.insert(name.clone());
            }
            return index + 1;
        }
        _ => return index,
    }
}

// `{ a, b as c, type D, default as e }`: the exported spelling of each value specifier.
fn read_export_list(tokens: &[Token], mut index: usize, names: &mut BTreeSet<String>) -> usize {
    let mut specifier: Vec<&str> = Vec::new();
    while let Some(token) = tokens.get(index) {
        index += 1;
        match token {
            Token::Ident(word) => specifier.push(word),
            Token::Str(word) => specifier.push(word),
            Token::Punct(',') | Token::Punct('}') => {
                if let Some(name) = get_exported_specifier_name(&specifier) {
                    names.insert(name.to_string());
                }
                specifier.clear();
                if *token == Token::Punct('}') {
                    break;
                }
            }
            Token::Punct(_) => {}
        }
    }
    return index;
}

fn get_exported_specifier_name<'a>(specifier: &[&'a str]) -> Option<&'a str> {
    match specifier {
        ["type", ..] | [] => None,
        [_, "as", exported] => Some(exported),
        [name] => Some(name),
        _ => None,
    }
}

// `./x`, `./x.ts`, `./x.js`, or `./x/index.ts`; package specifiers are another package's lane.
fn resolve_relative_module(from: &Path, specifier: &str) -> Option<PathBuf> {
    if !specifier.starts_with("./") && !specifier.starts_with("../") {
        return None;
    }
    let base = from.parent()?.join(specifier);
    let stem = base.to_string_lossy();
    let stem = stem
        .strip_suffix(".js")
        .or_else(|| stem.strip_suffix(".ts"))
        .unwrap_or(&stem)
        .to_string();
    [
        format!("{stem}.ts"),
        format!("{stem}.tsx"),
        format!("{stem}/index.ts"),
    ]
    .into_iter()
    .map(PathBuf::from)
    .find(|candidate| candidate.is_file())
}

// Identifiers, single-character punctuation and whole string literals; comments are dropped.
fn tokenize(source: &str) -> Vec<Token> {
    let chars: Vec<char> = source.chars().collect();
    let mut tokens = Vec::new();
    let mut index = 0;
    while index < chars.len() {
        let c = chars[index];
        if c.is_whitespace() {
            index += 1;
        } else if c == '/' && chars.get(index + 1) == Some(&'/') {
            while index < chars.len() && chars[index] != '\n' {
                index += 1;
            }
        } else if c == '/' && chars.get(index + 1) == Some(&'*') {
            index += 2;
            while index < chars.len()
                && !(chars[index] == '*' && chars.get(index + 1) == Some(&'/'))
            {
                index += 1;
            }
            index += 2;
        } else if c == '\'' || c == '"' || c == '`' {
            let mut text = String::new();
            index += 1;
            while index < chars.len() && chars[index] != c {
                if chars[index] == '\\' {
                    index += 1;
                }
                if let Some(next) = chars.get(index) {
                    text.push(*next);
                }
                index += 1;
            }
            index += 1;
            tokens.push(Token::Str(text));
        } else if c.is_alphanumeric() || c == '_' || c == '$' {
            let start = index;
            while index < chars.len()
                && (chars[index].is_alphanumeric() || chars[index] == '_' || chars[index] == '$')
            {
                index += 1;
            }
            tokens.push(Token::Ident(chars[start..index].iter().collect()));
        } else {
            tokens.push(Token::Punct(c));
            index += 1;
        }
    }
    return tokens;
}
