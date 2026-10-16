# Deploy op Render (gratis) — Westkust Staff Panel

Jouw ct.ws-host kan Discord niet bereiken. Op **Render** wél.

## Voorbereiding

1. Account: https://render.com (gratis, GitHub login mag)
2. Code moet in een **GitHub repository** (gratis):
   - Maak repo op GitHub
   - Upload/push deze bestanden:
     - map `backend/`
     - `index.html`, `styles.css`, `script.js` (één map hoger dan backend, zoals in de zip)
     - `render.yaml` (optioneel)

Structuur in de repo:

```
/
  index.html
  styles.css
  script.js
  render.yaml
  backend/
    package.json
    server.js
    data/
```

Belangrijk: `server.js` serveert de frontend uit de **parent** map van `backend/`.  
Op Render met `rootDir: backend` staat de parent mogelijk niet goed.

### Aanbevolen structuur voor Render

Zet frontend-bestanden **in** `backend/public/`:

```
backend/
  package.json
  server.js
  public/
    index.html
    styles.css
    script.js
  data/
```

Dan past `server.js` public map aan (zie hieronder in de zip-versie).

## Stappen in Render Dashboard

1. **New +** → **Web Service**
2. Koppel je GitHub-repo
3. Instellingen:
   - **Name:** `westkust-staff` (of zelf kiezen)
   - **Root Directory:** `backend`
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance type:** Free
4. **Environment** → Add Environment Variable:

| Key | Value |
|-----|--------|
| `NODE_ENV` | `production` |
| `DISCORD_CLIENT_ID` | jouw client id |
| `DISCORD_CLIENT_SECRET` | jouw secret |
| `DISCORD_BOT_TOKEN` | jouw bot token |
| `DISCORD_GUILD_ID` | jouw server id |
| `BOOTSTRAP_DISCORD_ID` | jouw Discord user id |
| `SESSION_SECRET` | lange willekeurige tekst |
| `FRONTEND_URL` | `https://JOUW-NAAM.onrender.com` |
| `DISCORD_REDIRECT_URI` | `https://JOUW-NAAM.onrender.com/api/auth/discord/callback` |

Vervang `JOUW-NAAM` door de service-naam die Render geeft (zie na eerste deploy de URL).

5. **Create Web Service** → wacht tot Live (eerste keer 2–5 min)

## Discord Portal

1. OAuth2 → Redirects → voeg toe:
   `https://JOUW-NAAM.onrender.com/api/auth/discord/callback`
2. Save
3. Bot: **Server Members Intent** aan
4. Bot in je Discord-server

## Testen

1. Open `https://JOUW-NAAM.onrender.com`
2. Inloggen met Discord
3. Jij (BOOTSTRAP) = Beheer

**Let op:** Free tier valt in slaap na ~15 min inactiviteit. Eerste request daarna kan 30–60 sec duren.

## Problemen

| Probleem | Oplossing |
|----------|-----------|
| Build failed | Root Directory = `backend`, package.json aanwezig |
| Token / redirect error | REDIRECT_URI in env **exact** gelijk aan Discord Portal |
| Site sleept | Normaal op free; even wachten |
| 502 | Logs in Render bekijken; env vars compleet? |

## Secrets

Zet secrets **alleen** in Render Environment Variables, niet in GitHub.
