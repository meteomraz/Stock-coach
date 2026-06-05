# Stock Coach Pro v5

## Oprava oproti v4
`data/history.json` byl záměrně prázdný startovací soubor. Ve v5 aplikace umí:

- načíst historii přes Stooq,
- pokud Stooq selže, zkusí Yahoo Chart API,
- uložit historii do `localStorage`, takže po refreshi stránky nezmizí,
- exportovat `history.json`, který nahraješ do `data/history.json`,
- aktualizovat `data/history.json` přes GitHub Action.

## API key
Do `config.json` můžeš vložit Finnhub klíč:

```json
{
  "finnhubApiKey": "tvuj_klic",
  "refreshSeconds": 60,
  "historySource": "stooq-yahoo",
  "historyDays": 365
}
```

Pozor: pokud je repozitář veřejný, klíč v `config.json` je viditelný. Bezpečnější řešení je Cloudflare Worker / Vercel proxy.

## Jak naplnit historii

### Varianta A: z aplikace
1. Otevři aplikaci.
2. Klikni **Načíst/obnovit historii**.
3. Klikni **Export historie JSON**.
4. Stažený soubor nahraj do repozitáře jako `data/history.json`.

### Varianta B: GitHub Actions
1. Nahraj celý projekt na GitHub.
2. Jdi na **Actions → Update stock history → Run workflow**.
3. Action stáhne historii a commitne nový `data/history.json`.

## Tickery
Používej tickery bez `.US`, například:

- NVDA
- AMD
- AVGO
- TSM
- ASML
