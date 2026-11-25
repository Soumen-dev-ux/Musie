# Musie — Personal Spotify-Like Music Streaming App

A full-stack personal music streaming mobile app built with **Expo SDK 58 (React Native 0.88 + React 19.3 + Expo Router + `expo-audio`)** and a **Node.js + Express + TypeScript** backend.

Stream music sourced from **YouTube**, browse/import playlists from **Spotify** (with your own API keys), enjoy **background playback & lock-screen controls**, and block third-party ads, trackers, and in-track sponsor segments using the built-in **Musie AdGuard Shield**.

---

## Project Structure

```text
Musie/
├── backend/                          # Node.js + Express + TypeScript API
│   ├── .env.example
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts                  # Express entrypoint & health endpoint
│       ├── config/env.ts             # Environment configuration
│       ├── types/index.ts            # Shared backend types
│       ├── data/defaultBlocklist.ts  # Built-in AdGuard ad & tracker rules
│       ├── middleware/
│       │   └── adguardMiddleware.ts  # Request URL inspection middleware
│       ├── services/
│       │   ├── adguardService.ts     # AdGuard rule engine + SponsorBlock + stats
│       │   ├── spotifyService.ts     # Spotify Client Credentials & playlist import
│       │   ├── storageService.ts     # JSON persistence (data/db.json)
│       │   └── youtubeService.ts     # YouTube Data API v3 + yt-search + stream resolver
│       └── routes/
│           ├── adguard.ts            # Shield config, custom rules & stats API
│           ├── library.ts            # Liked songs, playlists, recently played
│           ├── spotify.ts            # Spotify search, track match & playlist import
│           ├── stream.ts             # Range-supporting audio stream proxy & SponsorBlock
│           └── youtube.ts            # Home feed, search, related tracks, key test
│
└── mobile/                           # Expo SDK 58 React Native App
    ├── app.json                      # expo-audio background playback + permissions
    ├── babel.config.js
    ├── eas.json
    ├── package.json
    ├── tsconfig.json
    ├── app/                          # Expo Router v6 file-based navigation
    │   ├── _layout.tsx               # Root stack & store/audio bootstrap
    │   ├── player.tsx                # Full-screen Now Playing modal + seek scrubber
    │   ├── playlist/[id].tsx         # Playlist & Liked Songs detail screen
    │   └── (tabs)/
    │       ├── _layout.tsx           # Bottom tabs + docked MiniPlayer
    │       ├── index.tsx             # Home feed & recently played grid
    │       ├── search.tsx            # YouTube & Spotify catalog search
    │       ├── library.tsx           # Liked songs, playlists & Spotify playlist importer
    │       └── settings.tsx          # API Keys Vault (Share/Import) & AdGuard Shield
    └── src/
        ├── types/index.ts
        ├── theme/colors.ts
        ├── services/
        │   ├── adguardClient.ts      # Client-side URL & tracker sanitizer
        │   ├── apiClient.ts          # Typed API client forwarding per-user API headers
        │   ├── audioEngine.ts        # expo-audio singleton + lock screen + SponsorBlock skip
        │   └── secureKeys.ts         # Expo SecureStore encrypted key vault + JSON share/import
        ├── store/
        │   ├── adguardStore.ts
        │   ├── libraryStore.ts
        │   ├── playerStore.ts
        │   └── settingsStore.ts
        └── components/
            ├── AdGuardCard.tsx       # Shield stats, toggles & custom AdGuard rule editor
            ├── ApiKeysCard.tsx       # Spotify/YouTube key inputs, testers & share/import box
            ├── MiniPlayer.tsx        # Floating bottom mini-player
            ├── PlaylistCard.tsx
            ├── QueueSheet.tsx        # Up-next queue modal
            └── TrackRow.tsx          # Track item + Play Next / Queue / Add to Playlist menu
```

---

## Setup & Running Locally

### 1. Start the Backend Server

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

The backend runs on `http://0.0.0.0:4000` by default.

> **Tip (Stream Reliability):** Installing [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) on your machine's `PATH` enables ultra-reliable YouTube audio extraction. If `yt-dlp` is not installed, the backend automatically falls back to pure-JS `youtubei.js`.

---

### Deploy Backend to Render

The repository includes [render.yaml](render.yaml) and [backend/Dockerfile](backend/Dockerfile) (which bundles Node 22 + `yt-dlp` + `ffmpeg`).

#### Option A: One-Click Blueprint Deploy (Recommended — includes `yt-dlp`)
1. Push the `Musie/` folder to a GitHub repository.
2. In the [Render Dashboard](https://dashboard.render.com), click **New + → Blueprint** and select your repository.
3. Render reads `render.yaml` (`runtime: docker`, `rootDir: backend`, `healthCheckPath: /health`) and builds `musie-backend`.
4. Optionally add `YOUTUBE_API_KEY`, `SPOTIFY_CLIENT_ID`, and `SPOTIFY_CLIENT_SECRET` in Render's **Environment** tab (or leave them blank and enter them directly inside the mobile app's **Settings → API Keys Vault**).

#### Option B: Manual Native Node Web Service
If you create a **Web Service** manually without Docker:
- **Root Directory:** `backend`
- **Build Command:** `npm install && npm run build`
- **Start Command:** `npm start`
- **Health Check Path:** `/health`

#### Connect Your Mobile App to Render
1. Copy your Render URL (e.g., `https://musie-backend.onrender.com`).
2. Open **Musie → Settings → Spotify & YouTube API Keys Vault**.
3. Set **Personal Backend URL** to `https://musie-backend.onrender.com`, tap **Save Keys**, and tap **Ping** (the first request on Render's Free tier may take ~30–50 seconds if the instance was asleep).

> **Persistence Note:** On Render's Free tier, the local filesystem resets when the service restarts, so backend `db.json` playlists reset on redeploy (though your API keys stay safely stored on your phone via `expo-secure-store`). To persist backend playlists across redeploys, attach a Render **Persistent Disk** (paid plan) mounted at `/var/data` and set `DATA_DIR=/var/data`.

---

### 2. Start the Expo SDK 58 Mobile App

> **Node.js Requirement:** Expo SDK 58 requires **Node.js 22.13+**, **24.3+**, or **26+** (avoid odd-numbered Node versions like 23 or 25).

```bash
cd mobile
npm install
npx expo install --fix
npx expo-doctor@latest
```

Create a native development build so **background audio** and **lock-screen / media notification controls** work on Android & iOS (Expo Go does not include full native background audio services):

```bash
# Regenerate native projects if upgrading an existing build
npx expo prebuild --clean

# Android (emulator or USB device)
npx expo run:android

# iOS (macOS / iOS 27 SceneDelegate supported)
npx expo run:ios
```

For quick UI-only previewing on a device/simulator:
```bash
npx expo start
```

---

### 3. Configure & Share API Keys in the App

1. Open the **Settings** tab in Musie.
2. In **Spotify & YouTube API Keys Vault**:
   - Set **Personal Backend URL** (`http://10.0.2.2:4000` for Android Emulator, `http://localhost:4000` for iOS Simulator, or `http://<YOUR_PC_LAN_IP>:4000` for a physical phone on the same Wi-Fi).
   - Paste your **YouTube Data API v3 Key** (optional — improves search speed & metadata; without it, the backend falls back to `yt-search`).
   - Paste your **Spotify Client ID** & **Spotify Client Secret** (from [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)) to search Spotify's catalog and import Spotify playlists directly into Musie.
3. Tap **Save Keys** (stored encrypted on-device in **Expo SecureStore**).
4. Use **Share Config** / **Import JSON** in the same box to transfer your configuration across your own devices (with an explicit toggle to include or redact secret keys).

---

## AdGuard Shield Features

- **Domain & URL Blocklist:** Blocks requests to known audio/video ad & telemetry networks (`doubleclick.net`, `ads-fa.spotify.com`, `adswizz.com`, `tritondigital.com`, `ads.youtube.com`, etc.).
- **Custom AdGuard Filter Syntax:** Add your own `||domain.com^`, `0.0.0.0 domain.com`, or allowlist rules directly from **Settings → Musie AdGuard Shield**.
- **In-Track SponsorBlock Skipper:** Automatically skips sponsored segments, promos, and non-music sections inside YouTube tracks via SponsorBlock.
- **Third-Party Audio Ad Guard:** Rejects VAST/VMAP/DAI/preroll ad-insertion URLs on external stream proxy requests and strips tracking query parameters (`utm_*`, `si`, `fbclid`, `gclid`).
