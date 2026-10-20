use flight_bitmap::*;

fn region(bmp: Bitmap) -> BitmapRegion {
    let w = bmp.width as i32;
    let h = bmp.height as i32;
    BitmapRegion { bitmap: bmp, x: 0, y: 0, width: w, height: h }
}

fn rgb_strip() -> Bitmap {
    let mut s = create_bitmap(3, 1, 0);
    s.data.copy_from_slice(&[255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255]);
    s
}

mod displace_bitmap_fn {
    use super::*;

    #[test]
    fn noop_when_scale_zero() {
        let source = rgb_strip();
        let mut map = create_bitmap(3, 1, 0);
        for b in map.data.iter_mut() { *b = 128; }
        let mut out = vec![0u8; 3 * 4];
        let opts = BitmapDisplacementMapOptions {
            map: region(map),
            component_x: None,
            component_y: None,
            scale_x: Some(0.0),
            scale_y: Some(0.0),
            edge_mode: None,
            mode: Some(DisplacementMode::Clamp),
            fill_color: None,
        };
        displace_bitmap(&mut out, &region(source), &opts);
        assert_eq!(out[0], 255); // red
        assert_eq!(out[4 + 1], 255); // green
        assert_eq!(out[8 + 2], 255); // blue
    }
}
