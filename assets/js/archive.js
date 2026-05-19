// SteelLab — Research Archive: filter, search, sort, paginate

const PAGE_SIZE = 30;

const state = {
  all: [],
  filtered: [],
  page: 1,
  sort: 'date_desc',
  q: '',
  selected: { cat: new Set(), author: new Set(), year: new Set() },
};

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

const fmtDate = d => (d || '').slice(0, 10).replace(/-/g, '.');

async function load() {
  const res = await fetch('../assets/data/articles.json');
  state.all = await res.json();
  buildFilters();
  bindEvents();
  applyFromURL();
  render();
}

function uniqueCounts(items, key) {
  const m = new Map();
  for (const it of items) {
    const v = it[key] || '미지정';
    m.set(v, (m.get(v) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function buildFilters() {
  const cats = uniqueCounts(state.all, 'sub_category');
  const authors = uniqueCounts(state.all, 'author_key');
  const years = uniqueCounts(state.all, 'year').sort((a, b) => (b[0] || '').localeCompare(a[0] || ''));

  const mk = (group, items) => items.map(([val, n]) => `
    <label>
      <span style="display:flex;align-items:center;gap:6px;">
        <input type="checkbox" data-group="${group}" value="${val.replace(/"/g, '&quot;')}">
        <span>${val}</span>
      </span>
      <span class="n">${n}</span>
    </label>
  `).join('');

  $('#f-cat').innerHTML = mk('cat', cats);
  $('#f-author').innerHTML = mk('author', authors);
  $('#f-year').innerHTML = mk('year', years);
}

function bindEvents() {
  $('#q').addEventListener('input', e => {
    state.q = e.target.value.trim().toLowerCase();
    state.page = 1;
    render();
    syncURL();
  });
  $('#sort').addEventListener('change', e => {
    state.sort = e.target.value;
    render();
    syncURL();
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.matches('input[type="checkbox"][data-group]')) {
      const g = t.dataset.group;
      const v = t.value;
      const s = state.selected[g];
      if (t.checked) s.add(v); else s.delete(v);
      state.page = 1;
      render();
      syncURL();
    }
  });
  document.addEventListener('click', e => {
    const t = e.target;
    if (t.matches('[data-clear]')) {
      const g = t.dataset.clear;
      state.selected[g].clear();
      $$(`input[data-group="${g}"]`).forEach(cb => cb.checked = false);
      state.page = 1;
      render();
      syncURL();
    }
    if (t.matches('[data-remove]')) {
      const [g, v] = t.dataset.remove.split('::');
      state.selected[g].delete(v);
      const cb = $$(`input[data-group="${g}"]`).find(c => c.value === v);
      if (cb) cb.checked = false;
      state.page = 1;
      render();
      syncURL();
    }
    if (t.matches('.pager button[data-page]')) {
      state.page = parseInt(t.dataset.page, 10);
      render();
      window.scrollTo({ top: $('.archive-main').offsetTop - 80, behavior: 'smooth' });
      syncURL();
    }
  });
}

function filter() {
  const { q, selected } = state;
  return state.all.filter(a => {
    if (selected.cat.size && !selected.cat.has(a.sub_category)) return false;
    if (selected.author.size && !selected.author.has(a.author_key)) return false;
    if (selected.year.size && !selected.year.has(a.year)) return false;
    if (q) {
      const hay = (a.title + ' ' + (a.author || '') + ' ' + a.sub_category).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function sort(items) {
  const cp = items.slice();
  switch (state.sort) {
    case 'date_asc':  cp.sort((a, b) => (a.date || '').localeCompare(b.date || '')); break;
    case 'title':     cp.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'ko')); break;
    case 'author':    cp.sort((a, b) => (a.author_key || '').localeCompare(b.author_key || '', 'ko')); break;
    case 'date_desc':
    default:          cp.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }
  return cp;
}

function render() {
  let items = filter();
  items = sort(items);
  state.filtered = items;

  $('#count').textContent = items.length.toLocaleString();
  renderActiveTags();

  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (state.page > pages) state.page = pages;
  const start = (state.page - 1) * PAGE_SIZE;
  const slice = items.slice(start, start + PAGE_SIZE);

  if (!slice.length) {
    $('#list').innerHTML = `<div style="padding:60px 0;text-align:center;color:var(--c-text-muted);">조건에 맞는 자료가 없습니다.</div>`;
  } else {
    $('#list').innerHTML = slice.map(a => `
      <a class="article-row" href="${a.url}" target="_blank" rel="noopener">
        <span class="tag">${a.sub_category}</span>
        <span class="title">${a.title}</span>
        <span class="meta">${a.author || ''}</span>
        <span class="date">${fmtDate(a.date)}</span>
      </a>
    `).join('');
  }

  renderPager(pages);
}

function renderActiveTags() {
  const tags = [];
  for (const g of ['cat', 'author', 'year']) {
    const label = { cat: '카테고리', author: '필진', year: '연도' }[g];
    for (const v of state.selected[g]) {
      tags.push(`<span class="active-tag">${label}: ${v}<button data-remove="${g}::${v}" aria-label="제거">×</button></span>`);
    }
  }
  if (state.q) {
    tags.push(`<span class="active-tag">검색: "${state.q}"<button id="clear-q" aria-label="제거">×</button></span>`);
  }
  $('#active-tags').innerHTML = tags.join('');
  const clearQ = $('#clear-q');
  if (clearQ) clearQ.addEventListener('click', () => {
    state.q = '';
    $('#q').value = '';
    state.page = 1;
    render();
    syncURL();
  });
}

function renderPager(pages) {
  if (pages <= 1) { $('#pager').innerHTML = ''; return; }
  const cur = state.page;
  const html = [];
  html.push(`<button data-page="${Math.max(1, cur - 1)}" ${cur === 1 ? 'disabled' : ''}>‹</button>`);

  const win = [];
  const push = n => win.includes(n) ? null : win.push(n);
  push(1);
  for (let i = cur - 2; i <= cur + 2; i++) if (i > 1 && i < pages) push(i);
  push(pages);

  win.sort((a, b) => a - b);
  for (let i = 0; i < win.length; i++) {
    if (i > 0 && win[i] - win[i - 1] > 1) html.push(`<button disabled>…</button>`);
    html.push(`<button data-page="${win[i]}" class="${win[i] === cur ? 'active' : ''}">${win[i]}</button>`);
  }
  html.push(`<button data-page="${Math.min(pages, cur + 1)}" ${cur === pages ? 'disabled' : ''}>›</button>`);
  $('#pager').innerHTML = html.join('');
}

// ===== URL sync =====
function syncURL() {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.sort !== 'date_desc') params.set('sort', state.sort);
  if (state.page > 1) params.set('p', state.page);
  for (const g of ['cat', 'author', 'year']) {
    if (state.selected[g].size) params.set(g, [...state.selected[g]].join('|'));
  }
  const url = params.toString() ? '?' + params.toString() : location.pathname;
  history.replaceState(null, '', url);
}

function applyFromURL() {
  const p = new URLSearchParams(location.search);
  state.q = p.get('q') || '';
  state.sort = p.get('sort') || 'date_desc';
  state.page = parseInt(p.get('p') || '1', 10);
  for (const g of ['cat', 'author', 'year']) {
    const v = p.get(g);
    if (v) {
      v.split('|').forEach(x => state.selected[g].add(x));
    }
  }
  $('#q').value = state.q;
  $('#sort').value = state.sort;
  $$('input[data-group]').forEach(cb => {
    if (state.selected[cb.dataset.group].has(cb.value)) cb.checked = true;
  });
}

load();
