//! One bounded PNG pipeline for immutable logo and uploaded payment QR snapshots.
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde_json::{json, Value};
use servos_printer_transport::PrinterProfile;
use std::io::Cursor;
pub fn raster(data: &str, qr: bool, profile: &PrinterProfile) -> Result<Value, String> {
    if data.len() > 2_800_000 {
        return Err("Snapshot PNG exceeds encoded bounds".into());
    }
    let encoded = data
        .strip_prefix("data:image/png;base64,")
        .ok_or("Only embedded PNG snapshots are supported")?;
    let bytes = STANDARD
        .decode(encoded)
        .map_err(|_| "Invalid snapshot PNG encoding")?;
    if bytes.len() > 2 * 1024 * 1024 || !bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Err("Invalid or excessive PNG snapshot".into());
    }
    let mut decoder = png::Decoder::new(Cursor::new(bytes));
    decoder.set_limits(png::Limits {
        bytes: 16 * 1024 * 1024,
    });
    decoder.set_transformations(png::Transformations::EXPAND | png::Transformations::STRIP_16);
    let mut reader = decoder
        .read_info()
        .map_err(|_| "Cannot decode snapshot PNG")?;
    let info = reader.info();
    let width = info.width as usize;
    let height = info.height as usize;
    if width == 0
        || height == 0
        || width > 4096
        || height > 4096
        || width
            .checked_mul(height)
            .filter(|pixels| *pixels <= 4_000_000)
            .is_none()
        || info.animation_control.is_some()
        || qr && width != height
    {
        return Err("PNG dimensions/animation are unsupported".into());
    }
    let size = reader.output_buffer_size();
    if size > 16 * 1024 * 1024 {
        return Err("Decoded PNG exceeds bounds".into());
    }
    let mut decoded = vec![0u8; size];
    let frame = reader
        .next_frame(&mut decoded)
        .map_err(|_| "Invalid PNG frame")?;
    if frame.width as usize != width
        || frame.height as usize != height
        || frame.bit_depth != png::BitDepth::Eight
    {
        return Err("Unsupported PNG frame format".into());
    }
    let channels = match frame.color_type {
        png::ColorType::Grayscale => 1,
        png::ColorType::GrayscaleAlpha => 2,
        png::ColorType::Rgb => 3,
        png::ColorType::Rgba => 4,
        _ => return Err("Unsupported expanded PNG color format".into()),
    };
    let max_width = if qr {
        profile.max_qr_width_dots.min(360)
    } else {
        profile.max_logo_width_dots
    };
    let max_height = if qr { max_width } else { 220 };
    let scale = (max_width as f64 / width as f64)
        .min(max_height as f64 / height as f64)
        .min(1.0);
    let out_width = ((width as f64 * scale).floor() as usize).max(1);
    let out_height = ((height as f64 * scale).floor() as usize).max(1);
    let row_bytes = out_width.div_ceil(8);
    let mut dots = vec![0u8; row_bytes * out_height];
    for y in 0..out_height {
        for x in 0..out_width {
            let source = ((y * height / out_height) * width + x * width / out_width) * channels;
            let pixel = &decoded[source..source + channels];
            let (red, green, blue, alpha) = match channels {
                1 => (pixel[0], pixel[0], pixel[0], 255),
                2 => (pixel[0], pixel[0], pixel[0], pixel[1]),
                3 => (pixel[0], pixel[1], pixel[2], 255),
                _ => (pixel[0], pixel[1], pixel[2], pixel[3]),
            };
            let luminance =
                (299 * u32::from(red) + 587 * u32::from(green) + 114 * u32::from(blue)) / 1000;
            let on_white = (luminance * u32::from(alpha) + 255 * (255 - u32::from(alpha))) / 255;
            if on_white < 128 {
                dots[y * row_bytes + x / 8] |= 0x80 >> (x % 8);
            }
        }
    }
    let encoded = STANDARD.encode(dots);
    if encoded.len() > 24000 {
        return Err("Thermal PNG raster exceeds transport bounds".into());
    }
    let raster = json!({"width":out_width,"height":out_height,"base64":encoded});
    Ok(if qr {
        json!({"thermalRaster":raster})
    } else {
        raster
    })
}
