const state = {
  jobs: [],
  stats: { total: 0, byDay: {}, byStatus: {} },
  calMonth: new Date().getMonth(),
  calYear: new Date().getFullYear(),
};

const $ = (selector) => document.querySelector(selector);
let toastTimer;

function localDateString(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

async function request(url, options = {}, expectJson = true) {
  const response = await fetch(url, options);
  if (!response.ok) {
    let message = 'Something went wrong. Please try again.';
    try {
      const body = await response.json();
      if (body.error) message = body.error;
    } catch {
      // Keep the useful fallback message when a server response is not JSON.
    }
    throw new Error(message);
  }
  if (response.status === 204) return null;
  if (!expectJson) return null;

  const responseText = await response.text();
  if (!responseText) throw new Error('The server returned an empty response.');
  try {
    return JSON.parse(responseText);
  } catch {
    throw new Error('The server returned an unreadable response.');
  }
}

function showToast(message, type = 'success') {
  const toast = $('#toast');
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.className = `toast visible ${type}`;
  toastTimer = setTimeout(() => {
    toast.className = 'toast';
  }, 3200);
}

async function loadAll() {
  try {
    const [jobs, stats] = await Promise.all([
      request('/api/jobs'),
      request('/api/stats'),
    ]);
    state.jobs = jobs;
    state.stats = stats;
    render();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function render() {
  $('#totalCount').textContent = state.stats.total;
  $('#pendingCount').textContent = state.stats.byStatus.pending || 0;
  $('#acceptedCount').textContent = state.stats.byStatus.accepted || 0;
  $('#rejectedCount').textContent = state.stats.byStatus.rejected || 0;
  $('#listSummary').textContent = `${state.jobs.length} ${state.jobs.length === 1 ? 'record' : 'records'}`;
  $('#openClearDialog').disabled = state.jobs.length === 0;
  renderCalendar();
  renderList();
}

function renderCalendar() {
  const { calMonth, calYear } = state;
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  $('#calendarTitle').textContent = `${monthNames[calMonth]} ${calYear}`;

  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const today = localDateString();
  const grid = $('#calendarGrid');
  grid.innerHTML = '';

  for (let index = 0; index < firstDay; index += 1) {
    const cell = document.createElement('div');
    cell.className = 'day-cell empty';
    cell.setAttribute('aria-hidden', 'true');
    grid.appendChild(cell);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const count = Number(state.stats.byDay[date] || 0);
    const cell = document.createElement('div');
    const activityClass = count ? `has-activity level-${Math.min(count, 4)}` : '';
    cell.className = `day-cell ${activityClass} ${date === today ? 'today' : ''}`;
    cell.setAttribute('aria-label', `${monthNames[calMonth]} ${day}: ${count} ${count === 1 ? 'application' : 'applications'}`);
    cell.innerHTML = `<span class="day-num">${day}</span>${count ? `<span class="day-count">${count}</span>` : ''}`;
    grid.appendChild(cell);
  }

  const usedCells = firstDay + daysInMonth;
  const trailingCells = Math.ceil(usedCells / 7) * 7 - usedCells;
  for (let index = 0; index < trailingCells; index += 1) {
    const cell = document.createElement('div');
    cell.className = 'day-cell empty';
    cell.setAttribute('aria-hidden', 'true');
    grid.appendChild(cell);
  }
}

function renderList() {
  const list = $('#jobList');
  list.innerHTML = '';
  $('#emptyState').hidden = state.jobs.length > 0;

  for (const job of state.jobs) {
    const row = document.createElement('article');
    row.className = 'job-row';
    const resume = job.resume
      ? `<div class="resume-stack">
          <a class="resume-link" href="/api/jobs/${escapeAttr(job.id)}/resume" title="Download ${escapeAttr(job.resume.originalName)}">
            <span class="document-mark" aria-hidden="true">DOC</span>
            <span>${escapeHtml(job.resume.originalName)}</span>
          </a>
          <label class="replace-link">Replace<input class="row-resume-input" type="file" data-id="${escapeAttr(job.id)}" accept=".pdf,.doc,.docx,.rtf,.txt" /></label>
        </div>`
      : `<label class="attach-resume">
          <span aria-hidden="true">+</span> Attach resume
          <input class="row-resume-input" type="file" data-id="${escapeAttr(job.id)}" accept=".pdf,.doc,.docx,.rtf,.txt" />
        </label>`;

    row.innerHTML = `
      <div class="job-info">
        <a class="job-title" href="${escapeAttr(job.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(job.title)} <span aria-hidden="true">&#8599;</span></a>
        <div class="job-meta"><strong>${escapeHtml(job.company)}</strong><span>${formatDate(job.dateApplied)}</span></div>
      </div>
      <div class="resume-cell">${resume}</div>
      <div class="status-control ${escapeAttr(job.status)}">
        <i aria-hidden="true"></i>
        <select class="status-select" data-id="${escapeAttr(job.id)}" aria-label="Status for ${escapeAttr(job.title)}">
          <option value="pending" ${job.status === 'pending' ? 'selected' : ''}>Pending</option>
          <option value="accepted" ${job.status === 'accepted' ? 'selected' : ''}>Accepted</option>
          <option value="rejected" ${job.status === 'rejected' ? 'selected' : ''}>Rejected</option>
        </select>
      </div>
      <button class="delete-button" type="button" data-id="${escapeAttr(job.id)}" data-action="delete" aria-label="Delete ${escapeAttr(job.title)}">Delete</button>
    `;
    list.appendChild(row);
  }
}

function formatDate(dateString) {
  const date = new Date(`${dateString}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dateString;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = String(value ?? '');
  return div.innerHTML;
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, '&quot;');
}

$('#dateInput').value = localDateString();

$('#resumeInput').addEventListener('change', (event) => {
  const file = event.target.files[0];
  $('#resumeFileLabel').innerHTML = file
    ? `<b>${escapeHtml(file.name)}</b><em>${formatFileSize(file.size)}</em>`
    : '<b>Choose file</b><em>PDF, DOCX · 10 MB max</em>';
});

function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

$('#addForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = $('#addSubmit');
  const formData = new FormData(event.currentTarget);
  button.disabled = true;
  button.querySelector('span').textContent = 'Adding…';

  try {
    await request('/api/jobs', { method: 'POST', body: formData }, false);
    event.currentTarget.reset();
    $('#dateInput').value = localDateString();
    $('#resumeFileLabel').innerHTML = '<b>Choose file</b><em>PDF, DOCX · 10 MB max</em>';
    await loadAll();
    showToast('Application added to your log.');
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    button.disabled = false;
    button.querySelector('span').textContent = 'Add to log';
  }
});

$('#jobList').addEventListener('change', async (event) => {
  const target = event.target;
  if (target.matches('.status-select')) {
    try {
      await request(`/api/jobs/${encodeURIComponent(target.dataset.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: target.value }),
      }, false);
      await loadAll();
      showToast('Application status updated.');
    } catch (error) {
      await loadAll();
      showToast(error.message, 'error');
    }
  }

  if (target.matches('.row-resume-input') && target.files[0]) {
    if (target.files[0].size > 10 * 1024 * 1024) {
      showToast('Resume must be smaller than 10 MB.', 'error');
      target.value = '';
      return;
    }
    const row = target.closest('.job-row');
    row.classList.add('is-uploading');
    const formData = new FormData();
    formData.append('resume', target.files[0]);
    try {
      await request(`/api/jobs/${encodeURIComponent(target.dataset.id)}/resume`, {
        method: 'POST',
        body: formData,
      }, false);
      await loadAll();
      showToast('Resume attached to the application.');
    } catch (error) {
      row.classList.remove('is-uploading');
      target.value = '';
      showToast(error.message, 'error');
    }
  }
});

$('#jobList').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action="delete"]');
  if (!button) return;
  if (!window.confirm('Delete this application and its uploaded resume?')) return;

  button.disabled = true;
  try {
    await request(`/api/jobs/${encodeURIComponent(button.dataset.id)}`, { method: 'DELETE' });
    await loadAll();
    showToast('Application deleted.');
  } catch (error) {
    button.disabled = false;
    showToast(error.message, 'error');
  }
});

$('#prevMonth').addEventListener('click', () => {
  state.calMonth -= 1;
  if (state.calMonth < 0) {
    state.calMonth = 11;
    state.calYear -= 1;
  }
  renderCalendar();
});

$('#nextMonth').addEventListener('click', () => {
  state.calMonth += 1;
  if (state.calMonth > 11) {
    state.calMonth = 0;
    state.calYear += 1;
  }
  renderCalendar();
});

$('#openClearDialog').addEventListener('click', () => {
  $('#clearDialog').showModal();
});

$('#confirmClear').addEventListener('click', async (event) => {
  event.preventDefault();
  const button = event.currentTarget;
  button.disabled = true;
  button.textContent = 'Clearing…';
  try {
    await request('/api/jobs', { method: 'DELETE' });
    $('#clearDialog').close();
    await loadAll();
    showToast('Application history cleared.');
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    button.disabled = false;
    button.textContent = 'Clear everything';
  }
});

$('#clearDialog').addEventListener('click', (event) => {
  if (event.target === event.currentTarget) event.currentTarget.close();
});

loadAll();
