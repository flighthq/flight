use std::collections::{BTreeMap, BTreeSet};
use std::fmt::Write as _;
use std::fs;
use std::path::Path;

use crate::parse::{
    CrateExports, ParamKind, ParsedFn, ParsedStruct, ReturnKind, classify_param, classify_return,
    to_camel_case, to_pascal_case,
};

const LIB_NAME: &str = "flight";

struct TypeMethod<'a> {
    func: &'a ParsedFn,
    module: String,
}

pub fn generate(crate_exports: &[CrateExports], out_dir: &Path) {
    let hl_dir = out_dir.join("flight").join("_hl");
    let fn_dir = hl_dir.join("_fn");
    fs::create_dir_all(&hl_dir).unwrap();
    fs::create_dir_all(&fn_dir).unwrap();

    let mut all_opaque_types: BTreeSet<String> = BTreeSet::new();
    for crate_export in crate_exports {
        for func in &crate_export.fns {
            collect_opaque_types(func, &mut all_opaque_types);
        }
    }

    let mut struct_map: BTreeMap<String, &ParsedStruct> = BTreeMap::new();
    for crate_export in crate_exports {
        for s in &crate_export.structs {
            struct_map.entry(s.name.clone()).or_insert(s);
        }
    }

    let type_methods = build_type_methods(crate_exports, &all_opaque_types);

    let mut total_files = 0usize;
    let mut types_with_fields = 0usize;
    let mut types_with_methods = 0usize;
    let mut total_methods = 0usize;
    for ty in &all_opaque_types {
        let parsed_struct = struct_map.get(ty.as_str()).copied();
        let methods = type_methods.get(ty.as_str());
        let type_output = emit_type_file(ty, parsed_struct, methods.map(|v| v.as_slice()));
        let type_path = hl_dir.join(format!("{ty}.hx"));
        write_if_changed(&type_path, &type_output);
        total_files += 1;
        if parsed_struct.is_some_and(|s| !s.fields.is_empty()) {
            types_with_fields += 1;
        }
        if let Some(m) = methods {
            if !m.is_empty() {
                types_with_methods += 1;
                total_methods += m.len();
            }
        }
    }

    let mut total_fns = 0usize;
    for crate_export in crate_exports {
        let module_name = crate_dir_to_module(&crate_export.dir_name);
        let module_output = emit_module_file(&module_name, &crate_export.fns);
        if !module_output.is_empty() {
            let module_path = fn_dir.join(format!("{module_name}.hx"));
            write_if_changed(&module_path, &module_output);
            total_fns += crate_export.fns.len();
            total_files += 1;
        }
    }

    eprintln!(
        "wrote {total_files} files ({total_fns} functions, {} types, {types_with_fields} with fields, {types_with_methods} with methods, {total_methods} methods) to {}",
        all_opaque_types.len(),
        hl_dir.display()
    );
}

fn build_type_methods<'a>(
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
                ParamKind::RefConst(ty) | ParamKind::RefMut(ty) => ty,
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

fn derive_method_name(fn_name: &str, type_name: &str) -> Option<String> {
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

fn crate_dir_to_module(dir_name: &str) -> String {
    let stripped = dir_name.strip_prefix("flight-").unwrap_or(dir_name);
    to_pascal_case(stripped)
}

fn emit_type_file(
    ty: &str,
    parsed_struct: Option<&ParsedStruct>,
    methods: Option<&[TypeMethod<'_>]>,
) -> String {
    let mut output = String::new();
    writeln!(output, "package flight._hl;").unwrap();
    writeln!(output).unwrap();

    let fields = parsed_struct.map(|s| &s.fields[..]).unwrap_or(&[]);
    let method_strs = methods.map(|ms| emit_methods(ty, ms)).unwrap_or_default();

    if fields.is_empty() && method_strs.is_empty() {
        writeln!(output, "abstract {ty}(hl.Bytes) {{}}").unwrap();
        return output;
    }

    writeln!(output, "abstract {ty}(hl.Bytes) {{").unwrap();

    for field in fields {
        let haxe_ty = scalar_to_haxe(&field.ty);
        let haxe_name = to_camel_case(&field.name);
        let getter_ffi = format!("flight_get_{}_{}", to_snake_case(ty), field.name);
        let setter_ffi = format!("flight_set_{}_{}", to_snake_case(ty), field.name);

        writeln!(output, "\tpublic var {haxe_name}(get, set):{haxe_ty};").unwrap();
        writeln!(output).unwrap();
        writeln!(output, "\t@:hlNative(\"{LIB_NAME}\", \"{getter_ffi}\")").unwrap();
        writeln!(output, "\tfunction get_{haxe_name}():{haxe_ty};").unwrap();
        writeln!(output).unwrap();
        writeln!(output, "\t@:hlNative(\"{LIB_NAME}\", \"{setter_ffi}\")").unwrap();
        writeln!(
            output,
            "\tfunction set_{haxe_name}(value:{haxe_ty}):{haxe_ty};"
        )
        .unwrap();
    }

    if !fields.is_empty() && !method_strs.is_empty() {
        writeln!(output).unwrap();
    }

    for method_str in &method_strs {
        writeln!(output, "{method_str}").unwrap();
    }

    writeln!(output, "}}").unwrap();
    output
}

fn emit_methods(ty: &str, methods: &[TypeMethod<'_>]) -> Vec<String> {
    let mut out = Vec::new();
    let mut seen_names: BTreeSet<String> = BTreeSet::new();

    for tm in methods {
        if let Some(method) = emit_one_method(ty, tm) {
            let method_name = derive_method_name(&tm.func.name, ty).unwrap_or_default();
            if seen_names.insert(method_name) {
                out.push(method);
            }
        }
    }
    out
}

fn emit_one_method(ty: &str, tm: &TypeMethod<'_>) -> Option<String> {
    let func = tm.func;
    let method_name = derive_method_name(&func.name, ty)?;
    let haxe_fn_name = to_camel_case(&func.name);

    let self_index = find_self_param(func, ty);
    let is_static = self_index.is_none();

    let mut method_params = Vec::new();
    let mut call_args = Vec::new();

    for (i, param) in func.params.iter().enumerate() {
        let kind = classify_param(&param.ty)?;
        let haxe_ty = param_kind_to_haxe(&kind);

        if Some(i) == self_index {
            call_args.push("cast this".to_string());
        } else {
            let pname = to_camel_case(&param.name);
            method_params.push(format!("{pname}:{haxe_ty}"));
            call_args.push(pname);
        }
    }

    let ret_kind = match &func.ret {
        None => ReturnKind::Void,
        Some(ret_ty) => classify_return(ret_ty)?,
    };
    let haxe_ret = return_kind_to_haxe(&ret_kind);

    let params_str = method_params.join(", ");
    let args_str = call_args.join(", ");
    let module = &tm.module;

    let call = format!("flight._hl._fn.{module}.{haxe_fn_name}({args_str})");
    let body = if matches!(ret_kind, ReturnKind::Void) {
        call
    } else {
        format!("return {call}")
    };

    let static_kw = if is_static { "static " } else { "" };

    Some(format!(
        "\t{static_kw}inline public function {method_name}({params_str}):{haxe_ret} {{\n\t\t{body};\n\t}}"
    ))
}

fn find_self_param(func: &ParsedFn, ty: &str) -> Option<usize> {
    for (i, param) in func.params.iter().enumerate() {
        if let Some(kind) = classify_param(&param.ty) {
            match &kind {
                ParamKind::RefConst(t) | ParamKind::RefMut(t) if t == ty => {
                    return Some(i);
                }
                _ => {}
            }
        }
    }
    None
}

fn emit_module_file(module_name: &str, fns: &[ParsedFn]) -> String {
    let mut emitted: Vec<String> = Vec::new();
    for func in fns {
        if let Some(decl) = emit_function(func) {
            emitted.push(decl);
        }
    }
    if emitted.is_empty() {
        return String::new();
    }

    let mut output = String::new();
    writeln!(output, "package flight._hl._fn;").unwrap();
    writeln!(output).unwrap();
    writeln!(output, "extern class {module_name} {{").unwrap();
    for decl in &emitted {
        writeln!(output, "{decl}").unwrap();
    }
    writeln!(output, "}}").unwrap();
    output
}

fn emit_function(func: &ParsedFn) -> Option<String> {
    let ffi_name = format!("flight_{}", func.name);
    let haxe_name = to_camel_case(&func.name);

    let mut haxe_params = Vec::new();
    for param in &func.params {
        let kind = classify_param(&param.ty)?;
        let haxe_ty = param_kind_to_haxe(&kind);
        haxe_params.push(format!("{}:{}", to_camel_case(&param.name), haxe_ty));
    }

    let ret_kind = match &func.ret {
        None => ReturnKind::Void,
        Some(ty) => classify_return(ty)?,
    };
    let haxe_ret = return_kind_to_haxe(&ret_kind);

    let params_str = haxe_params.join(", ");
    return Some(format!(
        "\t@:hlNative(\"{LIB_NAME}\", \"{ffi_name}\")\n\tpublic static function {haxe_name}({params_str}):{haxe_ret};"
    ));
}

fn param_kind_to_haxe(kind: &ParamKind) -> String {
    match kind {
        ParamKind::Scalar(ty) => scalar_to_haxe(ty).to_string(),
        ParamKind::RefConst(ty) => format!("flight._hl.{ty}"),
        ParamKind::RefMut(ty) => format!("flight._hl.{ty}"),
        ParamKind::OptionF32 => "Single".to_string(),
    }
}

fn return_kind_to_haxe(kind: &ReturnKind) -> String {
    match kind {
        ReturnKind::Void => "Void".to_string(),
        ReturnKind::Scalar(ty) => scalar_to_haxe(ty).to_string(),
        ReturnKind::Struct(ty) => format!("flight._hl.{ty}"),
        ReturnKind::StringReturn => "hl.Bytes".to_string(),
    }
}

fn scalar_to_haxe(ty: &str) -> &str {
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

fn collect_opaque_types(func: &ParsedFn, types: &mut BTreeSet<String>) {
    for param in &func.params {
        if let Some(kind) = classify_param(&param.ty) {
            match kind {
                ParamKind::RefConst(ty) | ParamKind::RefMut(ty) => {
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

fn to_snake_case(s: &str) -> String {
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

fn write_if_changed(path: &Path, content: &str) {
    if let Ok(existing) = fs::read_to_string(path) {
        if existing == content {
            return;
        }
    }
    fs::write(path, content).unwrap();
}
