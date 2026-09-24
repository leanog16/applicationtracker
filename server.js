const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'jobs.json');
const RESUME_DIR = path.join(DATA_DIR, 'resumes');
const PORT = process.env.PORT || 3000;
const MAX_RESUME_SIZE = 10 * 1024 * 1024;
const RESUME_EXTENSIONS = new Set(['.pdf', '.doc', '.docx', '.rtf', '.txt']);

fs.mkdirSync(RESUME_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]');

function readJobs() {
  try {
    const jobs = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return Array.isArray(jobs) ? jobs : [];
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

function publicJob(job) {
  const { resumeFile, ...safeJob } = job;
  const resume = job.resume
    ? {
        originalName: job.resume.originalName,
        mimeType: job.resume.mimeType,
        size: job.resume.size,
        uploadedAt: job.resume.uploadedAt,
      }
    : null;
  return { ...safeJob, resume };
}

function removeStoredResume(resume) {
  const storedName = resume && (resume.storedName || resume.resumeFile);
  if (!storedName) return;
  try {
    fs.unlinkSync(path.join(RESUME_DIR, path.basename(storedName)));
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('Could not remove resume:', error.message);
  }
}

function resumeFromFile(file) {
  return {
    storedName: file.filename,
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
    uploadedAt: new Date().toISOString(),
  };
}

const resumeStorage = multer.diskStorage({
  destination: RESUME_DIR,
  filename: (req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    callback(null, `${crypto.randomUUID()}${extension}`);
  },
});

const upload = multer({
  storage: resumeStorage,
  limits: { fileSize: MAX_RESUME_SIZE, files: 1 },
  fileFilter: (req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    if (!RESUME_EXTENSIONS.has(extension)) {
      return callback(new Error('Resume must be a PDF, DOC, DOCX, RTF, or TXT file.'));
    }
    callback(null, true);
  },
});

function acceptResume(req, res, next) {
  upload.single('resume')(req, res, (error) => {
    if (!error) return next();
    const message = error.code === 'LIMIT_FILE_SIZE'
      ? 'Resume must be smaller than 10 MB.'
      : error.message || 'Could not upload resume.';
    res.status(400).json({ error: message });
  });
}

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/jobs', (req, res) => {
  const jobs = readJobs().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json(jobs.map(publicJob));
});

app.post('/api/jobs', acceptResume, (req, res) => {
  const { url, title, company, dateApplied } = req.body || {};
  if (!url || typeof url !== 'string' || !url.trim()) {
    if (req.file) removeStoredResume({ storedName: req.file.filename });
    return res.status(400).json({ error: 'A job posting link is required.' });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(url.trim());
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error();
  } catch {
    if (req.file) removeStoredResume({ storedName: req.file.filename });
    return res.status(400).json({ error: 'Enter a valid http or https link.' });
  }

  const jobs = readJobs();
  const job = {
    id: crypto.randomUUID(),
    url: parsedUrl.toString(),
    title: typeof title === 'string' && title.trim() ? title.trim() : 'Untitled role',
    company: typeof company === 'string' && company.trim() ? company.trim() : 'Unknown company',
    status: 'pending',
    dateApplied: typeof dateApplied === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateApplied)
      ? dateApplied
      : todayStr(),
    createdAt: new Date().toISOString(),
    resume: req.file ? resumeFromFile(req.file) : null,
  };
  jobs.push(job);
  writeJobs(jobs);
  res.status(201).json(publicJob(job));
});

app.patch('/api/jobs/:id', (req, res) => {
  const { status } = req.body || {};
  if (!['pending', 'accepted', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Status must be pending, accepted, or rejected.' });
  }
  const jobs = readJobs();
  const job = jobs.find((item) => item.id === req.params.id);
  if (!job) return res.status(404).json({ error: 'Application not found.' });
  job.status = status;
  writeJobs(jobs);
  res.json(publicJob(job));
});

app.post('/api/jobs/:id/resume', acceptResume, (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Choose a resume to upload.' });

  const jobs = readJobs();
  const job = jobs.find((item) => item.id === req.params.id);
  if (!job) {
    removeStoredResume({ storedName: req.file.filename });
    return res.status(404).json({ error: 'Application not found.' });
  }

  const oldResume = job.resume;
  job.resume = resumeFromFile(req.file);
  writeJobs(jobs);
  removeStoredResume(oldResume);
  res.json(publicJob(job));
});

app.get('/api/jobs/:id/resume', (req, res) => {
  const job = readJobs().find((item) => item.id === req.params.id);
  const storedName = job?.resume && (job.resume.storedName || job.resume.resumeFile);
  if (!job || !storedName) return res.status(404).json({ error: 'Resume not found.' });

  const filePath = path.join(RESUME_DIR, path.basename(storedName));
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Resume file is missing.' });
  res.download(filePath, job.resume.originalName || 'resume');
});

app.delete('/api/jobs/:id/resume', (req, res) => {
  const jobs = readJobs();
  const job = jobs.find((item) => item.id === req.params.id);
  if (!job) return res.status(404).json({ error: 'Application not found.' });
  if (!job.resume) return res.status(404).json({ error: 'Resume not found.' });

  removeStoredResume(job.resume);
  job.resume = null;
  writeJobs(jobs);
  res.status(204).end();
});

app.delete('/api/jobs', (req, res) => {
  const jobs = readJobs();
  for (const job of jobs) removeStoredResume(job.resume);
  writeJobs([]);
  res.status(204).end();
});

app.delete('/api/jobs/:id', (req, res) => {
  const jobs = readJobs();
  const job = jobs.find((item) => item.id === req.params.id);
  if (!job) return res.status(404).json({ error: 'Application not found.' });

  writeJobs(jobs.filter((item) => item.id !== req.params.id));
  removeStoredResume(job.resume);
  res.status(204).end();
});

app.get('/api/stats', (req, res) => {
  const jobs = readJobs();
  const byDay = {};
  for (const job of jobs) {
    byDay[job.dateApplied] = (byDay[job.dateApplied] || 0) + 1;
  }
  const byStatus = { pending: 0, accepted: 0, rejected: 0 };
  for (const job of jobs) {
    if (Object.hasOwn(byStatus, job.status)) byStatus[job.status] += 1;
  }
  res.json({ total: jobs.length, byDay, byStatus });
});

app.listen(PORT, () => {
  console.log(`apptracker listening on port ${PORT}`);
});
