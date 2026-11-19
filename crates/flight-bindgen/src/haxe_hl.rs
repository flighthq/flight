use std::collections::BTreeSet;
use std::fmt::Write as _;
use std::fs;
use std::path::Path;

use crate::byte_result::{
    BYTE_RESULT_TYPE, NativeByteTarget, byte_result_accessor_externs, byte_result_base_source,
    byte_result_return, byte_result_subclass_source, get_byte_result_optional, has_byte_results,
};
use crate::ffi_surface::{FfiSurface, FieldAccess};
use crate::haxe_common::{
    FLIGHT_NODE_ARRAY_TYPE, FLIGHT_NODE_POINTER_ARRAY_TYPE, FLIGHT_NODE_TYPE, NativeNodeTarget,
    TypeMethod, build_struct_map, build_type_methods, collect_opaque_types, crate_dir_to_module,
    derive_method_name, field_property_declaration, find_self_param, flight_node_array_source,
    flight_node_source, function_has_native_node, has_native_ffi_function,
    native_node_function_return, native_node_parameter, native_node_return, native_node_type,
    native_signature_for, resolve_ffi_field_access, scalar_to_haxe, to_snake_case,
    tuple_element_storage, write_if_changed,
};
use crate::offsets::FieldOffsets;
use crate::parse::{
    CrateExports, ParamKind, ParsedFn, ParsedStruct, ReturnKind, classify_param, classify_return,
    to_camel_case,
};

#[cfg(test)]
mod packed_float_tests {
    use super::*;
    use crate::parse::Param;
    use std::collections::BTreeMap;

    fn function(name: &str, parameter_types: &[&str], ret: Option<&str>) -> ParsedFn {
        return ParsedFn {
            name: name.to_string(),
            source_name: Some(name.to_string()),
            params: parameter_types
                .iter()
                .enumerate()
                .map(|(index, ty)| Param {
                    name: format!("value_{index}"),
                    ty: (*ty).to_string(),
                })
                .collect(),
            ret: ret.map(str::to_string),
        };
    }

    #[test]
    fn threshold_is_strictly_more_than_six_for_both_single_and_float_lanes() {
        let six = emit_function(
            &function(
                "six_lanes",
                &["f32", "f64", "f32", "f64", "f32", "f64"],
                None,
            ),
            None,
        )
        .unwrap();
        assert!(!six.contains("__flightPacked"), "{six}");

        let seven = emit_function(
            &function(
                "seven_lanes",
                &["f32", "f64", "f32", "f64", "f32", "f64", "f32"],
                None,
            ),
            None,
        )
        .unwrap();
        assert!(seven.contains("new hl.NativeArray<Float>(7)"), "{seven}");
    }

    #[test]
    fn mixed_lanes_keep_the_public_signature_native_symbol_parameter_order_and_values() {
        let output = emit_function(
            &function(
                "mixed_lanes",
                &[
                    "&mut Matrix4",
                    "f32",
                    "i32",
                    "f64",
                    "f32",
                    "f64",
                    "f32",
                    "f64",
                    "f32",
                ],
                Some("f64"),
            ),
            None,
        )
        .unwrap();
        assert!(
            output.contains("@:hlNative(\"flight\", \"flight_mixed_lanes\")"),
            "{output}"
        );
        assert!(
            output.contains(
                "private static function __flightPacked_mixedLanes(value0:flight._hl.Matrix4, __flightValues:hl.NativeArray<Float>, value2:Int):Float;"
            ),
            "{output}"
        );
        assert!(
            output.contains(
                "public static inline function mixedLanes(value0:flight._hl.Matrix4, value1:Single, value2:Int, value3:Float, value4:Single, value5:Float, value6:Single, value7:Float, value8:Single):Float"
            ),
            "{output}"
        );
        for (index, name) in [
            "value1", "value3", "value4", "value5", "value6", "value7", "value8",
        ]
        .iter()
        .enumerate()
        {
            assert!(
                output.contains(&format!("__flightValues[{index}] = {name};")),
                "{output}"
            );
        }
        assert!(
            output.contains("return __flightPacked_mixedLanes(value0, __flightValues, value2);"),
            "{output}"
        );
    }

    #[test]
    fn production_inventory_is_derived_from_signatures_and_has_23_affected_functions() {
        let crates_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap();
        let exports = crate::parse::scan_all_crates(crates_dir);
        let mut affected = BTreeMap::new();
        for function in exports.iter().flat_map(|exports| &exports.fns) {
            let mut singles = 0usize;
            let mut floats = 0usize;
            for parameter in &function.params {
                let Some(kind) = classify_param(&parameter.ty) else {
                    continue;
                };
                match kind {
                    ParamKind::Scalar(ref ty) if ty == "f32" => singles += 1,
                    ParamKind::Scalar(ref ty) if ty == "f64" => floats += 1,
                    ParamKind::OptionF32 => singles += 1,
                    ParamKind::OptionF64 => floats += 1,
                    _ => {}
                }
            }
            if singles + floats > HASHLINK_FLOAT_PACK_THRESHOLD {
                affected.insert(function.name.as_str(), (singles, floats));
            }
        }
        assert_eq!(
            affected,
            BTreeMap::from([
                ("append_path_rounded_rectangle_with_corner_radii", (0, 8)),
                ("create_capsule", (0, 7)),
                ("create_matrix3_from_values", (0, 9)),
                ("create_matrix4_from_values", (0, 16)),
                ("create_obb", (0, 10)),
                ("create_transform2d", (0, 9)),
                ("get_cubic_bezier_curvature", (0, 9)),
                ("get_cubic_bezier_point", (0, 9)),
                ("get_cubic_bezier_tangent", (0, 9)),
                ("get_quadratic_bezier_curvature", (0, 7)),
                ("get_quadratic_bezier_point", (0, 7)),
                ("get_quadratic_bezier_tangent", (0, 7)),
                ("lerp_hsv_direct", (7, 0)),
                ("query_physics3d_abi_ray", (0, 7)),
                ("query_physics3d_abi_ray_closest", (0, 7)),
                ("raycast_collision_heightfield3d", (0, 7)),
                ("raycast_collision_shape3d", (0, 7)),
                ("raycast_collision_triangle_mesh3d", (0, 7)),
                ("set_capsule", (0, 7)),
                ("set_matrix3", (0, 9)),
                ("set_matrix4", (0, 16)),
                ("set_obb", (0, 10)),
                ("sweep_collision_shape3d", (0, 7)),
            ])
        );
    }
}

const LIB_NAME: &str = "flight";
const PKG: &str = "flight._hl";
const HASHLINK_FLOAT_PACK_THRESHOLD: usize = 6;

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
    if has_byte_results(crate_exports) {
        write_if_changed(
            &hl_dir.join(format!("{BYTE_RESULT_TYPE}.hx")),
            &byte_result_base_source(PKG),
        );
    }

    let mut all_opaque_types: BTreeSet<String> = BTreeSet::new();
    for crate_export in crate_exports {
        for func in &crate_export.fns {
            collect_opaque_types(func, &mut all_opaque_types);
        }
        for s in &crate_export.structs {
            all_opaque_types.insert(s.name.clone());
        }
    }
    if ffi_surface.is_some_and(|surface| {
        surface
            .c
            .values()
            .any(crate::ffi_surface::signature_has_native_node)
    }) {
        all_opaque_types.insert(FLIGHT_NODE_TYPE.to_string());
        all_opaque_types.insert(FLIGHT_NODE_ARRAY_TYPE.to_string());
        all_opaque_types.insert(FLIGHT_NODE_POINTER_ARRAY_TYPE.to_string());
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
    if matches!(ty, "NodeFields" | "Node2DFields" | "Node3DFields") && ffi_surface.is_some() {
        return format!("package {PKG};\n\ntypedef {ty} = {FLIGHT_NODE_TYPE};\n");
    }
    if ty == FLIGHT_NODE_TYPE {
        return flight_node_source(PKG, NativeNodeTarget::Hl);
    }
    if ty == FLIGHT_NODE_ARRAY_TYPE {
        return flight_node_array_source(PKG, NativeNodeTarget::Hl);
    }
    if ty == FLIGHT_NODE_POINTER_ARRAY_TYPE {
        return format!("package {PKG};\n\nabstract {ty}(hl.Bytes) {{}}\n");
    }
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
        if function_has_native_node(tm.func, ffi_surface) {
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
    let byte_result = get_byte_result_optional(func);
    let haxe_ret = match byte_result {
        Some(true) => format!("Null<{PKG}.{BYTE_RESULT_TYPE}>"),
        Some(false) => format!("{PKG}.{BYTE_RESULT_TYPE}"),
        None => return_kind_to_haxe(&ret_kind),
    };

    let params_str = method_params.join(", ");
    let args_str = call_args.join(", ");
    let module = &tm.module;

    let call = format!("{PKG}._fn.{module}.{haxe_fn_name}({args_str})");
    let body = if let Some(optional) = byte_result {
        // The statement carries its own `;`; the method template appends another.
        byte_result_return(PKG, module, func, &call, optional)
            .trim_end_matches(';')
            .to_string()
    } else if matches!(ret_kind, ReturnKind::Void) {
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
    let mut byte_results: Vec<String> = Vec::new();
    for func in fns {
        if !has_native_ffi_function(&func.name, ffi_surface) {
            continue;
        }
        if let Some(decl) = emit_function(func, ffi_surface) {
            emitted.push(decl);
            if let Some(optional) = get_byte_result_optional(func) {
                emitted.push(byte_result_accessor_externs(func, NativeByteTarget::Hl));
                byte_results.push(byte_result_subclass_source(
                    func,
                    module_name,
                    NativeByteTarget::Hl,
                    optional,
                ));
            }
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
    for byte_result in &byte_results {
        writeln!(output).unwrap();
        write!(output, "{byte_result}").unwrap();
    }
    output
}

pub(crate) fn emit_function(func: &ParsedFn, ffi_surface: Option<&FfiSurface>) -> Option<String> {
    let ffi_name = format!("flight_{}", func.name);
    let haxe_name = to_camel_case(&func.name);

    let mut haxe_params = Vec::new();
    let signature = native_signature_for(ffi_surface, func);
    let mut c_index = 0usize;
    for param in &func.params {
        let kind = classify_param(&param.ty)?;
        let pname = to_camel_case(&param.name);
        if let Some(node) = native_node_parameter(signature, &mut c_index, &kind, &param.ty) {
            haxe_params.push(format!(
                "{pname}:{}",
                native_node_type(PKG, node.carrier, node.optional)
            ));
            if node.includes_len {
                haxe_params.push(format!("{pname}Len:Int"));
            }
            continue;
        }
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
    let haxe_ret = native_node_return(signature, func.ret.as_deref())
        .map(|(carrier, optional)| native_node_type(PKG, carrier, optional))
        .or_else(|| native_node_function_return(signature))
        .unwrap_or_else(|| return_kind_to_haxe(&ret_kind));
    if let ReturnKind::Tuple(elements) | ReturnKind::OptionTuple(elements) = &ret_kind {
        for (index, element) in elements.iter().enumerate() {
            let storage = tuple_element_storage(element)?.0;
            haxe_params.push(format!("out{index}:hl.Ref<{storage}>"));
        }
    }

    let params_str = haxe_params.join(", ");
    let float_count = haxe_params
        .iter()
        .filter(|parameter| is_hashlink_float_parameter(parameter))
        .count();
    if float_count > HASHLINK_FLOAT_PACK_THRESHOLD {
        // HashLink corrupts by-value floating-point arguments after six lanes. Keep the public
        // Haxe signature intact, but bind its private native through one GC-rooted f64 array. Both
        // Single and Float lanes count toward the limit and retain their relative order; the C
        // shim casts each f64 array element back to the original C carrier.
        let native_name = format!("__flightPacked_{haxe_name}");
        let mut native_params = Vec::new();
        let mut native_args = Vec::new();
        let mut stores = String::new();
        let mut float_index = 0usize;
        for parameter in &haxe_params {
            let (name, _) = parameter
                .split_once(':')
                .expect("generated Haxe parameter must be typed");
            if is_hashlink_float_parameter(parameter) {
                if float_index == 0 {
                    native_params.push("__flightValues:hl.NativeArray<Float>".to_string());
                    native_args.push("__flightValues".to_string());
                }
                writeln!(stores, "\t\t__flightValues[{float_index}] = {name};").unwrap();
                float_index += 1;
            } else {
                native_params.push(parameter.clone());
                native_args.push(name.to_string());
            }
        }
        let return_prefix = if matches!(ret_kind, ReturnKind::Void) {
            ""
        } else {
            "return "
        };
        return Some(format!(
            "\t@:hlNative(\"{LIB_NAME}\", \"{ffi_name}\")\n\tprivate static function {native_name}({}):{haxe_ret};\n\tpublic static inline function {haxe_name}({params_str}):{haxe_ret} {{\n\t\tvar __flightValues = new hl.NativeArray<Float>({float_count});\n{stores}\t\t{return_prefix}{native_name}({});\n\t}}",
            native_params.join(", "),
            native_args.join(", ")
        ));
    }
    Some(format!(
        "\t@:hlNative(\"{LIB_NAME}\", \"{ffi_name}\")\n\tpublic static function {haxe_name}({params_str}):{haxe_ret};"
    ))
}

fn is_hashlink_float_parameter(parameter: &str) -> bool {
    return parameter
        .rsplit_once(':')
        .is_some_and(|(_, ty)| matches!(ty, "Single" | "Float"));
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
            emit_function(&random_gaussian_pair_fixture(), None).unwrap(),
            "\t@:hlNative(\"flight\", \"flight_random_gaussian_pair\")\n\tpublic static function randomGaussianPair(randomFn:hl.Bytes, randomCtx:hl.Bytes, mean:Single, standardDeviation:Single, out0:hl.Ref<Single>, out1:hl.Ref<Single>):Void;"
        );
    }
    #[test]
    fn optional_tuple_returns_presence_with_the_same_out_parameters() {
        let mut function = random_gaussian_pair_fixture();
        function.ret = Some("Option<(f64, f64)>".into());
        let text = emit_function(&function, None).unwrap();
        assert!(
            text.ends_with(", out0:hl.Ref<Float>, out1:hl.Ref<Float>):Bool;"),
            "{text}"
        );
    }
    #[test]
    fn tuple_without_exact_width_storage_is_declined() {
        let mut function = random_gaussian_pair_fixture();
        function.ret = Some("(i64, i64)".into());
        assert!(emit_function(&function, None).is_none());
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

    #[test]
    fn native_node_field_views_alias_the_typed_handle_instead_of_layout_offsets() {
        let surface = crate::ffi_surface::FfiSurface {
            c: Default::default(),
            hl: Default::default(),
            native_skips: Default::default(),
        };
        for (type_name, fields) in [
            (
                "Node2DFields",
                vec![
                    ("alpha", "f32"),
                    ("pivot_x", "f64"),
                    ("pivot_y", "f64"),
                    ("rotation", "f64"),
                    ("scale_x", "f64"),
                    ("scale_y", "f64"),
                    ("skew_x", "f64"),
                    ("skew_y", "f64"),
                    ("visible", "bool"),
                    ("x", "f64"),
                    ("y", "f64"),
                ],
            ),
            ("NodeFields", vec![("enabled", "bool")]),
        ] {
            let parsed = ParsedStruct {
                name: type_name.into(),
                fields: fields
                    .iter()
                    .map(|(name, ty)| crate::parse::StructField {
                        name: (*name).into(),
                        ty: (*ty).into(),
                    })
                    .collect(),
            };
            let offsets = fields
                .iter()
                .enumerate()
                .map(|(index, (name, _))| ((*name).to_string(), index * 8))
                .collect();
            let text = emit_type_file(
                type_name,
                Some(&parsed),
                None,
                Some(&offsets),
                Some(&surface),
            );
            assert_eq!(
                text,
                format!("package {PKG};\n\ntypedef {type_name} = FlightNode;\n")
            );
            assert!(
                !text.contains("Dynamic") && !text.contains("getF") && !text.contains("setF"),
                "{text}"
            );
        }
    }
}
