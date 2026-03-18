pub mod excel_accel;

pub mod sigma_accel;
mod yara_accel;
pub mod xml_accel;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
      .invoke_handler(tauri::generate_handler![
        yara_accel::scan_yara_native,
        sigma_accel::sigma_prefilter_native,
        excel_accel::parse_csv_file_native,
        xml_accel::parse_xml_file_native
      ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
