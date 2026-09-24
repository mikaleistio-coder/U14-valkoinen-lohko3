import express from "express";
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const SOURCE =
  "https://tulospalvelu.leijonat.fi/serie?lang=fi&season=2027&lid=98&ssid=3045";

let data = {
  updatedAt: null,
  standings: [],
  error: null
};

const clean = (x) => String(x ?? "").replace(/\s+/g, " ").trim();

async function scrape() {
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage({ locale: "fi-FI" });

    await page.goto(SOURCE, {
      waitUntil: "networkidle",
      timeout: 60000
    });

    await page.waitForTimeout(2500);

    const tables = await page.locator("table").evaluateAll((elements) =>
      elements.map((table) => {
        const rows = [...table.querySelectorAll("tr")].map((row) =>
          [...row.querySelectorAll("th,td")].map(
            (cell) => cell.textContent || ""
          )
        );

        return {
          h: rows[0] || [],
          r: rows.slice(1)
        };
      })
    );

    let standings = [];

    for (const table of tables) {
      const headers = table.h.map(clean);
      const lower = headers.map((x) => x.toLowerCase());

      if (
        !lower.some(
          (x) => x.includes("joukkue") || x.includes("piste")
        )
      ) {
        continue;
      }

      const index = (...keys) =>
        lower.findIndex((x) => keys.some((key) => x.includes(key)));

      const teamIndex = index("joukkue");
      const gamesIndex = index("ott", "pel");
      const winsIndex = index("voitto");
      const drawsIndex = index("tasap");
      const lossesIndex = index("hävi");
      const gfIndex = index("tehd", "tm");
      const gaIndex = index("pääst", "pm");
      const pointsIndex = index("piste");

      for (let i = 0; i < table.r.length; i++) {
        const cells = table.r[i].map(clean);

        const get = (n) =>
          n >= 0 && n < cells.length ? cells[n] : "";

        const team = get(teamIndex) || get(0);

        if (team) {
          standings.push({
            rank: i + 1,
            team,
            games: get(gamesIndex),
            wins: get(winsIndex),
            draws: get(drawsIndex),
            losses: get(lossesIndex),
            gf: get(gfIndex),
            ga: get(gaIndex),
            points: get(pointsIndex)
          });
        }
      }

      if (standings.length) break;
    }

    return {
      updatedAt: new Date().toISOString(),
      standings,
      error: standings.length
        ? null
        : "Sarjataulukkoa ei löytynyt."
    };
  } finally {
    await browser.close();
  }
}

/* Sivuston tiedostot ovat projektin juuressa */
app.use(express.static(__dirname));

/* Railwayn terveystarkistus */
app.get("/health", (_, res) => {
  res.status(200).send("OK");
});

/* Sarjataulukon data */
app.get("/api/data", (_, res) => {
  res.json(data);
});

/* Päivitä sarjataulukko */
app.post("/api/refresh", async (_, res) => {
  try {
    data = await scrape();
  } catch (error) {
    data = {
      ...data,
      error: error.message
    };
  }

  res.json(data);
});

/* Käynnistä palvelin */
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
