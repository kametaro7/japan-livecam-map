/* 日本ライブカメラマップ - app.js */
(function () {
  'use strict';

  // ---------- カテゴリ定義 ----------
  const CATS = {
    city:     { label: '街・繁華街',      color: '#e5322d' },
    rail:     { label: '鉄道・駅',        color: '#1e88e5' },
    airport:  { label: '空港',            color: '#8e24aa' },
    traffic:  { label: '道路・交通',      color: '#fb8c00' },
    sea:      { label: '海・港・ビーチ',  color: '#00acc1' },
    mountain: { label: '山・富士山',      color: '#43a047' },
    volcano:  { label: '火山',            color: '#6d4c41' },
    nature:   { label: '自然・湖・川',    color: '#7cb342' },
    snow:     { label: '雪・スキー場',    color: '#3949ab' },
    weather:  { label: 'お天気カメラ',    color: '#546e7a' },
    animal:   { label: '動物・生き物',    color: '#f4511e' },
    other:    { label: 'その他',          color: '#757575' },
  };
  const PREF_ORDER = ['北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県','茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県','新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県','徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県'];

  const CAMERAS = (window.CAMERAS || []).map((c, i) => Object.assign({ _i: i }, c));
  const UPDATED = window.CAMERAS_UPDATED || '';

  // ---------- DOM ----------
  const $ = (s) => document.querySelector(s);
  const el = {
    search: $('#search'), pref: $('#pref-select'), catBar: $('#cat-bar'), count: $('#count-badge'),
    sidebar: $('#sidebar'), list: $('#cam-list'), listCount: $('#list-count'),
    panel: $('#panel'), pName: $('#panel-name'), pSub: $('#panel-sub'), pCat: $('#panel-cat'), pTitle: $('#panel-title'),
    player: $('#player'), note: $('#player-note'), linkYt: $('#link-youtube'), linkCh: $('#link-channel'),
    nearby: $('#nearby-list'), toast: $('#toast'),
  };

  // ---------- 状態 ----------
  const state = { q: '', cat: 'all', pref: 'all', current: null };
  const markers = new Map(); // id -> marker

  // ---------- 地図 ----------
  const map = L.map('map', { zoomControl: false, minZoom: 4, maxZoom: 18, worldCopyJump: false })
    .setView([36.6, 137.2], 5);
  L.control.zoom({ position: 'bottomright' }).addTo(map);

  const gsiAttr = '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a>';
  const layers = {
    '淡色地図': L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', { attribution: gsiAttr, maxNativeZoom: 18, minZoom: 4 }),
    '標準地図': L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png', { attribution: gsiAttr, maxNativeZoom: 18, minZoom: 4 }),
    '航空写真': L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg', { attribution: gsiAttr, maxNativeZoom: 18, minZoom: 4 }),
    'OpenStreetMap': L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors', maxZoom: 19 }),
  };
  layers['淡色地図'].addTo(map);
  L.control.layers(layers, null, { position: 'bottomright', collapsed: true }).addTo(map);

  const cluster = L.markerClusterGroup({
    maxClusterRadius: 42,
    showCoverageOnHover: false,
    spiderfyOnMaxZoom: true,
    disableClusteringAtZoom: 13,
    iconCreateFunction: (c) => L.divIcon({ html: '<div>' + c.getChildCount() + '</div>', className: 'cam-cluster', iconSize: L.point(40, 40) }),
  });
  map.addLayer(cluster);

  function catOf(cam) { return CATS[cam.cat] ? cam.cat : 'other'; }
  function colorOf(cam) { return CATS[catOf(cam)].color; }

  function makeMarker(cam) {
    const icon = L.divIcon({ className: 'cam-marker' + (cam.offline ? ' offline' : ''), iconSize: [26, 26], iconAnchor: [13, 13], html: '<span class="cam-pin" style="--c:' + colorOf(cam) + '"></span>' });
    const m = L.marker([cam.lat, cam.lng], { icon, title: cam.name, keyboard: true });
    m.bindTooltip(cam.name, { className: 'cam-tip', direction: 'top', offset: [0, -12] });
    m.on('click', () => openCamera(cam, { fromMap: true }));
    m._cam = cam;
    return m;
  }

  // ---------- フィルタ ----------
  function norm(s) { return (s || '').toString().toLowerCase().normalize('NFKC'); }
  function matches(cam) {
    if (state.cat !== 'all' && catOf(cam) !== state.cat) return false;
    if (state.pref !== 'all' && cam.pref !== state.pref) return false;
    if (state.q) {
      const hay = norm([cam.name, cam.pref, cam.city, cam.title, cam.channelName, cam.tags].filter(Boolean).join(' '));
      const terms = norm(state.q).split(/\s+/).filter(Boolean);
      return terms.every((t) => hay.includes(t));
    }
    return true;
  }

  function currentList() {
    return CAMERAS.filter(matches).sort((a, b) => {
      const pa = PREF_ORDER.indexOf(a.pref), pb = PREF_ORDER.indexOf(b.pref);
      if (pa !== pb) return pa - pb;
      return a.name.localeCompare(b.name, 'ja');
    });
  }

  let renderTimer = null;
  function render() {
    const list = currentList();
    const ids = new Set(list.map((c) => c.id));
    // マーカー差分更新
    const toAdd = [], toRemove = [];
    for (const cam of CAMERAS) {
      const has = markers.has(cam.id);
      if (ids.has(cam.id) && !has) { const m = makeMarker(cam); markers.set(cam.id, m); toAdd.push(m); }
      else if (!ids.has(cam.id) && has) { toRemove.push(markers.get(cam.id)); markers.delete(cam.id); }
    }
    if (toRemove.length) cluster.removeLayers(toRemove);
    if (toAdd.length) cluster.addLayers(toAdd);
    highlightMarker();

    el.count.textContent = list.length + ' / ' + CAMERAS.length + ' 台';
    el.listCount.textContent = list.length + ' 台';
    renderList(list);
  }

  function renderList(list) {
    if (!list.length) { el.list.innerHTML = '<div class="list-empty">該当するカメラがありません。<br>条件を変えてみてください。</div>'; return; }
    const frag = document.createDocumentFragment();
    let lastPref = null;
    for (const cam of list) {
      if (state.pref === 'all' && cam.pref !== lastPref) {
        lastPref = cam.pref;
        const h = document.createElement('div');
        h.className = 'muted'; h.style.cssText = 'font-size:11px;font-weight:700;padding:10px 8px 4px;letter-spacing:.04em';
        h.textContent = cam.pref || 'その他';
        frag.appendChild(h);
      }
      frag.appendChild(listItem(cam));
    }
    el.list.replaceChildren(frag);
  }

  function listItem(cam, cls) {
    const d = document.createElement('div');
    d.className = 'cam-item' + (cls ? ' ' + cls : '') + (state.current && state.current.id === cam.id ? ' active' : '');
    d.dataset.id = cam.id;
    d.innerHTML =
      '<img loading="lazy" alt="" src="https://i.ytimg.com/vi/' + cam.video + '/mqdefault.jpg" onerror="this.style.visibility=\'hidden\'">' +
      '<div class="ci-body"><div class="ci-name"></div><div class="ci-sub"><span class="dot" style="--c:' + colorOf(cam) + '"></span><span></span></div></div>';
    d.querySelector('.ci-name').textContent = cam.name;
    if (cam.offline) d.querySelector('.ci-name').insertAdjacentHTML('beforeend', ' <span class="off-badge">停止中?</span>');
    if (cam.noembed) d.querySelector('.ci-name').insertAdjacentHTML('beforeend', ' <span class="off-badge noembed">YouTubeのみ</span>');
    d.querySelector('.ci-sub span:last-child').textContent = [cam.pref, cam.city, cam.channelName].filter(Boolean).join(' · ');
    d.addEventListener('click', () => { if (multi.open) { addToMulti(cam); return; } openCamera(cam, { fly: true }); });
    return d;
  }

  function highlightMarker() {
    for (const [id, m] of markers) {
      const e = m.getElement && m.getElement();
      if (e) e.classList.toggle('active', !!(state.current && state.current.id === id));
    }
  }

  // ---------- プレイヤー ----------
  let ytApiState = 'idle'; // idle | loading | ready | failed
  let player = null;
  let pending = null;
  let apiTimer = null;

  window.onYouTubeIframeAPIReady = function () {
    ytApiState = 'ready';
    clearTimeout(apiTimer);
    if (pending) { const c = pending; pending = null; mountPlayer(c); }
  };

  function ensureApi() {
    if (ytApiState !== 'idle') return;
    ytApiState = 'loading';
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => { ytApiState = 'failed'; if (pending) { const c = pending; pending = null; mountPlain(c); } };
    document.head.appendChild(s);
    apiTimer = setTimeout(() => { if (ytApiState !== 'ready') { ytApiState = 'failed'; if (pending) { const c = pending; pending = null; mountPlain(c); } } }, 5000);
  }

  function destroyPlayer() {
    if (player && player.destroy) { try { player.destroy(); } catch (e) { /* noop */ } }
    player = null;
    el.player.innerHTML = '';
    el.note.hidden = true; el.note.textContent = '';
  }

  function loadPlayer(cam) {
    destroyPlayer();
    if (ytApiState === 'ready') mountPlayer(cam);
    else if (ytApiState === 'failed') mountPlain(cam);
    else { pending = cam; ensureApi(); }
  }

  function mountPlayer(cam) {
    if (!state.current || state.current.id !== cam.id) return;
    const host = document.createElement('div'); host.id = 'yt-' + Date.now();
    el.player.replaceChildren(host);
    player = new YT.Player(host.id, {
      videoId: cam.video,
      playerVars: { autoplay: 1, mute: 1, playsinline: 1, rel: 0, modestbranding: 1, iv_load_policy: 3 },
      events: {
        onReady: (e) => { try { e.target.mute(); e.target.playVideo(); } catch (err) { /* noop */ } },
        onError: (e) => onPlayerError(cam, e.data),
        onStateChange: (e) => { if (e.data === YT.PlayerState.ENDED) showNote('この配信は終了しています。「配信が止まっている時はこちら」でチャンネルの最新ライブに切り替えられます。'); },
      },
    });
  }

  function mountPlain(cam) {
    if (!state.current || state.current.id !== cam.id) return;
    const f = document.createElement('iframe');
    f.src = 'https://www.youtube.com/embed/' + cam.video + '?autoplay=1&mute=1&playsinline=1&rel=0';
    f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    f.allowFullscreen = true; f.title = cam.name;
    el.player.replaceChildren(f);
  }

  function mountChannelLive(cam) {
    destroyPlayer();
    if (!cam.channel) { showNote('チャンネル情報がないため切り替えできません。YouTubeで開いてください。'); return; }
    const f = document.createElement('iframe');
    f.src = 'https://www.youtube.com/embed/live_stream?channel=' + cam.channel + '&autoplay=1&mute=1&playsinline=1';
    f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    f.allowFullscreen = true; f.title = cam.name + '（チャンネルの現在のライブ）';
    el.player.replaceChildren(f);
    showNote('チャンネルの現在のライブ配信に切り替えました。表示されない場合は配信が停止中の可能性があります。');
  }

  function onPlayerError(cam, code) {
    // 100: 動画が見つからない / 101,150: 埋め込み不可 / 2: パラメータ不正 / 5: HTML5エラー
    if (code === 100 || code === 2) {
      showNote('この配信のIDが無効になっています。チャンネルの最新ライブに切り替えます…');
      setTimeout(() => { if (state.current && state.current.id === cam.id) mountChannelLive(cam); }, 900);
    } else if (code === 101 || code === 150) {
      showNote('この配信は埋め込み再生が許可されていません。「YouTubeで開く」から視聴してください。');
    } else {
      showNote('再生エラーが発生しました（code ' + code + '）。YouTubeで開いてお試しください。');
    }
  }

  function showNote(msg) { el.note.textContent = msg; el.note.hidden = false; }

  // ---------- カメラを開く ----------
  function openCamera(cam, opts) {
    opts = opts || {};
    state.current = cam;
    el.pName.textContent = cam.name;
    el.pSub.textContent = [cam.pref, cam.city].filter(Boolean).join(' ') + (cam.channelName ? '　配信: ' + cam.channelName : '');
    el.pCat.textContent = CATS[catOf(cam)].label;
    el.pCat.style.setProperty('--c', colorOf(cam));
    el.pTitle.textContent = cam.title ? '配信タイトル: ' + cam.title : '';
    el.linkYt.href = 'https://www.youtube.com/watch?v=' + cam.video;
    el.linkCh.href = cam.channel ? 'https://www.youtube.com/channel/' + cam.channel + '/live' : '#';
    el.linkCh.hidden = !cam.channel;
    el.panel.classList.add('open');
    el.panel.scrollTop = 0;
    loadPlayer(cam);
    if (cam.noembed) showNote('このカメラは配信者が外部サイトでの再生を許可していません。「YouTubeで開く」からご覧ください。');
    else if (cam.offline) showNote('前回の確認時にこの配信は停止していました。映らない場合は「配信が止まっている時はこちら」をお試しください。');
    renderNearby(cam);
    highlightMarker();
    for (const it of el.list.querySelectorAll('.cam-item')) it.classList.toggle('active', it.dataset.id === cam.id);
    if (location.hash !== '#cam=' + cam.id) history.replaceState(null, '', '#cam=' + cam.id);
    document.title = cam.name + ' | 日本ライブカメラマップ';

    if (opts.fly) {
      const z = Math.max(map.getZoom(), 13);
      map.flyTo(visibleCenter([cam.lat, cam.lng], z), z, { duration: 0.8 });
    } else if (opts.fromMap && isMobile()) {
      // モバイルではパネルに隠れないよう、見えている上側の領域にピンを寄せる
      map.panTo(visibleCenter([cam.lat, cam.lng], map.getZoom()), { animate: true });
    }
    if (isMobile()) el.sidebar.classList.remove('open');
  }

  function closePanel() {
    el.panel.classList.remove('open');
    destroyPlayer();
    state.current = null;
    highlightMarker();
    for (const it of el.list.querySelectorAll('.cam-item.active')) it.classList.remove('active');
    history.replaceState(null, '', location.pathname + location.search);
    document.title = '日本ライブカメラマップ';
  }

  function isMobile() { return window.matchMedia('(max-width: 860px)').matches; }

  // パネル（モバイルは下部シート）に隠れない位置にピンが来るよう、地図の中心をずらして返す
  function visibleCenter(latlng, zoom) {
    const size = map.getSize();
    let dx = 0, dy = 0;
    if (isMobile()) dy = size.y * 0.36;            // シートが下 72% を覆う → 中心を下へ
    else if (size.x > 1100) dx = 0;                // デスクトップはパネルを除いても中央が見える
    const p = map.project(latlng, zoom);
    return map.unproject(L.point(p.x + dx, p.y + dy), zoom);
  }

  // ---------- 近くのカメラ ----------
  function dist(a, b) {
    const R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }
  function renderNearby(cam) {
    const near = CAMERAS.filter((c) => c.id !== cam.id).map((c) => ({ c, d: dist(cam, c) })).sort((x, y) => x.d - y.d).slice(0, 6);
    const frag = document.createDocumentFragment();
    for (const { c, d } of near) {
      const it = listItem(c);
      it.querySelector('.ci-sub span:last-child').textContent = (d < 1 ? Math.round(d * 1000) + ' m' : d.toFixed(d < 10 ? 1 : 0) + ' km') + ' · ' + [c.pref, c.city].filter(Boolean).join(' ');
      frag.appendChild(it);
    }
    el.nearby.replaceChildren(frag);
  }

  // ---------- UI 構築 ----------
  function buildCatBar() {
    const all = document.createElement('button');
    all.className = 'cat-btn active'; all.dataset.cat = 'all'; all.textContent = 'すべて';
    el.catBar.appendChild(all);
    const counts = {};
    for (const c of CAMERAS) counts[catOf(c)] = (counts[catOf(c)] || 0) + 1;
    for (const k of Object.keys(CATS)) {
      if (!counts[k]) continue;
      const b = document.createElement('button');
      b.className = 'cat-btn'; b.dataset.cat = k;
      b.innerHTML = '<span class="sw" style="--c:' + CATS[k].color + '"></span>' + CATS[k].label + ' <span style="opacity:.6">' + counts[k] + '</span>';
      el.catBar.appendChild(b);
    }
    el.catBar.addEventListener('click', (e) => {
      const b = e.target.closest('.cat-btn'); if (!b) return;
      state.cat = b.dataset.cat;
      for (const x of el.catBar.children) x.classList.toggle('active', x === b);
      render();
    });
  }

  function buildPrefSelect() {
    const have = new Set(CAMERAS.map((c) => c.pref).filter(Boolean));
    for (const p of PREF_ORDER) {
      if (!have.has(p)) continue;
      const o = document.createElement('option'); o.value = p;
      o.textContent = p + '（' + CAMERAS.filter((c) => c.pref === p).length + '）';
      el.pref.appendChild(o);
    }
    el.pref.addEventListener('change', () => {
      state.pref = el.pref.value; render();
      const list = currentList();
      if (list.length && state.pref !== 'all') {
        const b = L.latLngBounds(list.map((c) => [c.lat, c.lng]));
        map.fitBounds(b.pad(0.25), { maxZoom: 11 });
      }
    });
  }

  el.search.addEventListener('input', () => {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => { state.q = el.search.value.trim(); render(); if (state.q) el.sidebar.classList.add('open'); }, 160);
  });
  $('#btn-list').addEventListener('click', () => el.sidebar.classList.toggle('open'));
  $('#btn-close-list').addEventListener('click', () => el.sidebar.classList.remove('open'));
  $('#btn-close-panel').addEventListener('click', closePanel);
  $('#btn-random').addEventListener('click', () => {
    if (multi.open) { randomizeAllSlots(); return; }
    const list = currentList(); if (!list.length) return;
    openCamera(list[Math.floor(Math.random() * list.length)], { fly: true });
  });
  $('#btn-share').addEventListener('click', async () => {
    if (!state.current) return;
    const url = location.origin + location.pathname + '#cam=' + state.current.id;
    try { await navigator.clipboard.writeText(url); toast('リンクをコピーしました'); }
    catch (e) { prompt('このURLをコピーしてください', url); }
  });
  $('#btn-fallback').addEventListener('click', () => { if (state.current) mountChannelLive(state.current); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (multi.open) closeMulti(); else if (el.panel.classList.contains('open')) closePanel(); else el.sidebar.classList.remove('open'); }
    if (e.key === '/' && document.activeElement !== el.search) { e.preventDefault(); el.search.focus(); }
  });
  window.addEventListener('hashchange', openFromHash);

  let toastTimer = null;
  function toast(msg) { el.toast.textContent = msg; el.toast.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.toast.hidden = true; }, 2200); }

  function openFromHash() {
    const mm = location.hash.match(/#multi=([\w,-]*)/);
    if (mm) {
      const ids = mm[1].split(',');
      for (let i = 0; i < 4; i++) multi.slots[i] = CAMERAS.some((c) => c.id === ids[i]) ? ids[i] : null;
      saveMulti(); openMulti(); return true;
    }
    const m = location.hash.match(/#cam=([\w-]+)/);
    if (!m) return false;
    const cam = CAMERAS.find((c) => c.id === m[1]);
    if (cam) { if (!matches(cam)) { state.cat = 'all'; state.pref = 'all'; state.q = ''; el.search.value = ''; el.pref.value = 'all'; for (const x of el.catBar.children) x.classList.toggle('active', x.dataset.cat === 'all'); render(); } openCamera(cam, { fly: true }); return true; }
    return false;
  }

  // ---------- マルチビュー（4画面） ----------
  const multi = { open: false, slots: [null, null, null, null], target: null, big: null, audio: null };
  const mEl = { root: $('#multi'), grid: $('#multi-grid'), btn: $('#btn-multi'), count: $('#multi-count') };
  try { const saved = JSON.parse(localStorage.getItem('lcm.multi') || 'null'); if (saved && Array.isArray(saved.slots)) { for (let i = 0; i < 4; i++) multi.slots[i] = CAMERAS.some((c) => c.id === saved.slots[i]) ? saved.slots[i] : null; } } catch (e) { /* noop */ }

  function saveMulti() {
    try { localStorage.setItem('lcm.multi', JSON.stringify({ slots: multi.slots })); } catch (e) { /* noop */ }
    const n = multi.slots.filter(Boolean).length;
    mEl.count.textContent = n; mEl.count.hidden = n === 0;
    if (multi.open) history.replaceState(null, '', '#multi=' + multi.slots.map((x) => x || '').join(','));
  }
  function camById(id) { return CAMERAS.find((c) => c.id === id) || null; }

  function openMulti() {
    if (!multi.open) {
      multi.open = true;
      if (el.panel.classList.contains('open')) closePanel();
      mEl.root.hidden = false; mEl.btn.classList.add('active');
      document.title = 'マルチビュー | 日本ライブカメラマップ';
    }
    renderMulti(); saveMulti();
    if (!multi.slots.some(Boolean)) { multi.target = 0; renderMulti(); el.sidebar.classList.add('open'); }
    else if (!multi.slots.includes(null)) el.sidebar.classList.remove('open');
  }
  function closeMulti() {
    multi.open = false; multi.target = null; multi.big = null; multi.audio = null;
    mEl.root.hidden = true; mEl.btn.classList.remove('active');
    mEl.grid.replaceChildren();
    history.replaceState(null, '', location.pathname + location.search);
    document.title = '日本ライブカメラマップ';
    map.invalidateSize();
  }
  function addToMulti(cam, slotIndex) {
    let i = slotIndex;
    if (i == null) i = multi.target != null && !multi.slots[multi.target] ? multi.target : multi.slots.indexOf(null);
    if (i < 0) i = multi.target != null ? multi.target : 3; // 満杯なら選択中の枠か最後の枠を差し替え
    if (multi.slots.includes(cam.id) && multi.slots[i] !== cam.id) { toast('「' + cam.name + '」はすでに枠 ' + (multi.slots.indexOf(cam.id) + 1) + ' にあります'); return; }
    multi.slots[i] = cam.id;
    multi.target = multi.slots.indexOf(null) >= 0 ? multi.slots.indexOf(null) : null;
    if (!multi.open) openMulti(); else { renderMulti(); saveMulti(); }
    toast('枠 ' + (i + 1) + ' に「' + cam.name + '」を追加しました');
    if (isMobile() || multi.target == null) el.sidebar.classList.remove('open'); // 4枠そろったら一覧を閉じて全画面で見せる
  }
  function removeFromMulti(i) {
    multi.slots[i] = null;
    if (multi.big === i) multi.big = null;
    if (multi.audio === i) multi.audio = null;
    multi.target = i; renderMulti(); saveMulti();
  }
  // 4枠すべてを、いまの絞り込み（カテゴリ・都道府県・検索）の中からランダムに入れ替える
  function randomizeAllSlots() {
    const pool = currentList().filter((c) => !c.offline && !c.noembed); // 停止中・埋め込み不可は選ばない
    if (!pool.length) { toast('条件に合うカメラがありません'); return; }
    const rest = pool.slice(), picked = [];
    while (picked.length < 4 && rest.length) picked.push(rest.splice(Math.floor(Math.random() * rest.length), 1)[0].id);
    for (let i = 0; i < 4; i++) multi.slots[i] = picked[i] || null;
    const empty = multi.slots.indexOf(null);
    multi.target = empty < 0 ? null : empty;
    multi.audio = null; // 入れ替え後はいったん全部ミュートに戻す
    renderMulti(); saveMulti();
    el.sidebar.classList.remove('open');
    toast(picked.length < 4
      ? '条件に合うカメラが ' + picked.length + ' 台しかありません'
      : '4画面をランダムに入れ替えました');
  }

  function ytCmd(iframe, func) {
    try { iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args: [] }), 'https://www.youtube.com'); } catch (e) { /* noop */ }
  }
  function setAudio(i) {
    multi.audio = multi.audio === i ? null : i;
    for (const s of mEl.grid.querySelectorAll('.slot')) {
      const f = s.querySelector('iframe'); const b = s.querySelector('.slot-audio');
      const on = Number(s.dataset.i) === multi.audio;
      if (f) ytCmd(f, on ? 'unMute' : 'mute');
      if (b) { b.classList.toggle('on', on); b.textContent = on ? '🔊' : '🔇'; b.title = on ? '音声オン（クリックでミュート）' : '音声をオンにする'; }
    }
  }
  function renderMulti() {
    mEl.grid.classList.toggle('has-big', multi.big != null);
    const frag = document.createDocumentFragment();
    for (let i = 0; i < 4; i++) {
      const id = multi.slots[i]; const cam = id && camById(id);
      const existing = mEl.grid.querySelector('.slot[data-i="' + i + '"]');
      // 同じカメラが入っている枠は作り直さない（再生を途切れさせない）
      if (existing && existing.dataset.id === (id || '')) {
        existing.classList.toggle('target', multi.target === i); existing.classList.toggle('big', multi.big === i);
        const bb = existing.querySelector('.slot-big'); if (bb) bb.classList.toggle('on', multi.big === i);
        frag.appendChild(existing); continue;
      }
      const s = document.createElement('div');
      s.className = 'slot' + (multi.target === i ? ' target' : '') + (multi.big === i ? ' big' : '');
      s.dataset.i = i; s.dataset.id = id || '';
      if (!cam) {
        s.innerHTML = '<button class="slot-empty"><b>＋ 枠 ' + (i + 1) + ' にカメラを追加</b><small>クリックして選択 → 左の一覧・検索から選ぶ</small></button>';
        s.querySelector('.slot-empty').addEventListener('click', () => { multi.target = i; renderMulti(); el.sidebar.classList.add('open'); el.search.focus(); toast('一覧からカメラをクリックすると枠 ' + (i + 1) + ' に入ります'); });
      } else {
        s.innerHTML =
          '<div class="slot-head"><span class="slot-num">' + (i + 1) + '</span><span class="slot-name"></span>' +
          '<button class="slot-btn slot-audio" title="音声をオンにする">🔇</button>' +
          '<button class="slot-btn slot-big" title="拡大 / 元に戻す">⤢</button>' +
          '<button class="slot-btn slot-swap" title="別のカメラに入れ替え">⇄</button>' +
          '<a class="slot-btn" target="_blank" rel="noopener" title="YouTubeで開く" href="https://www.youtube.com/watch?v=' + cam.video + '">▶</a>' +
          '<button class="slot-btn slot-close" title="枠から外す">✕</button></div>' +
          '<div class="slot-body"></div>';
        s.querySelector('.slot-name').textContent = cam.name + '　' + [cam.pref, cam.city].filter(Boolean).join(' ');
        if (cam.noembed) {
          s.querySelector('.slot-body').innerHTML =
            '<div class="slot-noembed"><b>このカメラはサイト内で再生できません</b>' +
            '<small>配信者が外部サイトでの再生を許可していません</small>' +
            '<a class="pill-btn" target="_blank" rel="noopener" href="https://www.youtube.com/watch?v=' + cam.video + '">▶ YouTubeで見る</a></div>';
          frag.appendChild(s); continue;
        }
        const f = document.createElement('iframe');
        f.src = 'https://www.youtube.com/embed/' + cam.video + '?autoplay=1&mute=1&playsinline=1&rel=0&enablejsapi=1&origin=' + encodeURIComponent(location.origin);
        f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen'; f.allowFullscreen = true; f.title = cam.name;
        // 4本同時だと autoplay 属性だけでは再生が始まらないことがあるので、読み込み後に明示的に再生を指示する
        f.addEventListener('load', () => {
          ytCmd(f, 'mute'); ytCmd(f, 'playVideo');
          setTimeout(() => { if (f.isConnected) { ytCmd(f, Number(s.dataset.i) === multi.audio ? 'unMute' : 'mute'); ytCmd(f, 'playVideo'); } }, 1500);
        });
        s.querySelector('.slot-body').appendChild(f);
        if (cam.offline) s.querySelector('.slot-body').insertAdjacentHTML('beforeend', '<div class="slot-note">前回の確認時に停止していた配信です。映らない場合は ⇄ で別のカメラへ。</div>');
        s.querySelector('.slot-audio').addEventListener('click', () => setAudio(i));
        s.querySelector('.slot-big').addEventListener('click', () => { multi.big = multi.big === i ? null : i; renderMulti(); });
        s.querySelector('.slot-swap').addEventListener('click', () => { multi.target = i; renderMulti(); el.sidebar.classList.add('open'); el.search.focus(); toast('一覧からカメラをクリックすると枠 ' + (i + 1) + ' を入れ替えます'); });
        s.querySelector('.slot-close').addEventListener('click', () => removeFromMulti(i));
      }
      frag.appendChild(s);
    }
    mEl.grid.replaceChildren(frag);
  }
  mEl.btn.addEventListener('click', () => { if (multi.open) closeMulti(); else openMulti(); });
  $('#multi-close').addEventListener('click', closeMulti);
  $('#multi-clear').addEventListener('click', () => { multi.slots = [null, null, null, null]; multi.big = null; multi.audio = null; multi.target = 0; renderMulti(); saveMulti(); });
  $('#multi-random').addEventListener('click', randomizeAllSlots);
  $('#multi-share').addEventListener('click', async () => {
    const url = location.origin + location.pathname + '#multi=' + multi.slots.map((x) => x || '').join(',');
    try { await navigator.clipboard.writeText(url); toast('マルチビューのリンクをコピーしました'); }
    catch (e) { prompt('このURLをコピーしてください', url); }
  });
  $('#btn-add-multi').addEventListener('click', () => { if (state.current) addToMulti(state.current); });
  saveMulti();

  // ---------- 起動 ----------
  buildCatBar();
  buildPrefSelect();
  render();
  if (!openFromHash() && !isMobile()) el.sidebar.classList.add('open');
  if (UPDATED) { const f = document.querySelector('.panel-foot'); f.insertAdjacentHTML('afterbegin', 'データ更新: ' + UPDATED + '　カメラ数: ' + CAMERAS.length + '<br>'); }
  window.addEventListener('resize', () => map.invalidateSize());
})();
