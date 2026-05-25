# 설정 가이드 (SETUP.md)

워크숍 이미지 갤러리 + 좋아요 투표 페이지를 배포하는 전체 과정입니다.
로컬 CLI 없이 **웹 브라우저만으로** 끝낼 수 있게 정리했습니다.

소요 시간: 약 15분 · 비용: 무료 (Supabase Free + Vercel Hobby)

---

## 0. 전체 구조

```
[학습자 브라우저]
   │  이미지 업로드 / 좋아요
   ▼
[Supabase]
   ├─ Storage  : 이미지 파일 보관 (gallery 버킷)
   ├─ Database : artworks(작품), likes(좋아요)
   └─ Realtime : 실시간 동기화 (누가 올리면 모두 화면 갱신)

[Vercel] : index.html / app.js / config.js 정적 호스팅
```

---

## 1. Supabase 프로젝트 만들기

1. https://supabase.com 접속 → **Start your project** → GitHub 계정으로 로그인
2. **New project** 클릭
   - Name: `workshop-gallery` (자유)
   - Database Password: 아무거나 설정 (메모해 두기, 거의 안 씀)
   - Region: **Northeast Asia (Seoul)** 선택 권장
3. 생성까지 1~2분 대기

---

## 2. 데이터베이스 테이블 만들기

좌측 메뉴 **SQL Editor** → **New query** → 아래 SQL 전체를 붙여넣고 **Run**.

```sql
-- 작품 테이블
create table public.artworks (
  id           uuid primary key default gen_random_uuid(),
  title        text,
  image_url    text not null,
  storage_path text,
  room_id      text not null default 'default',
  uploader_id  text,
  like_count   integer not null default 0,
  created_at   timestamptz not null default now()
);

-- 좋아요 테이블 (한 사람이 한 작품에 1번만)
create table public.likes (
  id          uuid primary key default gen_random_uuid(),
  artwork_id  uuid not null references public.artworks(id) on delete cascade,
  voter_id    text not null,
  room_id     text not null default 'default',
  created_at  timestamptz not null default now(),
  unique (artwork_id, voter_id)
);

create index on public.likes (voter_id);
create index on public.artworks (room_id, created_at desc);

-- 실시간 동기화 켜기
alter publication supabase_realtime add table public.artworks;

-- 행 단위 보안(RLS) 활성화
alter table public.artworks enable row level security;
alter table public.likes    enable row level security;

-- 워크숍용 공개 정책 (익명 사용자 읽기/쓰기 허용)
create policy "read artworks"   on public.artworks for select using (true);
create policy "insert artworks" on public.artworks for insert with check (true);
create policy "update artworks" on public.artworks for update using (true);
create policy "delete artworks" on public.artworks for delete using (true);

create policy "read likes"   on public.likes for select using (true);
create policy "insert likes" on public.likes for insert with check (true);
create policy "delete likes" on public.likes for delete using (true);
```

> 💡 워크숍 같은 신뢰된 폐쇄 환경을 전제로 한 정책입니다. 누구나
> 작품을 올리고 좋아요를 누를 수 있습니다. 외부에 공개하는 영구
> 서비스라면 정책을 더 좁히세요.

---

## 3. 이미지 저장소(Storage) 만들기

1. 좌측 메뉴 **Storage** → **New bucket**
   - Name: `gallery` (반드시 이 이름 — `config.js`/`app.js`와 일치)
   - **Public bucket** 토글 **ON** (이미지가 보여야 하므로)
   - **Create bucket**
2. 업로드 권한 정책 추가: 다시 **SQL Editor**에서 아래 실행

```sql
create policy "public read gallery"
  on storage.objects for select
  using ( bucket_id = 'gallery' );

create policy "public upload gallery"
  on storage.objects for insert
  with check ( bucket_id = 'gallery' );

create policy "public delete gallery"
  on storage.objects for delete
  using ( bucket_id = 'gallery' );
```

---

## 4. 연결 키 복사 → config.js 채우기

1. 좌측 하단 **Settings(톱니)** → **API**
2. 아래 두 값을 복사:
   - **Project URL**  (예: `https://abcd1234.supabase.co`)
   - **anon public** key (`Project API keys` 항목, `eyJ...`로 시작하는 긴 문자열)
3. `config.js` 파일을 열어 두 값을 붙여넣기:

```js
const SUPABASE_URL = "https://abcd1234.supabase.co";   // 1)
const SUPABASE_ANON_KEY = "eyJhbGciOi...(긴 문자열)";    // 2)
const ROOM_ID = "default";                              // 회차 구분 시 변경
```

> ✅ **anon public** 키는 공개되어도 안전한 키입니다(RLS로 보호).
> ❌ `service_role` 키는 **절대** 넣지 마세요.

---

## 5. GitHub에 올리고 Vercel로 배포

기존에 쓰시던 방식 그대로입니다.

1. GitHub에서 새 저장소 생성 (예: `workshop-gallery`)
2. 웹 UI로 4개 파일 업로드:
   `index.html`, `app.js`, `config.js`, `SETUP.md`
3. https://vercel.com → **Add New → Project** → 해당 저장소 **Import**
4. 설정은 그대로 두고 **Deploy** (별도 빌드 설정·환경변수 불필요 — 순수 정적 사이트)
5. 발급된 주소(`https://workshop-gallery.vercel.app`)를 학습자에게 공유

> 이 프로젝트는 API 키를 서버에 숨길 필요가 없습니다(anon 키라 공개 OK).
> 그래서 `api/proxy.js` 같은 백엔드 없이 정적 배포만으로 끝납니다.

---

## 6. 워크숍 회차마다 새로 쓰기

작품을 초기화하고 싶을 때 두 가지 방법:

- **방법 A (권장):** `config.js`의 `ROOM_ID`를 바꾸기
  (예: `"20260522_1팀"`) → 재배포. 이전 작품과 분리됩니다.
- **방법 B:** Supabase → SQL Editor에서
  `delete from public.artworks;` 실행 (전체 삭제)

---

## 7. 자주 묻는 문제

| 증상 | 원인 / 해결 |
|------|-------------|
| "설정 필요" 노란 배너 | `config.js`의 URL/KEY 미입력 |
| 업로드 시 "권한 설정이 필요" | 2번 RLS 정책 또는 3번 Storage 정책 누락 |
| 이미지가 깨져 보임 | `gallery` 버킷이 **Public**이 아님 |
| 좋아요가 다른 기기에 안 보임 | 1~2초 후 자동 동기화 / 새로고침 |
| 같은 사람이 두 번 업로드됨 | 브라우저(기기)별 1회 제한이라, 다른 기기/시크릿창은 별개로 카운트됨 |

---

## 참고: 동작 정책 요약

- **업로드:** 1인(1기기) 1작품. 작품명 + 이미지. 브라우저에 기록되어
  중복 업로드 차단.
- **작품 교체:** 내가 올린 작품에는 "내 작품" 배지와 삭제(✕) 버튼이
  표시됩니다. 삭제하면 새 작품을 다시 올릴 수 있습니다.
- **좋아요:** 1인이 여러 작품에 자유롭게(작품당 1회, 토글로 취소 가능).
- **익명:** 업로더 이름은 받지 않습니다. 작품명만 표시되어 공정하게
  투표할 수 있습니다. (작품명을 안 적으면 "작품 #번호"로 표시)
- **실시간:** 새 작품/좋아요/삭제가 모든 화면에 자동 반영.
