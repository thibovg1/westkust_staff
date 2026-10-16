import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const STORE_FILE = path.join(DATA_DIR, 'permissions.json');

const {
  DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET,
  DISCORD_BOT_TOKEN,
  DISCORD_GUILD_ID,
  DISCORD_REDIRECT_URI,
  SESSION_SECRET,
  BOOTSTRAP_DISCORD_ID,
  PORT = 3000,
  FRONTEND_URL = 'http://localhost:3000',
  NODE_ENV = 'development',
} = process.env;

const required = [
  'DISCORD_CLIENT_ID',
  'DISCORD_CLIENT_SECRET',
  'DISCORD_BOT_TOKEN',
  'DISCORD_GUILD_ID',
  'DISCORD_REDIRECT_URI',
  'SESSION_SECRET',
];

const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error('Missing env vars in backend/.env:', missing.join(', '));
  console.error('Copy .env.example to .env and fill in your Discord values.');
  process.exit(1);
}

const RANK_LEVEL = { staff: 1, hogerop: 2, beheer: 3 };

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STORE_FILE)) {
    const initial = {
      roleMappings: [],
      manualUsers: [],
    };
    fs.writeFileSync(STORE_FILE, JSON.stringify(initial, null, 2));
  }
}

function readStore() {
  ensureStore();
  return JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
}

function writeStore(data) {
  ensureStore();
  fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2));
}

async function discordApi(pathname, { method = 'GET', token, body, bot = false } = {}) {
  const headers = {
    Authorization: bot ? `Bot ${token}` : `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  const res = await fetch(`https://discord.com/api/v10${pathname}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const err = new Error(data?.message || res.statusText || 'Discord API error');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function resolveRank(discordUserId, memberRoles) {
  // Eerste eigenaar: altijd Beheer (zodat je het panel kunt openen en rollen kunt koppelen)
  if (BOOTSTRAP_DISCORD_ID && String(discordUserId) === String(BOOTSTRAP_DISCORD_ID)) {
    return 'beheer';
  }

  const store = readStore();

  const manual = store.manualUsers.find((u) => u.discordId === discordUserId);
  if (manual) return manual.rank;

  let best = null;
  let bestLevel = 0;
  for (const mapping of store.roleMappings) {
    if (memberRoles.includes(mapping.roleId)) {
      const lvl = RANK_LEVEL[mapping.rank] || 0;
      if (lvl > bestLevel) {
        bestLevel = lvl;
        best = mapping.rank;
      }
    }
  }
  return best;
}

function requireAuth(req, res, next) {
  if (!req.session?.user) {
    return res.status(401).json({ error: 'Niet ingelogd' });
  }
  next();
}

function requireRank(minRank) {
  const min = RANK_LEVEL[minRank] || 99;
  return (req, res, next) => {
    if (!req.session?.user) return res.status(401).json({ error: 'Niet ingelogd' });
    const level = RANK_LEVEL[req.session.user.rank] || 0;
    if (level < min) return res.status(403).json({ error: 'Geen permissie' });
    next();
  };
}

const app = express();

app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());
app.use(
  session({
    name: 'admin_panel_sid',
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: NODE_ENV === 'production',
      sameSite: NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

// Serve frontend: prefer backend/public, else parent folder (local monorepo)
const publicDir = path.join(__dirname, 'public');
const parentDir = path.join(__dirname, '..');
const frontendDir = fs.existsSync(path.join(publicDir, 'index.html')) ? publicDir : parentDir;
app.use(express.static(frontendDir));

/* ---------- Auth ---------- */

app.get('/api/auth/status', (req, res) => {
  if (!req.session?.user) return res.json({ authenticated: false });
  res.json({ authenticated: true, user: req.session.user });
});

app.get('/api/auth/discord', (req, res) => {
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope: 'identify',
    prompt: 'consent',
  });
  res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
});

app.get('/api/auth/discord/callback', async (req, res) => {
  const { code, error, error_description } = req.query;
  if (error) {
    return res.redirect(`/?auth_error=${encodeURIComponent(error_description || error)}`);
  }
  if (!code) {
    return res.redirect('/?auth_error=' + encodeURIComponent('Geen autorisatiecode ontvangen'));
  }

  try {
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: String(code),
        redirect_uri: DISCORD_REDIRECT_URI,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) {
      throw new Error(tokenData.error_description || tokenData.error || 'Token exchange mislukt');
    }

    const me = await discordApi('/users/@me', { token: tokenData.access_token });

    let member;
    try {
      member = await discordApi(`/guilds/${DISCORD_GUILD_ID}/members/${me.id}`, {
        token: DISCORD_BOT_TOKEN,
        bot: true,
      });
    } catch (e) {
      if (e.status === 404) {
        return res.redirect(
          '/?auth_error=' +
            encodeURIComponent('Je zit niet in de geconfigureerde Discord-server.')
        );
      }
      throw e;
    }

    const roles = member.roles || [];
    const rank = resolveRank(me.id, roles);

    if (!rank) {
      return res.redirect(
        '/?auth_error=' +
          encodeURIComponent(
            'Geen rank toegewezen. Je hebt geen gekoppelde Discord-rol en geen handmatige override.'
          )
      );
    }

    req.session.user = {
      id: me.id,
      username: me.username,
      globalName: me.global_name || me.username,
      avatar: me.avatar,
      discriminator: me.discriminator,
      rank,
      roles,
    };

    req.session.save((err) => {
      if (err) {
        console.error(err);
        return res.redirect('/?auth_error=' + encodeURIComponent('Sessie opslaan mislukt'));
      }
      res.redirect('/');
    });
  } catch (err) {
    console.error('OAuth callback error:', err);
    res.redirect('/?auth_error=' + encodeURIComponent(err.message || 'Login mislukt'));
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('admin_panel_sid');
    res.json({ ok: true });
  });
});

/* ---------- Permissions (Beheer only) ---------- */

app.get('/api/permissions', requireAuth, requireRank('beheer'), (req, res) => {
  res.json(readStore());
});

app.post('/api/permissions/roles', requireAuth, requireRank('beheer'), (req, res) => {
  const { roleId, roleName, rank } = req.body || {};
  if (!roleId || !rank || !RANK_LEVEL[rank]) {
    return res.status(400).json({ error: 'roleId en geldige rank verplicht' });
  }
  const store = readStore();
  if (store.roleMappings.some((m) => m.roleId === String(roleId))) {
    return res.status(400).json({ error: 'Deze rol-ID is al gekoppeld' });
  }
  store.roleMappings.push({
    roleId: String(roleId),
    roleName: roleName || String(roleId),
    rank,
  });
  writeStore(store);
  res.json(store);
});

app.delete('/api/permissions/roles/:roleId', requireAuth, requireRank('beheer'), (req, res) => {
  const store = readStore();
  store.roleMappings = store.roleMappings.filter((m) => m.roleId !== req.params.roleId);
  writeStore(store);
  res.json(store);
});

app.post('/api/permissions/users', requireAuth, requireRank('beheer'), (req, res) => {
  const { discordId, displayName, rank } = req.body || {};
  if (!discordId || !rank || !RANK_LEVEL[rank]) {
    return res.status(400).json({ error: 'discordId en geldige rank verplicht' });
  }
  const store = readStore();
  const id = String(discordId);
  store.manualUsers = store.manualUsers.filter((u) => u.discordId !== id);
  store.manualUsers.push({
    discordId: id,
    displayName: displayName || id,
    rank,
  });
  writeStore(store);
  res.json(store);
});

app.delete('/api/permissions/users/:discordId', requireAuth, requireRank('beheer'), (req, res) => {
  const store = readStore();
  store.manualUsers = store.manualUsers.filter((u) => u.discordId !== req.params.discordId);
  writeStore(store);
  res.json(store);
});

/* ---------- Guild roles helper (Beheer) ---------- */

app.get('/api/discord/guild-roles', requireAuth, requireRank('beheer'), async (req, res) => {
  try {
    const roles = await discordApi(`/guilds/${DISCORD_GUILD_ID}/roles`, {
      token: DISCORD_BOT_TOKEN,
      bot: true,
    });
    const cleaned = (roles || [])
      .filter((r) => r.id !== DISCORD_GUILD_ID)
      .map((r) => ({ id: r.id, name: r.name, color: r.color, position: r.position }))
      .sort((a, b) => b.position - a.position);
    res.json(cleaned);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Rollen ophalen mislukt' });
  }
});

/* ---------- Health ---------- */

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    guildConfigured: Boolean(DISCORD_GUILD_ID),
    oauthConfigured: Boolean(DISCORD_CLIENT_ID && DISCORD_CLIENT_SECRET),
  });
});

// SPA fallback
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(frontendDir, 'index.html'));
});

ensureStore();

app.listen(Number(PORT), () => {
  console.log(`Admin panel listening on http://localhost:${PORT}`);
  console.log(`OAuth redirect URI must be exactly: ${DISCORD_REDIRECT_URI}`);
});
