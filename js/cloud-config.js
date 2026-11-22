// ============================================================================
// VN crochet — Cloud Configuration (Supabase + Cloudinary)
// ============================================================================
// Paste your 4 free keys below to enable Live Cloud Admin (edit products,
// prices, appearance, and upload photos/videos directly from your phone).
//
// Leave these blank if you only want to run locally with Open Website.bat.
// ============================================================================

export const CLOUD_CONFIG = {
  // 1. From Supabase -> Project Settings -> Data API (or API) -> Project URL
  //    Example: 'https://abcdefghijklmno.supabase.co'
  supabaseUrl: 'https://wzbfezkbbpceyiszgxnh.supabase.co',

  // 2. From Supabase -> Project Settings -> API Keys -> Publishable / anon public key
  //    Example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
  supabaseAnonKey: 'sb_publishable_1mEYuRFpOJUoDIy5L0_oCg_N2FU7B38',

  // 3. From Cloudinary -> Dashboard (or Settings -> Product Environment) -> Cloud Name
  //    Example: 'dxyz123abc'
  cloudinaryCloudName: 'dggmxxbg',

  // 4. From Cloudinary -> Settings -> Upload -> Upload Presets (Signing Mode: Unsigned)
  //    Example: 'vn_crochet_unsigned'
  cloudinaryUploadPreset: 'vn_crochet_unsigned'
};
