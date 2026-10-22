use std::sync::Arc;

use flight_bitmapfont::{BitmapFontGuardStateRef, create_bitmap_font_guard_state};
use flight_bitmapfont_formats::BitmapFontParseOptions;
use flight_entity::Ref;
use flight_textureatlas::{TextureAtlas, create_texture_atlas};

pub(crate) const FNT_TEXT: &str = concat!(
    "info face=\"Test\" size=32 bold=0 italic=0 unicode=1 padding=0,0,0,0 spacing=1,1\n",
    "common lineHeight=32 base=26 scaleW=64 scaleH=64 pages=1 packed=0\n",
    "page id=0 file=\"test_0.png\"\n",
    "chars count=2\n",
    "char id=65 x=0 y=0 width=7 height=8 xoffset=1 yoffset=5 xadvance=9 page=0 chnl=15\n",
    "char id=86 x=8 y=0 width=6 height=8 xoffset=0 yoffset=0 xadvance=8 page=0 chnl=15\n",
    "kernings count=1\n",
    "kerning first=65 second=86 amount=-2"
);

pub(crate) const FNT_MULTIPAGE: &str = concat!(
    "info face=\"Test\" size=32 unicode=1\n",
    "common lineHeight=32 base=26 scaleW=64 scaleH=64 pages=2 packed=0\n",
    "page id=0 file=\"test_0.png\"\n",
    "page id=1 file=\"test_1.png\"\n",
    "chars count=2\n",
    "char id=65 x=0 y=0 width=7 height=8 xoffset=1 yoffset=0 xadvance=9 page=0 chnl=15\n",
    "char id=66 x=3 y=0 width=6 height=8 xoffset=0 yoffset=0 xadvance=8 page=1 chnl=15"
);

pub(crate) const FNT_XML: &str = concat!(
    "<?xml version=\"1.0\"?>\n",
    "<font>\n",
    "<info face=\"Test\" size=\"32\" unicode=\"1\"/>\n",
    "<common lineHeight=\"32\" base=\"26\" scaleW=\"64\" scaleH=\"64\" pages=\"1\"/>\n",
    "<pages><page id=\"0\" file=\"test_0.png\"/></pages>\n",
    "<chars count=\"2\">\n",
    "<char id=\"65\" x=\"0\" y=\"0\" width=\"7\" height=\"8\" xoffset=\"1\" yoffset=\"5\" xadvance=\"9\" page=\"0\"/>\n",
    "<char id=\"86\" x=\"8\" y=\"0\" width=\"6\" height=\"8\" xoffset=\"0\" yoffset=\"0\" xadvance=\"8\" page=\"0\"/>\n",
    "</chars>\n",
    "<kernings count=\"1\"><kerning first=\"65\" second=\"86\" amount=\"-2\"/></kernings>\n",
    "</font>"
);

pub(crate) const FNT_JSON: &str = r#"{
  "chars":[
    {"height":8,"id":65,"page":0,"width":7,"x":0,"xadvance":9,"xoffset":1,"y":0,"yoffset":5},
    {"height":8,"id":86,"page":0,"width":6,"x":8,"xadvance":8,"xoffset":0,"y":0,"yoffset":0}
  ],
  "common":{"base":26,"lineHeight":32,"pages":1,"scaleH":64,"scaleW":64},
  "kernings":[{"amount":-2,"first":65,"second":86}],
  "pages":["test_0.png"]
}"#;

pub(crate) fn atlas() -> Ref<TextureAtlas> {
    return create_texture_atlas();
}

pub(crate) fn guard_state() -> BitmapFontGuardStateRef {
    return create_bitmap_font_guard_state();
}

pub(crate) fn page_options() -> BitmapFontParseOptions {
    let page = atlas();
    return BitmapFontParseOptions {
        resolve_page: Some(Arc::new(move |_id, _file| Some(page.clone()))),
    };
}
