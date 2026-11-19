//! Callback-shaped `pub type` aliases, read from their source definitions so a parameter spelled
//! with an alias (`listener: FileWatchListener`, `slot: SignalSlot<TrayDropEvent>`) lowers exactly
//! as the spelled-out `Arc<dyn Fn(..) + Send + Sync>` does. Only aliases named by the generator's
//! policy are resolved; every other alias keeps its current lowering.

use std::collections::BTreeMap;

use super::signal_identity::display_type_text;

/// One callback alias definition: its owning crate, generic parameter names, and its target as
/// display text with paths reduced to names (`Arc<dyn Fn(&T) + Send + Sync>`).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CallbackAlias {
    pub owner: String,
    pub params: Vec<String>,
    pub target: String,
}

/// The single definition of each alias in `names`. An alias that is undefined, defined as a
/// non-callback type, or defined differently by two crates is an error naming the crates.
pub fn check_callback_aliases(
    definitions: &BTreeMap<String, Vec<CallbackAlias>>,
    names: &[&str],
) -> Result<BTreeMap<String, CallbackAlias>, String> {
    let mut checked = BTreeMap::new();
    for name in names {
        let Some(found) = definitions.get(*name).filter(|found| !found.is_empty()) else {
            return Err(format!(
                "callback alias `{name}` is not defined as `Arc<dyn Fn(..)>` in any scanned crate"
            ));
        };
        let first = &found[0];
        if let Some(other) = found
            .iter()
            .find(|other| other.params != first.params || other.target != first.target)
        {
            return Err(format!(
                "callback alias `{name}` is defined differently by {} (`{}`) and {} (`{}`)",
                first.owner, first.target, other.owner, other.target
            ));
        }
        checked.insert(name.to_string(), first.clone());
    }
    return Ok(checked);
}

/// Records every public alias in `file` (including inline modules) whose target is an
/// `Arc<dyn Fn(..)>`, under `owner`.
pub fn collect_callback_aliases(
    file: &syn::File,
    owner: &str,
    out: &mut BTreeMap<String, Vec<CallbackAlias>>,
) {
    collect_items(&file.items, owner, out);
}

/// Whether `target` (display text) is a retained callback: an `Arc` of a `dyn Fn` trait object.
pub fn is_callback_target(target: &str) -> bool {
    return target.starts_with("Arc<dyn Fn(");
}

/// `ty` with a checked callback alias replaced by its target, generic arguments substituted;
/// `Option<Alias>` keeps its `Option`. Any other type is `None` and keeps its current lowering.
pub fn resolve_callback_alias(
    ty: &str,
    aliases: &BTreeMap<String, CallbackAlias>,
) -> Option<String> {
    let ty = ty.trim();
    if let Some(inner) = ty
        .strip_prefix("Option<")
        .and_then(|rest| rest.strip_suffix('>'))
    {
        return resolve_callback_alias(inner, aliases)
            .map(|resolved| format!("Option<{resolved}>"));
    }
    let (name, args) = match ty.find('<') {
        Some(open) if ty.ends_with('>') => {
            (&ty[..open], split_type_args(&ty[open + 1..ty.len() - 1]))
        }
        Some(_) => return None,
        None => (ty, Vec::new()),
    };
    let alias = aliases.get(name.trim())?;
    if args.len() != alias.params.len() {
        return None;
    }
    let mut resolved = alias.target.clone();
    for (param, arg) in alias.params.iter().zip(&args) {
        resolved = replace_type_word(&resolved, param, arg);
    }
    return Some(resolved);
}

fn collect_items(items: &[syn::Item], owner: &str, out: &mut BTreeMap<String, Vec<CallbackAlias>>) {
    for item in items {
        match item {
            syn::Item::Type(alias) if matches!(alias.vis, syn::Visibility::Public(_)) => {
                let Ok(target) = display_type_text(&alias.ty) else {
                    continue;
                };
                if !is_callback_target(&target) {
                    continue;
                }
                let params = alias
                    .generics
                    .type_params()
                    .map(|param| param.ident.to_string())
                    .collect();
                out.entry(alias.ident.to_string())
                    .or_default()
                    .push(CallbackAlias {
                        owner: owner.to_string(),
                        params,
                        target,
                    });
            }
            syn::Item::Mod(module) => {
                if let Some((_, content)) = &module.content {
                    collect_items(content, owner, out);
                }
            }
            _ => {}
        }
    }
}

// `text` with every whole-word occurrence of the type name `word` replaced by `with`.
fn replace_type_word(text: &str, word: &str, with: &str) -> String {
    let mut out = String::new();
    let mut rest = text;
    while let Some(index) = rest.find(word) {
        let before = rest[..index].chars().next_back();
        let after = rest[index + word.len()..].chars().next();
        let is_word = |c: Option<char>| c.is_some_and(|c| c.is_alphanumeric() || c == '_');
        out.push_str(&rest[..index]);
        if is_word(before) || is_word(after) {
            out.push_str(word);
        } else {
            out.push_str(with);
        }
        rest = &rest[index + word.len()..];
    }
    out.push_str(rest);
    return out;
}

// Top-level comma-separated generic arguments of `text`.
fn split_type_args(text: &str) -> Vec<String> {
    let mut args = Vec::new();
    let mut depth = 0i32;
    let mut start = 0;
    let bytes = text.as_bytes();
    for index in 0..bytes.len() {
        match bytes[index] {
            b'<' | b'(' | b'[' => depth += 1,
            b'>' if index > 0 && bytes[index - 1] == b'-' => {}
            b'>' | b')' | b']' => depth -= 1,
            b',' if depth == 0 => {
                args.push(text[start..index].trim().to_string());
                start = index + 1;
            }
            _ => {}
        }
    }
    if !text[start..].trim().is_empty() {
        args.push(text[start..].trim().to_string());
    }
    return args;
}
