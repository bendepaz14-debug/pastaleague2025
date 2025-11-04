const sheetId = "1--or-XBf1Ys71it7cRCSnZOodHIP8wr9bW_HUoTJtCs";
const sheetName = "LeagueTable";
const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=${sheetName}`;

async function loadLeagueData() {
  const debugBox = document.getElementById("debug");
  const tableBody = document.getElementById("leagueBody");
  const scorersBody = document.getElementById("scorersBody");
  const totalGoalsElem = document.getElementById("totalGoals");
  debugBox.innerText = "";

  try {
    const res = await fetch(url);
    const text = await res.text();

    const json = JSON.parse(text.substr(47).slice(0, -2));
    const rows = json.table.rows.map(r => r.c.map(c => (c ? c.v : 0)));

    tableBody.innerHTML = "";
    let totalGoals = 0;

    rows.forEach((row, i) => {
      const [player, w, d, l, gf, ga, pts] = row;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${i + 1}</td>
        <td>${player}</td>
        <td>${w}</td>
        <td>${d}</td>
        <td>${l}</td>
        <td>${gf}</td>
        <td>${ga}</td>
        <td>${pts}</td>
      `;
      tableBody.appendChild(tr);
      totalGoals += parseInt(gf) || 0;
    });

    totalGoalsElem.textContent = totalGoals;

    // Top scorers
    const sorted = [...rows].sort((a, b) => b[4] - a[4]); // GF = index 4
    scorersBody.innerHTML = "";
    sorted.slice(0, 5).forEach((r, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${i + 1}</td><td>${r[0]}</td><td>${r[4]}</td>`;
      scorersBody.appendChild(tr);
    });

    debugBox.innerHTML = `<span style="color:lightgreen;">✅ Connected to Google Sheets! (${rows.length} players)</span>`;
  } catch (err) {
    debugBox.innerHTML = `<span style="color:red;">❌ Error loading data:<br>${err}</span>`;
    console.error(err);
  }
}

loadLeagueData();
