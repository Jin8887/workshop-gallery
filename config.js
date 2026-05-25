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

const SUPABASE_URL = "https://euyziucwzwcndemfbedj.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV1eXppdWN3endjbmRlbWZiZWRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2OTg5MTEsImV4cCI6MjA5NTI3NDkxMX0.jk4tUFiG4D93tklY4GabF8PcZKQAGxI2GkFy5-9LOAg";

// 워크숍 회차/세션을 구분하고 싶을 때 바꿔서 쓰세요.
// (같은 페이지를 여러 워크숍에서 재사용해도 작품이 섞이지 않습니다.)
const ROOM_ID = "default";
