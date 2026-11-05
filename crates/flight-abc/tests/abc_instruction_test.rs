use flight_abc::contract::*;

mod read_abc_instructions {
    use super::*;

    #[test]
    fn decodes_an_empty_body_as_no_instructions() {
        assert_eq!(read_abc_instructions(&[]), Some(Vec::new()));
    }

    #[test]
    fn decodes_constructor_prologue() {
        assert_eq!(
            read_abc_instructions(&[0xd0, 0x30, 0x47]),
            Some(vec![
                AbcInstruction {
                    offset: 0,
                    opcode: AbcOpcode::GetLocal0 as u8,
                    operands: vec![],
                },
                AbcInstruction {
                    offset: 1,
                    opcode: AbcOpcode::PushScope as u8,
                    operands: vec![],
                },
                AbcInstruction {
                    offset: 2,
                    opcode: AbcOpcode::ReturnVoid as u8,
                    operands: vec![],
                },
            ])
        );
    }

    #[test]
    fn places_deprecated_typed_coerce_forms() {
        let instructions = read_abc_instructions(&[0x81, 0x83, 0x84, 0x88, 0x89, 0x47]).unwrap();
        assert_eq!(
            instructions
                .iter()
                .map(|value| value.opcode)
                .collect::<Vec<_>>(),
            vec![0x81, 0x83, 0x84, 0x88, 0x89, 0x47]
        );
        assert!(instructions.iter().all(|value| value.operands.is_empty()));
    }

    #[test]
    fn reads_a_lookup_switch_with_one_more_target_than_case_count() {
        assert_eq!(
            read_abc_instructions(&[
                0x1b, 0x07, 0x00, 0x00, 0x01, 0x0a, 0x00, 0x00, 0x0d, 0x00, 0x00,
            ]),
            Some(vec![AbcInstruction {
                offset: 0,
                opcode: AbcOpcode::LookupSwitch as u8,
                operands: vec![7, 1, 10, 13],
            }])
        );
    }

    #[test]
    fn reads_call_site_operand_shapes_including_two_operand_calls() {
        assert_eq!(
            read_abc_instructions(&[0x5d, 0x05, 0x24, 0x02, 0x4f, 0x05, 0x01]),
            Some(vec![
                AbcInstruction {
                    offset: 0,
                    opcode: AbcOpcode::FindPropStrict as u8,
                    operands: vec![5],
                },
                AbcInstruction {
                    offset: 2,
                    opcode: AbcOpcode::PushByte as u8,
                    operands: vec![2],
                },
                AbcInstruction {
                    offset: 4,
                    opcode: AbcOpcode::CallPropVoid as u8,
                    operands: vec![5, 1],
                },
            ])
        );
    }

    #[test]
    fn reports_a_truncated_operand() {
        assert!(read_abc_instructions(&[0x4f, 0x05]).is_none());
        assert!(read_abc_instructions(&[0x10, 0xfc]).is_none());
    }

    #[test]
    fn sign_extends_a_backward_branch_target() {
        assert_eq!(
            read_abc_instructions(&[0x10, 0xfc, 0xff, 0xff]),
            Some(vec![AbcInstruction {
                offset: 0,
                opcode: AbcOpcode::Jump as u8,
                operands: vec![-4],
            }])
        );
    }

    #[test]
    fn stops_on_an_undefined_opcode() {
        assert!(read_abc_instructions(&[0xd0, 0xff, 0x47]).is_none());
    }

    #[test]
    fn widens_a_multi_byte_variable_length_operand() {
        assert_eq!(
            read_abc_instructions(&[0x2d, 0x81, 0x01]),
            Some(vec![AbcInstruction {
                offset: 0,
                opcode: AbcOpcode::PushInt as u8,
                operands: vec![129],
            }])
        );
    }
}
