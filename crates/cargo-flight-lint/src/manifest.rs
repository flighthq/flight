//! Frozen API and test manifests. `<dir>/<crate>.api` lists the crate's public surface
//! (signatures, type shapes, derives; no docs or bodies) and `<dir>/<crate>.tests` lists
//! every `#[test]`. A manifest diff means the contract or its tests changed.

use std::fs;
use std::path::Path;

use quote::ToTokens;
use syn::{ImplItem, Item, Type};

use crate::model::{crate_files, display_path};
use crate::structure::{is_impl_entity_macro, is_pub};

pub fn api_manifest(crate_name: &str) -> String {
    let crate_dir = Path::new("crates").join(crate_name);
    let mut lines = Vec::new();
    for path in crate_files(crate_name, "src") {
        let Ok(source) = fs::read_to_string(&path) else {
            continue;
        };
        let Ok(file) = syn::parse_file(&source) else {
            lines.push(format!("{}: <parse error>", rel(&crate_dir, &path)));
            continue;
        };
        let prefix = rel(&crate_dir, &path);
        let mut file_lines: Vec<String> = file
            .items
            .iter()
            .flat_map(api_lines)
            .map(|l| format!("{}: {}", prefix, l))
            .collect();
        file_lines.sort();
        lines.extend(file_lines);
    }
    return finish(lines);
}

pub fn test_manifest(crate_name: &str) -> String {
    let crate_dir = Path::new("crates").join(crate_name);
    let mut lines = Vec::new();
    for path in crate_files(crate_name, "tests") {
        let Ok(source) = fs::read_to_string(&path) else {
            continue;
        };
        let Ok(file) = syn::parse_file(&source) else {
            lines.push(format!("{}: <parse error>", rel(&crate_dir, &path)));
            continue;
        };
        let prefix = rel(&crate_dir, &path);
        let mut file_lines = Vec::new();
        collect_tests(&file.items, "", &mut file_lines);
        file_lines.sort();
        lines.extend(file_lines.into_iter().map(|l| format!("{}: {}", prefix, l)));
    }
    return finish(lines);
}

fn finish(lines: Vec<String>) -> String {
    let mut s = lines.join("\n");
    s.push('\n');
    return s;
}

fn rel(base: &Path, path: &Path) -> String {
    return display_path(path.strip_prefix(base).unwrap_or(path));
}

fn api_lines(item: &Item) -> Vec<String> {
    let mut out = Vec::new();
    match item {
        Item::Fn(f) if is_pub(&f.vis) => {
            out.push(format!("pub {}", tidy(&f.sig.to_token_stream().to_string())));
        }
        Item::Struct(s) if is_pub(&s.vis) => {
            let mut s = s.clone();
            s.attrs.retain(keep_attr);
            for field in s.fields.iter_mut() {
                field.attrs.retain(keep_attr);
            }
            out.push(tidy(&s.to_token_stream().to_string()));
        }
        Item::Enum(e) if is_pub(&e.vis) => {
            let mut e = e.clone();
            e.attrs.retain(keep_attr);
            for v in e.variants.iter_mut() {
                v.attrs.retain(keep_attr);
                for field in v.fields.iter_mut() {
                    field.attrs.retain(keep_attr);
                }
            }
            out.push(tidy(&e.to_token_stream().to_string()));
        }
        Item::Type(t) if is_pub(&t.vis) => {
            let mut t = t.clone();
            t.attrs.clear();
            out.push(tidy(&t.to_token_stream().to_string()));
        }
        Item::Const(c) if is_pub(&c.vis) => {
            out.push(tidy(&format!(
                "pub const {}: {}",
                c.ident,
                c.ty.to_token_stream()
            )));
        }
        Item::Static(s) if is_pub(&s.vis) => {
            out.push(tidy(&format!(
                "pub static {}: {}",
                s.ident,
                s.ty.to_token_stream()
            )));
        }
        Item::Trait(t) if is_pub(&t.vis) => {
            let mut t = t.clone();
            t.attrs.clear();
            for ti in t.items.iter_mut() {
                if let syn::TraitItem::Fn(f) = ti {
                    f.attrs.clear();
                    f.default = None;
                    f.semi_token = Some(Default::default());
                }
            }
            out.push(tidy(&t.to_token_stream().to_string()));
        }
        Item::Use(u) if is_pub(&u.vis) => {
            let mut u = u.clone();
            u.attrs.clear();
            out.push(tidy(&u.to_token_stream().to_string()));
        }
        Item::Mod(m) if is_pub(&m.vis) && m.content.is_none() => {
            out.push(format!("pub mod {}", m.ident));
        }
        Item::Impl(i) => {
            let header = match &i.trait_ {
                Some((_, p, _)) => format!(
                    "impl {} for {}",
                    p.to_token_stream(),
                    i.self_ty.to_token_stream()
                ),
                None => format!("impl {}", i.self_ty.to_token_stream()),
            };
            let header = tidy(&header);
            if i.trait_.is_some() {
                out.push(header.clone());
            }
            for ii in &i.items {
                if let ImplItem::Fn(m) = ii
                    && (i.trait_.is_some() || is_pub(&m.vis))
                {
                    out.push(format!("{} :: {}", header, tidy(&m.sig.to_token_stream().to_string())));
                }
            }
        }
        // `impl_entity!(T)` is the approved declaration form for the Entity trait. It is rendered
        // as the impl it expands to, so the manifest sees the same contract as a literal impl
        // (D12/WP8b). Only this exact macro is recognized; no general macro expansion.
        Item::Macro(m) if is_impl_entity_macro(&m.mac) => {
            if let Ok(ty) = syn::parse2::<Type>(m.mac.tokens.clone()) {
                let header = tidy(&format!("impl Entity for {}", ty.to_token_stream()));
                out.push(header.clone());
                for method in [
                    "fn entity_runtime(&self) -> &EntityRuntimeSlot",
                    "fn entity_runtime_mut(&mut self) -> &EntityRuntimeSlot",
                ] {
                    out.push(format!("{} :: {}", header, tidy(method)));
                }
            }
        }
        _ => {}
    }
    return out;
}

/// Keeps attributes that change the API shape (derives, repr, defaults); drops docs.
fn keep_attr(a: &syn::Attribute) -> bool {
    let p = a.path();
    return p.is_ident("derive") || p.is_ident("repr") || p.is_ident("default") || p.is_ident("non_exhaustive");
}

fn collect_tests(items: &[Item], prefix: &str, out: &mut Vec<String>) {
    for item in items {
        match item {
            Item::Fn(f) if f.attrs.iter().any(|a| a.path().is_ident("test")) => {
                let ignored = f.attrs.iter().any(|a| a.path().is_ident("ignore"));
                let panics = f.attrs.iter().any(|a| a.path().is_ident("should_panic"));
                let mut line = format!("{}{}", prefix, f.sig.ident);
                if ignored {
                    line.push_str(" [ignore]");
                }
                if panics {
                    line.push_str(" [should_panic]");
                }
                out.push(line);
            }
            Item::Mod(m) => {
                if let Some((_, inner)) = &m.content {
                    collect_tests(inner, &format!("{}{}::", prefix, m.ident), out);
                }
            }
            _ => {}
        }
    }
}

/// Normalizes `to_token_stream` spacing into something readable and stable.
fn tidy(s: &str) -> String {
    let mut t = s.split_whitespace().collect::<Vec<_>>().join(" ");
    for (from, to) in [
        (" , ", ", "),
        (" ,", ","),
        (" : ", ": "),
        (" :: ", "::"),
        (":: ", "::"),
        ("& mut ", "&mut "),
        ("& '", "&'"),
        ("& ", "&"),
        (" (", "("),
        ("( ", "("),
        (" )", ")"),
        (" <", "<"),
        ("< ", "<"),
        (" >", ">"),
        ("# [", "#["),
        (" ;", ";"),
        ("[ ", "["),
        (" ]", "]"),
        ("- >", "->"),
        (")->", ") ->"),
    ] {
        while t.contains(from) {
            t = t.replace(from, to);
        }
    }
    return t;
}

pub enum ManifestStatus {
    Same,
    Missing,
    Differs { added: Vec<String>, removed: Vec<String> },
}

pub fn compare(expected_path: &Path, actual: &str) -> ManifestStatus {
    let Ok(expected) = fs::read_to_string(expected_path) else {
        return ManifestStatus::Missing;
    };
    if expected == actual {
        return ManifestStatus::Same;
    }
    let exp: Vec<&str> = expected.lines().collect();
    let act: Vec<&str> = actual.lines().collect();
    let exp_set: std::collections::HashSet<&str> = exp.iter().copied().collect();
    let act_set: std::collections::HashSet<&str> = act.iter().copied().collect();
    let added = act.iter().filter(|l| !exp_set.contains(*l)).map(|s| s.to_string()).collect();
    let removed = exp.iter().filter(|l| !act_set.contains(*l)).map(|s| s.to_string()).collect();
    return ManifestStatus::Differs { added, removed };
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lines(src: &str) -> Vec<String> {
        let file = syn::parse_file(src).unwrap();
        return file.items.iter().flat_map(api_lines).collect();
    }

    #[test]
    fn impl_entity_macro_renders_the_impl_it_expands_to() {
        let literal = lines(
            "impl Entity for Vector2 {\n    fn entity_runtime(&self) -> &EntityRuntimeSlot { return &self.runtime; }\n    fn entity_runtime_mut(&mut self) -> &EntityRuntimeSlot { return &mut self.runtime; }\n}",
        );
        assert_eq!(
            literal,
            vec![
                "impl Entity for Vector2".to_string(),
                "impl Entity for Vector2 :: fn entity_runtime(&self) -> &EntityRuntimeSlot".to_string(),
                "impl Entity for Vector2 :: fn entity_runtime_mut(&mut self) -> &EntityRuntimeSlot".to_string(),
            ]
        );
        assert_eq!(lines("impl_entity!(Vector2);"), literal);
        assert_eq!(lines("flight_entity::impl_entity!(Vector2);"), literal);
    }

    #[test]
    fn unrelated_macros_contribute_nothing_to_the_contract() {
        assert!(lines("some_other_macro!(Vector2);").is_empty());
    }

    #[test]
    fn private_runtime_field_renders_without_pub_for_the_wp8b_diff() {
        let rendered = lines("pub struct Vector2 { runtime: EntityRuntimeSlot, pub x: f32 }");
        assert_eq!(rendered.len(), 1);
        assert!(rendered[0].contains("runtime: EntityRuntimeSlot"));
        assert!(!rendered[0].contains("pub runtime"));
    }
}
