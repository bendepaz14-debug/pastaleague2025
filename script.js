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
      stats[m.player1].d++; stats[m.player2].d++; stats[m.player1].pts++; stats[m.player2].pts++;
    }
  });

  const arr = Object.values(stats).map(s => ({ ...s, gd: (s.gf||0) - (s.ga||0) }));
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

    tr.innerHTML = `
      <td>${i+1}</td>
      <td class="player-cell">
        <img class="player-thumb" src="${imgUrl}" alt="${s.name}">
        <span class="player-name">${s.name}</span>
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

    const imgEl = tr.querySelector("img.player-thumb");
    if (imgEl) {
      imgEl.style.cursor = "pointer";
      imgEl.addEventListener("click", () => {
        const info = playerInfoMap[s.name] || { description: "" };
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
  const days = Array.from(map.keys()).sort((a,b)=>a-b);
  return { map, days };
}

// render matches for a day
async function renderMatchesForDay(matchday, matchesForDay, playerInfoMap) {
  const container = document.getElementById("matches-slide");
  container.innerHTML = "";
  document.getElementById("matches-title").textContent = `Matchday ${matchday}`;

  if (!matchesForDay || matchesForDay.length === 0) {
    const el = document.createElement("div");
    el.className = "match-card";
    el.textContent = "No matches available for this matchday.";
    container.appendChild(el);
    return;
  }

  for (const m of matchesForDay) {
    const leftImgUrl = await getPlayerImageUrl(m.player1);
    const rightImgUrl = await getPlayerImageUrl(m.player2);
    const s1 = (Number.isFinite(m.score1) && m.score1 >= 0) ? m.score1 : "";
    const s2 = (Number.isFinite(m.score2) && m.score2 >= 0) ? m.score2 : "";

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

    const leftImgEl = card.querySelector("img.left-thumb");
    const rightImgEl = card.querySelector("img.right-thumb");
    if (leftImgEl) {
      leftImgEl.style.cursor = "pointer";
      leftImgEl.addEventListener("click", () => {
        const info = playerInfoMap[m.player1] || { description: "" };
        openPlayerModal(m.player1, info.description);
      });
    }
    if (rightImgEl) {
      rightImgEl.style.cursor = "pointer";
      rightImgEl.addEventListener("click", () => {
        const info = playerInfoMap[m.player2] || { description: "" };
        openPlayerModal(m.player2, info.description);
      });
    }

    container.appendChild(card);
  }
}

// stats helpers
function computeTopScorers(matches, playersList) {
  const map = new Map(playersList.map(p => [p.name, 0]));
  matches.forEach(m => {
    if (Number.isFinite(m.score1) && m.score1 >= 0) map.set(m.player1, (map.get(m.player1) || 0) + m.score1);
    if (Number.isFinite(m.score2) && m.score2 >= 0) map.set(m.player2, (map.get(m.player2) || 0) + m.score2);
  });
  return Array.from(map.entries()).map(([player,goals]) => ({ player, goals })).sort((a,b)=>b.goals - a.goals || a.player.localeCompare(b.player));
}
function computeGoalsConceded(matches, playersList) {
  const map = new Map(playersList.map(p => [p.name, 0]));
  matches.forEach(m => {
    if (Number.isFinite(m.score1) && m.score1 >= 0) map.set(m.player2, (map.get(m.player2) || 0) + m.score1);
    if (Number.isFinite(m.score2) && m.score2 >= 0) map.set(m.player1, (map.get(m.player1) || 0) + m.score2);
  });
  return Array.from(map.entries()).map(([player,goals]) => ({ player, goals })).sort((a,b)=>b.goals - a.goals || a.player.localeCompare(b.player));
}
function renderStatsTable(arr, label) {
  const el = document.getElementById("stats-area");
  el.innerHTML = "";
  const tbl = document.createElement("table");
  tbl.className = "stats-table";
  const thead = document.createElement("thead"); thead.innerHTML = `<tr><th>Player</th><th>${label}</th></tr>`;
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

// modal (player)
async function openPlayerModal(name, description) {
  document.getElementById("modal-player-name").textContent = name;
  document.getElementById("modal-player-description").textContent = description || "";
  const modalImg = document.getElementById("modal-player-image");
  modalImg.src = ""; modalImg.alt = name;
  const url = await getPlayerImageUrl(name);
  if (url) modalImg.src = url;
  document.getElementById("player-modal").setAttribute("aria-hidden", "false");
}
function closePlayerModal() {
  document.getElementById("player-modal").setAttribute("aria-hidden", "true");
}

// GUIDE helpers

// split guide content into parts by markers like "חלק 1:" and remove the marker from displayed part
function splitGuideIntoPartsClean(text) {
  if (!text) return [];
  const normalized = text.replace(/\r\n/g, "\n");
  // find indexes of markers "חלק <num>:" (Hebrew)
  const regex = /חלק\s*\d+\s*:/g;
  const matches = [...normalized.matchAll(regex)];
  if (matches.length === 0) {
    // fallback: split by double newlines into paragraphs if no markers
    return normalized.split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
  }
  const parts = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = (i + 1 < matches.length) ? matches[i+1].index : normalized.length;
    let chunk = normalized.substring(start, end).trim();
    // remove the leading marker "חלק N:" from the chunk
    chunk = chunk.replace(regex, '').trim();
    parts.push(chunk);
  }
  return parts;
}

// detect if string contains Hebrew characters
function containsHebrew(s) {
  return /[\u0590-\u05FF]/.test(s);
}

// Guides: display single card (title only) and allow prev/next to switch guides
function renderGuidesSingle(guides) {
  const container = document.getElementById("guides-single");
  container.innerHTML = "";
  if (!guides || guides.length === 0) {
    container.innerHTML = "<div class='guide-card-single'><h4>No guides found</h4></div>";
    return;
  }

  // state: index
  let idx = 0;

  const renderIndex = (i) => {
    container.innerHTML = "";
    const g = guides[i];
    const card = document.createElement("div");
    card.className = "guide-card-single";
    card.innerHTML = `<h4>${g.title}</h4><p></p>`;
    // open modal on click
    card.addEventListener("click", () => {
      const parts = splitGuideIntoPartsClean(g.content);
      openGuideModal(g.title, parts);
    });
    container.appendChild(card);
  };

  // attach prev/next buttons
  const prevBtn = document.getElementById("guides-prev");
  const nextBtn = document.getElementById("guides-next");
  const updateButtons = () => {
    prevBtn.disabled = (idx === 0);
    nextBtn.disabled = (idx === guides.length - 1);
  };

  prevBtn.addEventListener("click", () => {
    if (idx > 0) { idx--; renderIndex(idx); updateButtons(); }
  });
  nextBtn.addEventListener("click", () => {
    if (idx < guides.length - 1) { idx++; renderIndex(idx); updateButtons(); }
  });

  // initial render
  renderIndex(idx);
  updateButtons();
}

// openGuideModal: shows title and parts (parts array of strings). Right-align text when title is Hebrew.
function openGuideModal(title, parts) {
  const modal = document.getElementById("guide-modal");
  document.getElementById("guide-modal-title").textContent = title;
  const container = document.getElementById("guide-slides-container");
  container.innerHTML = "";

  // create slides (parts) and remove any leading "חלק..." markers (already removed by splitGuideIntoPartsClean)
  if (!parts || parts.length === 0) {
    const single = document.createElement("div");
    single.className = "guide-slide active";
    single.innerHTML = `<div>No content</div>`;
    container.appendChild(single);
  } else {
    for (let i = 0; i < parts.length; i++) {
      const slide = document.createElement("div");
      slide.className = "guide-slide";
      if (i === 0) slide.classList.add("active");
      // preserve newlines
      slide.innerHTML = parts[i].split("\n").map(line => `<p>${line}</p>`).join("");
      container.appendChild(slide);
    }
  }

  // RTL if title contains Hebrew
  const right = containsHebrew(title);
  const slides = container.querySelectorAll(".guide-slide");
  slides.forEach(s => {
    s.style.direction = right ? "rtl" : "ltr";
    s.style.textAlign = right ? "right" : "left";
  });

  // store index
  container.dataset.index = 0;
  document.getElementById("guide-modal").setAttribute("aria-hidden", "false");
}

// close guide modal
function closeGuideModal() {
  document.getElementById("guide-modal").setAttribute("aria-hidden", "true");
}

// navigate guide slides
function guideShowIndex(idx) {
  const container = document.getElementById("guide-slides-container");
  const slides = container.querySelectorAll(".guide-slide");
  if (!slides || slides.length === 0) return;
  if (idx < 0) idx = 0;
  if (idx >= slides.length) idx = slides.length - 1;
  slides.forEach((s, i) => {
    s.classList.toggle("active", i === idx);
  });
  container.dataset.index = idx;
}

// wiring and main
document.addEventListener("DOMContentLoaded", async () => {
  // existing modal handlers
  document.getElementById("modal-close").addEventListener("click", closePlayerModal);
  document.getElementById("modal-backdrop").addEventListener("click", closePlayerModal);

  // guide modal handlers
  document.getElementById("guide-modal-close").addEventListener("click", closeGuideModal);
  document.getElementById("guide-modal-backdrop").addEventListener("click", closeGuideModal);
  document.getElementById("guide-prev").addEventListener("click", () => {
    const container = document.getElementById("guide-slides-container");
    const idx = Number(container.dataset.index || 0) - 1;
    guideShowIndex(idx);
  });
  document.getElementById("guide-next").addEventListener("click", () => {
    const container = document.getElementById("guide-slides-container");
    const idx = Number(container.dataset.index || 0) + 1;
    guideShowIndex(idx);
  });

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
    const guidesList = parseGuides(guidesRows);

    // standings
    const standings = computeStandings(matches, playersList);
    await renderStandingsTable(standings, playerInfoMap);

    // matches
    const grouped = groupMatches(matches);
    const days = grouped.days;
    if (!days || days.length === 0) {
      document.getElementById("matches-title").textContent = "No matchdays found";
      document.getElementById("matches-slide").innerHTML = "<div class='match-card'>No matches found</div>";
    } else {
      let currentIdx = days.length - 1;
      const showCurrent = () => {
        const day = days[currentIdx];
        const arr = grouped.map.get(day) || [];
        renderMatchesForDay(day, arr, playerInfoMap);
        document.getElementById("matches-prev").disabled = (currentIdx === 0);
        document.getElementById("matches-next").disabled = (currentIdx === days.length - 1);
      };
      document.getElementById("matches-prev").addEventListener("click", () => { if (currentIdx > 0) { currentIdx--; showCurrent(); } });
      document.getElementById("matches-next").addEventListener("click", () => { if (currentIdx < days.length - 1) { currentIdx++; showCurrent(); } });
      showCurrent();
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

    // guides (single-card view)
    renderGuidesSingle(guidesList);

  } catch (err) {
    console.error(err);
    const errMsg = document.createElement("div");
    errMsg.style.color = "#ffb3a7";
    errMsg.style.padding = "12px";
    errMsg.textContent = "Error loading data from Google Sheets (gviz). Make sure sheets exist and are shared.";
    document.querySelector("main").prepend(errMsg);
  }
});
