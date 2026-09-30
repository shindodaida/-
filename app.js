const cfg = window.SOUL_SITE_CONFIG || {};
const ready =
  cfg.supabaseUrl && !cfg.supabaseUrl.startsWith("YOUR_") &&
  cfg.supabasePublishableKey && !cfg.supabasePublishableKey.startsWith("YOUR_");
const sb = ready ? supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey) : null;
const $ = (id) => document.getElementById(id);
const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
const yen = (value) =>
  value === null || value === undefined || value === ""
    ? ""
    : "¥" + Number(value).toLocaleString("ja-JP");

let characters = [];
let settings = {};
let current = null;
let visitor = localStorage.getItem("soul_visitor");
if (!visitor) {
  visitor = crypto.randomUUID();
  localStorage.setItem("soul_visitor", visitor);
}
let mine = new Set(JSON.parse(localStorage.getItem("soul_interests") || "[]"));

function applySettings() {
  const root = document.documentElement;
  root.style.setProperty("--accent", settings.accent_color || "#6c5cff");
  root.style.setProperty(
    "--card-radius",
    settings.frame_style === "line" ? "4px" : settings.frame_style === "minimal" ? "0" : "18px",
  );
  root.style.setProperty(
    "--card-shadow",
    settings.frame_style === "shadow" ? "0 12px 35px #25203618" : "none",
  );
  $("siteTitle").textContent = settings.site_title || "魂募集";
  $("brand").textContent = settings.site_name || settings.site_title || "魂募集";
  $("footerName").textContent = "© " + (settings.site_name || settings.site_title || "魂募集");
  $("siteDescription").textContent = settings.site_description || "";
  document.title = (settings.site_name || "魂募集") + "｜キャラクター一覧";

  if (settings.icon_url) {
    $("siteIcon").src = settings.icon_url;
    $("siteIcon").classList.remove("hidden");
  }
  if (settings.background_url) {
    const safeUrl = settings.background_url.replace(/["\\]/g, "");
    $("hero").style.setProperty(
      "--hero-image",
      'linear-gradient(#ffffffb8,#ffffffb8),url("' + safeUrl + '")',
    );
  }
  const url = settings.form_url || "";
  [$("contactButton"), $("headerContact")].forEach((link) => {
    if (url) {
      link.href = url;
      link.target = "_blank";
    } else {
      link.href = "#contact";
    }
  });
}

function statusLabel(status) {
  return status === "sold" ? "SOLD OUT" : status === "preparing" ? "準備中" : "募集中";
}

function priceRows(character) {
  const rows = [
    ["パーツ分け立ち絵", character.illustration_price],
    ["高可動域Live2D", character.live2d_price],
    ["フルセット", character.full_price],
  ].filter((item) => item[1] !== null && item[1] !== undefined);

  return rows.map((item) =>
    '<div class="price-row"><span>' + esc(item[0]) + "</span><strong>" +
    yen(item[1]) + "</strong></div>"
  ).join("") + (
    character.price_note
      ? '<p class="muted">' + esc(character.price_note) + "</p>"
      : ""
  );
}

function render() {
  const rows = characters.filter((character) => character.is_published);
  $("grid").innerHTML = rows.map((character) => {
    const unavailable = character.status !== "available";
    const cover = character.status === "sold"
      ? '<span class="cover">SOLD OUT</span>'
      : character.status === "preparing"
        ? '<span class="cover preparing">準備中</span>'
        : "";
    const price = character.live2d_price != null
      ? "Live2D " + yen(character.live2d_price)
      : esc(character.price_note || "");
    return '<article class="card" data-id="' + character.id + '">' +
      '<button class="pic"><img src="' + esc(character.face_image_url) +
      '" alt="' + esc(character.name) + '">' + cover + "</button>" +
      '<div class="body"><div class="row"><div><span class="status ' +
      character.status + '">' + statusLabel(character.status) + "</span><h3>" +
      esc(character.name) + '</h3></div></div><div class="mini-price">' + price +
      '</div><button class="interest ' + (mine.has(character.id) ? "active" : "") +
      '" data-interest="' + character.id + '"' + (unavailable ? " disabled" : "") +
      ">" + (mine.has(character.id) ? "♥" : "♡") + " 気になる <span>" +
      Number(character.interest_count || 0) + "</span></button></div></article>";
  }).join("") || '<p class="muted">現在掲載中のキャラクターはいません。</p>';

  document.querySelectorAll(".pic").forEach((button) => {
    button.onclick = () => openDialog(button.closest(".card").dataset.id);
  });
  document.querySelectorAll("[data-interest]").forEach((button) => {
    button.onclick = () => toggleInterest(button.dataset.interest);
  });
}

function switchMedia(mode) {
  const showVideo = mode === "video" && Boolean(current?.video_url);
  $("dlgImg").classList.toggle("hidden", showVideo);
  $("dlgVideo").classList.toggle("hidden", !showVideo);
  $("showImage").classList.toggle("active", !showVideo);
  $("showVideo").classList.toggle("active", showVideo);
  if (!showVideo) $("dlgVideo").pause();
}

function openDialog(id) {
  const character = characters.find((item) => item.id === id);
  if (!character) return;
  current = character;
  $("dlgImg").src = character.full_image_url || character.face_image_url;
  $("dlgImg").alt = character.name + "の全身画像";
  $("dlgVideo").poster = character.full_image_url || character.face_image_url;
  $("dlgVideo").src = character.video_url || "";
  $("mediaTabs").classList.toggle("hidden", !character.video_url);
  switchMedia("image");
  $("dlgTitle").textContent = character.name;
  $("dlgDescription").textContent = character.description || "";
  $("dlgStatus").textContent = statusLabel(character.status);
  $("dlgStatus").className = "status " + character.status;
  $("dlgPrices").innerHTML = priceRows(character);
  syncDialog();
  $("dlg").showModal();
  track("character_view", character.id);
}

function syncDialog() {
  if (!current) return;
  const active = mine.has(current.id);
  const disabled = current.status !== "available";
  $("dlgInterest").disabled = disabled;
  $("dlgInterest").className = "interest " + (active ? "active" : "");
  $("dlgInterest").textContent = disabled
    ? statusLabel(current.status)
    : (active ? "♥" : "♡") + " 気になる " + Number(current.interest_count || 0);
  $("dlgInquiry").href = settings.form_url || "#contact";
  $("dlgInquiry").classList.toggle("hidden", current.status === "sold");
}

async function toggleInterest(id) {
  const character = characters.find((item) => item.id === id);
  if (!character || character.status !== "available") return;
  const before = mine.has(id);
  before ? mine.delete(id) : mine.add(id);
  character.interest_count = Math.max(0, Number(character.interest_count || 0) + (before ? -1 : 1));
  localStorage.setItem("soul_interests", JSON.stringify([...mine]));
  render();
  syncDialog();
  const { data, error } = await sb.rpc("toggle_site_interest", {
    p_character_id: id,
    p_visitor_id: visitor,
  });
  if (error) {
    before ? mine.add(id) : mine.delete(id);
    character.interest_count = Math.max(0, character.interest_count + (before ? 1 : -1));
    render();
    syncDialog();
    return;
  }
  character.interest_count = Number(data.count);
  data.active ? mine.add(id) : mine.delete(id);
  render();
  syncDialog();
  track("interest_click", id);
}

async function track(name, characterId = null) {
  if (!sb) return;
  const params = new URLSearchParams(location.search);
  await sb.rpc("track_site_event", {
    p_event_id: crypto.randomUUID(),
    p_event_name: name,
    p_session_id: visitor,
    p_character_id: characterId,
    p_page: location.pathname,
    p_referrer: document.referrer || null,
    p_utm_source: params.get("utm_source"),
    p_utm_medium: params.get("utm_medium"),
    p_utm_campaign: params.get("utm_campaign"),
  });
}

async function load() {
  if (!sb) {
    $("grid").innerHTML = '<p class="muted">config.jsに接続情報を入力すると表示されます。</p>';
    return;
  }
  const [settingsResult, charactersResult] = await Promise.all([
    sb.from("site_settings").select("key,value"),
    sb.rpc("get_public_characters"),
  ]);
  if (settingsResult.error || charactersResult.error) {
    $("grid").innerHTML = '<p class="muted">読み込みに失敗しました。</p>';
    return;
  }
  settings = Object.fromEntries((settingsResult.data || []).map((item) => [item.key, item.value]));
  characters = charactersResult.data || [];
  applySettings();
  render();
  track("page_view");
}

$("showImage").onclick = () => switchMedia("image");
$("showVideo").onclick = () => switchMedia("video");
$("closeDialog").onclick = () => $("dlg").close();
$("dlg").addEventListener("close", () => $("dlgVideo").pause());
$("dlgInterest").onclick = () => current && toggleInterest(current.id);
$("dlgInquiry").onclick = () => current && track("inquiry_click", current.id);
$("contactButton").onclick = () => track("inquiry_click");
load();
