import express from "express";
import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

const SOURCE =
  "https://tulospalvelu.leijonat.fi/serie?lang=fi&season=2027&lid=98&ssid=3045";

const clean = (x) =>
  String(x ?? "")
    .replace(/\s+/g, " ")
    .trim();

async function scrape() {
  const browser = await chromium.launch({
    headless: true,
  });

  try {
    const page = await browser.newPage();

    await page.goto(SOURCE, {
      waitUntil: "networkidle",
      timeout: 60000,
    });

    await page.waitForTimeout(3000);

    const standingsLink = page.getByRole("link", {
      name: "Sarjataulukko",
      exact: true,
    });

    if (await standingsLink.count()) {
      const href = await standingsLink.first().getAttribute("href");

      if (href) {
        await page.goto(new URL(href, SOURCE).href, {
          waitUntil: "networkidle",
          timeout: 60000,
        });

        await page.waitForTimeout(3000);
      }
    }

    const tables = await page.locator("table").evaluateAll((tableEls) =>
      tableEls.map((table) =>
        Array.from(table.querySelectorAll("tr")).map((tr) =>
          Array.from(tr.querySelectorAll("th, td")).map((cell) =>
            (cell.innerText || "").replace(/\s+/g, " ").trim()
          )
        )
      )
    );

    let bestTable = null;
    let bestHeaderIndex = -1;
    let bestScore = -1;

    for (const table of tables) {
      for (let i = 0; i < table.length; i++) {
        const headers = table[i].map((x) => clean(x).toLowerCase());

        const hasTeam = headers.some((x) => x === "joukkue");
        const hasO = headers.some((x) => x === "o");
        const hasV = headers.some((x) => x === "v");

        if (!hasTeam || !hasO || !hasV) {
          continue;
        }

        let score = 100;

        if (headers.includes("ta")) score += 10;
        if (headers.includes("h")) score += 10;
        if (headers.includes("tm")) score += 10;
        if (headers.includes("pm")) score += 10;
        if (headers.includes("p")) score += 10;

        if (score > bestScore) {
          bestScore = score;
          bestTable = table;
          bestHeaderIndex = i;
        }
      }
    }

    if (!bestTable) {
      throw new Error(
        "Oikeaa sarjataulukkoa ei löytynyt. Sivun rakenne poikkeaa odotetusta."
      );
    }

    const headers = bestTable[bestHeaderIndex].map((x) =>
      clean(x).toLowerCase()
    );

    const teamIndex = headers.findIndex((x) => x === "joukkue");
    const playedIndex = headers.findIndex((x) => x === "o");
    const winsIndex = headers.findIndex((x) => x === "v");
    const drawsIndex = headers.findIndex((x) => x === "ta");
    const lossesIndex = headers.findIndex((x) => x === "h");
    const goalsForIndex = headers.findIndex((x) => x === "tm");
    const goalsAgainstIndex = headers.findIndex((x) => x === "pm");
    const pointsIndex = headers.findIndex((x) => x === "p");

    const rows = [];

    for (
      let i = bestHeaderIndex + 1;
      i < bestTable.length;
      i++
    ) {
      const row = bestTable[i];

      if (!row || row.length === 0) continue;

      const team = clean(row[teamIndex]);

      if (!team) continue;

      if (
        team.toLowerCase() === "joukkue" ||
        team.toLowerCase() === "yhteensä"
      ) {
        continue;
      }

      const position =
        /^\d+$/.test(clean(row[0])) ? Number(clean(row[0])) : rows.length + 1;

      const number = (index) => {
        if (index < 0) return null;

        const value = clean(row[index]).replace(",", ".");

        if (!value) return null;

        const parsed = Number(value);

        return Number.isFinite(parsed) ? parsed : null;
      };

      rows.push({
        position,
        team,
        played: number(playedIndex),
        wins: number(winsIndex),
        draws: number(drawsIndex),
        losses: number(lossesIndex),
        goalsFor: number(goalsForIndex),
        goalsAgainst: number(goalsAgainstIndex),
        points: number(pointsIndex),
      });
    }

    if (rows.length === 0) {
      throw new Error("Sarjataulukosta ei löytynyt yhtään joukkuetta.");
    }

    return {
      updatedAt: new Date().toISOString(),
      rows,
    };
  } finally {
    await browser.close();
  }
}

let cache = {
  updatedAt: null,
  rows: [],
  error: null,
};

async function refreshData() {
  try {
    const data = await scrape();

    cache = {
      ...data,
      error: null,
    };

    console.log(
      `Scrape OK: ${data.rows.length} joukkuetta`
    );
  } catch (error) {
    console.error("Scrape error:", error);

    cache.error = error.message;
  }
}

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    updatedAt: cache.updatedAt,
    rows: cache.rows.length,
    error: cache.error,
  });
});

app.get("/api/data", (req, res) => {
  res.json(cache);
});

app.get("/api/refresh", async (req, res) => {
  await refreshData();
  res.json(cache);
});

app.use(express.static(__dirname));

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);

  refreshData();
});
