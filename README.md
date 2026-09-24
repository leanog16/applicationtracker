# Application Log

A self-hosted, single-container job application tracker. Keep each role,
company, application date, status, and the exact resume used for that
application in one private log. The dashboard also includes an activity
calendar and at-a-glance status totals.

Resume uploads accept PDF, DOC, DOCX, RTF, and TXT files up to 10 MB. Files
are stored privately under the app's data directory and are only downloaded
through their application record. Clearing application history also removes
the attached resume files.

## Run

```bash
docker compose up -d --build
```

Then open `http://<your-server-ip>:3000`.

Application data and uploaded resumes persist in the `apptracker_data` Docker
volume under `/data`, so they survive restarts and rebuilds.

## Update after code changes

```bash
docker compose up -d --build
```

## Stop

```bash
docker compose down
```
