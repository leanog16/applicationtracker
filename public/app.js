const state = {
  jobs: [],
  stats: { total: 0, byDay: {}, byStatus: {} },
  calMonth: new Date().getMonth(),
  calYear: new Date().getFullYear(),
};

const $ = (sel) => document.querySelector(sel);

async function loadAll() {
  const [jobsRes, statsRes] = await Promise.all([
    fetch('/api/jobs'),
    fetch('/api/stats'),
  ]);
  state.jobs = await jobsRes.json();
  state.stats = await statsRes.json();
  render();
}

function render() {
  $('#totalCount').textContent = state.stats.total;
  $('#pendingCount').textContent = state.stats.byStatus.pending || 0;
  $('#acceptedCount').textContent = state.stats.byStatus.accepted || 0;
  $('#rejectedCount').textContent = state.stats.byStatus.rejected || 0;
  renderCalendar();
  renderList();
}

function renderCalendar() {
  const { calMonth, calYear } = state;
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  $('#calendarTitle').textContent = `${monthNames[calMonth]} ${calYear}`;

  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const todayStr = new Date().toISOString().slice(0, 10);

  const grid = $('#calendarGrid');
  grid.innerHTML = '';

  for (let i = 0; i < firstDay; i++) {
    const cell = document.createElement('div');
    cell.className = 'day-cell empty';
    grid.appendChild(cell);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const count = state.stats.byDay[dateStr] || 0;
    const cell = document.createElement('div');
    let countClass = '';
    if (count === 1) countClass = 'count-1';
    else if (count === 2) countClass = 'count-2';
    else if (count === 3) countClass = 'count-3';
    else if (count >= 4) countClass = 'count-4';
    cell.className = `day-cell ${countClass} ${dateStr === todayStr ? 'today' : ''}`;
    cell.innerHTML = `<span class="day-num">${day}</span>${count ? `<span class="day-count">${count}</span>` : ''}`;
    grid.appendChild(cell);
  }
}

function renderList() {
  const list = $('#jobList');
  list.innerHTML = '';
  const jobs = state.jobs;
  $('#emptyState').hidden = jobs.length > 0;

  for (const job of jobs) {
    const row = document.createElement('div');
    row.className = 'job-row';
    row.innerHTML = `
      <div class="job-info">
        <a class="job-title" href="${escapeAttr(job.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(job.title)}</a>
        <div class="job-meta">${escapeHtml(job.company)} &middot; applied ${job.dateApplied}</div>
      </div>
      <span class="status-badge ${job.status}">${job.status}</span>
      <div class="job-actions">
        <button class="accept-btn ${job.status === 'accepted' ? 'active' : ''}" data-id="${job.id}" data-status="accepted">Accept</button>
        <button class="reject-btn ${job.status === 'rejected' ? 'active' : ''}" data-id="${job.id}" data-status="rejected">Reject</button>
        <button class="delete-btn" data-id="${job.id}" data-action="delete">&times;</button>
      </div>
    `;
    list.appendChild(row);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, '&quot;');
}

$('#addForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const url = $('#urlInput').value.trim();
  const title = $('#titleInput').value.trim();
  const company = $('#companyInput').value.trim();
  const dateApplied = $('#dateInput').value;
  if (!url) return;

  await fetch('/api/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, title, company, dateApplied }),
  });

  e.target.reset();
  loadAll();
});

$('#jobList').addEventListener('click', async (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const id = btn.dataset.id;

  if (btn.dataset.action === 'delete') {
    if (!confirm('Delete this application?')) return;
    await fetch(`/api/jobs/${id}`, { method: 'DELETE' });
    loadAll();
    return;
  }

  const newStatus = btn.classList.contains('active') ? 'pending' : btn.dataset.status;
  await fetch(`/api/jobs/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: newStatus }),
  });
  loadAll();
});

$('#prevMonth').addEventListener('click', () => {
  state.calMonth--;
  if (state.calMonth < 0) { state.calMonth = 11; state.calYear--; }
  renderCalendar();
});

$('#nextMonth').addEventListener('click', () => {
  state.calMonth++;
  if (state.calMonth > 11) { state.calMonth = 0; state.calYear++; }
  renderCalendar();
});

loadAll();
