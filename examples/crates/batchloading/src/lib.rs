//! Host-neutral Rust implementation of the `batchloading` example.

use example_common::{ExamplePrimitive, ExampleScene};
use flighthq_image::load_image_resource_from_url;
use flighthq_loader::{
    ResourceLoadResult, ResourceLoaderHandle, create_resource_load_item,
    create_resource_loader_with_options, enable_resource_loader_item_signals,
    get_resource_load_progress, get_resource_loader_result, queue_resource_load_item,
    start_resource_load,
};
use flighthq_signals::{SignalConnectOptions, connect_signal};
use flighthq_types::{
    ImageResource, ResourceLoadErrorPolicy, ResourceLoadRetryBackoff, ResourceLoaderOptions,
};
use std::sync::Arc;

const BACKGROUND: u32 = 0x1a_1a_2e_ff;
const PANEL: u32 = 0x2d_37_48_ff;

const MARGIN: f32 = 32.0;
const CONTENT_WIDTH: f32 = 480.0;

const ASSETS: &[(&str, &str, u32, Option<u32>)] = &[
    ("wabbit_alpha.png", "assets/wabbit_alpha.png", 10, None),
    ("tileset.png", "assets/tileset.png", 60, None),
    ("nyancat.png", "assets/nyancat.png", 30, Some(2)),
];

pub struct BatchLoadingApiScene {
    pub loader: ResourceLoaderHandle,
    pub handles: Vec<ResourceLoadResult<ImageResource>>,
}

pub fn create_scene() -> ExampleScene {
    let _api_scene = create_api_scene().expect("batchloading API scene");
    let mut primitives = Vec::new();

    // Title placeholder (Text is not rasterized by the example model).
    primitives.push(ExamplePrimitive::Text {
        x: MARGIN,
        y: 44.0,
        value: "Batch Loading",
        size: 24.0,
    });

    // Progress bar track.
    primitives.push(ExamplePrimitive::RoundRectangle {
        x: MARGIN,
        y: 96.0,
        width: CONTENT_WIDTH,
        height: 12.0,
        radius: 6.0,
    });

    // Control buttons: Start, Pause, Resume, Cancel, Reset.
    let button_widths = [56.0_f32, 62.0, 70.0, 64.0, 58.0];
    let mut button_x = MARGIN;
    for width in button_widths {
        primitives.push(ExamplePrimitive::RoundRectangle {
            x: button_x,
            y: 128.0,
            width,
            height: 30.0,
            radius: 5.0,
        });
        button_x += width + 10.0;
    }

    // Asset item rows, each with a status dot.
    for index in 0..3 {
        let row_y = 178.0 + index as f32 * 48.0;
        primitives.push(ExamplePrimitive::RoundRectangle {
            x: MARGIN,
            y: row_y,
            width: CONTENT_WIDTH,
            height: 38.0,
            radius: 6.0,
        });
        primitives.push(ExamplePrimitive::Circle {
            x: MARGIN + 18.0,
            y: row_y + 19.0,
            radius: 5.0,
        });
    }

    // Loaded-image thumbnail frames.
    for index in 0..3 {
        primitives.push(ExamplePrimitive::RoundRectangle {
            x: MARGIN + index as f32 * 74.0,
            y: 326.0,
            width: 58.0,
            height: 58.0,
            radius: 4.0,
        });
    }

    ExampleScene::new("batchloading", "Batch loading")
        .with_background(BACKGROUND)
        .with_fill(PANEL)
        .with_primitives(primitives)
}

pub fn create_api_scene() -> Result<BatchLoadingApiScene, Box<dyn std::error::Error + Send + Sync>>
{
    let mut loader = create_resource_loader_with_options(ResourceLoaderOptions {
        error_policy: ResourceLoadErrorPolicy::Continue,
        max_concurrent: 2,
        retries: 1,
        retry_backoff: ResourceLoadRetryBackoff::Exponential,
        retry_base_delay_ms: 200,
        ..Default::default()
    });
    {
        let item_signals = enable_resource_loader_item_signals(&mut loader);
        let _item_start = connect_signal(
            &item_signals.on_item_start,
            Arc::new(|_| {}),
            SignalConnectOptions::default(),
        );
    }
    let _progress = connect_signal(
        &loader.loader.on_progress,
        Arc::new(|_| {}),
        SignalConnectOptions::default(),
    );

    let mut handles = Vec::new();
    for &(name, url, weight, retries) in ASSETS {
        let path = asset_path(url);
        let mut item = create_resource_load_item(move || load_image_resource_from_url(&path));
        item.group = Some("images".to_string());
        item.key = Some(name.to_string());
        item.retries = retries;
        item.weight = weight;
        handles.push(queue_resource_load_item(&mut loader, item));
    }
    start_resource_load(&mut loader);
    let progress = get_resource_load_progress(&loader, None);
    if progress < 1.0 {
        return Err("batchloading did not complete".into());
    }
    for handle in &handles {
        match get_resource_loader_result(handle) {
            Some(Ok(_)) => {}
            Some(Err(err)) => return Err(err),
            None => return Err("batchloading missing result".into()),
        }
    }
    Ok(BatchLoadingApiScene { loader, handles })
}

fn asset_path(path: &str) -> String {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../packages/batchloading/public")
        .join(path)
        .to_string_lossy()
        .into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_scene() {
        assert_eq!(create_scene().id, "batchloading");
    }

    #[test]
    fn creates_matching_api_scene() {
        let scene = create_api_scene().expect("assets load");
        assert_eq!(scene.handles.len(), ASSETS.len());
        assert_eq!(get_resource_load_progress(&scene.loader, None), 1.0);
    }
}
