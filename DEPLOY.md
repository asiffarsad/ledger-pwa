# Ledger PWA — Deployment Guide

## What's in this folder

```
ledger-pwa/
├── index.html          ← App entry point
├── vite.config.js      ← Build config + PWA plugin
├── package.json        ← Dependencies
├── src/
│   ├── main.jsx        ← React entry
│   ├── App.jsx         ← Full app (localStorage storage)
│   └── index.css       ← Global styles + iOS safe area
└── public/
    ├── favicon.svg
    ├── icon-192.png    ← Android icon
    ├── icon-512.png    ← Android splash / large icon
    └── apple-touch-icon.png  ← iPhone home screen icon
```

---

## Step 1 — Install Node.js (one-time)

Download from https://nodejs.org and install the **LTS** version.

Verify it worked: open Terminal and run:
```
node --version
```

---

## Step 2 — Set up the project

1. Unzip this folder somewhere on your computer (e.g. Desktop)
2. Open Terminal and navigate into it:

```bash
cd ~/Desktop/ledger-pwa
```

3. Install dependencies:

```bash
npm install
```

4. Test it locally (optional but recommended):

```bash
npm run dev
```
Open http://localhost:5173 in your browser — you should see the app.

---

## Step 3 — Create a free GitHub account

Go to https://github.com and sign up (free).

Then create a new repository:
- Click the **+** button → **New repository**
- Name it: `ledger-pwa`
- Leave it **Public** (required for free Vercel hosting)
- Click **Create repository**

---

## Step 4 — Push your code to GitHub

In Terminal (inside the ledger-pwa folder):

```bash
git init
git add .
git commit -m "Initial Ledger PWA"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/ledger-pwa.git
git push -u origin main
```

Replace `YOUR_USERNAME` with your GitHub username.

---

## Step 5 — Deploy to Vercel (free)

1. Go to https://vercel.com and sign up with your GitHub account
2. Click **Add New → Project**
3. Find and import your `ledger-pwa` repository
4. Vercel auto-detects Vite — just click **Deploy**
5. Wait ~60 seconds

You'll get a URL like: `https://ledger-pwa-abc123.vercel.app`

---

## Step 6 — Install on your phone

### iPhone (Safari only — Chrome won't show the install option on iOS)
1. Open Safari and go to your Vercel URL
2. Tap the **Share** button (box with arrow pointing up)
3. Scroll down and tap **"Add to Home Screen"**
4. Tap **Add**

The Ledger icon will appear on your home screen. Tap it — it opens fullscreen like a native app. ✅

### Android (Chrome)
1. Open Chrome and go to your Vercel URL
2. Tap the **3-dot menu** (top right)
3. Tap **"Add to Home Screen"** or **"Install App"**
4. Tap **Install**

---

## Your data

All your data is stored in your phone's browser storage (`localStorage`). It stays on your device privately — nothing is sent to any server.

**To back up your data:** In the app, use the Save button — your data is already auto-saved. To export it, you could open browser DevTools → Application → localStorage → copy the value of `ledger-data-v2`.

---

## Updating the app in the future

Whenever you make changes:
```bash
git add .
git commit -m "Update description"
git push
```

Vercel automatically re-deploys within ~30 seconds. The PWA on your phone updates automatically in the background.
