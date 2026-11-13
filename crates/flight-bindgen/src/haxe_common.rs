use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::Path;

use crate::parse::{
    CrateExports, ParamKind, ParsedFn, ParsedStruct, ReturnKind, classify_param, classify_return,
    to_camel_case, to_pascal_case,
};

pub struct TypeMethod<'a> {
    pub func: &'a ParsedFn,
    pub module: String,
}

pub fn collect_opaque_types(func: &ParsedFn, types: &mut BTreeSet<String>) {
    for param in &func.params {
        if let Some(kind) = classify_param(&param.ty) {
            match kind {
                ParamKind::RefConst(ty)
                | ParamKind::RefMut(ty)
                | ParamKind::OptionRefConst(ty)
                | ParamKind::OptionRefMut(ty) => {
                    types.insert(ty);
                }
                _ => {}
            }
        }
    }
    if let Some(ref ret) = func.ret {
        if let Some(ReturnKind::Struct(ty)) = classify_return(ret) {
            types.insert(ty);
        }
    }
}

pub fn build_struct_map<'a>(
    crate_exports: &'a [CrateExports],
) -> BTreeMap<String, &'a ParsedStruct> {
    let mut map = BTreeMap::new();
    for crate_export in crate_exports {
        for s in &crate_export.structs {
            map.entry(s.name.clone()).or_insert(s);
        }
    }
    map
}

pub fn build_type_methods<'a>(
    crate_exports: &'a [CrateExports],
    known_types: &BTreeSet<String>,
) -> BTreeMap<String, Vec<TypeMethod<'a>>> {
    let mut map: BTreeMap<String, Vec<TypeMethod<'a>>> = BTreeMap::new();
    for crate_export in crate_exports {
        let module = crate_dir_to_module(&crate_export.dir_name);
        for func in &crate_export.fns {
            if let Some(ty) =
                match_function_to_type(&func.name, &func.params, &func.ret, known_types)
            {
                map.entry(ty).or_default().push(TypeMethod {
                    func,
                    module: module.clone(),
                });
            }
        }
    }
    map
}

fn match_function_to_type(
    fn_name: &str,
    params: &[crate::parse::Param],
    ret: &Option<String>,
    known_types: &BTreeSet<String>,
) -> Option<String> {
    let type_lower_in_name = |ty: &str| -> bool {
        let tl = ty.to_lowercase();
        let suffix = format!("_{tl}");
        let mid = format!("_{tl}_");
        fn_name.ends_with(&suffix) || fn_name.contains(&mid)
    };

    for param in params {
        if let Some(kind) = classify_param(&param.ty) {
            let ty_name = match &kind {
                ParamKind::RefConst(ty)
                | ParamKind::RefMut(ty)
                | ParamKind::OptionRefConst(ty)
                | ParamKind::OptionRefMut(ty) => ty,
                _ => continue,
            };
            if known_types.contains(ty_name)
                && type_lower_in_name(ty_name)
                && derive_method_name(fn_name, ty_name).is_some()
            {
                return Some(ty_name.clone());
            }
        }
    }
    if let Some(ret_ty) = ret {
        if let Some(ReturnKind::Struct(ty_name)) = classify_return(ret_ty) {
            if known_types.contains(&ty_name)
                && fn_name.starts_with("create_")
                && type_lower_in_name(&ty_name)
                && derive_method_name(fn_name, &ty_name).is_some()
            {
                return Some(ty_name);
            }
        }
    }
    None
}

pub fn derive_method_name(fn_name: &str, type_name: &str) -> Option<String> {
    let type_lower = type_name.to_lowercase();
    let suffix = format!("_{type_lower}");

    if fn_name.ends_with(&suffix) {
        let prefix = &fn_name[..fn_name.len() - suffix.len()];
        if prefix.is_empty() {
            return None;
        }
        return Some(to_camel_case(prefix));
    }

    let mid = format!("_{type_lower}_");
    if let Some(pos) = fn_name.find(&mid) {
        let before = &fn_name[..pos];
        let after = &fn_name[pos + mid.len()..];
        let combined = if before.is_empty() {
            after.to_string()
        } else if after.is_empty() {
            before.to_string()
        } else {
            format!("{before}_{after}")
        };
        if combined.is_empty() {
            return None;
        }
        return Some(to_camel_case(&combined));
    }

    None
}

pub fn find_self_param(func: &ParsedFn, ty: &str) -> Option<usize> {
    for (i, param) in func.params.iter().enumerate() {
        if let Some(kind) = classify_param(&param.ty) {
            match &kind {
                ParamKind::RefConst(t)
                | ParamKind::RefMut(t)
                | ParamKind::OptionRefConst(t)
                | ParamKind::OptionRefMut(t)
                    if t == ty =>
                {
                    return Some(i);
                }
                _ => {}
            }
        }
    }
    None
}

pub fn crate_dir_to_module(dir_name: &str) -> String {
    let stripped = dir_name.strip_prefix("flight-").unwrap_or(dir_name);
    to_pascal_case(stripped)
}

pub fn scalar_to_haxe(ty: &str) -> &str {
    match ty {
        "f32" => "Single",
        "f64" => "Float",
        "bool" => "Bool",
        "i8" | "i16" | "i32" | "isize" => "Int",
        "u8" | "u16" | "u32" | "usize" => "Int",
        "i64" | "u64" => "haxe.Int64",
        _ => "Dynamic",
    }
}

pub fn to_snake_case(s: &str) -> String {
    let mut out = String::new();
    let chars: Vec<char> = s.chars().collect();
    for (i, &c) in chars.iter().enumerate() {
        if c.is_uppercase() && i > 0 && !chars[i - 1].is_uppercase() && chars[i - 1] != '_' {
            out.push('_');
        }
        out.push(c.to_ascii_lowercase());
    }
    out
}

pub fn has_ffi_function(fn_name: &str, ffi_names: Option<&BTreeSet<String>>) -> bool {
    match ffi_names {
        None => true,
        Some(names) => {
            let ffi_name = format!("flight_{fn_name}");
            names.contains(&ffi_name)
        }
    }
}

pub fn has_ffi_accessor(
    type_name: &str,
    field_name: &str,
    ffi_names: Option<&BTreeSet<String>>,
) -> bool {
    match ffi_names {
        None => true,
        Some(names) => {
            let snake = to_snake_case(type_name);
            let getter = format!("flight_get_{snake}_{field_name}");
            names.contains(&getter)
        }
    }
}

pub fn write_if_changed(path: &Path, content: &str) {
    if let Ok(existing) = fs::read_to_string(path) {
        if existing == content {
            return;
        }
    }
    fs::write(path, content).unwrap();
}
