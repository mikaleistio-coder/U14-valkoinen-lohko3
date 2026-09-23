# U14 Valkoinen – Lohko 3 — verkkoversio

Valmis julkaistavaksi Railway-palveluna. Sovellus hakee sarjataulukon
Leijonien virallisesta Tulospalvelusta Playwrightilla ja päivittää palvelimen
välimuistin automaattisesti 5 minuutin välein.

## Julkaisu Railwayhin

1. Pura ZIP.
2. Lataa kansion sisältö GitHubin uuteen repositoryyn.
3. Avaa Railway → New Project → Deploy from GitHub repo.
4. Valitse repository.
5. Odota deploymentin valmistumista.
6. Avaa Settings → Networking → Generate Domain.
7. Saat julkisen verkkosoitteen, jota voi käyttää puhelimella ja tietokoneella.

## Paikallinen käyttö

```bash
npm install
npx playwright install chromium
npm start
```

Avaa http://localhost:3000

## Virallinen lähde

https://tulospalvelu.leijonat.fi/serie?lang=fi&season=2027&lid=98&ssid=3045
