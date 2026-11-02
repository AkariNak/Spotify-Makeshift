/* Finding songs, reading tags, and storing custom covers */
(() => {
  'use strict';
  const SB = window.SideB;
  const { CONFIG, U, store } = SB;

  const AUDIO_EXT = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|webm)$/i;
  const IMG_EXT = /\.(jpe?g|png|webp|gif)$/i;
  const COVER_NAMES = ['cover', 'folder', 'front', 'album', 'art', 'artwork'];

  /* ---------- where is this site hosted? ---------- */
  function repoInfo() {
    if (CONFIG.githubUser && CONFIG.githubRepo) return { owner: CONFIG.githubUser, repo: CONFIG.githubRepo };
    const host = location.hostname;
    if (!host.endsWith('.github.io')) return null;
    const owner = host.replace(/\.github\.io$/, '');
    const first = location.pathname.split('/').filter(Boolean)[0];
    const repo = first && !first.includes('.') ? first : host;
    return { owner, repo };
  }

  async function fetchTree() {
    const r = repoInfo();
    if (!r) throw new Error('local');
    const refs = CONFIG.branch ? [CONFIG.branch] : ['HEAD', 'main', 'master'];
    let lastErr = new Error('github');
    for (const ref of refs) {
      const res = await fetch(`https://api.github.com/repos/${r.owner}/${r.repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`);
      if (res.ok) {
        const data = await res.json();
        const paths = (data.tree || []).filter((n) => n.type === 'blob').map((n) => n.path);
        store.set('tree', paths);
        return paths;
      }
      lastErr = new Error(res.status === 403 || res.status === 429 ? 'rate' : 'github');
      if (res.status === 403 || res.status === 429) break;
    }
    throw lastErr;
  }

  /* Returns { paths, reason }. Falls back to the last list it saw. */
  async function findSongs() {
    try {
      return { paths: await fetchTree(), reason: '' };
    } catch (err) {
      const reason = err.message || 'github';
      const cached = reason !== 'local' ? store.get('tree', null) : null;
      return { paths: cached, reason };
    }
  }

  function buildTracks(paths) {
    const root = CONFIG.siteFolder ? CONFIG.siteFolder.replace(/^\/+|\/+$/g, '') + '/' : '';
    const folder = root + CONFIG.musicFolder.replace(/^\/+|\/+$/g, '');
    const inFolder = paths.filter((p) => p.startsWith(folder + '/'));
    const covers = new Map();
    for (const p of inFolder.filter((x) => IMG_EXT.test(x))) {
      covers.set('file:' + U.stripExt(p).toLowerCase(), p);
      if (COVER_NAMES.includes(U.stripExt(U.fileOf(p)).toLowerCase())) covers.set('dir:' + U.dirOf(p).toLowerCase(), p);
    }
    const toUrl = (p) => U.encodePath(p.slice(root.length));
    return inFolder
      .filter((p) => AUDIO_EXT.test(p))
      .sort(U.collator.compare)
      .map((p) => {
        const { artist, title } = U.parseName(U.fileOf(p));
        const sub = U.dirOf(p).slice(folder.length).replace(/^\//, '');
        const own = covers.get('file:' + U.stripExt(p).toLowerCase());
        const dirCover = covers.get('dir:' + U.dirOf(p).toLowerCase());
        return {
          id: p,
          src: toUrl(p),
          title,
          artist,
          album: sub ? sub.split('/').pop() : '',
          art: own ? toUrl(own) : dirCover ? toUrl(dirCover) : '',
          artLevel: own ? 3 : dirCover ? 1 : 0,
          duration: 0
        };
      });
  }

  function trackFromFile(f) {
    const { artist, title } = U.parseName(f.name);
    return { id: 'local:' + f.name + ':' + f.size, src: URL.createObjectURL(f), file: f, title, artist, album: '', art: '', artLevel: 0, duration: 0 };
  }
  const isAudioFile = (f) => f.type.startsWith('audio/') || AUDIO_EXT.test(f.name);

  /* ---------- tags + durations ---------- */
  function readTags(t) {
    return new Promise((resolve) => {
      if (!window.jsmediatags) return resolve();
      const source = t.file || new URL(t.src, location.href).href;
      try {
        window.jsmediatags.read(source, {
          onSuccess(tag) {
            const g = tag.tags || {};
            if (g.title) t.title = String(g.title).trim();
            if (g.artist) t.artist = String(g.artist).trim();
            if (g.album) t.album = String(g.album).trim();
            if (g.picture && g.picture.data && t.artLevel < 2) {
              try {
                const blob = new Blob([new Uint8Array(g.picture.data)], { type: g.picture.format || 'image/jpeg' });
                t.art = URL.createObjectURL(blob);
                t.artLevel = 2;
              } catch { /* unreadable image */ }
            }
            resolve();
          },
          onError() { resolve(); }
        });
      } catch { resolve(); }
    });
  }

  function readDuration(t) {
    return new Promise((resolve) => {
      if (t.duration) return resolve();
      const a = new Audio();
      let done = false;
      const finish = () => { if (done) return; done = true; a.removeAttribute('src'); a.load(); resolve(); };
      a.preload = 'metadata';
      a.onloadedmetadata = () => { if (isFinite(a.duration)) t.duration = a.duration; finish(); };
      a.onerror = finish;
      setTimeout(finish, 10000);
      a.src = t.src;
    });
  }

  async function enrich(list, onUpdate) {
    const queue = [...list];
    const worker = async () => {
      while (queue.length) {
        const t = queue.shift();
        await readTags(t);
        await readDuration(t);
        onUpdate(t);
      }
    };
    await Promise.all([worker(), worker(), worker()]);
  }

  /* ---------- custom covers ----------
     covers.json in the repo is shared by every device.
     Covers picked in the browser are kept locally and win over the repo file. */
  let repoCovers = {};
  let localCovers = store.get('covers', {});
  let repoPlaylists = [];
  let localPlaylists = store.get('playlists', null);

  const validPlaylist = (p) => p && typeof p.id === 'string' && typeof p.name === 'string' && Array.isArray(p.ids);

  function valid(c) {
    if (!c || (c.type !== 'solid' && c.type !== 'gradient') || !Array.isArray(c.colors)) return false;
    const need = c.type === 'gradient' ? 2 : 1;
    return c.colors.length >= need && c.colors.slice(0, need).every((x) => U.hexToRgb(x));
  }

  async function loadCovers() {
    try {
      const res = await fetch('covers.json', { cache: 'no-cache' });
      if (!res.ok) return;
      const data = await res.json();
      if (!data || typeof data !== 'object') return;
      const covers = data.covers && typeof data.covers === 'object' ? data.covers : data;
      for (const [k, v] of Object.entries(covers)) if (valid(v)) repoCovers[k] = v;
      if (Array.isArray(data.playlists)) repoPlaylists = data.playlists.filter(validPlaylist);
    } catch { /* no covers file yet */ }
  }

  function coverFor(t) {
    if (!t) return null;
    if (Object.prototype.hasOwnProperty.call(localCovers, t.id)) return valid(localCovers[t.id]) ? localCovers[t.id] : null;
    return repoCovers[t.id] || null;
  }

  function setCover(ids, cover) {
    for (const id of ids) localCovers[id] = cover ? JSON.parse(JSON.stringify(cover)) : null;
    store.set('covers', localCovers);
  }

  function allCovers() {
    const out = { ...repoCovers };
    for (const [k, v] of Object.entries(localCovers)) {
      if (k.startsWith('local:') || k.startsWith('device:')) continue;
      if (valid(v)) out[k] = v; else delete out[k];
    }
    return out;
  }

  /* Playlists: saved in this browser; exported into covers.json with the covers */
  function getPlaylists() { return localPlaylists || repoPlaylists; }
  function savePlaylists(list) { localPlaylists = list; store.set('playlists', list); }

  function exportCovers() {
    const covers = allCovers();
    const shareable = (id) => !id.startsWith('local:') && !id.startsWith('device:');
    const playlists = getPlaylists().map((p) => ({ id: p.id, name: p.name, ids: p.ids.filter(shareable) }));
    const blob = new Blob([JSON.stringify({ covers, playlists }, null, 2) + '\n'], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'covers.json';
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    return { covers: Object.keys(covers).length, playlists: playlists.length };
  }

  /* ---------- songs added on this device ----------
     Kept in the browser's own storage (IndexedDB), so they stay
     after a refresh on that phone or computer. */
  const DB_NAME = 'sideb', STORE = 'files';
  function openDb() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(new Error('no storage'));
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function withStore(mode, fn) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }
  function trackFromRecord(r) {
    const { artist, title } = U.parseName(r.name);
    return { id: r.id, src: URL.createObjectURL(r.blob), file: r.blob, title, artist, album: '', art: '', artLevel: 0, duration: 0, device: true };
  }
  async function loadDeviceTracks() {
    try {
      const recs = (await withStore('readonly', (st) => st.getAll())) || [];
      return recs.sort((a, b) => a.added - b.added).map(trackFromRecord);
    } catch { return []; }
  }
  async function saveDeviceFiles(files) {
    const recs = files.map((f, k) => ({
      id: 'device:' + Date.now().toString(36) + k + Math.random().toString(36).slice(2, 7),
      name: f.name,
      added: Date.now() + k,
      blob: new Blob([f], { type: f.type || 'audio/mpeg' })
    }));
    try {
      await withStore('readwrite', (st) => { recs.forEach((r) => st.put(r)); return null; });
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
      return { tracks: recs.map(trackFromRecord), saved: true };
    } catch {
      return { tracks: recs.map(trackFromRecord), saved: false };
    }
  }
  async function removeDeviceTrack(id) {
    try { await withStore('readwrite', (st) => { st.delete(id); return null; }); } catch { /* already gone */ }
  }

  SB.Library = { findSongs, buildTracks, trackFromFile, isAudioFile, enrich, loadCovers, coverFor, setCover, exportCovers, loadDeviceTracks, saveDeviceFiles, removeDeviceTrack, getPlaylists, savePlaylists };
})();
