fn main() {
    // Recompile when Supabase config changes
    println!("cargo:rerun-if-env-changed=BDOI_SUPABASE_URL");
    println!("cargo:rerun-if-env-changed=BDOI_SUPABASE_ANON_KEY");
    tauri_build::build()
}
