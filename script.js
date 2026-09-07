/* LevelOne PS Rental — GitHub Pages + Supabase */
const SUPABASE_CONFIG = window.LEVELONE_SUPABASE || {};
const SUPABASE_READY = Boolean(
  SUPABASE_CONFIG.url &&
  SUPABASE_CONFIG.anonKey &&
  !SUPABASE_CONFIG.url.includes("MASUKKAN") &&
  !SUPABASE_CONFIG.anonKey.includes("MASUKKAN")
);
const sb = SUPABASE_READY ? window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey) : null;

const ADMIN_EMAIL = "admin@levelone.local";
const ADMIN_USERNAME = "admin";
let stations = [];
let adminFilter = "all";
let isAdmin = false;
let loading = false;

const FALLBACK_STATIONS = [
  ...Array.from({length: 8}, (_, i) => ({id: i + 1, type: "PS 3", station_number: i + 1, status: "available", end_at: null})),
  ...Array.from({length: 4}, (_, i) => ({id: i + 9, type: "PS 4", station_number: i + 1, status: "available", end_at: null}))
];

function statusLabel(s){
  return s.status === "available" ? "TERSEDIA" : s.status === "occupied" ? "TERISI" : "TIDAK AKTIF";
}

function remaining(s){
  if(s.status !== "occupied" || !s.end_at) return null;
  const ms = new Date(s.end_at).getTime() - Date.now();
  return ms > 0 ? ms : null;
}

function fmt(ms){
  let sec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(sec / 3600);
  sec %= 3600;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return h > 0 ? `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}` : `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

function cloneFallback(){ return FALLBACK_STATIONS.map(s => ({...s})); }

// Jangan me-render ulang panel admin ketika input durasi sedang aktif.
// Polling database sebelumnya mengganti elemen <input> setiap 3 detik,
// sehingga keyboard mobile/iOS langsung tertutup dan fokus hilang.
function isDurationInputActive(){
  const el = document.activeElement;
  return !!el && el.matches && el.matches('.admin-time input');
}

async function loadState({silent=false} = {}){
  if(!sb){
    if(!stations.length) stations = cloneFallback();
    renderPublic();
    if(isAdmin){ renderAdmin(); loadReport(); }
    return;
  }
  try{
    const {data, error} = await sb.from("stations").select("id,type,station_number,status,end_at").order("type").order("station_number");
    if(error) throw error;
    if(Array.isArray(data) && data.length) stations = data;
    renderPublic();
    if(isAdmin && !isDurationInputActive()) renderAdmin();
  }catch(err){
    if(!stations.length) stations = cloneFallback();
    renderPublic();
    if(isAdmin && !isDurationInputActive()){
      renderAdmin();
      const note = document.querySelector(".admin-note");
      if(note) note.textContent = "Database belum tersambung. Periksa konfigurasi Supabase dan aturan RLS.";
    }
    if(!silent) console.warn("Gagal mengambil data station dari Supabase.", err);
  }
}

function renderPublic(){
  const p3 = document.getElementById("ps3Grid");
  const p4 = document.getElementById("ps4Grid");
  if(!p3 || !p4) return;
  p3.innerHTML = "";
  p4.innerHTML = "";

  stations.forEach(s => {
    const rem = remaining(s);
    const label = statusLabel(s);
    const time = s.status === "available" ? "Siap dimainkan" : s.status === "offline" ? "Sedang tidak aktif" : (rem ? fmt(rem) : "00:00");
    const card = document.createElement("div");
    card.className = `station ${s.status}`;
    const deviceState = s.status === "occupied" ? "on" : "off";
    card.innerHTML = `<div class="station-top"><span class="station-id">Station ${s.station_number}</span><span class="status"><i class="status-dot"></i>${label}</span></div><div class="station-devices ${deviceState}" aria-label="Perangkat station"><div class="tv-unit" aria-hidden="true"><span class="tv-screen"><span class="tv-game-glow"></span></span><span class="tv-led"></span><span class="tv-stand"></span></div><div class="station-controller" aria-hidden="true"><span class="controller-photo"><img src="controller.png" alt="Stik PlayStation"><i class="controller-led"></i></span></div></div><div class="device-state"><span class="device-light"></span><span class="device-label">TV ${s.status === "occupied" ? "NYALA" : "MATI"}</span><span class="device-sep">•</span><span class="device-label">STIK ${s.status === "occupied" ? "NYALA" : "MATI"}</span></div><div class="countdown">${time}</div>`;
    (s.type === "PS 3" ? p3 : p4).appendChild(card);
  });

  document.getElementById("heroAvailable").textContent = stations.filter(s => s.status === "available").length;
  const bars = document.getElementById("heroBars");
  bars.innerHTML = "";
  stations.forEach(s => {
    const i = document.createElement("i");
    i.className = s.status === "occupied" ? "used" : s.status === "offline" ? "off" : "";
    bars.appendChild(i);
  });
}

function renderAdmin(){
  if(!isAdmin) return;
  const ag = document.getElementById("adminGrid");
  if(!ag) return;
  ag.innerHTML = "";
  const visible = stations.filter(s => adminFilter === "all" || s.type === adminFilter);
  document.getElementById("countAvailable").textContent = stations.filter(s => s.status === "available").length;
  document.getElementById("countOccupied").textContent = stations.filter(s => s.status === "occupied").length;
  document.getElementById("countOffline").textContent = stations.filter(s => s.status === "offline").length;

  visible.forEach(s => {
    const rem = remaining(s);
    const ac = document.createElement("div");
    ac.className = "admin-card";
    ac.innerHTML = `<div class="admin-line"><strong>${s.type} • Station ${s.station_number}</strong><span class="status">${statusLabel(s)}${rem ? ` • ${fmt(rem)}` : ""}</span></div><div class="admin-controls"><button class="${s.status === "available" ? "active" : ""}" onclick="setStatus(${s.id},'available')">Tersedia</button><button class="${s.status === "occupied" ? "active" : ""}" onclick="setStatus(${s.id},'occupied')">Terisi</button><button class="${s.status === "offline" ? "active" : ""}" onclick="setStatus(${s.id},'offline')">Tidak Aktif</button></div><div class="admin-time"><input id="time-${s.id}" type="number" min="1" max="9999" placeholder="Durasi (menit)"><button onclick="setMinutes(${s.id})">Simpan</button></div>`;
    ag.appendChild(ac);
  });
}

function ratePer30(type){ return type === "PS 4" ? 5000 : 3000; }
function priceForDuration(type, minutes){
  const is4 = type === "PS 4";
  const half = is4 ? 5000 : 3000;
  const hour = is4 ? 8000 : 5000;
  const twoHour = is4 ? 16000 : 10000;
  minutes = Number(minutes || 0);
  if(minutes === 30) return half;
  if(minutes === 60) return hour;
  if(minutes === 120) return twoHour;
  if(minutes < 30 || minutes % 30 !== 0) return null;
  let remaining = minutes;
  let amount = 0;
  if(remaining >= 120){ const blocks = Math.floor(remaining / 120); amount += blocks * twoHour; remaining -= blocks * 120; }
  if(remaining >= 60){ const blocks = Math.floor(remaining / 60); amount += blocks * hour; remaining -= blocks * 60; }
  if(remaining === 30) amount += half;
  return amount;
}
function chooseDuration(id, minutes){
  const input = document.getElementById(`time-${id}`);
  if(!input) return;
  input.value = minutes;
  input.dispatchEvent(new Event('change', {bubbles:true}));
}
function formatRupiah(n){ return new Intl.NumberFormat("id-ID", {style:"currency", currency:"IDR", maximumFractionDigits:0}).format(Math.round(n || 0)); }
function localDateInputValue(date = new Date()){
  const y = date.getFullYear(); const m = String(date.getMonth()+1).padStart(2,"0"); const d = String(date.getDate()).padStart(2,"0");
  return `${y}-${m}-${d}`;
}
function selectedReportDate(){ return document.getElementById("reportDate")?.value || localDateInputValue(); }
function dayBounds(dateStr){
  const [y,m,d] = dateStr.split("-").map(Number);
  const start = new Date(y, m-1, d, 0,0,0,0);
  const end = new Date(y, m-1, d+1, 0,0,0,0);
  return {start, end};
}

async function recordSession(station, minutes){
  if(!sb) return;
  const amount = priceForDuration(station.type, minutes);
  if(amount == null) throw new Error("Durasi harus kelipatan 30 menit.");
  const now = new Date().toISOString();
  const {data: active, error: findError} = await sb.from("play_sessions").select("id").eq("station_id", station.id).is("ended_at", null).maybeSingle();
  if(findError) throw findError;
  if(active?.id){
    const {error} = await sb.from("play_sessions").update({duration_minutes: minutes, amount, price_per_30min: ratePer30(station.type), updated_at: now}).eq("id", active.id);
    if(error) throw error;
  }else{
    const {error} = await sb.from("play_sessions").insert({station_id: station.id, type: station.type, station_number: station.station_number, started_at: now, duration_minutes: minutes, amount, price_per_30min: ratePer30(station.type)});
    if(error) throw error;
  }
}

async function closeActiveSession(stationId){
  if(!sb) return;
  const {error} = await sb.from("play_sessions").update({ended_at:new Date().toISOString(), updated_at:new Date().toISOString()}).eq("station_id", stationId).is("ended_at", null);
  if(error) throw error;
}

async function updateStation(id, status, minutes = null){
  if(!sb) throw new Error("Supabase belum dikonfigurasi. Isi supabase-config.js terlebih dahulu.");
  const station = stations.find(s => Number(s.id) === Number(id));
  if(!station) throw new Error("Station tidak ditemukan.");
  const end_at = status === "occupied" && minutes ? new Date(Date.now() + minutes * 60000).toISOString() : null;
  const {error} = await sb.from("stations").update({status, end_at, updated_at: new Date().toISOString()}).eq("id", id);
  if(error) throw error;
  if(status === "occupied") await recordSession(station, minutes);
  else await closeActiveSession(id);
}

async function setStatus(id, status){
  if(loading) return;
  let minutes = null;
  if(status === "occupied"){
    minutes = parseInt(document.getElementById(`time-${id}`)?.value || "60", 10);
    if(!minutes || minutes < 30 || minutes % 30 !== 0){ alert("Durasi harus kelipatan 30 menit (30, 60, 90, dst.)."); return; }
  }
  try{
    loading = true;
    await updateStation(id, status, minutes);
    await loadState();
    if(isAdmin) await loadReport();
  }catch(err){ alert(err.message || "Gagal mengubah station."); }
  finally{ loading = false; }
}

async function setMinutes(id){
  const input = document.getElementById(`time-${id}`);
  const minutes = parseInt(input?.value || "", 10);
  if(!minutes || minutes < 30 || minutes % 30 !== 0){ alert("Durasi harus kelipatan 30 menit (30, 60, 90, dst.)."); return; }
  try{
    loading = true;
    await updateStation(id, "occupied", minutes);
    await loadState();
    if(isAdmin) await loadReport();
  }catch(err){ alert(err.message || "Gagal menyimpan durasi."); }
  finally{ loading = false; }
}

async function resetStations(){
  if(!confirm("Atur ulang semua station menjadi Tersedia?")) return;
  if(!sb){ alert("Supabase belum dikonfigurasi."); return; }
  try{
    loading = true;
    const now = new Date().toISOString();
    const {error} = await sb.from("stations").update({status:"available", end_at:null, updated_at:now}).not("id","is",null);
    if(error) throw error;
    const {error: closeError} = await sb.from("play_sessions").update({ended_at:now, updated_at:now}).is("ended_at", null);
    if(closeError) throw closeError;
    await loadState();
    await loadReport();
  }catch(err){ alert(err.message || "Gagal mengatur ulang station."); }
  finally{ loading = false; }
}

async function loadReport(){
  if(!isAdmin || !sb) return;
  const dateStr = selectedReportDate();
  const {start, end} = dayBounds(dateStr);
  const {data, error} = await sb.from("play_sessions").select("id,station_id,type,station_number,started_at,ended_at,duration_minutes,amount,price_per_30min").lt("started_at", end.toISOString()).or(`ended_at.is.null,ended_at.gt.${start.toISOString()}`).order("started_at", {ascending:true});
  if(error){ console.warn("Gagal mengambil rekap harian", error); return; }
  const rows = data || [];
  const totals = {};
  stations.forEach(st => totals[`${st.type}-${st.station_number}`] = {type:st.type, station_number:st.station_number, minutes:0, revenue:0, sessions:0});
  rows.forEach(row => {
    const startAt = new Date(row.started_at);
    const plannedEnd = new Date(startAt.getTime() + Number(row.duration_minutes || 0) * 60000);
    const actualEnd = row.ended_at ? new Date(row.ended_at) : plannedEnd;
    const playEnd = actualEnd < plannedEnd ? actualEnd : plannedEnd;
    const overlapStart = startAt > start ? startAt : start;
    const overlapEnd = playEnd < end ? playEnd : end;
    const mins = Math.max(0, (overlapEnd - overlapStart) / 60000);
    if(!mins) return;
    const key = `${row.type}-${row.station_number}`;
    if(!totals[key]) totals[key] = {type:row.type, station_number:row.station_number, minutes:0, revenue:0, sessions:0};
    totals[key].minutes += mins;
    totals[key].revenue += (Number(row.amount || 0) * mins / Math.max(1, Number(row.duration_minutes || 0)));
    totals[key].sessions += 1;
  });
  const list = Object.values(totals).sort((a,b)=>a.type.localeCompare(b.type) || a.station_number-b.station_number);
  const totalMinutes = list.reduce((n,r)=>n+r.minutes,0);
  const totalRevenue = list.reduce((n,r)=>n+r.revenue,0);
  const totalSessions = list.reduce((n,r)=>n+r.sessions,0);
  const totalHours = `${Math.floor(totalMinutes/60)} jam ${Math.round(totalMinutes%60)} menit`;
  const el = id => document.getElementById(id);
  if(el("reportTotalHours")) el("reportTotalHours").textContent = totalHours;
  if(el("reportTotalRevenue")) el("reportTotalRevenue").textContent = formatRupiah(totalRevenue);
  if(el("reportTotalSessions")) el("reportTotalSessions").textContent = totalSessions;
  const rg = el("reportGrid"); if(!rg) return;
  rg.innerHTML = list.map(r => `<div class="report-row"><strong>${r.type} • Station ${r.station_number}</strong><span>${Math.floor(r.minutes/60)} jam ${Math.round(r.minutes%60)} menit</span><b>${formatRupiah(r.revenue)}</b></div>`).join("");
  const label = el("reportDateLabel"); if(label){ const dt = new Date(start); label.textContent = dt.toLocaleDateString("id-ID", {weekday:"long", year:"numeric", month:"long", day:"numeric"}); }
}

async function loginAdmin(e){
  e.preventDefault();
  const u = document.getElementById("adminUsername").value.trim().toLowerCase();
  const p = document.getElementById("adminPassword").value;
  const err = document.getElementById("loginError");
  err.textContent = "";
  if(!sb){ err.textContent = "Sistem online belum dikonfigurasi. Isi supabase-config.js."; return; }
  if(u !== ADMIN_USERNAME){ err.textContent = "Username admin tidak sesuai."; return; }
  try{
    const {data, error} = await sb.auth.signInWithPassword({email: ADMIN_EMAIL, password:p});
    if(error) throw error;
    if(!data.user || data.user.email !== ADMIN_EMAIL) throw new Error("Akun tidak memiliki akses admin.");
    isAdmin = true;
    document.getElementById("adminPassword").value = "";
    updateAdminVisibility();
    await loadState();
  }catch(error){ err.textContent = "Login gagal. Pastikan akun admin Supabase sudah dibuat dengan benar."; }
}

async function logoutAdmin(){
  if(sb) await sb.auth.signOut();
  isAdmin = false;
  updateAdminVisibility();
  document.getElementById("loginError").textContent = "";
}

function updateAdminVisibility(){
  document.getElementById("loginPanel").hidden = isAdmin;
  document.getElementById("adminPanel").hidden = !isAdmin;
  if(isAdmin){ renderAdmin(); loadReport(); }
}

async function checkAuth(){
  if(!sb){ isAdmin = false; updateAdminVisibility(); return; }
  try{
    const {data} = await sb.auth.getSession();
    const user = data?.session?.user;
    isAdmin = !!user && user.email === ADMIN_EMAIL;
  }catch(_){ isAdmin = false; }
  updateAdminVisibility();
}

const adminModal = document.getElementById("adminModal");
const adminOpen = document.getElementById("adminOpen");
const adminClose = document.getElementById("adminClose");
function openAdminModal(){
  adminModal.classList.add("open");
  adminModal.setAttribute("aria-hidden","false");
  document.body.classList.add("modal-open");
  if(isAdmin){ renderAdmin(); loadReport(); }
  setTimeout(() => document.getElementById(isAdmin ? "adminClose" : "adminUsername")?.focus(), 30);
}
function closeAdminModal(){
  adminModal.classList.remove("open");
  adminModal.setAttribute("aria-hidden","true");
  document.body.classList.remove("modal-open");
}
adminOpen.addEventListener("click", openAdminModal);
adminClose.addEventListener("click", closeAdminModal);
adminModal.addEventListener("click", e => { if(e.target.matches("[data-admin-close]")) closeAdminModal(); });
document.addEventListener("keydown", e => { if(e.key === "Escape" && adminModal.classList.contains("open")) closeAdminModal(); });
document.getElementById("resetBtn").addEventListener("click", resetStations);
document.getElementById("logoutBtn").addEventListener("click", logoutAdmin);
document.querySelectorAll(".filter").forEach(btn => btn.addEventListener("click", () => {
  document.querySelectorAll(".filter").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  adminFilter = btn.dataset.filter;
  renderAdmin();
}));
document.getElementById("loginForm").addEventListener("submit", loginAdmin);
const reportDate = document.getElementById("reportDate");
if(reportDate){ reportDate.value = localDateInputValue(); reportDate.addEventListener("change", loadReport); }

(async function init(){
  stations = cloneFallback();
  renderPublic();
  await checkAuth();
  await loadState();
  if(sb) sb.auth.onAuthStateChange((_event, session) => {
    isAdmin = !!session?.user && session.user.email === ADMIN_EMAIL;
    updateAdminVisibility();
  });
  setInterval(() => renderPublic(), 1000);
  setInterval(() => loadState({silent:true}), 3000);
})();
