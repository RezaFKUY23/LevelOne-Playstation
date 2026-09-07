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

async function loadState({silent=false} = {}){
  if(!sb){
    if(!stations.length) stations = cloneFallback();
    renderPublic();
    if(isAdmin) renderAdmin();
    return;
  }
  try{
    const {data, error} = await sb.from("stations").select("id,type,station_number,status,end_at").order("type").order("station_number");
    if(error) throw error;
    if(Array.isArray(data) && data.length) stations = data;
    renderPublic();
    if(isAdmin) renderAdmin();
  }catch(err){
    if(!stations.length) stations = cloneFallback();
    renderPublic();
    if(isAdmin){
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

async function updateStation(id, status, minutes = null){
  if(!sb) throw new Error("Supabase belum dikonfigurasi. Isi supabase-config.js terlebih dahulu.");
  const end_at = status === "occupied" && minutes ? new Date(Date.now() + minutes * 60000).toISOString() : null;
  const {error} = await sb.from("stations").update({status, end_at, updated_at: new Date().toISOString()}).eq("id", id);
  if(error) throw error;
}

async function setStatus(id, status){
  if(loading) return;
  let minutes = null;
  if(status === "occupied"){
    minutes = parseInt(document.getElementById(`time-${id}`)?.value || "60", 10);
    if(!minutes || minutes < 1){ alert("Masukkan durasi minimal 1 menit."); return; }
  }
  try{
    loading = true;
    await updateStation(id, status, minutes);
    await loadState();
  }catch(err){ alert(err.message || "Gagal mengubah station."); }
  finally{ loading = false; }
}

async function setMinutes(id){
  const input = document.getElementById(`time-${id}`);
  const minutes = parseInt(input?.value || "", 10);
  if(!minutes || minutes < 1){ alert("Masukkan durasi minimal 1 menit."); return; }
  try{
    loading = true;
    await updateStation(id, "occupied", minutes);
    await loadState();
  }catch(err){ alert(err.message || "Gagal menyimpan durasi."); }
  finally{ loading = false; }
}

async function resetStations(){
  if(!confirm("Atur ulang semua station menjadi Tersedia?")) return;
  if(!sb){ alert("Supabase belum dikonfigurasi."); return; }
  try{
    loading = true;
    const {error} = await sb.from("stations").update({status:"available", end_at:null, updated_at:new Date().toISOString()}).not("id","is",null);
    if(error) throw error;
    await loadState();
  }catch(err){ alert(err.message || "Gagal mengatur ulang station."); }
  finally{ loading = false; }
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
  if(isAdmin) renderAdmin();
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
  if(isAdmin) renderAdmin();
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
