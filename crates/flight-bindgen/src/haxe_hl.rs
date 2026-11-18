use std::collections::BTreeSet;
use std::fmt::Write as _;
use std::fs;
use std::path::Path;

use crate::ffi_surface::{FfiSurface, FieldAccess};
use crate::haxe_common::{
    TypeMethod, build_struct_map, build_type_methods, collect_opaque_types, crate_dir_to_module,
    derive_method_name, field_property_declaration, find_self_param, has_native_ffi_function,
    resolve_ffi_field_access, scalar_to_haxe, to_snake_case, tuple_element_storage,
    write_if_changed,
};
use crate::offsets::FieldOffsets;
use crate::parse::{
    CrateExports, ParamKind, ParsedFn, ParsedStruct, ReturnKind, classify_param, classify_return,
    to_camel_case,
};

const LIB_NAME: &str = "flight";
const PKG: &str = "flight._hl";

pub fn generate(
    crate_exports: &[CrateExports],
    out_dir: &Path,
    field_offsets: &FieldOffsets,
    ffi_surface: Option<&FfiSurface>,
) {
    let hl_dir = out_dir.join("flight").join("_hl");
    let fn_dir = hl_dir.join("_fn");
    fs::create_dir_all(&hl_dir).unwrap();
    fs::create_dir_all(&fn_dir).unwrap();

    let mut all_opaque_types: BTreeSet<String> = BTreeSet::new();
    for crate_export in crate_exports {
        for func in &crate_export.fns {
            collect_opaque_types(func, &mut all_opaque_types);
        }
        for s in &crate_export.structs {
            all_opaque_types.insert(s.name.clone());
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
            ffi_surface,
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
        let module_name = crate_dir_to_module(&crate_export.dir_name, &all_opaque_types);
        let module_output = emit_module_file(&module_name, &crate_export.fns, ffi_surface);
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
    ffi_surface: Option<&FfiSurface>,
) -> String {
    let mut output = String::new();
    writeln!(output, "package {PKG};").unwrap();
    writeln!(output).unwrap();

    let all_fields = parsed_struct.map(|s| &s.fields[..]).unwrap_or(&[]);
    let fields: Vec<_> = all_fields
        .iter()
        .filter_map(|f| {
            let access = if struct_offsets.and_then(|m| m.get(&f.name)).is_some() {
                FieldAccess {
                    get: true,
                    set: true,
                }
            } else {
                resolve_ffi_field_access(ty, f, ffi_surface)
            };
            return (access.get || access.set).then_some((f, access));
        })
        .collect();
    let method_strs = methods
        .map(|ms| emit_methods(ty, ms, ffi_surface))
        .unwrap_or_default();

    if fields.is_empty() && method_strs.is_empty() {
        writeln!(output, "abstract {ty}(hl.Bytes) {{}}").unwrap();
        return output;
    }

    // HashLink natives must be static externs, so fields without a layout offset bind through a
    // private extern class that takes the handle explicitly, mirroring the hxcpp `_Ffi` class.
    let native_fields: Vec<_> = fields
        .iter()
        .filter(|(f, _)| struct_offsets.and_then(|m| m.get(&f.name)).is_none())
        .collect();
    if !native_fields.is_empty() {
        let snake = to_snake_case(ty);
        writeln!(output, "private extern class {ty}_Ffi {{").unwrap();
        for (field, access) in &native_fields {
            let haxe_ty = scalar_to_haxe(&field.ty);
            let haxe_name = to_camel_case(&field.name);
            if access.get {
                writeln!(
                    output,
                    "\t@:hlNative(\"{LIB_NAME}\", \"flight_get_{snake}_{}\")",
                    field.name
                )
                .unwrap();
                writeln!(
                    output,
                    "\tstatic function get_{haxe_name}(ptr:hl.Bytes):{haxe_ty};"
                )
                .unwrap();
            }
            if access.set {
                writeln!(
                    output,
                    "\t@:hlNative(\"{LIB_NAME}\", \"flight_set_{snake}_{}\")",
                    field.name
                )
                .unwrap();
                writeln!(
                    output,
                    "\tstatic function set_{haxe_name}(ptr:hl.Bytes, value:{haxe_ty}):{haxe_ty};"
                )
                .unwrap();
            }
        }
        writeln!(output, "}}").unwrap();
        writeln!(output).unwrap();
    }

    writeln!(output, "abstract {ty}(hl.Bytes) {{").unwrap();

    for (field, access) in &fields {
        let haxe_ty = scalar_to_haxe(&field.ty);
        let haxe_name = to_camel_case(&field.name);
        let offset = struct_offsets.and_then(|m| m.get(&field.name).copied());

        writeln!(
            output,
            "\t{}",
            field_property_declaration(&haxe_name, haxe_ty, *access)
        )
        .unwrap();
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
            let ffi_class = format!("{ty}_Ffi");
            if access.get {
                writeln!(
                    output,
                    "\tinline function get_{haxe_name}():{haxe_ty} return {ffi_class}.get_{haxe_name}(this);"
                )
                .unwrap();
                writeln!(output).unwrap();
            }
            if access.set {
                writeln!(
                    output,
                    "\tinline function set_{haxe_name}(value:{haxe_ty}):{haxe_ty} {{ {ffi_class}.set_{haxe_name}(this, value); return value; }}"
                )
                .unwrap();
            }
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
        "isize" | "usize" => format!("this.getI32({offset})"),
        "i64" | "u64" => {
            let hi_offset = offset + 4;
            format!("haxe.Int64.make(this.getI32({hi_offset}), this.getI32({offset}))")
        }
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
        "isize" | "usize" => format!("this.setI32({offset}, value)"),
        "i64" | "u64" => {
            let hi_offset = offset + 4;
            format!("{{ this.setI32({offset}, value.low); this.setI32({hi_offset}, value.high); }}")
        }
        _ => format!("this.setI32({offset}, value)"),
    }
}

fn emit_methods(
    ty: &str,
    methods: &[TypeMethod<'_>],
    ffi_surface: Option<&FfiSurface>,
) -> Vec<String> {
    let mut out = Vec::new();
    let mut seen_names: BTreeSet<String> = BTreeSet::new();

    for tm in methods {
        if !has_native_ffi_function(&tm.func.name, ffi_surface) {
            continue;
        }
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

        if Some(i) == self_index {
            call_args.push("cast this".to_string());
        } else {
            let pname = to_camel_case(&param.name);
            match &kind {
                ParamKind::SliceConst(_)
                | ParamKind::SliceMut(_)
                | ParamKind::OptionSliceConst(_)
                | ParamKind::OptionSliceMut(_)
                | ParamKind::BoxSlice(_) => {
                    method_params.push(format!("{pname}:hl.Bytes"));
                    method_params.push(format!("{pname}Len:Int"));
                    call_args.push(pname.clone());
                    call_args.push(format!("{pname}Len"));
                }
                ParamKind::FixedArrayConst(_, _) | ParamKind::FixedArrayMut(_, _) => {
                    method_params.push(format!("{pname}:hl.Bytes"));
                    call_args.push(pname);
                }
                ParamKind::Closure | ParamKind::OptionClosure => {
                    method_params.push(format!("{pname}Fn:hl.Bytes"));
                    method_params.push(format!("{pname}Ctx:hl.Bytes"));
                    call_args.push(format!("{pname}Fn"));
                    call_args.push(format!("{pname}Ctx"));
                }
                _ => {
                    let haxe_ty = param_kind_to_haxe(&kind);
                    method_params.push(format!("{pname}:{haxe_ty}"));
                    call_args.push(pname);
                }
            }
        }
    }

    let ret_kind = match &func.ret {
        None => ReturnKind::Void,
        Some(ret_ty) => classify_return(ret_ty)?,
    };
    // Tuple results need out-parameter locals; the module-level dispatch function provides them.
    if matches!(ret_kind, ReturnKind::Tuple(_) | ReturnKind::OptionTuple(_)) {
        return None;
    }
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

fn emit_module_file(
    module_name: &str,
    fns: &[ParsedFn],
    ffi_surface: Option<&FfiSurface>,
) -> String {
    let mut emitted: Vec<String> = Vec::new();
    for func in fns {
        if !has_native_ffi_function(&func.name, ffi_surface) {
            continue;
        }
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

pub(crate) fn emit_function(func: &ParsedFn) -> Option<String> {
    let ffi_name = format!("flight_{}", func.name);
    let haxe_name = to_camel_case(&func.name);

    let mut haxe_params = Vec::new();
    for param in &func.params {
        let kind = classify_param(&param.ty)?;
        let pname = to_camel_case(&param.name);
        match &kind {
            ParamKind::SliceConst(_)
            | ParamKind::SliceMut(_)
            | ParamKind::OptionSliceConst(_)
            | ParamKind::OptionSliceMut(_)
            | ParamKind::BoxSlice(_) => {
                haxe_params.push(format!("{pname}:hl.Bytes"));
                haxe_params.push(format!("{pname}Len:Int"));
            }
            ParamKind::FixedArrayConst(_, _) | ParamKind::FixedArrayMut(_, _) => {
                haxe_params.push(format!("{pname}:hl.Bytes"));
            }
            ParamKind::Closure | ParamKind::OptionClosure => {
                haxe_params.push(format!("{pname}Fn:hl.Bytes"));
                haxe_params.push(format!("{pname}Ctx:hl.Bytes"));
            }
            _ => {
                let haxe_ty = param_kind_to_haxe(&kind);
                haxe_params.push(format!("{pname}:{haxe_ty}"));
            }
        }
    }

    let ret_kind = match &func.ret {
        None => ReturnKind::Void,
        Some(ty) => classify_return(ty)?,
    };
    let haxe_ret = return_kind_to_haxe(&ret_kind);
    if let ReturnKind::Tuple(elements) | ReturnKind::OptionTuple(elements) = &ret_kind {
        for (index, element) in elements.iter().enumerate() {
            let storage = tuple_element_storage(element)?.0;
            haxe_params.push(format!("out{index}:hl.Ref<{storage}>"));
        }
    }

    let params_str = haxe_params.join(", ");
    Some(format!(
        "\t@:hlNative(\"{LIB_NAME}\", \"{ffi_name}\")\n\tpublic static function {haxe_name}({params_str}):{haxe_ret};"
    ))
}

fn param_kind_to_haxe(kind: &ParamKind) -> String {
    match kind {
        ParamKind::Scalar(ty) => scalar_to_haxe(ty).to_string(),
        ParamKind::RefConst(ty) | ParamKind::OptionRefConst(ty) => format!("{PKG}.{ty}"),
        ParamKind::RefMut(ty) | ParamKind::OptionRefMut(ty) => format!("{PKG}.{ty}"),
        ParamKind::ArcRef | ParamKind::ArcRefMut => "hl.Bytes".to_string(),
        ParamKind::OptionF32 => "Single".to_string(),
        ParamKind::OptionF64 => "Float".to_string(),
        ParamKind::OptionI32 => "Int".to_string(),
        ParamKind::OptionBool => "Int".to_string(),
        ParamKind::StrRef
        | ParamKind::StringParam
        | ParamKind::OptionStr
        | ParamKind::OptionStringParam => "hl.Bytes".to_string(),
        ParamKind::SliceConst(_)
        | ParamKind::SliceMut(_)
        | ParamKind::OptionSliceConst(_)
        | ParamKind::OptionSliceMut(_) => "hl.Bytes".to_string(),
        ParamKind::FixedArrayConst(_, _) | ParamKind::FixedArrayMut(_, _) => "hl.Bytes".to_string(),
        ParamKind::Enum(_) => "Int".to_string(),
        ParamKind::DynOpaque(_) => "hl.Bytes".to_string(),
        ParamKind::DynMono(ty) => format!("{PKG}.{ty}"),
        ParamKind::VecMut(_) | ParamKind::VecConst(_) | ParamKind::VecOwned(_) => {
            "hl.Bytes".to_string()
        }
        ParamKind::Closure | ParamKind::OptionClosure => "hl.Bytes".to_string(),
        ParamKind::BoxSlice(_) => "hl.Bytes".to_string(),
    }
}

fn return_kind_to_haxe(kind: &ReturnKind) -> String {
    match kind {
        ReturnKind::Void => "Void".to_string(),
        ReturnKind::Scalar(ty) => scalar_to_haxe(ty).to_string(),
        ReturnKind::Struct(ty) => format!("{PKG}.{ty}"),
        ReturnKind::StringReturn | ReturnKind::OptionString => "hl.Bytes".to_string(),
        ReturnKind::ArcRefReturn | ReturnKind::OptionArcRefReturn => "hl.Bytes".to_string(),
        ReturnKind::Enum(_) => "Int".to_string(),
        ReturnKind::VecReturn(_) | ReturnKind::OptionVecReturn(_) => "hl.Bytes".to_string(),
        ReturnKind::BoxSliceReturn(_) | ReturnKind::OptionBoxSliceReturn(_) => {
            "hl.Bytes".to_string()
        }
        ReturnKind::FixedArrayReturn(_, _) => "hl.Bytes".to_string(),
        ReturnKind::OptionStruct(ty) => format!("{PKG}.{ty}"),
        ReturnKind::Tuple(_) => "Void".to_string(),
        ReturnKind::OptionTuple(_) => "Bool".to_string(),
    }
}

#[cfg(test)]
mod hl_tuple_tests {
    use super::*;
    use crate::parse::random_gaussian_pair_fixture;
    #[test]
    fn scalar_tuple_return_becomes_trailing_out_parameters() {
        assert_eq!(
            emit_function(&random_gaussian_pair_fixture()).unwrap(),
            "\t@:hlNative(\"flight\", \"flight_random_gaussian_pair\")\n\tpublic static function randomGaussianPair(randomFn:hl.Bytes, randomCtx:hl.Bytes, mean:Single, standardDeviation:Single, out0:hl.Ref<Single>, out1:hl.Ref<Single>):Void;"
        );
    }
    #[test]
    fn optional_tuple_returns_presence_with_the_same_out_parameters() {
        let mut function = random_gaussian_pair_fixture();
        function.ret = Some("Option<(f64, f64)>".into());
        let text = emit_function(&function).unwrap();
        assert!(
            text.ends_with(", out0:hl.Ref<Float>, out1:hl.Ref<Float>):Bool;"),
            "{text}"
        );
    }
    #[test]
    fn tuple_without_exact_width_storage_is_declined() {
        let mut function = random_gaussian_pair_fixture();
        function.ret = Some("(i64, i64)".into());
        assert!(emit_function(&function).is_none());
    }
    #[test]
    fn native_accessors_bind_only_directions_with_accessor_shape() {
        let surface = crate::ffi_surface::FfiSurface {
            c: crate::ffi_surface::parse_ffi_header(
                "float flight_get_audio_bus_gain(void * arg0);\n\
                 float flight_set_audio_bus_gain(void * arg0, void * arg1, void * arg2, float arg3);\n\
                 bool flight_get_audio_bus_muted(void * arg0);\n\
                 bool flight_set_audio_bus_muted(void * arg0, bool arg1);\n\
                 float flight_get_audio_bus_pan(void * arg0, void * arg1);",
            ),
            hl: crate::ffi_surface::parse_hl_primitives(
                "DEFINE_PRIM(_F32, flight_get_audio_bus_gain, _BYTES);\n\
                 DEFINE_PRIM(_F32, flight_set_audio_bus_gain, _BYTES _BYTES _BYTES _F32);\n\
                 DEFINE_PRIM(_BOOL, flight_get_audio_bus_muted, _BYTES);\n\
                 DEFINE_PRIM(_BOOL, flight_set_audio_bus_muted, _BYTES _BOOL);\n\
                 DEFINE_PRIM(_F32, flight_get_audio_bus_pan, _BYTES _BYTES);",
            ),
            native_skips: BTreeSet::new(),
        };
        let audio_bus = ParsedStruct {
            name: "AudioBus".into(),
            fields: ["gain", "muted", "pan"]
                .iter()
                .map(|name| crate::parse::StructField {
                    name: name.to_string(),
                    ty: if *name == "muted" { "bool" } else { "f32" }.into(),
                })
                .collect(),
        };
        let text = emit_type_file("AudioBus", Some(&audio_bus), None, None, Some(&surface));
        assert!(
            text.contains("public var gain(get, never):Single;"),
            "{text}"
        );
        assert!(text.contains("\"flight_get_audio_bus_gain\""), "{text}");
        assert!(!text.contains("flight_set_audio_bus_gain"), "{text}");
        assert!(text.contains("public var muted(get, set):Bool;"), "{text}");
        assert!(text.contains("\"flight_set_audio_bus_muted\""), "{text}");
        assert!(!text.contains("pan"), "{text}");
    }
}
