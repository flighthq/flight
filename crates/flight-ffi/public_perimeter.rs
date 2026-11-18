// The public-lane perimeter for generic carriers (agents/ffi-public-lane.md): the value names a
// package's TypeScript root really exports, and the functions whose returned disposer may cross
// the ABI.
//
// The export reader is a bounded TypeScript reader, not a full parser. It strips comments, keeps
// string literals whole, and reads each module's imports, local value declarations, and export
// statements, then resolves a module's value exports by origin:
// - `export function|class|enum|const|let|var|namespace` declares values; every declarator of a
//   multi-name `const a = 1, b = 2` counts. `export type|interface|default` declares none.
// - `export { a, b as c }` exports a local binding only when it is a local value declaration or a
//   value import from a relative module that really exports it; type-only and package imports never
//   authorize a name.
// - `export { a as c } from './x'` resolves `./x` and exports `c` only when `./x` exports the value
//   `a`; `type` specifiers, `default`, and package sources contribute nothing.
// - `export * from './x'` exports every value `./x` exports; a package source is never read.
// - `export * as ns from './x'` reads `./x` for change tracking and exports `ns`; a package
//   namespace exports nothing.
// Relative modules resolve as `./x.ts`, `./x.tsx`, `./x/index.ts`, or an explicit `.ts`/`.tsx`, with
// `.js`/`.jsx` read as their TypeScript sources. Each module is read once; a cycle's back edge
// contributes nothing beyond what the chain already exported.
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};

// The only functions whose `Arc<dyn Fn() + Send + Sync>` return lowers to a callable disposer
// handle. A matching type alone is not consent: each entry returns the cancellation side of work
// the call itself started. The frame-rate connection deliberately retains its typed callback until
// that disposer is called; the callback context therefore has the same lifetime as the connection.
pub const DISPOSER_FUNCTIONS: &[&str] = &[
    "connect_signal_at_frame_rate",
    "reveal_scene3d_resources_on_resolve",
];

// The value names `entry` exports, and every module file read while resolving them.
pub fn collect_ts_module_exports(entry: &Path) -> (BTreeSet<String>, Vec<PathBuf>) {
    let mut reader = ExportReader::default();
    let names = reader.read_module(entry);
    return (names, reader.files);
}

// The imported value names a barrel explicitly promotes from one external contract. Returning the
// imported rather than aliased SDK name keeps the result comparable with the owning Rust crate.
// Star exports stay governed by the package root reader; this function recognizes only deliberate
// named promotions such as the SDK's font contract additions.
pub fn collect_ts_external_reexports(entry: &Path, source: &str) -> BTreeSet<String> {
    let tokens = fs::read_to_string(entry)
        .map(|text| tokenize(&text))
        .unwrap_or_default();
    let module = parse_module(&tokens);
    return module
        .exports
        .into_iter()
        .filter_map(|statement| match statement {
            ExportStatement::Named {
                source: export_source,
                imported,
                ..
            } if export_source == source && imported != "default" => Some(imported),
            _ => None,
        })
        .collect();
}

// `reveal_scene3d_resources_on_resolve` and `revealScene3DResourcesOnResolve` share one key.
pub fn get_export_key(name: &str) -> String {
    name.chars()
        .filter(|c| *c != '_')
        .map(|c| c.to_ascii_lowercase())
        .collect()
}

// A returned disposer maps only for an allowlisted function. The frame-rate connection is the one
// approved callback-retaining entry; every other entry must remain callback-free.
pub fn is_disposer_function(name: &str, param_types: &[&str]) -> bool {
    DISPOSER_FUNCTIONS.contains(&name)
        && (name == "connect_signal_at_frame_rate"
            || !param_types
                .iter()
                .any(|ty| ty.contains("Fn(") || ty.contains("FnMut(") || ty.contains("FnOnce(")))
}

#[derive(Debug, PartialEq)]
enum Token {
    Ident(String),
    Punct(char),
    Str(String),
}

#[derive(Debug)]
enum ExportStatement {
    Declared(String),
    // `export { local as exported }` without a source.
    Local {
        local: String,
        exported: String,
    },
    // `export { imported as exported } from source`.
    Named {
        source: String,
        imported: String,
        exported: String,
    },
    Star {
        source: String,
    },
    StarAs {
        source: String,
        namespace: String,
    },
}

#[derive(Debug)]
struct Import {
    source: String,
    // The exported name the binding refers to; None for a namespace import.
    imported: Option<String>,
    type_only: bool,
}

#[derive(Debug, Default)]
struct ModuleSyntax {
    values: BTreeSet<String>,
    imports: BTreeMap<String, Import>,
    exports: Vec<ExportStatement>,
}

#[derive(Default)]
struct ExportReader {
    exports: BTreeMap<PathBuf, BTreeSet<String>>,
    reading: BTreeSet<PathBuf>,
    files: Vec<PathBuf>,
}

impl ExportReader {
    fn read_module(&mut self, path: &Path) -> BTreeSet<String> {
        let key = fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
        if let Some(names) = self.exports.get(&key) {
            return names.clone();
        }
        if !self.reading.insert(key.clone()) {
            return BTreeSet::new();
        }
        self.files.push(path.to_path_buf());
        let tokens = fs::read_to_string(path)
            .map(|source| tokenize(&source))
            .unwrap_or_default();
        let module = parse_module(&tokens);
        let mut names = BTreeSet::new();
        for statement in &module.exports {
            match statement {
                ExportStatement::Declared(name) => {
                    names.insert(name.clone());
                }
                ExportStatement::Local { local, exported } => {
                    if self.is_value_binding(path, &module, local) {
                        names.insert(exported.clone());
                    }
                }
                ExportStatement::Named {
                    source,
                    imported,
                    exported,
                } => {
                    if let Some(origin) = resolve_relative_module(path, source) {
                        if self.read_module(&origin).contains(imported) {
                            names.insert(exported.clone());
                        }
                    }
                }
                ExportStatement::Star { source } => {
                    if let Some(origin) = resolve_relative_module(path, source) {
                        names.extend(self.read_module(&origin));
                    }
                }
                ExportStatement::StarAs { source, namespace } => {
                    if let Some(origin) = resolve_relative_module(path, source) {
                        self.read_module(&origin);
                        names.insert(namespace.clone());
                    }
                }
            }
        }
        self.reading.remove(&key);
        self.exports.insert(key, names.clone());
        return names;
    }

    fn is_value_binding(&mut self, path: &Path, module: &ModuleSyntax, local: &str) -> bool {
        if module.values.contains(local) {
            return true;
        }
        let Some(import) = module.imports.get(local) else {
            return false;
        };
        if import.type_only {
            return false;
        }
        let Some(origin) = resolve_relative_module(path, &import.source) else {
            return false;
        };
        let values = self.read_module(&origin);
        return match &import.imported {
            Some(imported) => values.contains(imported),
            None => true,
        };
    }
}

fn is_statement_keyword(tokens: &[Token], index: usize, keyword: &str) -> bool {
    tokens.get(index) == Some(&Token::Ident(keyword.to_string()))
        && (index == 0 || tokens[index - 1] != Token::Punct('.'))
}

fn get_ident(tokens: &[Token], index: usize) -> Option<&str> {
    match tokens.get(index) {
        Some(Token::Ident(word)) => Some(word),
        _ => None,
    }
}

fn parse_module(tokens: &[Token]) -> ModuleSyntax {
    let mut module = ModuleSyntax::default();
    let mut index = 0;
    while index < tokens.len() {
        if is_statement_keyword(tokens, index, "import")
            && tokens.get(index + 1) != Some(&Token::Punct('('))
        {
            index = parse_import(tokens, index + 1, &mut module);
        } else if is_statement_keyword(tokens, index, "export") {
            index = parse_export(tokens, index + 1, &mut module);
        } else {
            // Non-exported declarations are local values an export list may name.
            let next = parse_declaration(tokens, index, &mut module.values);
            index = if next > index { next } else { index + 1 };
        }
    }
    return module;
}

// A value declaration at `index`: its names go to `out`. Returns `index` when there is none.
fn parse_declaration(tokens: &[Token], index: usize, out: &mut BTreeSet<String>) -> usize {
    match get_ident(tokens, index) {
        Some("function" | "class" | "enum" | "namespace") => {
            let mut next = index + 1;
            if tokens.get(next) == Some(&Token::Punct('*')) {
                next += 1;
            }
            if let Some(name) = get_ident(tokens, next) {
                out.insert(name.to_string());
                return next + 1;
            }
            return index + 1;
        }
        Some("const") if get_ident(tokens, index + 1) == Some("enum") => {
            if let Some(name) = get_ident(tokens, index + 2) {
                out.insert(name.to_string());
            }
            return index + 3;
        }
        Some("const" | "let" | "var") => return parse_declarators(tokens, index + 1, out),
        _ => return index,
    }
}

// `a = 1, { b, c: d } = e, [f] = g` -> a, b, d, f. Type annotations and initializers are skipped to
// the next comma or semicolon at bracket depth 0; a following `export`/`import` ends the statement.
fn parse_declarators(tokens: &[Token], mut index: usize, out: &mut BTreeSet<String>) -> usize {
    loop {
        match tokens.get(index) {
            Some(Token::Ident(name)) => {
                out.insert(name.clone());
                index += 1;
            }
            Some(Token::Punct(open @ ('{' | '['))) => {
                index = parse_binding_pattern(tokens, index + 1, *open, out);
            }
            _ => return index,
        }
        // Angle brackets nest only in a type annotation; in the initializer they are operators.
        let mut depth = 0i32;
        let mut in_initializer = false;
        loop {
            match tokens.get(index) {
                None => return index,
                Some(Token::Punct('=')) if depth <= 0 => in_initializer = true,
                Some(Token::Punct('<')) if !in_initializer => depth += 1,
                Some(Token::Punct('>')) if !in_initializer => depth -= 1,
                Some(Token::Punct('(' | '[' | '{')) => depth += 1,
                Some(Token::Punct(')' | ']' | '}')) => depth -= 1,
                Some(Token::Punct(';')) if depth <= 0 => return index + 1,
                Some(Token::Punct(',')) if depth <= 0 => {
                    index += 1;
                    break;
                }
                Some(Token::Ident(word))
                    if depth <= 0
                        && (word == "export" || word == "import")
                        && tokens[index - 1] != Token::Punct('.') =>
                {
                    return index;
                }
                _ => {}
            }
            index += 1;
        }
    }
}

// The binding names in a destructuring pattern; property keys before `:` are not bindings.
fn parse_binding_pattern(
    tokens: &[Token],
    mut index: usize,
    open: char,
    out: &mut BTreeSet<String>,
) -> usize {
    let close = if open == '{' { '}' } else { ']' };
    let mut skipping_default = false;
    while let Some(token) = tokens.get(index) {
        match token {
            Token::Punct(c) if *c == close => return index + 1,
            Token::Punct('{' | '[') => {
                let Token::Punct(nested) = token else {
                    unreachable!()
                };
                index = parse_binding_pattern(tokens, index + 1, *nested, out);
                continue;
            }
            Token::Punct(',') => skipping_default = false,
            Token::Punct('=') => skipping_default = true,
            Token::Ident(name) if !skipping_default => {
                if tokens.get(index + 1) != Some(&Token::Punct(':')) {
                    out.insert(name.clone());
                }
            }
            _ => {}
        }
        index += 1;
    }
    return index;
}

fn parse_import(tokens: &[Token], mut index: usize, module: &mut ModuleSyntax) -> usize {
    let type_only = get_ident(tokens, index) == Some("type")
        && !matches!(tokens.get(index + 1), Some(Token::Ident(word)) if word == "from");
    if type_only {
        index += 1;
    }
    let mut bindings: Vec<(String, Option<String>, bool)> = Vec::new();
    loop {
        match tokens.get(index) {
            Some(Token::Str(source)) => {
                for (local, imported, specifier_type) in bindings {
                    module.imports.insert(
                        local,
                        Import {
                            source: source.clone(),
                            imported,
                            type_only: type_only || specifier_type,
                        },
                    );
                }
                return index + 1;
            }
            Some(Token::Punct('*')) => {
                if let Some(local) = get_ident(tokens, index + 2) {
                    bindings.push((local.to_string(), None, false));
                }
                index += 3;
            }
            Some(Token::Punct('{')) => {
                index += 1;
                let mut specifier: Vec<&str> = Vec::new();
                while let Some(token) = tokens.get(index) {
                    index += 1;
                    match token {
                        Token::Ident(word) | Token::Str(word) => specifier.push(word),
                        Token::Punct(',' | '}') => {
                            let specifier_type = specifier.first() == Some(&"type");
                            let names = if specifier_type {
                                &specifier[1..]
                            } else {
                                &specifier[..]
                            };
                            let binding = match names {
                                [imported, "as", local] => Some((*local, *imported)),
                                [name] => Some((*name, *name)),
                                _ => None,
                            };
                            if let Some((local, imported)) = binding {
                                bindings.push((
                                    local.to_string(),
                                    Some(imported.to_string()),
                                    specifier_type,
                                ));
                            }
                            specifier.clear();
                            if *token == Token::Punct('}') {
                                break;
                            }
                        }
                        Token::Punct(_) => {}
                    }
                }
            }
            Some(Token::Ident(word)) if word == "from" => index += 1,
            // A default import binds the module's default export.
            Some(Token::Ident(local)) => {
                bindings.push((local.clone(), Some("default".to_string()), false));
                index += 1;
            }
            Some(Token::Punct(',')) => index += 1,
            _ => return index,
        }
    }
}

// Reads one export statement starting after `export`, returning the index after it.
fn parse_export(tokens: &[Token], mut index: usize, module: &mut ModuleSyntax) -> usize {
    while matches!(
        get_ident(tokens, index),
        Some("declare" | "async" | "abstract")
    ) {
        index += 1;
    }
    match tokens.get(index) {
        Some(Token::Ident(word)) if word == "type" || word == "interface" || word == "default" => {
            return index + 1;
        }
        Some(Token::Punct('*')) => {
            index += 1;
            let namespace = if get_ident(tokens, index) == Some("as") {
                let namespace = get_ident(tokens, index + 1).map(str::to_string);
                index += 2;
                namespace
            } else {
                None
            };
            if get_ident(tokens, index) != Some("from") {
                return index;
            }
            let Some(Token::Str(source)) = tokens.get(index + 1) else {
                return index + 1;
            };
            let source = source.clone();
            module.exports.push(match namespace {
                Some(namespace) => ExportStatement::StarAs { source, namespace },
                None => ExportStatement::Star { source },
            });
            return index + 2;
        }
        Some(Token::Punct('{')) => return parse_export_list(tokens, index + 1, module),
        _ => {
            let mut declared = BTreeSet::new();
            let next = parse_declaration(tokens, index, &mut declared);
            for name in declared {
                module.values.insert(name.clone());
                module.exports.push(ExportStatement::Declared(name));
            }
            return if next > index { next } else { index + 1 };
        }
    }
}

// `{ a, b as c, type T, default as d } [from 'source']`: the specifiers are kept with their origin
// and resolved by the reader; `type` specifiers are dropped here.
fn parse_export_list(tokens: &[Token], mut index: usize, module: &mut ModuleSyntax) -> usize {
    let mut specifiers: Vec<(String, String)> = Vec::new();
    let mut specifier: Vec<&str> = Vec::new();
    while let Some(token) = tokens.get(index) {
        index += 1;
        match token {
            Token::Ident(word) | Token::Str(word) => specifier.push(word),
            Token::Punct(',' | '}') => {
                let binding = match specifier.as_slice() {
                    ["type", ..] | [] => None,
                    [local, "as", exported] => Some((*local, *exported)),
                    [name] => Some((*name, *name)),
                    _ => None,
                };
                if let Some((local, exported)) = binding {
                    specifiers.push((local.to_string(), exported.to_string()));
                }
                specifier.clear();
                if *token == Token::Punct('}') {
                    break;
                }
            }
            Token::Punct(_) => {}
        }
    }
    let source = match (get_ident(tokens, index), tokens.get(index + 1)) {
        (Some("from"), Some(Token::Str(source))) => {
            index += 2;
            Some(source.clone())
        }
        _ => None,
    };
    for (local, exported) in specifiers {
        module.exports.push(match &source {
            Some(source) => ExportStatement::Named {
                source: source.clone(),
                imported: local,
                exported,
            },
            None => ExportStatement::Local { local, exported },
        });
    }
    return index;
}

// `./x`, `./x.ts`, `./x.tsx`, `./x.js`, `./x.jsx`, or `./x/index.ts`; a package specifier is another
// package's lane and resolves to nothing.
fn resolve_relative_module(from: &Path, specifier: &str) -> Option<PathBuf> {
    if !specifier.starts_with("./") && !specifier.starts_with("../") {
        return None;
    }
    let base = from.parent()?.join(specifier).to_string_lossy().to_string();
    let mut candidates = Vec::new();
    if base.ends_with(".ts") || base.ends_with(".tsx") {
        candidates.push(base.clone());
    } else if let Some(stem) = base.strip_suffix(".jsx") {
        candidates.push(format!("{stem}.tsx"));
    } else if let Some(stem) = base.strip_suffix(".js") {
        candidates.push(format!("{stem}.ts"));
        candidates.push(format!("{stem}.tsx"));
    } else {
        candidates.push(format!("{base}.ts"));
        candidates.push(format!("{base}.tsx"));
        candidates.push(format!("{base}/index.ts"));
        candidates.push(format!("{base}/index.tsx"));
    }
    candidates
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
