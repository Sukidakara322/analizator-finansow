// ================= Analizator Finansów – logika interfejsu =================

let data = { version: 1, categories: [], months: {} };
let currentKey = null;      // klucz aktualnego miesiąca "RRRR-MM"
let listView = 'grouped';   // widok listy: 'grouped' | 'flat'
let dailyRange = null;      // zakres dni w rozbiciu dziennym: 7 | 14 | 21 | 'all' | null(auto)
let dailyDay = null;        // wybrany dzień (numer) do podsumowania
let expDatePicker = null;   // kalendarz w formularzu dodawania
let editDatePicker = null;  // kalendarz w oknie edycji
let editCategoryDropdown = null; // dropdown kategorii w oknie edycji
let editingExpense = null;  // { id, key } aktualnie edytowany wydatek
let editingCat = null;      // kategoria w trybie zmiany nazwy

const MONTH_NAMES = [
  'styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec',
  'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'
];

// Kolory kategorii (przypisywane cyklicznie wg indeksu)
const PALETTE = ['#a855f7', '#ec4899', '#22d3ee', '#2fe6b0', '#f472b6', '#818cf8', '#c77dff', '#fb7185', '#38bdf8', '#facc15'];

// ---------- Narzędzia ----------
const $ = (sel) => document.querySelector(sel);

function fmt(n) {
  return (Number(n) || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' zł';
}
function keyFromDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function labelFromKey(key) {
  const [y, m] = key.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}
function prevKey(key) {
  let [y, m] = key.split('-').map(Number);
  m--; if (m < 1) { m = 12; y--; }
  return `${y}-${String(m).padStart(2, '0')}`;
}
function nextKey(key) {
  let [y, m] = key.split('-').map(Number);
  m++; if (m > 12) { m = 1; y++; }
  return `${y}-${String(m).padStart(2, '0')}`;
}
function colorFor(index) {
  return PALETTE[index % PALETTE.length];
}

let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2500);
}

// ---------- Dostęp do danych miesiąca ----------
function getMonth(key) {
  if (!data.months[key]) {
    data.months[key] = { salary: 0, expenses: [] };
  }
  return data.months[key];
}

// Saldo na początek danego miesiąca = kwota początkowa (ustawiona raz przy rejestracji)
// powiększona o wynik (pensja − wydatki) wszystkich wcześniejszych miesięcy.
function runningStart(key) {
  let bal = Number(data.initialBalance) || 0;
  const keys = Object.keys(data.months).filter((k) => k < key).sort();
  for (const k of keys) {
    const m = data.months[k];
    const spent = (m.expenses || []).reduce((s, e) => s + (Number(e.amount) || 0), 0);
    bal += (Number(m.salary) || 0) - spent;
  }
  return bal;
}

function monthTotals(key) {
  const m = data.months[key];
  const start = runningStart(key);
  if (!m) return { spent: 0, salary: 0, start, saved: 0, balance: start };
  const spent = m.expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const salary = Number(m.salary) || 0;
  return { spent, salary, start, saved: salary - spent, balance: start + salary - spent };
}

// Zapis danych na dysk (z niewielkim opóźnieniem przy szybkim wpisywaniu)
let saveTimer = null;
function saveData(immediate = false) {
  clearTimeout(saveTimer);
  const doSave = () => window.store.save(data);
  if (immediate) doSave();
  else saveTimer = setTimeout(doSave, 400);
}

// ================= Renderowanie =================
function render() {
  const m = getMonth(currentKey);
  const t = monthTotals(currentKey);

  // Etykieta miesiąca
  $('#monthLabel').textContent = labelFromKey(currentKey);

  // Pensja – jedyne edytowalne pole (nie nadpisuj podczas edycji)
  const sal = $('#salary');
  if (document.activeElement !== sal) sal.value = m.salary || '';

  // Stan konta na start = saldo przeniesione z poprzednich miesięcy (liczone automatycznie)
  $('#startBalance').textContent = fmt(t.start);

  // Karty
  $('#totalExpenses').textContent = fmt(t.spent);
  $('#expenseCount').textContent = `${m.expenses.length} ${plural(m.expenses.length, 'pozycja', 'pozycje', 'pozycji')}`;
  $('#currentBalance').textContent = fmt(t.balance);

  const delta = t.balance - t.start; // = pensja − wydatki w tym miesiącu
  const deltaEl = $('#balanceDelta');
  const sign = delta >= 0 ? '+' : '';
  deltaEl.textContent = `Zmiana w tym miesiącu: ${sign}${fmt(delta)}`;
  deltaEl.style.color = delta >= 0 ? 'var(--green)' : 'var(--red)';

  // Ustawienia: pokazuj aktualny stan początkowy
  const ib = $('#initBalCurrent');
  if (ib) ib.textContent = fmt(data.initialBalance);

  renderImpact(t);
  renderDonut(m);
  renderList(m);
  renderMonthly();
  renderAnaliza();
}

function plural(n, one, few, many) {
  const abs = Math.abs(n) % 100;
  const n1 = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (n1 > 1 && n1 < 5) return few;
  if (n1 === 1) return one;
  return many;
}

function renderImpact(t) {
  const pct = t.salary > 0 ? Math.min(100, (t.spent / t.salary) * 100) : (t.spent > 0 ? 100 : 0);
  $('#spentPct').textContent = Math.round(pct) + '%';
  const bar = $('#spentBar');
  bar.style.width = pct + '%';
  // Kolor paska: zielony → żółty → czerwony wraz ze wzrostem wydatków
  if (pct < 60) bar.style.background = 'linear-gradient(90deg, var(--green), var(--green))';
  else if (pct < 90) bar.style.background = 'linear-gradient(90deg, var(--green), var(--yellow))';
  else bar.style.background = 'linear-gradient(90deg, var(--yellow), var(--red))';

  $('#impSpent').textContent = fmt(t.spent);
  $('#impSaved').textContent = fmt(t.saved);
  const rate = t.salary > 0 ? (t.saved / t.salary) * 100 : 0;
  const rateEl = $('#savingRate');
  rateEl.textContent = Math.round(rate) + '%';
  rateEl.style.color = rate >= 0 ? 'var(--green)' : 'var(--red)';
}

// ---------- Wykres kołowy (donut) w SVG ----------
function categoryBreakdown(m) {
  const map = {};
  for (const e of m.expenses) {
    map[e.category] = (map[e.category] || 0) + (Number(e.amount) || 0);
  }
  return Object.entries(map)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

function renderDonut(m) {
  const breakdown = categoryBreakdown(m);
  const total = breakdown.reduce((s, b) => s + b.value, 0);
  const donut = $('#donut');
  const legend = $('#donutLegend');

  if (total === 0) {
    donut.innerHTML = '';
    legend.innerHTML = '<div class="empty-hint">Brak wydatków w tym miesiącu</div>';
    return;
  }

  const r = 70, cx = 90, cy = 90, stroke = 26;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  let segments = '';

  breakdown.forEach((b, i) => {
    const frac = b.value / total;
    const len = frac * circ;
    segments += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none"
      stroke="${colorFor(i)}" stroke-width="${stroke}"
      stroke-dasharray="${len} ${circ - len}" stroke-dashoffset="${-offset}"
      transform="rotate(-90 ${cx} ${cy})"></circle>`;
    offset += len;
  });

  donut.innerHTML = `<svg viewBox="0 0 180 180" width="180" height="180">
    ${segments}
    <text x="${cx}" y="${cy - 4}" text-anchor="middle" fill="#9d94b8" font-size="11">Razem</text>
    <text x="${cx}" y="${cy + 14}" text-anchor="middle" fill="#f2eefb" font-size="15" font-weight="700">${fmt(total)}</text>
  </svg>`;

  legend.innerHTML = breakdown.map((b, i) => {
    const pct = Math.round((b.value / total) * 100);
    return `<div class="lg">
      <span class="lg-name"><span class="dot" style="background:${colorFor(i)}"></span>${escapeHtml(b.name)}</span>
      <span class="lg-val">${fmt(b.value)} · ${pct}%</span>
    </div>`;
  }).join('');
}

// ---------- Lista wydatków ----------
function renderList(m) {
  const container = $('#expenseList');
  if (m.expenses.length === 0) {
    container.innerHTML = '<div class="empty-hint">Brak wydatków. Dodaj pierwszy w formularzu powyżej.</div>';
    return;
  }

  if (listView === 'flat') {
    const sorted = [...m.expenses].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    container.innerHTML = sorted.map(itemRow).join('');
  } else {
    const breakdown = categoryBreakdown(m);
    container.innerHTML = breakdown.map((b, i) => {
      const items = m.expenses
        .filter(e => e.category === b.name)
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      return `<div class="cat-group">
        <div class="cat-group-head">
          <div class="cg-left"><span class="dot" style="background:${colorFor(i)}"></span>${escapeHtml(b.name)}
            <span class="tag">${items.length} ${plural(items.length, 'pozycja', 'pozycje', 'pozycji')}</span></div>
          <div class="cg-total">${fmt(b.value)}</div>
        </div>
        <div class="cat-group-items">${items.map(itemRow).join('')}</div>
      </div>`;
    }).join('');
  }

  // Podpięcie usuwania i edycji
  container.querySelectorAll('.del-btn').forEach(btn => {
    btn.onclick = () => deleteExpense(btn.dataset.id);
  });
  container.querySelectorAll('.edit-btn').forEach(btn => {
    btn.onclick = () => openEditModal(btn.dataset.id);
  });
}

function itemRow(e) {
  const dateStr = e.date ? new Date(e.date + 'T00:00:00').toLocaleDateString('pl-PL') : '';
  return `<div class="exp-item">
    <div class="ei-left">
      <span class="ei-name">${escapeHtml(e.name || '(bez nazwy)')}</span>
      <span class="ei-meta">${escapeHtml(e.category)}${dateStr ? ' · ' + dateStr : ''}</span>
    </div>
    <div class="ei-right">
      <span class="ei-amount">${fmt(e.amount)}</span>
      <button class="edit-btn" data-id="${e.id}" title="Edytuj" aria-label="Edytuj">&#9998;</button>
      <button class="del-btn" data-id="${e.id}" title="Usuń" aria-label="Usuń">&#10005;</button>
    </div>
  </div>`;
}

// ---------- Edycja wydatku ----------
function openEditModal(id) {
  const m = getMonth(currentKey);
  const e = m.expenses.find(x => x.id === id);
  if (!e) return;
  editingExpense = { id, key: currentKey };
  // Jeśli kategoria wpisu została usunięta z listy, nadal pokaż ją jako opcję
  const opts = data.categories.includes(e.category) ? data.categories : [e.category, ...data.categories];
  editCategoryDropdown.setOptions(opts, e.category);
  $('#editName').value = e.name || '';
  $('#editAmount').value = e.amount;
  editDatePicker.value = e.date || currentKey + '-01';
  $('#editModal').hidden = false;
}
function closeEditModal() {
  $('#editModal').hidden = true;
  editingExpense = null;
}
function saveEdit(ev) {
  ev.preventDefault();
  if (!editingExpense) return;
  const m = data.months[editingExpense.key];
  if (!m) return;
  const idx = m.expenses.findIndex(x => x.id === editingExpense.id);
  if (idx < 0) return;
  const amount = parseFloat($('#editAmount').value);
  if (isNaN(amount) || amount <= 0) { toast('Podaj poprawną kwotę'); return; }

  const e = m.expenses[idx];
  e.category = editCategoryDropdown.value || e.category;
  e.name = $('#editName').value.trim();
  e.amount = Number(amount.toFixed(2));
  e.date = editDatePicker.value || e.date;

  // Zmiana daty na inny miesiąc -> przeniesienie wpisu do właściwego miesiąca
  const newKey = (e.date || '').slice(0, 7);
  if (newKey && newKey !== editingExpense.key) {
    m.expenses.splice(idx, 1);
    getMonth(newKey).expenses.push(e);
    toast('Zapisano i przeniesiono do: ' + labelFromKey(newKey));
  } else {
    toast('Zapisano zmiany');
  }
  closeEditModal();
  saveData(true);
  render();
}

// ---------- Wykres porównania miesięcy ----------
function renderMonthly() {
  const chart = $('#monthlyChart');
  // Ostatnie 6 miesięcy do bieżącego włącznie
  const keys = [];
  let k = currentKey;
  for (let i = 0; i < 6; i++) { keys.unshift(k); k = prevKey(k); }

  const rows = keys.map(key => ({ key, ...monthTotals(key) }));
  const max = Math.max(1, ...rows.map(r => Math.max(r.salary, r.spent, Math.abs(r.saved))));
  const H = 170;

  chart.innerHTML = rows.map(r => {
    const hSal = Math.round((r.salary / max) * H);
    const hSpent = Math.round((r.spent / max) * H);
    const hSaved = Math.round((Math.max(0, r.saved) / max) * H);
    const [, mm] = r.key.split('-').map(Number);
    const isCurrent = r.key === currentKey;
    return `<div class="mc-col ${isCurrent ? 'current' : ''}">
      <div class="mc-bars">
        <div class="mc-bar b-salary" style="height:${hSal}px" title="Pensja: ${fmt(r.salary)}"></div>
        <div class="mc-bar b-spent" style="height:${hSpent}px" title="Wydatki: ${fmt(r.spent)}"></div>
        <div class="mc-bar b-saved" style="height:${hSaved}px" title="Oszczędności: ${fmt(r.saved)}"></div>
      </div>
      <div class="mc-label">${MONTH_NAMES[mm - 1].slice(0, 3)}</div>
    </div>`;
  }).join('');
}

// ================= Analiza =================
function daysInMonth(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}
function monthsRange(endKey, n) {
  const keys = [];
  let k = endKey;
  for (let i = 0; i < n; i++) { keys.unshift(k); k = prevKey(k); }
  return keys;
}
function catAmount(key, cat) {
  const m = data.months[key];
  if (!m) return 0;
  return (m.expenses || []).filter(e => e.category === cat).reduce((s, e) => s + (Number(e.amount) || 0), 0);
}
function shortMonth(key) { return MONTH_NAMES[Number(key.split('-')[1]) - 1].slice(0, 3); }

function renderAnaliza() {
  renderKPI();
  renderInsights();
  renderCatBars();
  renderDaily();
  renderCatTrend();
}

// ---------- Blok 1: KPI ----------
function kpiTile(title, val, hint, tone) {
  const cls = tone === 'g' ? 'kpi-g' : tone === 'r' ? 'kpi-r' : '';
  return `<div class="kpi ${cls}">
    <div class="kpi-title">${escapeHtml(title)}</div>
    <div class="kpi-val">${escapeHtml(val)}</div>
    <div class="kpi-hint">${escapeHtml(hint)}</div>
  </div>`;
}
function renderKPI() {
  const grid = $('#kpiGrid');
  const t = monthTotals(currentKey);
  const m = getMonth(currentKey);
  const today = new Date();
  const isCur = currentKey === keyFromDate(today);
  const dim = daysInMonth(currentKey);
  const dayNow = isCur ? today.getDate() : dim;
  const perDay = dayNow > 0 ? t.spent / dayNow : 0;
  const count = m.expenses.length;
  const avg = count > 0 ? t.spent / count : 0;
  let largest = null;
  for (const e of m.expenses) if (!largest || e.amount > largest.amount) largest = e;
  const [, mo] = currentKey.split('-');
  const byDay = monthExpensesByDay(currentKey);
  let topDay = null;
  for (const d in byDay) if (topDay === null || byDay[d].total > byDay[topDay].total) topDay = d;
  const rate = t.salary > 0 ? Math.round((t.saved / t.salary) * 100) : null;
  const pk = prevKey(currentKey);
  const prevSpent = monthTotals(pk).spent;
  const momPct = prevSpent > 0 ? ((t.spent - prevSpent) / prevSpent) * 100 : null;

  // Wszystkie kafelki liczone z realnych danych (bez prognoz/ekstrapolacji).
  const tiles = [];
  tiles.push(kpiTile('Średnio dziennie', fmt(perDay), isCur ? `po ${dayNow} ${plural(dayNow, 'dniu', 'dniach', 'dniach')}` : 'cały miesiąc'));
  tiles.push(kpiTile('Zaoszczędzono', fmt(t.saved), rate !== null ? `stopa ${rate}%` : 'pensja − wydatki', t.saved >= 0 ? 'g' : 'r'));
  tiles.push(kpiTile('Najdroższy dzień', topDay ? fmt(byDay[topDay].total) : '—', topDay ? `${String(topDay).padStart(2, '0')}.${mo}` : 'brak wydatków'));
  tiles.push(kpiTile('Największy wydatek', largest ? fmt(largest.amount) : '—', largest ? (largest.name || largest.category) : 'brak wydatków'));
  tiles.push(kpiTile('Transakcje', String(count), count > 0 ? `śr. ${fmt(avg)}` : '—'));
  if (momPct !== null) tiles.push(kpiTile('Wydatki vs poprz. mies.', (momPct >= 0 ? '+' : '') + Math.round(momPct) + '%', `było ${fmt(prevSpent)}`, momPct <= 0 ? 'g' : 'r'));
  grid.innerHTML = tiles.join('');
}

// ---------- Blok 1: Wnioski (auto-tekst) ----------
function renderInsights() {
  const el = $('#insights');
  const t = monthTotals(currentKey);
  const m = getMonth(currentKey);
  if (t.spent === 0 && t.salary === 0) {
    el.innerHTML = '<div class="insight">Dodaj pensję i wydatki, aby zobaczyć wnioski i prognozy.</div>';
    return;
  }
  const lines = [];
  const bd = categoryBreakdown(m);
  if (bd.length) {
    const top = bd[0];
    const pct = t.spent > 0 ? Math.round((top.value / t.spent) * 100) : 0;
    lines.push(`Najwięcej wydajesz na <b>${escapeHtml(top.name)}</b> — ${fmt(top.value)} (${pct}% wydatków).`);
  }
  const pk = prevKey(currentKey);
  const prevSpent = monthTotals(pk).spent;
  if (prevSpent > 0) {
    const d = t.spent - prevSpent;
    const pctd = Math.round((Math.abs(d) / prevSpent) * 100);
    lines.push(d < 0
      ? `Wydajesz o <b>${pctd}% mniej</b> niż w poprzednim miesiącu — dobra robota.`
      : `Wydajesz o <b>${pctd}% więcej</b> niż w poprzednim miesiącu.`);
  }
  const byDay = monthExpensesByDay(currentKey);
  let topDay = null;
  for (const d in byDay) if (topDay === null || byDay[d].total > byDay[topDay].total) topDay = d;
  if (topDay) {
    const [, mo] = currentKey.split('-');
    lines.push(`Najdroższy dzień to <b>${String(topDay).padStart(2, '0')}.${mo}</b> — ${fmt(byDay[topDay].total)}.`);
  }
  if (t.salary > 0) {
    const rate = Math.round((t.saved / t.salary) * 100);
    lines.push(rate >= 0
      ? `Odkładasz <b>${rate}%</b> pensji.`
      : `Uwaga: w tym miesiącu wydajesz więcej niż zarabiasz (${rate}%).`);
  }
  el.innerHTML = lines.map(l => `<div class="insight">${l}</div>`).join('');
}

// ---------- Blok 3: Kategorie z trendem vs poprzedni miesiąc ----------
function renderCatBars() {
  const el = $('#catBars');
  const m = getMonth(currentKey);
  const bd = categoryBreakdown(m);
  if (!bd.length) { el.innerHTML = ''; return; }
  const total = bd.reduce((s, b) => s + b.value, 0);
  const max = bd[0].value;
  const pk = prevKey(currentKey);
  const prevExists = !!data.months[pk];
  el.innerHTML = bd.map((b, i) => {
    const prev = catAmount(pk, b.name);
    let trend = '';
    if (prev > 0) {
      const d = ((b.value - prev) / prev) * 100;
      const up = d > 0;
      trend = `<span class="cat-trend ${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${Math.abs(Math.round(d))}%</span>`;
    } else if (prevExists && b.value > 0) {
      trend = `<span class="cat-trend up">nowe</span>`;
    }
    const w = max > 0 ? Math.round((b.value / max) * 100) : 0;
    const pct = total > 0 ? Math.round((b.value / total) * 100) : 0;
    return `<div class="cat-bar-row">
      <div class="cbr-head">
        <span class="cbr-name"><span class="dot" style="background:${colorFor(i)}"></span>${escapeHtml(b.name)}</span>
        <span class="cbr-val">${fmt(b.value)} · ${pct}%${trend}</span>
      </div>
      <div class="cbr-track"><div class="cbr-fill" style="width:${w}%;background:${colorFor(i)}"></div></div>
    </div>`;
  }).join('');
}

// ---------- Wspólny wykres liniowy (SVG) ----------
function lineChartHTML(labels, seriesList, height) {
  const H = height || 180, W = 600, padX = 6, padY = 16;
  const n = labels.length;
  let vals = [];
  seriesList.forEach(s => { vals = vals.concat(s.values); });
  let min = Math.min(0, ...vals), max = Math.max(1, ...vals);
  if (max === min) max = min + 1;
  const x = (i) => n <= 1 ? W / 2 : padX + i * (W - 2 * padX) / (n - 1);
  const y = (v) => H - padY - ((v - min) / (max - min)) * (H - 2 * padY);
  let base = '';
  if (min < 0) {
    const zy = y(0);
    base = `<line x1="0" y1="${zy}" x2="${W}" y2="${zy}" stroke="#3a2f5c" stroke-width="1" stroke-dasharray="4 4" vector-effect="non-scaling-stroke"/>`;
  }
  const paths = seriesList.map(s => {
    if (n === 1) return `<circle cx="${x(0)}" cy="${y(s.values[0])}" r="4" fill="${s.color}"/>`;
    const pts = s.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    return `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`;
  }).join('');
  const svg = `<svg class="lc-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="height:${H}px">${base}${paths}</svg>`;
  const labs = `<div class="lc-labels">${labels.map(l => `<span>${escapeHtml(l)}</span>`).join('')}</div>`;
  return svg + labs;
}

// ---------- Blok 4: Wydatki dzień po dniu ----------
// Zbiera wydatki miesiąca pogrupowane po dniu: { dzień: {total, byCat, items} }.
function monthExpensesByDay(key) {
  const m = data.months[key];
  const map = {};
  if (m) for (const e of (m.expenses || [])) {
    const day = e.date ? Number(e.date.split('-')[2]) : 1;
    if (!day) continue;
    if (!map[day]) map[day] = { total: 0, byCat: {}, items: [] };
    const v = Number(e.amount) || 0;
    map[day].total += v;
    map[day].byCat[e.category] = (map[day].byCat[e.category] || 0) + v;
    map[day].items.push(e);
  }
  return map;
}
// Domyślny zakres: bieżący miesiąc rośnie z datą (7→14→21→cały), przeszłe miesiące = cały.
function autoDailyRange(isCur, today, dim) {
  if (!isCur) return dim;
  const d = today.getDate();
  return d <= 7 ? 7 : d <= 14 ? 14 : d <= 21 ? 21 : dim;
}
function defaultDailyDay(byDay, range, isCur, today) {
  if (isCur && today.getDate() <= range && byDay[today.getDate()]) return today.getDate();
  let last = null;
  for (let d = 1; d <= range; d++) if (byDay[d]) last = d;
  return last;
}
function renderDailyChips(range, dim) {
  const chips = [{ v: 7, l: '7 dni' }, { v: 14, l: '14 dni' }, { v: 21, l: '21 dni' }, { v: 'all', l: 'Cały miesiąc' }];
  $('#dailyChips').innerHTML = chips.map(c => {
    const active = c.v === 'all' ? range >= dim : range === c.v;
    return `<button type="button" class="chip${active ? ' active' : ''}" data-range="${c.v}">${c.l}</button>`;
  }).join('');
}
function renderDaily() {
  const key = currentKey;
  const dim = daysInMonth(key);
  const byDay = monthExpensesByDay(key);
  const today = new Date();
  const isCur = key === keyFromDate(today);

  let range = dailyRange === 'all' ? dim : (dailyRange == null ? autoDailyRange(isCur, today, dim) : dailyRange);
  range = Math.min(Math.max(1, range), dim);
  renderDailyChips(range, dim);

  // kategorie obecne w zakresie (kolejność wg sumy = kolory)
  const totals = {};
  for (let d = 1; d <= range; d++) { const e = byDay[d]; if (e) for (const c in e.byCat) totals[c] = (totals[c] || 0) + e.byCat[c]; }
  const cats = Object.keys(totals).filter(c => totals[c] > 0).sort((a, b) => totals[b] - totals[a]);
  const colorOf = {}; cats.forEach((c, i) => { colorOf[c] = colorFor(i); });

  let maxDay = 1;
  for (let d = 1; d <= range; d++) { const e = byDay[d]; if (e) maxDay = Math.max(maxDay, e.total); }

  // wybrany dzień
  let sel = dailyDay;
  if (sel == null || sel > range || !byDay[sel]) sel = defaultDailyDay(byDay, range, isCur, today);

  const H = 160;
  const chart = $('#dailyChart');
  if (!cats.length) {
    chart.innerHTML = '<div class="empty-hint">Brak wydatków w tym miesiącu.</div>';
    $('#dailyLegend').innerHTML = '';
    $('#dailyDetail').innerHTML = '';
    return;
  }
  let cols = '';
  for (let d = 1; d <= range; d++) {
    const e = byDay[d];
    let segs = '';
    if (e) for (const c of cats) { const v = e.byCat[c]; if (v > 0) segs += `<div class="day-seg" style="height:${Math.max(2, Math.round(v / maxDay * H))}px;background:${colorOf[c]}"></div>`; }
    cols += `<div class="day-col${d === sel ? ' selected' : ''}" data-day="${d}" title="Dzień ${d}: ${fmt(e ? e.total : 0)}">
      <div class="day-stack" style="height:${H}px">${segs}</div>
      <div class="day-num">${d}</div>
    </div>`;
  }
  chart.innerHTML = cols;
  $('#dailyLegend').innerHTML = cats.map(c => `<div><span class="dot" style="background:${colorOf[c]}"></span> ${escapeHtml(c)}</div>`).join('');
  renderDayDetail(byDay, sel, key);
}
function renderDayDetail(byDay, day, key) {
  const el = $('#dailyDetail');
  if (day == null || !byDay[day]) {
    el.innerHTML = '<div class="day-detail-empty">Kliknij słupek dnia, aby zobaczyć podsumowanie.</div>';
    return;
  }
  const e = byDay[day];
  const [y, mo] = key.split('-');
  const cats = Object.entries(e.byCat).sort((a, b) => b[1] - a[1]);
  el.innerHTML = `<div class="dd-head"><span>Podsumowanie · ${String(day).padStart(2, '0')}.${mo}.${y}</span><b>${fmt(e.total)}</b></div>
    <div class="dd-cats">${cats.map(([c, v]) => `<div class="dd-cat"><span>${escapeHtml(c)}</span><span>${fmt(v)}</span></div>`).join('')}</div>`;
}

// ---------- Blok 5: Kategorie przez miesiące (osobne serie) ----------
function renderCatTrend() {
  const container = $('#catTrend');
  const legend = $('#catTrendLegend');
  const keys = monthsRange(currentKey, 6);
  const labels = keys.map(shortMonth);
  const totals = {};
  keys.forEach(k => {
    const m = data.months[k];
    if (m) (m.expenses || []).forEach(e => { totals[e.category] = (totals[e.category] || 0) + (Number(e.amount) || 0); });
  });
  const cats = Object.keys(totals).filter(c => totals[c] > 0).sort((a, b) => totals[b] - totals[a]).slice(0, 6);
  if (!cats.length) {
    container.innerHTML = '<div class="empty-hint">Brak wydatków w tym okresie.</div>';
    legend.innerHTML = '';
    return;
  }
  const series = cats.map((c, i) => ({ color: colorFor(i), values: keys.map(k => catAmount(k, c)) }));
  container.innerHTML = lineChartHTML(labels, series, 190);
  legend.innerHTML = cats.map((c, i) => `<div><span class="dot" style="background:${colorFor(i)}"></span> ${escapeHtml(c)}</div>`).join('');
}

// ---------- Własny dropdown (wielokrotnego użytku) ----------
// Zastępuje natywny <select>, żeby całą listę (także rozwiniętą) dało się ostylować.
function createDropdown(root) {
  const trigger = root.querySelector('.dd-trigger');
  const labelEl = root.querySelector('.dd-label');
  const panel = root.querySelector('.dd-panel');
  let options = [];
  let value = null;
  let activeIndex = -1;

  function renderPanel() {
    panel.innerHTML = options.map((opt, i) =>
      `<div class="dd-option${opt === value ? ' selected' : ''}" role="option" data-i="${i}">${escapeHtml(opt)}</div>`
    ).join('');
  }
  function highlight() {
    [...panel.children].forEach((c, i) => c.classList.toggle('active', i === activeIndex));
    const el = panel.children[activeIndex];
    if (el) el.scrollIntoView({ block: 'nearest' });
  }
  function open() {
    if (!options.length) return;
    renderPanel();
    panel.hidden = false;
    root.classList.add('open');
    trigger.setAttribute('aria-expanded', 'true');
    activeIndex = Math.max(0, options.indexOf(value));
    highlight();
    document.addEventListener('click', onDocClick, true);
    document.addEventListener('keydown', onKey);
  }
  function close() {
    panel.hidden = true;
    root.classList.remove('open');
    trigger.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', onDocClick, true);
    document.removeEventListener('keydown', onKey);
  }
  function choose(v) { value = v; labelEl.textContent = v != null ? v : '—'; close(); }
  function onDocClick(e) { if (!root.contains(e.target)) close(); }
  function onKey(e) {
    if (e.key === 'Escape') { close(); trigger.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); activeIndex = Math.min(options.length - 1, activeIndex + 1); highlight(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); activeIndex = Math.max(0, activeIndex - 1); highlight(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (options[activeIndex] != null) choose(options[activeIndex]); }
  }
  trigger.addEventListener('click', () => { root.classList.contains('open') ? close() : open(); });
  panel.addEventListener('click', (e) => {
    const opt = e.target.closest('.dd-option');
    if (opt) choose(options[Number(opt.dataset.i)]);
  });

  return {
    setOptions(opts, selected) {
      options = opts.slice();
      if (selected != null && options.includes(selected)) value = selected;
      else if (!options.includes(value)) value = options.length ? options[0] : null;
      labelEl.textContent = value != null ? value : '—';
      if (!panel.hidden) { renderPanel(); highlight(); }
    },
    get value() { return value; },
    set value(v) { if (options.includes(v)) { value = v; labelEl.textContent = v; } }
  };
}

let categoryDropdown = null;

// ---------- Własny date picker (kalendarz w motywie aplikacji) ----------
function createDatePicker(root) {
  const trigger = root.querySelector('.dp-trigger');
  const labelEl = root.querySelector('.dp-label');
  const panel = root.querySelector('.dp-panel');
  let value = null;           // 'RRRR-MM-DD'
  let viewY = 0, viewM = 0;   // wyświetlany rok / miesiąc (1-12)
  const WEEK = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'];

  function fmtLabel(v) { if (!v) return '—'; const [y, m, d] = v.split('-'); return `${d}.${m}.${y}`; }
  function todayStr() { const t = new Date(); return keyFromDate(t) + '-' + String(t.getDate()).padStart(2, '0'); }

  function renderPanel() {
    const first = new Date(viewY, viewM - 1, 1);
    const dim = new Date(viewY, viewM, 0).getDate();
    const lead = (first.getDay() + 6) % 7; // 0 = poniedziałek
    const tStr = todayStr();
    let cells = '';
    for (let i = 0; i < lead; i++) cells += '<span class="dp-cell empty"></span>';
    for (let d = 1; d <= dim; d++) {
      const ds = `${viewY}-${String(viewM).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const cls = ['dp-cell'];
      if (ds === value) cls.push('selected');
      if (ds === tStr) cls.push('today');
      cells += `<button type="button" class="${cls.join(' ')}" data-date="${ds}">${d}</button>`;
    }
    panel.innerHTML = `
      <div class="dp-head">
        <button type="button" class="dp-nav" data-nav="-1">◀</button>
        <div class="dp-title">${MONTH_NAMES[viewM - 1]} ${viewY}</div>
        <button type="button" class="dp-nav" data-nav="1">▶</button>
      </div>
      <div class="dp-week">${WEEK.map(w => `<span>${w}</span>`).join('')}</div>
      <div class="dp-grid">${cells}</div>`;
  }
  function open() {
    const base = value || todayStr();
    const [y, m] = base.split('-').map(Number);
    viewY = y; viewM = m;
    renderPanel();
    panel.hidden = false;
    root.classList.add('open');
    // Gdy brakuje miejsca pod polem — otwórz kalendarz w górę
    const rect = trigger.getBoundingClientRect();
    panel.classList.toggle('up', (window.innerHeight - rect.bottom) < 370);
    document.addEventListener('click', onDoc, true);
    document.addEventListener('keydown', onKey);
  }
  function close() {
    panel.hidden = true;
    root.classList.remove('open');
    document.removeEventListener('click', onDoc, true);
    document.removeEventListener('keydown', onKey);
  }
  function onDoc(e) { if (!root.contains(e.target)) close(); }
  function onKey(e) { if (e.key === 'Escape') close(); }

  trigger.addEventListener('click', () => { root.classList.contains('open') ? close() : open(); });
  panel.addEventListener('click', (e) => {
    const nav = e.target.closest('.dp-nav');
    if (nav) {
      viewM += Number(nav.dataset.nav);
      if (viewM < 1) { viewM = 12; viewY--; }
      if (viewM > 12) { viewM = 1; viewY++; }
      renderPanel();
      return;
    }
    const cell = e.target.closest('.dp-cell[data-date]');
    if (cell) { value = cell.dataset.date; labelEl.textContent = fmtLabel(value); close(); }
  });

  return {
    get value() { return value; },
    set value(v) { value = v || null; labelEl.textContent = fmtLabel(value); }
  };
}

// ---------- Kategorie (dropdown + modal) ----------
function renderCategorySelect() {
  if (!categoryDropdown) categoryDropdown = createDropdown($('#expCategory'));
  const prev = categoryDropdown.value;
  categoryDropdown.setOptions(data.categories, data.categories.includes(prev) ? prev : data.categories[0]);
}

function renderCatModalList() {
  const ul = $('#catList');
  ul.innerHTML = data.categories.map(c => {
    if (c === editingCat) {
      return `<li class="editing">
        <input type="text" id="catRenameInput" value="${escapeHtml(c)}" />
        <span class="cat-item-actions">
          <button class="cat-save" data-cat="${escapeHtml(c)}">Zapisz</button>
          <button class="del-btn cat-cancel" title="Anuluj" aria-label="Anuluj">&#10005;</button>
        </span>
      </li>`;
    }
    return `<li>
      <span>${escapeHtml(c)}</span>
      <span class="cat-item-actions">
        <button class="edit-btn" data-cat="${escapeHtml(c)}" title="Zmień nazwę" aria-label="Zmień nazwę">&#9998;</button>
        <button class="del-btn" data-cat="${escapeHtml(c)}" title="Usuń" aria-label="Usuń">&#10005;</button>
      </span>
    </li>`;
  }).join('');

  // Usuwanie
  ul.querySelectorAll('.del-btn:not(.cat-cancel)').forEach(btn => {
    btn.onclick = () => {
      const cat = btn.dataset.cat;
      const used = Object.values(data.months).some(m => m.expenses.some(e => e.category === cat));
      if (used && !confirm(`Kategoria "${cat}" jest używana w istniejących wydatkach. Usunąć mimo to? (wydatki pozostaną z tą nazwą)`)) return;
      data.categories = data.categories.filter(c => c !== cat);
      saveData();
      renderCategorySelect(); renderCatModalList();
      toast('Usunięto kategorię');
    };
  });
  // Zmiana nazwy — wejście w tryb edycji
  ul.querySelectorAll('.edit-btn').forEach(btn => {
    btn.onclick = () => {
      editingCat = btn.dataset.cat;
      renderCatModalList();
      const input = $('#catRenameInput');
      if (input) { input.focus(); input.select(); }
    };
  });
  const saveBtn = ul.querySelector('.cat-save');
  if (saveBtn) saveBtn.onclick = () => renameCategory(saveBtn.dataset.cat);
  const cancelBtn = ul.querySelector('.cat-cancel');
  if (cancelBtn) cancelBtn.onclick = () => { editingCat = null; renderCatModalList(); };
  const input = $('#catRenameInput');
  if (input) input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); renameCategory(editingCat); }
    if (e.key === 'Escape') { editingCat = null; renderCatModalList(); }
  });
}

// Zmiana nazwy kategorii aktualizuje też wszystkie istniejące wydatki.
function renameCategory(oldName) {
  const input = $('#catRenameInput');
  const newName = (input ? input.value : '').trim();
  if (!newName) { toast('Podaj nazwę'); return; }
  if (newName === oldName) { editingCat = null; renderCatModalList(); return; }
  if (data.categories.some(c => c !== oldName && c.toLowerCase() === newName.toLowerCase())) {
    toast('Taka kategoria już istnieje');
    return;
  }
  data.categories = data.categories.map(c => (c === oldName ? newName : c));
  for (const k in data.months) {
    for (const e of (data.months[k].expenses || [])) if (e.category === oldName) e.category = newName;
  }
  editingCat = null;
  saveData(true);
  renderCategorySelect();
  renderCatModalList();
  render();
  toast('Zmieniono nazwę kategorii');
}

// ---------- Operacje ----------
function addExpense(ev) {
  ev.preventDefault();
  const category = categoryDropdown ? categoryDropdown.value : null;
  const name = $('#expName').value.trim();
  const amount = parseFloat($('#expAmount').value);
  const date = (expDatePicker && expDatePicker.value) ? expDatePicker.value : currentKey + '-01';

  if (!category) { toast('Wybierz kategorię'); return; }
  if (isNaN(amount) || amount <= 0) { toast('Podaj poprawną kwotę'); return; }

  // Wydatek trafia do miesiąca wynikającego z wybranej daty (nie zawsze bieżącego).
  const bucketKey = date.slice(0, 7);
  getMonth(bucketKey).expenses.push({
    id: 'e' + Date.now() + Math.floor(performance.now() * 1000 % 1000),
    category, name, amount: Number(amount.toFixed(2)), date
  });
  saveData(true);

  // Wyczyść formularz (poza kategorią i datą)
  $('#expName').value = '';
  $('#expAmount').value = '';
  $('#expName').focus();
  render();
  toast(bucketKey !== currentKey ? 'Dodano do: ' + labelFromKey(bucketKey) : 'Dodano wydatek');
}

function deleteExpense(id) {
  const m = getMonth(currentKey);
  m.expenses = m.expenses.filter(e => e.id !== id);
  saveData(true);
  render();
  toast('Usunięto wydatek');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ================= Inicjalizacja =================
// Aplikacja jest uruchamiana przez warstwę chmury (cloud.js) dopiero po zalogowaniu:
//   • App.start(dane)      – pierwsze uruchomienie z danymi z chmury,
//   • App.applyRemote(dane) – nadeszła zmiana z innego urządzenia (synchronizacja na żywo).
let eventsBound = false;

window.App = {
  start(initialData) {
    data = initialData || { version: 1, initialBalance: 0, categories: [], months: {} };
    if (!data.categories || data.categories.length === 0) {
      data.categories = ['Jedzenie', 'Transport', 'Rachunki', 'Rozrywka', 'Zdrowie', 'Ubrania', 'Inne'];
    }
    if (typeof data.initialBalance !== 'number') data.initialBalance = 0;

    currentKey = keyFromDate(new Date());

    window.store.getPath().then(p => { $('#dataPath').textContent = p; });

    // Bez Electron nie ma folderu na dysku — ukryj przycisk
    if (!window.store.isElectron) {
      const of = $('#openFolder');
      if (of) of.hidden = true;
    }

    // Komponenty formularzy (kalendarze + dropdown edycji) — inicjalizacja raz
    if (!expDatePicker) expDatePicker = createDatePicker($('#expDate'));
    if (!editDatePicker) editDatePicker = createDatePicker($('#editDate'));
    if (!editCategoryDropdown) editCategoryDropdown = createDropdown($('#editCategory'));
    const now = new Date();
    expDatePicker.value = keyFromDate(now) + '-' + String(now.getDate()).padStart(2, '0');

    renderCategorySelect();
    render();

    if (!eventsBound) { bindEvents(); eventsBound = true; }
  },

  // Zmiana przyszła z innego urządzenia — podmień dane i odśwież widok.
  applyRemote(newData) {
    data = newData;
    renderCategorySelect();
    render();
  }
};

// Przełączanie widoków (zakładek) z dolnej nawigacji.
function showView(name) {
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + name));
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
  const mn = $('#monthNav');
  if (mn) mn.hidden = (name === 'ustawienia'); // miesiąc nieistotny w ustawieniach
  window.scrollTo(0, 0);
}

function bindEvents() {
  $('#prevMonth').onclick = () => { currentKey = prevKey(currentKey); dailyRange = null; dailyDay = null; syncFormDate(); render(); };
  $('#nextMonth').onclick = () => { currentKey = nextKey(currentKey); dailyRange = null; dailyDay = null; syncFormDate(); render(); };

  // Rozbicie dzienne: wybór zakresu i klik na dzień
  $('#dailyChips').addEventListener('click', (e) => {
    const c = e.target.closest('.chip');
    if (!c) return;
    dailyRange = c.dataset.range === 'all' ? 'all' : Number(c.dataset.range);
    dailyDay = null;
    renderDaily();
  });
  $('#dailyChart').addEventListener('click', (e) => {
    const col = e.target.closest('.day-col');
    if (!col) return;
    dailyDay = Number(col.dataset.day);
    renderDaily();
  });

  $('#salary').addEventListener('input', (e) => {
    getMonth(currentKey).salary = parseFloat(e.target.value) || 0;
    saveData();
    // Pełne odświeżenie (render nie nadpisze aktywnego pola pensji — jest chronione).
    render();
  });

  $('#expenseForm').addEventListener('submit', addExpense);

  // Przełącznik widoku listy
  document.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      listView = btn.dataset.view;
      renderList(getMonth(currentKey));
    };
  });

  // Nawigacja między widokami
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.onclick = () => showView(btn.dataset.view);
  });

  // Modal kategorii (z formularza ⚙ oraz z Ustawień)
  const openCatsModal = () => { editingCat = null; renderCatModalList(); $('#catModal').hidden = false; };
  $('#manageCats').onclick = openCatsModal;
  $('#openCats').onclick = openCatsModal;
  $('#closeCatModal').onclick = () => { $('#catModal').hidden = true; editingCat = null; };

  // Modal edycji wydatku
  $('#editForm').addEventListener('submit', saveEdit);
  $('#closeEditModal').onclick = closeEditModal;
  $('#editModal').addEventListener('click', (e) => { if (e.target.id === 'editModal') closeEditModal(); });

  // Stan początkowy (Ustawienia)
  $('#initBalSave').onclick = () => {
    const v = parseFloat($('#initBalInput').value);
    if (isNaN(v)) { toast('Podaj poprawną kwotę'); return; }
    data.initialBalance = Number(v.toFixed(2));
    $('#initBalInput').value = '';
    saveData(true);
    render();
    toast('Zapisano stan początkowy');
  };
  $('#catModal').addEventListener('click', (e) => { if (e.target.id === 'catModal') $('#catModal').hidden = true; });
  $('#addCatBtn').onclick = addCategory;
  $('#newCatName').addEventListener('keydown', (e) => { if (e.key === 'Enter') addCategory(); });

  // Stopka: folder / eksport / import
  $('#openFolder').onclick = () => window.store.openFolder();
  $('#exportBtn').onclick = async () => {
    const res = await window.store.exportData(data);
    if (res.ok) toast('Wyeksportowano kopię danych');
  };
  $('#importBtn').onclick = async () => {
    if (!confirm('Import zastąpi obecne dane. Kontynuować?')) return;
    const res = await window.store.importData();
    if (res.ok) {
      data = res.data;
      renderCategorySelect();
      render();
      toast('Zaimportowano dane');
    } else if (res.error) {
      toast('Błąd importu: ' + res.error);
    }
  };
}

function addCategory() {
  const input = $('#newCatName');
  const name = input.value.trim();
  if (!name) return;
  if (data.categories.some(c => c.toLowerCase() === name.toLowerCase())) {
    toast('Taka kategoria już istnieje');
    return;
  }
  data.categories.push(name);
  saveData();
  input.value = '';
  renderCategorySelect();
  renderCatModalList();
  if (categoryDropdown) categoryDropdown.value = name;
  toast('Dodano kategorię');
}

// Ustaw datę formularza na wybrany miesiąc (dzień 1) przy zmianie miesiąca
function syncFormDate() {
  if (expDatePicker) expDatePicker.value = currentKey + '-01';
}
