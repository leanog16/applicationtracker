const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'jobs.json');
const PORT = process.env.PORT || 3000;

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]');

function readJobs() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeJobs(jobs) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(jobs, null, 2));
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/jobs', (req, res) => {
  const jobs = readJobs().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json(jobs);
});

app.post('/api/jobs', (req, res) => {
  const { url, title, company, dateApplied } = req.body || {};
  if (!url || typeof url !== 'string' || !url.trim()) {
    return res.status(400).json({ error: 'url is required' });
  }
  const jobs = readJobs();
  const job = {
    id: crypto.randomUUID(),
    url: url.trim(),
    title: (title || '').trim() || 'Untitled role',
    company: (company || '').trim() || 'Unknown company',
    status: 'pending',
    dateApplied: dateApplied && /^\d{4}-\d{2}-\d{2}$/.test(dateApplied) ? dateApplied : todayStr(),
    createdAt: new Date().toISOString(),
  };
  jobs.push(job);
  writeJobs(jobs);
  res.status(201).json(job);
});

app.patch('/api/jobs/:id', (req, res) => {
  const { status } = req.body || {};
  if (!['pending', 'accepted', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'status must be pending, accepted, or rejected' });
  }
  const jobs = readJobs();
  const job = jobs.find((j) => j.id === req.params.id);
  if (!job) return res.status(404).json({ error: 'not found' });
  job.status = status;
  writeJobs(jobs);
  res.json(job);
});

app.delete('/api/jobs/:id', (req, res) => {
  const jobs = readJobs();
  const next = jobs.filter((j) => j.id !== req.params.id);
  if (next.length === jobs.length) return res.status(404).json({ error: 'not found' });
  writeJobs(next);
  res.status(204).end();
});

app.get('/api/stats', (req, res) => {
  const jobs = readJobs();
  const byDay = {};
  for (const j of jobs) {
    byDay[j.dateApplied] = (byDay[j.dateApplied] || 0) + 1;
  }
  const byStatus = { pending: 0, accepted: 0, rejected: 0 };
  for (const j of jobs) byStatus[j.status] = (byStatus[j.status] || 0) + 1;
  res.json({ total: jobs.length, byDay, byStatus });
});

app.listen(PORT, () => {
  console.log(`apptracker listening on port ${PORT}`);
});
