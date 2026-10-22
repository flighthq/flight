use flight_bitmaptext::contract::*;

mod support;

use support::*;

#[path = "bitmap_text_strings_test.rs"]
mod flight_bitmaptext_bitmap_text_strings_test;
#[path = "bitmap_text_test.rs"]
mod flight_bitmaptext_bitmap_text_test;
#[path = "enable_bitmap_text_guards_test.rs"]
mod flight_bitmaptext_enable_bitmap_text_guards_test;
#[path = "explain_bitmap_text_missing_glyphs_test.rs"]
mod flight_bitmaptext_explain_bitmap_text_missing_glyphs_test;
#[path = "update_bitmap_text_test.rs"]
mod flight_bitmaptext_update_bitmap_text_test;
