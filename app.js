/* Side B: the app itself */
(() => {
  'use strict';
  const SB = window.SideB;
  const { CONFIG, U, ICONS, store, Library, ColorWheel } = SB;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];

  $$('[data-icon]').forEach((n) => { n.innerHTML = ICONS[n.dataset.icon] || ''; });
  document.title = CONFIG.siteName;
  $('#brandName').textContent = CONFIG.siteName;

  const audio = $('#audio');
  const rootStyle = document.documentElement.style;
  const el = {
    main: $('#main'), topbar: $('#topbar'), menuBtn: $('#menuBtn'), scrim: $('#scrim'),
    libList: $('#libList'), exportBtn: $('#exportBtn'), search: $('#search'),
    heroCover: $('#heroCover'), heroKind: $('#heroKind'), heroTitle: $('#heroTitle'), heroMeta: $('#heroMeta'),
    heroPlay: $('#heroPlay'), heroShuffle: $('#heroShuffle'),
    tracks: $('#tracks'), empty: $('#empty'),
    stageBg: $('#stageBg'), bigArt: $('#bigArt'), stageTitle: $('#stageTitle'), stageArtist: $('#stageArtist'),
    stageClose: $('#stageClose'), stageCoverBtn: $('#stageCoverBtn'),
    bar: $('#bar'), nowBtn: $('#nowBtn'), nowCoverBtn: $('#nowCoverBtn'),
    miniArt: $('#miniArt'), nowTitle: $('#nowTitle'), nowArtist: $('#nowArtist'),
    playBtn: $('#playBtn'), prevBtn: $('#prevBtn'), nextBtn: $('#nextBtn'),
    shuffleBtn: $('#shuffleBtn'), repeatBtn: $('#repeatBtn'), muteBtn: $('#muteBtn'),
    seekBar: $('#seekBar'), volBar: $('#volBar'), curTime: $('#curTime'), durTime: $('#durTime'),
    toast: $('#toast'),
    dialog: $('#coverDialog'), cdTitle: $('#cdTitle'), cdPreview: $('#cdPreview'), cdStops: $('#cdStops'),
    cdAngleRow: $('#cdAngleRow'), cdAngle: $('#cdAngle'), cdAngleVal: $('#cdAngleVal'),
    cdAlbumRow: $('#cdAlbumRow'), cdAlbum: $('#cdAlbum'), cdAlbumName: $('#cdAlbumName'),
    cdReset: $('#cdReset'), cdRemove: $('#cdRemove'),
    addBtnSide: $('#addBtnSide'), addBtnTop: $('#addBtnTop'), fileInput: $('#fileInput'),
    themeBtn: $('#themeBtn'), themeMenu: $('#themeMenu'), cdCancel: $('#cdCancel'), cdSave: $('#cdSave'), cdClose: $('#cdClose')
  };

  /* ---------- state ---------- */
  let tracks = [];
  let albums = [];
  let view = [];
  let baseList = [];
  let order = [];
  let pos = -1;
  let current = -1;
  let currentView = 'all';
  let shuffle = store.get('shuffle', false);
  let repeat = store.get('repeat', 'off');
  let seeking = false;
  let pendingSeek = 0;
  let lastSaved = 0;
  let playingAccent = { h: 262, s: 60 };
  let accentToken = 0;
  let viewToken = 0;

  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  function toast(msg, ms = 3400) {
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => el.toast.classList.remove('show'), ms);
  }

  /* ---------- themes ---------- */
  const THEMES = [
    { id: 'default', name: 'Side B', swatch: 'linear-gradient(135deg, #8B6CFF, #2A2140)', meta: '#0F0D16' },
    { id: 'tube', name: 'Tube Glow', swatch: 'radial-gradient(circle at 40% 35%, #FFD9A0, #FFA94D 55%, #5A2E10)', meta: '#140D08' },
    { id: 'boombox', name: 'Boombox Wall', swatch: 'linear-gradient(180deg, #E1E3E7, #A2A7AF 55%, #E2382F 56%)', meta: '#101114' },
    { id: 'dust', name: 'Dust and Static', swatch: 'radial-gradient(circle at 38% 32%, #FFF8EA, #D9C9A6 60%, #6B5A40)', meta: '#1C1815' }
  ];

  function applyTheme(id) {
    const theme = THEMES.find((t) => t.id === id) || THEMES[0];
    if (theme.id === 'default') delete document.body.dataset.theme;
    else document.body.dataset.theme = theme.id;
    store.set('theme', theme.id);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme.meta);
    el.themeMenu.querySelectorAll('.theme-item').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.theme === theme.id)));
  }

  function buildThemeMenu() {
    const label = document.createElement('div');
    label.className = 'theme-label';
    label.textContent = 'Theme';
    el.themeMenu.append(label);
    for (const t of THEMES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'theme-item';
      b.setAttribute('role', 'menuitemradio');
      b.dataset.theme = t.id;
      b.innerHTML = `<span class="theme-sw"></span><span></span><span class="theme-check">${ICONS.check}</span>`;
      b.querySelector('.theme-sw').style.background = t.swatch;
      b.children[1].textContent = t.name;
      el.themeMenu.append(b);
    }
  }

  function setMenuOpen(open) {
    el.themeMenu.hidden = !open;
    el.themeBtn.setAttribute('aria-expanded', String(open));
    if (open) { const on = el.themeMenu.querySelector('[aria-checked="true"]'); if (on) on.focus(); }
  }

  buildThemeMenu();
  applyTheme(store.get('theme', 'default'));
  el.themeBtn.addEventListener('click', (e) => { e.stopPropagation(); setMenuOpen(el.themeMenu.hidden); });
  el.themeMenu.addEventListener('click', (e) => {
    const b = e.target.closest('.theme-item');
    if (!b) return;
    applyTheme(b.dataset.theme);
    if (current > -1) setPlayingAccent(tracks[current]);
    setMenuOpen(false);
    el.themeBtn.focus();
  });
  document.addEventListener('click', (e) => { if (!el.themeMenu.hidden && !e.target.closest('.theme-pick')) setMenuOpen(false); });

  /* ---------- covers ---------- */
  function paintCover(node, t) {
    if (!t) { node.style.backgroundImage = ''; node.textContent = ''; return; }
    const custom = Library.coverFor(t);
    if (custom) {
      node.style.backgroundImage = U.coverBackground(custom);
      node.textContent = '';
    } else if (t.art) {
      node.style.backgroundImage = `url("${t.art}")`;
      node.textContent = '';
    } else {
      const h = U.hueOf(t.title + t.artist);
      node.style.backgroundImage = `linear-gradient(135deg, hsl(${h} 55% 50%), hsl(${(h + 55) % 360} 62% 28%))`;
      node.textContent = U.initials(t.title);
    }
  }

  function repTrack(idxs) {
    const list = idxs.map((i) => tracks[i]);
    return list.find((t) => Library.coverFor(t)) || list.find((t) => t.art) || list[0];
  }

  function accentOf(t, cb) {
    if (!t) return cb({ h: 262, s: 60 });
    const custom = Library.coverFor(t);
    const fallback = { h: U.hueOf(t.title + t.artist), s: 60 };
    if (custom) return cb(U.accentFromColors(custom.type === 'gradient' ? custom.colors.slice(0, 2) : [custom.colors[0]]));
    if (t.art) return U.accentFromImage(t.art, cb, fallback);
    cb(fallback);
  }

  function setViewAccent(a) {
    rootStyle.setProperty('--vh', a.h);
    rootStyle.setProperty('--vs', a.s + '%');
  }

  function setPlayingAccent(t) {
    const token = ++accentToken;
    accentOf(t, (a) => {
      if (token !== accentToken) return;
      playingAccent = a;
      rootStyle.setProperty('--h', a.h);
      rootStyle.setProperty('--s', a.s + '%');
      if (currentView === 'all') setViewAccent(a);
    });
  }

  /* ---------- library views ---------- */
  function computeAlbums() {
    const map = new Map();
    tracks.forEach((t, i) => {
      if (!t.album) return;
      if (!map.has(t.album)) map.set(t.album, []);
      map.get(t.album).push(i);
    });
    albums = [...map].map(([name, idxs]) => ({ name, idxs })).sort((a, b) => U.collator.compare(a.name, b.name));
  }

  const deviceIdxs = () => tracks.map((t, i) => (t.device ? i : -1)).filter((i) => i > -1);

  function viewBase() {
    if (currentView === 'device') {
      const d = deviceIdxs();
      if (d.length) return d;
      currentView = 'all';
    }
    if (currentView.startsWith('album:')) {
      const a = albums.find((x) => 'album:' + x.name === currentView);
      if (a) return a.idxs;
      currentView = 'all';
    }
    return tracks.map((_, i) => i);
  }

  function libItem(id, name, sub, t) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'lib-item' + (id === currentView ? ' active' : '');
    b.dataset.view = id;
    if (id === currentView) b.setAttribute('aria-current', 'page');
    b.innerHTML = '<span class="lib-cover"></span><span class="lib-text"><span class="lib-name"></span><span class="lib-sub"></span></span>';
    const cov = b.querySelector('.lib-cover');
    if (t) paintCover(cov, t);
    else { cov.classList.add('all-cover'); cov.innerHTML = ICONS.tape; }
    b.querySelector('.lib-name').textContent = name;
    b.querySelector('.lib-sub').textContent = sub;
    li.append(b);
    return li;
  }

  function renderSidebar() {
    const frag = document.createDocumentFragment();
    frag.append(libItem('all', 'All songs', plural(tracks.length, 'song'), null));
    const dev = deviceIdxs();
    if (dev.length) frag.append(libItem('device', 'On this device', 'Added here, ' + plural(dev.length, 'song'), repTrack(dev)));
    for (const a of albums) frag.append(libItem('album:' + a.name, a.name, 'Album, ' + plural(a.idxs.length, 'song'), repTrack(a.idxs)));
    el.libList.replaceChildren(frag);
  }

  function commonArtist(idxs) {
    const counts = new Map();
    for (const i of idxs) { const a = tracks[i].artist; if (a) counts.set(a, (counts.get(a) || 0) + 1); }
    let best = '', n = 0;
    for (const [a, c] of counts) if (c > n) { best = a; n = c; }
    return best;
  }

  function renderHero() {
    const base = viewBase();
    const isAll = currentView === 'all';
    const isDevice = currentView === 'device';
    el.heroKind.textContent = isAll || isDevice ? 'Collection' : 'Album';
    el.heroTitle.textContent = isAll ? 'All songs' : isDevice ? 'On this device' : currentView.slice(6);
    const total = base.reduce((sum, i) => sum + (tracks[i].duration || 0), 0);
    const parts = [];
    if (!isAll && !isDevice) { const artist = commonArtist(base); if (artist) parts.push(artist); }
    parts.push(plural(base.length, 'song'));
    if (total) parts.push(U.longDuration(total));
    el.heroMeta.textContent = parts.join(', ');
    el.heroPlay.disabled = el.heroShuffle.disabled = !base.length;
    const here = !audio.paused && current > -1 && base.includes(current);
    el.heroPlay.innerHTML = here ? ICONS.pause : ICONS.play;
    el.heroPlay.setAttribute('aria-label', here ? 'Pause' : 'Play');

    if (isAll) {
      el.heroCover.className = 'hero-cover all-cover';
      el.heroCover.style.backgroundImage = '';
      el.heroCover.innerHTML = ICONS.tape;
      setViewAccent(playingAccent);
    } else {
      el.heroCover.className = 'hero-cover';
      const t = repTrack(base);
      paintCover(el.heroCover, t);
      const token = ++viewToken;
      accentOf(t, (a) => { if (token === viewToken && currentView !== 'all') setViewAccent(a); });
    }
  }

  function rowEl(i, n) {
    const t = tracks[i];
    const li = document.createElement('li');
    li.className = 'row' + (i === current ? ' playing' : '');
    li.dataset.i = i;
    li.dataset.n = n;
    li.innerHTML = `<span class="c-num"><span class="num"></span><span class="eq" aria-hidden="true"><i></i><i></i><i></i></span><span class="hp" aria-hidden="true">${ICONS.play}${ICONS.pause}</span></span><span class="c-title"><span class="thumb"></span><span class="tt"><button class="row-play" type="button"></button><span class="row-artist"></span></span></span><span class="c-album"></span><span class="c-time"></span><span class="c-more"><button class="ib small edit" type="button">${ICONS.palette}</button></span>`;
    li.querySelector('.num').textContent = n;
    paintCover(li.querySelector('.thumb'), t);
    const btn = li.querySelector('.row-play');
    btn.textContent = t.title;
    btn.setAttribute('aria-label', `Play ${t.title}${t.artist ? ' by ' + t.artist : ''}`);
    li.querySelector('.row-artist').textContent = t.artist || 'Unknown artist';
    li.querySelector('.c-album').textContent = t.album;
    li.querySelector('.c-time').textContent = t.duration ? U.fmt(t.duration) : '';
    li.querySelector('.edit').setAttribute('aria-label', `Change cover for ${t.title}`);
    return li;
  }

  function renderList() {
    const q = el.search.value.trim().toLowerCase();
    view = viewBase().filter((i) => {
      if (!q) return true;
      const t = tracks[i];
      return `${t.title} ${t.artist} ${t.album}`.toLowerCase().includes(q);
    });
    const frag = document.createDocumentFragment();
    view.forEach((i, k) => frag.append(rowEl(i, k + 1)));
    el.tracks.replaceChildren(frag);

    if (!tracks.length) return;
    if (!view.length) {
      el.empty.hidden = false;
      el.empty.innerHTML = '<strong>No matches</strong><p>Try a different word, or clear the search.</p>';
    } else {
      el.empty.hidden = true;
    }
  }

  function renderAll() {
    renderSidebar();
    renderHero();
    renderList();
  }

  function refreshRow(t) {
    const i = tracks.indexOf(t);
    const old = el.tracks.querySelector(`.row[data-i="${i}"]`);
    if (old) old.replaceWith(rowEl(i, Number(old.dataset.n)));
  }

  let refreshTimer = 0;
  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
      const before = currentView;
      computeAlbums();
      renderSidebar();
      renderHero();
      if (currentView !== 'all' || before !== currentView) renderList();
    }, 500);
  }

  function showEmpty(reason) {
    el.empty.hidden = false;
    let extra = '';
    if (reason === 'local') extra = '<p>This page is open from your computer, so it can’t see your repo. Open your GitHub Pages link, or drop songs here to try it out.</p>';
    else if (reason === 'rate') extra = '<p>GitHub is limiting requests from this network for a bit. Refresh in a few minutes.</p>';
    else if (reason === 'github') extra = '<p>Couldn’t read your repo. If you use a custom domain, fill in <code>githubUser</code> and <code>githubRepo</code> in <code>js/config.js</code>.</p>';
    el.empty.innerHTML = `<strong>No songs yet</strong><p>Upload audio files to the <code>${CONFIG.musicFolder}</code> folder in your GitHub repo, wait a minute, then refresh.</p>${extra}<p>You can also tap the + button to add songs from this device. They stay in this browser.</p>`;
  }

  function openView(id) {
    currentView = id;
    store.set('view', id);
    el.search.value = '';
    renderAll();
    el.main.scrollTop = 0;
    document.body.classList.remove('nav-open');
  }

  /* ---------- playback ---------- */
  function shuffled(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  function buildOrder(list, start) {
    baseList = [...list];
    if (shuffle) {
      order = shuffled(list.filter((x) => x !== start));
      if (start > -1) order.unshift(start);
    } else {
      order = [...list];
    }
    pos = Math.max(0, order.indexOf(start));
  }

  function markPlaying() {
    el.tracks.querySelectorAll('.row.playing').forEach((r) => r.classList.remove('playing'));
    const row = el.tracks.querySelector(`.row[data-i="${current}"]`);
    if (row) row.classList.add('playing');
  }

  function load(i, { play = true, at = 0 } = {}) {
    const t = tracks[i];
    if (!t) return;
    current = i;
    pendingSeek = at;
    audio.src = t.src;
    if (play) audio.play().catch(() => {});
    showNow(t);
    setPlayingAccent(t);
    markPlaying();
    syncHeroPlay();
    store.set('last', { id: t.id, time: at });
  }

  function showNow(t) {
    [el.bigArt, el.stageBg, el.miniArt].forEach((n) => paintCover(n, t));
    el.stageBg.textContent = '';
    el.stageTitle.textContent = t.title;
    el.stageArtist.textContent = [t.artist || 'Unknown artist', t.album].filter(Boolean).join(', ');
    el.nowTitle.textContent = t.title;
    el.nowArtist.textContent = t.artist || 'Unknown artist';
    el.nowCoverBtn.hidden = false;
    document.title = `${t.title}${t.artist ? ' – ' + t.artist : ''}`;
    if ('mediaSession' in navigator) {
      const custom = Library.coverFor(t);
      const src = custom ? U.coverDataUrl(custom) : t.art ? new URL(t.art, location.href).href : '';
      navigator.mediaSession.metadata = new MediaMetadata({
        title: t.title, artist: t.artist, album: t.album,
        artwork: src ? [{ src, sizes: '512x512' }] : []
      });
    }
  }

  function playFrom(i, list = view) {
    buildOrder(list, i);
    load(i);
  }

  function playList(list, shuffleIt) {
    if (!list.length) return;
    setShuffle(shuffleIt);
    playFrom(shuffleIt ? list[Math.floor(Math.random() * list.length)] : list[0], list);
  }

  function togglePlay() {
    if (current < 0) { playList(view, shuffle); return; }
    if (audio.paused) audio.play().catch(() => {}); else audio.pause();
  }

  function next(auto = false) {
    if (!order.length) return;
    if (auto && repeat === 'one') { audio.currentTime = 0; audio.play().catch(() => {}); return; }
    if (pos < order.length - 1) {
      pos++;
    } else if (repeat === 'all' || !auto) {
      if (shuffle) order = shuffled(baseList);
      pos = 0;
    } else {
      audio.pause();
      audio.currentTime = 0;
      return;
    }
    load(order[pos]);
  }

  function prev() {
    if (!order.length) return;
    if (audio.currentTime > 3 || (pos === 0 && repeat !== 'all')) { audio.currentTime = 0; return; }
    pos = pos > 0 ? pos - 1 : order.length - 1;
    load(order[pos]);
  }

  function setShuffle(on) {
    shuffle = on;
    store.set('shuffle', on);
    el.shuffleBtn.setAttribute('aria-pressed', String(on));
    el.shuffleBtn.setAttribute('aria-label', on ? 'Shuffle on' : 'Shuffle off');
    if (baseList.length && current > -1) buildOrder(baseList, current);
  }

  function setRepeat(mode) {
    repeat = mode;
    store.set('repeat', mode);
    el.repeatBtn.innerHTML = mode === 'one' ? ICONS.repeatOne : ICONS.repeat;
    el.repeatBtn.setAttribute('aria-pressed', String(mode !== 'off'));
    el.repeatBtn.setAttribute('aria-label', mode === 'off' ? 'Repeat off' : mode === 'all' ? 'Repeat all' : 'Repeat one');
  }

  function setProgress(p) {
    const pct = (p * 100).toFixed(2) + '%';
    el.seekBar.style.setProperty('--p', pct);
    el.bar.style.setProperty('--p', pct);
  }

  function setVolume(v) {
    audio.volume = v;
    el.volBar.value = v;
    el.volBar.style.setProperty('--p', (audio.muted ? 0 : v * 100) + '%');
    const silent = audio.muted || v === 0;
    el.muteBtn.innerHTML = silent ? ICONS.mute : ICONS.vol;
    el.muteBtn.setAttribute('aria-label', silent ? 'Unmute' : 'Mute');
  }

  /* ---------- audio events ---------- */
  audio.addEventListener('loadedmetadata', () => {
    const t = tracks[current];
    if (t && isFinite(audio.duration) && !t.duration) { t.duration = audio.duration; refreshRow(t); }
    if (pendingSeek && pendingSeek < audio.duration) audio.currentTime = pendingSeek;
    pendingSeek = 0;
    el.durTime.textContent = U.fmt(audio.duration);
  });
  audio.addEventListener('timeupdate', () => {
    if (seeking) return;
    const d = audio.duration || 0;
    el.curTime.textContent = U.fmt(audio.currentTime);
    el.seekBar.value = d ? (audio.currentTime / d) * 1000 : 0;
    setProgress(d ? audio.currentTime / d : 0);
    const now = Date.now();
    if (now - lastSaved > 4000 && tracks[current]) {
      lastSaved = now;
      store.set('last', { id: tracks[current].id, time: audio.currentTime });
    }
  });
  function syncHeroPlay() {
    const here = !audio.paused && current > -1 && viewBase().includes(current);
    el.heroPlay.innerHTML = here ? ICONS.pause : ICONS.play;
    el.heroPlay.setAttribute('aria-label', here ? 'Pause' : 'Play');
  }
  audio.addEventListener('play', () => {
    document.body.classList.add('is-playing');
    el.playBtn.innerHTML = ICONS.pause;
    el.playBtn.setAttribute('aria-label', 'Pause');
    syncHeroPlay();
  });
  audio.addEventListener('pause', () => {
    document.body.classList.remove('is-playing');
    el.playBtn.innerHTML = ICONS.play;
    el.playBtn.setAttribute('aria-label', 'Play');
    syncHeroPlay();
  });
  audio.addEventListener('ended', () => next(true));
  audio.addEventListener('error', () => {
    if (!audio.getAttribute('src')) return;
    const t = tracks[current];
    toast(`Couldn’t play “${t ? t.title : 'this song'}”. Skipping.`);
    setTimeout(() => next(true), 800);
  });

  /* ---------- controls ---------- */
  el.playBtn.addEventListener('click', togglePlay);
  el.nextBtn.addEventListener('click', () => next(false));
  el.prevBtn.addEventListener('click', prev);
  el.shuffleBtn.addEventListener('click', () => setShuffle(!shuffle));
  el.repeatBtn.addEventListener('click', () => setRepeat(repeat === 'off' ? 'all' : repeat === 'all' ? 'one' : 'off'));

  el.heroPlay.addEventListener('click', () => {
    const playingHere = current > -1 && viewBase().includes(current);
    if (playingHere) togglePlay(); else playList(view, false);
  });
  el.heroShuffle.addEventListener('click', () => playList(view, true));

  el.tracks.addEventListener('click', (e) => {
    const row = e.target.closest('.row');
    if (!row) return;
    const i = Number(row.dataset.i);
    if (e.target.closest('.edit')) { openEditor(i); return; }
    if (i === current) togglePlay(); else playFrom(i);
  });

  el.libList.addEventListener('click', (e) => {
    const b = e.target.closest('.lib-item');
    if (b) openView(b.dataset.view);
  });

  el.seekBar.addEventListener('input', () => {
    seeking = true;
    const p = el.seekBar.value / 1000;
    setProgress(p);
    el.curTime.textContent = U.fmt(p * (audio.duration || 0));
  });
  el.seekBar.addEventListener('change', () => {
    if (audio.duration) audio.currentTime = (el.seekBar.value / 1000) * audio.duration;
    seeking = false;
  });

  el.volBar.addEventListener('input', () => {
    audio.muted = false;
    setVolume(Number(el.volBar.value));
    store.set('volume', audio.volume);
  });
  el.muteBtn.addEventListener('click', () => { audio.muted = !audio.muted; setVolume(audio.volume); });

  el.search.addEventListener('input', renderList);
  el.main.addEventListener('scroll', () => el.topbar.classList.toggle('scrolled', el.main.scrollTop > 120), { passive: true });

  el.menuBtn.addEventListener('click', () => document.body.classList.add('nav-open'));
  el.scrim.addEventListener('click', () => document.body.classList.remove('nav-open'));
  el.nowBtn.addEventListener('click', () => { if (current > -1) document.body.classList.add('stage-open'); });
  el.stageClose.addEventListener('click', () => document.body.classList.remove('stage-open'));
  el.nowCoverBtn.addEventListener('click', () => { if (current > -1) openEditor(current); });
  el.stageCoverBtn.addEventListener('click', () => { if (current > -1) openEditor(current); });

  el.exportBtn.addEventListener('click', () => {
    const n = Library.exportCovers();
    toast(n ? `Exported ${plural(n, 'cover')}. Upload covers.json next to index.html in your repo.` : 'No custom covers yet. Pick one with the palette button on any song.', 5000);
  });

  document.addEventListener('keydown', (e) => {
    if (el.dialog.open) return;
    if (!el.themeMenu.hidden && e.key === 'Escape') { setMenuOpen(false); el.themeBtn.focus(); return; }
    const typing = e.target.closest('input[type="search"], input[type="text"], textarea');
    if (e.key === 'Escape') {
      document.body.classList.remove('stage-open', 'nav-open');
      if (typing) e.target.blur();
      return;
    }
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    const onControl = e.target.closest('button, input');
    if (e.key === ' ' && !onControl) { e.preventDefault(); togglePlay(); }
    else if (e.key === '/') { e.preventDefault(); el.search.focus(); }
    else if (e.key === 'ArrowRight' && !onControl) { if (e.shiftKey) next(false); else audio.currentTime += 5; }
    else if (e.key === 'ArrowLeft' && !onControl) { if (e.shiftKey) prev(); else audio.currentTime -= 5; }
  });

  if ('mediaSession' in navigator) {
    const ms = navigator.mediaSession;
    ms.setActionHandler('play', () => audio.play());
    ms.setActionHandler('pause', () => audio.pause());
    ms.setActionHandler('previoustrack', prev);
    ms.setActionHandler('nexttrack', () => next(false));
    try { ms.setActionHandler('seekto', (d) => { audio.currentTime = d.seekTime; }); } catch { /* unsupported */ }
  }

  /* ---------- cover editor ---------- */
  const editor = { i: -1, mode: 'solid', colors: ['#7C5CFF', '#1F1A3D'], angle: 135, stop: 0 };
  const wheel = ColorWheel($('#wheel'), (hex) => { editor.colors[editor.stop] = hex; syncEditor(); });
  const modeBtns = $$('.seg [data-mode]');
  const stopBtns = $$('#cdStops .stop');

  function draft() {
    return editor.mode === 'gradient'
      ? { type: 'gradient', colors: [editor.colors[0], editor.colors[1]], angle: editor.angle }
      : { type: 'solid', colors: [editor.colors[0]] };
  }

  function syncEditor() {
    modeBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === editor.mode)));
    const solid = editor.mode === 'solid';
    el.cdStops.hidden = solid;
    el.cdAngleRow.hidden = solid;
    stopBtns.forEach((b, k) => {
      b.setAttribute('aria-pressed', String(k === editor.stop));
      b.querySelector('.sw').style.background = editor.colors[k];
    });
    el.cdAngle.value = editor.angle;
    el.cdAngle.style.setProperty('--p', (editor.angle / 360) * 100 + '%');
    el.cdAngleVal.textContent = editor.angle + '°';
    el.cdPreview.style.backgroundImage = U.coverBackground(draft());
  }

  function openEditor(i) {
    const t = tracks[i];
    if (!t) return;
    editor.i = i;
    const c = Library.coverFor(t);
    if (c) {
      editor.mode = c.type;
      editor.colors = [c.colors[0], c.colors[1] || c.colors[0]];
      editor.angle = c.angle ?? 135;
    } else {
      const h = U.hueOf(t.title + t.artist);
      editor.mode = 'solid';
      editor.colors = [U.hslToHex(h, 65, 55), U.hslToHex((h + 60) % 360, 70, 25)];
      editor.angle = 135;
    }
    editor.stop = 0;
    el.cdTitle.textContent = `Cover for “${t.title}”`;
    el.cdAlbumRow.hidden = !t.album;
    el.cdAlbum.checked = false;
    el.cdAlbumName.textContent = t.album ? `“${t.album}”` : '';
    el.cdReset.hidden = !c;
    el.cdRemove.hidden = !t.device;
    el.dialog.showModal();
    wheel.set(editor.colors[0]);
    syncEditor();
  }

  function editorTargets() {
    const t = tracks[editor.i];
    if (el.cdAlbum.checked && t.album) return tracks.map((x, k) => (x.album === t.album ? k : -1)).filter((k) => k > -1);
    return [editor.i];
  }

  function afterCoverChange(targets) {
    renderAll();
    if (targets.includes(current)) {
      showNow(tracks[current]);
      setPlayingAccent(tracks[current]);
    }
  }

  modeBtns.forEach((b) => b.addEventListener('click', () => {
    editor.mode = b.dataset.mode;
    editor.stop = 0;
    wheel.set(editor.colors[0]);
    syncEditor();
  }));
  stopBtns.forEach((b, k) => b.addEventListener('click', () => {
    editor.stop = k;
    wheel.set(editor.colors[k]);
    syncEditor();
  }));
  el.cdAngle.addEventListener('input', () => { editor.angle = Number(el.cdAngle.value); syncEditor(); });

  el.cdSave.addEventListener('click', () => {
    const targets = editorTargets();
    Library.setCover(targets.map((k) => tracks[k].id), draft());
    el.dialog.close();
    afterCoverChange(targets);
    if (!store.get('coverTip', false)) {
      store.set('coverTip', true);
      toast('Cover saved in this browser. Use Export covers in the library to keep it on every device.', 5500);
    } else {
      toast('Cover saved.');
    }
  });
  el.cdReset.addEventListener('click', () => {
    const targets = editorTargets();
    Library.setCover(targets.map((k) => tracks[k].id), null);
    el.dialog.close();
    afterCoverChange(targets);
    toast('Original art restored.');
  });
  el.cdCancel.addEventListener('click', () => el.dialog.close());
  el.cdClose.addEventListener('click', () => el.dialog.close());
  el.dialog.addEventListener('click', (e) => { if (e.target === el.dialog) el.dialog.close(); });

  el.cdRemove.addEventListener('click', () => {
    const i = editor.i;
    el.dialog.close();
    removeDeviceTrack(i);
  });

  function resetNow() {
    [el.bigArt, el.stageBg, el.miniArt].forEach((n) => paintCover(n, null));
    el.stageTitle.textContent = 'Nothing playing';
    el.stageArtist.textContent = '';
    el.nowTitle.textContent = 'Nothing playing';
    el.nowArtist.textContent = 'Pick a song to start';
    el.nowCoverBtn.hidden = true;
    el.curTime.textContent = el.durTime.textContent = '0:00';
    el.seekBar.value = 0;
    setProgress(0);
    document.title = CONFIG.siteName;
    document.body.classList.remove('stage-open');
  }

  async function removeDeviceTrack(i) {
    const t = tracks[i];
    if (!t || !t.device) return;
    await Library.removeDeviceTrack(t.id);
    const playing = tracks[current] || null;
    const orderT = order.map((k) => tracks[k]);
    const baseT = baseList.map((k) => tracks[k]);
    if (playing === t) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      resetNow();
    }
    tracks.splice(i, 1);
    URL.revokeObjectURL(t.src);
    current = playing && playing !== t ? tracks.indexOf(playing) : -1;
    if (current > -1) {
      order = orderT.filter((x) => x !== t).map((x) => tracks.indexOf(x));
      baseList = baseT.filter((x) => x !== t).map((x) => tracks.indexOf(x));
      pos = order.indexOf(current);
    } else {
      order = []; baseList = []; pos = -1;
    }
    computeAlbums();
    renderAll();
    toast(`Removed “${t.title}” from this device.`);
  }

  /* ---------- add songs from this device ---------- */
  async function addFiles(list) {
    const files = [...list].filter(Library.isAudioFile);
    if (!files.length) { toast('Those aren’t audio files.'); return; }
    const { tracks: added, saved } = await Library.saveDeviceFiles(files);
    const start = tracks.length;
    tracks.push(...added);
    computeAlbums();
    renderAll();
    Library.enrich(added, onTrackUpdate);
    if (current < 0) playFrom(start, added.map((_, k) => start + k));
    toast(saved
      ? `Added ${plural(added.length, 'song')}. They’ll stay in this browser on this device.`
      : `Added ${plural(added.length, 'song')} for now. This browser can’t save them, so they’ll be gone after a refresh.`, 5000);
  }

  const pickFiles = () => el.fileInput.click();
  el.addBtnSide.addEventListener('click', pickFiles);
  el.addBtnTop.addEventListener('click', pickFiles);
  el.fileInput.addEventListener('change', () => {
    if (el.fileInput.files.length) addFiles(el.fileInput.files);
    el.fileInput.value = '';
  });

  /* ---------- drop songs to add them ---------- */
  let dragDepth = 0;
  const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  document.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; dragDepth++; document.body.classList.add('dragging'); });
  document.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) document.body.classList.remove('dragging'); });
  document.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
  document.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    document.body.classList.remove('dragging');
    addFiles(e.dataTransfer.files);
  });

  /* ---------- start ---------- */
  function onTrackUpdate(t) {
    refreshRow(t);
    if (tracks[current] === t) {
      showNow(t);
      setPlayingAccent(t);
    }
    scheduleRefresh();
  }

  async function start() {
    setShuffle(shuffle);
    setRepeat(repeat);
    setVolume(store.get('volume', 1));

    const [found, , device] = await Promise.all([Library.findSongs(), Library.loadCovers(), Library.loadDeviceTracks()]);
    tracks = (found.paths ? Library.buildTracks(found.paths) : []).concat(device);
    computeAlbums();
    currentView = store.get('view', 'all');
    renderAll();
    if (!tracks.length) { showEmpty(found.reason || 'none'); return; }

    const last = store.get('last', null);
    const i = last ? tracks.findIndex((t) => t.id === last.id) : -1;
    if (i > -1) {
      buildOrder(view.includes(i) ? view : tracks.map((_, k) => k), i);
      load(i, { play: false, at: last.time || 0 });
    }
    Library.enrich(tracks, onTrackUpdate);
  }

  start();
})();
