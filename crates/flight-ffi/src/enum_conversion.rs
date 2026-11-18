// The C-supplied discriminant as the enum variant whose `as u32` value it equals, or `None`. Each
// candidate is compared against the compiler's own discriminant for that variant, so explicit,
// gapped, and reordered values are exact without evaluating them when the bindings are generated.
// Generated wrappers list every variant of the owning `#[repr(u32)]` unit enum.
macro_rules! ffi_enum_from_u32 {
    ($value:expr, [$($variant:path),+ $(,)?]) => {{
        let value: u32 = $value;
        $(if value == $variant as u32 { Some($variant) } else)+ { None }
    }};
}

#[cfg(test)]
mod tests {
    #[derive(Clone, Copy, Debug, PartialEq)]
    #[repr(u32)]
    enum Gapped {
        Low = 1,
        High = 7,
        Max = u32::MAX,
    }

    #[derive(Clone, Copy, Debug, PartialEq)]
    #[repr(u32)]
    enum Contiguous {
        First,
        Second,
    }

    mod ffi_enum_from_u32 {
        use super::*;

        #[test]
        fn accepts_exactly_the_declared_discriminants() {
            let convert =
                |value| ffi_enum_from_u32!(value, [Gapped::Low, Gapped::High, Gapped::Max]);
            assert_eq!(convert(1), Some(Gapped::Low));
            assert_eq!(convert(7), Some(Gapped::High));
            assert_eq!(convert(u32::MAX), Some(Gapped::Max));
            for invalid in [0, 2, 6, 8, u32::MAX - 1] {
                assert_eq!(convert(invalid), None, "{invalid} is not a discriminant");
            }
        }

        #[test]
        fn reads_implicit_discriminants() {
            let convert =
                |value| ffi_enum_from_u32!(value, [Contiguous::First, Contiguous::Second]);
            assert_eq!(convert(0), Some(Contiguous::First));
            assert_eq!(convert(1), Some(Contiguous::Second));
            assert_eq!(convert(2), None);
        }
    }
}
