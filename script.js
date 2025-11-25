// ----- CONFIG -----
const SHEET_ID = "1--or-XBf1Ys71it7cRCSnZOodHIP8wr9bW_HUoTJtCs";

// build gviz url
function gvizUrl(sheetName) {
  return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`;
}

// fetch gviz and parse rows robustly
async function fetchGvizRows(sheetName) {
  const url = gvizUrl(sheetName);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${sheetName}: ${res.status}`);
  const text = await res.text();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Unexpected gviz response");
  const jsonText = text.substring(start, end + 1);
  const parsed = JSON.parse(jsonText);
  if (!parsed.table || !parsed.table.rows) return [];
  return parsed.table.rows.map(r => (r.c || []).map(c => (c && c.v !== undefined ? c.v : "")));
}

// parse players sheet
function parsePlayers(rows) {
  if (!rows || rows.length === 0) return [];
  let start = 0;
  const header = rows[0].map(c => (c || "").toString().toLowerCase());
  if (header.includes("name")) start = 1;
  const out = [];
  for (let i = start; i < rows.length; i++) {
    const r = rows[i] || [];
    const name = (r[0] || "").toString().trim();
    const desc = (r[1] || "").toString().trim();
    if (name) out.push({ name, description: desc });
  }
  return out;
}

// parse matches sheet
function parseMatches(rows) {
  if (!rows || rows.length === 0) return [];
  let start = 0;
  const header = rows[0].map(c => (c || "").toString().toLowerCase());
  if (header.includes("matchday") && header.includes("player1")) start = 1;
  const out = [];
  for (let i = start; i < rows.length; i++) {
    const r = rows[i] || [];
    const mdRaw = (r[0] || "").toString().trim();
    if (mdRaw === "") continue;
    const mdNum = Number(mdRaw);
    const matchday = Number.isFinite(mdNum) ? mdNum : mdRaw;
    const player1 = (r[1] || "").toString().trim();
    const player2 = (r[2] || "").toString().trim();
    const s1 = (r[3] === "" || r[3] === null || r[3] === undefined) ? -1 : Number(r[3]);
    const s2 = (r[4] === "" || r[4] === null || r[4] === undefined) ? -1 : Number(r[4]);
    out.push({ matchday, player1, player2, score1: Number.isFinite(s1) ? s1 : -1, score2: Number.isFinite(s2) ? s2 : -1 });
  }
  return out;
}

// parse guides sheet (Title | Text)
function parseGuides(rows) {
  if (!rows || rows.length === 0) return [];
  let start = 0;
  const header = rows[0].map(c => (c || "").toString().toLowerCase());
  if (header.includes("title")) start = 1;
  const out = [];
  for (let i = start; i < rows.length; i++) {
    const r = rows[i] || [];
    const title = (r[0] || "").toString().trim();
    const content = (r[1] || "").toString().trim();
    if (title) out.push({ title, content });
  }
  return out;
}

// get player image from gallery
async function getPlayerImageUrl(name) {
  if (!name) return "gallery/default.png";
  const tryList = [
    `${name}.jpeg`, `${name}.jpg`, `${name}.png`, `${name}.webp`,
    `${encodeURIComponent(name)}.jpeg`, `${encodeURIComponent(name)}.jpg`, `${encodeURIComponent(name)}.png`, `${encodeURIComponent(name)}.webp`
  ];
  for (const f of tryList) {
    const url = `gallery/${f}`;
    try {
      const r = await fetch(url, { method: "GET" });
      if (r.ok) return url;
    } catch (_) {}
  }
  return "gallery/default.png";
}

// compute standings
function computeStandings(matches, playersList) {
  const stats = {};
  playersList.forEach(p => stats[p.name] = { name: p.name, mp:0, w:0, d:0, l:0, gf:0, ga:0, pts:0 });

  matches.forEach(m => {
    if (m.player1 && !stats[m.player1]) stats[m.player1] = { name:m.player1, mp:0,w:0,d:0,l:0,gf:0,ga:0,pts:0 };
    if (m.player2 && !stats[m.player2]) stats[m.player2] = { name:m.player2, mp:0,w:0,d:0,l:0,gf:0,ga:0,pts:0 };

    const played = Number.isFinite(m.score1) && Number.isFinite(m.score2) && m.score1 >= 0 && m.score2 >= 0;
    if (!played) return;

    stats[m.player1].mp++;
    stats[m.player2].mp++;

    stats[m.player1].gf += m.score1;
    stats[m.player1].ga += m.score2;
    stats[m.player2].gf += m.score2;
    stats[m.player2].ga += m.score1;

    if (m.score1 > m.score2) {
      stats[m.player1].w++; stats[m.player1].pts += 3; stats[m.player2].l++;
    } else if (m.score2 > m.score1) {
      stats[m.player2].w++; stats[m.player2].pts += 3; stats[m.player1].l++;
    } else {
      stats[m.player1].d++; stats[m.player2].d++;
      stats[m.player1].pts++;
      stats[m.player2].pts++;
    }
  });

  const arr = Object.values(stats).map(s => ({ ...s, gd: s.gf - s.ga }));
  arr.sort((a,b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.gd !== a.gd) return b.gd - a.gd;
    if (b.gf !== a.gf) return b.gf - a.gf;
    return a.name.localeCompare(b.name);
  });
  return arr;
}

// render standings table
async function renderStandingsTable(standings, playerInfoMap) {
  const tbody = document.querySelector("#standings-table tbody");
  tbody.innerHTML = "";

  for (let i = 0; i < standings.length; i++) {
    const s = standings[i];
    const tr = document.createElement("tr");

    if (i < 2) tr.classList.add("top2");
    else if (i < 6) tr.classList.add("playoffs");

    const imgUrl = await getPlayerImageUrl(s.name);

    // IMPORTANT: order matches the table header: # | Player | PTS | MP | W | D | L | GF | GA | GD
    tr.innerHTML = `
      <td>${i+1}</td>
      <td class="player-cell">
        <img class="player-thumb" src="${imgUrl}" alt="${s.name}">
        <span class="player-name">${s.name}</span>
      </td>
      <td class="pts-bold">${s.pts}</td>
      <td>${s.mp}</td>
      <td>${s.w}</td>
      <td>${s.d}</td>
      <td>${s.l}</td>
      <td>${s.gf}</td>
      <td>${s.ga}</td>
      <td>${s.gd}</td>
    `;

    tbody.appendChild(tr);

    // attach click handler to the image to open modal (only for table)
    const imgEl = tr.querySelector("img.player-thumb");
    if (imgEl) {
      imgEl.style.cursor = "pointer";
      imgEl.addEventListener("click", async () => {
        const info = playerInfoMap[s.name] || { description: "" };
        // open modal with FULL image + description
        openPlayerModal(s.name, info.description);
      });
    }
  }
}

// group matches by matchday
function groupMatches(matches) {
  const map = new Map();
  for (const m of matches) {
    if (!map.has(m.matchday)) map.set(m.matchday, []);
    map.get(m.matchday).push(m);
  }
  const days = Array.from(map.keys()).sort((a,b) => a-b);
  return { map, days };
}

// render matches per matchday
async function renderMatchesForDay(matchday, matchesForDay, playerInfoMap) {
  const container = document.getElementById("matches-slide");
  container.innerHTML = "";
  document.getElementById("matches-title").textContent = `Matchday ${matchday}`;

  if (!matchesForDay || matchesForDay.length === 0) {
    container.innerHTML = "<div class='match-card'>No matches available.</div>";
    return;
  }

  for (const m of matchesForDay) {
    const leftImgUrl = await getPlayerImageUrl(m.player1);
    const rightImgUrl = await getPlayerImageUrl(m.player2);

    const s1 = Number.isFinite(m.score1) && m.score1 >= 0 ? m.score1 : "";
    const s2 = Number.isFinite(m.score2) && m.score2 >= 0 ? m.score2 : "";

    const card = document.createElement("div");
    card.className = "match-card";

    card.innerHTML = `
      <div class="player-block">
        <img class="player-thumb left-thumb" src="${leftImgUrl}" alt="${m.player1}">
        <span class="player-name">${m.player1}</span>
      </div>

      <div class="score-area">
        <div class="score-box ${s1 === "" ? "empty" : ""}">${s1}</div>
        <div class="score-dash">-</div>
        <div class="score-box ${s2 === "" ? "empty" : ""}">${s2}</div>
      </div>

      <div class="player-block right">
        <img class="player-thumb right-thumb" src="${rightImgUrl}" alt="${m.player2}">
        <span class="player-name">${m.player2}</span>
      </div>
    `;

    // IMPORTANT: DO NOT attach click handlers for match images.
    // This disables popups for images in the matches section as requested.

    container.appendChild(card);
  }
}

// stats
function computeTopScorers(matches, playersList) {
  const map = new Map(playersList.map(p => [p.name, 0]));
  matches.forEach(m => {
    if (Number.isFinite(m.score1) && m.score1 >= 0) map.set(m.player1, (map.get(m.player1) || 0) + m.score1);
    if (Number.isFinite(m.score2) && m.score2 >= 0) map.set(m.player2, (map.get(m.player2) || 0) + m.score2);
  });
  return Array.from(map.entries())
    .map(([player, goals]) => ({ player, goals }))
    .sort((a,b) => b.goals - a.goals || a.player.localeCompare(b.player));
}

function computeGoalsConceded(matches, playersList) {
  const map = new Map(playersList.map(p => [p.name, 0]));
  matches.forEach(m => {
    if (Number.isFinite(m.score1) && m.score1 >= 0) map.set(m.player2, (map.get(m.player2) || 0) + m.score1);
    if (Number.isFinite(m.score2) && m.score2 >= 0) map.set(m.player1, (map.get(m.player1) || 0) + m.score2);
  });
  return Array.from(map.entries())
    .map(([player, goals]) => ({ player, goals }))
    .sort((a,b) => b.goals - a.goals || a.player.localeCompare(b.player));
}

function renderStatsTable(arr, label) {
  const el = document.getElementById("stats-area");
  el.innerHTML = "";
  const tbl = document.createElement("table");
  tbl.className = "stats-table";

  const thead = document.createElement("thead");
  thead.innerHTML = `<tr><th>Player</th><th style="text-align:right">${label}</th></tr>`;

  const tbody = document.createElement("tbody");
  arr.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${r.player}</td><td style="text-align:right">${r.goals}</td>`;
    tbody.appendChild(tr);
  });

  tbl.appendChild(thead);
  tbl.appendChild(tbody);
  el.appendChild(tbl);
}

// modal (player) — shows full image + description under image
async function openPlayerModal(name, description) {
  document.getElementById("modal-player-name").textContent = name;
  document.getElementById("modal-player-description").textContent = description || "";
  const modalImg = document.getElementById("modal-player-image");
  modalImg.src = "";
  modalImg.alt = name;
  const url = await getPlayerImageUrl(name);
  // ensure full-size display (CSS handles containment)
  modalImg.src = url;
  document.getElementById("player-modal").setAttribute("aria-hidden", "false");
}

function closePlayerModal() {
  document.getElementById("player-modal").setAttribute("aria-hidden", "true");
}

//
// -------------- GUIDES --------------
//

// remove markers (חלק 1:, חלק 2:, etc)
function splitGuideIntoPartsClean(text) {
  if (!text) return [];
  const norm = text.replace(/\r\n/g, "\n");
  const parts = norm.split(/חלק\s*\d+\s*[:\-]?\s*/g).map(p => p.trim()).filter(Boolean);
  if (parts.length > 0) return parts;
  return norm.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
}

function containsHebrew(s) {
  return /[\u0590-\u05FF]/.test(s);
}

// render one guide at a time (title only)
function renderGuidesSingle(guides) {
  const container = document.getElementById("guides-single");
  container.innerHTML = "";

  if (!guides || guides.length === 0) {
    container.innerHTML = "<div class='guide-card-single'><h4>No guides found</h4></div>";
    return;
  }

  let idx = 0;

  const renderIndex = () => {
    container.innerHTML = "";
    const g = guides[idx];

    const card = document.createElement("div");
    card.className = "guide-card-single";
    card.innerHTML = `<h4>${g.title}</h4>`;

    card.addEventListener("click", () => {
      openGuideModal(g.title, g.parts);
    });

    container.appendChild(card);
    document.getElementById("guides-title").textContent = g.title;

    document.getElementById("guides-prev").disabled = idx === 0;
    document.getElementById("guides-next").disabled = idx === guides.length - 1;
  };

  document.getElementById("guides-prev").addEventListener("click", () => {
    if (idx > 0) idx--;
    renderIndex();
  });

  document.getElementById("guides-next").addEventListener("click", () => {
    if (idx < guides.length - 1) idx++;
    renderIndex();
  });

  renderIndex();
}

//
// NEW — full scrollable guide modal (no prev/next inside modal)
//
function openGuideModal(title, parts) {
  const modal = document.getElementById("guide-modal");
  const titleEl = document.getElementById("guide-modal-title");
  const container = document.getElementById("guide-slides-container");

  titleEl.textContent = title;
  container.innerHTML = "";

  const fullText = document.createElement("div");
  fullText.className = "guide-full-text";
  fullText.textContent = parts.join("\n\n");

  if (containsHebrew(title)) fullText.classList.add("rtl");

  container.appendChild(fullText);
  modal.setAttribute("aria-hidden", "false");
}

function closeGuideModal() {
  document.getElementById("guide-modal").setAttribute("aria-hidden", "true");
}

// main
document.addEventListener("DOMContentLoaded", async () => {

  document.getElementById("modal-close").addEventListener("click", closePlayerModal);
  document.getElementById("modal-backdrop").addEventListener("click", closePlayerModal);

  document.getElementById("guide-modal-close").addEventListener("click", closeGuideModal);
  document.getElementById("guide-modal-backdrop").addEventListener("click", closeGuideModal);

  try {
    const [playerRows, matchRows, guidesRows] = await Promise.all([
      fetchGvizRows("PlayerInfo"),
      fetchGvizRows("Matches"),
      fetchGvizRows("Guides")
    ]);

    const playersList = parsePlayers(playerRows);
    const playerInfoMap = {};
    playersList.forEach(p => playerInfoMap[p.name] = p);

    const matches = parseMatches(matchRows);
    const guidesListRaw = parseGuides(guidesRows);

    // standings
    const standings = computeStandings(matches, playersList);
    await renderStandingsTable(standings, playerInfoMap);

    // matches
    const grouped = groupMatches(matches);
    const days = grouped.days;
    if (!days || days.length === 0) {
      document.getElementById("matches-title").textContent = "No matchdays";
      document.getElementById("matches-slide").innerHTML = "<div class='match-card'>No matches</div>";
    } else {
      let idx = days.length - 1;

      const show = () => {
        const day = days[idx];
        const arr = grouped.map.get(day) || [];
        renderMatchesForDay(day, arr, playerInfoMap);
        document.getElementById("matches-prev").disabled = idx === 0;
        document.getElementById("matches-next").disabled = idx === days.length - 1;
      };

      document.getElementById("matches-prev").addEventListener("click", () => {
        if (idx > 0) idx--;
        show();
      });

      document.getElementById("matches-next").addEventListener("click", () => {
        if (idx < days.length - 1) idx++;
        show();
      });

      show();
    }

    // stats
    const scorers = computeTopScorers(matches, playersList);
    const conceded = computeGoalsConceded(matches, playersList);
    renderStatsTable(scorers, "Goals Scored");

    document.getElementById("stats-btn-scorers").addEventListener("click", () => {
      document.getElementById("stats-btn-scorers").classList.add("active");
      document.getElementById("stats-btn-conceded").classList.remove("active");
      renderStatsTable(scorers, "Goals Scored");
    });

    document.getElementById("stats-btn-conceded").addEventListener("click", () => {
      document.getElementById("stats-btn-conceded").classList.add("active");
      document.getElementById("stats-btn-scorers").classList.remove("active");
      renderStatsTable(conceded, "Goals Conceded");
    });

    // guides
    const guidesPrepared = guidesListRaw.map(g => ({
      title: g.title,
      content: g.content,
      parts: splitGuideIntoPartsClean(g.content)
    }));
    renderGuidesSingle(guidesPrepared);

  } catch (e) {
    console.error(e);
    const err = document.createElement("div");
    err.style.color = "#ffb3a7";
    err.style.padding = "12px";
    err.textContent = "Error loading Google Sheets data.";
    document.querySelector("main").prepend(err);
  }
});
