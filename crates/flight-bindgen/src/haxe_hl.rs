use std::collections::BTreeSet;
use std::fmt::Write as _;
use std::fs;
use std::path::Path;

use crate::haxe_common::{
    TypeMethod, build_struct_map, build_type_methods, collect_opaque_types, crate_dir_to_module,
    derive_method_name, find_self_param, scalar_to_haxe, to_snake_case, write_if_changed,
};
use crate::offsets::FieldOffsets;
use crate::parse::{
    CrateExports, ParamKind, ParsedFn, ParsedStruct, ReturnKind, classify_param, classify_return,
    to_camel_case,
};

const LIB_NAME: &str = "flight";
const PKG: &str = "flight._hl";

pub fn generate(crate_exports: &[CrateExports], out_dir: &Path, field_offsets: &FieldOffsets) {
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

    let struct_map = build_struct_map(crate_exports);
    let type_methods = build_type_methods(crate_exports, &all_opaque_types);

    let mut total_files = 0usize;
    let mut types_with_fields = 0usize;
    let mut types_with_methods = 0usize;
    let mut total_methods = 0usize;
    for ty in &all_opaque_types {
        let parsed_struct = struct_map.get(ty.as_str()).copied();
        let methods = type_methods.get(ty.as_str());
        let struct_offsets = field_offsets.get(ty.as_str());
        let type_output = emit_type_file(
            ty,
            parsed_struct,
            methods.map(|v| v.as_slice()),
            struct_offsets,
        );
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

fn emit_type_file(
    ty: &str,
    parsed_struct: Option<&ParsedStruct>,
    methods: Option<&[TypeMethod<'_>]>,
    struct_offsets: Option<&std::collections::BTreeMap<String, usize>>,
) -> String {
    let mut output = String::new();
    writeln!(output, "package {PKG};").unwrap();
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
        let offset = struct_offsets.and_then(|m| m.get(&field.name).copied());

        writeln!(output, "\tpublic var {haxe_name}(get, set):{haxe_ty};").unwrap();
        writeln!(output).unwrap();

        if let Some(off) = offset {
            let getter = hl_bytes_getter(&field.ty, off);
            let setter_write = hl_bytes_setter(&field.ty, off);
            writeln!(
                output,
                "\tinline function get_{haxe_name}():{haxe_ty} return {getter};"
            )
            .unwrap();
            writeln!(output).unwrap();
            writeln!(
                output,
                "\tinline function set_{haxe_name}(value:{haxe_ty}):{haxe_ty} {{ {setter_write}; return value; }}"
            )
            .unwrap();
        } else {
            let getter_ffi = format!("flight_get_{}_{}", to_snake_case(ty), field.name);
            let setter_ffi = format!("flight_set_{}_{}", to_snake_case(ty), field.name);
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

fn hl_bytes_getter(rust_ty: &str, offset: usize) -> String {
    match rust_ty {
        "f32" => format!("this.getF32({offset})"),
        "f64" => format!("this.getF64({offset})"),
        "bool" => format!("this.getUI8({offset}) != 0"),
        "u8" | "i8" => format!("this.getUI8({offset})"),
        "u16" | "i16" => format!("this.getUI16({offset})"),
        "i32" | "u32" => format!("this.getI32({offset})"),
        "i64" | "u64" | "isize" | "usize" => format!("this.getI64({offset})"),
        _ => format!("this.getI32({offset})"),
    }
}

fn hl_bytes_setter(rust_ty: &str, offset: usize) -> String {
    match rust_ty {
        "f32" => format!("this.setF32({offset}, value)"),
        "f64" => format!("this.setF64({offset}, value)"),
        "bool" => format!("this.setUI8({offset}, value ? 1 : 0)"),
        "u8" | "i8" => format!("this.setUI8({offset}, value)"),
        "u16" | "i16" => format!("this.setUI16({offset}, value)"),
        "i32" | "u32" => format!("this.setI32({offset}, value)"),
        "i64" | "u64" | "isize" | "usize" => format!("this.setI64({offset}, value)"),
        _ => format!("this.setI32({offset}, value)"),
    }
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

    let call = format!("{PKG}._fn.{module}.{haxe_fn_name}({args_str})");
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
    writeln!(output, "package {PKG}._fn;").unwrap();
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
    Some(format!(
        "\t@:hlNative(\"{LIB_NAME}\", \"{ffi_name}\")\n\tpublic static function {haxe_name}({params_str}):{haxe_ret};"
    ))
}

fn param_kind_to_haxe(kind: &ParamKind) -> String {
    match kind {
        ParamKind::Scalar(ty) => scalar_to_haxe(ty).to_string(),
        ParamKind::RefConst(ty) => format!("{PKG}.{ty}"),
        ParamKind::RefMut(ty) => format!("{PKG}.{ty}"),
        ParamKind::OptionF32 => "Single".to_string(),
    }
}

fn return_kind_to_haxe(kind: &ReturnKind) -> String {
    match kind {
        ReturnKind::Void => "Void".to_string(),
        ReturnKind::Scalar(ty) => scalar_to_haxe(ty).to_string(),
        ReturnKind::Struct(ty) => format!("{PKG}.{ty}"),
        ReturnKind::StringReturn => "hl.Bytes".to_string(),
    }
}
