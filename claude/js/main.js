/* =========================================================================
   云鲸归途 · CLOUDWHALE VOYAGE — 开始菜单逻辑
   零依赖、可直接以 file:// 打开（不使用 fetch，图层配置来自 js/scene-config.js）。

   1. 工具与存储（设置 / 存档，localStorage，失败时退回内存）
   2. 场景：按 CW_SCENE 生成图层 → 布局（cover / 锚点放置 / 横向平铺）
            → 每帧：视差（鼠标或自动漂移）+ 云层无缝滚动
   3. 粒子：canvas 光尘与萤火
   4. 音频：Web Audio 实时合成的环境音乐与界面音效（三个音量滑块真实生效）
   5. 菜单与面板：键盘/鼠标同步选中、设置、制作人员、开始/继续、退出
   6. 进场动画与启动
   ========================================================================= */
(() => {
  'use strict';

  const SCENE = window.CW_SCENE;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const rand = (a, b) => a + Math.random() * (b - a);

  const app = $('#app');
  const ui = $('#ui');
  const params = new URLSearchParams(location.search);

  /* =======================================================================
     1. 存储
     ======================================================================= */
  const KEYS = { settings: 'cloudwhale.settings.v1', save: 'cloudwhale.save.v1' };
  const memStore = {};
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return k in memStore ? memStore[k] : null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { memStore[k] = v; } },
    remove(k) { try { localStorage.removeItem(k); } catch (e) { delete memStore[k]; } },
  };

  const mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const DEFAULTS = { master: 80, music: 60, sfx: 70, parallax: true, reduceMotion: false };

  /** 读取设置；首次访问（无存储）时“减少动态/视差”跟随系统偏好 */
  function loadSettings() {
    let saved = null;
    try { saved = JSON.parse(store.get(KEYS.settings) || 'null'); } catch (e) { saved = null; }
    const s = Object.assign({}, DEFAULTS, saved || {});
    if (!saved) {
      s.reduceMotion = mqReduce.matches;
      s.parallax = !mqReduce.matches;
    }
    return { values: s, explicit: !!saved };
  }
  const loaded = loadSettings();
  const settings = loaded.values;
  let settingsExplicit = loaded.explicit;

  function saveSettings() {
    store.set(KEYS.settings, JSON.stringify(settings));
    settingsExplicit = true;
  }

  function readSave() {
    try {
      const v = JSON.parse(store.get(KEYS.save) || 'null');
      return v && v.chapter ? v : null;
    } catch (e) { return null; }
  }
  function writeSave() {
    const save = { chapter: '序章 · 云海边的灯', chapterEn: 'PROLOGUE', savedAt: Date.now() };
    store.set(KEYS.save, JSON.stringify(save));
    return save;
  }
  const fmtTime = (ms) => {
    const d = new Date(ms);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  /* =======================================================================
     2. 场景
     ======================================================================= */
  const sceneEl = $('#scene');
  const view = { w: 1, h: 1, s: 1 };
  // 与 CSS 相同的断点：竖屏/方屏/窄屏 → 标题在上、菜单在下（“堆叠布局”）
  const mqStacked = window.matchMedia('(max-aspect-ratio: 1/1), (max-width: 760px)');
  const layers = [];

  /** 依据配置创建 DOM：.layer（混合模式/进场透明度）> .layer__move（视差）> .layer__box|.layer__strip */
  function buildScene() {
    const before = $('#particles');
    for (const cfg of SCENE.layers) {
      const el = document.createElement('div');
      el.className = `layer layer--${cfg.id}`;
      el.style.zIndex = String(cfg.z);
      el.style.setProperty('--op', String(cfg.opacity));
      el.style.setProperty('--delay', `${cfg.intro}ms`);
      if (cfg.blend && cfg.blend !== 'normal') el.style.mixBlendMode = cfg.blend;

      const move = document.createElement('div');
      move.className = 'layer__move';
      el.appendChild(move);

      const L = { cfg, el, move, iw: 0, ih: 0, offset: Math.random() * 400, tileW: 0 };
      if (cfg.fit === 'tile') {
        L.strip = document.createElement('div');
        L.strip.className = 'layer__strip';
        move.appendChild(L.strip);
      } else {
        L.box = document.createElement('div');
        L.box.className = 'layer__box';
        L.img = document.createElement('img');
        L.img.alt = '';
        L.img.draggable = false;
        L.box.appendChild(L.img);
        move.appendChild(L.box);
      }
      sceneEl.insertBefore(el, before);
      layers.push(L);
    }
    // 图层上的暖光点（灯笼闪烁、鲸背窗灯闪烁）
    for (const g of SCENE.glows || []) {
      const L = layers.find((l) => l.cfg.id === g.layer);
      if (!L || !L.box) continue;
      const d = document.createElement('div');
      d.className = `glow glow--${g.kind}`;
      d.style.left = `${g.x * 100}%`;
      d.style.top = `${g.y * 100}%`;
      d.style.width = `${g.r * 200}%`;
      if (g.kind === 'twinkle') {
        d.style.setProperty('--dur', `${rand(2.4, 5.2).toFixed(2)}s`);
        d.style.setProperty('--del', `${rand(-5, 0).toFixed(2)}s`);
      }
      L.box.appendChild(d);
    }
  }

  /** 先试 WebP，失败再退回 PNG */
  function loadImage(file) {
    return new Promise((resolve) => {
      const attempt = (src, fallback) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = () => (fallback ? attempt(fallback, null) : resolve(null));
        im.src = src;
      };
      attempt(`assets/layers/${file}.webp`, `assets/layers/${file}.webp`);
    });
  }

  async function loadLayers() {
    await Promise.all(layers.map(async (L) => {
      const im = await loadImage(L.cfg.file);
      if (!im) { console.warn('[cloudwhale] 缺少图层', L.cfg.file); L.missing = true; return; }
      L.iw = im.naturalWidth;
      L.ih = im.naturalHeight;
      if (L.strip) L.strip.style.backgroundImage = `url("${im.src}")`;
      else L.img.src = im.src;
      try { await im.decode(); } catch (e) { /* 已加载即可 */ }
    }));
  }

  function setBox(el, x, y, w, h) {
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
  }

  /**
   * 布局。设计稿 1920×1080：
   *  - s = cover 缩放，但限制“至少看得到 minVisibleW × minVisibleH 的设计区域”，
   *    这样竖屏/超宽屏下主体不会被裁掉太多；
   *  - cover 层（天空、光）始终铺满视口并多留出视差余量 → 任何比例都不露底；
   *  - place 层按 anchor 钉在视口的对应位置（例如前景钉左下角）；
   *  - tile 层横向无限平铺，纵向按 anchor 定位，并在素材里向下延伸以覆盖底边。
   */
  function layout() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const D = SCENE.design;
    const sCover = Math.max(vw / D.w, vh / D.h);
    const s = Math.min(sCover, vw / D.minVisibleW, vh / D.minVisibleH);
    view.w = vw; view.h = vh; view.s = s;
    const amp = SCENE.parallaxAmp;
    const stacked = mqStacked.matches;
    const colRect = $('.ui-column').getBoundingClientRect();

    for (const L of layers) {
      if (L.missing || !L.iw) continue;
      const c = L.cfg;
      const mx = amp.x * c.parallax * s + 3;   // 视差余量
      const my = amp.y * c.parallax * s + 3;
      if (c.fit === 'cover') {
        const S = Math.max((vw + 2 * mx) / L.iw, (vh + 2 * my) / L.ih);
        const w = L.iw * S;
        const h = L.ih * S;
        const f = c.focus || [0.5, 0.5];
        setBox(L.box, -mx + (vw + 2 * mx - w) * f[0], -my + (vh + 2 * my - h) * f[1], w, h);
      } else if (c.fit === 'place') {
        const r = placeRect(L, c, vw, vh, s, stacked, colRect);
        setBox(L.box, r.x, r.y, r.w, r.h);
      } else {
        const a = c.anchor || [0.5, 1];
        const th = c.h * s;
        const tw = th * L.iw / L.ih;
        L.tileW = tw;
        L.offset %= tw;
        const st = L.strip.style;
        st.top = `${vh * a[1] + (c.y - D.h * a[1]) * s}px`;
        st.height = `${th}px`;
        st.left = `${-tw - mx}px`;
        st.width = `${vw + 2 * tw + 2 * mx}px`;
        st.backgroundSize = `${tw}px ${th}px`;
      }
    }
    particles.resize();
    menu.updateIndicator();
  }

  /**
   * “place” 图层的矩形。默认：设计稿坐标 × s，按 anchor 钉在视口上。
   * 另有两条自适应规则（见 scene-config.js）：
   *  - 堆叠布局 portrait.slot：等比放进指定元素（标题与菜单之间的空位）里；
   *    portrait.fitW/maxH：按视口比例定尺寸，钉在 anchor 角上（前景钉左下角）。
   *  - 横屏 keepLeftOfUI：窄横屏（4:3、5:4）时让鲸不跑出左边，并最多压住 UI 列宽度的一小部分，
   *    否则等比缩小。
   */
  function placeRect(L, c, vw, vh, s, stacked, colRect) {
    const D = SCENE.design;
    const a = c.anchor || [0.5, 0.5];
    const ratio = L.ih / L.iw;
    const P = c.portrait;
    if (stacked && P) {
      if (P.slot) {
        const r = $(P.slot).getBoundingClientRect();
        if (r.width > 10 && r.height > 10) {
          const fill = P.fill || 1;
          const w = Math.min(r.width * fill, (r.height * fill) / ratio, vw * 0.92);
          const h = w * ratio;
          return { x: r.left + (r.width - w) / 2, y: r.top + (r.height - h) / 2, w, h };
        }
      } else if (P.fitW) {
        const w = Math.min(vw * P.fitW, (vh * (P.maxH || 1)) / ratio);
        const h = w * ratio;
        const over = 0.02 * w;   // 稍微超出边缘，视差时不露边
        return { x: a[0] < 0.5 ? -over : vw - w + over, y: a[1] > 0.5 ? vh - h + over : -over, w, h };
      }
    }
    let w = c.w * s;
    let h = w * ratio;
    let x = vw * a[0] + (c.x - D.w * a[0]) * s;
    let y = vh * a[1] + (c.y - D.h * a[1]) * s;
    if (!stacked && c.keepLeftOfUI != null && colRect.width > 0) {
      const minX = vw * 0.015;
      if (x < minX) x = minX;
      const maxRight = colRect.left + colRect.width * c.keepLeftOfUI;
      if (x + w > maxRight) {
        const k = Math.max(0.55, (maxRight - x) / w);
        y += (h - h * k) / 2;
        w *= k;
        h *= k;
      }
    }
    return { x, y, w, h };
  }

  // ---- 视差输入 ----
  const pointer = { x: 0, y: 0, last: -1e9 };
  const cam = { x: 0, y: 0 };
  const POINTER_HOLD_MS = 2600;   // 鼠标静止这么久后，切换回自动漂移

  window.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    pointer.x = clamp((e.clientX / view.w) * 2 - 1, -1, 1);
    pointer.y = clamp((e.clientY / view.h) * 2 - 1, -1, 1);
    pointer.last = performance.now();
  }, { passive: true });
  document.documentElement.addEventListener('mouseleave', () => { pointer.last = -1e9; });

  let lastT = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    const t = now / 1000;

    // 目标镜头位置：视差关闭 → 归零；有鼠标 → 跟随；否则缓慢自动漂移（减少动态时不漂移）
    let tx = 0;
    let ty = 0;
    const usingPointer = now - pointer.last < POINTER_HOLD_MS;
    if (settings.parallax) {
      if (usingPointer) {
        tx = pointer.x; ty = pointer.y;
      } else if (!settings.reduceMotion) {
        tx = 0.55 * Math.sin(t * 0.11) + 0.18 * Math.sin(t * 0.29 + 0.7);
        ty = 0.42 * Math.sin(t * 0.083 + 1.3);
      }
    }
    // 跟随鼠标较快；自动漂移很慢；关闭视差时约 1 秒平滑回正
    const rate = !settings.parallax ? 2.6 : (usingPointer ? 3.2 : 0.9);
    const k = 1 - Math.exp(-dt * rate);
    cam.x += (tx - cam.x) * k;
    cam.y += (ty - cam.y) * k;

    const amp = SCENE.parallaxAmp;
    const cloudSpeed = settings.reduceMotion ? 0 : 1;
    for (const L of layers) {
      const p = L.cfg.parallax * view.s;
      const dx = -cam.x * amp.x * p;
      const dy = -cam.y * amp.y * p;
      L.move.style.transform = `translate3d(${dx.toFixed(2)}px, ${dy.toFixed(2)}px, 0)`;
      if (L.strip && L.tileW) {
        // 向右缓慢流动；素材已做成左右无缝，取模即可无限循环
        L.offset = (L.offset + (L.cfg.speed || 0) * view.s * dt * cloudSpeed) % L.tileW;
        L.strip.style.transform = `translate3d(${L.offset.toFixed(2)}px, 0, 0)`;
      }
    }
    particles.step(dt, t);
    requestAnimationFrame(frame);
  }

  /* =======================================================================
     3. 粒子（光尘 mote + 萤火 fly），全部程序生成
     ======================================================================= */
  const particles = (() => {
    const canvas = $('#particles');
    const ctx = canvas.getContext('2d');
    let list = [];
    let dpr = 1;

    function makeSprite(inner, mid) {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d');
      const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grd.addColorStop(0, inner);
      grd.addColorStop(0.22, mid);
      grd.addColorStop(1, 'rgba(255,170,90,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 64, 64);
      return c;
    }
    const moteSprite = makeSprite('rgba(255,246,222,1)', 'rgba(255,214,160,.45)');
    const flySprite = makeSprite('rgba(255,236,170,1)', 'rgba(255,176,84,.5)');

    function spawnMote(anywhere) {
      return {
        kind: 'mote',
        x: rand(-20, view.w + 20),
        y: anywhere ? rand(0, view.h) : view.h + rand(5, 40),
        z: rand(0.25, 1),
        r: rand(0.6, 1.9),
        vx: rand(3, 11),
        vy: -rand(2, 8),
        ph: rand(0, 6.28),
        tw: rand(0.5, 1.7),
        a: rand(0.25, 0.75),
      };
    }
    function spawnFly() {
      // 萤火多出现在崖边与云海上方
      const nearCliff = Math.random() < 0.45;
      return {
        kind: 'fly',
        bx: nearCliff ? rand(0.02, 0.36) * view.w : rand(0.3, 1) * view.w,
        by: nearCliff ? rand(0.5, 0.9) * view.h : rand(0.58, 0.96) * view.h,
        z: rand(0.6, 1),
        r: rand(1.6, 3),
        ax: rand(18, 60), ay: rand(12, 38),
        f1: rand(0.08, 0.22), f2: rand(0.15, 0.4),
        p1: rand(0, 6.28), p2: rand(0, 6.28),
        pf: rand(0.35, 0.9), pp: rand(0, 6.28),
        rise: rand(2, 7),
      };
    }

    function populate() {
      const area = view.w * view.h;
      const f = settings.reduceMotion ? 0.35 : 1;
      const nMote = Math.round(clamp(area / 13000, 40, 150) * f);
      const nFly = Math.round(clamp(area / 110000, 6, 20) * f);
      list = [];
      for (let i = 0; i < nMote; i++) list.push(spawnMote(true));
      for (let i = 0; i < nFly; i++) list.push(spawnFly());
    }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(view.w * dpr);
      canvas.height = Math.round(view.h * dpr);
      populate();
    }

    function step(dt, t) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, view.w, view.h);
      ctx.globalCompositeOperation = 'lighter';
      const m = settings.reduceMotion ? 0 : 1;     // 减少动态：粒子静止、不闪烁
      const amp = SCENE.parallaxAmp;
      const s = view.s;
      for (let i = 0; i < list.length; i++) {
        let p = list[i];
        const par = 0.35 + 0.55 * p.z;              // 近大远小
        const ox = -cam.x * amp.x * par * s;
        const oy = -cam.y * amp.y * par * s;
        let x; let y; let alpha; let size; let sprite;
        if (p.kind === 'mote') {
          p.x += p.vx * p.z * s * dt * m;
          p.y += (p.vy * p.z + Math.sin(t * 0.6 + p.ph) * 3) * s * dt * m;
          if (p.x > view.w + 30) p.x = -30;
          if (p.y < -30) { list[i] = p = spawnMote(false); }
          x = p.x; y = p.y;
          alpha = p.a * (m ? 0.55 + 0.45 * Math.sin(t * p.tw + p.ph) : 0.8);
          size = p.r * 7 * p.z + 2;
          sprite = moteSprite;
        } else {
          p.by -= p.rise * s * dt * m;
          if (p.by < view.h * 0.35) { list[i] = p = spawnFly(); }
          const tt = m ? t : 0;
          x = p.bx + (Math.sin(tt * p.f1 + p.p1) + 0.5 * Math.sin(tt * p.f2 + p.p2)) * p.ax * s;
          y = p.by + (Math.cos(tt * p.f1 * 1.3 + p.p2) + 0.5 * Math.sin(tt * p.f2 * 0.8 + p.p1)) * p.ay * s;
          const pulse = 0.5 + 0.5 * Math.sin(tt * p.pf + p.pp);
          alpha = m ? 0.15 + 0.85 * pulse * pulse : 0.6;
          size = p.r * 9 * s + 4;
          sprite = flySprite;
        }
        ctx.globalAlpha = clamp(alpha, 0, 1);
        ctx.drawImage(sprite, x + ox - size / 2, y + oy - size / 2, size, size);
      }
      ctx.globalAlpha = 1;
    }

    return { resize, populate, step };
  })();

  /* =======================================================================
     4. 音频：Web Audio 实时合成（无音频文件）
        - 音乐：柔和的四和弦铺底（低通 + 混响）+ 偶尔的八音盒音符
        - 音效：选中 / 确认 / 返回 / 不可用 / 开关
        浏览器要求用户手势后才能出声，所以在第一次按键/点击时启动。
     ======================================================================= */
  const audio = (() => {
    let ctx = null;
    let master; let musicBus; let sfxBus; let musicFilter; let duck;
    let chordTimer = 0; let sparkleTimer = 0;
    const vol = (v) => Math.pow(clamp(v, 0, 100) / 100, 2);   // 感知上更线性

    function impulse(seconds, decay) {
      const len = Math.floor(ctx.sampleRate * seconds);
      const buf = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
      return buf;
    }

    function unlock() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
        master = ctx.createGain();
        master.connect(ctx.destination);

        const reverb = ctx.createConvolver();
        reverb.buffer = impulse(3.4, 2.6);
        const wet = ctx.createGain();
        wet.gain.value = 0.6;
        reverb.connect(wet);
        wet.connect(master);

        duck = ctx.createGain();                 // 进入全屏画面时压低音乐
        musicBus = ctx.createGain();
        musicBus.connect(duck);
        duck.connect(master);
        const musicSend = ctx.createGain();
        musicSend.gain.value = 0.75;
        duck.connect(musicSend);
        musicSend.connect(reverb);

        musicFilter = ctx.createBiquadFilter();
        musicFilter.type = 'lowpass';
        musicFilter.frequency.value = 1300;
        musicFilter.Q.value = 0.4;
        musicFilter.connect(musicBus);

        sfxBus = ctx.createGain();
        sfxBus.connect(master);
        const sfxSend = ctx.createGain();
        sfxSend.gain.value = 0.35;
        sfxBus.connect(sfxSend);
        sfxSend.connect(reverb);

        apply();
        startMusic();
      }
      if (ctx.state === 'suspended' && !document.hidden) ctx.resume();
    }

    function apply() {
      if (!ctx) return;
      const t = ctx.currentTime;
      master.gain.setTargetAtTime(vol(settings.master), t, 0.05);
      musicBus.gain.setTargetAtTime(vol(settings.music) * 0.9, t, 0.08);
      sfxBus.gain.setTargetAtTime(vol(settings.sfx), t, 0.03);
    }

    function setDuck(on) {
      if (ctx) duck.gain.setTargetAtTime(on ? 0.35 : 1, ctx.currentTime, 0.6);
    }

    function padVoice(freq, t0, len) {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.05, t0 + 3.6);
      g.gain.setValueAtTime(0.05, t0 + len - 4.5);
      g.gain.linearRampToValueAtTime(0, t0 + len);
      g.connect(musicFilter);
      [['sine', -5, 1], ['triangle', 6, 0.45]].forEach(([type, detune, level]) => {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = freq;
        o.detune.value = detune;
        const og = ctx.createGain();
        og.gain.value = level;
        o.connect(og);
        og.connect(g);
        o.start(t0);
        o.stop(t0 + len + 0.1);
      });
    }

    function bell(freq, t0, level, dest, decay = 1.6) {
      const o = ctx.createOscillator();
      const o2 = ctx.createOscillator();
      o.type = 'sine';
      o2.type = 'sine';
      o.frequency.value = freq;
      o2.frequency.value = freq * 2.005;
      const g = ctx.createGain();
      const g2 = ctx.createGain();
      g2.gain.value = 0.22;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(level, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);
      o.connect(g);
      o2.connect(g2);
      g2.connect(g);
      g.connect(dest);
      o.start(t0); o2.start(t0);
      o.stop(t0 + decay + 0.05); o2.stop(t0 + decay + 0.05);
    }

    function startMusic() {
      // D 大调的宁静进行：Dmaj9 → Bm(add11) → Gmaj7 → Asus2
      const chords = [
        [146.83, 220.0, 277.18, 329.63, 369.99],
        [123.47, 185.0, 246.94, 293.66, 329.63],
        [98.0, 146.83, 246.94, 293.66, 369.99],
        [110.0, 164.81, 246.94, 329.63, 440.0],
      ];
      const notes = [587.33, 659.25, 739.99, 880.0, 987.77, 1174.66, 1318.51];
      const CHORD_S = 9;
      let i = 0;
      const playChord = () => {
        const t0 = ctx.currentTime + 0.05;
        chords[i % chords.length].forEach((f) => padVoice(f, t0, CHORD_S + 4.5));
        i++;
        chordTimer = setTimeout(playChord, CHORD_S * 1000);
      };
      const sparkle = () => {
        const f = notes[Math.floor(Math.random() * notes.length)];
        const t0 = ctx.currentTime + 0.02;
        bell(f, t0, 0.035, musicBus, 2.4);
        if (Math.random() < 0.35) bell(notes[Math.floor(Math.random() * notes.length)], t0 + 0.32, 0.025, musicBus, 2.4);
        sparkleTimer = setTimeout(sparkle, rand(1800, 5200));
      };
      playChord();
      sparkleTimer = setTimeout(sparkle, 2600);
    }

    let lastTick = 0;
    function sfx(kind) {
      if (!ctx || ctx.state !== 'running') return;
      const t = ctx.currentTime + 0.005;
      switch (kind) {
        case 'move': bell(1318.51, t, 0.07, sfxBus, 0.5); break;
        case 'confirm':
          bell(880, t, 0.08, sfxBus, 0.9);
          bell(1318.51, t + 0.07, 0.07, sfxBus, 1.0);
          bell(1760, t + 0.14, 0.05, sfxBus, 1.2);
          break;
        case 'back':
          bell(1174.66, t, 0.06, sfxBus, 0.6);
          bell(880, t + 0.08, 0.05, sfxBus, 0.8);
          break;
        case 'toggle': bell(1567.98, t, 0.06, sfxBus, 0.45); break;
        case 'tick': {
          const now = performance.now();
          if (now - lastTick < 70) return;
          lastTick = now;
          bell(2093, t, 0.03, sfxBus, 0.2);
          break;
        }
        case 'deny': {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = 'triangle';
          o.frequency.setValueAtTime(220, t);
          o.frequency.exponentialRampToValueAtTime(150, t + 0.18);
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.09, t + 0.01);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
          o.connect(g); g.connect(sfxBus);
          o.start(t); o.stop(t + 0.25);
          break;
        }
        default: break;
      }
    }

    document.addEventListener('visibilitychange', () => {
      if (!ctx) return;
      if (document.hidden) ctx.suspend();
      else ctx.resume();
    });

    return { unlock, apply, sfx, setDuck, stop() { clearTimeout(chordTimer); clearTimeout(sparkleTimer); } };
  })();

  /* =======================================================================
     5. 菜单与面板
     ======================================================================= */

  // ---- 模态栈：设置 / 制作人员 / 退出确认 / 全屏画面 ----
  const modal = {
    stack: [],
    top() { return this.stack[this.stack.length - 1] || null; },
    open(m) {
      if (this.stack.includes(m)) return;
      this.stack.push(m);
      ui.inert = true;
      clearTimeout(m.hideTimer);
      m.el.hidden = false;
      void m.el.offsetWidth;          // 触发重排，让淡入过渡生效
      m.el.classList.add('is-open');
      if (m.onOpen) m.onOpen();
    },
    close(m, { silent = false } = {}) {
      const i = this.stack.indexOf(m);
      if (i < 0) return;
      this.stack.splice(i, 1);
      m.el.classList.remove('is-open');
      m.hideTimer = setTimeout(() => { m.el.hidden = true; }, m.fadeMs || 400);
      if (m.onClose) m.onClose();
      if (!silent) audio.sfx('back');
      const next = this.top();
      if (next) {
        if (next.onFocusBack) next.onFocusBack();
      } else {
        ui.inert = false;
        menu.refreshContinue();
        menu.focusSelected();
      }
    },
  };

  /** 在容器内循环 Tab 焦点 */
  function trapTab(e, root) {
    if (e.key !== 'Tab') return false;
    const f = $$('button:not([disabled]), input:not([disabled]), [tabindex="0"]', root).filter((el) => el.offsetParent !== null);
    if (!f.length) return false;
    const i = f.indexOf(document.activeElement);
    e.preventDefault();
    const n = e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : (i + 1) % f.length;
    f[n].focus();
    return true;
  }
  const isUp = (e) => e.key === 'ArrowUp' || e.code === 'KeyW';
  const isDown = (e) => e.key === 'ArrowDown' || e.code === 'KeyS';

  // ---- 主菜单 ----
  const menu = {
    el: $('.menu'),
    items: $$('.menu-item'),
    indicator: $('.menu-indicator'),
    index: 0,
    hasSel: false,

    init() {
      $$('.menu-list > li').forEach((li, i) => li.style.setProperty('--i', String(i)));
      this.items.forEach((btn, i) => {
        // 鼠标真正移动到某项上才算悬停：面板关闭、布局变化时浏览器会补发 hover 事件，
        // 若用 mouseenter，静止的鼠标会“抢走”键盘选中项
        btn.addEventListener('pointermove', (e) => {
          if (e.pointerType === 'mouse' && (e.movementX || e.movementY)) this.select(i);
        });
        btn.addEventListener('focus', () => this.select(i, { focus: false }));
        // 键盘的 Enter/Space 在 keydown 阶段已处理并 preventDefault，不会再产生 click
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          this.select(i, { sound: false });
          this.activate();
        });
      });
      this.refreshContinue();
      this.select(this.firstEnabled(), { sound: false, focus: false });
      // 进场时菜单项还在滑入，结束后、以及尺寸变化时重新对齐指示灯笼
      this.el.addEventListener('transitionend', (e) => {
        if (e.target.parentElement === this.el.querySelector('.menu-list') && e.propertyName === 'transform') this.updateIndicator();
      });
      if (window.ResizeObserver) new ResizeObserver(() => this.updateIndicator()).observe(this.el);
    },
    enabled(i) { return !this.items[i].disabled; },
    firstEnabled() { return Math.max(0, this.items.findIndex((b) => !b.disabled)); },

    /** 选中第 i 项（鼠标悬停 / 键盘 / 焦点三者共用，保证同步） */
    select(i, { sound = true, focus = true } = {}) {
      const btn = this.items[i];
      if (!btn || btn.disabled) return;
      const changed = i !== this.index || !this.hasSel;
      this.index = i;
      this.hasSel = true;
      this.items.forEach((b, j) => b.classList.toggle('is-selected', j === i));
      this.el.classList.add('has-selection');
      if (focus && !ui.inert && document.activeElement !== btn) btn.focus({ preventScroll: true });
      if (changed) {
        this.updateIndicator();
        if (sound) audio.sfx('move');
      }
    },
    move(dir) {
      const n = this.items.length;
      let i = this.index;
      for (let k = 0; k < n; k++) {
        i = (i + dir + n) % n;
        if (this.enabled(i)) break;
      }
      this.select(i);
    },
    focusSelected() {
      const btn = this.items[this.index];
      if (btn && !btn.disabled) btn.focus({ preventScroll: true });
    },
    activate() {
      const btn = this.items[this.index];
      if (!btn) return;
      if (btn.disabled) { audio.sfx('deny'); return; }
      audio.sfx('confirm');
      const fn = actions[btn.dataset.action];
      if (fn) fn();
    },
    /** 灯笼指示器移动到选中项文字的左侧 */
    updateIndicator() {
      const btn = this.items[this.index];
      if (!btn || !this.indicator) return;
      const label = btn.querySelector('.menu-item__label');
      const mr = this.el.getBoundingClientRect();
      const lr = label.getBoundingClientRect();
      const iw = this.indicator.offsetWidth;
      const ih = this.indicator.offsetHeight;
      const x = lr.left - mr.left - iw - lr.height * 0.35;
      const y = lr.top - mr.top + lr.height / 2 - ih * 0.5;
      this.indicator.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    },
    /** “继续旅程”：无存档时置灰且不可选 */
    refreshContinue() {
      const save = readSave();
      const btn = this.items.find((b) => b.dataset.action === 'continue');
      btn.disabled = !save;
      btn.setAttribute('aria-disabled', String(!save));
      btn.title = save ? `${save.chapter}（${fmtTime(save.savedAt)}）` : '暂无存档';
      btn.querySelector('.menu-item__sub').textContent = save ? `CONTINUE · ${save.chapterEn}` : 'CONTINUE';
      if (!save && this.items[this.index] === btn) this.select(this.firstEnabled(), { sound: false, focus: !ui.inert });
    },
    onKey(e) {
      if (isUp(e)) { e.preventDefault(); this.move(-1); }
      else if (isDown(e)) { e.preventDefault(); this.move(1); }
      else if (e.key === 'Home') { e.preventDefault(); this.select(this.firstEnabled()); }
      else if (e.key === 'End') { e.preventDefault(); this.select(this.items.length - 1); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!e.repeat) this.activate(); }
    },
  };

  // ---- 设置面板 ----
  const settingsPanel = {
    el: $('#panel-settings'),
    controls() { return $$('.slider, .switch, .btn:not([disabled])', this.el); },
    init() {
      $$('.slider', this.el).forEach((input) => {
        input.addEventListener('input', () => {
          settings[input.dataset.key] = Number(input.value);
          this.syncOne(input);
          saveSettings();
          audio.apply();
          audio.sfx('tick');
        });
      });
      $$('.switch', this.el).forEach((sw) => {
        sw.addEventListener('click', () => this.setSwitch(sw, !settings[sw.dataset.key]));
      });
      $('[data-action="clear-save"]', this.el).addEventListener('click', (e) => {
        store.remove(KEYS.save);
        const b = e.currentTarget;
        b.textContent = '存档已清除';
        b.disabled = true;
        audio.sfx('toggle');
        menu.refreshContinue();
        $('[data-action="close"]', this.el).focus();
      });
      $('[data-action="close"]', this.el).addEventListener('click', () => modal.close(this));
    },
    setSwitch(sw, value) {
      if (settings[sw.dataset.key] === value) return;
      settings[sw.dataset.key] = value;
      saveSettings();
      applySettings();
      this.sync();
      audio.sfx('toggle');
    },
    syncOne(input) {
      const v = Number(input.value);
      input.style.setProperty('--p', `${v}%`);
      const out = input.parentElement.querySelector('output');
      if (out) out.textContent = String(v);
    },
    sync() {
      $$('.slider', this.el).forEach((input) => {
        input.value = String(settings[input.dataset.key]);
        this.syncOne(input);
      });
      $$('.switch', this.el).forEach((sw) => {
        const on = !!settings[sw.dataset.key];
        sw.setAttribute('aria-checked', String(on));
        const val = $(`[data-for="${sw.dataset.key}"]`, this.el);
        if (val) val.textContent = on ? '开' : '关';
      });
      const clear = $('[data-action="clear-save"]', this.el);
      const has = !!readSave();
      clear.disabled = !has;
      clear.textContent = has ? '清除存档' : '暂无存档';
    },
    onOpen() { this.sync(); this.controls()[0].focus(); },
    onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); modal.close(this); return; }
      if (trapTab(e, this.el)) return;
      const list = this.controls();
      const i = list.indexOf(document.activeElement);
      if (isDown(e) || isUp(e)) {
        e.preventDefault();       // 同时阻止 range 用上下键改值
        const n = list.length;
        const next = list[((i < 0 ? -1 : i) + (isDown(e) ? 1 : -1) + n) % n];
        next.focus();
        audio.sfx('move');
        return;
      }
      const a = document.activeElement;
      if (a && a.classList.contains('switch')) {
        if (e.key === 'ArrowLeft' || e.code === 'KeyA') { e.preventDefault(); this.setSwitch(a, false); }
        if (e.key === 'ArrowRight' || e.code === 'KeyD') { e.preventDefault(); this.setSwitch(a, true); }
      }
    },
  };

  // ---- 制作人员 ----
  const creditsPanel = {
    el: $('#panel-credits'),
    init() { $('[data-action="close"]', this.el).addEventListener('click', () => modal.close(this)); },
    onOpen() {
      const roll = $('.credits-roll', this.el);
      roll.style.animation = 'none';
      void roll.offsetWidth;
      roll.style.animation = '';
      $('.credits-viewport', this.el).scrollTop = 0;
      $('[data-action="close"]', this.el).focus();
    },
    onKey(e) {
      if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); modal.close(this); return; }
      if (trapTab(e, this.el)) return;
      if (isUp(e) || isDown(e)) {        // 减少动态模式下手动滚动
        e.preventDefault();
        $('.credits-viewport', this.el).scrollTop += isDown(e) ? 48 : -48;
      }
    },
  };

  // ---- 退出确认 ----
  const quitDialog = {
    el: $('#dialog-quit'),
    init() {
      $('[data-action="close"]', this.el).addEventListener('click', () => modal.close(this));
      $('[data-action="confirm-quit"]', this.el).addEventListener('click', () => {
        audio.sfx('confirm');
        modal.close(this, { silent: true });
        modal.open(thanksScreen);
      });
    },
    onOpen() { $('[data-action="close"]', this.el).focus(); },   // 默认停在“再看看”
    onFocusBack() { $('[data-action="close"]', this.el).focus(); },
    onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); modal.close(this); return; }
      if (trapTab(e, this.el)) return;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) || ['KeyA', 'KeyD', 'KeyW', 'KeyS'].includes(e.code)) {
        e.preventDefault();
        const btns = $$('.btn', this.el);
        const i = btns.indexOf(document.activeElement);
        btns[(i + 1) % btns.length].focus();
        audio.sfx('move');
      }
    },
  };

  // ---- 全屏画面（开始/继续旅程、感谢游玩） ----
  function spellOut(el, text) {
    el.textContent = '';
    // 连续的省略号作为一个整体淡入，避免被字距拆开
    (text.match(/…+|./gu) || []).forEach((ch, i) => {
      const s = document.createElement('span');
      s.className = ch.length > 1 ? 'ch ch--group' : 'ch';
      s.style.setProperty('--i', String(i));
      s.textContent = ch;
      el.appendChild(s);
    });
  }
  function makeScreen(el) {
    const scr = {
      el,
      fadeMs: 1300,
      init() { $('[data-action="close"]', el).addEventListener('click', () => modal.close(scr)); },
      onOpen() {
        audio.setDuck(true);
        $('[data-action="close"]', el).focus({ preventScroll: true });
      },
      onClose() { audio.setDuck(false); },
      onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); modal.close(scr); return; }
        if (trapTab(e, el)) return;
        if (e.key === 'Enter' || e.key === ' ') e.preventDefault();   // 防止误触返回
      },
    };
    return scr;
  }
  const journeyScreen = makeScreen($('#screen-journey'));
  const thanksScreen = makeScreen($('#screen-thanks'));
  const thanksOpen = thanksScreen.onOpen;
  thanksScreen.onOpen = () => { spellOut($('#thanks-text'), '感谢游玩'); thanksOpen(); };

  // ---- 菜单动作 ----
  const actions = {
    start() {
      const save = writeSave();                       // 开始旅程即创建存档
      spellOut($('#journey-text'), '旅程即将开始……');
      $('#journey-sub').textContent = save.chapter;
      modal.open(journeyScreen);
    },
    continue() {
      const save = readSave();
      if (!save) return;
      spellOut($('#journey-text'), '正在读取存档……');
      $('#journey-sub').textContent = `${save.chapter} · 保存于 ${fmtTime(save.savedAt)}`;
      modal.open(journeyScreen);
    },
    settings() { modal.open(settingsPanel); },
    credits() { modal.open(creditsPanel); },
    quit() { modal.open(quitDialog); },
  };

  // ---- 全局键盘 / 指针 ----
  document.addEventListener('keydown', (e) => {
    audio.unlock();
    if (intro.running) {
      intro.skip();
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') { e.preventDefault(); return; }
    }
    const top = modal.top();
    if (top) { top.onKey(e); return; }
    menu.onKey(e);
  });
  document.addEventListener('pointerdown', () => {
    audio.unlock();
    if (intro.running) intro.skip();
  });

  /** 应用会影响画面的设置 */
  function applySettings() {
    document.documentElement.classList.toggle('reduce-motion', !!settings.reduceMotion);
    audio.apply();
    particles.populate();
  }
  // 用户尚未手动保存过设置时，跟随系统“减少动态”的实时变化
  const onMq = () => {
    if (settingsExplicit) return;
    settings.reduceMotion = mqReduce.matches;
    settings.parallax = !mqReduce.matches;
    applySettings();
    settingsPanel.sync();
  };
  if (mqReduce.addEventListener) mqReduce.addEventListener('change', onMq);
  else if (mqReduce.addListener) mqReduce.addListener(onMq);

  /* =======================================================================
     6. 进场动画与启动
     ======================================================================= */
  const intro = {
    running: false,
    skipped: false,
    timer: 0,
    start(skip) {
      app.classList.remove('is-loading');
      this.running = true;
      this.skipped = !!skip;
      if (skip) app.classList.add('intro-skip');
      // 等两帧，让“未进场”的初始状态先渲染出来，过渡才会真正播放；
      // 计时从此刻开始，不受首帧耗时影响
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (this.skipped) app.classList.add('intro-skip');
        app.classList.add('is-intro');
        if (!this.running) { this.fastForward(); return; }
        const total = skip ? 700 : (settings.reduceMotion ? 1800 : 5200);
        this.timer = setTimeout(() => this.finish(), total);
      }));
    },
    /** 把仍在等待/播放中的进场过渡压缩到 0.6 秒内播完（改 class 无法影响已创建的过渡） */
    fastForward() {
      if (!document.getAnimations) return;
      for (const a of document.getAnimations()) {
        if (typeof CSSTransition === 'undefined' || !(a instanceof CSSTransition)) continue;
        const p = a.effect.getComputedTiming().progress || 0;
        a.effect.updateTiming({ delay: 0, duration: 600 });
        a.currentTime = p * 600;
      }
    },
    skip() {
      if (!this.running) return;
      this.skipped = true;
      app.classList.add('intro-skip');
      this.fastForward();
      this.finish();
    },
    finish() {
      if (!this.running) return;
      this.running = false;
      clearTimeout(this.timer);
      app.classList.add('is-ready');
      menu.updateIndicator();
      setTimeout(() => app.classList.remove('intro-skip'), 1500);
    },
  };

  let resizeRaf = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(layout);
  });

  async function boot() {
    document.documentElement.classList.toggle('reduce-motion', !!settings.reduceMotion);
    buildScene();
    menu.init();
    settingsPanel.init();
    creditsPanel.init();
    quitDialog.init();
    journeyScreen.init();
    thanksScreen.init();
    settingsPanel.sync();

    // 等待图层解码（最多 8 秒，避免某张图异常时卡在载入页）
    await Promise.race([loadLayers(), new Promise((r) => setTimeout(r, 8000))]);
    layout();
    requestAnimationFrame((t) => { lastT = t; requestAnimationFrame(frame); });
    intro.start(params.has('nointro'));
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => layout());
  }

  boot();
})();
