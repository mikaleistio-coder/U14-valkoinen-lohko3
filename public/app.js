const $ = (s) => document.querySelector(s);

const e = (x) =>
  String(x ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));

async function load() {
  try {
    const response = await fetch("/api/data", {
      cache: "no-store"
    });

    const d = await response.json();

    $("#status").textContent = d.updatedAt
      ? "Päivitetty " + new Date(d.updatedAt).toLocaleString("fi-FI")
      : (d.error || "Ei dataa");

    $("#rows").innerHTML = (d.rows || [])
      .map((x) => `
        <tr>
          <td>${e(x.position)}</td>
          <td>${e(x.team)}</td>
          <td>${e(x.played)}</td>
          <td>${e(x.wins)}</td>
          <td>${e(x.draws)}</td>
          <td>${e(x.losses)}</td>
          <td>${e(x.goalsFor)}</td>
          <td>${e(x.goalsAgainst)}</td>
          <td>${e(x.points)}</td>
        </tr>
      `)
      .join("") ||
      `<tr><td colspan="9">${e(d.error || "Ei dataa")}</td></tr>`;

  } catch (error) {
    $("#status").textContent = "Yhteysvirhe";
  }
}

$("#refresh").onclick = async () => {
  $("#status").textContent = "Päivitetään…";

  await fetch("/api/refresh", {
    method: "GET",
    cache: "no-store"
  });

  await load();
};

load();

setInterval(load, 30000);
