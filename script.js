async function loadLeagueData() {
  const sheetURL = "https://docs.google.com/spreadsheets/d/1--or-XBf1Ys71it7cRCSnZOodHIP8wr9bW_HUoTJtCs/gviz/tq?tqx=out:json&sheet=LeagueTable";

  try {
    const res = await fetch(sheetURL);
    const text = await res.text();
    const json = JSON.parse(text.substr(47).slice(0, -2));
    const rows = json.table.rows;

    const tbody = document.getElementById("tableBody");
    const scorersBody = document.getElementById("scorersBody");
    tbody.innerHTML = "";
    scorersBody.innerHTML = "";

    let totalGoals = 0;

    rows.forEach((r, i) => {
      const player = r.c[0]?.v || "";
      const w = r.c[1]?.v || 0;
      const d = r.c[2]?.v || 0;
      const l = r.c[3]?.v || 0;
      const gf = r.c[4]?.v || 0;
      const ga = r.c[5]?.v || 0;
      const pts = r.c[6]?.v || 0;

      totalGoals += gf;

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
      tbody.appendChild(tr);
    });

    document.getElementById("totalGoals").textContent = `Total Goals: ${totalGoals} ⚽`;

    rows
      .filter(r => r.c[4]?.v > 0)
      .sort((a, b) => b.c[4].v - a.c[4].v)
      .slice(0, 5)
      .forEach((r, i) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${i + 1}</td>
          <td>${r.c[0].v}</td>
          <td>${r.c[4].v}</td>
        `;
        scorersBody.appendChild(tr);
      });

    document.getElementById("debug").textContent = "✅ Connected to Google Sheets!";
  } catch (err) {
    document.getElementById("debug").innerHTML = `❌ Error loading data:<br>${err}`;
  }
}

loadLeagueData();
