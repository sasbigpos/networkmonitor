/* ─── State ────────────────────────────────────────────────────── */
const S = {
  devs:     [],
  queue:    [],
  running:  false,
  timer:    null,
  pTimer:   null,
  t0:       null,
  dur:      300,
  log:      [],
  pings:    0,
  sortCol:  'time',
  sortDir:  -1,
  page:     1,
  filtered: []
};

/* ─── Utilities ────────────────────────────────────────────────── */
function uid() { return Math.random().toString(36).slice(2, 7); }
function validIp(ip) { return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip); }

/* ─── Tabs ─────────────────────────────────────────────────────── */
function switchTab(name) {
  ['setup', 'monitor', 'results'].forEach(t => {
    document.getElementById('tab-' + t).classList.toggle('active', t === name);
    document.getElementById('panel-' + t).classList.toggle('active', t === name);
  });
  if (name === 'results') renderTable();
}

function updateBadges() {
  document.getElementById('badge-setup').textContent   = S.queue.length + S.devs.length;
  document.getElementById('badge-monitor').textContent = S.devs.length;
  document.getElementById('badge-results').textContent = S.log.length;
}

/* ─── Network config ───────────────────────────────────────────── */
function onNetChange() {
  const ip  = document.getElementById('myIpIn').value.trim();
  const p   = ip.match(/^(\d+\.\d+\.\d+)\.\d+$/);
  const el  = document.getElementById('subnetEl');
  if (p) { el.textContent = p[1] + '.0/24'; el.classList.remove('dim'); }
  else   { el.textContent = '—';            el.classList.add('dim');    }
}

function guessGateway() {
  const ip = document.getElementById('myIpIn').value.trim();
  const p  = ip.match(/^(\d+\.\d+\.\d+)\.\d+$/);
  if (!p) { alert('Enter your device IP first.'); return; }
  document.getElementById('gwIn').value = p[1] + '.1';
}

function applyGateway() {
  const gw = document.getElementById('gwIn').value.trim();
  if (!gw) { alert('Enter a gateway IP first.'); return; }
  queueDevice(gw, 'Gateway');
  renderQueue();
}

async function fetchPublicIp() {
  const el = document.getElementById('pubIpEl');
  el.textContent = 'fetching…'; el.classList.add('dim');
  try {
    const r = await Promise.race([
      fetch('https://api.ipify.org?format=json').then(r => r.json()),
      new Promise((_, rej) => setTimeout(rej, 5000))
    ]);
    if (r && r.ip) { el.textContent = r.ip; el.classList.remove('dim'); }
    else { el.textContent = 'unavailable'; }
  } catch { el.textContent = 'unavailable'; }
}

/* ─── Queue management ─────────────────────────────────────────── */
function queueDevice(ip, name) {
  if (!validIp(ip)) return false;
  if (S.queue.find(q => q.ip === ip) || S.devs.find(d => d.ip === ip)) return false;
  S.queue.push({ id: uid(), ip, name: name || ip });
  return true;
}

function singleAdd() {
  const ip = document.getElementById('sIp').value.trim();
  const nm = document.getElementById('sNm').value.trim();
  if (!ip) return;
  if (!validIp(ip)) { alert('Invalid IP address format.'); return; }
  if (S.queue.find(q => q.ip === ip) || S.devs.find(d => d.ip === ip)) {
    alert('Already in list.'); return;
  }
  queueDevice(ip, nm);
  document.getElementById('sIp').value = '';
  document.getElementById('sNm').value = '';
  renderQueue();
  document.getElementById('sIp').focus();
}

function bulkAdd() {
  const lines = document.getElementById('bulkArea').value
    .trim().split('\n').map(l => l.trim()).filter(Boolean);
  let added = 0, skipped = 0, invalid = 0;
  lines.forEach(line => {
    const parts = line.split(/[,\t]/).map(s => s.trim());
    if (!validIp(parts[0])) { invalid++; return; }
    if (queueDevice(parts[0], parts[1] || '')) added++; else skipped++;
  });
  document.getElementById('bulkArea').value = '';
  const msgs = [];
  if (added)   msgs.push('+' + added + ' added');
  if (skipped) msgs.push(skipped + ' duplicate');
  if (invalid) msgs.push(invalid + ' invalid');
  const statusEl = document.getElementById('bulkStatus');
  statusEl.textContent = msgs.join(' · ');
  setTimeout(() => statusEl.textContent = '', 4000);
  renderQueue();
}

function addCommon() {
  [['8.8.8.8', 'Google DNS'], ['1.1.1.1', 'Cloudflare DNS'], ['8.8.4.4', 'Google DNS 2']]
    .forEach(([ip, n]) => queueDevice(ip, n));
  renderQueue();
}

function addSubnetRange() {
  const ip = document.getElementById('myIpIn').value.trim();
  const p  = ip.match(/^(\d+\.\d+\.\d+)\.\d+$/);
  if (!p) { alert('Enter your device IP first to detect the subnet.'); return; }
  const start = parseInt(prompt('Range start (1–254):', '1')  || '1');
  const end   = parseInt(prompt('Range end (1–254):',  '20') || '20');
  if (isNaN(start) || isNaN(end) || start < 1 || end > 254 || start > end) {
    alert('Invalid range.'); return;
  }
  let added = 0;
  for (let i = start; i <= end; i++) if (queueDevice(p[1] + '.' + i, '')) added++;
  const statusEl = document.getElementById('bulkStatus');
  statusEl.textContent = '+' + added + ' IPs queued';
  setTimeout(() => statusEl.textContent = '', 4000);
  renderQueue();
}

function removeFromQueue(id) { S.queue = S.queue.filter(q => q.id !== id); renderQueue(); }
function clearQueue() { S.queue = []; renderQueue(); }

function updateQueueName(id, val) {
  const q = S.queue.find(q => q.id === id);
  if (q) q.name = val || q.ip;
}

function commitQueue() {
  S.queue.forEach(q => {
    if (!S.devs.find(d => d.ip === q.ip)) {
      S.devs.push({
        id: uid(), ip: q.ip, name: q.name || q.ip,
        status: 'pending', avg: null, min: null, max: null,
        ok: 0, fail: 0, hist: [], seen: null
      });
    }
  });
  S.queue = [];
  renderQueue(); renderDevices(); summ(); updateBadges();
}

function renderQueue() {
  const list  = document.getElementById('queueList');
  const wrap  = document.getElementById('queueWrap');
  const ctEl  = document.getElementById('queueCount');
  ctEl.textContent = S.queue.length ? S.queue.length + ' in queue' : '0 in queue';

  if (!S.queue.length) { wrap.style.display = 'none'; updateBadges(); return; }
  wrap.style.display = '';
  document.getElementById('qCt').textContent =
    S.queue.length + ' device' + (S.queue.length !== 1 ? 's' : '') + ' ready to add';
  list.innerHTML = '';
  S.queue.forEach(q => {
    const row = document.createElement('div');
    row.className = 'qi';
    row.innerHTML =
      `<span class="qi-ip">${q.ip}</span>` +
      `<span class="qi-nm"><input type="text" value="${q.name !== q.ip ? q.name : ''}" ` +
        `placeholder="label…" oninput="updateQueueName('${q.id}', this.value)"></span>` +
      `<button class="qi-rm" onclick="removeFromQueue('${q.id}')">✕</button>`;
    list.appendChild(row);
  });
  updateBadges();
}

/* ─── Ping engine ──────────────────────────────────────────────── */
/**
 * Browser-based "ping" using fetch with no-cors mode.
 * A response (even an error) means the host is reachable.
 * AbortController enforces the timeout.
 */
async function ping(ip, timeout) {
  const t0   = performance.now();
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), timeout);
  try {
    await fetch(`https://${ip}/favicon.ico?_=${Date.now()}`, {
      mode: 'no-cors', signal: ctrl.signal, cache: 'no-store'
    });
    clearTimeout(tid);
    return { ok: true, ms: Math.round(performance.now() - t0) };
  } catch (e) {
    clearTimeout(tid);
    const ms = Math.round(performance.now() - t0);
    if (e.name === 'AbortError') return { ok: false, ms: timeout };
    // Any non-abort error (CORS, network refused) still proves host is up
    return { ok: true, ms };
  }
}

function msClass(ms) { return ms < 50 ? 'g' : ms < 200 ? 'w' : 'r'; }
function msColor(ms) {
  return ms < 50
    ? getComputedStyle(document.documentElement).getPropertyValue('--clr-green').trim()
    : ms < 200
      ? getComputedStyle(document.documentElement).getPropertyValue('--clr-amber').trim()
      : getComputedStyle(document.documentElement).getPropertyValue('--clr-red').trim();
}

/* ─── Sparkline ────────────────────────────────────────────────── */
function sparkline(hist) {
  const pts = hist.slice(-24);
  if (!pts.length) return '<svg class="sparkline"></svg>';
  const w = 220, h = 34;
  const maxMs = Math.max(...pts.filter(p => p.ok).map(p => p.ms), 1);
  const step  = w / Math.max(pts.length - 1, 1);
  let path = '', dots = '';
  pts.forEach((p, i) => {
    const x = Math.round(i * step);
    const y = p.ok ? Math.round(h - (p.ms / maxMs) * (h - 5)) : h;
    path += (i === 0 ? 'M' : 'L') + x + ',' + y;
    const c = p.ok
      ? (p.ms < 50 ? '#5a9e1d' : p.ms < 200 ? '#d48a10' : '#c94040')
      : '#c94040';
    dots += `<circle cx="${x}" cy="${y}" r="2.5" fill="${c}" opacity="0.9"/>`;
  });
  return `<svg class="sparkline" viewBox="0 0 ${w} ${h}"
    xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
    <path d="${path}" fill="none" stroke="#cccccc" stroke-width="1.5" stroke-linejoin="round"/>
    ${dots}
  </svg>`;
}

/* ─── Device cards ─────────────────────────────────────────────── */
function renderDevices() {
  const grid = document.getElementById('grid');
  const emp  = document.getElementById('emp');
  if (!S.devs.length) { grid.innerHTML = ''; grid.appendChild(emp); return; }
  if (emp.parentNode) emp.parentNode.removeChild(emp);

  S.devs.forEach(d => {
    let el = document.getElementById('c-' + d.id);
    if (!el) { el = document.createElement('div'); el.id = 'c-' + d.id; grid.appendChild(el); }
    const tot = d.ok + d.fail;
    const pct = tot ? Math.round(d.ok / tot * 100) : null;
    const ac  = d.avg !== null ? msClass(d.avg) : '';
    el.className = 'card ' + d.status;
    el.innerHTML =
      `<div class="card-top">
        <div>
          <div class="card-name">${d.name}</div>
          <div class="card-ip">${d.ip}</div>
        </div>
        <div class="badge ${d.status}">${d.status === 'pending' ? '—' : d.status}</div>
      </div>
      ${sparkline(d.hist)}
      <div class="stats3">
        <div class="st">
          <div class="st-l">Avg ms</div>
          <div class="st-v ${ac}">${d.avg !== null ? d.avg : '—'}</div>
        </div>
        <div class="st">
          <div class="st-l">Min / Max</div>
          <div class="st-v" style="font-size:12px">
            ${d.min !== null ? d.min + ' / ' + d.max : '—'}
          </div>
        </div>
        <div class="st">
          <div class="st-l">Uptime</div>
          <div class="st-v ${pct !== null ? (pct > 90 ? 'g' : pct > 70 ? 'w' : 'r') : ''}">
            ${pct !== null ? pct + '%' : '—'}
          </div>
        </div>
      </div>
      <div class="card-foot">
        <div class="last">${d.seen ? 'Last: ' + d.seen : 'not pinged yet'}</div>
        <button class="rm" onclick="rmDev('${d.id}')">remove</button>
      </div>`;
  });

  // Remove stale cards
  Array.from(grid.children).forEach(c => {
    if (c.id && c.id.startsWith('c-') && !S.devs.find(d => 'c-' + d.id === c.id))
      grid.removeChild(c);
  });
}

function rmDev(id) {
  S.devs = S.devs.filter(d => d.id !== id);
  renderDevices(); summ(); updateBadges();
}

/* ─── Summary bar ──────────────────────────────────────────────── */
function summ() {
  const on   = S.devs.filter(d => d.status === 'online').length;
  const off  = S.devs.filter(d => d.status === 'offline').length;
  const avgs = S.devs.filter(d => d.avg !== null).map(d => d.avg);
  const ga   = avgs.length ? Math.round(avgs.reduce((a, b) => a + b, 0) / avgs.length) : null;
  document.getElementById('sum').innerHTML =
    `<div class="chip">Total <b>${S.devs.length}</b></div>` +
    `<div class="chip">Online <b style="color:var(--clr-green)">${on}</b></div>` +
    `<div class="chip">Offline <b style="color:var(--clr-red)">${off}</b></div>` +
    (ga !== null ? `<div class="chip">Avg latency <b>${ga} ms</b></div>` : '') +
    `<div class="chip">Pings <b>${S.pings}</b></div>`;
}

/* ─── Results table ────────────────────────────────────────────── */
function applyFilter() { S.page = 1; renderTable(); }

function sortBy(col) {
  S.sortDir = S.sortCol === col ? S.sortDir * -1 : -1;
  S.sortCol = col;
  document.querySelectorAll('th').forEach(th => th.classList.remove('sorted'));
  const thEl = document.getElementById('th-' + col);
  if (thEl) thEl.classList.add('sorted');
  renderTable();
}

function renderTable() {
  const filterTxt = (document.getElementById('filterInput').value || '').toLowerCase();
  const filterSt  = document.getElementById('filterStatus').value;
  const pgSize    = parseInt(document.getElementById('pageSize').value) || 20;

  let rows = [...S.log];
  if (filterTxt) rows = rows.filter(r =>
    r.ip.includes(filterTxt) || r.name.toLowerCase().includes(filterTxt));
  if (filterSt === 'online')  rows = rows.filter(r =>  r.ok);
  if (filterSt === 'offline') rows = rows.filter(r => !r.ok);

  rows.sort((a, b) => {
    let av, bv;
    if      (S.sortCol === 'time')   { av = a.tsNum; bv = b.tsNum; }
    else if (S.sortCol === 'ip')     { av = a.ip;    bv = b.ip;    }
    else if (S.sortCol === 'name')   { av = a.name;  bv = b.name;  }
    else if (S.sortCol === 'status') { av = a.ok ? 1 : 0; bv = b.ok ? 1 : 0; }
    else if (S.sortCol === 'ms')     { av = a.ok ? a.ms : 99999; bv = b.ok ? b.ms : 99999; }
    if (av < bv) return -1 * S.sortDir;
    if (av > bv) return  1 * S.sortDir;
    return 0;
  });

  S.filtered = rows;
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / pgSize));
  S.page      = Math.min(S.page, pages);
  const slice = rows.slice((S.page - 1) * pgSize, S.page * pgSize);
  const maxMs = Math.max(...rows.filter(r => r.ok).map(r => r.ms), 1);

  const tbody = document.getElementById('resultsBody');
  if (!slice.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="tbl-empty">No results match your filter.</td></tr>';
  } else {
    tbody.innerHTML = slice.map((r, i) => {
      const rowNum = (S.page - 1) * pgSize + i + 1;
      const barW   = r.ok ? Math.max(4, Math.round((r.ms / maxMs) * 100)) : 0;
      const barCol = r.ok ? msColor(r.ms) : 'var(--clr-red)';
      return `<tr>
        <td style="color:var(--clr-text-muted)">${rowNum}&nbsp;&nbsp;${r.time}</td>
        <td>${r.ip}</td>
        <td style="color:var(--clr-text-sub)">${r.name}</td>
        <td><span class="pill ${r.ok ? 'ok' : 'fail'}">${r.ok ? 'online' : 'offline'}</span></td>
        <td>
          <div class="ms-bar-cell">
            <div class="ms-bar" style="width:${barW}px;background:${barCol}"></div>
            <span style="color:${barCol}">${r.ok ? r.ms + ' ms' : '—'}</span>
          </div>
        </td>
      </tr>`;
    }).join('');
  }

  document.getElementById('tblInfo').textContent =
    total + ' entr' + (total !== 1 ? 'ies' : 'y') +
    (total !== S.log.length ? ' (filtered)' : '');

  // Pagination
  const pager = document.getElementById('pager');
  pager.innerHTML = '';
  const mkBtn = (label, page, disabled, active) => {
    const b = document.createElement('button');
    b.className = 'pg-btn' + (active ? ' cur' : '');
    b.textContent = label;
    b.disabled = disabled;
    b.onclick = () => goPage(page);
    pager.appendChild(b);
  };
  mkBtn('‹', S.page - 1, S.page <= 1, false);
  const ps = Math.max(1, S.page - 2), pe = Math.min(pages, S.page + 2);
  for (let p = ps; p <= pe; p++) mkBtn(p, p, false, p === S.page);
  mkBtn('›', S.page + 1, S.page >= pages, false);
}

function goPage(p) { S.page = p; renderTable(); }

/* ─── Log entry ────────────────────────────────────────────────── */
function logEntry(dev, res) {
  const now = new Date(), ts = now.toTimeString().slice(0, 8);
  S.log.push({
    tsNum: now.getTime(), ts: now.toISOString(),
    time: ts, ip: dev.ip, name: dev.name, ok: res.ok, ms: res.ms
  });

  const b   = document.getElementById('lBody');
  const row = document.createElement('div');
  row.className = 'le';
  row.innerHTML =
    `<span class="le-t">${ts}</span>` +
    `<span class="le-ip">${dev.ip}</span>` +
    `<span class="le-nm">${dev.name !== dev.ip ? dev.name : ''}</span>` +
    `<span class="le-m ${res.ok ? 'ok' : 'fail'}">${res.ok ? 'reply ' + res.ms + ' ms' : 'timeout'}</span>`;
  b.insertBefore(row, b.firstChild);
  while (b.children.length > 200) b.removeChild(b.lastChild);

  document.getElementById('lCt').textContent = S.log.length + ' entries';
  updateBadges();

  // Live-refresh table if results tab is open
  if (document.getElementById('panel-results').classList.contains('active')) renderTable();
}

/* ─── Ping cycle ───────────────────────────────────────────────── */
async function cycle() {
  const to = parseInt(document.getElementById('toIn').value) || 3000;
  for (const d of S.devs) {
    const r = await ping(d.ip, to);
    d.status = r.ok ? 'online' : 'offline';
    if (r.ok) { d.ok++; d.hist.push({ ok: true,  ms: r.ms }); }
    else       { d.fail++; d.hist.push({ ok: false, ms: 0    }); }
    if (d.hist.length > 60) d.hist.shift();

    const g   = d.hist.filter(h => h.ok).map(h => h.ms);
    d.avg = g.length ? Math.round(g.reduce((a, b) => a + b, 0) / g.length) : null;
    d.min = g.length ? Math.min(...g) : null;
    d.max = g.length ? Math.max(...g) : null;
    if (r.ok) d.seen = new Date().toTimeString().slice(0, 8);
    logEntry(d, r);
    S.pings++;
  }
  renderDevices(); summ();
}

/* ─── Monitor start / stop ─────────────────────────────────────── */
function startMon() {
  if (!S.devs.length) {
    if (S.queue.length) commitQueue();
    else { alert('Add at least one device first.'); return; }
  }
  S.running = true; S.t0 = Date.now();
  S.dur = parseInt(document.getElementById('dSel').value);
  const iv = parseInt(document.getElementById('iSel').value);

  document.getElementById('startBtn').style.display = 'none';
  document.getElementById('stopBtn').style.display  = '';
  document.getElementById('gDot').classList.add('active');

  if (S.dur > 0) {
    document.getElementById('prog').style.display = '';
    S.pTimer = setInterval(() => {
      const elapsed = (Date.now() - S.t0) / 1000;
      document.getElementById('progFill').style.width =
        Math.min(elapsed / S.dur * 100, 100) + '%';
      if (elapsed >= S.dur) stopMon();
    }, 500);
  }

  switchTab('monitor');
  cycle();
  S.timer = setInterval(() => { if (S.running) cycle(); }, iv);
}

function stopMon() {
  S.running = false;
  clearInterval(S.timer);
  clearInterval(S.pTimer);
  document.getElementById('startBtn').style.display = '';
  document.getElementById('stopBtn').style.display  = 'none';
  document.getElementById('gDot').classList.remove('active');
  document.getElementById('prog').style.display     = 'none';
  document.getElementById('progFill').style.width   = '0%';
}

/* ─── Export ───────────────────────────────────────────────────── */
function exportCSV() {
  if (!S.log.length) { alert('No data to export yet.'); return; }
  const myIp = document.getElementById('myIpIn').value.trim() || 'unknown';
  const gw   = document.getElementById('gwIn').value.trim()   || 'unknown';
  const hdr  =
    `# Network Monitor Export\n` +
    `# Device IP: ${myIp}\n` +
    `# Gateway:   ${gw}\n` +
    `# Exported:  ${new Date().toISOString()}\n` +
    `Timestamp,IP,Label,Status,Latency(ms)\n`;
  const rows = (S.filtered.length && S.filtered.length < S.log.length ? S.filtered : S.log);
  const csv  = hdr + rows
    .map(e => `${e.ts},${e.ip},"${e.name}",${e.ok ? 'online' : 'offline'},${e.ok ? e.ms : ''}`)
    .join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = 'net-monitor-' + new Date().toISOString().slice(0, 19).replace(/:/g, '-') + '.csv';
  a.click();
}

function clearLog() {
  S.log = []; S.filtered = [];
  document.getElementById('lBody').innerHTML = '';
  document.getElementById('lCt').textContent = '0 entries';
  renderTable(); updateBadges();
}

/* ─── Init ─────────────────────────────────────────────────────── */
updateBadges();
summ();
