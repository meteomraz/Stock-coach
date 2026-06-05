# Stock Coach Pro v4

## Co je nové
- Roční denní historie se bere ze Stooq, bez API klíče.
- Aktuální ceny se berou z Finnhub Quote API.
- API key lze dát do `config.json`, takže jej po každé nové verzi nemusíš znovu zadávat.
- Historie se ukládá do `data/history.json`.
- Přidán GitHub Action, který může historii aktualizovat automaticky.

## Nasazení na GitHub Pages
1. Nahraj všechny soubory do rootu repozitáře.
2. V `config.json` vlož svůj Finnhub API key:
   ```json
   {
     "finnhubApiKey": "tvuj_klic",
     "refreshSeconds": 60,
     "historySource": "stooq",
     "historyDays": 365
   }
   ```
3. GitHub → Settings → Pages → Deploy from branch → main / root.

## Důležité upozornění k API key
Statická aplikace na GitHub Pages nedokáže API key bezpečně skrýt. Pokud je repozitář/public Pages veřejný, klíč může být viditelný. Bezpečnější varianta je Cloudflare Worker / Vercel proxy.

## Jak aktualizovat historii do souboru
### Ručně v aplikaci
Klikni na „Načíst/obnovit historii“, potom „Export historie JSON“ a stažený soubor nahraj jako `data/history.json`.

### Automaticky přes GitHub Actions
Soubor `.github/workflows/update-history.yml` spouští `scripts/update-history.mjs` každý pracovní den večer a zapisuje nové `data/history.json`.

Pro spuštění ručně: GitHub → Actions → Update stock history → Run workflow.

## Přidání akcie
V aplikaci zadej symbol bez `.US`, např. `AAPL`, `MSFT`, `GOOGL`. Pro historii se automaticky použije Stooq tvar `aapl.us`.
