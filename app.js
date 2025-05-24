// =============== UTILS ===============
const PRIMARY_COLOR = "#004FED";
const DEFAULT_PIN = "1234";
const STORAGE_KEY = "kiosk_jobs";
const UPLOAD_LOG_KEY = "kiosk_upload_log";
const LOGO_KEY = "kiosk_logo";
const ADMIN_PIN_KEY = "kiosk_admin_pin";
let jobs = [];
let filters = {industry:"", title:"", location:"", gender:"", search:""};
let autoScrollTimer = null, autoScrollPaused = false;
let scrollInterval = null;

// =============== DATE/TIME ===============
function updateDateTime() {
  const now = new Date();
  document.getElementById("datetime").textContent =
    now.toLocaleString("en-GB", {
      weekday: "short", year: "numeric", month: "short",
      day: "2-digit", hour: "2-digit", minute: "2-digit"
    });
  document.getElementById("year").textContent = now.getFullYear();
}
setInterval(updateDateTime, 30 * 1000);
updateDateTime();

// =============== LOGO ===============
function loadLogo() {
  const logo = localStorage.getItem(LOGO_KEY);
  if (logo) {
    document.getElementById("logo-img").src = logo;
  }
}
loadLogo();

// =============== FILTERS ===============
function renderFilters() {
  const industrySet = new Set(), titleSet = new Set(),
        locationSet = new Set(), genderSet = new Set();
  jobs.forEach(j => {
    if(j.industry) industrySet.add(j.industry);
    if(j.title) titleSet.add(j.title);
    if(j.location) locationSet.add(j.location);
    if(j.gender) genderSet.add(j.gender);
  });
  const setOpts = (el, set, all) => {
    el.innerHTML = `<option value="">All ${all}</option>` +
      [...set].sort().map(v=>`<option>${v}</option>`).join('');
  };
  setOpts(document.getElementById("filter-industry"), industrySet, "Industries");
  setOpts(document.getElementById("filter-title"), titleSet, "Titles");
  setOpts(document.getElementById("filter-location"), locationSet, "Locations");
  setOpts(document.getElementById("filter-gender"), genderSet, "Genders");
}
["filter-industry","filter-title","filter-location","filter-gender"].forEach(fid=>{
  document.getElementById(fid).addEventListener("change", e=>{
    filters[fid.split('-')[1]] = e.target.value;
    renderJobListings();
    resetAutoScroll();
  });
});
document.getElementById("search-box").addEventListener("input", e=>{
  filters.search = e.target.value.toLowerCase();
  renderJobListings();
  resetAutoScroll();
});

// =============== JOB LISTINGS ===============
function renderJobListings() {
  const main = document.getElementById("job-listings");
  main.innerHTML = "";
  let filtered = jobs.filter(job => {
    if(filters.industry && job.industry !== filters.industry) return false;
    if(filters.title && job.title !== filters.title) return false;
    if(filters.location && job.location !== filters.location) return false;
    if(filters.gender && job.gender !== filters.gender) return false;
    if(filters.search && !(
      job.title.toLowerCase().includes(filters.search) ||
      job.industry.toLowerCase().includes(filters.search) ||
      job.location.toLowerCase().includes(filters.search) ||
      job.gender.toLowerCase().includes(filters.search) ||
      job.description.toLowerCase().includes(filters.search)
    )) return false;
    return true;
  });
  if (filtered.length === 0) {
    main.innerHTML = `<div style="margin:64px auto;font-size:2.2rem;color:#999;text-align:center">No jobs found.</div>`;
    return;
  }
  filtered.forEach((job, idx) => {
    const card = document.createElement("div");
    card.className = "job-card";
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.innerHTML = `
      <div class="job-info">
        <div class="job-title">${job.title}</div>
        <div class="job-meta">
          <b>Industry:</b> ${job.industry} &nbsp;•&nbsp; <b>Location:</b> ${job.location} &nbsp;•&nbsp;
          <b>Gender:</b> ${job.gender} &nbsp;•&nbsp; <b>Posts:</b> ${job.posts}
        </div>
        <div class="job-desc">${job.description.slice(0, 100)}${job.description.length>100?'...':''}</div>
      </div>
      <div class="job-qr"><div class="qrcode" id="qr-${job.id}"></div></div>
    `;
    card.addEventListener("click", ()=>showJobDetail(job));
    main.appendChild(card);
    setTimeout(()=>makeQRCode(`qr-${job.id}`, job.applyUrl, 108), 0);
  });
}
function showJobDetail(job) {
  document.getElementById("job-detail-modal").classList.remove("hidden");
  const d = document.getElementById("job-detail");
  d.innerHTML = `
    <div class="job-title">${job.title}</div>
    <div class="job-meta">
      <b>Industry:</b> ${job.industry} &nbsp;•&nbsp; <b>Location:</b> ${job.location} &nbsp;•&nbsp;
      <b>Gender:</b> ${job.gender} &nbsp;•&nbsp; <b>Posts:</b> ${job.posts}
    </div>
    <div class="job-desc">${job.description}</div>
    <div class="job-qr"><div class="qrcode" id="detail-qr"></div></div>
    <div style="margin-top:18px;text-align:center;">
      <a href="${job.applyUrl}" target="_blank" style="font-size:1.6rem;color:${PRIMARY_COLOR};text-decoration:underline;">Apply via Google Form</a>
    </div>
  `;
  setTimeout(()=>makeQRCode('detail-qr', job.applyUrl, 220), 0);
}
document.getElementById("close-detail").onclick = ()=> {
  document.getElementById("job-detail-modal").classList.add("hidden");
};

// =============== QR CODE ===============
function makeQRCode(elId, text, size) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.innerHTML = "";
  new QRCode(el, {
    text: text,
    width: size,
    height: size,
    colorDark: PRIMARY_COLOR,
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.M
  });
}

// =============== STORAGE ===============
async function saveJobs() {
  try {
    await idbKeyval.set(STORAGE_KEY, jobs);
  } catch(e) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
  }
}
async function loadJobs() {
  try {
    jobs = await idbKeyval.get(STORAGE_KEY) || [];
  } catch(e) {
    jobs = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  }
}

// =============== EXCEL IMPORT/EXPORT ===============
function parseExcel(file, cb) {
  const reader = new FileReader();
  reader.onload = function(e) {
    const data = new Uint8Array(e.target.result);
    const wb = XLSX.read(data, {type:'array'});
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, {defval:""});
    cb(rows);
  };
  reader.readAsArrayBuffer(file);
}
function excelToJobs(rows) {
  const jobsArr = [];
  rows.forEach((row,i) => {
    let id = row["Job ID"] || row["ID"] || "";
    if (!id) id = "JOB" + String(Date.now()).slice(-5) + i;
    jobsArr.push({
      id,
      title: row["Job Title"] || "",
      industry: row["Industry"] || "",
      gender: row["Gender"] || "",
      location: row["Location"] || "",
      posts: row["Posts"] || "",
      description: row["Description"] || "",
      applyUrl: row["Apply URL"] || "",
    });
  });
  return jobsArr;
}
function jobsToExcel(jobsArr) {
  const ws = XLSX.utils.json_to_sheet(jobsArr.map(j=>({
    "Job ID": j.id, "Job Title": j.title, "Industry": j.industry, "Gender": j.gender,
    "Location": j.location, "Posts": j.posts, "Description": j.description, "Apply URL": j.applyUrl
  })));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Jobs");
  XLSX.writeFile(wb, "job-board-data.xlsx");
}

// =============== ADMIN PANEL ===============
function showAdminModal() {
  document.getElementById("admin-modal").classList.remove("hidden");
  document.getElementById("admin-login").classList.remove("hidden");
  document.getElementById("admin-panel").classList.add("hidden");
  document.getElementById("admin-pin").value = "";
  document.getElementById("admin-login-error").textContent = "";
  document.getElementById("admin-pin").focus();
}
function closeAdminModal() {
  document.getElementById("admin-modal").classList.add("hidden");
}
document.getElementById("close-admin").onclick = closeAdminModal;
document.getElementById("admin-login-btn").onclick = function() {
  const pin = document.getElementById("admin-pin").value;
  const storedPin = localStorage.getItem(ADMIN_PIN_KEY) || DEFAULT_PIN;
  if (pin === storedPin) {
    document.getElementById("admin-login").classList.add("hidden");
    document.getElementById("admin-panel").classList.remove("hidden");
    renderUploadLog();
  } else {
    document.getElementById("admin-login-error").textContent = "Incorrect PIN";
  }
};
document.getElementById("admin-logout").onclick = function() {
  document.getElementById("admin-login").classList.remove("hidden");
  document.getElementById("admin-panel").classList.add("hidden");
};
document.getElementById("excel-upload").onchange = function(e) {
  const file = e.target.files[0];
  if (!file) return;
  parseExcel(file, rows=>{
    jobs = excelToJobs(rows);
    saveJobs();
    renderFilters();
    renderJobListings();
    logAdminUpload(file.name, jobs.length);
    renderUploadLog();
    alert("Jobs imported! (" + jobs.length + " jobs)");
  });
};
document.getElementById("export-jobs").onclick = function() {
  jobsToExcel(jobs);
};
document.getElementById("logo-upload").onchange = function(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(evt) {
    localStorage.setItem(LOGO_KEY, evt.target.result);
    loadLogo();
    alert("Logo updated!");
  };
  reader.readAsDataURL(file);
};

// =============== ADMIN LOG ===============
function logAdminUpload(filename, count) {
  const log = JSON.parse(localStorage.getItem(UPLOAD_LOG_KEY) || "[]");
  log.push({filename, count, ts: new Date().toLocaleString()});
  localStorage.setItem(UPLOAD_LOG_KEY, JSON.stringify(log));
}
function renderUploadLog() {
  const log = JSON.parse(localStorage.getItem(UPLOAD_LOG_KEY) || "[]");
  if (!log.length) {
    document.getElementById("admin-upload-log").textContent = "No uploads yet.";
    return;
  }
  document.getElementById("admin-upload-log").innerHTML =
    log.slice().reverse().map(l=>`<div>
      <b>${l.filename}</b> (${l.count} jobs) <span style="color:#888">at ${l.ts}</span></div>`).join("");
}

// =============== FULLSCREEN ===============
document.getElementById("fullscreen-btn").onclick = function() {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    document.documentElement.requestFullscreen();
  }
};

// =============== AUTO SCROLL ===============
function startAutoScroll() {
  autoScrollPaused = false;
  if (scrollInterval) clearInterval(scrollInterval);
  const main = document.getElementById("job-listings");
  scrollInterval = setInterval(()=>{
    if (autoScrollPaused) return;
    let max = main.scrollHeight - main.clientHeight;
    if (main.scrollTop >= max) main.scrollTop = 0;
    else main.scrollTop += 250;
  }, 3500);
}
function stopAutoScroll() {
  autoScrollPaused = true;
  if (scrollInterval) clearInterval(scrollInterval);
}
function resetAutoScroll() {
  stopAutoScroll();
  if (autoScrollTimer) clearTimeout(autoScrollTimer);
  autoScrollTimer = setTimeout(()=>startAutoScroll(), 30*1000);
}
document.getElementById("job-listings").addEventListener("touchstart", stopAutoScroll);
document.getElementById("job-listings").addEventListener("mousedown", stopAutoScroll);
["filter-industry","filter-title","filter-location","filter-gender","search-box"].forEach(fid=>{
  document.getElementById(fid).addEventListener("focus", stopAutoScroll);
});

// =============== TOUCH KEYBOARD (optional) ===============
// For kiosks without OSK, you can implement a JS keyboard here if needed

// =============== ADMIN LAUNCH (hidden gesture) ===============
let logoTapCount = 0, logoTapTimer = null;
document.getElementById("logo-area").addEventListener("click", ()=>{
  logoTapCount++;
  if (logoTapCount === 3) {
    showAdminModal();
    logoTapCount = 0;
  }
  if (logoTapTimer) clearTimeout(logoTapTimer);
  logoTapTimer = setTimeout(()=>logoTapCount=0, 3000);
});

// =============== INIT ===============
async function init() {
  await loadJobs();
  renderFilters();
  renderJobListings();
  startAutoScroll();
}
init();

window.addEventListener("blur", stopAutoScroll);
window.addEventListener("focus", resetAutoScroll);