// =====================================================================
//  Supabase 연결 설정
//  ---------------------------------------------------------------------
//  Supabase 프로젝트 > Settings > API 에서 아래 두 값을 복사해 넣으세요.
//
//   1) Project URL   →  SUPABASE_URL
//   2) anon public key  →  SUPABASE_ANON_KEY
//
//  ⚠️  여기 들어가는 anon key는 "공개되어도 되는" 키입니다.
//      (Row Level Security 정책으로 보호됩니다 — SETUP.md 참고)
//      service_role 키는 절대 넣지 마세요.
// =====================================================================

const SUPABASE_URL = "여기에_PROJECT_URL_붙여넣기";
const SUPABASE_ANON_KEY = "여기에_ANON_PUBLIC_KEY_붙여넣기";

// 워크숍 회차/세션을 구분하고 싶을 때 바꿔서 쓰세요.
// (같은 페이지를 여러 워크숍에서 재사용해도 작품이 섞이지 않습니다.)
const ROOM_ID = "default";
