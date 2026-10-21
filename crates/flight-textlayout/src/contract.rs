//! Full TextLayout contract lane. The root mirrors the pinned curated `index.ts`; this module also
//! exposes construction initializers, D9 string tables, and canonical dependency-owned types.

pub use crate::rich_text_content::*;
pub use crate::rich_text_query::*;
pub use crate::text_bounds::*;
pub use crate::text_format::*;
pub use crate::text_format_range::*;
pub use crate::text_layout::*;
pub use crate::text_layout_group::*;
pub use crate::text_layout_measure::*;
pub use crate::text_line_breaks::*;
pub use crate::text_metrics::*;
pub use crate::types::*;

pub use flight_textformat::{TextFormat, TextFormatAlign, TextFormatListMarker, TextFormatRange};
pub use flight_textshaper::{
    HostTextShaperCapability, TextDirection, TextMeasureFunction, measure_text,
};
