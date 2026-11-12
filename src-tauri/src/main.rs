#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use image::GenericImageView;
use rayon::prelude::*;
use serde::Deserialize;
use std::path::Path;
use std::fs::File;
use std::sync::atomic::{AtomicUsize, Ordering};
use tauri::Emitter;

#[derive(Deserialize, Debug)]
pub struct OverlayInfo {
    pub overlay_path: String,
    pub x_ratio: f32,
    pub y_ratio: f32,
    pub width_ratio: f32,
    pub height_ratio: f32,
    pub opacity: f32,
}

#[tauri::command]
fn process_batch_images(
    app: tauri::AppHandle,
    files: Vec<String>,
    output_dir: String,
    overlay: Option<OverlayInfo>,
    format: String,
    quality: u8,
    prefix: String,
    is_mosaic: bool,
) -> Result<String, String> {
    if files.is_empty() { return Err("Nicio imagine selectată.".into()); }

    let overlay_img = if let Some(ref ov) = overlay {
        let loaded = image::open(&ov.overlay_path).map_err(|e| format!("Eroare overlay: {}", e))?;
        Some(loaded.to_rgba8())
    } else { None };

    let total_files = files.len();
    let processed_count = AtomicUsize::new(0);

    files.par_iter().for_each(|file_path| {
        if let Ok(base_raw) = image::open(file_path) {
            let (bw, bh) = base_raw.dimensions();
            let mut base_rgba = base_raw.to_rgba8();

            if let (Some(ov_info), Some(ov_raw)) = (&overlay, &overlay_img) {
                let target_w = ((ov_info.width_ratio * bw as f32).round() as u32).max(1);
                let target_h = ((ov_info.height_ratio * bh as f32).round() as u32).max(1);

                let mut resized_overlay = image::imageops::resize(
                    ov_raw, target_w, target_h, image::imageops::FilterType::Lanczos3,
                );

                for pixel in resized_overlay.pixels_mut() {
                    pixel[3] = (pixel[3] as f32 * ov_info.opacity) as u8;
                }

                if is_mosaic {
                    let mut current_y = 0;
                    let mut row_index = 0; 
                    
                    while current_y < bh {
                        let mut current_x = if row_index % 2 == 1 { target_w } else { 0 };
                        
                        while current_x < bw {
                            image::imageops::overlay(&mut base_rgba, &resized_overlay, current_x as i64, current_y as i64);
                            
                            current_x += target_w * 2; 
                        }
                        current_y += target_h;
                        row_index += 1;
                    }
                } else {
                    let pos_x = (ov_info.x_ratio * bw as f32).round() as i64;
                    let pos_y = (ov_info.y_ratio * bh as f32).round() as i64;
                    image::imageops::overlay(&mut base_rgba, &resized_overlay, pos_x, pos_y);
                }
            }

            let path_obj = Path::new(file_path);
            if let Some(file_name_os) = path_obj.file_name() {
                let original_name = file_name_os.to_string_lossy();
                let new_file_name = format!("{}{}", prefix, original_name);
                
                let out_path = Path::new(&output_dir)
                    .join(new_file_name)
                    .with_extension(&format);

                let mut file = File::create(&out_path).unwrap();

                match format.as_str() {
                    "jpg" | "jpeg" => {
                        let rgb_img = image::DynamicImage::ImageRgba8(base_rgba).into_rgb8();
                        let (w, h) = rgb_img.dimensions();
                        let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut file, quality);
                        let _ = encoder.encode(rgb_img.as_raw(), w, h, image::ColorType::Rgb8.into());
                    },
                    _ => { let _ = base_rgba.save(&out_path); }
                }
            }
        }

        // Calculăm și emitem progresul
        let current = processed_count.fetch_add(1, Ordering::SeqCst) + 1;
        let percentage = ((current as f32 / total_files as f32) * 100.0) as u32;
        let _ = app.emit("progress", percentage);
    });

    Ok(format!("Done! Images saved: {}.", total_files))
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![process_batch_images])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}