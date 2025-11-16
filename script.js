// ----- CONFIG -----
const SHEET_ID = "1--or-XBf1Ys71it7cRCSnZOodHIP8wr9bW_HUoTJtCs";

// Build GViz URL
function gvizUrl(sheetName) {
  return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`;
}

// Stable GViz parser: extract JSON object safely
async function fetchGvizRows(sheetName) {
  const url = gvizUrl(sheetName);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch sheet ${sheetName}: ${res.status}`);
  const text = await res.text();

  // Extract JSON object between first { and last }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Unexpected GViz response");
  const jsonText = text.substring(start, end + 1);
  const parsed = JSON.parse(jsonText);
  if (!parsed.table || !parsed.table.rows) return [];
  return parsed.table.rows.map(r => (r.c || []).map(c => (c && c.v !== undefined ? c.v : "")));
}

// Parse players (PlayerInfo sheet)
function parsePlayers(rows) {
  if (!rows || rows.length === 0) return [];
  let start = 0;
  const first = rows[0].map(c => (c || "").toString().toLowerCase());
  if (first.includes("name")) start = 1;
  const out = [];
  for (let i = start; i < rows.length; i++) {
    const r = rows[i] || [];
    const name = (r[0] || "").toString().trim();
    const desc = (r[1] || "").toString().trim();
    if (name) out.push({ name, description: desc });
  }
  return out;
}

// Parse matches (Matches sheet) — tolerant to formatting
function parseMatches(rows) {
  if (!rows || rows.length === 0) return [];
  let start = 0;
  const first = rows[0].map(c => (c || "").toString().toLowerCase());
  if (first.includes("matchday") && first.includes("player1")) start = 1;
  const out = [];
  for (let i = start; i < rows.length; i++) {
    const r = rows[i] || [];
    // matchday parse: trim and convert when numeric-like
    let mdRaw = (r[0] || "").toString().trim();
    if (mdRaw === "") continue; // skip blank rows
    const mdNum = Number(mdRaw);
    const matchday = Number.isFinite(mdNum) ? mdNum : mdRaw;
    const player1 = (r[1] || "").toString().trim();
    const player2 = (r[2] || "").toString().trim();
    // scores: empty -> -1 (unplayed)
    const score1 = (r[3] === "" || r[3] === null || r[3] === undefined) ? -1 : Number(r[3]);
    const score2 = (r[4] === "" || r[4] === null || r[4] === undefined) ? -1 : Number(r[4]);
    out.push({ matchday, player1, player2, score1: Number.isFinite(score1) ? score1 : -1, score2: Number.isFinite(score2) ? score2 : -1 });
  }
  return out;
}

// Try to find player image in gallery (common extensions)
async function getPlayerImageUrl(name) {
  if (!name) return "gallery/default.png";
  const tryNames = [`${name}.jpeg`, `${name}.jpg`, `${name}.png`, `${name}.webp`, `${encodeURIComponent(name)}.jpeg`, `${encodeURIComponent(name)}.jpg`, `${encodeURIComponent(name)}.png`, `${encodeURIComponent(name)}.webp`];
  for (const f of tryNames) {
    const url = `gallery/${f}`;
    try {
      const r = await fetch(url, { method: "GET" });
      if (r.ok) return url;
    } catch (_) { /* ignore */ }
  }
  return "gallery/default.png";
}

// Compute standings
function computeStandings(matches, playersList) {
  const stats = {};
  // seed from players list
  playersList.forEach(p => stats[p.name] = { name: p.name, mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 });

  // ensure names in matches also included
  matches.forEach(m => {
    if (m.player1 && !stats[m.player1]) stats[m.player1] = { name: m.player1, mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 };
    if (m.player2 && !stats[m.player2]) stats[m.player2] = { name: m.player2, mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 };

    // count only played matches (scores >= 0)
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
      stats[m.player1].d++; stats[m.player2].d++; stats[m.player1].pts++; stats[m.player2].pts++;
    }
  });

  const arr = Object.values(stats).map(s => ({ ...s, gd: (s.gf || 0) - (s.ga || 0) }));
  // sort by pts, gd, gf, name
  arr.sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.gd !== a.gd) return b.gd - a.gd;
    if (b.gf !== a.gf) return b.gf - a.gf;
    return a.name.localeCompare(b.name);
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
    if (i < 2) tr.classList.add("top2");
    else if (i < 6) tr.classList.add("playoffs");

    const imgUrl = await getPlayerImageUrl(s.name);

    tr.innerHTML = `
      <td>${i + 1}</td>
      <td class="player-cell"><img class="player-thumb" src="${imgUrl}" alt="${s.name}"><span class="player-name">${s.name}</span></td>
      <td>${s.mp}</td>
      <td>${s.w}</td>
      <td>${s.d}</td>
      <td>${s.l}</td>
      <td>${s.gf}</td>
      <td>${s.ga}</td>
      <td>${s.gd}</td>
      <td class="pts-bold">${s.pts}</td>
    `;
    tbody.appendChild(tr);
  }
}

// Group matches by day (numbers sorted)
function groupMatches(matches) {
  const map = new Map();
  matches.forEach(m => {
    if (!map.has(m.matchday)) map.set(m.matchday, []);
    map.get(m.matchday).push(m);
  });
  const days = Array.from(map.keys()).sort((a,b) => a - b);
  return { map, days };
}

// Render matches for a single day
async function renderMatchesForDay(matchday, matchesForDay) {
  const container = document.getElementById("matches-slide");
  container.innerHTML = "";
  document.getElementById("matches-title").textContent = `Matchday ${matchday}`;

  if (!matchesForDay || matchesForDay.length === 0) {
    const el = document.createElement("div");
    el.className = "match-card";
    el.textContent = "No matches for this matchday.";
    container.appendChild(el);
    return;
  }

  for (const m of matchesForDay) {
    const leftImg = await getPlayerImageUrl(m.player1);
    const rightImg = await getPlayerImageUrl(m.player2);
    const s1 = (Number.isFinite(m.score1) && m.score1 >= 0) ? m.score1 : "";
    const s2 = (Number.isFinite(m.score2) && m.score2 >= 0) ? m.score2 : "";

    const card = document.createElement("div");
    card.className = "match-card";
    card.innerHTML = `
      <div class="player-block">
        <img class="player-thumb" src="${leftImg}" alt="${m.player1}">
        <span>${m.player1}</span>
      </div>

      <div class="score-area">
        <div class="score-box ${s1 === "" ? "empty" : ""}">${s1}</div>
        <div class="score-dash">-</div>
        <div class="score-box ${s2 === "" ? "empty" : ""}">${s2}</div>
      </div>

      <div class="player-block right">
        <img class="player-thumb" src="${rightImg}" alt="${m.player2}">
        <span>${m.player2}</span>
      </div>
    `;
    container.appendChild(card);
  }
}

// Top scorers & conceded
function computeTopScorers(matches, playersList) {
  const map = new Map(playersList.map(p => [p.name, 0]));
  matches.forEach(m => {
    if (Number.isFinite(m.score1) && m.score1 >= 0) map.set(m.player1, (map.get(m.player1) || 0) + m.score1);
    if (Number.isFinite(m.score2) && m.score2 >= 0) map.set(m.player2, (map.get(m.player2) || 0) + m.score2);
  });
  return Array.from(map.entries()).map(([player, goals]) => ({ player, goals })).sort((a,b) => b.goals - a.goals || a.player.localeCompare(b.player));
}
function computeGoalsConceded(matches, playersList) {
  const map = new Map(playersList.map(p => [p.name, 0]));
  matches.forEach(m => {
    if (Number.isFinite(m.score1) && m.score1 >= 0) map.set(m.player2, (map.get(m.player2) || 0) + m.score1);
    if (Number.isFinite(m.score2) && m.score2 >= 0) map.set(m.player1, (map.get(m.player1) || 0) + m.score2);
  });
  return Array.from(map.entries()).map(([player, goals]) => ({ player, goals })).sort((a,b) => b.goals - a.goals || a.player.localeCompare(b.player));
}

function renderStatsTable(arr, label) {
  const el = document.getElementById("stats-area");
  el.innerHTML = "";
  const tbl = document.createElement("table");
  tbl.className = "stats-table";
  const thead = document.createElement("thead");
  thead.innerHTML = `<tr><th>Player</th><th>${label}</th></tr>`;
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

// Modal helpers
function openPlayerModal(name, description) {
  document.getElementById("modal-player-name").textContent = name;
  document.getElementById("modal-player-description").textContent = description || "";
  getPlayerImageUrl(name).then(url => { document.getElementById("modal-player-image").src = url; });
  document.getElementById("player-modal").setAttribute("aria-hidden", "false");
}
function closePlayerModal() {
  document.getElementById("player-modal").setAttribute("aria-hidden", "true");
}

// Wiring on DOM ready
document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("modal-close").addEventListener("click", closePlayerModal);
  document.getElementById("modal-backdrop").addEventListener("click", closePlayerModal);

  try {
    const [playerRows, matchRows] = await Promise.all([
      fetchGvizRows("PlayerInfo"),
      fetchGvizRows("Matches")
    ]);

    const playersList = parsePlayers(playerRows);
    const matches = parseMatches(matchRows);

    // Standings
    const standings = computeStandings(matches, playersList);
    await renderStandingsTable(standings, {}); // playerInfoMap not required here

    // Matches
    const grouped = groupMatches(matches);
    let currentIdx = grouped.days.length - 1;
    if (currentIdx < 0) {
      document.getElementById("matches-title").textContent = "No matchdays found";
      document.getElementById("matches-slide").innerHTML = "<div class='match-card'>No matches found</div>";
    } else {
      const showCurrent = () => {
        const day = grouped.days[currentIdx];
        const arr = grouped.map.get(day) || [];
        renderMatchesForDay(day, arr);
        document.getElementById("matches-prev").disabled = (currentIdx === 0);
        document.getElementById("matches-next").disabled = (currentIdx === grouped.days.length - 1);
      };
      document.getElementById("matches-prev").addEventListener("click", () => { if (currentIdx > 0) { currentIdx--; showCurrent(); } });
      document.getElementById("matches-next").addEventListener("click", () => { if (currentIdx < grouped.days.length - 1) { currentIdx++; showCurrent(); } });
      showCurrent();
    }

    // Stats
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

  } catch (err) {
    console.error(err);
    const msg = document.createElement("div");
    msg.style.color = "#ffb3a7";
    msg.style.padding = "12px";
    msg.textContent = "Error loading data from Google Sheets (check sharing and sheet names).";
    document.querySelector("main").prepend(msg);
  }
});
