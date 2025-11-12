// script.js - uses Google Sheets gviz/tq JSON endpoint (no API key required)
// Edit SHEET_ID below to match your spreadsheet id (the long id in the sheet URL).
// The code will fetch two sheets: "PlayerInfo" and "Matches".
// Player images are loaded from gallery/<PlayerName>.(jpeg|jpg|png|webp) — filenames should match player names.

// ----- CONFIG -----
const SHEET_ID = "1--or-XBf1Ys71it7cRCSnZOodHIP8wr9bW_HUoTJtCs"; // <-- replace with your own spreadsheet id if needed
// ------------------

// Build gviz URL for a sheet name
function gvizUrl(sheetName) {
  return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`;
}

// fetch gviz JSON and return rows as arrays of cell values
async function fetchGvizRows(sheetName) {
  const url = gvizUrl(sheetName);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch sheet "${sheetName}": ${res.status} ${res.statusText}`);
  const text = await res.text();
  // extract JSON inside google.visualization.Query.setResponse(...)
  const m = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);/);
  if (!m) throw new Error("Unexpected gviz response format");
  const json = JSON.parse(m[1]);
  const rows = (json.table && json.table.rows) ? json.table.rows.map(r => (r.c || []).map(cell => cell && cell.v !== undefined ? cell.v : "")) : [];
  return rows;
}

// Parse PlayerInfo rows to list of {name, description}
function parsePlayers(rows) {
  const parsed = [];
  let startIdx = 0;
  if (rows.length > 0) {
    const first = rows[0].map(c => (c || "").toString().trim().toLowerCase());
    if (first.includes("name") && (first.includes("description") || first.includes("desc"))) startIdx = 1;
  }
  for (let i = startIdx; i < rows.length; i++) {
    const r = rows[i] || [];
    const name = (r[0] || "").toString().trim();
    const desc = (r[1] || "").toString().trim();
    if (name) parsed.push({ name, description: desc });
  }
  return parsed;
}

// Parse Matches rows to list of {matchday, player1, player2, score1, score2}
function parseMatches(rows) {
  const parsed = [];
  let startIdx = 0;
  if (rows.length > 0) {
    const first = rows[0].map(c => (c || "").toString().trim().toLowerCase());
    if (first.includes("matchday") && first.includes("player1")) startIdx = 1;
  }
  for (let i = startIdx; i < rows.length; i++) {
    const r = rows[i] || [];
    // Some cells may come as numbers or strings
    const matchday = Number(r[0]);
    const player1 = (r[1] || "").toString().trim();
    const player2 = (r[2] || "").toString().trim();
    const score1 = r[3] === "" ? NaN : Number(r[3]);
    const score2 = r[4] === "" ? NaN : Number(r[4]);
    parsed.push({ matchday, player1, player2, score1, score2 });
  }
  return parsed;
}

// Compute standings: pts,w,d,l,gf,ga
function computeStandings(matches, playersList) {
  const playerNames = new Set();
  playersList.forEach(p => playerNames.add(p.name));
  matches.forEach(m => { if (m.player1) playerNames.add(m.player1); if (m.player2) playerNames.add(m.player2); });

  const stats = {};
  for (const name of playerNames) stats[name] = { name, pts: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 };

  for (const m of matches) {
    const { player1, player2, score1, score2 } = m;
    // unplayed match detection: both -1 (as requested) OR NaN
    if ((Number.isFinite(score1) && Number.isFinite(score2) && score1 === -1 && score2 === -1) || (!Number.isFinite(score1) && !Number.isFinite(score2))) {
      continue;
    }
    if (!(player1 in stats)) stats[player1] = { name: player1, pts:0,w:0,d:0,l:0,gf:0,ga:0 };
    if (!(player2 in stats)) stats[player2] = { name: player2, pts:0,w:0,d:0,l:0,gf:0,ga:0 };

    stats[player1].gf += Number.isFinite(score1) ? score1 : 0;
    stats[player1].ga += Number.isFinite(score2) ? score2 : 0;
    stats[player2].gf += Number.isFinite(score2) ? score2 : 0;
    stats[player2].ga += Number.isFinite(score1) ? score1 : 0;

    if (Number.isFinite(score1) && Number.isFinite(score2)) {
      if (score1 > score2) {
        stats[player1].w += 1; stats[player1].pts += 3;
        stats[player2].l += 1;
      } else if (score2 > score1) {
        stats[player2].w += 1; stats[player2].pts += 3;
        stats[player1].l += 1;
      } else {
        stats[player1].d += 1; stats[player2].d += 1;
        stats[player1].pts += 1; stats[player2].pts += 1;
      }
    }
  }

  const arr = Object.values(stats);
  arr.sort((a,b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    const gdA = a.gf - a.ga, gdB = b.gf - b.ga;
    if (gdB !== gdA) return gdB - gdA;
    return b.gf - a.gf;
  });
  return arr;
}

// Render standings table
async function renderStandingsTable(standings, playerInfoMap) {
  const tbody = document.querySelector("#standings-table tbody");
  tbody.innerHTML = "";
  for (let i = 0; i < standings.length; i++) {
    const s = standings[i];
    const tr = document.createElement("tr");

    const rankTd = document.createElement("td"); rankTd.textContent = (i + 1); tr.appendChild(rankTd);

    const playerTd = document.createElement("td"); playerTd.className = "player-cell";
    const img = document.createElement("img"); img.className = "player-thumb"; img.alt = s.name;
    img.src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect fill='%230b1220' width='100%' height='100%'/></svg>";
    getPlayerImageUrl(s.name).then(url => { if (url) img.src = url; }).catch(()=>{});
    img.addEventListener("click", () => {
      const info = playerInfoMap[s.name] || { description: "" };
      openPlayerModal(s.name, info.description);
    });

    const nameSpan = document.createElement("span"); nameSpan.className = "player-name"; nameSpan.textContent = s.name;

    playerTd.appendChild(img);
    playerTd.appendChild(nameSpan);
    tr.appendChild(playerTd);

    const ptsTd = document.createElement("td"); ptsTd.textContent = s.pts; tr.appendChild(ptsTd);
    const wTd = document.createElement("td"); wTd.textContent = s.w; tr.appendChild(wTd);
    const dTd = document.createElement("td"); dTd.textContent = s.d; tr.appendChild(dTd);
    const lTd = document.createElement("td"); lTd.textContent = s.l; tr.appendChild(lTd);
    const gfTd = document.createElement("td"); gfTd.textContent = s.gf; tr.appendChild(gfTd);
    const gaTd = document.createElement("td"); gaTd.textContent = s.ga; tr.appendChild(gaTd);

    tbody.appendChild(tr);
  }
}

// Try to find player image in gallery by trying common extensions.
// Uses GET fetch to check file existence (HEAD sometimes blocked).
async function getPlayerImageUrl(name) {
  if (!name) return null;
  const tryNames = [
    `${name}.jpeg`, `${name}.jpg`, `${name}.png`, `${name}.webp`,
    `${encodeURIComponent(name)}.jpeg`, `${encodeURIComponent(name)}.jpg`, `${encodeURIComponent(name)}.png`, `${encodeURIComponent(name)}.webp`
  ];
  for (const filename of tryNames) {
    const url = `gallery/${filename}`;
    try {
      const r = await fetch(url, { method: "GET" });
      if (r.ok) return url;
    } catch (e) {
      // continue
    }
  }
  return null;
}

// Group matches by matchday
function groupMatchesByMatchday(matches) {
  const map = new Map();
  for (const m of matches) {
    if (!map.has(m.matchday)) map.set(m.matchday, []);
    map.get(m.matchday).push(m);
  }
  const days = Array.from(map.keys()).sort((a,b)=>a-b);
  return { map, days };
}

// Render matches for a single matchday
function renderMatchesForDay(matchday, matchesForDay) {
  const container = document.getElementById("matches-slide");
  container.innerHTML = "";
  document.getElementById("matches-title").textContent = `Matchday ${matchday}`;

  if (!matchesForDay || matchesForDay.length === 0) {
    const el = document.createElement("div"); el.className = "match-card"; el.textContent = "No matches available for this matchday."; container.appendChild(el); return;
  }

  for (const m of matchesForDay) {
    const card = document.createElement("div"); card.className = "match-card";
    const top = document.createElement("div"); top.className = "match-row"; top.innerHTML = `<div class="small-muted">Match</div><div class="small-muted">Status</div>`; card.appendChild(top);

    const scoreLine = document.createElement("div"); scoreLine.className = "match-score";
    const unplayed = (!Number.isFinite(m.score1) && !Number.isFinite(m.score2)) || (m.score1 === -1 && m.score2 === -1);
    if (unplayed) {
      scoreLine.textContent = `${m.player1} VS ${m.player2}`;
    } else {
      scoreLine.textContent = `${m.player1} ${m.score1} - ${m.score2} ${m.player2}`;
    }
    card.appendChild(scoreLine);
    container.appendChild(card);
  }
}

// Stats: top scorers and goals conceded
function computeTopScorers(matches, playersList) {
  const goals = new Map();
  playersList.forEach(p => goals.set(p.name, 0));
  matches.forEach(m => {
    const unplayed = (!Number.isFinite(m.score1) && !Number.isFinite(m.score2)) || (m.score1 === -1 && m.score2 === -1);
    if (unplayed) return;
    goals.set(m.player1, (goals.get(m.player1) || 0) + (Number.isFinite(m.score1) ? m.score1 : 0));
    goals.set(m.player2, (goals.get(m.player2) || 0) + (Number.isFinite(m.score2) ? m.score2 : 0));
  });
  const arr = Array.from(goals.entries()).map(([player, goalsCount]) => ({ player, goals: goalsCount }));
  arr.sort((a,b)=>b.goals - a.goals || a.player.localeCompare(b.player));
  return arr;
}

function computeGoalsConceded(matches, playersList) {
  const conceded = new Map();
  playersList.forEach(p => conceded.set(p.name, 0));
  matches.forEach(m => {
    const unplayed = (!Number.isFinite(m.score1) && !Number.isFinite(m.score2)) || (m.score1 === -1 && m.score2 === -1);
    if (unplayed) return;
    conceded.set(m.player1, (conceded.get(m.player1) || 0) + (Number.isFinite(m.score2) ? m.score2 : 0));
    conceded.set(m.player2, (conceded.get(m.player2) || 0) + (Number.isFinite(m.score1) ? m.score1 : 0));
  });
  const arr = Array.from(conceded.entries()).map(([player, goals]) => ({ player, goals }));
  arr.sort((a,b)=>b.goals - a.goals || a.player.localeCompare(b.player));
  return arr;
}

function renderStatsTable(arr, label) {
  const el = document.getElementById("stats-area");
  el.innerHTML = "";
  const tbl = document.createElement("table"); tbl.className = "stats-table";
  const thead = document.createElement("thead"); thead.innerHTML = `<tr><th>Player</th><th>${label}</th></tr>`;
  const tbody = document.createElement("tbody");
  for (const row of arr) {
    const tr = document.createElement("tr"); tr.innerHTML = `<td>${row.player}</td><td>${row.goals}</td>`; tbody.appendChild(tr);
  }
  tbl.appendChild(thead); tbl.appendChild(tbody); el.appendChild(tbl);
}

// Modal functions
function openPlayerModal(name, description) {
  document.getElementById("modal-player-name").textContent = name;
  document.getElementById("modal-player-description").textContent = description || "";
  const modalImg = document.getElementById("modal-player-image");
  modalImg.src = ""; modalImg.alt = name;
  getPlayerImageUrl(name).then(url => { if (url) modalImg.src = url; }).catch(()=>{});
  const modal = document.getElementById("player-modal"); modal.setAttribute("aria-hidden", "false");
}
function closePlayerModal() { const modal = document.getElementById("player-modal"); modal.setAttribute("aria-hidden", "true"); }

// Wiring
document.addEventListener("DOMContentLoaded", async () => {
  const matchesPrevBtn = document.getElementById("matches-prev");
  const matchesNextBtn = document.getElementById("matches-next");
  const statsBtnScorers = document.getElementById("stats-btn-scorers");
  const statsBtnConceded = document.getElementById("stats-btn-conceded");
  const modalClose = document.getElementById("modal-close");
  const modalBackdrop = document.getElementById("modal-backdrop");

  modalClose.addEventListener("click", closePlayerModal);
  modalBackdrop.addEventListener("click", closePlayerModal);

  try {
    const [playerRows, matchRows] = await Promise.all([
      fetchGvizRows("PlayerInfo"),
      fetchGvizRows("Matches")
    ]);

    const playersList = parsePlayers(playerRows);
    const matches = parseMatches(matchRows);
    const playerInfoMap = {};
    playersList.forEach(p => playerInfoMap[p.name] = p);

    // Standings
    const standings = computeStandings(matches, playersList);
    await renderStandingsTable(standings, playerInfoMap);

    // Matches slider
    const grouped = groupMatchesByMatchday(matches);
    const days = grouped.days;
    if (!days || days.length === 0) {
    const el = document.createElement("div");
    el.className = "match-card";
    el.textContent = "No matches found in sheet.";
    document.getElementById("matches-title").textContent = "No matchdays found";
    document.getElementById("matches-slide").innerHTML = "";
    document.getElementById("matches-slide").appendChild(el);
    } else {
      let currentIdx = days.length - 1; // default to max matchday
      const showCurrent = () => {
        const day = days[currentIdx];
        const arr = grouped.map.get(day) || [];
        renderMatchesForDay(day, arr);
        matchesPrevBtn.disabled = (currentIdx === 0);
        matchesNextBtn.disabled = (currentIdx === days.length - 1);
      };
      matchesPrevBtn.addEventListener("click", () => { if (currentIdx > 0) { currentIdx -= 1; showCurrent(); } });
      matchesNextBtn.addEventListener("click", () => { if (currentIdx < days.length - 1) { currentIdx += 1; showCurrent(); } });
      showCurrent();
    }

    // Stats
    const scorers = computeTopScorers(matches, playersList);
    const conceded = computeGoalsConceded(matches, playersList);
    renderStatsTable(scorers, "Goals Scored");
    statsBtnScorers.addEventListener("click", () => {
      statsBtnScorers.classList.add("active"); statsBtnConceded.classList.remove("active");
      renderStatsTable(scorers, "Goals Scored");
    });
    statsBtnConceded.addEventListener("click", () => {
      statsBtnConceded.classList.add("active"); statsBtnScorers.classList.remove("active");
      renderStatsTable(conceded, "Goals Conceded");
    });

  } catch (err) {
    console.error(err);
    const errMsg = document.createElement("div");
    errMsg.style.color = "#ffb3a7";
    errMsg.style.padding = "12px";
    errMsg.textContent = "Error loading data from Google Sheets (gviz). Make sure the sheet id is correct and the sheet is shared (anyone with link can view) or published.";
    document.querySelector("main").prepend(errMsg);
  }
});
