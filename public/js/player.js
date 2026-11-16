(() => {
  document.addEventListener('app:ready', async () => {
    if (document.body.dataset.page !== 'live') return;
    const g = (id) => document.getElementById(id);
    const stage = g('stage'), video = g('videoPlayer'), overlay = g('controlsOverlay'), loadingEl = g('loading'), progressBar = g('progressBar'), volumeBar = g('volumeBar');
    const currentTimeEl = g('currentTime'), durationEl = g('duration'), playIcon = g('playIcon'), pauseIcon = g('pauseIcon'), settingsEl = g('settingsPanel'), drawer = g('chDrawer'), shade = g('drShade');
    let controlsTimeout, sp = null, hp = null, channels = [], subscribed = false, cur = null, token = 0, netRetry = 0, mediaRetry = 0, flt = '';
    const goBack = () => { if (history.length > 1) history.back(); else location.href = '/'; };
    /* ---- Controls visibility ---- */
    function showControls() {
      overlay.classList.remove('controls-hidden'); document.body.style.cursor = 'default'; clearTimeout(controlsTimeout);
      if (!video.paused && !settingsEl.classList.contains('active') && !drawer.classList.contains('active')) controlsTimeout = setTimeout(hideControls, 3500);
    }
    function hideControls() { overlay.classList.add('controls-hidden'); document.body.style.cursor = 'none'; settingsEl.classList.remove('active'); }
    document.addEventListener('mousemove', showControls); document.addEventListener('touchstart', showControls);
    video.addEventListener('click', () => togglePlayPause());
    /* ---- Play / Pause ---- */
    function togglePlayPause() { if (video.paused) video.play(); else { video.pause(); showControls(); } }
    g('centerPlayBtn').onclick = togglePlayPause;
    video.addEventListener('play', () => { playIcon.style.display = 'none'; pauseIcon.style.display = ''; showControls(); });
    video.addEventListener('pause', () => { playIcon.style.display = ''; pauseIcon.style.display = 'none'; showControls(); });
    /* ---- Volume ---- */
    const updateVol = () => { const m = video.muted || video.volume === 0; g('volIcon').style.display = m ? 'none' : ''; g('muteIcon').style.display = m ? '' : 'none'; };
    g('muteBtn').onclick = () => { video.muted = !video.muted; volumeBar.value = video.muted ? 0 : video.volume; updateVol(); };
    volumeBar.addEventListener('input', function () { video.volume = parseFloat(this.value); video.muted = video.volume === 0; updateVol(); });
    /* ---- Progress / LIVE ---- */
    const formatTime = (s) => { if (isNaN(s) || s === Infinity || s > 86400 * 30) return '00:00'; const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = Math.floor(s % 60); return (h > 0 ? h + ':' : '') + (m < 10 ? '0' + m : m) + ':' + (x < 10 ? '0' + x : x); };
    video.addEventListener('timeupdate', () => {
      const isLive = video.duration === Infinity || (sp && sp.isLive && sp.isLive()) || (hp && hp.liveSyncPosition) || video.duration > 86400 * 30;
      const badge = g('liveBadge');
      if (isLive) { badge.style.display = 'inline'; currentTimeEl.innerHTML = '<span class="live-indicator"><span class="dot"></span>LIVE</span>'; durationEl.textContent = ''; progressBar.style.visibility = 'hidden'; return; }
      badge.style.display = 'none'; progressBar.style.visibility = 'visible';
      progressBar.value = (video.currentTime / video.duration) * 100 || 0; currentTimeEl.textContent = formatTime(video.currentTime); durationEl.textContent = formatTime(video.duration);
    });
    progressBar.addEventListener('input', () => { if (video.duration && isFinite(video.duration)) video.currentTime = (progressBar.value / 100) * video.duration; });
    /* ---- Fullscreen ---- */
    async function enterFS() { try { if (document.fullscreenElement || document.webkitFullscreenElement) return; if (stage.requestFullscreen) await stage.requestFullscreen(); else if (stage.webkitRequestFullscreen) stage.webkitRequestFullscreen(); else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen(); try { await screen.orientation.lock('landscape'); } catch (_) {} } catch (_) {} }
    const toggleFS = () => { if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document); else enterFS(); };
    g('fsBtn').onclick = toggleFS; video.addEventListener('dblclick', toggleFS);
    document.addEventListener('pointerup', (e) => { if (!e.target.closest('#backBtn,#chDrawer,#drShade,.modal')) enterFS(); }, { once: true });
    /* ---- Settings (ubora + sauti) ---- */
    const LANG = { sw: 'Kiswahili', swa: 'Kiswahili', en: 'English', eng: 'English', fr: 'Français', fra: 'Français', ar: 'العربية', ara: 'العربية', pt: 'Português', es: 'Español', und: 'Default' };
    const langName = (c) => { if (!c) return 'Default'; const k = c.split('-')[0].toLowerCase(); if (LANG[k]) return LANG[k]; try { const n = new Intl.DisplayNames(['en'], { type: 'language' }).of(k); if (n && n !== k) return n; } catch (_) {} return c.toUpperCase(); };
    const optBtn = (box, text, fn) => { const b = document.createElement('button'); b.className = 'quality-btn'; b.textContent = text; b.onclick = () => { fn(); settingsEl.classList.remove('active'); updQ(); }; box.appendChild(b); };
    const dim = '<div class="quality-btn" style="color:#6b7280;font-style:italic">';
    function populate() {
      const q = g('qualityLevels'), a = g('audioTracks'); q.innerHTML = ''; a.innerHTML = '';
      if (sp) {
        const seen = {}; sp.getVariantTracks().sort((x, y) => y.height - x.height).forEach((t) => { if (t.height && !seen[t.height]) { seen[t.height] = 1; optBtn(q, t.height + 'p', () => { sp.configure({ abr: { enabled: false } }); sp.selectVariantTrack(t, true); }); } });
        optBtn(q, '↻ Auto', () => sp.configure({ abr: { enabled: true } }));
        const l = sp.getAudioLanguages(); if (l.length > 1) l.forEach((x) => optBtn(a, langName(x), () => sp.selectAudioLanguage(x))); else a.innerHTML = dim + 'Default</div>';
      } else if (hp) {
        hp.levels.forEach((lv, i) => optBtn(q, (lv.height || '?') + 'p', () => (hp.currentLevel = i))); optBtn(q, '↻ Auto', () => (hp.currentLevel = -1));
        const t = hp.audioTracks || []; if (t.length > 1) t.forEach((x, i) => optBtn(a, langName(x.lang || x.name), () => (hp.audioTrack = i))); else a.innerHTML = dim + 'Default</div>';
      } else { q.innerHTML = dim + 'Auto</div>'; a.innerHTML = dim + 'Default</div>'; }
    }
    // Ubora uliochaguliwa unaonekana ndani ya settings (si kwenye kitufe)
    function curQ() {
      if (sp) { const on = sp.getConfiguration().abr.enabled; const t = sp.getVariantTracks().find((x) => x.active); return on ? 'Auto' : (t && t.height ? t.height + 'p' : ''); }
      if (hp) { const lv = hp.levels || []; return hp.currentLevel === -1 ? 'Auto' : (lv[hp.currentLevel] && lv[hp.currentLevel].height ? lv[hp.currentLevel].height + 'p' : ''); }
      return '';
    }
    function updQ() { const old = document.getElementById('qTag'); if (old) old.remove(); }
    function markQ() {
      const q = g('qualityLevels'), cur = curQ();
      q.insertAdjacentHTML('afterbegin', '<div class="qcur">Ubora sasa: <b>' + (cur || '—') + '</b></div>');
      q.querySelectorAll('.quality-btn').forEach((btn) => btn.classList.toggle('on', btn.textContent === cur));
    }
    g('settingsBtn').onclick = (e) => { e.stopPropagation(); settingsEl.classList.toggle('active'); if (settingsEl.classList.contains('active')) { populate(); markQ(); } showControls(); };
    /* ---- Loading / Error ---- */
    function setLoading(on, name, logo) {
      loadingEl.style.display = on ? 'flex' : 'none'; loadingEl.style.opacity = '1';
      if (name) g('loadTitle').textContent = name;
      const ic = g('loadIcon'); if (logo) ic.innerHTML = `<img src="${esc(logo)}" alt="">`;
    }
    function showError(title, msg, detail) {
      setLoading(false); g('errTitle').textContent = title; g('errMsg').textContent = msg;
      const d = g('errDetail'); d.style.display = detail ? 'block' : 'none'; d.textContent = detail || '';
      g('errorPanel').classList.add('active'); showControls();
    }
    g('retryBtn').onclick = () => play(cur);
    function shakaErr(e) {
      const code = e && e.code, cat = e && e.category; let msg = 'Video haipatikani kwa sasa.';
      if (cat === 1) msg = 'Server imekataa video hii au mtandao una shida.'; else if (cat === 6) msg = 'Tatizo la ufunguo (ClearKey) wa channel hii.'; else if (e && e.message && !code) msg = e.message;
      showError('Imeshindikana', msg, code ? 'Code: ' + code : '');
    }
    /* ---- Cheza channel ---- */
    async function destroy() {
      if (hp) { hp.destroy(); hp = null; } if (sp) { try { await sp.destroy(); } catch (_) {} sp = null; }
      video.pause(); video.removeAttribute('src'); video.load();
    }
    let guardT = null;
    const stopGuard = () => { if (guardT) { clearInterval(guardT); guardT = null; } };
    const startGuard = () => {
      stopGuard();
      guardT = setInterval(async () => {
        const id = cur; if (!id) return;
        let r; try { r = await api(`/channels/${id}/access`); } catch (_) { return; }
        if (r.allowed || cur !== id) return;
        stopGuard();
        token++;
        await destroy();
        setLoading(false);
        gate(r.reason === 'match' ? 'match' : r.reason === 'login' ? 'login' : 'subscribe', id, r.offer, { onClose: goBack });
      }, 20000);
    };
    async function play(id) {
      const my = ++token; cur = Number(id); netRetry = 0; mediaRetry = 0; startGuard();
      g('errorPanel').classList.remove('active'); settingsEl.classList.remove('active'); setDrawer(false); renderDrawer();
      const meta = channels.find((c) => c.id === cur); setLoading(true, meta ? meta.name : 'Inapakia…', meta && meta.logo_url);
      await destroy(); if (my !== token) return;
      let info;
      try { info = await api(`/channels/${cur}/play`); }
      catch (e) {
        if (my !== token) return; setLoading(false);
        const offer = e.data && e.data.offer;
        if (e.status === 401) return gate('login', cur, offer, { onClose: goBack });
        if (e.status === 403) return gate(e.data && e.data.reason === 'match' ? 'match' : 'subscribe', cur, offer, { onClose: goBack });   // hata kwa link ya moja kwa moja
        return showError('Hitilafu', e.message);
      }
      if (my !== token) return;
      g('chName').textContent = info.name; document.title = info.name;
      const lg = g('chLogo'); lg.hidden = !info.logo_url; if (info.logo_url) lg.src = info.logo_url;
      history.replaceState(null, '', '/live-tv?ch=' + cur);
      window.__curCh = cur;   // channel ya sasa kwa heartbeat ya dashboard
      const H = info.headers || {}, hasH = Object.keys(H).length > 0;
      try {
        if (info.type === 'dash') {
          if (!window.shaka) throw new Error('Player ya MPD haikupakiwa. Angalia mtandao.');
          shaka.polyfill.installAll(); if (!shaka.Player.isBrowserSupported()) throw new Error('Browser hii haiungi mkono MPD.');
          sp = new shaka.Player(video);
          if (hasH) sp.getNetworkingEngine().registerRequestFilter((t, req) => { for (const k in H) req.headers[k] = H[k]; });
          const cfg = { streaming: { retryParameters: { maxAttempts: 3 } } };
          if (info.clearkeys && Object.keys(info.clearkeys).length) cfg.drm = { clearKeys: info.clearkeys };     // kid:key (hex)
          sp.configure(cfg); sp.addEventListener('error', (e) => shakaErr(e.detail));
          await sp.load(info.url); if (my !== token) return;
          // Ubora wa chini kabisa kwanza; mtumiaji akitaka mkubwa, atabadilisha mwenyewe
          const vt = sp.getVariantTracks().filter((t) => t.height).sort((a, b) => a.height - b.height);
          if (vt.length) { sp.configure({ abr: { enabled: false } }); sp.selectVariantTrack(vt[0], true); }
          updQ();
        } else if (window.Hls && Hls.isSupported()) {
          hp = new Hls({ enableWorker: true, xhrSetup: hasH ? (x) => { for (const k in H) { try { x.setRequestHeader(k, H[k]); } catch (_) {} } } : undefined });
          hp.on(Hls.Events.ERROR, (_, d) => {
            if (!d.fatal) return;
            if (d.type === Hls.ErrorTypes.NETWORK_ERROR && netRetry++ < 2) return hp.startLoad();
            if (d.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRetry++ < 1) return hp.recoverMediaError();
            showError(d.type === Hls.ErrorTypes.NETWORK_ERROR ? 'Tatizo la Mtandao' : 'Playback Error', d.type === Hls.ErrorTypes.NETWORK_ERROR ? 'Haikuweza kupata video. Angalia internet yako.' : 'Video haiwezi kucheza.', d.details);
          });
          // Ubora wa chini kabisa kwanza
          hp.on(Hls.Events.MANIFEST_PARSED, () => {
            const lv = hp.levels || []; if (!lv.length) return;
            let lo = 0;
            lv.forEach((l, i) => { const a = l.height || 1e9, b = lv[lo].height || 1e9; if (a < b || (a === b && (l.bitrate || 0) < (lv[lo].bitrate || 0))) lo = i; });
            hp.currentLevel = lo; updQ();
          });
          hp.loadSource(info.url); hp.attachMedia(video);
        } else { video.src = info.url; }
        video.play().catch(() => {});
        loadingEl.style.opacity = '0'; setTimeout(() => { if (my === token) loadingEl.style.display = 'none'; }, 600); showControls();
      } catch (e) { shakaErr(e); }
    }
    // Skrini isizime wakati video inacheza (Screen Wake Lock)
    let wakeLock = null;
    const keepAwake = async () => {
      try {
        if ('wakeLock' in navigator && !wakeLock) {
          wakeLock = await navigator.wakeLock.request('screen');
          wakeLock.addEventListener('release', () => { wakeLock = null; });
        }
      } catch (_) {}
    };
    const letSleep = () => { if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; } };
    // Kivinjari kinaweza kuachia lock tab ikifichwa: turudishe tukirudi kwenye tab
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !video.paused && !video.ended) keepAwake(); });
    video.addEventListener('pause', letSleep);
    video.addEventListener('ended', letSleep);
    window.addEventListener('pagehide', letSleep);
    // Heartbeat nyepesi kwa dashboard ya admin: ping moja kila sekunde 30 tu wakati video inacheza
    let beatT = null;
    // Eneo la mtumiaji: browser inaomba ruhusa. Koordinati zinapunguzwa hadi ~1km kabla ya kutumwa.
    let geoPt = null, geoAt = 0, geoAsked = false;
    const locateOnce = () => {
      if (geoAsked && Date.now() - geoAt < 30 * 60e3) return;
      if (!navigator.geolocation) return;
      geoAsked = true;
      navigator.geolocation.getCurrentPosition((pos) => {
        geoPt = { lat: Math.round(pos.coords.latitude * 100) / 100, lon: Math.round(pos.coords.longitude * 100) / 100 };
        geoAt = Date.now();
      }, () => {}, { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 });
    };
    const beatNow = (playing) => {
      const ch = Number(window.__curCh || new URLSearchParams(location.search).get('ch'));
      if (!ch) return;
      fetch('/api/live/ping', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' }, body: JSON.stringify({ channel_id: ch, playing: !!playing, lat: geoPt && geoPt.lat, lon: geoPt && geoPt.lon }), keepalive: true, credentials: 'same-origin' }).catch(() => {});
    };
    const startBeat = () => { if (beatT) return; locateOnce(); beatNow(true); beatT = setInterval(() => beatNow(true), 30000); };
    const stopBeat = () => { clearInterval(beatT); beatT = null; beatNow(false); };
    video.addEventListener('playing', () => { setLoading(false); keepAwake(); startBeat(); });
    video.addEventListener('pause', stopBeat);
    video.addEventListener('ended', stopBeat);
    window.addEventListener('pagehide', stopBeat);
    video.addEventListener('error', () => { if (!sp) showError('Imeshindikana', 'Video haiwezi kucheza kwenye kifaa hiki.'); });
    window.addEventListener('offline', () => showError('Hakuna mtandao', 'Angalia muunganisho wako.'));
    window.addEventListener('online', () => { if (cur) play(cur); });
    g('backBtn').onclick = goBack;
    /* ---- Menyu ya mistari mitatu: orodha ya channels ----
       Mwenye kifurushi hai => channels zote (bila lebo). Asiye nacho => channels za bure (zenye lebo). */
    const visible = () => (subscribed ? channels : channels.filter((c) => c.access_type === 'FREE' || c.owned));
    function renderDrawer() {
    // Channel iliyofichwa (inafunguliwa kwa link tu): kitufe cha orodha hakionekani
    const listed = channels.some((c) => c.id === cur);
    g('menuBtn').style.display = listed ? '' : 'none';
    const bb = document.getElementById('backBtn'); if (bb) bb.style.display = listed ? '' : 'none';
    if (!listed) drawer.classList.remove('active');
      const list = visible().filter((c) => !flt || c.name.toLowerCase().includes(flt));
      g('drNote').innerHTML = subscribed ? '' : '<div class="dr-note">Unaona channels za bure tu. <a href="/packages">Nunua kifurushi</a> kufungua zote.</div>';
      const groups = {}; list.forEach((c) => { (groups[c.category || 'Nyingine'] = groups[c.category || 'Nyingine'] || []).push(c); });
      g('drList').innerHTML = Object.keys(groups).length ? Object.keys(groups).map((k) => `<div class="dr-cat">${esc(k)}</div>` + groups[k].map((c) => `<button class="dr-it ${c.id === cur ? 'on' : ''}" data-id="${c.id}"><span class="dr-ic" style="--h:${chHue(c.name)}">${chLogo(c)}</span><span class="dr-nm">${esc(c.name)}</span></button>`).join('')).join('') : '<div class="dr-note">Hakuna channel.</div>';
      document.querySelectorAll('.dr-it').forEach((b) => (b.onclick = () => play(b.dataset.id)));
    }
    function setDrawer(open) {
      drawer.classList.toggle('active', open); shade.classList.toggle('active', open); drawer.setAttribute('aria-hidden', open ? 'false' : 'true');
      if (open) {
        settingsEl.classList.remove('active'); showControls();
        const list = g('drList'), a = list.querySelector('.dr-it.on');
        if (a) list.scrollTop = Math.max(0, a.offsetTop - list.clientHeight / 2 + a.offsetHeight / 2);
      } else { g('drQ').blur(); showControls(); }
    }
    g('menuBtn').onclick = (e) => { e.stopPropagation(); setDrawer(!drawer.classList.contains('active')); };
    g('drClose').onclick = () => setDrawer(false);
    shade.onclick = () => setDrawer(false);
    let sx = null;                                                    // telezesha kulia kufunga
    drawer.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
    drawer.addEventListener('touchend', (e) => { if (sx !== null && e.changedTouches[0].clientX - sx > 70) setDrawer(false); sx = null; }, { passive: true });
    const pin = () => { if (stage.scrollLeft || stage.scrollTop) { stage.scrollLeft = 0; stage.scrollTop = 0; } const d = document.scrollingElement; if (d && (d.scrollLeft || d.scrollTop)) { d.scrollLeft = 0; d.scrollTop = 0; } };
    [stage, window, document].forEach((t) => t.addEventListener('scroll', pin, { passive: true }));
    g('drQ').oninput = (e) => { flt = e.target.value.trim().toLowerCase(); renderDrawer(); };
    const step = (d) => { const l = visible(); if (!l.length) return; const i = l.findIndex((c) => c.id === cur); play(l[(i + d + l.length) % l.length].id); };
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === 'ArrowUp' || e.key === 'ChannelUp') step(-1); else if (e.key === 'ArrowDown' || e.key === 'ChannelDown') step(1);
      else if (e.key === ' ' || e.key === 'Enter') togglePlayPause(); else if (e.key.toLowerCase() === 'f') toggleFS(); else if (e.key.toLowerCase() === 'm') setDrawer(!drawer.classList.contains('active'));
      else if (e.key === 'Escape') { setDrawer(false); settingsEl.classList.remove('active'); }
    });
    /* ---- Anza ---- */
    try { const r = await api('/channels'); channels = r.channels; subscribed = !!r.subscribed; } catch (e) { return showError('Hitilafu', e.message); }
    renderDrawer();
    const want = Number(new URLSearchParams(location.search).get('ch'));
    if (want) { play(want); return; }                 // channel iliyofichwa bado inacheza ikifunguliwa kwa ID
    const start = visible()[0] || channels[0];
    if (!start) return showError('Hakuna channel', 'Hakuna channel kwa sasa.');
    play(start.id);
  });
})();
