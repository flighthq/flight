// flight-bindgen is a binary crate, so the byte-result module and the two self-contained modules it
// reads (`ffi_surface`, `parse`) are compiled into this test crate directly. This suite uses only
// part of `ffi_surface` and `parse`; their remaining items are dead code here, not in the binary.
#[path = "../src/byte_result.rs"]
mod byte_result;
#[allow(dead_code)]
#[path = "../src/ffi_surface.rs"]
mod ffi_surface;
#[allow(dead_code)]
#[path = "../src/parse.rs"]
mod parse;

use std::collections::BTreeSet;
use std::fs;
use std::path::PathBuf;

use byte_result::*;
use ffi_surface::{FfiSurface, parse_ffi_header, parse_hl_primitives, verify_generated_externs};
use parse::{CrateExports, Param, ParsedFn, ParsedStruct};

mod byte_result_accessor_externs {
    use super::*;

    #[test]
    fn declares_the_hashlink_triple_with_its_define_prim_carriers() {
        assert_eq!(
            byte_result_accessor_externs(&compress_deflate(), NativeByteTarget::Hl),
            "\t@:hlNative(\"flight\", \"flight_compress_deflate_result_len\")\n\
             \tpublic static function compressDeflateResultLen(result:hl.Bytes):Int;\n\
             \t@:hlNative(\"flight\", \"flight_compress_deflate_result_get\")\n\
             \tpublic static function compressDeflateResultGet(result:hl.Bytes, index:Int):hl.Bytes;\n\
             \t@:hlNative(\"flight\", \"flight_compress_deflate_result_free\")\n\
             \tpublic static function compressDeflateResultFree(result:hl.Bytes):Void;"
        );
    }

    #[test]
    fn declares_the_hxcpp_triple_over_raw_handles() {
        assert_eq!(
            byte_result_accessor_externs(&compress_deflate(), NativeByteTarget::Cpp),
            "\t@:native(\"flight_compress_deflate_result_len\")\n\
             \tpublic static function compressDeflateResultLen(result:cpp.Star<cpp.Void>):Int;\n\
             \t@:native(\"flight_compress_deflate_result_get\")\n\
             \tpublic static function compressDeflateResultGet(result:cpp.Star<cpp.Void>, index:Int):cpp.Star<cpp.Void>;\n\
             \t@:native(\"flight_compress_deflate_result_free\")\n\
             \tpublic static function compressDeflateResultFree(result:cpp.Star<cpp.Void>):Void;"
        );
    }
}

mod byte_result_base_source {
    use super::*;

    #[test]
    fn exposes_length_get_to_bytes_and_free_on_every_target() {
        for package in ["flight._hl", "flight._cpp", "flight._js"] {
            let source = byte_result_base_source(package);
            assert!(
                source.starts_with(&format!("package {package};\n")),
                "{source}"
            );
            for member in [
                "public var length(",
                "function get(index:Int):Int {",
                "function toBytes():haxe.io.Bytes {",
                "function free():Void {",
            ] {
                assert!(
                    source.contains(member),
                    "{package} lacks {member}:\n{source}"
                );
            }
            assert!(!source.contains("Dynamic"), "{source}");
        }
    }

    #[test]
    fn frees_the_native_result_exactly_once() {
        for package in ["flight._hl", "flight._cpp"] {
            let source = byte_result_base_source(package);
            let free = source
                .split("public final function free():Void {")
                .nth(1)
                .and_then(|rest| rest.split("\t}").next())
                .unwrap();
            assert_eq!(
                free,
                "\n\t\tif (isFreed) return;\n\t\tisFreed = true;\n\t\tlength = 0;\n\t\tfreeNative();\n",
                "{source}"
            );
            assert_eq!(source.matches("freeNative();").count(), 1, "{source}");
            assert!(source.contains("\tfunction new(length:Int) {"), "{source}");
            assert!(
                source.contains("if (index < 0 || index >= length) throw"),
                "{source}"
            );
        }
    }

    #[test]
    fn rejects_native_to_bytes_after_free_before_allocating() {
        for package in ["flight._hl", "flight._cpp"] {
            let source = byte_result_base_source(package);
            let to_bytes = source
                .split("public final function toBytes():haxe.io.Bytes {")
                .nth(1)
                .and_then(|rest| rest.split("\t}").next())
                .unwrap();
            assert_eq!(
                to_bytes,
                "\n\t\tif (isFreed) throw new haxe.Exception('ByteResult has been freed');\n\
                 \t\tvar bytes = haxe.io.Bytes.alloc(length);\n\
                 \t\tfor (index in 0...length) bytes.set(index, readNative(index));\n\
                 \t\treturn bytes;\n",
                "{source}"
            );
        }
    }

    #[test]
    fn is_the_typescript_uint8array_on_javascript() {
        let source = byte_result_base_source("flight._js");
        assert!(source.contains(
            "abstract ByteResult(js.lib.Uint8Array) from js.lib.Uint8Array to js.lib.Uint8Array {"
        ));
        assert!(
            source.contains("public inline function free():Void {}"),
            "{source}"
        );
        assert!(source.contains("return this[index];"), "{source}");
        assert!(source.contains(
            "haxe.io.Bytes.ofData(this.buffer.slice(this.byteOffset, this.byteOffset + this.byteLength))"
        ));
        assert!(!source.contains("has been freed"), "{source}");
    }
}

mod byte_result_return {
    use super::*;

    #[test]
    fn hands_the_handle_to_the_producer_subclass() {
        assert_eq!(
            byte_result_return(
                "flight._hl",
                "Compression",
                &compress_deflate(),
                "raw()",
                false
            ),
            "return new flight._hl._fn.Compression.CompressDeflateByteResult(raw());"
        );
        assert_eq!(
            byte_result_return(
                "flight._cpp",
                "Compression",
                &decompress_deflate(),
                "raw()",
                true
            ),
            "return flight._cpp._fn.Compression.DecompressDeflateByteResult.wrapOptional(raw());"
        );
    }
}

mod byte_result_subclass_source {
    use super::*;

    #[test]
    fn reads_and_frees_only_through_its_own_producer() {
        let source = byte_result_subclass_source(
            &compress_deflate(),
            "Compression",
            NativeByteTarget::Hl,
            false,
        );
        assert!(source.starts_with(
            "final class CompressDeflateByteResult extends flight._hl.ByteResult {\n"
        ));
        assert!(source.contains("super(Compression.compressDeflateResultLen(handle));"));
        assert!(source.contains("\t\tCompression.compressDeflateResultFree(handle);\n"));
        assert!(
            source
                .contains("return Compression.compressDeflateResultGet(handle, index).getUI8(0);")
        );
        assert_eq!(source.matches("ResultFree(").count(), 1, "{source}");
        assert!(!source.contains("wrapOptional"), "{source}");
    }

    #[test]
    fn wraps_an_optional_null_handle_as_null() {
        let hl = byte_result_subclass_source(
            &decompress_deflate(),
            "Compression",
            NativeByteTarget::Hl,
            true,
        );
        assert!(hl.contains(
            "public static function wrapOptional(handle:hl.Bytes):Null<flight._hl.ByteResult> {\n\
             \t\treturn handle == null ? null : new DecompressDeflateByteResult(handle);"
        ));
        let cpp = byte_result_subclass_source(
            &decompress_deflate(),
            "Compression",
            NativeByteTarget::Cpp,
            true,
        );
        assert!(
            cpp.contains("untyped __cpp__(\"{0} == NULL\", handle) ? null"),
            "{cpp}"
        );
        assert!(cpp.contains(
            "untyped __cpp__(\"(int)*(const unsigned char *)({0})\", Compression.decompressDeflateResultGet(handle, index))"
        ));
    }
}

mod enforce_byte_result_triples {
    use super::*;

    #[test]
    fn binds_every_exact_triple_including_both_sfnt_producers() {
        let triples = enforce_byte_result_triples(&fixture_exports(), &fixture_surface());
        assert_eq!(
            triples,
            ByteResultTriples {
                bound: vec![
                    "flight_assemble_sfnt_font".to_string(),
                    "flight_compress_deflate".to_string(),
                    "flight_decompress_deflate".to_string(),
                    "flight_encode_sfnt_loca".to_string(),
                ],
                errors: vec![],
            }
        );
    }

    #[test]
    fn fails_when_a_triple_companion_is_omitted() {
        let mut surface = fixture_surface();
        surface.c.remove("flight_compress_deflate_result_free");
        assert_eq!(
            enforce_byte_result_triples(&fixture_exports(), &surface).errors,
            [
                "flight_compress_deflate returns owned bytes but flight_compress_deflate_result_free is missing from the C surface"
            ]
        );
    }

    #[test]
    fn fails_when_a_companion_is_mismatched_on_c() {
        let mut surface = fixture_surface();
        surface
            .c
            .get_mut("flight_decompress_deflate_result_get")
            .unwrap()
            .params
            .pop();
        let errors = enforce_byte_result_triples(&fixture_exports(), &surface).errors;
        assert_eq!(errors.len(), 1, "{errors:?}");
        assert!(
            errors[0].starts_with(
                "flight_decompress_deflate returns owned bytes but flight_decompress_deflate_result_get is"
            ) && errors[0].contains("on the C surface"),
            "{errors:?}"
        );
    }

    #[test]
    fn fails_when_only_the_hashlink_carrier_drifts() {
        let mut surface = fixture_surface();
        surface
            .hl
            .get_mut("flight_encode_sfnt_loca_result_len")
            .unwrap()
            .ret = "_I64".into();
        let errors = enforce_byte_result_triples(&fixture_exports(), &surface).errors;
        assert_eq!(errors.len(), 1, "{errors:?}");
        assert!(errors[0].contains("on the HashLink surface"), "{errors:?}");
    }

    #[test]
    fn fails_when_the_producer_returns_no_handle() {
        let mut surface = fixture_surface();
        surface.c.get_mut("flight_compress_deflate").unwrap().ret = "size_t".into();
        assert_eq!(
            enforce_byte_result_triples(&fixture_exports(), &surface).errors,
            [
                "flight_compress_deflate returns owned bytes but flight_compress_deflate does not return a `void *` handle on the C surface"
            ]
        );
    }

    #[test]
    fn fails_when_a_byte_result_is_a_native_skip() {
        let mut surface = fixture_surface();
        surface
            .native_skips
            .insert("flight_compress_deflate".into());
        assert_eq!(
            enforce_byte_result_triples(&fixture_exports(), &surface).errors,
            ["flight_compress_deflate returns owned bytes but is a native skip"]
        );
    }

    #[test]
    fn fails_when_an_sdk_type_takes_the_generated_name() {
        let mut exports = fixture_exports();
        exports[0].structs.push(ParsedStruct {
            name: "ByteResult".into(),
            fields: vec![],
        });
        assert_eq!(
            enforce_byte_result_triples(&exports, &fixture_surface()).errors,
            [
                "flight-compression defines a type named ByteResult, which the generated byte result owns"
            ]
        );
    }

    #[test]
    fn ignores_non_byte_results_and_symbols_absent_from_the_surface() {
        let mut exports = fixture_exports();
        exports[0].fns.push(function(
            "reserve_float32_array",
            &[("length", "usize")],
            "Box<Float32Array>",
        ));
        exports[0].fns.push(function(
            "compress_lzma",
            &[("bytes", "&Uint8Array")],
            "Box<Uint8Array>",
        ));
        let triples = enforce_byte_result_triples(&exports, &fixture_surface());
        assert_eq!(triples.bound.len(), 4, "{triples:?}");
        assert!(triples.errors.is_empty(), "{triples:?}");
    }
}

mod get_byte_result_optional {
    use super::*;

    #[test]
    fn types_u8_boxed_slices_and_vectors_and_their_options() {
        for (ret, expected) in [
            ("Box<Uint8Array>", Some(false)),
            ("Box<[u8]>", Some(false)),
            ("Vec<u8>", Some(false)),
            ("Option<Box<Uint8Array>>", Some(true)),
            ("Option<Vec<u8>>", Some(true)),
            ("Box<Float32Array>", None),
            ("Vec<u16>", None),
            ("Option<String>", None),
            ("FileSystemProviderFuture<Option<Box<Uint8Array>>>", None),
        ] {
            let func = function("probe", &[], ret);
            assert_eq!(get_byte_result_optional(&func), expected, "{ret}");
        }
        assert_eq!(get_byte_result_optional(&function("probe", &[], "")), None);
    }

    #[test]
    fn pins_both_sfnt_producers_as_byte_results() {
        assert_eq!(get_byte_result_optional(&assemble_sfnt_font()), Some(false));
        assert_eq!(get_byte_result_optional(&encode_sfnt_loca()), Some(true));
    }
}

mod has_byte_results {
    use super::*;

    #[test]
    fn is_true_only_when_an_export_returns_owned_bytes() {
        assert!(has_byte_results(&fixture_exports()));
        let mut exports = fixture_exports();
        for crate_export in &mut exports {
            crate_export
                .fns
                .retain(|func| get_byte_result_optional(func).is_none());
        }
        assert!(!has_byte_results(&exports));
    }
}

mod verify_byte_result_modules {
    use super::*;

    #[test]
    fn accepts_a_tree_built_from_the_emitted_parts() {
        let directory = write_fixture_tree("accepts");
        assert_eq!(
            verify_byte_result_modules(&directory, &fixture_bound()),
            Vec::<String>::new()
        );
        let externs = verify_generated_externs(&directory, &fixture_surface());
        assert!(externs.mismatches.is_empty(), "{:?}", externs.mismatches);
        assert_eq!(externs.checked, 16);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn fails_when_a_triple_accessor_is_omitted() {
        let directory = write_fixture_tree("omitted");
        let path = directory.join("flight/_cpp/_fn/Compression.hx");
        let content = fs::read_to_string(&path)
            .unwrap()
            .replace("\t@:native(\"flight_compress_deflate_result_get\")\n", "");
        fs::write(&path, content).unwrap();
        assert_eq!(
            verify_byte_result_modules(&directory, &fixture_bound()),
            [
                "_cpp/_fn/Compression.hx: flight_compress_deflate omits flight_compress_deflate_result_get"
            ]
        );
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn fails_when_an_accessor_is_generated_into_another_module() {
        let directory = write_fixture_tree("misplaced");
        let source = directory.join("flight/_hl/_fn/Compression.hx");
        let content = fs::read_to_string(&source).unwrap();
        let free = "\t@:hlNative(\"flight\", \"flight_decompress_deflate_result_free\")\n\
                    \tpublic static function decompressDeflateResultFree(result:hl.Bytes):Void;\n";
        assert!(content.contains(free), "{content}");
        fs::write(&source, content.replace(free, "")).unwrap();
        fs::write(
            directory.join("flight/_hl/_fn/Other.hx"),
            format!("package flight._hl._fn;\n\nextern class Other {{\n{free}}}\n"),
        )
        .unwrap();
        assert_eq!(
            verify_byte_result_modules(&directory, &fixture_bound()),
            [
                "_hl/_fn/Compression.hx: flight_decompress_deflate omits flight_decompress_deflate_result_free",
                "_hl/_fn/Other.hx: flight_decompress_deflate_result_free is generated outside the module of flight_decompress_deflate",
            ]
        );
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn fails_when_a_producer_is_generated_twice_or_not_at_all() {
        let directory = write_fixture_tree("count");
        let module = directory.join("flight/_hl/_fn/Compression.hx");
        fs::copy(&module, directory.join("flight/_hl/_fn/Copy.hx")).unwrap();
        fs::remove_file(directory.join("flight/_cpp/_fn/Compression.hx")).unwrap();
        let errors = verify_byte_result_modules(&directory, &fixture_bound());
        assert!(
            errors.contains(
                &"_hl: flight_compress_deflate is declared by 2 _fn modules, expected exactly 1"
                    .to_string()
            ),
            "{errors:?}"
        );
        assert!(
            errors.contains(
                &"_cpp: flight_compress_deflate is declared by 0 _fn modules, expected exactly 1"
                    .to_string()
            ),
            "{errors:?}"
        );
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn fails_when_the_subclass_is_missing() {
        let directory = write_fixture_tree("subclass");
        let path = directory.join("flight/_hl/_fn/Compression.hx");
        let content = fs::read_to_string(&path).unwrap().replace(
            "final class CompressDeflateByteResult extends flight._hl.ByteResult {",
            "final class CompressDeflateByteResult {",
        );
        fs::write(&path, content).unwrap();
        assert_eq!(
            verify_byte_result_modules(&directory, &fixture_bound()),
            ["_hl/_fn/Compression.hx: flight_compress_deflate has no ByteResult subclass"]
        );
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn fails_when_a_facade_leaves_a_byte_result_dynamic() {
        let directory = write_fixture_tree("dynamic");
        let path = directory.join("flight/Compression.hx");
        let content = fs::read_to_string(&path).unwrap().replace(
            "extern inline function compressDeflate(bytes:Dynamic):ByteResult {",
            "extern inline function compressDeflate(bytes:Dynamic):Dynamic {",
        );
        fs::write(&path, content).unwrap();
        assert_eq!(
            verify_byte_result_modules(&directory, &fixture_bound()),
            ["Compression.hx: compressDeflate returns Dynamic instead of ByteResult"]
        );
        fs::remove_dir_all(directory).unwrap();
    }
}

fn assemble_sfnt_font() -> ParsedFn {
    return function(
        "assemble_sfnt_font",
        &[("flavor", "u32"), ("tables", "&[SfntFontTable]")],
        "Box<Uint8Array>",
    );
}

fn compress_deflate() -> ParsedFn {
    return function(
        "compress_deflate",
        &[("bytes", "&Uint8Array")],
        "Box<Uint8Array>",
    );
}

fn decompress_deflate() -> ParsedFn {
    return function(
        "decompress_deflate",
        &[("compressed", "&Uint8Array")],
        "Option<Box<Uint8Array>>",
    );
}

fn encode_sfnt_loca() -> ParsedFn {
    return function(
        "encode_sfnt_loca",
        &[("glyph_lengths", "&Vec<f32>"), ("index_format", "i32")],
        "Option<Box<Uint8Array>>",
    );
}

fn fixture_bound() -> Vec<String> {
    return vec![
        "flight_compress_deflate".to_string(),
        "flight_decompress_deflate".to_string(),
    ];
}

fn fixture_exports() -> Vec<CrateExports> {
    return vec![
        CrateExports {
            dir_name: "flight-compression".into(),
            fns: vec![compress_deflate(), decompress_deflate()],
            structs: vec![],
            enums: vec![],
        },
        CrateExports {
            dir_name: "flight-font-formats".into(),
            fns: vec![assemble_sfnt_font(), encode_sfnt_loca()],
            structs: vec![],
            enums: vec![],
        },
    ];
}

// The C and HashLink surfaces flight-ffi generates for the fixture producers and their triples.
fn fixture_surface() -> FfiSurface {
    let mut header = String::new();
    let mut hl = String::new();
    for (name, c_params, hl_params) in [
        (
            "compress_deflate",
            "void * arg0, size_t arg1",
            "_BYTES _I32",
        ),
        (
            "decompress_deflate",
            "void * arg0, size_t arg1",
            "_BYTES _I32",
        ),
        (
            "assemble_sfnt_font",
            "uint32_t arg0, void * arg1, size_t arg2",
            "_I32 _BYTES _I32",
        ),
        (
            "encode_sfnt_loca",
            "void * arg0, size_t arg1, int32_t arg2",
            "_BYTES _I32 _I32",
        ),
    ] {
        header.push_str(&format!(
            "void * flight_{name}({c_params});\n\
             size_t flight_{name}_result_len(void * arg0);\n\
             void * flight_{name}_result_get(void * arg0, size_t arg1);\n\
             void flight_{name}_result_free(void * arg0);\n"
        ));
        hl.push_str(&format!(
            "DEFINE_PRIM(_BYTES, flight_{name}, {hl_params});\n\
             DEFINE_PRIM(_I32, flight_{name}_result_len, _BYTES);\n\
             DEFINE_PRIM(_BYTES, flight_{name}_result_get, _BYTES _I32);\n\
             DEFINE_PRIM(_VOID, flight_{name}_result_free, _BYTES);\n"
        ));
    }
    header.push_str("void * flight_reserve_float32_array(size_t arg0);\n");
    return FfiSurface {
        c: parse_ffi_header(&header),
        hl: parse_hl_primitives(&hl),
        native_skips: BTreeSet::new(),
    };
}

fn function(name: &str, params: &[(&str, &str)], ret: &str) -> ParsedFn {
    return ParsedFn {
        name: name.into(),
        source_name: Some(name.into()),
        params: params
            .iter()
            .map(|(param, ty)| Param {
                name: param.to_string(),
                ty: ty.to_string(),
            })
            .collect(),
        ret: (!ret.is_empty()).then(|| ret.to_string()),
    };
}

// The generated shape of the compression fixture, assembled from this module's own emitters: per
// native backend, one `_fn` module with each producer, its triple and its subclass; and a facade
// that returns `ByteResult`.
fn write_fixture_tree(name: &str) -> PathBuf {
    let directory = std::env::temp_dir().join(format!(
        "flight-bindgen-byte-result-{name}-{}",
        std::process::id()
    ));
    if directory.exists() {
        fs::remove_dir_all(&directory).unwrap();
    }
    let producers = [(compress_deflate(), false), (decompress_deflate(), true)];
    for (backend, target, handle, annotation) in [
        (
            "_hl",
            NativeByteTarget::Hl,
            "hl.Bytes",
            "@:hlNative(\"flight\", ",
        ),
        (
            "_cpp",
            NativeByteTarget::Cpp,
            "cpp.Star<cpp.Void>",
            "@:native(",
        ),
    ] {
        let mut module = format!("package flight.{backend}._fn;\n\nextern class Compression {{\n");
        let mut subclasses = String::new();
        for (func, optional) in &producers {
            let param = &func.params[0].name;
            module.push_str(&format!(
                "\t{annotation}\"flight_{}\")\n\tpublic static function {}({param}:{handle}, {param}Len:Int):{handle};\n{}\n",
                func.name,
                parse::to_camel_case(&func.name),
                byte_result_accessor_externs(func, target),
            ));
            subclasses.push_str(&format!(
                "\n{}",
                byte_result_subclass_source(func, "Compression", target, *optional)
            ));
        }
        module.push_str("}\n");
        module.push_str(&subclasses);
        let dir = directory.join("flight").join(backend).join("_fn");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("Compression.hx"), module).unwrap();
    }
    fs::write(
        directory.join("flight/Compression.hx"),
        format!(
            "package flight;\n\n\
             extern inline function compressDeflate(bytes:Dynamic):ByteResult {{\n\t{}\n}}\n\
             extern inline function decompressDeflate(compressed:Dynamic):Null<ByteResult> {{\n\t{}\n}}\n",
            byte_result_return(
                "flight._hl",
                "Compression",
                &compress_deflate(),
                "raw(bytes)",
                false
            ),
            byte_result_return(
                "flight._hl",
                "Compression",
                &decompress_deflate(),
                "raw(compressed)",
                true
            ),
        ),
    )
    .unwrap();
    return directory;
}
