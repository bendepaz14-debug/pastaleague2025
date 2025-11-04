// === Pasta League Debug Version ===
// by Ben De-Paz

async function fetchLeagueData() {
  const sheetId = "1--or-XBf1Ys71it7cRCSnZOodHIP8wr9bW_HUoTJtCs";
  const sheetName = "LeagueTable";
  const url = `https://opensheet.elk.sh/${sheetId}/${sheetName}`;

  const debugBox = document.getElementById("debug-box");
  debugBox.innerText = "Fetching data...";

  try {
    const response = await fetch(url);
    const data = await response.json();
    console.log("✅ Data fetched from Google Sheets:", data);
    debugBox.innerText = "✅ Connected to Google Sheets!\nRows fetched: " + data.length;

    const tableBody = document.querySelector("#league-table-body");
    tableBody.innerHTML = "";

    data.forEach((row, index) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${index + 1}</td>
        <td>${row.Player || "?"}</td>
        <td>${row.W || 0}</td>
        <td>${row.D || 0}</td>
        <td>${row.L || 0}</td>
        <td>${row.GF || 0}</td>
        <td>${row.GA || 0}</td>
        <td>${row.Pts || 0}</td>
      `;
      tableBody.appendChild(tr);
    });

  } catch (error) {
    console.error("❌ Error fetching data:", error);
    debugBox.innerText = "❌ Error: " + error;
  }
}

document.addEventListener("DOMContentLoaded", fetchLeagueData);
