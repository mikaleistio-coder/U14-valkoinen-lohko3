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
const standingsLink = page
  .getByRole("link", { name: "Sarjataulukko", exact: true })
  .first();

if (await standingsLink.count()) {
  const href = await standingsLink.getAttribute("href");

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

        let score = 0;

        if (headers.includes("joukkue")) score += 50;
        if (headers.includes("o")) score += 20;
        if (headers.includes("v")) score += 20;
        if (headers.includes("ta")) score += 10;

        if (score > bestScore) {
          bestScore = score;
          bestTable = table;
          bestHeaderIndex = i;
        }
      }
    }

    if (!bestTable || bestScore < 40) {
  throw new Error(
    "Oikeaa sarjataulukkoa ei löytynyt. Sivun rakenne poikkeaa odotetusta."
  );
}
    

    
    
    );

    const teamIndex = headers.findIndex((x) => x === "joukkue");
    const playedIndex = headers.findIndex((x) => x === "o");
    const winsIndex = headers.findIndex((x) => x === "v");
    const drawsIndex = headers.findIndex((x) => x === "ta");

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
        team.toLowerCase().includes("joukkue")
      ) {
        continue;
      }

      const position =
        Number(clean(row[0]).replace(",", ".")) || rows.length + 1;

      const played =
        playedIndex >= 0
          ? Number(clean(row[playedIndex]).replace(",", ".")) || 0
          : 0;

      const wins =
        winsIndex >= 0
          ? Number(clean(row[winsIndex]).replace(",", ".")) || 0
          : 0;

      const draws =
        drawsIndex >= 0
          ? Number(clean(row[drawsIndex]).replace(",", ".")) || 0
          : 0;

      rows.push({
        position,
        team,
        played,
        wins,
        draws,
      });
    }

    if (rows.length === 0) {
      throw new Error("Sarjataulukosta ei löytynyt joukkueita.");
    }

    return {
      updatedAt: new Date().toISOString(),
      source: SOURCE,
      rows,
    };
  } finally {
    await browser.close();
  }
}

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/api/data", async (req, res) => {
  try {
    const data = await scrape();
    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: error.message,
    });
  }
});

app.get("/api/refresh", async (req, res) => {
  try {
    const data = await scrape();
    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: error.message,
    });
  }
});

app.use(express.static(__dirname));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});  
