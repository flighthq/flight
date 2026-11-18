use std::collections::BTreeSet;
use std::fmt::Write as _;
use std::fs;
use std::path::Path;

use crate::ffi_surface::{FfiSurface, FieldAccess};
use crate::haxe_common::{
    TypeMethod, build_struct_map, build_type_methods, collect_opaque_types, crate_dir_to_module,
    derive_method_name, field_property_declaration, find_self_param, has_ffi_function,
    resolve_ffi_field_access, scalar_to_haxe, to_snake_case, tuple_element_storage,
    write_if_changed,
};
use crate::parse::{
    CrateExports, ParamKind, ParsedFn, ParsedStruct, ReturnKind, StructField, classify_param,
    classify_return, to_camel_case,
};

const PKG: &str = "flight._cpp";

pub fn generate(crate_exports: &[CrateExports], out_dir: &Path, ffi_surface: Option<&FfiSurface>) {
    let cpp_dir = out_dir.join("flight").join("_cpp");
    let fn_dir = cpp_dir.join("_fn");
    fs::create_dir_all(&cpp_dir).unwrap();
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
        let type_output = emit_type_file(
            ty,
            parsed_struct,
            methods.map(|v| v.as_slice()),
            ffi_surface,
        );
        let type_path = cpp_dir.join(format!("{ty}.hx"));
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
        cpp_dir.display()
    );
}

fn emit_type_file(
    ty: &str,
    parsed_struct: Option<&ParsedStruct>,
    methods: Option<&[TypeMethod<'_>]>,
    ffi_surface: Option<&FfiSurface>,
) -> String {
    let mut output = String::new();
    writeln!(output, "package {PKG};").unwrap();
    writeln!(output).unwrap();

    let all_fields = parsed_struct.map(|s| &s.fields[..]).unwrap_or(&[]);
    let fields: Vec<_> = all_fields
        .iter()
        .filter_map(|f| {
            let access = resolve_ffi_field_access(ty, f, ffi_surface);
            return (access.get || access.set).then_some((f, access));
        })
        .collect();
    let method_strs = methods
        .map(|ms| emit_methods(ty, ms, ffi_surface))
        .unwrap_or_default();

    if fields.is_empty() && method_strs.is_empty() {
        writeln!(output, "abstract {ty}(cpp.Star<cpp.Void>) {{}}").unwrap();
        return output;
    }

    if !fields.is_empty() {
        emit_ffi_class(&mut output, ty, &fields);
        writeln!(output).unwrap();
    }

    writeln!(output, "abstract {ty}(cpp.Star<cpp.Void>) {{").unwrap();

    for (field, access) in &fields {
        let haxe_ty = scalar_to_haxe(&field.ty);
        let haxe_name = to_camel_case(&field.name);
        let ffi_class = format!("{ty}_Ffi");

        writeln!(
            output,
            "\t{}",
            field_property_declaration(&haxe_name, haxe_ty, *access)
        )
        .unwrap();
        if access.get {
            writeln!(output).unwrap();
            writeln!(
                output,
                "\tinline function get_{haxe_name}():{haxe_ty} return {ffi_class}.get_{haxe_name}(this);"
            )
            .unwrap();
        }
        if access.set {
            writeln!(output).unwrap();
            writeln!(
                output,
                "\tinline function set_{haxe_name}(value:{haxe_ty}):{haxe_ty} {{ {ffi_class}.set_{haxe_name}(this, value); return value; }}"
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

fn emit_ffi_class(output: &mut String, ty: &str, fields: &[(&StructField, FieldAccess)]) {
    let snake = to_snake_case(ty);
    writeln!(output, "private extern class {ty}_Ffi {{").unwrap();
    for (field, access) in fields {
        let haxe_ty = scalar_to_haxe(&field.ty);
        let haxe_name = to_camel_case(&field.name);
        let getter_ffi = format!("flight_get_{snake}_{}", field.name);
        let setter_ffi = format!("flight_set_{snake}_{}", field.name);

        if access.get {
            writeln!(
                output,
                "\t@:native(\"{getter_ffi}\") static function get_{haxe_name}(ptr:cpp.Star<cpp.Void>):{haxe_ty};"
            )
            .unwrap();
        }
        if access.set {
            writeln!(
                output,
                "\t@:native(\"{setter_ffi}\") static function set_{haxe_name}(ptr:cpp.Star<cpp.Void>, value:{haxe_ty}):{haxe_ty};"
            )
            .unwrap();
        }
    }
    writeln!(output, "}}").unwrap();
}

fn emit_methods(
    ty: &str,
    methods: &[TypeMethod<'_>],
    ffi_surface: Option<&FfiSurface>,
) -> Vec<String> {
    let mut out = Vec::new();
    let mut seen_names: BTreeSet<String> = BTreeSet::new();

    for tm in methods {
        if !has_ffi_function(&tm.func.name, ffi_surface) {
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
                    method_params.push(format!("{pname}:cpp.Star<cpp.Void>"));
                    method_params.push(format!("{pname}Len:Int"));
                    call_args.push(pname.clone());
                    call_args.push(format!("{pname}Len"));
                }
                ParamKind::FixedArrayConst(_, _) | ParamKind::FixedArrayMut(_, _) => {
                    method_params.push(format!("{pname}:cpp.Star<cpp.Void>"));
                    call_args.push(pname);
                }
                ParamKind::Closure | ParamKind::OptionClosure => {
                    method_params.push(format!("{pname}Fn:cpp.Star<cpp.Void>"));
                    method_params.push(format!("{pname}Ctx:cpp.Star<cpp.Void>"));
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
        "\t{static_kw}extern inline public function {method_name}({params_str}):{haxe_ret} {{\n\t\t{body};\n\t}}"
    ))
}

fn emit_module_file(
    module_name: &str,
    fns: &[ParsedFn],
    ffi_surface: Option<&FfiSurface>,
) -> String {
    let mut emitted: Vec<String> = Vec::new();
    for func in fns {
        if !has_ffi_function(&func.name, ffi_surface) {
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
                haxe_params.push(format!("{pname}:cpp.Star<cpp.Void>"));
                haxe_params.push(format!("{pname}Len:Int"));
            }
            ParamKind::FixedArrayConst(_, _) | ParamKind::FixedArrayMut(_, _) => {
                haxe_params.push(format!("{pname}:cpp.Star<cpp.Void>"));
            }
            ParamKind::Closure | ParamKind::OptionClosure => {
                haxe_params.push(format!("{pname}Fn:cpp.Star<cpp.Void>"));
                haxe_params.push(format!("{pname}Ctx:cpp.Star<cpp.Void>"));
            }
            // The synthesized string free takes back the `char *` a string return handed out,
            // which crosses to hxcpp as `cpp.ConstCharStar`.
            _ if param.ty == "Ref<CString>" => {
                haxe_params.push(format!("{pname}:cpp.ConstCharStar"));
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
            let storage = tuple_element_storage(element)?.1;
            haxe_params.push(format!("out{index}:cpp.RawPointer<{storage}>"));
        }
    }

    let params_str = haxe_params.join(", ");
    Some(format!(
        "\t@:native(\"{ffi_name}\")\n\tpublic static function {haxe_name}({params_str}):{haxe_ret};"
    ))
}

fn param_kind_to_haxe(kind: &ParamKind) -> String {
    match kind {
        ParamKind::Scalar(ty) => scalar_to_haxe(ty).to_string(),
        ParamKind::RefConst(ty) | ParamKind::OptionRefConst(ty) => format!("{PKG}.{ty}"),
        ParamKind::RefMut(ty) | ParamKind::OptionRefMut(ty) => format!("{PKG}.{ty}"),
        ParamKind::ArcRef | ParamKind::ArcRefMut => "cpp.Star<cpp.Void>".to_string(),
        ParamKind::OptionF32 => "Single".to_string(),
        ParamKind::OptionF64 => "Float".to_string(),
        ParamKind::OptionI32 => "Int".to_string(),
        ParamKind::OptionBool => "Int".to_string(),
        ParamKind::StrRef
        | ParamKind::StringParam
        | ParamKind::OptionStr
        | ParamKind::OptionStringParam => "cpp.ConstCharStar".to_string(),
        ParamKind::SliceConst(_)
        | ParamKind::SliceMut(_)
        | ParamKind::OptionSliceConst(_)
        | ParamKind::OptionSliceMut(_) => "cpp.Star<cpp.Void>".to_string(),
        ParamKind::FixedArrayConst(_, _) | ParamKind::FixedArrayMut(_, _) => {
            "cpp.Star<cpp.Void>".to_string()
        }
        ParamKind::Enum(_) => "Int".to_string(),
        ParamKind::DynOpaque(_) => "cpp.Star<cpp.Void>".to_string(),
        ParamKind::DynMono(ty) => format!("{PKG}.{ty}"),
        ParamKind::VecMut(_) | ParamKind::VecConst(_) | ParamKind::VecOwned(_) => {
            "cpp.Star<cpp.Void>".to_string()
        }
        ParamKind::Closure | ParamKind::OptionClosure => "cpp.Star<cpp.Void>".to_string(),
        ParamKind::BoxSlice(_) => "cpp.Star<cpp.Void>".to_string(),
    }
}

fn return_kind_to_haxe(kind: &ReturnKind) -> String {
    match kind {
        ReturnKind::Void => "Void".to_string(),
        ReturnKind::Scalar(ty) => scalar_to_haxe(ty).to_string(),
        ReturnKind::Struct(ty) => format!("{PKG}.{ty}"),
        ReturnKind::StringReturn | ReturnKind::OptionString => "cpp.ConstCharStar".to_string(),
        ReturnKind::ArcRefReturn | ReturnKind::OptionArcRefReturn => {
            "cpp.Star<cpp.Void>".to_string()
        }
        ReturnKind::Enum(_) => "Int".to_string(),
        ReturnKind::VecReturn(_) | ReturnKind::OptionVecReturn(_) => {
            "cpp.Star<cpp.Void>".to_string()
        }
        ReturnKind::BoxSliceReturn(_) | ReturnKind::OptionBoxSliceReturn(_) => {
            "cpp.Star<cpp.Void>".to_string()
        }
        ReturnKind::FixedArrayReturn(_, _) => "cpp.Star<cpp.Void>".to_string(),
        ReturnKind::OptionStruct(ty) => format!("{PKG}.{ty}"),
        ReturnKind::Tuple(_) => "Void".to_string(),
        ReturnKind::OptionTuple(_) => "Bool".to_string(),
    }
}

#[cfg(test)]
mod cpp_tuple_tests {
    use super::*;
    use crate::parse::random_gaussian_pair_fixture;
    #[test]
    fn scalar_tuple_return_becomes_trailing_out_parameters() {
        assert_eq!(
            emit_function(&random_gaussian_pair_fixture()).unwrap(),
            "\t@:native(\"flight_random_gaussian_pair\")\n\tpublic static function randomGaussianPair(randomFn:cpp.Star<cpp.Void>, randomCtx:cpp.Star<cpp.Void>, mean:Single, standardDeviation:Single, out0:cpp.RawPointer<cpp.Float32>, out1:cpp.RawPointer<cpp.Float32>):Void;"
        );
    }
    #[test]
    fn optional_tuple_returns_presence_with_the_same_out_parameters() {
        let mut function = random_gaussian_pair_fixture();
        function.ret = Some("Option<(f64, f64)>".into());
        let text = emit_function(&function).unwrap();
        assert!(
            text.ends_with(
                ", out0:cpp.RawPointer<cpp.Float64>, out1:cpp.RawPointer<cpp.Float64>):Bool;"
            ),
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
        let text = emit_type_file("AudioBus", Some(&audio_bus), None, Some(&surface));
        assert!(
            text.contains("public var gain(get, never):Single;"),
            "{text}"
        );
        assert!(
            text.contains("@:native(\"flight_get_audio_bus_gain\")"),
            "{text}"
        );
        assert!(!text.contains("flight_set_audio_bus_gain"), "{text}");
        assert!(!text.contains("function set_gain"), "{text}");
        assert!(text.contains("public var muted(get, set):Bool;"), "{text}");
        assert!(
            text.contains("@:native(\"flight_set_audio_bus_muted\")"),
            "{text}"
        );
        assert!(!text.contains("pan"), "{text}");
    }
    #[test]
    fn string_free_takes_back_the_const_char_star_a_string_return_hands_out() {
        let free = crate::parse::ParsedFn {
            name: "free_string".into(),
            source_name: None,
            params: vec![crate::parse::Param {
                name: "ptr".into(),
                ty: "Ref<CString>".into(),
            }],
            ret: None,
        };
        assert!(
            emit_function(&free)
                .unwrap()
                .ends_with("freeString(ptr:cpp.ConstCharStar):Void;")
        );
    }
}
