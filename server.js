import express from "express";
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;

const SOURCE =
  "https://tulospalvelu.leijonat.fi/serie?lang=fi&season=2027&lid=98&ssid=3045";

let data = {
  updatedAt: null,
  standings: [],
  error: null
};

const clean = (x) =>
  String(x ?? "")
    .replace(/\s+/g, " ")
    .trim();

async function scrape() {
  const browser = await chromium.launch({
    headless: true
  });

  try {
    const page = await browser.newPage({
      locale: "fi-FI"
    });

    await page.goto(SOURCE, {
      waitUntil: "networkidle",
      timeout: 60000
    });

    await page.waitForTimeout(3000);

    // Etsi Sarjataulukko-linkki ja avaa se, jos sellainen löytyy.
    const standingsLink = page
      .getByRole("link", { name: /^Sarjataulukko$/i })
      .first();

    if (await standingsLink.count()) {
      try {
        await standingsLink.click();
        await page.waitForTimeout(2000);
      } catch {
        // Jos klikkaus ei onnistu, jatketaan nykyiseltä sivulta.
      }
    }

    const tables = await page.locator("table").evaluateAll((tableEls) => {
      return tableEls.map((table) => {
        const rows = Array.from(table.querySelectorAll("tr"));

        return rows.map((row) =>
          Array.from(row.querySelectorAll("th, td")).map((cell) =>
            (cell.textContent || "")
              .replace(/\s+/g, " ")
              .trim()
          )
        );
      });
    });

    // Etsi taulukko, jossa on oikean sarjataulukon kaltainen rakenne.
    let bestTable = null;
    let bestScore = -1;

    for (const table of tables) {
      if (!table || table.length < 2) continue;

      const text = table
        .flat()
        .join(" ")
        .toLowerCase();

      let score = 0;

      if (text.includes("joukkue")) score += 5;
      if (text.includes("piste")) score += 5;
      if (text.includes("ott")) score += 3;
      if (text.includes("voit")) score += 2;
      if (text.includes("tapp")) score += 2;

      // Oikeassa sarjataulukossa pitäisi olla useita rivejä,
      // joissa ensimmäinen solu on järjestysnumero.
      const numberedRows = table.filter((row) => {
        return (
          row.length >= 3 &&
          /^\d+$/.test(clean(row[0]))
        );
      });

      score += Math.min(numberedRows.length, 10);

      if (numberedRows.length >= 3) {
        score += 10;
      }

      if (score > bestScore) {
        bestScore = score;
        bestTable = table;
      }
    }

    if (!bestTable) {
      throw new Error("Sarjataulukkoa ei löytynyt.");
    }

    const standings = [];

    for (const row of bestTable) {
      if (row.length < 3) continue;

      const cells = row.map(clean);

      // Sarjataulukon ensimmäinen solu on yleensä sijoitusnumero.
      if (!/^\d+$/.test(cells[0])) continue;

      const position = Number(cells[0]);
      const team = cells[1];

      if (!team || team.length > 100) continue;

      // Poimitaan riviltä numerot.
      const numbers = cells
        .slice(2)
        .map((x) => {
          const match = x.match(/-?\d+/);
          return match ? Number(match[0]) : null;
        })
        .filter((x) => x !== null);

      standings.push({
        position,
        team,
        played: numbers[0] ?? 0,
        wins: numbers[1] ?? 0,
        draws: numbers[2] ?? 0,
        losses: numbers[3] ?? 0,
        goalsFor: numbers[4] ?? 0,
        goalsAgainst: numbers[5] ?? 0,
        points: numbers[6] ?? 0
      });
    }

    if (standings.length === 0) {
      throw new Error("Sarjataulukon rivejä ei löytynyt.");
    }

    data = {
      updatedAt: new Date().toISOString(),
      standings,
      error: null
    };

    console.log(
      `Sarjataulukko haettu: ${standings.length} joukkuetta`
    );
  } catch (error) {
    console.error("Scrape error:", error);

    data.error = error?.message || String(error);
  } finally {
    await browser.close();
  }
}

// Etusivu ja muut staattiset tiedostot
app.use(express.static(__dirname));

// Terveystarkistus
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    updatedAt: data.updatedAt,
    error: data.error
  });
});

// Data käyttöliittymälle
app.get("/api/data", (req, res) => {
  res.json(data);
});

// Manuaalinen päivitys
app.post("/api/refresh", async (req, res) => {
  try {
    await scrape();
    res.json(data);
  } catch (error) {
    res.status(500).json({
      updatedAt: data.updatedAt,
      standings: data.standings,
      error: error?.message || String(error)
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
