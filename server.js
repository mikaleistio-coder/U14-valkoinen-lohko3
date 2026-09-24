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

    // Yritetään avata oikea Sarjataulukko-näkymä.
    const links = page.locator("a");

    const linkCount = await links.count();

    for (let i = 0; i < linkCount; i++) {
      const text = clean(await links.nth(i).innerText().catch(() => ""));

      if (text.toLowerCase() === "sarjataulukko") {
        try {
          await links.nth(i).click();
          await page.waitForTimeout(3000);
          break;
        } catch {
          // Jatketaan, jos linkin klikkaus ei onnistu.
        }
      }
    }

    const tables = await page.locator("table").evaluateAll((tableEls) => {
      return tableEls.map((table) => {
        return Array.from(table.querySelectorAll("tr")).map((row) =>
          Array.from(row.querySelectorAll("th, td")).map((cell) =>
            (cell.textContent || "")
              .replace(/\s+/g, " ")
              .trim()
          )
        );
      });
    });

    let standings = [];

    // Etsitään vain rivejä, joissa on oikeasti tekstimuotoinen joukkueen nimi.
    for (const table of tables) {
      for (const row of table) {
        const cells = row.map(clean);

        if (cells.length < 3) continue;

        // Etsi riviltä ensimmäinen solu, joka näyttää sijoitusnumerolta.
        const positionIndex = cells.findIndex((cell) =>
          /^\d+$/.test(cell)
        );

        if (positionIndex === -1) continue;

        // Joukkueen nimi pitää sisältää kirjaimia.
        let teamIndex = -1;

        for (
          let i = positionIndex + 1;
          i < cells.length;
          i++
        ) {
          if (/[A-Za-zÅÄÖåäö]/.test(cells[i])) {
            teamIndex = i;
            break;
          }
        }

        if (teamIndex === -1) continue;

        const team = cells[teamIndex];

        // Hylätään liian lyhyet tai epäilyttävät tekstit.
        if (team.length < 2) continue;
        if (team.length > 100) continue;

        // Joukkueen nimen jälkeen olevat numerot.
        const numbers = cells
          .slice(teamIndex + 1)
          .map((value) => {
            const match = value.match(/-?\d+/);
            return match ? Number(match[0]) : null;
          })
          .filter((value) => value !== null);

        // Sarjataulukon rivillä pitää olla useita tilastonumeroita.
        if (numbers.length < 2) continue;

        standings.push({
          position: Number(cells[positionIndex]),
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
    }

    // Poista mahdolliset duplikaatit.
    const unique = [];
    const seen = new Set();

    for (const team of standings) {
      const key = `${team.position}-${team.team}`;

      if (!seen.has(key)) {
        seen.add(key);
        unique.push(team);
      }
    }

    standings = unique;

    if (standings.length === 0) {
      throw new Error(
        "Oikeaa sarjataulukkoa ei löytynyt. Sivun rakenne poikkeaa odotetusta."
      );
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

app.use(express.static(__dirname));

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    updatedAt: data.updatedAt,
    error: data.error
  });
});

app.get("/api/data", (req, res) => {
  res.json(data);
});

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
