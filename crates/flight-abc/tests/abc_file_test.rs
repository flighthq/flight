use flight_abc::contract::*;

mod read_abc_file {
    use super::*;

    fn build_abc() -> Vec<u8> {
        let mut bytes = Vec::new();

        fn push_double(bytes: &mut Vec<u8>, value: f64) {
            bytes.extend_from_slice(&value.to_le_bytes());
        }

        fn push_string(bytes: &mut Vec<u8>, value: &str) {
            push_u30(bytes, value.len() as u32);
            bytes.extend_from_slice(value.as_bytes());
        }

        fn push_u16(bytes: &mut Vec<u8>, value: u16) {
            bytes.extend_from_slice(&value.to_le_bytes());
        }

        fn push_u30(bytes: &mut Vec<u8>, value: u32) {
            let mut remaining = value as u64;
            loop {
                let byte = (remaining % 0x80) as u8;
                remaining /= 0x80;
                bytes.push(if remaining > 0 { byte | 0x80 } else { byte });
                if remaining == 0 {
                    break;
                }
            }
        }

        push_u16(&mut bytes, 16);
        push_u16(&mut bytes, 46);

        push_u30(&mut bytes, 2);
        push_u30(&mut bytes, 0xfffffff9);
        push_u30(&mut bytes, 2);
        push_u30(&mut bytes, 9);
        push_u30(&mut bytes, 2);
        push_double(&mut bytes, 1.5);
        push_u30(&mut bytes, 4);
        push_string(&mut bytes, "Main");
        push_string(&mut bytes, "stop");
        push_string(&mut bytes, "flash.display");
        push_u30(&mut bytes, 2);
        bytes.push(0x16);
        push_u30(&mut bytes, 3);
        push_u30(&mut bytes, 2);
        push_u30(&mut bytes, 1);
        push_u30(&mut bytes, 1);
        push_u30(&mut bytes, 3);
        bytes.push(AbcMultinameKind::QName as u8);
        push_u30(&mut bytes, 1);
        push_u30(&mut bytes, 1);
        bytes.push(AbcMultinameKind::Multiname as u8);
        push_u30(&mut bytes, 2);
        push_u30(&mut bytes, 1);

        push_u30(&mut bytes, 2);
        push_u30(&mut bytes, 0);
        push_u30(&mut bytes, 0);
        push_u30(&mut bytes, 2);
        bytes.push(0);
        push_u30(&mut bytes, 1);
        push_u30(&mut bytes, 0);
        push_u30(&mut bytes, 1);
        push_u30(&mut bytes, 1);
        bytes.push(0x08 | 0x80);
        push_u30(&mut bytes, 1);
        push_u30(&mut bytes, 1);
        bytes.push(0x03);
        push_u30(&mut bytes, 1);

        push_u30(&mut bytes, 0);

        push_u30(&mut bytes, 1);
        push_u30(&mut bytes, 1);
        push_u30(&mut bytes, 1);
        bytes.push(0);
        push_u30(&mut bytes, 0);
        push_u30(&mut bytes, 1);
        push_u30(&mut bytes, 1);
        push_u30(&mut bytes, 2);
        bytes.push(AbcTraitKind::Method as u8);
        push_u30(&mut bytes, 0);
        push_u30(&mut bytes, 0);
        push_u30(&mut bytes, 0);
        push_u30(&mut bytes, 0);

        push_u30(&mut bytes, 1);
        push_u30(&mut bytes, 0);
        push_u30(&mut bytes, 0);

        push_u30(&mut bytes, 1);
        push_u30(&mut bytes, 0);
        push_u30(&mut bytes, 2);
        push_u30(&mut bytes, 1);
        push_u30(&mut bytes, 1);
        push_u30(&mut bytes, 2);
        push_u30(&mut bytes, 3);
        bytes.push(0xd0);
        bytes.push(0x30);
        bytes.push(0x47);
        push_u30(&mut bytes, 0);
        push_u30(&mut bytes, 0);

        return bytes;
    }

    #[test]
    fn never_panics_on_arbitrary_bytes() {
        let mut seed = 0x2f6a51b3u32;
        fn next(seed: &mut u32) -> u32 {
            *seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
            return *seed;
        }

        for _ in 0..500 {
            let length = (next(&mut seed) % 200) as usize;
            let mut bytes = vec![0u8; length];
            for byte in &mut bytes {
                *byte = (next(&mut seed) & 0xff) as u8;
            }
            let _ = read_abc_file(&bytes);
        }
        for _ in 0..500 {
            let mut mutant = build_abc();
            for _ in 0..3 {
                let index = next(&mut seed) as usize % mutant.len();
                mutant[index] = (next(&mut seed) & 0xff) as u8;
            }
            let _ = read_abc_file(&mutant);
        }
    }

    #[test]
    fn reads_instances_and_classes_as_parallel_lists_sharing_one_count() {
        let file = read_abc_file(&build_abc()).unwrap();
        assert_eq!(file.instances.len(), 1);
        assert_eq!(file.classes.len(), 1);
        assert_eq!(file.instances[0].initializer, 1);
        assert_eq!(file.instances[0].name, 1);
        assert_eq!(file.instances[0].super_name, 1);
        assert_eq!(file.instances[0].traits[0].kind, AbcTraitKind::Method as u8);
        assert_eq!(file.instances[0].traits[0].method_index, 0);
        assert_eq!(file.classes[0].initializer, 0);
    }

    #[test]
    fn reads_methods_with_optional_defaults_and_parameter_names() {
        let file = read_abc_file(&build_abc()).unwrap();
        assert_eq!(file.methods.len(), 2);
        assert_eq!(file.methods[0].name, 2);
        assert_eq!(file.methods[0].parameter_types, Vec::<usize>::new());
        assert_eq!(file.methods[0].return_type, 0);
        assert_eq!(
            file.methods[1].optional_values,
            vec![AbcOptionalValue {
                kind: 0x03,
                value: 1
            }]
        );
        assert_eq!(file.methods[1].parameter_names, vec![1]);
    }

    #[test]
    fn reads_namespaces_namespace_sets_and_both_multiname_shapes() {
        let file = read_abc_file(&build_abc()).unwrap();
        assert_eq!(
            file.constant_pool.namespaces[1],
            AbcNamespace {
                kind: 0x16,
                name: 3
            }
        );
        assert_eq!(file.constant_pool.namespace_sets[1], vec![1]);

        let qualified = &file.constant_pool.multinames[1];
        assert_eq!(qualified.kind, AbcMultinameKind::QName as u8);
        assert_eq!(qualified.namespace, 1);
        assert_eq!(file.constant_pool.strings[qualified.name], "Main");

        let multiname = &file.constant_pool.multinames[2];
        assert_eq!(multiname.kind, AbcMultinameKind::Multiname as u8);
        assert_eq!(file.constant_pool.strings[multiname.name], "stop");
        assert_eq!(multiname.namespace_set, 1);
    }

    #[test]
    fn reads_script_and_method_body_tables_keeping_instruction_bytes_unparsed() {
        let file = read_abc_file(&build_abc()).unwrap();
        assert_eq!(file.scripts[0].initializer, 0);
        assert_eq!(file.method_bodies.len(), 1);
        let body = &file.method_bodies[0];
        assert_eq!(body.local_count, 1);
        assert_eq!(body.max_stack, 2);
        assert_eq!(body.method, 0);
        assert_eq!(&*body.code, &[0xd0, 0x30, 0x47]);
        assert!(body.exceptions.is_empty());
    }

    #[test]
    fn reads_version_and_whole_constant_pool_with_reserved_zero_entry() {
        let file = read_abc_file(&build_abc()).unwrap();
        assert_eq!(file.minor_version, 16);
        assert_eq!(file.major_version, 46);
        assert_eq!(file.constant_pool.strings[0], "");
        assert_eq!(
            &file.constant_pool.strings[1..],
            &["Main", "stop", "flash.display"]
        );
        assert_eq!(file.constant_pool.integers, vec![0, -7]);
        assert_eq!(file.constant_pool.unsigned_integers, vec![0, 9]);
        assert!((file.constant_pool.doubles[1] - 1.5).abs() < f64::EPSILON);
    }

    #[test]
    fn rejects_a_multiname_with_an_undefined_kind() {
        let mut bytes = build_abc();
        let index = bytes[20..]
            .iter()
            .position(|value| *value == AbcMultinameKind::QName as u8)
            .unwrap()
            + 20;
        bytes[index] = 0x7f;
        assert!(read_abc_file(&bytes).is_none());
    }

    #[test]
    fn returns_none_instead_of_panicking_for_an_unreadable_container() {
        assert!(read_abc_file(&[]).is_none());
        assert!(read_abc_file(&[0x10, 0x00, 0x2e, 0x00]).is_none());
        let bytes = build_abc();
        assert!(read_abc_file(&bytes[..12]).is_none());
    }
}
