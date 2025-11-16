// script.js - SAME AS YOUR PREVIOUS WORKING VERSION, ONLY MATCHES PARSE FIXED

// -------------------------------
// CONFIG
// -------------------------------
const SHEET_ID = "1--or-XBf1Ys71it7cRCSnZOodHIP8wr9bW_HUoTJtCs";

function gvizUrl(sheetName) {
  return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`;
}

// -------------------------------
// ORIGINAL GVIZ PARSER (your working version)
// -------------------------------
async function fetchGvizRows(sheetName) {
  const url = gvizUrl(sheetName);
  const res = await fetch(url);
  const text = await res.text();

  // extract JSON inside google.visualization.Query.setResponse(...)
  const m = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);/);
  if (!m) {
    console.error("GViz response format changed:", text);
    return [];
  }

  const json = JSON.parse(m[1]);
  const rows = (json.table && json.table.rows)
    ? json.table.rows.map(r => (r.c || []).map(cell => cell && cell.v !== undefined ? cell.v : ""))
    : [];

  return rows;
}

// -------------------------------
// PLAYER INFO PARSER (unchanged)
// -------------------------------
function parsePlayers(rows) {
  const parsed = [];
  let startIdx = 0;
  if (rows.length > 0) {
    const first = rows[0].map(c => (c || "").toString().trim().toLowerCase());
    if (first.includes("name") && (first.includes("description") || first.includes("desc")))
      startIdx = 1;
  }
  for (let i = startIdx; i < rows.length; i++) {
    const r = rows[i] || [];
    const name = (r[0] || "").toString().trim();
    const desc = (r[1] || "").toString().trim();
    if (name) parsed.push({ name, description: desc });
  }
  return parsed;
}

// -------------------------------
// MATCHES PARSER — FIXED VERSION
// -------------------------------
function parseMatches(rows) {
  const parsed = [];
  let startIdx = 0;

  if (rows.length > 0) {
    const header = rows[0].map(c => (c || "").toString().trim().toLowerCase());
    if (header.includes("matchday")) startIdx = 1;
  }

  for (let i = startIdx; i < rows.length; i++) {
    const r = rows[i] || [];

    // matchday fix — trims spaces, converts 1.0 → 1, "" → skip
    let md = (r[0] || "").toString().trim();
    if (md === "") continue;
    const mdNum = Number(md);
    const matchday = Number.isFinite(mdNum) ? mdNum : md;

    const player1 = (r[1] || "").toString().trim();
    const player2 = (r[2] || "").toString().trim();

    // DO NOT SKIP if player1/player2 exist — this fixes "Shabo vs Arthur"
    if (!player1 && !player2) continue;

    const s1 = (r[3] === "" || r[3] === null || r[3] === undefined) ? -1 : Number(r[3]);
    const s2 = (r[4] === "" || r[4] === null || r[4] === undefined) ? -1 : Number(r[4]);

    parsed.push({
      matchday,
      player1,
      player2,
      score1: s1,
      score2: s2
    });
  }

  return parsed;
}

// -------------------------------
// STANDINGS (unchanged, your version)
// -------------------------------
function computeStandings(matches, playersList) {
  const playerNames = new Set();
  playersList.forEach(p => playerNames.add(p.name));
  matches.forEach(m => {
    if (m.player1) playerNames.add(m.player1);
    if (m.player2) playerNames.add(m.player2);
  });

  const stats = {};
  for (const name of playerNames)
    stats[name] = { name, mp: 0, pts: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 };

  for (const m of matches) {
    const { player1, player2, score1, score2 } = m;
    const played = score1 !== -1 && score2 !== -1;

    if (!(player1 in stats)) stats[player1] = { name: player1, mp: 0, pts: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 };
    if (!(player2 in stats)) stats[player2] = { name: player2, mp: 0, pts: 0, w: 0, d: 0, l: 0, ga: 0, gf: 0 };

    if (played) {
      stats[player1].mp++;
      stats[player2].mp++;

      stats[player1].gf += score1;
      stats[player1].ga += score2;

      stats[player2].gf += score2;
      stats[player2].ga += score1;

      if (score1 > score2) {
        stats[player1].w++; stats[player1].pts += 3;
        stats[player2].l++;
      } else if (score2 > score1) {
        stats[player2].w++; stats[player2].pts += 3;
        stats[player1].l++;
      } else {
        stats[player1].d++; stats[player2].d++;
        stats[player1].pts++; stats[player2].pts++;
      }
    }
  }

  return Object.values(stats).map(s => ({
    ...s,
    gd: s.gf - s.ga
  })).sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.gd !== a.gd) return b.gd - a.gd;
    if (b.gf !== a.gf) return b.gf - a.gf;
    return a.name.localeCompare(b.name);
  });
}

async function renderStandingsTable(standings, playerInfoMap) {
  const tbody = document.querySelector("#standings-table tbody");
  tbody.innerHTML = "";

  for (let i = 0; i < standings.length; i++) {
    const s = standings[i];
    const tr = document.createElement("tr");

    if (i < 2) tr.classList.add("top2");
    else if (i < 6) tr.classList.add("playoffs");

    tr.innerHTML = `
      <td>${i + 1}</td>
      <td class="player-cell">
        <img class="player-thumb">
        <span>${s.name}</span>
      </td>
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

    const img = tr.querySelector("img");
    getPlayerImageUrl(s.name).then(url => {
      if (url) img.src = url;
    });
  }
}

// -------------------------------
// MATCHES GROUPING (fixed)
// -------------------------------
function groupMatchesByMatchday(matches) {
  const map = new Map();
  matches.forEach(m => {
    if (!map.has(m.matchday)) map.set(m.matchday, []);
    map.get(m.matchday).push(m);
  });

  return {
    days: [...map.keys()].sort((a, b) => a - b),
    map
  };
}

// -------------------------------
// RENDER MATCHDAY — unchanged style
// -------------------------------
async function renderMatchesForDay(matchday, matchesForDay) {
  const container = document.getElementById("matches-slide");
  container.innerHTML = "";
  document.getElementById("matches-title").textContent = `Matchday ${matchday}`;

  for (const m of matchesForDay) {
    const leftImg = await getPlayerImageUrl(m.player1);
    const rightImg = await getPlayerImageUrl(m.player2);

    const s1 = m.score1 === -1 ? "" : m.score1;
    const s2 = m.score2 === -1 ? "" : m.score2;

    const card = document.createElement("div");
    card.className = "match-card";

    card.innerHTML = `
      <div class="player-block left">
        <img class="player-thumb" src="${leftImg || ""}">
        <div>${m.player1}</div>
      </div>

      <div class="score-area">
        <div class="score-box">${s1}</div>
        <div class="dash">-</div>
        <div class="score-box">${s2}</div>
      </div>

      <div class="player-block right">
        <img class="player-thumb" src="${rightImg || ""}">
        <div>${m.player2}</div>
      </div>
    `;

    container.appendChild(card);
  }
}

// -------------------------------
// PLAYER IMAGE FINDER
// -------------------------------
async function getPlayerImageUrl(name) {
  if (!name) return null;

  const files = [
    `${name}.png`, `${name}.jpg`, `${name}.jpeg`, `${name}.webp`,
    `${encodeURIComponent(name)}.png`,
    `${encodeURIComponent(name)}.jpg`,
    `${encodeURIComponent(name)}.jpeg`,
    `${encodeURIComponent(name)}.webp`
  ];

  for (const f of files) {
    const url = `gallery/${f}`;
    try {
      const r = await fetch(url);
      if (r.ok) return url;
    } catch (_) {}
  }
  return null;
}

// -------------------------------
// STATS (unchanged)
// -------------------------------
function computeTopScorers(matches, playersList) {
  const goals = new Map();
  playersList.forEach(p => goals.set(p.name, 0));
  matches.forEach(m => {
    if (m.score1 !== -1) goals.set(m.player1, goals.get(m.player1) + m.score1);
    if (m.score2 !== -1) goals.set(m.player2, goals.get(m.player2) + m.score2);
  });
  return [...goals.entries()].map(([player, goals]) => ({ player, goals }))
    .sort((a, b) => b.goals - a.goals);
}

function computeGoalsConceded(matches, playersList) {
  const conceded = new Map();
  playersList.forEach(p => conceded.set(p.name, 0));
  matches.forEach(m => {
    if (m.score1 !== -1) conceded.set(m.player1, conceded.get(m.player1) + m.score2);
    if (m.score2 !== -1) conceded.set(m.player2, conceded.get(m.player2) + m.score1);
  });
  return [...conceded.entries()].map(([player, goals]) => ({ player, goals }))
    .sort((a, b) => b.goals - a.goals);
}

function renderStatsTable(arr, label) {
  const area = document.getElementById("stats-area");
  area.innerHTML = "";

  const tbl = document.createElement("table");
  tbl.className = "stats-table";

  tbl.innerHTML = `
    <thead>
      <tr>
        <th>Player</th>
        <th class="num">${label}</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;

  const body = tbl.querySelector("tbody");

  arr.forEach(row => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.player}</td>
      <td class="num">${row.goals}</td>
    `;
    body.appendChild(tr);
  });

  area.appendChild(tbl);
}

// -------------------------------
// MAIN — unchanged except matches fix
// -------------------------------
document.addEventListener("DOMContentLoaded", async () => {
  try {
    const [playerRows, matchRows] = await Promise.all([
      fetchGvizRows("PlayerInfo"),
      fetchGvizRows("Matches")
    ]);

    // Parse
    const playersList = parsePlayers(playerRows);
    const matches = parseMatches(matchRows);

    // TABLE
    const standings = computeStandings(matches, playersList);
    const playerInfoMap = {};
    playersList.forEach(p => playerInfoMap[p.name] = p);
    await renderStandingsTable(standings, playerInfoMap);

    // MATCHES
    const grouped = groupMatchesByMatchday(matches);
    const days = grouped.days;
    let idx = days.length - 1;

    const show = () =>
      renderMatchesForDay(days[idx], grouped.map.get(days[idx]));

    show();

    document.getElementById("matches-prev").onclick = () => {
      if (idx > 0) idx--;
      show();
    };

    document.getElementById("matches-next").onclick = () => {
      if (idx < days.length - 1) idx++;
      show();
    };

    // STATS
    const scorers = computeTopScorers(matches, playersList);
    const conceded = computeGoalsConceded(matches, playersList);
    renderStatsTable(scorers, "Goals");

    document.getElementById("stats-btn-scorers").onclick = () => {
      renderStatsTable(scorers, "Goals");
      document.getElementById("stats-btn-scorers").classList.add("active");
      document.getElementById("stats-btn-conceded").classList.remove("active");
    };

    document.getElementById("stats-btn-conceded").onclick = () => {
      renderStatsTable(conceded, "Conceded");
      document.getElementById("stats-btn-conceded").classList.add("active");
      document.getElementById("stats-btn-scorers").classList.remove("active");
    };

  } catch (err) {
    console.error(err);
    alert("Error loading data from Google Sheets. Check console.");
  }
});
