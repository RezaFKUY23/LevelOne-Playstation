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
let reportPeriod = "day";
let currentReportRows = [];
const durationDrafts = new Map();

const FALLBACK_STATIONS = [
  ...[1,2,3,4,8,9,10,11].map((n, i) => ({id: i + 1, type: "PS 3", station_number: n, status: "available", end_at: null})),
  ...[5,6,7,12].map((n, i) => ({id: i + 9, type: "PS 4", station_number: n, status: "available", end_at: null}))
];

function statusLabel(s){
  return s.status === "available" ? "TERSEDIA" : s.status === "occupied" ? "TERISI" : "PERBAIKAN";
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
  if(el && el.matches && el.matches('.admin-time input')) return true;
  return Array.from(document.querySelectorAll('.admin-time input')).some(input => String(input.value || '').trim() !== '');
}

function rememberDuration(id, value){
  const normalized = String(value ?? '').trim();
  if(normalized) durationDrafts.set(Number(id), normalized);
  else durationDrafts.delete(Number(id));
}

function clearDurationDraft(id){ durationDrafts.delete(Number(id)); }

async function loadState({silent=false, renderAdminPanel=true} = {}){
  if(!sb){
    if(!stations.length) stations = cloneFallback();
    renderPublic();
    if(isAdmin){ renderAdmin(); }
    return;
  }
  try{
    const {data, error} = await sb.from("stations").select("id,type,station_number,status,end_at").order("type").order("station_number");
    if(error) throw error;
    if(Array.isArray(data) && data.length) stations = data;
    renderPublic();
    // Polling realtime tidak boleh mengganti DOM panel admin saat pengguna
    // sedang mengetik durasi. Bahkan ketika keyboard baru saja dibuka,
    // panel admin dibiarkan utuh sampai aksi admin selesai.
    if(isAdmin && renderAdminPanel && !isDurationInputActive()) renderAdmin();
  }catch(err){
    if(!stations.length) stations = cloneFallback();
    renderPublic();
    if(isAdmin && renderAdminPanel && !isDurationInputActive()){
      renderAdmin();
      const note = document.querySelector(".admin-note");
      if(note) note.textContent = "Database belum tersambung. Periksa konfigurasi Supabase dan aturan RLS.";
    }
    if(!silent) console.warn("Gagal mengambil data station dari Supabase.", err);
  }
}

// Render penuh semua card — hanya dipanggil saat status berubah atau pertama load
function renderPublic(){
  const p3 = document.getElementById("ps3Grid");
  const p4 = document.getElementById("ps4Grid");
  if(!p3 || !p4) return;

  // Auto-complete dulu sebelum render
  let anyCompleted = false;
  stations.forEach(s => {
    if(s.status === "occupied" && s.end_at && remaining(s) === null){
      s.status = "available";
      s.end_at = null;
      anyCompleted = true;
      if(sb){
        const now = new Date().toISOString();
        sb.from("stations").update({status:"available", end_at:null, updated_at:now}).eq("id", s.id).then(({error}) => {
          if(error) console.warn("Auto-complete gagal:", error);
        });
      }
    }
  });

  p3.innerHTML = "";
  p4.innerHTML = "";

  stations.forEach(s => {
    const rem = remaining(s);
    const label = statusLabel(s);
    const time = s.status === "available" ? "Siap dimainkan" : s.status === "offline" ? "Sedang perbaikan" : (rem ? fmt(rem) : "00:00");
    const endClock = s.status === "occupied" && s.end_at ? formatClock(s.end_at) : "—";
    const card = document.createElement("div");
    card.className = `station ${s.status}`;
    card.dataset.stationId = s.id;
    const deviceState = s.status === "occupied" ? "on" : "off";
    const controllerImage = s.type === "PS 3" ? "controller-ps3.png" : "controller.png";
    const activityText = s.status === "offline" ? "Perbaikan" : "Sedang Bermain";
    card.innerHTML = `<div class="station-top"><span class="station-id">Station ${s.station_number}</span><span class="status"><i class="status-dot"></i>${label}</span></div><div class="station-devices ${deviceState}" aria-label="Perangkat station"><div class="tv-unit" aria-hidden="true"><span class="tv-screen"><img class="tv-logo-photo" src="tv-logo.png?v=2" alt=""><span class="tv-game-glow"></span></span><span class="tv-led"></span><span class="tv-stand"></span></div><div class="station-controller" aria-hidden="true"><span class="controller-photo ${s.type === "PS 3" ? "ps3-controller" : "ps4-controller"}"><img src="${controllerImage}" alt="Stik PlayStation"><i class="controller-led" aria-hidden="true"></i></span></div></div><div class="device-state ${s.status}"><span class="device-light"></span><span class="device-label">${activityText}</span></div><div class="countdown" data-countdown="${s.id}">${time}</div>${s.status === "occupied" ? `<div class="public-endtime">Estimasi habis: <strong data-endclock="${s.id}">${endClock}</strong></div>` : ""}`;
    (s.type === "PS 3" ? p3 : p4).appendChild(card);
  });

  updateHeroStats();
}

// Tick tiap detik — hanya update teks countdown, tidak re-render card
function tickCountdowns(){
  let needFullRender = false;
  stations.forEach(s => {
    if(s.status === "occupied" && s.end_at){
      const rem = remaining(s);
      if(rem === null){
        // Waktu habis — butuh full render untuk ganti class card
        needFullRender = true;
        return;
      }
      const el = document.querySelector(`[data-countdown="${s.id}"]`);
      if(el) el.textContent = fmt(rem);
    }
  });
  if(needFullRender) renderPublic();
}

function updateHeroStats(){
  const ps3 = stations.filter(s => s.type === "PS 3");
  const ps4 = stations.filter(s => s.type === "PS 4");
  document.getElementById("heroAvailablePS3").textContent = ps3.filter(s => s.status === "available").length;
  document.getElementById("heroAvailablePS4").textContent = ps4.filter(s => s.status === "available").length;
  const barsPS3 = document.getElementById("heroBarsPS3");
  barsPS3.innerHTML = "";
  ps3.forEach(s => {
    const i = document.createElement("i");
    i.className = s.status === "occupied" ? "used" : s.status === "offline" ? "off" : "";
    barsPS3.appendChild(i);
  });
  const barsPS4 = document.getElementById("heroBarsPS4");
  barsPS4.innerHTML = "";
  ps4.forEach(s => {
    const i = document.createElement("i");
    i.className = s.status === "occupied" ? "used" : s.status === "offline" ? "off" : "";
    barsPS4.appendChild(i);
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
    ac.className = `admin-card status-${s.status}`;
    const endClock = s.status === "occupied" && s.end_at ? formatClock(s.end_at) : "—";
    ac.innerHTML = `<div class="admin-line"><div class="admin-station-title"><strong>${s.type} • Station ${s.station_number}</strong><span class="status-pill ${s.status}"><i></i>${statusLabel(s)}</span></div><span class="status-remaining">${rem ? fmt(rem) : ""}</span></div><div class="admin-controls"><button class="${s.status === "available" ? "active" : ""}" onclick="setStatus(${s.id},'available')">Tersedia</button><button class="${s.status === "occupied" ? "active" : ""}" onclick="setStatus(${s.id},'occupied')">Terisi</button><button class="${s.status === "offline" ? "active" : ""}" onclick="setStatus(${s.id},'offline')">Perbaikan</button></div><div class="duration-options"><button type="button" onclick="chooseDuration(${s.id},30)">30 Menit</button><button type="button" onclick="chooseDuration(${s.id},60)">1 Jam</button><button type="button" onclick="chooseDuration(${s.id},120)">2 Jam</button></div><div class="admin-time"><input id="time-${s.id}" type="number" min="30" step="30" max="9999" placeholder="Durasi (menit)" value="${durationDrafts.get(Number(s.id)) || ''}" oninput="rememberDuration(${s.id}, this.value); previewEndTime(${s.id})"><button onclick="setMinutes(${s.id})">Simpan</button></div>${s.status === "occupied" ? `<div class="extend-box"><div class="extend-head"><div><span class="extend-kicker">WAKTU TAMBAHAN</span><strong>Perpanjang sesi</strong></div><small>Tanpa reset waktu</small></div><div class="extend-options"><button type="button" data-station-id="${s.id}" data-minutes="30" onclick="addTime(${s.id},30)"><b>+30</b><span>menit</span></button><button type="button" data-station-id="${s.id}" data-minutes="60" onclick="addTime(${s.id},60)"><b>+1</b><span>jam</span></button><button type="button" data-station-id="${s.id}" data-minutes="120" onclick="addTime(${s.id},120)"><b>+2</b><span>jam</span></button></div><div class="extend-custom"><input id="extend-${s.id}" type="number" min="30" step="30" max="9999" placeholder="Menit lainnya"><button onclick="addCustomTime(${s.id})">Tambah</button></div><div class="reduce-head"><div><span class="extend-kicker">KURANGI WAKTU</span><strong>Koreksi sesi</strong></div><small>Untuk salah pencet durasi</small></div><div class="reduce-options"><button type="button" data-station-id="${s.id}" data-minutes="30" onclick="removeTime(${s.id},30)"><b>−30</b><span>menit</span></button><button type="button" data-station-id="${s.id}" data-minutes="60" onclick="removeTime(${s.id},60)"><b>−1</b><span>jam</span></button><button type="button" data-station-id="${s.id}" data-minutes="120" onclick="removeTime(${s.id},120)"><b>−2</b><span>jam</span></button></div><div class="extend-custom reduce-custom"><input id="reduce-${s.id}" type="number" min="30" step="30" max="9999" placeholder="Kurangi menit"><button onclick="removeCustomTime(${s.id})">Kurangi</button></div></div>` : ""}<div class="admin-endtime" id="endtime-${s.id}"><span>Estimasi selesai</span><strong>${endClock}</strong>${s.status === "occupied" ? `<button class="finish-btn" onclick="finishSession(${s.id})">✓ Selesai Main</button>` : ""}</div>`;

    ag.appendChild(ac);
  });
}

function ratePer30(type){ return type === "PS 4" ? 4000 : 3000; }
function priceForDuration(type, minutes){
  const is4 = type === "PS 4";
  const half = is4 ? 4000 : 3000;
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
  rememberDuration(id, minutes);
  input.dispatchEvent(new Event('input', {bubbles:true}));
}
function formatRupiah(n){ return new Intl.NumberFormat("id-ID", {style:"currency", currency:"IDR", maximumFractionDigits:0}).format(Math.round(n || 0)); }
function formatClock(value){
  if(!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  return d.toLocaleTimeString("id-ID", {hour:"2-digit", minute:"2-digit", hour12:false});
}
function previewEndTime(id){
  const input = document.getElementById(`time-${id}`);
  const box = document.getElementById(`endtime-${id}`);
  if(!input || !box) return;
  const minutes = parseInt(input.value || "0", 10);
  if(!minutes || minutes < 30 || minutes % 30 !== 0){
    box.innerHTML = "Estimasi selesai: <strong>—</strong>";
    return;
  }
  const end = new Date(Date.now() + minutes * 60000);
  box.innerHTML = `Estimasi selesai: <strong>${formatClock(end)}</strong>`;
}
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
  // Jangan gunakan maybeSingle() di sini: data lama bisa saja memiliki lebih
  // dari satu sesi aktif untuk station yang sama. PostgREST lalu mengembalikan
  // "JSON object requested, multiple (or no) rows returned". Ambil sesi aktif
  // terbaru sebagai sesi yang benar-benar dikendalikan oleh panel admin.
  const {data: activeRows, error: findError} = await sb.from("play_sessions")
    .select("id")
    .eq("station_id", station.id)
    .is("ended_at", null)
    .order("updated_at", {ascending:false})
    .order("started_at", {ascending:false})
    .limit(1);
  if(findError) throw findError;
  const active = activeRows?.[0] || null;
  if(active?.id){
    const {error} = await sb.from("play_sessions").update({started_at: now, ended_at: null, duration_minutes: minutes, amount, price_per_30min: ratePer30(station.type), updated_at: now}).eq("id", active.id);
    if(error) throw error;
  }else{
    const {error} = await sb.from("play_sessions").insert({station_id: station.id, type: station.type, station_number: station.station_number, started_at: now, duration_minutes: minutes, amount, price_per_30min: ratePer30(station.type)});
    if(error) throw error;
  }
}

async function closeActiveSession(stationId){
  if(!sb) return;
  const now = new Date().toISOString();
  const {error} = await sb.from("play_sessions").update({ended_at:now, updated_at:now}).eq("station_id", stationId).is("ended_at", null);
  if(error) throw error;
}

function showToast(message, type="success") {
  let toast = document.getElementById("leveloneToast");
  if(!toast){
    toast = document.createElement("div");
    toast.id = "leveloneToast";
    toast.className = "levelone-toast";
    document.body.appendChild(toast);
  }
  toast.className = `levelone-toast ${type}`;
  toast.textContent = message;
  requestAnimationFrame(() => toast.classList.add("show"));
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function markExtendButton(id, minutes){
  const buttons = document.querySelectorAll(`.extend-options button[data-station-id="${id}"]`);
  buttons.forEach(btn => {
    if(Number(btn.dataset.minutes) !== Number(minutes)) return;
    const original = btn.innerHTML;
    btn.classList.add("added");
    btn.innerHTML = `<b>✓</b><span>Ditambahkan</span>`;
    setTimeout(() => {
      btn.classList.remove("added");
      btn.innerHTML = original;
    }, 1600);
  });
}

async function extendSession(id, minutes){
  if(loading) return;
  minutes = Number(minutes);
  if(!minutes || minutes < 30 || minutes % 30 !== 0){ showToast("Tambahan waktu harus kelipatan 30 menit.", "error"); return; }
  const station = stations.find(s => Number(s.id) === Number(id));
  if(!station || station.status !== "occupied" || !station.end_at){ return; }
  if(!sb){ showToast("Supabase belum dikonfigurasi.", "error"); return; }
  try{
    loading = true;
    const now = new Date().toISOString();
    const currentEnd = new Date(station.end_at);
    const newEnd = new Date(currentEnd.getTime() + minutes * 60000);
    // Ambil hanya sesi aktif terbaru agar data historis yang terduplikasi
    // tidak membuat Supabase menolak response sebagai single JSON object.
    const {data: activeRows, error: findError} = await sb.from("play_sessions")
      .select("id,duration_minutes,amount")
      .eq("station_id", station.id)
      .is("ended_at", null)
      .order("updated_at", {ascending:false})
      .order("started_at", {ascending:false})
      .limit(1);
    if(findError) throw findError;
    const active = activeRows?.[0] || null;
    if(!active?.id) throw new Error("Sesi aktif tidak ditemukan.");
    const addAmount = priceForDuration(station.type, minutes);
    if(addAmount == null) throw new Error("Tambahan waktu harus kelipatan 30 menit.");
    const {error: sessionError} = await sb.from("play_sessions").update({duration_minutes:Number(active.duration_minutes||0)+minutes, amount:Number(active.amount||0)+addAmount, updated_at:now}).eq("id", active.id);
    if(sessionError) throw sessionError;
    const {error: stationError} = await sb.from("stations").update({end_at:newEnd.toISOString(), updated_at:now}).eq("id", id);
    if(stationError) throw stationError;
    const customInput = document.getElementById(`extend-${id}`);
    if(customInput) customInput.value = "";
    markExtendButton(id, minutes);
    showToast(`Waktu +${minutes >= 60 ? `${minutes/60} jam` : `${minutes} menit`} berhasil ditambahkan • selesai ${formatClock(newEnd)}`);
    await loadState();
    if(isAdmin) await loadReport();
  }catch(err){ showToast(err.message || "Gagal menambah waktu.", "error"); }
  finally{ loading = false; }
}
function addTime(id, minutes){ return extendSession(id, minutes); }
function addCustomTime(id){
  const input = document.getElementById(`extend-${id}`);
  const minutes = parseInt(input?.value || "0", 10);
  return extendSession(id, minutes);
}

async function reduceSession(id, minutes){
  if(loading) return;
  minutes = Number(minutes);
  if(!minutes || minutes < 30 || minutes % 30 !== 0){ showToast("Pengurangan waktu harus kelipatan 30 menit.", "error"); return; }
  const station = stations.find(s => Number(s.id) === Number(id));
  if(!station || station.status !== "occupied" || !station.end_at){ return; }
  if(!sb){ showToast("Supabase belum dikonfigurasi.", "error"); return; }
  try{
    loading = true;
    const now = new Date().toISOString();
    const {data: activeRows, error: findError} = await sb.from("play_sessions")
      .select("id,duration_minutes,started_at,amount")
      .eq("station_id", station.id)
      .is("ended_at", null)
      .order("updated_at", {ascending:false})
      .order("started_at", {ascending:false})
      .limit(1);
    if(findError) throw findError;
    const active = activeRows?.[0] || null;
    if(!active?.id) throw new Error("Sesi aktif tidak ditemukan.");
    const currentDuration = Number(active.duration_minutes || 0);
    const newDuration = currentDuration - minutes;
    if(newDuration < 30){
      showToast(`Tidak bisa mengurangi ${minutes} menit. Sisa durasi minimal 30 menit.`, "error");
      return;
    }
    const newEnd = new Date(new Date(station.end_at).getTime() - minutes * 60000);
    if(newEnd.getTime() <= Date.now()){
      showToast("Pengurangan terlalu besar. Waktu selesai harus masih di masa depan.", "error");
      return;
    }
    const newAmount = priceForDuration(station.type, newDuration);
    if(newAmount == null) throw new Error("Durasi aktif harus kelipatan 30 menit.");
    const {error: sessionError} = await sb.from("play_sessions")
      .update({duration_minutes:newDuration, amount:newAmount, updated_at:now})
      .eq("id", active.id);
    if(sessionError) throw sessionError;
    const {error: stationError} = await sb.from("stations")
      .update({end_at:newEnd.toISOString(), updated_at:now})
      .eq("id", id);
    if(stationError) throw stationError;
    const customInput = document.getElementById(`reduce-${id}`);
    if(customInput) customInput.value = "";
    showToast(`Waktu −${minutes >= 60 ? `${minutes/60} jam` : `${minutes} menit`} berhasil dikurangi • selesai ${formatClock(newEnd)}`, "success");
    await loadState();
    if(isAdmin) await loadReport();
  }catch(err){ showToast(err.message || "Gagal mengurangi waktu.", "error"); }
  finally{ loading = false; }
}
function removeTime(id, minutes){ return reduceSession(id, minutes); }
function removeCustomTime(id){
  const input = document.getElementById(`reduce-${id}`);
  const minutes = parseInt(input?.value || "0", 10);
  return reduceSession(id, minutes);
}

async function finishSession(id){
  if(loading) return;
  const station = stations.find(s => Number(s.id) === Number(id));
  if(!station || station.status !== "occupied") return;
  if(!confirm(`Selesaikan main Station ${station.station_number} sekarang? Pemasukan tetap sesuai tarif awal.`)) return;
  try{
    loading = true;
    const now = new Date().toISOString();
    const {error: stationError} = await sb.from("stations").update({status:"available", end_at:null, updated_at:now}).eq("id", id);
    if(stationError) throw stationError;
    await closeActiveSession(id);
    await loadState();
    if(isAdmin) await loadReport();
  }catch(err){ showToast(err.message || "Gagal menyelesaikan sesi.", "error"); }
  finally{ loading = false; }
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
    minutes = parseInt(document.getElementById(`time-${id}`)?.value || "", 10);
    if(!minutes || minutes < 30 || minutes % 30 !== 0){ showToast("Pilih durasi dulu sebelum mengatur station menjadi Terisi.", "error"); return; }
  }
  try{
    loading = true;
    await updateStation(id, status, minutes);
    clearDurationDraft(id);
    const durationInput = document.getElementById(`time-${id}`);
    if(durationInput) durationInput.value = "";
    await loadState();
    if(isAdmin) await loadReport();
    if(status === "occupied") showToast(`Timer Station ${stations.find(s => Number(s.id) === Number(id))?.station_number || ""} berjalan • ${minutes} menit`, "success");
    else showToast(`Station ${stations.find(s => Number(s.id) === Number(id))?.station_number || ""} diubah menjadi ${statusLabel({status})}`, "success");
  }catch(err){ showToast(err.message || "Gagal mengubah station.", "error"); }
  finally{ loading = false; }
}

async function setMinutes(id){
  const input = document.getElementById(`time-${id}`);
  const minutes = parseInt(input?.value || "", 10);
  if(!minutes || minutes < 30 || minutes % 30 !== 0){ showToast("Durasi harus kelipatan 30 menit (30, 60, 90, dst.).", "error"); return; }
  try{
    loading = true;
    await updateStation(id, "occupied", minutes);
    clearDurationDraft(id);
    const durationInput = document.getElementById(`time-${id}`);
    if(durationInput) durationInput.value = "";
    await loadState();
    if(isAdmin) await loadReport();
    const station = stations.find(s => Number(s.id) === Number(id));
    showToast(`Timer Station ${station?.station_number || ""} sudah berjalan • ${minutes} menit • selesai ${station?.end_at ? formatClock(station.end_at) : "—"}`, "success");
  }catch(err){ showToast(err.message || "Gagal menyimpan durasi.", "error"); }
  finally{ loading = false; }
}

async function resetStations(){
  if(!confirm("Atur ulang semua station menjadi Tersedia?")) return;
  if(!sb){ showToast("Supabase belum dikonfigurasi.", "error"); return; }
  try{
    loading = true;
    const now = new Date().toISOString();
    const {error} = await sb.from("stations").update({status:"available", end_at:null, updated_at:now}).not("id","is",null);
    if(error) throw error;
    const {error: closeError} = await sb.from("play_sessions").update({ended_at:now, updated_at:now}).is("ended_at", null);
    if(closeError) throw closeError;
    durationDrafts.clear();
    await loadState();
    await loadReport();
  }catch(err){ showToast(err.message || "Gagal mengatur ulang station.", "error"); }
  finally{ loading = false; }
}

function periodBounds(dateStr, period){
  const [y,m,d] = dateStr.split("-").map(Number);
  const base = new Date(y, m-1, d, 0,0,0,0);
  if(period === "month") return {start:new Date(y,m-1,1), end:new Date(y,m,1)};
  if(period === "year") return {start:new Date(y,0,1), end:new Date(y+1,0,1)};
  if(period === "week"){
    const day = base.getDay();
    const diff = day === 0 ? -6 : 1-day;
    const start = new Date(y,m-1,d+diff);
    const end = new Date(start); end.setDate(start.getDate()+7);
    return {start,end};
  }
  return dayBounds(dateStr);
}

function formatPeriodLabel(start,end,period){
  const a=start.toLocaleDateString("id-ID",{day:"numeric",month:"short",year:"numeric"});
  const b=new Date(end.getTime()-1).toLocaleDateString("id-ID",{day:"numeric",month:"short",year:"numeric"});
  return period === "day" ? start.toLocaleDateString("id-ID",{weekday:"long",year:"numeric",month:"long",day:"numeric"}) : `${a} — ${b}`;
}


function downloadReportPDF(){
  if(!window.jspdf?.jsPDF){
    showToast("Fitur PDF belum siap. Coba lagi sebentar.", "error");
    return;
  }
  const { jsPDF } = window.jspdf;
  const dateStr = selectedReportDate();
  const {start, end} = periodBounds(dateStr, reportPeriod);
  const rows = currentReportRows || [];
  const totalMinutes = rows.reduce((n,r)=>n + Number(r.duration_minutes || 0), 0);
  const totalRevenue = rows.reduce((n,r)=>n + Number(r.amount || 0), 0);
  const totalSessions = rows.length;
  const periodLabel = formatPeriodLabel(start,end,reportPeriod);

  // Thermal-receipt style: compact width, monospaced type, subtle separators.
  const lineH = 4.5;
  const rowLines = rows.reduce((sum,r)=>sum + 4, 0);
  const paperHeight = Math.max(145, 103 + rowLines * lineH);
  const doc = new jsPDF({orientation:"portrait", unit:"mm", format:[80, paperHeight]});
  const x = 5;
  const w = 70;
  const center = 40;
  const rupiah = n => formatRupiah(n).replace(/\u00a0/g," ").replace("Rp","Rp ");
  const sep = (char="-") => char.repeat(46);
  const text = (value, y, size=8, style="normal", align="left") => {
    doc.setFont("courier", style);
    doc.setFontSize(size);
    doc.text(String(value), align === "center" ? center : x, y, {align});
  };
  const twoCol = (label, value, y, size=7.5) => {
    doc.setFont("courier","normal");
    doc.setFontSize(size);
    doc.text(String(label), x, y);
    doc.text(String(value), x+w, y, {align:"right"});
  };

  let y = 9;
  text("LEVELONE PS", y, 13, "bold", "center"); y += 5.5;
  text("PLAY • EAT • ENJOY", y, 7, "normal", "center"); y += 5;
  text(sep("="), y, 7, "normal", "center"); y += 5;
  text("REKAP TRANSAKSI", y, 9, "bold", "center"); y += 5;
  text(periodLabel, y, 6.5, "normal", "center"); y += 5;
  text(sep(), y, 7, "normal", "center"); y += 5;

  twoCol("TRANSAKSI", String(totalSessions), y); y += lineH;
  const h = Math.floor(totalMinutes/60), m = totalMinutes%60;
  twoCol("WAKTU MAIN", `${h}J ${m}M`, y); y += lineH;
  twoCol("TOTAL", rupiah(totalRevenue), y, 8.5); y += 5;
  text(sep("-"), y, 7, "normal", "center"); y += 5;

  if(!rows.length){
    text("BELUM ADA TRANSAKSI", y, 7.5, "bold", "center"); y += 5;
  } else {
    rows.forEach((r, i)=>{
      const started = new Date(r.started_at);
      const plannedEnd = new Date(started.getTime()+Number(r.duration_minutes||0)*60000);
      const finished = r.ended_at ? new Date(r.ended_at) : plannedEnd;
      const endTime = isNaN(finished.getTime()) ? plannedEnd : finished;
      const duration = Number(r.duration_minutes||0);
      const date = started.toLocaleDateString("id-ID",{day:"2-digit",month:"2-digit",year:"numeric"});
      const time = `${formatClock(started)}-${formatClock(endTime)}`;
      const dur = `${Math.floor(duration/60)}J ${duration%60}M`;
      const station = `${r.type} / ST-${r.station_number}`;
      text(`#${String(i+1).padStart(2,"0")}  ${date}`, y, 7.5, "bold"); y += lineH;
      twoCol(station, rupiah(r.amount), y, 7.2); y += lineH;
      twoCol(time, dur, y, 7.2); y += lineH;
      text(sep(), y, 6.5, "normal", "center"); y += lineH;
    });
  }

  text("TOTAL PEMASUKAN", y, 8, "bold"); y += 4.5;
  text(rupiah(totalRevenue), y, 11, "bold", "center"); y += 6;
  text(sep("="), y, 7, "normal", "center"); y += 5;
  text("Terima kasih sudah bermain", y, 7, "normal", "center"); y += 4;
  text("di LEVELONE PS", y, 7, "bold", "center"); y += 6;
  text("Dokumen rekap admin", y, 6, "normal", "center");

  const safeDate = dateStr.replaceAll("-","");
  doc.save(`LEVELONE-Rekap-${reportPeriod}-${safeDate}.pdf`);
  showToast("Rekap PDF berhasil dibuat.");
}
async function loadReport(){
  if(!isAdmin || !sb) return;
  const dateStr = selectedReportDate();
  const {start, end} = periodBounds(dateStr, reportPeriod);
  const {data, error} = await sb.from("play_sessions")
    .select("id,station_id,type,station_number,started_at,ended_at,duration_minutes,amount,price_per_30min")
    .gte("started_at", start.toISOString())
    .lt("started_at", end.toISOString())
    .order("started_at", {ascending:false});
  if(error){ console.warn("Gagal mengambil rekap", error); return; }
  const rows = data || [];
  currentReportRows = rows;
  const totalMinutes = rows.reduce((n,r)=>n + Number(r.duration_minutes || 0), 0);
  const totalRevenue = rows.reduce((n,r)=>n + Number(r.amount || 0), 0);
  const totalSessions = rows.length;
  const el=id=>document.getElementById(id);
  if(el("reportTotalHours")) el("reportTotalHours").textContent=`${Math.floor(totalMinutes/60)} jam ${totalMinutes%60} menit`;
  if(el("reportTotalRevenue")) el("reportTotalRevenue").textContent=formatRupiah(totalRevenue);
  if(el("reportTotalSessions")) el("reportTotalSessions").textContent=totalSessions;
  if(el("reportDateLabel")) el("reportDateLabel").textContent=formatPeriodLabel(start,end,reportPeriod);

  const rg=el("reportGrid");
  if(rg){
    rg.innerHTML = rows.length ? rows.map(r=>{
      const started = new Date(r.started_at);
      const plannedEnd = new Date(started.getTime()+Number(r.duration_minutes||0)*60000);
      const finished = r.ended_at ? new Date(r.ended_at) : plannedEnd;
      const endTime = isNaN(finished.getTime()) ? plannedEnd : finished;
      const duration = Number(r.duration_minutes||0);
      return `<div class="report-row transaction-row">
        <strong>${started.toLocaleDateString("id-ID",{day:"2-digit",month:"2-digit",year:"numeric"})}</strong>
        <span>${r.type} • Station ${r.station_number}</span>
        <span>${formatClock(started)} — ${formatClock(endTime)}</span>
        <span>${Math.floor(duration/60)} jam ${duration%60} menit</span>
        <b>${formatRupiah(r.amount)}</b>
      </div>`;
    }).join("") : `<div class="report-empty">Belum ada transaksi pada periode ini.</div>`;
  }
  await renderRevenueChart(dateStr, reportPeriod);
}

async function renderRevenueChart(dateStr, period){
  const chart=document.getElementById("revenueChart"); if(!chart || !sb) return;
  const {start,end}=periodBounds(dateStr,period);
  const {data,error}=await sb.from("play_sessions").select("started_at,amount,duration_minutes").gte("started_at",start.toISOString()).lt("started_at",end.toISOString()).order("started_at");
  if(error) return;
  const rows=data||[]; const buckets=[];
  if(period === "day") for(let i=0;i<24;i++) buckets.push({label:`${String(i).padStart(2,"0")}:00`,value:0});
  else if(period === "week") for(let i=0;i<7;i++){const d=new Date(start);d.setDate(d.getDate()+i);buckets.push({label:d.toLocaleDateString("id-ID",{weekday:"short"}),value:0});}
  else if(period === "month") { const days=new Date(start.getFullYear(),start.getMonth()+1,0).getDate(); for(let i=0;i<days;i++) buckets.push({label:String(i+1),value:0}); }
  else { for(let i=0;i<12;i++){ const d=new Date(start.getFullYear(),i,1); buckets.push({label:d.toLocaleDateString("id-ID",{month:"short"}),value:0}); } }
  rows.forEach(r=>{const d=new Date(r.started_at); let idx=period==='day'?d.getHours():period==='week'?Math.floor((d-start)/86400000):period==='month'?d.getDate()-1:d.getMonth();if(buckets[idx]) buckets[idx].value += Number(r.amount||0);});
  const max=Math.max(1,...buckets.map(b=>b.value));
  chart.innerHTML=buckets.map(b=>`<div class="chart-bar"><div class="bar-value">${b.value?formatRupiah(b.value):""}</div><div class="bar" style="height:${Math.max(3,(b.value/max)*150)}px" title="${b.label}: ${formatRupiah(b.value)}"></div><span>${b.label}</span></div>`).join("");
  const total=rows.reduce((n,r)=>n+Number(r.amount||0),0);
  const label=document.getElementById("chartTotalLabel"); if(label) label.textContent=formatRupiah(total);
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
  closeReportModal();
  updateAdminVisibility();
  document.getElementById("loginError").textContent = "";
}

function updateAdminVisibility(){
  document.getElementById("loginPanel").hidden = isAdmin;
  document.getElementById("adminPanel").hidden = !isAdmin;
  if(isAdmin){ renderAdmin(); }
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
const reportModal = document.getElementById("reportModal");
const reportOpen = document.getElementById("reportOpen");
const reportClose = document.getElementById("reportClose");
function openAdminModal(){
  if(reportModal) closeReportModal();
  adminModal.classList.add("open");
  adminModal.setAttribute("aria-hidden","false");
  document.body.classList.add("modal-open");
  if(isAdmin){ renderAdmin(); }
  setTimeout(() => document.getElementById(isAdmin ? "adminClose" : "adminUsername")?.focus(), 30);
}
function closeAdminModal(){
  adminModal.classList.remove("open");
  adminModal.setAttribute("aria-hidden","true");
  if(!reportModal?.classList.contains("open")) document.body.classList.remove("modal-open");
}
function openReportModal(){
  if(!isAdmin) { closeReportModal(); openAdminModal(); return; }
  closeAdminModal();
  reportModal.classList.add("open");
  reportModal.setAttribute("aria-hidden","false");
  document.body.classList.add("modal-open");
  loadReport();
  setTimeout(() => reportClose?.focus(), 30);
}
function closeReportModal(){
  if(!reportModal) return;
  reportModal.classList.remove("open");
  reportModal.setAttribute("aria-hidden","true");
  if(!adminModal.classList.contains("open")) document.body.classList.remove("modal-open");
}
adminOpen.addEventListener("click", openAdminModal);
adminClose.addEventListener("click", closeAdminModal);
reportOpen?.addEventListener("click", openReportModal);
reportClose?.addEventListener("click", closeReportModal);
adminModal.addEventListener("click", e => { if(e.target.matches("[data-admin-close]")) closeAdminModal(); });
reportModal?.addEventListener("click", e => { if(e.target.matches("[data-report-close]")) closeReportModal(); });
document.addEventListener("keydown", e => {
  if(e.key !== "Escape") return;
  if(reportModal?.classList.contains("open")){ closeReportModal(); return; }
  if(adminModal.classList.contains("open")) closeAdminModal();
});
document.getElementById("resetBtn").addEventListener("click", resetStations);
document.getElementById("logoutBtn").addEventListener("click", logoutAdmin);
document.querySelectorAll(".filter").forEach(btn => btn.addEventListener("click", () => {
  document.querySelectorAll(".filter").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  adminFilter = btn.dataset.filter;
  renderAdmin();
}));
document.getElementById("loginForm").addEventListener("submit", loginAdmin);
document.getElementById("reportPdfBtn")?.addEventListener("click", downloadReportPDF);
const reportDate = document.getElementById("reportDate");
if(reportDate){ reportDate.value = localDateInputValue(); reportDate.addEventListener("change", loadReport); }
document.querySelectorAll(".period-tab").forEach(btn => btn.addEventListener("click", () => { document.querySelectorAll(".period-tab").forEach(b=>b.classList.remove("active")); btn.classList.add("active"); reportPeriod=btn.dataset.period; loadReport(); }));

(async function init(){
  stations = cloneFallback();
  renderPublic();
  await checkAuth();
  await loadState();
  if(sb) sb.auth.onAuthStateChange((_event, session) => {
    isAdmin = !!session?.user && session.user.email === ADMIN_EMAIL;
    updateAdminVisibility();
  });
  setInterval(() => tickCountdowns(), 1000);
  // Jangan render ulang panel admin dari polling. Ini mencegah input durasi
  // terganti, angka menghilang, fokus hilang, dan keyboard iOS tertutup sendiri.
  setInterval(() => loadState({silent:true, renderAdminPanel:false}), 3000);
})();

/* ── Secret admin trigger: klik logo "L" di header 1× ── */
(function() {
  const headerMark = document.querySelector('.nav .mark');
  if (!headerMark) return;
  headerMark.style.cursor = 'default';
  headerMark.addEventListener('click', function(e) {
    e.preventDefault();
    document.getElementById('adminOpen')?.click();
  });
})();
