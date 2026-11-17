//! Pins the HashLink carriers `native_bindings.rs` writes into `flight_hl.c` and `flight_ffi.h`.
//! Scalar tuple outputs (`out_0`, `out_1`, ...) are typed `_REF` pointers that match the generated
//! `hl.Ref<T>` externs; every other pointer, including scalar slices and fixed-array outputs, stays an
//! opaque `_BYTES` carrier that matches `hl.Bytes`.

use std::fs;
use std::path::Path;

#[test]
fn opaque_and_scalar_buffer_pointers_stay_bytes_carriers() {
    let (header, shim) = generated();
    // An SDK handle, a scalar fixed-array output named `out`, and a scalar slice.
    for line in [
        "void flight_compute_rectangle_intersection(void * arg0, void * arg1, void * arg2);",
        "void flight_sample_color_lut(void * arg0, void * arg1, float arg2, float arg3, float arg4);",
        "void * flight_read_abc_file(void * arg0, size_t arg1);",
    ] {
        assert_line(&header, line);
    }
    for line in [
        "HL_PRIM void HL_NAME(flight_compute_rectangle_intersection)(vbyte * arg0, vbyte * arg1, vbyte * arg2) { flight_compute_rectangle_intersection((void *)arg0, (void *)arg1, (void *)arg2); }",
        "DEFINE_PRIM(_VOID, flight_compute_rectangle_intersection, _BYTES _BYTES _BYTES);",
        "HL_PRIM void HL_NAME(flight_sample_color_lut)(vbyte * arg0, vbyte * arg1, float arg2, float arg3, float arg4) { flight_sample_color_lut((void *)arg0, (void *)arg1, (float)arg2, (float)arg3, (float)arg4); }",
        "DEFINE_PRIM(_VOID, flight_sample_color_lut, _BYTES _BYTES _F32 _F32 _F32);",
        "HL_PRIM vbyte * HL_NAME(flight_read_abc_file)(vbyte * arg0, int arg1) { return (vbyte *)flight_read_abc_file((void *)arg0, (size_t)arg1); }",
        "DEFINE_PRIM(_BYTES, flight_read_abc_file, _BYTES _I32);",
    ] {
        assert_line(&shim, line);
    }
}

#[test]
fn random_gaussian_pair_outputs_are_typed_hashlink_references() {
    let (header, shim) = generated();
    assert_line(
        &header,
        "void flight_random_gaussian_pair(void * arg0, void * arg1, float arg2, float arg3, float * arg4, float * arg5);",
    );
    assert_line(
        &shim,
        "HL_PRIM void HL_NAME(flight_random_gaussian_pair)(vbyte * arg0, vbyte * arg1, float arg2, float arg3, float * arg4, float * arg5) { flight_random_gaussian_pair((void *)arg0, (void *)arg1, (float)arg2, (float)arg3, (float *)arg4, (float *)arg5); }",
    );
    assert_line(
        &shim,
        "DEFINE_PRIM(_VOID, flight_random_gaussian_pair, _BYTES _BYTES _F32 _F32 _REF(_F32) _REF(_F32));",
    );
    // Only tuple outputs are references; a new `_REF` carrier must be a deliberate ABI change.
    let references: Vec<_> = shim
        .lines()
        .filter(|line| line.starts_with("DEFINE_PRIM") && line.contains("_REF("))
        .collect();
    assert_eq!(
        references,
        [
            "DEFINE_PRIM(_VOID, flight_random_gaussian_pair, _BYTES _BYTES _F32 _F32 _REF(_F32) _REF(_F32));"
        ]
    );
}

fn assert_line(text: &str, line: &str) {
    assert!(
        text.lines().any(|candidate| candidate == line),
        "missing generated line:\n{line}"
    );
}

fn generated() -> (String, String) {
    let out_dir = Path::new(env!("OUT_DIR"));
    let header = fs::read_to_string(out_dir.join("flight_ffi.h")).unwrap();
    let shim = fs::read_to_string(out_dir.join("flight_hl.c")).unwrap();
    return (header, shim);
}
