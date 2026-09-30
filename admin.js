const cfg = window.SOUL_SITE_CONFIG || {};
const $ = (id) => document.getElementById(id);
const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);

const configured =
  cfg.supabaseUrl && !cfg.supabaseUrl.startsWith("YOUR_") &&
  cfg.supabasePublishableKey && !cfg.supabasePublishableKey.startsWith("YOUR_");
const sb = configured ? supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey) : null;
let characters = [];
let settings = {};

function screen(name) {
  ["checking", "login", "denied", "editor"].forEach((id) => {
    $(id).classList.toggle("hidden", id !== name);
  });
}

async function verify() {
  if (!sb) {
    screen("login");
    $("loginMessage").textContent = "先にconfig.jsを設定してください。";
    return;
  }
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return screen("login");
  if ((session.user.email || "").toLowerCase() !== (cfg.adminEmail || "").toLowerCase()) {
    return screen("denied");
  }
  screen("editor");
  await Promise.all([loadSettings(), loadCharacters()]);
}

$("send").onclick = async () => {
  const email = $("email").value.trim().toLowerCase();
  if (email !== (cfg.adminEmail || "").toLowerCase()) {
    $("loginMessage").textContent = "管理者メールアドレスが一致しません。";
    return;
  }
  $("loginMessage").textContent = "送信中です…";
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: location.href, shouldCreateUser: true },
  });
  $("loginMessage").textContent = error
    ? "送信できませんでした。設定を確認してください。"
    : "ログインリンクを送信しました。";
};

$("logout").onclick = $("deniedLogout").onclick = async () => {
  await sb.auth.signOut();
  screen("login");
};

document.querySelectorAll(".tab").forEach((button) => {
  button.onclick = () => {
    document.querySelectorAll(".tab").forEach((item) => item.classList.toggle("active", item === button));
    ["settings", "characters", "analytics"].forEach((name) => {
      $(name + "Panel").classList.toggle("hidden", name !== button.dataset.panel);
    });
    if (button.dataset.panel === "analytics") loadAnalytics();
  };
});

async function upload(file, kind) {
  if (!file) return null;
  const { data: { session } } = await sb.auth.getSession();
  const ext = (file.name.split(".").pop() || "bin").toLowerCase();
  const path = session.user.id + "/" + kind + "-" + Date.now() + "." + ext;
  const result = await sb.storage.from("site-assets").upload(path, file, { upsert: false });
  if (result.error) throw result.error;
  return sb.storage.from("site-assets").getPublicUrl(path).data.publicUrl;
}

async function loadSettings() {
  const { data, error } = await sb.from("site_settings").select("key,value");
  if (error) return;
  settings = Object.fromEntries((data || []).map((item) => [item.key, item.value]));
  $("siteName").value = settings.site_name || "魂募集";
  $("siteTitle").value = settings.site_title || "魂募集";
  $("siteDescription").value = settings.site_description || "";
  $("formUrl").value = settings.form_url || "";
  $("accentColor").value = settings.accent_color || "#6c5cff";
  $("frameStyle").value = settings.frame_style || "soft";
}

$("settingsForm").onsubmit = async (event) => {
  event.preventDefault();
  $("settingsMessage").textContent = "保存中です…";
  try {
    const icon = (await upload($("iconFile").files[0], "icon")) || settings.icon_url || "";
    const background = (await upload($("backgroundFile").files[0], "background")) || settings.background_url || "";
    const values = {
      site_name: $("siteName").value.trim(),
      site_title: $("siteTitle").value.trim(),
      site_description: $("siteDescription").value.trim(),
      form_url: $("formUrl").value.trim(),
      accent_color: $("accentColor").value,
      frame_style: $("frameStyle").value,
      icon_url: icon,
      background_url: background,
    };
    const rows = Object.entries(values).map(([key, value]) => ({
      key, value, updated_at: new Date().toISOString(),
    }));
    const { error } = await sb.from("site_settings").upsert(rows);
    if (error) throw error;
    settings = values;
    $("settingsMessage").textContent = "保存しました。";
  } catch {
    $("settingsMessage").textContent = "保存できませんでした。管理者設定を確認してください。";
  }
};

async function loadCharacters() {
  const { data, error } = await sb.from("characters").select("*").order("display_order");
  if (error) return;
  characters = data || [];
  renderCharacters();
}

function renderCharacters() {
  $("characterList").innerHTML = characters.map((character) => {
    const status = character.status === "available"
      ? "募集中"
      : character.status === "sold" ? "SOLD OUT" : "準備中";
    const video = character.video_url ? "・動画あり" : "";
    return '<div class="item"><img src="' + esc(character.face_image_url) + '" alt="">' +
      "<div><strong>" + esc(character.name) + "</strong><br><small>" +
      (character.is_published ? "掲載中" : "非掲載") + "・" + status + video +
      '</small></div><button class="btn sub" data-edit="' + character.id +
      '">編集</button></div>';
  }).join("") || '<p class="muted">まだ登録がありません。</p>';
  document.querySelectorAll("[data-edit]").forEach((button) => {
    button.onclick = () => editCharacter(button.dataset.edit);
  });
}

function resetCharacter() {
  $("characterForm").reset();
  $("originalId").value = "";
  $("displayOrder").value = characters.length + 1;
  $("status").value = "preparing";
  $("isPublished").value = "false";
  $("removeVideoLabel").classList.add("hidden");
  $("videoStatus").textContent = "動画は任意です。登録しなくても掲載できます。";
  $("characterMessage").textContent = "";
}

$("newCharacter").onclick = resetCharacter;

function editCharacter(id) {
  const character = characters.find((item) => item.id === id);
  if (!character) return;
  $("originalId").value = character.id;
  $("characterName").value = character.name;
  $("displayOrder").value = character.display_order;
  $("description").value = character.description || "";
  $("illustrationPrice").value = character.illustration_price ?? "";
  $("live2dPrice").value = character.live2d_price ?? "";
  $("fullPrice").value = character.full_price ?? "";
  $("priceNote").value = character.price_note || "";
  $("status").value = character.status;
  $("isPublished").value = String(character.is_published);
  $("removeVideo").checked = false;
  $("removeVideoLabel").classList.toggle("hidden", !character.video_url);
  $("videoStatus").textContent = character.video_url
    ? "現在、動き確認用動画が登録されています。新しい動画を選ぶと差し替わります。"
    : "現在、動画は登録されていません。動画なしでも掲載できます。";
  $("characterForm").scrollIntoView({ behavior: "smooth" });
}

const numOrNull = (id) => ($(id).value === "" ? null : Number($(id).value));

$("characterForm").onsubmit = async (event) => {
  event.preventDefault();
  $("characterMessage").textContent = "保存中です…";
  const originalId = $("originalId").value;
  const current = characters.find((item) => item.id === originalId);
  const videoFile = $("videoFile").files[0];
  try {
    if (videoFile && !["video/mp4", "video/webm"].includes(videoFile.type)) {
      throw new Error("video_type");
    }
    if (videoFile && videoFile.size > 50 * 1024 * 1024) {
      throw new Error("video_size");
    }
    const face = (await upload($("faceFile").files[0], "face-" + (originalId || "new"))) || current?.face_image_url;
    const full = (await upload($("fullFile").files[0], "full-" + (originalId || "new"))) || current?.full_image_url;
    if (!face || !full) throw new Error("images");

    let video = current?.video_url || null;
    if ($("removeVideo").checked) video = null;
    if (videoFile) video = await upload(videoFile, "video-" + (originalId || "new"));

    const row = {
      name: $("characterName").value.trim(),
      display_order: Number($("displayOrder").value),
      description: $("description").value.trim(),
      illustration_price: numOrNull("illustrationPrice"),
      live2d_price: numOrNull("live2dPrice"),
      full_price: numOrNull("fullPrice"),
      price_note: $("priceNote").value.trim(),
      status: $("status").value,
      is_published: $("isPublished").value === "true",
      face_image_url: face,
      full_image_url: full,
      video_url: video,
      updated_at: new Date().toISOString(),
    };
    const query = originalId
      ? sb.from("characters").update(row).eq("id", originalId)
      : sb.from("characters").insert(row);
    const { error } = await query;
    if (error) throw error;
    resetCharacter();
    $("characterMessage").textContent = "保存しました。";
    await loadCharacters();
  } catch (error) {
    const messages = {
      images: "一覧画像と全身画像を選択してください。",
      video_type: "動画はMP4またはWebMを選択してください。",
      video_size: "動画は50MB以内にしてください。",
    };
    $("characterMessage").textContent = messages[error.message] || "保存できませんでした。";
  }
};

async function loadAnalytics() {
  const period = $("analyticsPeriod").value;
  $("analyticsMessage").textContent = "読み込み中です…";
  const { data, error } = await sb.rpc("get_admin_analytics", { p_period: period });
  if (error) {
    $("analyticsMessage").textContent = "読み込めませんでした。";
    return;
  }
  const totals = data.totals;
  $("kpis").innerHTML = [
    ["閲覧数", totals.page_views],
    ["ユニーク", totals.unique_visitors],
    ["詳細表示", totals.character_views],
    ["問い合わせ", totals.inquiries],
  ].map((item) =>
    '<div class="kpi"><small>' + item[0] + "</small><strong>" +
    Number(item[1]).toLocaleString() + "</strong></div>"
  ).join("");
  $("analyticsRows").innerHTML = (data.characters || []).map((character) =>
    "<tr><td>" + esc(character.name) + "</td><td>" + Number(character.views) +
    "</td><td>" + Number(character.interests) + "</td><td>" +
    Number(character.inquiries) + "</td></tr>"
  ).join("");
  $("analyticsMessage").textContent = "";
}

$("analyticsPeriod").onchange = loadAnalytics;
sb?.auth.onAuthStateChange(() => setTimeout(verify, 0));
verify();
