# PulsePlan

PulsePlan is a lightweight task tracker with:

- task priorities
- due dates and times
- browser reminders
- month calendar view
- offline support as a Progressive Web App
- import/export for task backups

## Run locally

You can open `index.html` directly, but installability and offline caching work best when served over HTTP.

If you have Python installed:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Deploy for other people

Because this app is fully static, you can deploy it on:

- GitHub Pages
- Netlify
- Vercel

Upload these files as-is:

- `index.html`
- `styles.css`
- `app.js`
- `manifest.webmanifest`
- `sw.js`
- `icon.svg`

## Important limitation

Right now tasks are stored in each user's browser with `localStorage`. That means:

- users do not share data with each other
- tasks do not sync across devices automatically
- there is no login yet

If you want true multi-user support, the next step is adding authentication and a hosted database.
