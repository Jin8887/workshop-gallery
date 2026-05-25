/* =====================================================================
 *  Workshop Gallery — app.js
 *  Supabase Storage(이미지) + Postgres(작품/좋아요) + Realtime(실시간 동기화)
 * ===================================================================== */

(function () {
  "use strict";

  /* ---------- 0. 환경 점검 ---------- */
  const configured =
    typeof SUPABASE_URL === "string" &&
    typeof SUPABASE_ANON_KEY === "string" &&
    SUPABASE_URL.startsWith("http") &&
    SUPABASE_ANON_KEY.length > 20;

  if (!configured) {
    document.getElementById("configWarn").style.display = "block";
    document.getElementById("galleryState").innerHTML =
      '<div class="big">⚙️</div>설정이 완료되면 작품이 표시됩니다.';
  }

  let supabase = null;
  if (configured) {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }

  const BUCKET = "gallery";
  const TABLE = "artworks";
  const LIKES_TABLE = "likes";
  const MAX_BYTES = 8 * 1024 * 1024; // 8MB
  const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif"];

  /* ---------- 1. 브라우저 식별자 (익명, 한 사람 = 한 기기) ---------- */
  function getVoterId() {
    let id = null;
    try {
      id = localStorage.getItem("gallery_voter_id");
      if (!id) {
        id =
          "v_" +
          Date.now().toString(36) +
          "_" +
          Math.random().toString(36).slice(2, 10);
        localStorage.setItem("gallery_voter_id", id);
      }
    } catch (e) {
      // localStorage 차단 환경 fallback (세션 한정)
      id = window.__voterId || "v_" + Math.random().toString(36).slice(2);
      window.__voterId = id;
    }
    return id;
  }
  const VOTER_ID = getVoterId();

  function hasUploaded() {
    try {
      return localStorage.getItem("gallery_uploaded_" + ROOM_ID) === "1";
    } catch (e) {
      return false;
    }
  }
  function markUploaded() {
    try {
      localStorage.setItem("gallery_uploaded_" + ROOM_ID, "1");
    } catch (e) {}
  }

  /* ---------- 2. 상태 ---------- */
  let artworks = []; // {id, image_url, created_at, like_count}
  let myLikes = new Set(); // 내가 좋아요 누른 artwork id
  let sortMode = "new";
  let selectedFile = null;
  let numberMap = {}; // artwork id -> 작품 번호 (업로드 순서, 익명 식별용)

  // 업로드 순서(created_at 오름차순)대로 작품 번호 부여
  function rebuildNumbers() {
    const ordered = artworks
      .slice()
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    numberMap = {};
    ordered.forEach((a, i) => {
      numberMap[a.id] = i + 1;
    });
  }

  /* ---------- 3. DOM ---------- */
  const $ = (id) => document.getElementById(id);
  const galleryEl = $("gallery");
  const galleryState = $("galleryState");
  const toastEl = $("toast");

  /* ---------- 4. 토스트 ---------- */
  let toastTimer = null;
  function toast(msg, isError) {
    toastEl.textContent = msg;
    toastEl.className = "toast show" + (isError ? " error" : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.className = "toast";
    }, 2800);
  }

  function timeAgo(iso) {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return "방금 전";
    if (diff < 3600) return Math.floor(diff / 60) + "분 전";
    if (diff < 86400) return Math.floor(diff / 3600) + "시간 전";
    return Math.floor(diff / 86400) + "일 전";
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /* ---------- 5. 데이터 로드 ---------- */
  async function loadAll() {
    if (!supabase) return;
    try {
      const [artRes, likeRes] = await Promise.allSettled([
        supabase
          .from(TABLE)
          .select("id, image_url, created_at, like_count")
          .eq("room_id", ROOM_ID)
          .order("created_at", { ascending: false }),
        supabase
          .from(LIKES_TABLE)
          .select("artwork_id")
          .eq("voter_id", VOTER_ID),
      ]);

      if (artRes.status === "fulfilled" && !artRes.value.error) {
        artworks = artRes.value.data || [];
      } else {
        const err =
          artRes.status === "fulfilled"
            ? artRes.value.error
            : artRes.reason;
        console.error("작품 로드 실패:", err);
        galleryState.style.display = "block";
        galleryState.innerHTML =
          '<div class="big">⚠️</div>작품을 불러오지 못했습니다. 새로고침 해주세요.';
        return;
      }

      if (likeRes.status === "fulfilled" && !likeRes.value.error) {
        myLikes = new Set((likeRes.value.data || []).map((r) => r.artwork_id));
      }

      render();
    } catch (e) {
      console.error(e);
      galleryState.style.display = "block";
      galleryState.innerHTML =
        '<div class="big">⚠️</div>연결에 문제가 발생했습니다.';
    }
  }

  /* ---------- 6. 렌더 ---------- */
  function render() {
    rebuildNumbers();
    // 통계
    const totalLikes = artworks.reduce(
      (s, a) => s + (a.like_count || 0),
      0
    );
    $("statCount").textContent = artworks.length;
    $("statLikes").textContent = totalLikes;

    // 업로드 카드 상태
    if (hasUploaded()) {
      $("uploadCard").classList.add("done");
      $("uploadCardTitle").textContent = "작품을 올렸어요 ✓";
      $("uploadCardDesc").textContent =
        "이제 다른 분들의 작품을 구경하고 좋아요를 눌러 보세요.";
      $("openUploadBtn").textContent = "올린 작품 보기";
    }

    // 정렬
    const list = artworks.slice();
    if (sortMode === "top") {
      list.sort(
        (a, b) =>
          (b.like_count || 0) - (a.like_count || 0) ||
          new Date(b.created_at) - new Date(a.created_at)
      );
    } else {
      list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    // 빈 상태
    if (list.length === 0) {
      galleryState.style.display = "block";
      galleryState.innerHTML =
        '<div class="big">🖼</div>아직 올라온 작품이 없어요.<br>첫 작품의 주인공이 되어 보세요!';
      galleryEl.innerHTML = "";
      return;
    }
    galleryState.style.display = "none";

    galleryEl.innerHTML = list
      .map((a, i) => {
        const liked = myLikes.has(a.id);
        const num = numberMap[a.id] || "?";
        const rank =
          sortMode === "top" && (a.like_count || 0) > 0 && i < 3
            ? `<div class="rank-badge">🏆 ${i + 1}위</div>`
            : "";
        return `
        <article class="card" data-id="${a.id}">
          <div class="imgwrap" data-action="zoom" data-id="${a.id}">
            ${rank}
            <img src="${escapeHtml(a.image_url)}" alt="작품 ${num}번" loading="lazy" />
          </div>
          <div class="meta">
            <div class="who">
              <div class="name">작품 #${num}</div>
              <div class="time">${timeAgo(a.created_at)}</div>
            </div>
            <button class="like-btn ${liked ? "liked" : ""}"
              data-action="like" data-id="${a.id}"
              aria-pressed="${liked}">
              <span class="heart">${liked ? "❤️" : "🤍"}</span>
              <span class="cnt">${a.like_count || 0}</span>
            </button>
          </div>
        </article>`;
      })
      .join("");
  }

  /* ---------- 7. 좋아요 토글 (낙관적 업데이트 + 롤백) ---------- */
  let likeBusy = new Set();
  async function toggleLike(id, btnEl) {
    if (!supabase || likeBusy.has(id)) return;
    likeBusy.add(id);

    const art = artworks.find((a) => a.id === id);
    if (!art) {
      likeBusy.delete(id);
      return;
    }
    const wasLiked = myLikes.has(id);

    // 낙관적 UI
    if (wasLiked) {
      myLikes.delete(id);
      art.like_count = Math.max(0, (art.like_count || 0) - 1);
    } else {
      myLikes.add(id);
      art.like_count = (art.like_count || 0) + 1;
      btnEl && btnEl.classList.add("pop");
      setTimeout(() => btnEl && btnEl.classList.remove("pop"), 400);
    }
    render();

    try {
      if (wasLiked) {
        const { error } = await supabase
          .from(LIKES_TABLE)
          .delete()
          .eq("artwork_id", id)
          .eq("voter_id", VOTER_ID);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from(LIKES_TABLE)
          .insert({ artwork_id: id, voter_id: VOTER_ID, room_id: ROOM_ID });
        // 중복(이미 누른 상태)은 무시
        if (error && error.code !== "23505") throw error;
      }
      // 서버 카운트 동기화 (정확성 보정)
      await syncCount(id);
    } catch (e) {
      console.error("좋아요 처리 실패:", e);
      // 롤백
      if (wasLiked) {
        myLikes.add(id);
        art.like_count = (art.like_count || 0) + 1;
      } else {
        myLikes.delete(id);
        art.like_count = Math.max(0, (art.like_count || 0) - 1);
      }
      render();
      toast("좋아요 처리에 실패했어요. 다시 시도해 주세요.", true);
    } finally {
      likeBusy.delete(id);
    }
  }

  async function syncCount(id) {
    try {
      const { count, error } = await supabase
        .from(LIKES_TABLE)
        .select("*", { count: "exact", head: true })
        .eq("artwork_id", id);
      if (!error && typeof count === "number") {
        const art = artworks.find((a) => a.id === id);
        if (art) art.like_count = count;
        // DB의 캐시 컬럼도 갱신 (인기순 정렬 정확도)
        await supabase
          .from(TABLE)
          .update({ like_count: count })
          .eq("id", id);
        render();
      }
    } catch (e) {
      /* 보정 실패는 조용히 무시 */
    }
  }

  /* ---------- 8. 업로드 ---------- */
  const uploadOverlay = $("uploadOverlay");
  const fileInput = $("fileInput");
  const dropZone = $("dropZone");

  function openUpload() {
    if (hasUploaded()) {
      toast("이미 작품을 올리셨어요. 갤러리에서 확인하세요!");
      return;
    }
    $("uploadErr").style.display = "none";
    selectedFile = null;
    $("preview").style.display = "none";
    $("submitUploadBtn").disabled = true;
    uploadOverlay.classList.add("open");
  }
  function closeUpload() {
    uploadOverlay.classList.remove("open");
  }

  function pickFile(file) {
    $("uploadErr").style.display = "none";
    if (!file) return;
    if (!ALLOWED.includes(file.type)) {
      showUploadErr("이미지 파일만 올릴 수 있어요 (JPG/PNG/WEBP/GIF).");
      return;
    }
    if (file.size > MAX_BYTES) {
      showUploadErr("파일이 너무 큽니다. 8MB 이하로 올려 주세요.");
      return;
    }
    selectedFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
      $("previewImg").src = e.target.result;
      $("preview").style.display = "block";
    };
    reader.readAsDataURL(file);
    validateForm();
  }

  function showUploadErr(msg) {
    const el = $("uploadErr");
    el.textContent = msg;
    el.style.display = "block";
  }

  function validateForm() {
    $("submitUploadBtn").disabled = !selectedFile;
  }

  async function submitUpload() {
    if (!selectedFile) return;
    if (hasUploaded()) {
      closeUpload();
      toast("이미 작품을 올리셨어요.");
      return;
    }

    const btn = $("submitUploadBtn");
    btn.disabled = true;
    btn.textContent = "올리는 중…";

    try {
      // 8-1. Storage 업로드
      const ext = (selectedFile.name.split(".").pop() || "img")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .slice(0, 5);
      const path = `${ROOM_ID}/${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 8)}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, selectedFile, {
          cacheControl: "3600",
          upsert: false,
          contentType: selectedFile.type,
        });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const imageUrl = pub.publicUrl;

      // 8-2. DB 레코드 생성
      const { data: inserted, error: insErr } = await supabase
        .from(TABLE)
        .insert({
          image_url: imageUrl,
          storage_path: path,
          room_id: ROOM_ID,
          uploader_id: VOTER_ID,
          like_count: 0,
        })
        .select()
        .single();
      if (insErr) throw insErr;

      markUploaded();

      // 즉시 화면 반영 (realtime 보다 먼저)
      if (!artworks.find((a) => a.id === inserted.id)) {
        artworks.unshift(inserted);
      }
      render();

      closeUpload();
      toast("작품이 전시되었어요! 🎉");
    } catch (e) {
      console.error("업로드 실패:", e);
      const msg =
        e && e.message && /row-level security|policy/i.test(e.message)
          ? "권한 설정이 필요해요. (SETUP.md의 보안 정책을 확인하세요)"
          : "업로드에 실패했어요. 잠시 후 다시 시도해 주세요.";
      showUploadErr(msg);
    } finally {
      btn.textContent = "올리기";
      validateForm();
    }
  }

  /* ---------- 9. 라이트박스 ---------- */
  const lightboxOverlay = $("lightboxOverlay");
  function openLightbox(id) {
    const art = artworks.find((a) => a.id === id);
    if (!art) return;
    $("lightboxImg").src = art.image_url;
    $("lightboxName").textContent = "작품 #" + (numberMap[id] || "?");
    lightboxOverlay.classList.add("open");
  }
  function closeLightbox() {
    lightboxOverlay.classList.remove("open");
    $("lightboxImg").src = "";
  }

  /* ---------- 10. 실시간 동기화 ---------- */
  function subscribeRealtime() {
    if (!supabase) return;
    supabase
      .channel("gallery-" + ROOM_ID)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: TABLE, filter: `room_id=eq.${ROOM_ID}` },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const a = payload.new;
            if (!artworks.find((x) => x.id === a.id)) {
              artworks.unshift(a);
              render();
            }
          } else if (payload.eventType === "UPDATE") {
            const idx = artworks.findIndex((x) => x.id === payload.new.id);
            if (idx >= 0) {
              // 좋아요 카운트만 갱신, 내 좋아요 상태는 유지
              artworks[idx].like_count = payload.new.like_count;
              render();
            }
          } else if (payload.eventType === "DELETE") {
            artworks = artworks.filter((x) => x.id !== payload.old.id);
            render();
          }
        }
      )
      .subscribe();
  }

  /* ---------- 11. 이벤트 바인딩 ---------- */
  function bind() {
    $("openUploadBtn").addEventListener("click", openUpload);
    $("uploadCard").addEventListener("click", (e) => {
      if (e.target.id !== "openUploadBtn") return;
    });
    $("cancelUploadBtn").addEventListener("click", closeUpload);
    $("submitUploadBtn").addEventListener("click", submitUpload);

    uploadOverlay.addEventListener("click", (e) => {
      if (e.target === uploadOverlay) closeUpload();
    });

    dropZone.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", (e) =>
      pickFile(e.target.files[0])
    );
    ["dragover", "dragenter"].forEach((ev) =>
      dropZone.addEventListener(ev, (e) => {
        e.preventDefault();
        dropZone.classList.add("drag");
      })
    );
    ["dragleave", "drop"].forEach((ev) =>
      dropZone.addEventListener(ev, (e) => {
        e.preventDefault();
        dropZone.classList.remove("drag");
      })
    );
    dropZone.addEventListener("drop", (e) => {
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) pickFile(f);
    });

    // 갤러리 위임 클릭
    galleryEl.addEventListener("click", (e) => {
      const likeBtn = e.target.closest('[data-action="like"]');
      if (likeBtn) {
        toggleLike(likeBtn.dataset.id, likeBtn);
        return;
      }
      const zoom = e.target.closest('[data-action="zoom"]');
      if (zoom) openLightbox(zoom.dataset.id);
    });

    // 정렬
    document.querySelectorAll(".sort-group button").forEach((b) => {
      b.addEventListener("click", () => {
        document
          .querySelectorAll(".sort-group button")
          .forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        sortMode = b.dataset.sort;
        render();
      });
    });

    // 라이트박스
    $("lightboxClose").addEventListener("click", closeLightbox);
    lightboxOverlay.addEventListener("click", (e) => {
      if (e.target === lightboxOverlay) closeLightbox();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeLightbox();
        closeUpload();
      }
    });
  }

  /* ---------- 12. 시작 ---------- */
  bind();
  if (supabase) {
    loadAll();
    subscribeRealtime();
  }
})();
