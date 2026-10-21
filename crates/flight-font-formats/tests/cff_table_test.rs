use std::sync::Arc;

use crate::support::font_options;
use flight_font_formats::*;

fn cid_font() -> Box<[u8]> {
    return create_synthetic_font(Some(&SyntheticFontOptions {
        charstrings: Some(vec![
            vec![139, 139, 21, 32, 10, 14].into_boxed_slice(),
            vec![139, 139, 21, 32, 10, 14].into_boxed_slice(),
        ]),
        cid: Some(SyntheticCidOptions {
            fd_select: vec![0.0, 1.0],
            pools: vec![
                vec![vec![149, 139, 5, 11].into_boxed_slice()],
                vec![vec![139, 149, 5, 11].into_boxed_slice()],
            ],
        }),
        flavor: Some(SyntheticFontFlavor::OpenType),
        ..font_options()
    }));
}

mod read_cff_table {
    use super::*;

    #[test]
    fn reaches_charstrings_at_the_offset_stated_by_the_top_dict() {
        let font = create_synthetic_font(Some(&SyntheticFontOptions {
            charstrings: Some(vec![
                vec![14].into_boxed_slice(),
                vec![14].into_boxed_slice(),
            ]),
            flavor: Some(SyntheticFontFlavor::OpenType),
            ..font_options()
        }));
        let table = read_cff_table(&font, &read_sfnt_table_directory(&font).unwrap()).unwrap();
        assert_eq!(table.charstrings.len(), 2);
    }

    #[test]
    fn yields_empty_subroutine_pools_when_none_are_declared() {
        let font = create_synthetic_font(Some(&SyntheticFontOptions {
            flavor: Some(SyntheticFontFlavor::OpenType),
            ..font_options()
        }));
        let table = read_cff_table(&font, &read_sfnt_table_directory(&font).unwrap()).unwrap();
        assert!(table.local_subrs.is_empty());
        assert!(table.global_subrs.is_empty());
    }

    #[test]
    fn returns_null_when_the_cff_table_is_absent() {
        let font = create_synthetic_font(None);
        assert_eq!(
            read_cff_table(&font, &read_sfnt_table_directory(&font).unwrap()),
            None
        );
    }

    #[test]
    fn returns_null_when_a_declared_table_is_truncated() {
        let font = create_synthetic_font(Some(&SyntheticFontOptions {
            flavor: Some(SyntheticFontFlavor::OpenType),
            ..font_options()
        }));
        let mut directory = read_sfnt_table_directory(&font).unwrap();
        directory.tables.get_mut("CFF ").unwrap().length = 8;
        assert_eq!(read_cff_table(&font, &directory), None);
    }

    #[test]
    fn reads_cid_fonts_instead_of_refusing_them() {
        let font = cid_font();
        let table = read_cff_table(&font, &read_sfnt_table_directory(&font).unwrap()).unwrap();
        assert_eq!(table.charstrings.len(), 2);
    }

    #[test]
    fn binds_each_cid_glyph_to_its_own_distinct_pool() {
        let font = cid_font();
        let table = read_cff_table(&font, &read_sfnt_table_directory(&font).unwrap()).unwrap();
        let pools = table.local_subrs_by_glyph.unwrap();
        assert_eq!(pools.len(), 2);
        assert!(!Arc::ptr_eq(&pools[0], &pools[1]));
        assert_eq!(
            &font[pools[0][0].start..pools[0][0].end],
            &[149, 139, 5, 11]
        );
        assert_eq!(
            &font[pools[1][0].start..pools[1][0].end],
            &[139, 149, 5, 11]
        );
    }

    #[test]
    fn leaves_the_single_table_wide_pool_empty_for_cid_fonts() {
        let font = cid_font();
        assert!(
            read_cff_table(&font, &read_sfnt_table_directory(&font).unwrap())
                .unwrap()
                .local_subrs
                .is_empty()
        );
    }

    #[test]
    fn refuses_fd_select_indices_outside_the_fd_array_instead_of_falling_back() {
        let font = create_synthetic_font(Some(&SyntheticFontOptions {
            charstrings: Some(vec![vec![14].into_boxed_slice()]),
            cid: Some(SyntheticCidOptions {
                fd_select: vec![5.0],
                pools: vec![vec![]],
            }),
            flavor: Some(SyntheticFontFlavor::OpenType),
            ..font_options()
        }));
        assert_eq!(
            read_cff_table(&font, &read_sfnt_table_directory(&font).unwrap()),
            None
        );
    }

    #[test]
    fn retains_identical_pool_identity_for_glyphs_selecting_the_same_fd_in_sliced_storage() {
        let font = create_synthetic_font(Some(&SyntheticFontOptions {
            charstrings: Some(vec![
                vec![14].into_boxed_slice(),
                vec![14].into_boxed_slice(),
            ]),
            cid: Some(SyntheticCidOptions {
                fd_select: vec![0.0, 0.0],
                pools: vec![vec![vec![11].into_boxed_slice()]],
            }),
            flavor: Some(SyntheticFontFlavor::OpenType),
            ..font_options()
        }));
        let mut storage = vec![91, 92, 93];
        storage.extend_from_slice(&font);
        storage.push(94);
        let view = &storage[3..storage.len() - 1];
        let table = read_cff_table(view, &read_sfnt_table_directory(view).unwrap()).unwrap();
        let pools = table.local_subrs_by_glyph.unwrap();
        assert!(Arc::ptr_eq(&pools[0], &pools[1]));
        assert_eq!(view[pools[0][0].start], 11);
    }
}
