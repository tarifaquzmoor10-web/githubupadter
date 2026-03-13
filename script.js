// ─── Config ──────────────────────────────────────────────
// The backend API is already deployed on Replit and has CORS open.
// All Pterodactyl credentials stay server-side — nothing secret is here.
const API_BASE = "https://server-status-board--arsalanimagine5.replit.app/api";
const REFRESH_MS = 10000;

// ─── State ───────────────────────────────────────────────
let cpuChart = null;
const cpuHistory = Array(20).fill(null);
const timeLabels  = Array(20).fill("");

// ─── Navigation ──────────────────────────────────────────
document.querySelectorAll("nav a").forEach(link => {
  link.addEventListener("click", e => {
    e.preventDefault();
    const page = link.dataset.page;
    document.querySelectorAll("nav a").forEach(a => a.classList.remove("active"));
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    link.classList.add("active");
    document.getElementById("page-" + page).classList.add("active");
  });
});

// ─── Fetch helpers ───────────────────────────────────────
async function get(path) {
  const r = await fetch(API_BASE + path);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// ─── Format helpers ──────────────────────────────────────
function fmtGB(mb) {
  const gb = mb / 1024;
  return gb >= 1000 ? (gb / 1024).toFixed(1) + " PB"
       : gb >= 1    ? gb.toFixed(1) + " TB"   // Pterodactyl stores MB; large values appear as TB
       : mb + " MB";
}

function barColor(pct) {
  return pct >= 85 ? "bar-red" : pct >= 60 ? "bar-yellow" : "bar-green";
}

function usageBarHTML(label, used, total, suffix) {
  const pct = total > 0 ? Math.round((used / total) * 100) : 0;
  const cls = barColor(pct);
  return `
    <div class="usage-row">
      <div class="usage-meta">
        <span class="label">${label}</span>
        <span class="vals">${used}${suffix} / ${total}${suffix} (${pct}%)</span>
      </div>
      <div class="bar-bg">
        <div class="bar-fill ${cls}" style="width:${pct}%"></div>
      </div>
    </div>`;
}

// ─── Dashboard ───────────────────────────────────────────
async function loadStats() {
  const data = await get("/stats");

  // Banner
  const banner = document.getElementById("status-banner");
  const title  = document.getElementById("banner-title");
  const sub    = document.getElementById("banner-sub");

  const statusMap = {
    operational: { cls: "operational", icon: "✓", text: "All Systems Operational",    sub: "Infrastructure is running smoothly without any reported issues." },
    partial:     { cls: "partial",     icon: "⚠", text: "Partial Outage Detected",    sub: "Some nodes are experiencing issues. We are investigating." },
    major:       { cls: "major",       icon: "✕", text: "Major Outage",               sub: "Significant disruption detected across the infrastructure." },
  };

  const s = statusMap[data.globalStatus] || statusMap.operational;
  banner.className = s.cls;
  banner.querySelector(".status-dot").textContent = s.icon;
  title.textContent = s.text;
  sub.textContent   = s.sub;

  // Cards
  document.getElementById("s-total-nodes").textContent   = data.totalNodes;
  document.getElementById("s-nodes-sub").textContent     = `${data.onlineNodes} online, ${data.offlineNodes} offline`;
  document.getElementById("s-total-servers").textContent = data.totalServers;
  document.getElementById("s-cpu").textContent           = data.avgCpuUsage + "%";
  document.getElementById("s-network").textContent       = `${data.onlineNodes}/${data.totalNodes}`;
  document.getElementById("s-mem-used").textContent      = fmtGB(data.usedMemoryMB);
  document.getElementById("s-mem-total").textContent     = fmtGB(data.totalMemoryMB);

  // CPU chart history
  const now = new Date();
  const label = now.getHours() + ":" + String(now.getMinutes()).padStart(2,"0") + ":" + String(now.getSeconds()).padStart(2,"0");
  cpuHistory.push(data.avgCpuUsage);
  cpuHistory.shift();
  timeLabels.push(label);
  timeLabels.shift();

  if (!cpuChart) {
    const ctx = document.getElementById("chart-cpu").getContext("2d");
    cpuChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: [...timeLabels],
        datasets: [{
          data: [...cpuHistory],
          borderColor: "#00d4ff",
          backgroundColor: "rgba(0,212,255,0.08)",
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointRadius: 0,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        scales: {
          x: { display: false },
          y: {
            min: 0, max: 100,
            grid: { color: "rgba(255,255,255,0.05)" },
            ticks: { color: "#6b7280", font: { size: 10 }, callback: v => v + "%" }
          }
        },
        plugins: { legend: { display: false }, tooltip: {
          backgroundColor: "#0d1224",
          borderColor: "rgba(0,212,255,0.3)",
          borderWidth: 1,
          callbacks: { label: ctx => ctx.parsed.y + "%" }
        }}
      }
    });
  } else {
    cpuChart.data.labels   = [...timeLabels];
    cpuChart.data.datasets[0].data = [...cpuHistory];
    cpuChart.update("none");
  }
}

// ─── Nodes ───────────────────────────────────────────────
async function loadNodes() {
  const data = await get("/nodes");
  const container = document.getElementById("slots-container");

  if (!data.nodes || data.nodes.length === 0) {
    container.innerHTML = '<div class="error-state">No nodes found.</div>';
    return;
  }

  container.innerHTML = data.nodes.map((node, i) => {
    const statusCls = { online: "dot-online", offline: "dot-offline", maintenance: "dot-maintenance" }[node.status] || "dot-offline";
    const memUsedGB  = Math.round(node.memoryUsed / 1024);
    const memTotalGB = Math.round(node.memory / 1024);
    const diskUsedGB  = Math.round(node.diskUsed / 1024);
    const diskTotalGB = Math.round(node.disk / 1024);

    return `
      <div class="slot-card">
        <div class="slot-header">
          <div class="slot-name">Slot ${i + 1}</div>
          <div class="status-badge">
            <div class="dot ${statusCls}"></div>
            <span>${node.status.charAt(0).toUpperCase() + node.status.slice(1)}</span>
          </div>
        </div>

        ${usageBarHTML("CPU", node.cpuUsed.toFixed(1), 100, "%")}
        ${usageBarHTML("Memory", memUsedGB, memTotalGB, " GB")}
        ${usageBarHTML("Disk", diskUsedGB, diskTotalGB, " GB")}

        <div class="slot-footer">
          <span>${node.serversCount} server${node.serversCount !== 1 ? "s" : ""}</span>
          <span>${node.cpuModel || "AMD EPYC"}</span>
        </div>
      </div>`;
  }).join("");
}

// ─── Refresh loop ─────────────────────────────────────────
const spinner     = document.getElementById("spinner");
const refreshText = document.getElementById("refresh-text");

async function refresh() {
  spinner.style.display = "block";
  refreshText.textContent = "Refreshing…";

  try {
    await Promise.all([loadStats(), loadNodes()]);
  } catch (err) {
    console.error("Refresh error:", err);
  }

  spinner.style.display = "none";
  refreshText.textContent = "Auto-refresh every 10s";
}

refresh();
setInterval(refresh, REFRESH_MS);
