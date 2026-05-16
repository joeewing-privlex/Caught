# Deploying Caught to Render (free tier)

Step-by-step. Should take under 15 minutes the first time.

---

## 0 · Pre-flight checklist

Run these from the `caught/` directory (the repo root) before pushing.

```bash
# Confirm Node 18+ is installed locally
node --version    # expect v18 or newer

# Install deps and verify the server boots
npm install
node server/index.js
# In another terminal, hit /health:
curl http://localhost:3000/health
# Expected: {"ok":true,"rooms":0,"activeGames":0,"uptime":...}
# Stop the server (Ctrl+C).
```

Confirm these files exist:

```
caught/
├── render.yaml                       ← Render uses this
├── package.json                      ← has "engines": { "node": ">=18.0.0" }
├── server/index.js
├── client/index.html
└── client/assets/kenney/             ← Kenney sprites + tilemap, committed
    ├── tilemap/tilemap_packed.png
    ├── characters/                   ← 30 PNGs (10 colors × 3 orientations)
    └── README.txt
```

If any of those are missing, stop and ask — something didn't get committed.

---

## 1 · Commit and push

```bash
git add -A
git status              # sanity-check the diff
git commit -m "v2: 10-player procgen + Kenney sprites + reconnect + series"
git push origin main
```

If `git push` complains about `main` vs `master`, swap the name accordingly — Render is happy with either as the deploy branch.

---

## 2 · Create the Render service

1. Open <https://dashboard.render.com> and sign in (GitHub login is fine).
2. Top right: **New +** → **Web Service**.
3. **Connect a repository** → authorize Render to read your GitHub account if you haven't already → pick `joeewing-privlex/Caught` (or whichever repo holds this code).
4. Render reads `render.yaml` automatically and pre-fills the form. Verify these fields:

   | Field | Value |
   |---|---|
   | Name | `caught` (or anything; this becomes your subdomain) |
   | Region | `Oregon` (change if your players are mostly elsewhere — see §6 below) |
   | Branch | `main` |
   | Runtime | `Node` |
   | Build Command | `npm install` |
   | Start Command | `node server/index.js` |
   | Plan | **Free** |

5. Scroll down. Confirm **Environment Variables** has `NODE_ENV=production` (also from `render.yaml`).
6. Click **Create Web Service**.

Render starts a build. You'll see live logs. First build takes about 60–90 seconds:
- `==> Cloning from ...`
- `==> Running build command 'npm install'`
- `==> Build successful`
- `==> Deploying...`
- `==> Your service is live 🎉`

---

## 3 · Verify the deployment

Once you see "Your service is live," your URL is shown at the top of the page — something like `https://caught.onrender.com` (or `https://caught-xxxx.onrender.com` if `caught` was taken).

**Test 1 — health endpoint.**
```bash
curl https://YOUR-SERVICE.onrender.com/health
# Expected: {"ok":true,"rooms":0,"activeGames":0,"uptime":N}
```

**Test 2 — load the page.**
Open the URL in a browser. You should see the green "🦋 Caught" main menu within a few seconds.

**Test 3 — full round in two browser windows.**
1. Open the URL in one tab → enter name → **Create Private Room** → note the 6-character code.
2. Open the URL in a second tab (incognito works) → enter a different name → **Join with Room Code** → enter the code.
3. In tab 1 (host), click **Start Series**.
4. Both should show a 3-second countdown, then drop into the game with Kenney-character sprites on a tiled map. Move with WASD or arrow keys.

If all three pass, the deploy is good. Share the URL.

---

## 4 · Sharing with your group

- **The URL is permanent for this service.** Bookmark it.
- **First connect after a quiet hour is slow.** Render free spins the service down after 15 minutes of no HTTP traffic. The next visitor triggers a cold start — typically 30–60 seconds. The lobby screen shows "Waking up the server…" during this. Once one person is in, WebSocket traffic keeps it warm for the rest of the session.
- **Tell your friends** before a planned game night: "I'll be the first person to open the link, give it a minute, then drop the room code in the chat."

---

## 5 · Operational gotchas

**Auto-deploy is on by default.** Every `git push origin main` will trigger a redeploy, which kills the running process. If a game is in progress, that ends the session abruptly.

Two ways to handle:

- **Easy:** Render dashboard → your service → **Settings** → scroll to **Build & Deploy** → set **Auto-Deploy** to `No`. Then deploy manually via the **Manual Deploy** button.
- **Discipline-based:** leave auto-deploy on but never `git push` to `main` during a session.

I'd flip auto-deploy off until the codebase settles.

**Logs.** Render dashboard → your service → **Logs** tab. Live tail. Useful for debugging — server logs `connect/disconnect`, room codes, errors.

**Restarting manually.** Dashboard → your service → **Manual Deploy** dropdown → **Clear build cache & deploy** (full rebuild) or **Deploy latest commit** (faster). Either works for forcing a restart.

**No persistent state.** A redeploy or host-initiated restart wipes all rooms and lobbies. Everyone's browser keeps their `clientId` in localStorage, so they can rejoin a new room afterwards, but the in-progress match is lost. Plan deploys around sessions.

---

## 6 · Changing region

`render.yaml` has `region: oregon`. To change, edit it in the repo and push, OR change in dashboard → Settings → Region.

Picks (as of 2025):
- `oregon` — US west coast
- `ohio` — US central
- `virginia` — US east coast
- `frankfurt` — Europe
- `singapore` — Asia-Pacific

For mixed geography, pick the central-most option. Socket.io's 60fps interpolation hides 100ms of latency variance comfortably; players in another continent will feel a bit floaty but it's playable.

---

## 7 · Free tier limits (your headroom)

| Limit | Free tier value | What we use | Headroom |
|---|---|---|---|
| Service hours | 750/month | One service, runs only when warm | Plenty |
| RAM | 512 MB | ~30 MB at idle, ~50 MB with one game | 10× |
| CPU | 0.1 shared | <1ms per tick at 10 players | Plenty |
| Outbound bandwidth | 100 GB/month | ~250 MB/hour | 400 hours of play |
| Build minutes | 500/month | ~1 minute per build | 500 deploys |

You will not hit any of these.

---

## 8 · Updating after the first deploy

```bash
# make code changes
git add -A
git commit -m "tweak X"
git push origin main
# if auto-deploy on: Render rebuilds automatically (~60s)
# if auto-deploy off: dashboard → Manual Deploy → Deploy latest commit
```

---

## 9 · If something goes wrong

| Symptom | Most likely cause | Fix |
|---|---|---|
| Build fails on `npm install` | Node version mismatch | Confirm `package.json` has `"engines": { "node": ">=18.0.0" }`; in Render dashboard check the Node version in build logs |
| Page loads but assets 404 | `client/assets/kenney/` not committed | `git status` to see; `git add client/assets/` and push |
| Page loads but Socket.io won't connect | Mixed content (HTTP/HTTPS) or wrong URL | Always use the `https://` URL Render gives you |
| Players see different maps | One of them is on a stale tab from before redeploy | Refresh the page |
| Spinning "Waking up the server…" never stops | Either a cold start in progress (wait 60s) or service is failing health checks | Check Render logs |
| `clientId` lost | User cleared `localStorage` | They'll get a new identity; they need to re-enter their name |
| Hot reload during a session | Auto-deploy triggered | See §5 — turn auto-deploy off |

---

## 10 · Tearing it down

Dashboard → your service → **Settings** → scroll to the bottom → **Delete Web Service**. Free tier has no cancellation cost.
