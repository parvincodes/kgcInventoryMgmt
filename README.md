# Langar Pantry

Inventory and weekly shopping list for the Khalsa Community Centre langar kitchen.

Reviewers count the pantry after Sunday langar, the app drafts a shopping list from what's below minimum, and the sewa family gets a link to the list on WhatsApp. Families never change inventory; only the weekly count does.

## What's in this first iteration

| Screen | What it does |
|---|---|
| Sign in | Reviewer name + shared PIN (Google/phone sign-in comes later) |
| This week | Week status (Count due → Counted → List drafted → Sent) and the next step |
| Weekly count | Grouped by Kitchen / Shelves / Fridge / Freezer, A–Z. Starts at last week's numbers; +/− or Full/Half/Low/Out; saves every tap; either reviewer can resume |
| Shopping list | Drafted from the count (target − current). Edit, remove, add one-offs, note to family. Approve, then share on WhatsApp |
| Family list (`/f/<link>`) | No sign-in. Tick items bought and correct quantities. Never changes inventory |
| Item catalog | Location, unit, number or level, minimum, target, expiry date |
| Add by photo | Opens the phone camera, AI lists what's on the shelf, you confirm before saving |

## Run it on your laptop and open it on your iPhone

You need **Node.js 20 or newer** (`node -v` to check; install from nodejs.org if needed).

```bash
git clone https://github.com/parvincodes/langar-pantry.git
cd langar-pantry
npm install
cp .env.example .env      # then edit .env: set REVIEWER_PIN and SESSION_SECRET
npm start
```

The terminal prints two addresses:

```
On this computer:  http://localhost:3000
On your phone:     http://192.168.1.23:3000   (same Wi-Fi)
```

1. Connect your iPhone to the **same Wi-Fi** as the laptop.
2. Open the "On your phone" address in Safari.
3. Sign in with any name and the PIN from `.env`.
4. Optional: Share → **Add to Home Screen** so it opens like an app.

If the phone can't connect: on a Mac, allow incoming connections for `node` when macOS asks (System Settings → Network → Firewall). Some guest or office Wi-Fi networks block devices from reaching each other; use your home network.

Keep the laptop awake while testing. Data is saved in `data/pantry.db` (SQLite); delete that file to start fresh.

### Real photo reading

Without an API key, **Add by photo** returns demo results so you can try the flow. To read real photos, put a Claude API key from console.anthropic.com in `.env`:

```
ANTHROPIC_API_KEY=sk-ant-...
```

Restart with `npm start`. Each photo costs a few cents at most. The key stays on the server and is never sent to the phone.

### Developing

`npm run dev` runs the API with auto-reload plus the Vite dev server. On the phone, open the `Network:` address Vite prints (port 5173).

## A few things to know when testing

- **Family links only work for people who can reach your laptop.** When testing at home, the link (for example `http://192.168.1.23:3000/f/…`) works on your own phone. To send real links to families, the app needs to be hosted on the internet (next step).
- **Weeks are keyed by the next Saturday.** After Sunday langar the app moves on to next weekend's count. On Saturday it already shows the following week; families' links from the previous week keep working.
- **Photo results that match an existing item start unticked.** Tick them only if you want to overwrite that item's count. Low-confidence results also start unticked.
- **New items from photos have no minimum yet.** They show "Set min/target" and stay off the list until you set one.

## Project layout

```
server/        Express API (TypeScript, run with tsx)
  index.ts     routes, auth, static hosting
  logic.ts     weeks, below-minimum rules, list drafting
  scan.ts      photo → Claude vision → items
  db.ts        SQLite schema
client/        React app (Vite)
  src/screens/ one file per screen
data/          SQLite database (git-ignored)
```

## Next steps

- Host it (Render, Railway or Fly.io) so family links work from anywhere
- Google or phone sign-in for reviewers
- Track which family is on sewa each week, Thursday reminders
