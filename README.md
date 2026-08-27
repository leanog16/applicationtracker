# Job Application Tracker

Self-hosted, single-container app for tracking job applications: paste a
link, title, and company; mark applications accepted/rejected; see a total
counter and a calendar of how many you applied to each day.

## Run

```bash
docker compose up -d --build
```

Then open `http://<your-server-ip>:3000`.

Data persists in the `apptracker_data` Docker volume (a `jobs.json` file
under `/data`), so it survives restarts and rebuilds.

## Update after code changes

```bash
docker compose up -d --build
```

## Stop

```bash
docker compose down
```
