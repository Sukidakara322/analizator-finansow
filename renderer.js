// ================= Analizator Finansów – logika interfejsu =================

let data = { version: 1, categories: [], months: {} };
let currentKey = null;      // klucz aktualnego miesiąca "RRRR-MM"
let listView = 'grouped';   // widok listy: 'grouped' | 'flat'

const MONTH_NAMES = [
  'styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec',
  'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'
];

// Kolory kategorii (przypisywane cyklicznie wg indeksu)
const PALETTE = ['#4f8cff', '#35d07f', '#ff6b6b', '#ffc15c', '#b98cff', '#4fd1c5', '#f78fb3', '#f6a14b', '#8ac6ff', '#a0e57f'];

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
    data.months[key] = { startingBalance: 0, salary: 0, expenses: [] };
  }
  return data.months[key];
}

function monthTotals(key) {
  const m = data.months[key];
  if (!m) return { spent: 0, salary: 0, start: 0, saved: 0, balance: 0 };
  const spent = m.expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const salary = Number(m.salary) || 0;
  const start = Number(m.startingBalance) || 0;
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

  // Pola wejściowe (nie nadpisuj podczas edycji tego samego pola)
  const sb = $('#startingBalance');
  const sal = $('#salary');
  if (document.activeElement !== sb) sb.value = m.startingBalance || '';
  if (document.activeElement !== sal) sal.value = m.salary || '';

  // Podpowiedź o przeniesieniu salda z poprzedniego miesiąca
  const pk = prevKey(currentKey);
  const carryHint = $('#carryHint');
  if (data.months[pk]) {
    const prevBal = monthTotals(pk).balance;
    carryHint.innerHTML = `Saldo z poprzedniego mies.: <b>${fmt(prevBal)}</b> · <a href="#" id="applyCarry">przenieś</a>`;
    const link = $('#applyCarry');
    if (link) link.onclick = (e) => {
      e.preventDefault();
      m.startingBalance = Number(prevBal.toFixed(2));
      saveData(); render();
      toast('Przeniesiono saldo z poprzedniego miesiąca');
    };
  } else {
    carryHint.textContent = 'Wpisz stan konta na początek miesiąca';
  }

  // Karty
  $('#totalExpenses').textContent = fmt(t.spent);
  $('#expenseCount').textContent = `${m.expenses.length} ${plural(m.expenses.length, 'pozycja', 'pozycje', 'pozycji')}`;
  $('#currentBalance').textContent = fmt(t.balance);

  const delta = t.balance - t.start;
  const deltaEl = $('#balanceDelta');
  const sign = delta >= 0 ? '+' : '';
  deltaEl.textContent = `Zmiana od startu: ${sign}${fmt(delta)}`;
  deltaEl.style.color = delta >= 0 ? 'var(--green)' : 'var(--red)';

  renderImpact(t);
  renderDonut(m);
  renderList(m);
  renderMonthly();
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
    <text x="${cx}" y="${cy - 4}" text-anchor="middle" fill="#8a95ad" font-size="11">Razem</text>
    <text x="${cx}" y="${cy + 14}" text-anchor="middle" fill="#e8ecf4" font-size="15" font-weight="700">${fmt(total)}</text>
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
    container.innerHTML = '<div class="empty-hint">Brak wydatków. Dodaj pierwszy powyżej. 👆</div>';
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

  // Podpięcie usuwania
  container.querySelectorAll('.del-btn').forEach(btn => {
    btn.onclick = () => deleteExpense(btn.dataset.id);
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
      <button class="del-btn" data-id="${e.id}" title="Usuń">🗑</button>
    </div>
  </div>`;
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

// ---------- Kategorie (select + modal) ----------
function renderCategorySelect() {
  const sel = $('#expCategory');
  const prev = sel.value;
  sel.innerHTML = data.categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  if (data.categories.includes(prev)) sel.value = prev;
}

function renderCatModalList() {
  const ul = $('#catList');
  ul.innerHTML = data.categories.map(c => `<li>
    <span>${escapeHtml(c)}</span>
    <button class="del-btn" data-cat="${escapeHtml(c)}" title="Usuń">🗑</button>
  </li>`).join('');
  ul.querySelectorAll('.del-btn').forEach(btn => {
    btn.onclick = () => {
      const cat = btn.dataset.cat;
      // Sprawdź, czy kategoria jest używana w bieżącym miesiącu
      const used = Object.values(data.months).some(m => m.expenses.some(e => e.category === cat));
      if (used && !confirm(`Kategoria "${cat}" jest używana w istniejących wydatkach. Usunąć mimo to? (wydatki pozostaną z tą nazwą)`)) return;
      data.categories = data.categories.filter(c => c !== cat);
      saveData();
      renderCategorySelect(); renderCatModalList();
      toast('Usunięto kategorię');
    };
  });
}

// ---------- Operacje ----------
function addExpense(ev) {
  ev.preventDefault();
  const category = $('#expCategory').value;
  const name = $('#expName').value.trim();
  const amount = parseFloat($('#expAmount').value);
  const date = $('#expDate').value || currentKey + '-01';

  if (!category) { toast('Wybierz kategorię'); return; }
  if (isNaN(amount) || amount <= 0) { toast('Podaj poprawną kwotę'); return; }

  const m = getMonth(currentKey);
  m.expenses.push({
    id: 'e' + Date.now() + Math.floor(performance.now() * 1000 % 1000),
    category, name, amount: Number(amount.toFixed(2)), date
  });
  saveData(true);

  // Wyczyść formularz (poza kategorią i datą)
  $('#expName').value = '';
  $('#expAmount').value = '';
  $('#expName').focus();
  render();
  toast('Dodano wydatek');
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
    data = initialData || { version: 1, categories: [], months: {} };
    if (!data.categories || data.categories.length === 0) {
      data.categories = ['Jedzenie', 'Transport', 'Rachunki', 'Rozrywka', 'Zdrowie', 'Ubrania', 'Inne'];
    }

    currentKey = keyFromDate(new Date());

    window.store.getPath().then(p => { $('#dataPath').textContent = p; });

    // Bez Electron nie ma folderu na dysku — ukryj przycisk
    if (!window.store.isElectron) {
      const of = $('#openFolder');
      if (of) of.hidden = true;
    }

    $('#expDate').value = new Date().toISOString().slice(0, 10);

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

function bindEvents() {
  $('#prevMonth').onclick = () => { currentKey = prevKey(currentKey); syncFormDate(); render(); };
  $('#nextMonth').onclick = () => { currentKey = nextKey(currentKey); syncFormDate(); render(); };

  $('#startingBalance').addEventListener('input', (e) => {
    getMonth(currentKey).startingBalance = parseFloat(e.target.value) || 0;
    saveData();
    // Odśwież tylko liczone wartości (bez nadpisania pola)
    const t = monthTotals(currentKey);
    $('#currentBalance').textContent = fmt(t.balance);
    const delta = t.balance - t.start;
    $('#balanceDelta').textContent = `Zmiana od startu: ${delta >= 0 ? '+' : ''}${fmt(delta)}`;
    $('#balanceDelta').style.color = delta >= 0 ? 'var(--green)' : 'var(--red)';
    renderMonthly();
  });

  $('#salary').addEventListener('input', (e) => {
    getMonth(currentKey).salary = parseFloat(e.target.value) || 0;
    saveData();
    const t = monthTotals(currentKey);
    $('#currentBalance').textContent = fmt(t.balance);
    renderImpact(t);
    renderMonthly();
    const delta = t.balance - t.start;
    $('#balanceDelta').textContent = `Zmiana od startu: ${delta >= 0 ? '+' : ''}${fmt(delta)}`;
    $('#balanceDelta').style.color = delta >= 0 ? 'var(--green)' : 'var(--red)';
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

  // Modal kategorii
  $('#manageCats').onclick = () => { renderCatModalList(); $('#catModal').hidden = false; };
  $('#closeCatModal').onclick = () => { $('#catModal').hidden = true; };
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
  $('#expCategory').value = name;
  toast('Dodano kategorię');
}

// Ustaw datę formularza na wybrany miesiąc (dzień 1) przy zmianie miesiąca
function syncFormDate() {
  $('#expDate').value = currentKey + '-01';
}
