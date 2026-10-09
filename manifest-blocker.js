(() => {
  'use strict';
  // manifest blocker: tralala edition — x'in kendi formunu kullanır. harici kod/istek yok.
  // https://x.com/settings/muted_keywords açıkken Console'a tamamını yapıştırın.
  const KEY = 'manifest-blocker:v1';
  const ROOT_ID = 'manifest-blocker-panel';
  const VERSION = '2.0.0';
  const lower = value => String(value ?? '').toLocaleLowerCase('tr-TR');
  const notifyUser = message => window.alert(lower(message));
  if (!/^(www\.)?(x|twitter)\.com$/.test(location.hostname) ||
      location.pathname.replace(/\/$/, '') !== '/settings/muted_keywords') {
    notifyUser('Önce https://x.com/settings/muted_keywords sayfasını açın; ardından kodu tekrar yapıştırın.');
    return;
  }
  const previous = window.manifestblocker || window.ManifestBlocker;
  if (previous?.show) {
    if (previous.version === VERSION) { previous.show(); return; }
    if (typeof previous.status !== 'function' || previous.status().busy) {
      notifyUser('Eski panel çalışıyor. Önce Durdur’a basıp durmasını bekleyin; sonra yeni kodu yapıştırın.'); return;
    }
    previous.dismiss?.();
    if (window.manifestblocker === previous || window.ManifestBlocker === previous) {
      notifyUser('Eski panel kaldırılamadı. X sayfasını yenileyip yeni kodu yapıştırın.'); return;
    }
  }
  if (document.getElementById(ROOT_ID)) {
    notifyUser('Eski panel hâlâ açık. Sayfayı yenileyip tekrar yapıştırın.'); return;
  }

  const WORDS = [
    'manifest', 'manifest grubu', 'manifestgirlband', 'manifestival', 'manifam',
    'manifamily', 'big5 türkiye', 'big5turkiye', 'esin bahat', 'hilal yelekçi',
    'lidya pınar', 'mina solak', 'sueda uluca', 'zeynep sude oktay', 'zeynep oktay',
    'zoktay', 'zamansızdık', 'arıyo', 'yaşanacaksa', 'manifestival deluxe',
    'başrol sensin', 'toz pembe', 'manifesttr', 'manifest türkiye', 'manifest turkiye',
    'manifest edit', 'manifest fancam', 'manifest konser', 'manifest kızları',
    'manifest kizlari', 'manifest fandom'
  ];
  const BROAD = new Set(['manifest', 'zamansızdık', 'arıyo', 'yaşanacaksa', 'başrol sensin', 'toz pembe']);
  // X değişirse güncellenebilecek, dar kapsamlı işaretler. Rastgele düğmelere tıklanmaz.
  const SEL = {
    add: 'a[href="/settings/add_muted_keyword"], [data-testid="addMutedWord"]',
    rows: 'a[href*="/settings/muted_keywords/"], [data-testid="mutedKeyword"], [data-testid="mutedKeywordRow"], [data-testid="mutedWord"]',
    input: 'input[name="keyword"], input[name="muted_keyword"], input[data-testid="keywordInput"]',
    save: '[data-testid="settingsSave"], [data-testid="settingsDetailSave"]'
  };
  const tidy = s => String(s ?? '').normalize('NFC').trim().replace(/\s+/g, ' ');
  const fold = s => tidy(s).toLowerCase().replace(/\u0307/g, '');
  const equal = (a, b) => fold(a) === fold(b) || tidy(a).toLocaleLowerCase('tr-TR') === tidy(b).toLocaleLowerCase('tr-TR');
  const has = (set, term) => [...set].some(s => equal(s, term));
  let saved = {};
  try { saved = JSON.parse(sessionStorage.getItem(KEY) || '{}') || {}; } catch {}
  const items = WORDS.map(word => ({ word, selected: Array.isArray(saved.selected) ? saved.selected.includes(word) : !BROAD.has(word) }));
  const state = {
    busy: false, stop: false, closing: false, dead: false, scanned: false,
    phase: 'Hazır', detail: 'X listenizi tarayarak başlayın.', existing: new Set(),
    added: new Set(), blocked: new Set(saved.document === performance.timeOrigin && Array.isArray(saved.blocked) ? saved.blocked : []),
    slots: Number.isInteger(saved.slots) && saved.slots >= 0 && saved.slots < 10 ? saved.slots : 0,
    confirmedBatch: Number.isInteger(saved.confirmedBatch) && saved.confirmedBatch >= 0 && saved.confirmedBatch < 10 ? saved.confirmedBatch : 0,
    cooldown: Number.isFinite(saved.cooldown) ? saved.cooldown : 0,
    nextSave: Number.isFinite(saved.nextSave) ? saved.nextSave : 0,
    rate: saved.rate && Number.isFinite(saved.rate.until) ? saved.rate : null,
    attempt: null, ownedWord: null, minimized: false, initialized: false
  };
  const persist = () => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify({
        selected: items.filter(i => i.selected).map(i => i.word), slots: state.slots, confirmedBatch: state.confirmedBatch,
        cooldown: state.cooldown, nextSave: state.nextSave, rate: state.rate,
        blocked: [...state.blocked], document: performance.timeOrigin
      }));
    } catch {} // Depolama kapalıysa bu panel oturumu çalışmaya devam eder.
  };
  const host = document.createElement('div');
  host.id = ROOT_ID;
  host.style.cssText = 'all:initial;position:fixed;right:20px;bottom:20px;z-index:2147483647;display:block;';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    :host{color-scheme:dark}*{box-sizing:border-box} [hidden]{display:none!important}
    .panel{width:min(388px,calc(100vw - 24px));max-height:calc(100dvh - 32px);overflow:auto;background:#191c19;color:#f2eee5;border:1px solid #41483f;border-radius:20px;box-shadow:0 20px 80px #0009;font:13px/1.45 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;letter-spacing:0}
    button,input{font:inherit}button{border:1px solid #465042;background:#2b322a;color:#f2eee5;border-radius:9px;cursor:pointer;padding:8px 11px;transition:transform 120ms cubic-bezier(.23,1,.32,1),background-color 150ms ease;white-space:nowrap}
    button:active:not(:disabled){transform:scale(.97)}button:disabled{opacity:.43;cursor:default}button:focus-visible,input:focus-visible,summary:focus-visible{outline:2px solid #ffc2a0;outline-offset:3px}
    @media(hover:hover){button:hover:not(:disabled){background:#394334}.row:hover{background:#293228}}
    @media(prefers-reduced-motion:reduce){button{transition:none}button:active:not(:disabled){transform:none}}
    header{padding:18px 18px 13px;display:flex;gap:10px;align-items:center;cursor:grab;touch-action:none;user-select:none}header:active{cursor:grabbing}
    h2{font-size:18px;line-height:1.15;margin:0;font-weight:650;letter-spacing:-.6px}.eyebrow{font-size:12px;letter-spacing:.1px;color:#ffb088;margin-top:4px}.tools{margin-left:auto;display:flex;gap:3px}.icon{font-size:18px;border:0;background:transparent;width:30px;height:30px;padding:0;color:#bcc3b8}
    .body{padding:0 18px 17px}.intro{color:#b9c2b3;margin:1px 0 14px;font-size:12px}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.stat{background:#242c24;border:1px solid #394535;padding:10px 11px;border-radius:11px}.stat b{display:block;font-size:23px;line-height:1.15;font-weight:600;font-variant-numeric:tabular-nums;letter-spacing:-.7px}.stat span{display:block;font-size:10px;color:#b2bea9;margin-top:4px}.stat:last-child b{color:#c2dfa5}
    .status{margin-top:14px;display:flex;align-items:center;gap:7px}.dot{width:6px;height:6px;border-radius:100%;background:#ffb088}.status strong{font-size:12px;font-weight:600}.status small{margin-left:auto;color:#b2bea9;font-size:11px;font-variant-numeric:tabular-nums}.detail{font-size:11px;color:#b9c2b3;min-height:31px;margin:5px 0 8px;overflow-wrap:anywhere}
    progress{display:block;width:100%;height:4px;border:0;border-radius:3px;overflow:hidden;background:#394535;accent-color:#ffb088}progress::-webkit-progress-bar{background:#394535}progress::-webkit-progress-value{background:#ffb088;border-radius:3px}
    .toolbar{display:flex;align-items:center;gap:6px;margin:14px 0 9px}.toolbar strong{font-size:12px;margin-right:auto}.link{background:transparent;border:0;font-size:11px;color:#ffba97;padding:3px 1px}.sep{color:#5b6755}
    .search{width:100%;padding:9px 11px;color:#f2eee5;background:#131713;border:1px solid #424e3c;border-radius:9px;outline:none}.search::placeholder{color:#9aa58f}
    .words{height:186px;overflow:auto;overscroll-behavior:contain;margin:7px -3px 0;padding:0 3px;scrollbar-width:thin;scrollbar-color:#53604a transparent}
    .row{min-height:35px;display:flex;align-items:center;gap:8px;padding:5px 5px;border-radius:6px}.row input{accent-color:#ffb088;margin:0;width:14px;height:14px;flex-shrink:0}.word{font-size:12px;overflow-wrap:anywhere}.badge{font-size:9px;border-radius:5px;padding:3px 5px;background:#333c2e;color:#c4cfba;margin-left:auto;flex-shrink:0}.badge.yes{background:#2f4325;color:#c4e6a5}.badge.warn{background:#493528;color:#ffc2a0}.hint{font-size:10px;color:#b0bba5;line-height:1.5;margin:9px 0 11px}
    .actions{display:flex;gap:7px}.primary{background:#ffb088;border-color:#ffb088;color:#352016;font-weight:650;flex:1}.primary:hover:not(:disabled){background:#ffc6a9}.secondary{font-size:12px}.rule{font-size:10px;color:#a8b59c;text-align:center;margin:9px 0 0}
    details{margin-top:12px;border-top:1px solid #394535;padding-top:10px}summary{cursor:pointer;color:#bac7ad;font-size:11px}.log{max-height:100px;overflow:auto;font-size:10px;margin-top:7px;overscroll-behavior:contain}.entry{padding:3px 0;color:#b2bea9;overflow-wrap:anywhere}.entry[data-level=ok]{color:#c4e6a5}.entry[data-level=error]{color:#ffb6a1}.entry time{color:#95a288;margin-right:7px;font-variant-numeric:tabular-nums}.logfoot{display:flex;justify-content:space-between;margin-top:5px}.mini{padding:0 18px 14px;display:flex;align-items:center;gap:10px}.mini span{font-size:11px;color:#d0c7b2;flex:1}
  `;
  shadow.append(style);
  // UI yapısı sabittir; sayfadan okunan metinler yalnızca textContent ile yazılır.
  const el = (tag, attrs = {}, text = '') => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, ['aria-label', 'title', 'placeholder'].includes(k) ? lower(v) : v);
    n.textContent = lower(text); return n;
  };
  const panel = el('section', { class: 'panel', role: 'region', 'aria-label': 'manifest blocker: tralala edition' });
  const header = el('header');
  const heading = el('div'); heading.append(el('h2', {}, 'manifest blocker:'), el('div', { class: 'eyebrow' }, 'tralala edition'));
  const controls = el('div', { class: 'tools' });
  const minimize = el('button', { class: 'icon', 'aria-label': 'Paneli küçült', title: 'Küçült' }, '−');
  const close = el('button', { class: 'icon', 'aria-label': 'Durdur ve paneli kaldır', title: 'Durdur ve kaldır' }, '×');
  controls.append(minimize, close); header.append(heading, controls);
  const body = el('div', { class: 'body' });
  body.append(el('p', { class: 'intro' }, 'Manifest ile ilgili kelimeleri sessize al.'));
  const stats = el('div', { class: 'stats' });
  const numbers = ['X’te mevcut', 'Seçili eksik', 'Doğrulanan yeni'].map(label => {
    const card = el('div', { class: 'stat' }), num = el('b', {}, '—');
    card.append(num, el('span', {}, label)); stats.append(card); return num;
  });
  const statusLine = el('div', { class: 'status' }), phase = el('strong', { role: 'status', 'aria-live': 'polite' });
  const count = el('small'); statusLine.append(el('i', { class: 'dot' }), phase, count);
  const detail = el('p', { class: 'detail' });
  const progress = el('progress', { max: String(WORDS.length), value: '0', 'aria-label': 'Listede doğrulanan kelimeler' });
  const toolbar = el('div', { class: 'toolbar' });
  const select = el('button', { class: 'link' }, 'Eksikleri seç');
  const none = el('button', { class: 'link' }, 'Seçimi temizle');
  toolbar.append(el('strong', {}, 'Kelimeler'), select, el('span', { class: 'sep' }, '·'), none);
  const search = el('input', { class: 'search', type: 'search', placeholder: 'Listede ara…', 'aria-label': 'Kelimelerde ara' });
  const wordList = el('div', { class: 'words', role: 'group', 'aria-label': 'Sessize alınacak kelimeler' });
  const rows = items.map(item => {
    const row = el('label', { class: 'row' }), check = el('input', { type: 'checkbox' });
    const badge = el('span', { class: 'badge' });
    check.addEventListener('change', () => { item.selected = check.checked; persist(); render(); });
    row.append(check, el('span', { class: 'word' }, item.word), badge); wordList.append(row);
    return { row, check, badge, item };
  });
  const actions = el('div', { class: 'actions' });
  const scanButton = el('button', { class: 'secondary' }, 'Tara');
  const startButton = el('button', { class: 'primary' }, 'Seçilileri sessize al');
  const stopButton = el('button', { class: 'secondary' }, 'Durdur');
  actions.append(scanButton, startButton, stopButton);
  const logs = el('details'), summary = el('summary', {}, 'İşlem günlüğü');
  const logBox = el('div', { class: 'log', role: 'log', 'aria-live': 'polite', 'aria-label': 'İşlem günlüğü' });
  const logFoot = el('div', { class: 'logfoot' });
  const clearLog = el('button', { class: 'link' }, 'Günlüğü temizle');
  logFoot.append(el('span', { class: 'hint' }, 'Yalnızca bu sekmede çalışır.'), clearLog);
  logs.append(summary, logBox, logFoot);
  body.append(stats, statusLine, detail, progress, toolbar, search, wordList,
    el('p', { class: 'hint' }, '“Geniş” kelimeler başka konuları da gizleyebilir; başlangıçta seçili değildir. Yeni kayıtlar: ana sayfa + bildirimler · herkesten · süresiz.'),
    actions, el('p', { class: 'rule' }, 'Her 10 kayıtta 60 sn ara · 429 gelirse durur'), logs);
  const mini = el('div', { class: 'mini', hidden: '' }), miniText = el('span');
  const miniStop = el('button', { class: 'secondary' }, 'Durdur'); mini.append(miniText, miniStop);
  panel.append(header, body, mini); shadow.append(panel); document.documentElement.append(host);

  function log(message, level = 'info') {
    if (state.dead) return;
    const line = el('div', { class: 'entry', 'data-level': level });
    const time = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    line.append(el('time', {}, time), document.createTextNode(lower(message))); logBox.append(line);
    while (logBox.children.length > 120) logBox.firstElementChild.remove();
    logBox.scrollTop = logBox.scrollHeight;
  }
  function eligible(item) { return state.scanned && !has(state.existing, item.word) && !has(state.blocked, item.word); }
  function render() {
    if (state.dead) return;
    const present = items.filter(i => has(state.existing, i.word)).length;
    const selected = items.filter(i => i.selected && eligible(i)).length;
    numbers[0].textContent = state.scanned ? String(present) : '—';
    numbers[1].textContent = state.scanned ? String(selected) : '—';
    numbers[2].textContent = String(state.added.size);
    phase.textContent = lower(state.phase); detail.textContent = lower(state.detail);
    count.textContent = `${present} / ${items.length}`; progress.value = present;
    for (const { row, check, badge, item } of rows) {
      const exists = has(state.existing, item.word), blocked = has(state.blocked, item.word);
      row.hidden = !fold(item.word).includes(fold(search.value));
      check.checked = exists || (item.selected && !blocked);
      check.disabled = state.busy || !eligible(item);
      badge.textContent = has(state.added, item.word) ? 'doğrulandı' : exists ? 'mevcut' : blocked ? 'kontrol et' : !state.scanned ? 'taranmadı' : BROAD.has(item.word) ? 'geniş' : 'eksik';
      badge.className = `badge${exists ? ' yes' : blocked || BROAD.has(item.word) ? ' warn' : ''}`;
    }
    scanButton.disabled = state.busy || (state.rate && Date.now() < state.rate.until);
    startButton.disabled = state.busy || !state.scanned || !selected || (state.rate && Date.now() < state.rate.until);
    startButton.textContent = state.stop || state.rate ? 'devam et' : 'seçilileri sessize al';
    stopButton.disabled = miniStop.disabled = !state.busy || state.stop;
    select.disabled = none.disabled = state.busy || !state.scanned;
    miniText.textContent = `${lower(state.phase)} · ${present}/${items.length}`;
    close.disabled = state.closing;
  }
  function status(title, message) { state.phase = lower(title); state.detail = lower(message); render(); }
  function stop() {
    state.stop = true;
    status('Durduruluyor', state.attempt?.sent ? 'Gönderilmiş kaydın sonucu kontrol ediliyor. Yeni kayıt gönderilmeyecek.' : 'Yeni işlem yapılmayacak.');
    if (!state.busy) status('Duraklatıldı', 'Devam et ile liste yeniden taranır.');
  }
  const PAUSE = Symbol('pause');
  const visible = n => !!n && n.isConnected && n.getClientRects().length > 0 && getComputedStyle(n).visibility !== 'hidden';
  const enabled = n => visible(n) && !n.disabled && n.getAttribute('aria-disabled') !== 'true';
  const all = (selector, root = document) => [...root.querySelectorAll(selector)].filter(visible);
  const path = () => location.pathname.replace(/\/$/, '');
  const isList = () => path() === '/settings/muted_keywords';
  const isAdd = () => path() === '/settings/add_muted_keyword';
  const scope = () => document.querySelector('main') || document.querySelector('[role="main"]');
  const unique = (list, description) => {
    const nodes = [...new Set(list)];
    if (nodes.length > 1) throw new Error(`${description}: birden fazla eşleşme var. X arayüzü değişmiş olabilir.`);
    return nodes[0] || null;
  };
  function guard(ignorePause = false) {
    if (state.dead) throw PAUSE;
    if (state.rate) throw new Error('X 429 sınırı bildirdi. Otomatik işlem durdu.');
    if (!ignorePause && state.stop) throw PAUSE;
    if (!isList() && !isAdd()) throw new Error('X sayfası değişti. Sessize alınan kelimeler sayfasına dönüp Tara’ya basın.');
  }
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function delay(ms, ignorePause = false) {
    const until = Date.now() + ms;
    do { guard(ignorePause); await sleep(Math.min(150, Math.max(0, until - Date.now()))); } while (Date.now() < until);
    guard(ignorePause);
  }
  async function waitFor(fn, message, timeout = 15000, ignorePause = false) {
    const until = Date.now() + timeout;
    while (Date.now() < until) {
      guard(ignorePause);
      const value = fn(); if (value) return value;
      await delay(180, ignorePause);
    }
    throw new Error(message);
  }

  // Yalnızca gözlem: X'in yaptığı istekleri değiştirmez veya yeniden göndermez.
  const originalFetch = window.fetch;
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  const xhrInfo = new WeakMap(), xhrListeners = new Map();
  function classify(url) {
    try {
      const u = new URL(url, location.href);
      const firstParty = /(^|\.)(x|twitter)\.com$/.test(u.hostname);
      const mute = firstParty && /(?:mutes\/keywords|muted[_-]?keywords?|mutedwords?)/i.test(u.pathname);
      const write = mute && /(?:create|add)(?:[_.\/-]|muted)/i.test(u.pathname);
      return { firstParty, mute, write };
    } catch { return {}; }
  }
  function setRate(getHeader) {
    if (!state.busy || state.dead) return;
    const now = Date.now(), retry = getHeader('retry-after');
    const seconds = retry && /^\d+(?:\.\d+)?$/.test(retry) ? Number(retry) * 1000 : 0;
    const date = retry && !seconds ? Date.parse(retry) : 0;
    const reset = Number(getHeader('x-rate-limit-reset')) * 1000;
    const until = Math.max(now + 60000, now + seconds, Number.isFinite(date) ? date : 0, Number.isFinite(reset) ? reset : 0);
    state.rate = { until }; state.stop = true; persist();
    status('429 · Durdu', 'X istek sınırı bildirdi. Otomatik yeniden deneme yok. Bekledikten sonra Devam et.');
    log('429: durduruldu. Sunucu bekleme süresi varsa uygulanır; yoksa en az 60 sn.', 'error');
  }
  function termsInResponse(value) {
    const found = new Set(); let budget = 10000;
    function walk(v, depth) {
      if (!v || typeof v !== 'object' || depth > 12 || --budget < 0) return;
      if (typeof v.keyword === 'string' && (v.id != null || v.id_str != null)) found.add(tidy(v.keyword));
      for (const child of Object.values(v)) if (child && typeof child === 'object') walk(child, depth + 1);
    }
    walk(value, 0); return found;
  }
  function applicationError(value) {
    let budget = 10000, found = false;
    function walk(v, depth) {
      if (!v || typeof v !== 'object' || depth > 12 || --budget < 0) return;
      if (v.success === false || v.error || (Array.isArray(v.errors) ? v.errors.length : v.errors)) found = true;
      for (const child of Object.values(v)) if (child && typeof child === 'object') walk(child, depth + 1);
    }
    walk(value, 0); return found;
  }
  async function observe(url, code, getHeader, json, attempt, method) {
    if (state.dead) return;
    const kind = classify(url);
    if (kind.firstParty && code === 429) {
      if (kind.write && method === 'POST' && attempt?.sent) attempt.rejected = true;
      setRate(getHeader); return;
    }
    if (!kind.write || method !== 'POST' || !attempt?.sent) return;
    if (code < 200 || code >= 300) { attempt.error = `X kaydetme yanıtı: HTTP ${code || 'ağ hatası'}.`; return; }
    try {
      const data = await json();
      if (state.dead) return;
      if (applicationError(data)) { attempt.error = 'X kaydetme isteğinde hata bildirdi (HTTP 200 olsa da).'; return; }
      if (has(termsInResponse(data), attempt.word)) attempt.ack = true;
      else attempt.error = 'Sunucu yanıtı kelimenin kaydedildiğini doğrulamıyor. Başarı sayılmadı.';
    } catch { attempt.error = 'Sunucu yanıtı okunamadı. Kayıt sonucu belirsiz.'; }
  }
  function wrappedFetch(...args) {
    const input = args[0], options = args[1];
    const url = typeof input === 'string' || input instanceof URL ? String(input) : input?.url || '';
    const method = String(options?.method || input?.method || 'GET').toUpperCase();
    const attempt = state.attempt?.sent ? state.attempt : null;
    return Reflect.apply(originalFetch, this, args).then(response => {
      if (!state.dead && (classify(url).mute || (state.busy && response.status === 429))) {
        void observe(url, response.status, n => response.headers.get(n), () => response.clone().json(), attempt, method).catch(() => {});
      }
      return response;
    });
  }
  function wrappedOpen(method, url, ...rest) {
    xhrInfo.set(this, { method: String(method).toUpperCase(), url: String(url) });
    return Reflect.apply(originalOpen, this, [method, url, ...rest]);
  }
  function wrappedSend(...args) {
    const info = xhrInfo.get(this), attempt = state.attempt?.sent ? state.attempt : null;
    const onEnd = () => {
      xhrListeners.delete(this);
      if (!info || state.dead) return;
      void observe(info.url, this.status, n => this.getResponseHeader(n), () => {
        if (this.responseType === 'json') return this.response;
        return JSON.parse(this.responseText);
      }, attempt, info.method).catch(() => {});
    };
    this.addEventListener('loadend', onEnd, { once: true }); xhrListeners.set(this, onEnd);
    try { return Reflect.apply(originalSend, this, args); }
    catch (e) { this.removeEventListener('loadend', onEnd); xhrListeners.delete(this); throw e; }
  }
  window.fetch = wrappedFetch;
  XMLHttpRequest.prototype.open = wrappedOpen;
  XMLHttpRequest.prototype.send = wrappedSend;

  function rowElements(root) {
    if (!root || !isList()) return [];
    const isKeywordLink = row => {
      const href = row.getAttribute('href');
      if (!href) return true;
      try {
        const url = new URL(href, location.href);
        return url.origin === location.origin && /^\/settings\/muted_keywords\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith('/add');
      } catch { return false; }
    };
    const rows = new Set(all(SEL.rows, root).filter(isKeywordLink));
    // Canlı X: div[role=link], href/testid yok; içinde aria-label="Unmute" düğmesi var.
    // Genel ayar bağlantılarını veya rastgele metinleri kelime satırı sayma.
    for (const action of all('button,[role="button"]', root)) {
      const label = tidy(action.getAttribute('aria-label') || action.innerText);
      if (!/^(unmute|sessizi aç|sessizden çıkar|sessizden çıkart|sessize almayı kaldır|sessizliği kaldır|sesi aç)$/i.test(label)) continue;
      const row = action.parentElement?.closest('a,[role="link"]');
      if (row && root.contains(row) && visible(row) && isKeywordLink(row)) rows.add(row);
    }
    return [...rows];
  }
  function readRows(root) {
    const result = new Set();
    for (const row of rowElements(root)) {
      const exact = row.querySelector('[data-testid="mutedKeywordText"]');
      const text = tidy(exact?.textContent || row.innerText.split('\n').find(x => tidy(x)) || '');
      if (text) result.add(text);
    }
    return result;
  }
  function emptyList(root) {
    return /(?:you (?:haven.t|have not) muted any words|you don.t have any muted words|no muted words|hiçbir kelimeyi sessize almad|sessize aldığın(?:ız)? (?:hiçbir )?kelime yok|sessize alın(?:an|mış) kelime(?:niz|lerin)? yok)/i.test(root.innerText);
  }
  function scrollContainer(root) {
    const first = rowElements(root)[0];
    for (let node = first?.parentElement; node; node = node.parentElement) {
      if (node.scrollHeight > node.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(node).overflowY)) return node;
    }
    const candidates = [root, ...root.querySelectorAll('section,div')].filter(n => visible(n) && n.clientHeight > 80 && n.scrollHeight > n.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(n).overflowY));
    if (candidates.length > 1) throw new Error('Liste kaydırma alanı belirsiz. Tarama tamamlanmadı.');
    return candidates[0] || document.scrollingElement;
  }
  const setScroll = (node, top) => node.scrollTo({ top, behavior: 'instant' });
  function busyIndicator(root) { return all('[role="progressbar"], [aria-busy="true"]', root).length > 0; }
  function pageError(root) {
    const text = all('[role="alert"], [data-testid="toast"]', root).map(n => n.innerText).join(' ');
    if (/rate.?limit|too many requests|istek sınır|çok fazla istek/i.test(text)) {
      setRate(() => null); throw new Error('X istek sınırı bildirdi.');
    }
    if (/something went wrong|try again|bir sorun oluştu|bir hata oluştu|tekrar dene|already muted|zaten sessiz/i.test(text)) throw new Error(`X uyarısı: ${tidy(text).slice(0, 180)}`);
  }
  async function scanList(ignorePause = false) {
    guard(ignorePause);
    if (!isList()) throw new Error('Taramak için X’in sessize alınan kelimeler listesi açık olmalı.');
    const root = await waitFor(scope, 'X’in ana alanı bulunamadı.', 12000, ignorePause);
    await waitFor(() => {
      pageError(root);
      return !busyIndicator(root) && (readRows(root).size || emptyList(root));
    }, 'X kelime listesi okunamadı. Listenin açık ve yüklenmiş olduğundan emin olun. Devam ederse panel sürümünü kontrol edin (2.0).', 15000, ignorePause);
    const scroll = scrollContainer(root), originalTop = scroll.scrollTop;
    const found = new Set(); let stable = 0, previous = '', completed = false;
    try {
      setScroll(scroll, 0); await delay(500, ignorePause);
      for (let step = 0; step < 160; step++) {
        guard(ignorePause);
        if (!root.isConnected || !isList()) throw new Error('Tarama sırasında X listesi değişti.');
        pageError(root);
        for (const word of readRows(root)) found.add(word);
        const end = scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 4;
        const signature = `${scroll.scrollTop}|${scroll.scrollHeight}|${found.size}`;
        stable = end && !busyIndicator(root) && signature === previous ? stable + 1 : 0;
        if (stable >= 4) { completed = true; break; }
        previous = signature;
        setScroll(scroll, Math.min(scroll.scrollTop + Math.max(100, scroll.clientHeight * .65), scroll.scrollHeight));
        await delay(end ? 700 : 350, ignorePause);
      }
      if (!completed) throw new Error('Listenin sonuna ulaşılamadı. Kısmi taramayla kayıt yapılmayacak.');
      if (!found.size && !emptyList(root)) throw new Error('Boş liste doğrulanamadı.');
      // Sayfalama düğmesi varsa yalnızca ilk sayfayı "tam" sayma.
      const more = all('button,[role="button"],a', root).some(n => enabled(n) && /^(load more|show more|next|daha fazla(?: göster)?|sonraki)$/i.test(tidy(n.innerText || n.getAttribute('aria-label'))));
      if (more) throw new Error('Ek sayfa düğmesi bulundu. Liste tamamen taranamadı; kayıt durdu.');
      return found;
    } finally { if (scroll.isConnected) setScroll(scroll, originalTop); }
  }
  function updateExisting(found) {
    state.existing = found; state.scanned = true;
    for (const word of state.blocked) if (has(found, word)) state.blocked.delete(word);
    for (const word of state.added) if (!has(found, word)) state.added.delete(word);
    persist(); render();
  }
  async function ensureList() {
    if (isList()) return;
    if (!isAdd() || state.ownedWord === null) throw new Error('X’te sessize alınan kelimeler listesine dönüp Tara’ya basın.');
    const root = scope();
    const input = root && unique(all(SEL.input, root), 'Kelime alanı');
    if (input && input.value && !equal(input.value, state.ownedWord)) throw new Error('X formu değiştirildi. Önce listeye dönün.');
    const back = root && unique(all('a[href="/settings/muted_keywords"], [data-testid="app-bar-back"]', root), 'Listeye dönüş düğmesi');
    if (!back || !enabled(back)) throw new Error('X’te geri düğmesiyle kelime listesine dönüp tekrar deneyin.');
    guard(); back.click();
    await waitFor(isList, 'Kelime listesine dönülemedi.'); state.ownedWord = null;
  }
  function inputField(root) {
    const known = unique(all(SEL.input, root), 'Kelime alanı');
    if (known) return known;
    return unique(all('input[type="text"],input:not([type])', root).filter(n => n.getAttribute('role') !== 'combobox' && !/search/i.test(n.name)), 'Kelime alanı');
  }
  function labelsFor(control) {
    const labels = [control.getAttribute('aria-label') || ''];
    for (const id of (control.getAttribute('aria-labelledby') || '').split(/\s+/)) if (id) labels.push(document.getElementById(id)?.textContent || '');
    const wrappers = [...(control.labels || []), control.closest('label')].filter(Boolean);
    for (const wrapper of wrappers) {
      labels.push(wrapper.textContent);
      for (const leaf of wrapper.querySelectorAll('span,div')) if (!leaf.children.length) labels.push(leaf.textContent);
    }
    return labels.map(tidy);
  }
  const checked = n => n.matches('input') ? n.checked : n.getAttribute('aria-checked') === 'true';
  async function setOption(root, pattern, name) {
    const candidates = all('input[type="checkbox"],input[type="radio"],[role="checkbox"],[role="radio"],[role="switch"]', root).filter(n => labelsFor(n).some(s => pattern.test(s)));
    const control = unique(candidates, name);
    if (!control || !enabled(control)) throw new Error(`${name} seçeneği tanınamadı. X formundaki etiket veya kontrol yapısı değişmiş olabilir; kayıt yapılmadı.`);
    if (!checked(control)) { guard(); control.click(); await delay(220); }
    if (!checked(control)) throw new Error(`${name} seçeneği doğrulanamadı.`);
    return control;
  }
  function saveButton(root) {
    const known = all(SEL.save, root);
    return unique(known.length ? known : all('button,[role="button"]', root).filter(n => /^(save|kaydet)$/i.test(tidy(n.innerText || n.getAttribute('aria-label')))), 'Kaydet düğmesi');
  }
  async function coolDown() {
    while (Date.now() < Math.max(state.cooldown, state.nextSave)) {
      guard();
      const remaining = Math.ceil((Math.max(state.cooldown, state.nextSave) - Date.now()) / 1000);
      status('Bekleniyor', `${remaining} sn sonra devam. Durdurabilirsiniz; bekleme süresi korunur.`);
      await delay(250);
    }
  }
  async function saveWord(word) {
    await coolDown(); guard();
    if (!isList()) throw new Error('Yeni kelime eklemeden önce X listesi açık olmalı.');
    let root = scope();
    const add = root && unique(all(SEL.add, root), 'Kelime ekle düğmesi');
    if (!add || !enabled(add)) throw new Error('Kelime ekle düğmesi tanınamadı. Kayıt yapılmadı.');
    state.ownedWord = word; guard(); add.click();
    await waitFor(isAdd, 'X’in kelime ekleme sayfası açılmadı.');
    const input = await waitFor(() => scope() && inputField(scope()), 'Kelime giriş alanı bulunamadı.');
    root = input.closest('form') || input.closest('[role="dialog"]') || scope();
    guard();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, word);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await delay(300);
    const options = [];
    options.push(await setOption(root, /^(home timeline|ana\s?sayfa(?: zaman akışı)?)$/i, 'Ana sayfa'));
    options.push(await setOption(root, /^(notifications|bildirimler)$/i, 'Bildirimler'));
    options.push(await setOption(root, /^(from anyone|herkesten)$/i, 'Herkesten'));
    options.push(await setOption(root, /^(forever|until you unmute (?:the|this) word|süresiz|sonsuza kadar|(?:kelimenin sessizliğini|kelimeyi sessizden) (?:açana|çıkarana) kadar)(?:\s*\([^)]*\))?$/i, 'Süresiz'));
    const save = await waitFor(() => { const b = saveButton(scope()); return enabled(b) && b; }, 'Kaydet düğmesi etkinleşmedi.');
    guard();
    if (!isAdd() || !input.isConnected || input.value !== word || options.some(n => !n.isConnected || !checked(n))) throw new Error('Kaydetmeden önce form değişti. İşlem durdu.');
    if (window.fetch !== wrappedFetch || XMLHttpRequest.prototype.send !== wrappedSend || XMLHttpRequest.prototype.open !== wrappedOpen) throw new Error('Ağ gözlemi başka bir araç tarafından değiştirildi. Sayfayı yenileyin.');
    const attempt = { word, sent: true, ack: false, error: null, tenth: false };
    state.attempt = attempt;
    // Belirsiz istekler de kotada yer tutar. Dur/kapat/yeniden yapıştır süreyi sıfırlamaz.
    state.slots++;
    if (state.slots >= 10) { state.slots = 0; state.cooldown = Date.now() + 60000; attempt.tenth = true; }
    state.nextSave = Date.now() + 2000; persist();
    status('Kaydediliyor', `“${word}” · sunucu yanıtı ve X listesi doğrulanıyor.`);
    try {
      save.click();
      await waitFor(() => {
        pageError(scope() || document.body);
        if (attempt.error) throw new Error(attempt.error);
        return attempt.ack && isList();
      }, 'Kayıt 25 sn içinde doğrulanamadı. Başarı sayılmadı; otomatik tekrar denenmeyecek.', 25000, true);
      let found = readRows(scope());
      if (!has(found, word)) found = await scanList(true);
      if (!has(found, word)) throw new Error('Sunucu yanıtı geldi fakat kelime X listesinde bulunamadı. Başarı sayılmadı.');
      state.existing.add(word); state.added.add(word); state.blocked.delete(word);
      state.confirmedBatch++;
      if (state.confirmedBatch >= 10) {
        state.confirmedBatch = 0; state.cooldown = Date.now() + 60000;
      }
      if (attempt.tenth) state.cooldown = Date.now() + 60000;
      state.nextSave = Date.now() + 2000;
      state.ownedWord = null; persist();
      log(`✓ ${word} — sunucu ve listede doğrulandı.`, 'ok'); render();
    } catch (e) {
      if (attempt.rejected) {
        log(`× ${word} — X 429 ile reddetti. Devam et sonrasında yeniden taranacak.`, 'error');
      } else {
        state.blocked.add(word);
        log(`? ${word} — belirsiz; X listesini yenileyip kodu tekrar yapıştırarak kontrol edin.`, 'error');
      }
      persist();
      throw e;
    } finally { state.attempt = null; }
  }
  async function run(scanOnly = false) {
    if (state.busy || state.dead) return;
    if (state.rate && Date.now() < state.rate.until) {
      log('X sınırı için bekleme süresi henüz dolmadı.', 'error'); return;
    }
    // 429 yalnızca kullanıcının Tara/Devam et eylemiyle kaldırılır.
    state.rate = null; state.stop = false; state.busy = true; state.initialized = true; persist();
    try {
      await ensureList();
      state.scanned = false;
      status('Taranıyor', 'X listesi baştan sona okunuyor. Sayfayı değiştirmeyin.');
      updateExisting(await scanList());
      log(`Tarama tamamlandı: ${items.filter(i => has(state.existing, i.word)).length}/${items.length} kelime mevcut.`);
      if (scanOnly) { status('Seçime hazır', 'Eksikleri seçin. Geniş eşleşen kelimeleri ayrıca inceleyin.'); return; }
      const queue = items.filter(i => i.selected && eligible(i));
      for (const item of queue) {
        guard();
        await saveWord(item.word);
        // Onuncu kayıt son kayıt olsa bile ara tamamlanır.
        if (state.cooldown > Date.now()) await coolDown();
      }
      status('Tamamlandı', `${state.added.size} yeni kayıt doğrulandı. Diğer kelimeleri seçerek devam edebilirsiniz.`);
      log('Seçili kuyruk tamamlandı.', 'ok');
    } catch (e) {
      if (e === PAUSE) status('Duraklatıldı', 'Devam et ile liste yeniden taranır; bekleme süresi korunur.');
      else if (state.rate) status('429 · Durdu', 'X sınırı nedeniyle durdu. Bekledikten sonra Devam et ile yeniden tarayın.');
      else { state.stop = true; status('Kontrol gerekiyor', e.message || String(e)); log(e.message || String(e), 'error'); logs.open = true; }
    } finally {
      state.busy = false; render();
      if (state.closing) destroy();
    }
  }
  function destroy() {
    if (state.dead) return;
    state.dead = true; persist(); clearInterval(ticker);
    if (window.fetch === wrappedFetch) window.fetch = originalFetch;
    if (XMLHttpRequest.prototype.open === wrappedOpen) XMLHttpRequest.prototype.open = originalOpen;
    if (XMLHttpRequest.prototype.send === wrappedSend) XMLHttpRequest.prototype.send = originalSend;
    for (const [xhr, listener] of xhrListeners) xhr.removeEventListener('loadend', listener);
    xhrListeners.clear(); window.removeEventListener('resize', clampPosition);
    host.remove();
    if (window.manifestblocker === api) delete window.manifestblocker;
    if (window.ManifestBlocker === api) delete window.ManifestBlocker;
  }
  function dismiss() { state.closing = true; stop(); if (!state.busy) destroy(); }
  function show() {
    state.minimized = false; body.hidden = false; mini.hidden = true;
    minimize.textContent = '−'; minimize.setAttribute('aria-label', 'paneli küçült');
    clampPosition(); startButton.focus({ preventScroll: true });
  }
  function clampPosition() {
    if (host.style.right !== 'auto') return;
    const rect = host.getBoundingClientRect();
    host.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - rect.width - 8))}px`;
    host.style.top = `${Math.max(8, Math.min(rect.top, innerHeight - rect.height - 8))}px`;
  }
  let drag = null;
  header.addEventListener('pointerdown', e => {
    if (e.target.closest('button') || e.button !== 0 || drag) return;
    const rect = host.getBoundingClientRect(); drag = { x: e.clientX - rect.left, y: e.clientY - rect.top, id: e.pointerId };
    header.setPointerCapture(e.pointerId);
  });
  header.addEventListener('pointermove', e => {
    if (!drag || drag.id !== e.pointerId) return;
    host.style.right = 'auto'; host.style.bottom = 'auto';
    host.style.left = `${Math.max(8, Math.min(e.clientX - drag.x, innerWidth - host.offsetWidth - 8))}px`;
    host.style.top = `${Math.max(8, Math.min(e.clientY - drag.y, innerHeight - host.offsetHeight - 8))}px`;
  });
  header.addEventListener('lostpointercapture', () => { drag = null; });
  header.addEventListener('pointerup', e => { if (header.hasPointerCapture(e.pointerId)) header.releasePointerCapture(e.pointerId); drag = null; });
  window.addEventListener('resize', clampPosition);
  minimize.addEventListener('click', () => {
    state.minimized = !state.minimized; body.hidden = state.minimized; mini.hidden = !state.minimized;
    minimize.textContent = state.minimized ? '+' : '−';
    minimize.setAttribute('aria-label', state.minimized ? 'paneli genişlet' : 'paneli küçült'); clampPosition();
  });
  close.addEventListener('click', dismiss); stopButton.addEventListener('click', stop); miniStop.addEventListener('click', stop);
  scanButton.addEventListener('click', () => void run(true)); startButton.addEventListener('click', () => void run(false));
  clearLog.addEventListener('click', () => logBox.replaceChildren());
  search.addEventListener('input', render);
  select.addEventListener('click', () => { for (const item of items) if (eligible(item)) item.selected = true; persist(); render(); });
  none.addEventListener('click', () => { for (const item of items) item.selected = false; persist(); render(); });
  const api = Object.freeze({
    version: VERSION, show, stop, resume: () => run(false), scan: () => run(true), dismiss,
    status: () => ({ phase: state.phase, busy: state.busy, verified: [...state.added], existing: [...state.existing], uncertain: [...state.blocked], cooldownUntil: state.cooldown, slotsUsed: state.slots })
  });
  window.manifestblocker = api;
  window.ManifestBlocker = api; // 1.x console komutları için uyumluluk
  const ticker = setInterval(() => { if (state.rate && !state.busy) render(); }, 1000);
  log(`manifest blocker: tralala edition ${VERSION} hazır. Kayıt için seçiminiz ve başlatmanız beklenir.`);
  render();
  if (!state.rate) void run(true);
  else status('429 · Durdu', 'Önceki 429 beklemesi korunuyor. Daha sonra Tara ile kontrol edin.');
})();
