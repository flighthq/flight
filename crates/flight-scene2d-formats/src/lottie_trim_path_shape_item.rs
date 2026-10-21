use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use flight_importdiagnostics::contract::ImportDiagnosticDetailValue;
use flight_path::contract::{create_path, dash_path, get_path_length};

use crate::lottie_document::{
    initial_lottie_value, is_animated_lottie_property, lottie_numeric_json_value,
    report_lottie_skip,
};
use crate::types::{LottieShapeItemContext, LottieShapeModifier};

const LOTTIE_TRIM_CLAIM: &str = "lottie.trimPath";

// flight-lint: allow(f64) trimming consumes the approved D1 f64 path-length and dash lanes
pub fn lottie_trim_path_shape_item_handler(context: &mut LottieShapeItemContext<'_, '_>) {
    {
        let mut claims = context.claims.write().unwrap();
        if !claims.insert(LOTTIE_TRIM_CLAIM.to_string()) {
            return;
        }
    }
    if ["s", "e", "o"].into_iter().any(|key| {
        context
            .item
            .get(key)
            .is_some_and(is_animated_lottie_property)
    }) {
        report_lottie_skip(
            context.import,
            "lottie.unsupported-shape-modifier",
            "lottieTrimPathShapeItemHandler",
            Some(HashMap::from([(
                "modifier".to_string(),
                ImportDiagnosticDetailValue::String(
                    context
                        .item
                        .get("ty")
                        .and_then(serde_json::Value::as_str)
                        .unwrap_or_default()
                        .to_string(),
                ),
            )])),
        );
        return;
    }
    let value = |key: &str| {
        return lottie_numeric_json_value(initial_lottie_value(context.item.get(key)).as_ref(), 1)
            [0];
    };
    let start = value("s") / 100.0;
    let end = value("e") / 100.0;
    let offset = value("o") / 360.0;
    let mut visible = (end - start).rem_euclid(1.0);
    if (end - start).abs() >= 1.0 {
        visible = 1.0;
    }
    if visible >= 1.0 {
        return;
    }
    let modifier: LottieShapeModifier = Arc::new(move |paths| {
        for path in paths.iter_mut() {
            let trimmed = {
                let path = path.read().unwrap();
                let length = get_path_length(&path, None);
                let mut trimmed = create_path();
                trimmed.winding = path.winding;
                if length > 0.0 && visible > 0.0 {
                    dash_path(
                        &path,
                        &[
                            f64::from(visible) * length,
                            f64::from(1.0 - visible) * length,
                        ],
                        f64::from(start + offset) * length,
                        &mut trimmed,
                        None,
                    );
                }
                trimmed
            };
            *path = Arc::new(RwLock::new(trimmed));
        }
    });
    context.modifiers.write().unwrap().push(modifier);
}
