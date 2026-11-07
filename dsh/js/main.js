/* ==========================================================================
   云鲸归途 · CLOUDWHALE VOYAGE —— 交互与动画
   模块：设置存储 / 视差 / 云层循环 / 光尘粒子 / 菜单键盘导航 / 面板 / 过场 / 合成音效
   零外部依赖，file:// 直接打开即可运行（不使用 fetch、不使用 ES module）。
   ========================================================================== */
(function () {
  'use strict';

  var SETTINGS_KEY = 'cloudwhale.settings.v1';
  var SAVE_KEY = 'cloudwhale.save.v1';

  var DEFAULTS = { master: 70, music: 25, sfx: 60, parallax: true, reduceMotion: false };

  var reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------------------------------------------------------------- 存储 */

  function loadSettings() {
    var out = Object.assign({}, DEFAULTS);
    try {
      var raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        var saved = JSON.parse(raw);
        Object.keys(DEFAULTS).forEach(function (k) {
          if (saved && typeof saved[k] !== 'undefined') out[k] = saved[k];
        });
      } else {
        // 首次访问：跟随系统的「减少动态」偏好
        out.reduceMotion = reduceQuery.matches;
      }
    } catch (err) {
      /* localStorage 不可用时静默降级为默认值 */
    }
    return out;
  }

  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (err) {}
  }

  function hasSave() {
    try { return localStorage.getItem(SAVE_KEY) === '1'; } catch (err) { return false; }
  }

  function writeSave() {
    try { localStorage.setItem(SAVE_KEY, '1'); } catch (err) {}
  }

  /* --------------------------------------------------------------- 元信息 */

  var settings = loadSettings();
  var root = document.body;
  var scene = document.getElementById('scene');
  var canvas = document.getElementById('dust');

  var els = {
    menu: document.getElementById('menu'),
    items: Array.prototype.slice.call(document.querySelectorAll('.menu-item')),
    panels: {
      settings: document.getElementById('panel-settings'),
      credits: document.getElementById('panel-credits')
    },
    journey: document.getElementById('journey'),
    modal: document.getElementById('quit-modal'),
    farewell: document.getElementById('farewell'),
    fade: document.getElementById('fade'),
    sliders: {
      master: document.getElementById('set-master'),
      music: document.getElementById('set-music'),
      sfx: document.getElementById('set-sfx')
    },
    values: {
      master: document.getElementById('val-master'),
      music: document.getElementById('val-music'),
      sfx: document.getElementById('val-sfx')
    },
    swParallax: document.getElementById('set-parallax'),
    swMotion: document.getElementById('set-motion')
  };

  /* ======================================================================
     1. 合成音效（Web Audio 现场合成，无音频文件）
     ====================================================================== */
  var Sound = (function () {
    var ctx = null, masterGain = null, musicGain = null, sfxGain = null, started = false;

    function ensure() {
      if (ctx || started) return ctx;
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try {
        ctx = new AC();
        masterGain = ctx.createGain();
        masterGain.gain.value = 0;
        masterGain.connect(ctx.destination);

        musicGain = ctx.createGain();
        musicGain.connect(masterGain);
        sfxGain = ctx.createGain();
        sfxGain.connect(masterGain);

        buildAmbience();
        started = true;
      } catch (err) {
        ctx = null;
      }
      return ctx;
    }

    // 风声（带通噪声）+ 极低的双音持续音，营造云海的空旷感
    function buildAmbience() {
      var seconds = 4;
      var buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
      var data = buffer.getChannelData(0);
      var last = 0;
      for (var i = 0; i < data.length; i++) {
        var white = Math.random() * 2 - 1;
        last = (last + 0.02 * white) / 1.02;   // 低频加重，接近风声
        data[i] = last * 3.2;
      }
      var noise = ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;

      var band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 620;
      band.Q.value = 0.7;

      // 缓慢起伏，像一阵一阵的风
      var swell = ctx.createGain();
      swell.gain.value = 0.45;
      var lfo = ctx.createOscillator();
      lfo.frequency.value = 0.055;
      var lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.22;
      lfo.connect(lfoGain);
      lfoGain.connect(swell.gain);

      noise.connect(band);
      band.connect(swell);
      swell.connect(musicGain);
      noise.start();
      lfo.start();

      [55, 82.5].forEach(function (f, idx) {
        var osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = f;
        var g = ctx.createGain();
        g.gain.value = idx === 0 ? 0.11 : 0.06;
        osc.connect(g);
        g.connect(musicGain);
        osc.start();
      });
    }

    function setVolume() {
      if (!ctx) return;
      var now = ctx.currentTime;
      var m = settings.master / 100;
      masterGain.gain.setTargetAtTime(m * m, now, 0.25);
      musicGain.gain.setTargetAtTime(Math.pow(settings.music / 100, 1.6) * 0.5, now, 0.35);
      sfxGain.gain.setTargetAtTime(Math.pow(settings.sfx / 100, 1.7) * 0.5, now, 0.2);
    }

    function blip(freq, dur, type, level) {
      if (!ctx || ctx.state === 'suspended') return;
      try {
        var t = ctx.currentTime;
        var osc = ctx.createOscillator();
        var g = ctx.createGain();
        osc.type = type || 'sine';
        osc.frequency.value = freq;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(level || 0.12, t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t + (dur || 0.24));
        osc.connect(g);
        g.connect(sfxGain);
        osc.start(t);
        osc.stop(t + (dur || 0.24) + 0.05);
      } catch (err) {}
    }

    return {
      unlock: function () {
        if (!ctx) ensure();
        if (ctx && ctx.state === 'suspended') ctx.resume();
        setVolume();
      },
      hover: function () { blip(880, 0.16, 'sine', 0.05); },
      select: function () { blip(660, 0.5, 'triangle', 0.12); },
      back: function () { blip(420, 0.36, 'sine', 0.09); },
      setVolume: setVolume
    };
  })();

  /* ======================================================================
     2. 设置应用
     ====================================================================== */
  function applySettings(persist) {
    root.classList.toggle('reduce-motion', !!settings.reduceMotion);

    Object.keys(els.sliders).forEach(function (key) {
      var input = els.sliders[key];
      input.value = settings[key];
      input.style.setProperty('--p', settings[key] + '%');
      els.values[key].textContent = settings[key];
    });

    els.swParallax.setAttribute('aria-checked', String(!!settings.parallax));
    els.swMotion.setAttribute('aria-checked', String(!!settings.reduceMotion));

    Sound.setVolume();
    if (!settings.parallax || settings.reduceMotion) resetTransforms();
    if (persist) saveSettings();
  }

  Object.keys(els.sliders).forEach(function (key) {
    els.sliders[key].addEventListener('input', function (e) {
      settings[key] = Number(e.target.value);
      applySettings(true);
    });
  });

  els.swParallax.addEventListener('click', function () {
    settings.parallax = !settings.parallax;
    applySettings(true);
    Sound.select();
  });

  els.swMotion.addEventListener('click', function () {
    settings.reduceMotion = !settings.reduceMotion;
    applySettings(true);
    Sound.back();
  });

  /* ======================================================================
     3. 视差 + 云层循环（同一个 rAF 循环）
     注意：云层的位移写在 .cloud-track 自己身上（它同时承载 mix-blend-mode），
     父级 .layer 不能有 transform/opacity，否则会形成隔离组让 screen 混合失效。
     ====================================================================== */
  var parallaxLayers = Array.prototype.slice.call(document.querySelectorAll('.layer[data-parallax]'));
  var tracks = Array.prototype.slice.call(document.querySelectorAll('.cloud-track')).map(function (el) {
    return {
      el: el,
      k: parseFloat(el.getAttribute('data-parallax')) || 0,
      ratio: parseFloat(el.getAttribute('data-tile-ratio')) || 1.125,
      speed: parseFloat(el.getAttribute('data-scroll')) || 6,
      offset: 0
    };
  });

  var viewW = window.innerWidth;
  var viewH = window.innerHeight;
  var pointer = { x: 0, y: 0 };
  var eased = { x: 0, y: 0 };
  var lastPointerAt = 0;
  var lastFrame = 0;

  function resetTransforms() {
    parallaxLayers.forEach(function (el) { el.style.transform = ''; });
    tracks.forEach(function (t) { t.el.style.transform = ''; });
    eased.x = 0; eased.y = 0;
  }

  window.addEventListener('pointermove', function (e) {
    pointer.x = (e.clientX / viewW - 0.5) * 2;
    pointer.y = (e.clientY / viewH - 0.5) * 2;
    lastPointerAt = performance.now();
  }, { passive: true });

  ['pointerdown', 'keydown', 'touchstart'].forEach(function (type) {
    window.addEventListener(type, function () { Sound.unlock(); }, { passive: true, once: true });
  });

  function frame(now) {
    var dt = lastFrame ? Math.min((now - lastFrame) / 1000, 0.06) : 0.016;
    lastFrame = now;

    var motionOn = !settings.reduceMotion;

    // --- 视差目标值：鼠标 + 无输入时缓慢自动漂移
    if (settings.parallax && motionOn) {
      var idle = now - lastPointerAt > 2600;
      var amp = idle ? 1 : 0.28;
      var driftX = Math.sin(now * 0.00013) * 0.42 * amp;
      var driftY = Math.cos(now * 0.00017) * 0.30 * amp;
      var tx = pointer.x + driftX;
      var ty = pointer.y + driftY;
      eased.x += (tx - eased.x) * Math.min(1, dt * 2.4);
      eased.y += (ty - eased.y) * Math.min(1, dt * 2.4);
    } else {
      eased.x += (0 - eased.x) * Math.min(1, dt * 3);
      eased.y += (0 - eased.y) * Math.min(1, dt * 3);
    }

    var sx = viewW / 1920;
    var sy = viewH / 1080;
    var useParallax = settings.parallax && motionOn;

    // --- 近/远图层位移（越近系数越大）
    parallaxLayers.forEach(function (el) {
      if (!useParallax) { el.style.transform = ''; return; }
      var k = parseFloat(el.getAttribute('data-parallax')) || 0;
      el.style.transform = 'translate3d(' + (-eased.x * k * sx).toFixed(2) + 'px,' +
                           (-eased.y * k * 0.65 * sy).toFixed(2) + 'px,0)';
    });

    // --- 云层：滚动位移 + 视差位移合并写一次（避免两个 transform 互相覆盖）
    tracks.forEach(function (t) {
      var tileW = t.el.clientHeight * t.ratio;
      if (!tileW) return;
      if (motionOn) t.offset = (t.offset + t.speed * dt) % tileW;
      var px = useParallax ? -eased.x * t.k * sx : 0;
      var py = useParallax ? -eased.y * t.k * 0.4 * sy : 0;
      t.el.style.transform = 'translate3d(' + (px - t.offset).toFixed(2) + 'px,' + py.toFixed(2) + 'px,0)';
    });

    drawDust(now, dt);
    requestAnimationFrame(frame);
  }

  /* ======================================================================
     4. 光尘粒子（canvas 程序生成）
     ====================================================================== */
  var ctx2d = canvas.getContext('2d');
  var motes = [];
  var sprite = null;
  var dpr = Math.min(window.devicePixelRatio || 1, 2);

  function makeSprite() {
    var size = 64;
    var c = document.createElement('canvas');
    c.width = c.height = size;
    var g = c.getContext('2d');
    var grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(255,246,224,1)');
    grad.addColorStop(0.28, 'rgba(255,214,158,.72)');
    grad.addColorStop(0.62, 'rgba(255,178,110,.18)');
    grad.addColorStop(1, 'rgba(255,170,100,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    sprite = c;
  }

  function seedMotes() {
    var count = Math.round(Math.min(110, Math.max(30, (viewW * viewH) / 26000)));
    motes = [];
    for (var i = 0; i < count; i++) {
      motes.push({
        x: Math.random() * viewW,
        y: Math.random() * viewH,
        r: 0.6 + Math.random() * 2.3,          // 近处的光尘更大
        speed: 3 + Math.random() * 11,          // px/s，向上飘
        sway: 8 + Math.random() * 26,
        phase: Math.random() * Math.PI * 2,
        alpha: 0.12 + Math.random() * 0.42,
        twinkle: 0.4 + Math.random() * 1.5
      });
    }
  }

  function drawDust(now, dt) {
    var w = viewW, h = viewH;
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx2d.clearRect(0, 0, w, h);
    ctx2d.globalCompositeOperation = 'lighter';

    var motionOn = !settings.reduceMotion;
    var t = motionOn ? now : 0;      // 减少动态时冻结闪烁
    for (var i = 0; i < motes.length; i++) {
      var m = motes[i];
      if (motionOn) {
        m.y -= m.speed * dt;
        if (m.y < -20) { m.y = h + 20; m.x = Math.random() * w; }
      }
      var x = m.x + Math.sin(t * 0.0004 + m.phase) * m.sway;
      var a = m.alpha * (0.55 + 0.45 * Math.sin(t * 0.0012 * m.twinkle + m.phase));
      var size = m.r * 9;
      ctx2d.globalAlpha = Math.max(0, Math.min(1, a));
      ctx2d.drawImage(sprite, x - size / 2, m.y - size / 2, size, size);
    }
    ctx2d.globalAlpha = 1;
    ctx2d.globalCompositeOperation = 'source-over';
  }

  function resize() {
    viewW = window.innerWidth;
    viewH = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(viewW * dpr);
    canvas.height = Math.round(viewH * dpr);
    canvas.style.width = viewW + 'px';
    canvas.style.height = viewH + 'px';
    seedMotes();
  }

  window.addEventListener('resize', function () {
    resize();
    if (!settings.parallax || settings.reduceMotion) resetTransforms();
  });

  /* ======================================================================
     5. 菜单
     ====================================================================== */
  var activeIndex = 0;

  function isDisabled(item) { return item.classList.contains('is-disabled'); }

  function refreshSaveState() {
    var cont = els.items.filter(function (i) { return i.dataset.action === 'continue'; })[0];
    if (!cont) return;
    var saved = hasSave();
    cont.classList.toggle('is-disabled', !saved);
    cont.setAttribute('aria-disabled', String(!saved));
    cont.disabled = false;   // 保留可聚焦性，由 is-disabled 拦截激活
    if (!saved && activeIndex === els.items.indexOf(cont)) {
      setActive(0, false);
    }
  }

  function setActive(index, focus) {
    if (index < 0 || index >= els.items.length) return;
    if (isDisabled(els.items[index])) return;
    activeIndex = index;
    els.items.forEach(function (item, i) {
      item.classList.toggle('is-active', i === index);
    });
    if (focus) els.items[index].focus({ preventScroll: true });
  }

  function firstEnabled() {
    for (var i = 0; i < els.items.length; i++) if (!isDisabled(els.items[i])) return i;
    return 0;
  }

  function moveActive(step) {
    var i = activeIndex;
    for (var n = 0; n < els.items.length; n++) {
      i = (i + step + els.items.length) % els.items.length;
      if (!isDisabled(els.items[i])) {
        setActive(i, true);
        Sound.hover();
        return;
      }
    }
  }

  function activate(item) {
    if (!item || isDisabled(item)) return;
    Sound.select();
    var action = item.dataset.action;
    if (action === 'start' || action === 'continue') startJourney();
    else if (action === 'settings') openPanel('settings');
    else if (action === 'credits') openPanel('credits');
    else if (action === 'quit') openModal();
  }

  els.items.forEach(function (item, i) {
    // 悬停即把「选中项 + 焦点」一起移过来：选中态只由 is-active 表达，
    // 焦点若留在原项上会出现两个高亮（键盘描边 + 悬停高亮）。
    item.addEventListener('pointerenter', function () {
      if (isDisabled(item)) return;
      if (i !== activeIndex) Sound.hover();
      setActive(i, true);
    });
    item.addEventListener('click', function () { activate(item); });
    item.addEventListener('focus', function () {
      if (!isDisabled(item)) setActive(i, false);
    });
  });

  els.menu.addEventListener('pointerleave', function () {
    // 鼠标离开菜单后回到键盘当前项，保持唯一的选中态
    setActive(activeIndex, false);
  });

  /* ======================================================================
     6. 面板 / 弹窗 / 过场
     ====================================================================== */
  var lastFocus = null;
  var openStack = [];

  function pushOpen(el, label) {
    openStack.push({ el: el, label: label });
    el.classList.add('is-open');
    el.setAttribute('aria-hidden', 'false');
  }

  function popOpen(label) {
    var idx = -1;
    for (var i = openStack.length - 1; i >= 0; i--) {
      if (openStack[i].label === label) { idx = i; break; }
    }
    if (idx === -1) return false;
    var entry = openStack.splice(idx, 1)[0];
    entry.el.classList.remove('is-open');
    entry.el.setAttribute('aria-hidden', 'true');
    return true;
  }

  function openPanel(name) {
    lastFocus = document.activeElement;
    Object.keys(els.panels).forEach(function (key) {
      if (key !== name) popOpen('panel-' + key);
    });
    if (openStack.some(function (o) { return o.label === 'panel-' + name; })) return;
    pushOpen(els.panels[name], 'panel-' + name);
    if (name === 'settings') {
      setTimeout(function () { els.sliders.master.focus({ preventScroll: true }); }, 120);
    } else {
      var closeBtn = els.panels[name].querySelector('[data-close]');
      if (closeBtn) setTimeout(function () { closeBtn.focus({ preventScroll: true }); }, 120);
    }
  }

  function closePanel(name) {
    if (!popOpen('panel-' + name)) return;
    Sound.back();
    if (lastFocus && typeof lastFocus.focus === 'function') {
      lastFocus.focus({ preventScroll: true });
    }
  }

  document.querySelectorAll('[data-close]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (openStack.length) {
        var top = openStack[openStack.length - 1];
        closePanel(top.label.replace('panel-', ''));
      }
    });
  });

  Object.keys(els.panels).forEach(function (key) {
    els.panels[key].addEventListener('click', function (e) {
      if (e.target === els.panels[key]) closePanel(key);   // 点遮罩关闭
    });
  });

  function startJourney() {
    writeSave();
    els.fade.classList.add('is-on');
    setTimeout(function () {
      pushOpen(els.journey, 'journey');
      setTimeout(function () { els.fade.classList.remove('is-on'); }, 260);
      refreshSaveState();
    }, 620);
  }

  function endJourney() {
    if (!popOpen('journey')) return;
    refreshSaveState();
    setActive(firstEnabled(), true);
  }

  function openModal() {
    lastFocus = document.activeElement;
    pushOpen(els.modal, 'quit');
    var btn = els.modal.querySelector('[data-quit="cancel"]');
    if (btn) setTimeout(function () { btn.focus({ preventScroll: true }); }, 120);
  }

  function closeModal() {
    if (!popOpen('quit')) return;
    Sound.back();
    if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus({ preventScroll: true });
  }

  function confirmQuit() {
    popOpen('quit');
    els.fade.classList.add('is-on');
    setTimeout(function () { pushOpen(els.farewell, 'farewell'); }, 700);
  }

  els.modal.querySelectorAll('[data-quit]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (btn.dataset.quit === 'confirm') confirmQuit();
      else closeModal();
    });
  });

  els.modal.addEventListener('click', function (e) {
    if (e.target === els.modal) closeModal();
  });

  /* ======================================================================
     7. 键盘
     ====================================================================== */
  function topMost() {
    return openStack.length ? openStack[openStack.length - 1].label : null;
  }

  window.addEventListener('keydown', function (e) {
    var top = topMost();

    if (e.key === 'Escape') {
      if (top === 'quit') { closeModal(); e.preventDefault(); return; }
      if (top === 'journey') { endJourney(); e.preventDefault(); return; }
      if (top && top.indexOf('panel-') === 0) {
        closePanel(top.replace('panel-', ''));
        e.preventDefault();
        return;
      }
      return;
    }

    if (top && top.indexOf('panel-') === 0) return;   // 面板内交给原生控件

    if (top === 'quit') {
      if (e.key === 'Enter') { confirmQuit(); e.preventDefault(); }
      return;
    }

    if (top) return;   // 其余遮罩（旅程画面等）打开时不响应菜单按键

    switch (e.key) {
      case 'ArrowDown':
      case 's':
      case 'S':
        moveActive(1); e.preventDefault(); break;
      case 'ArrowUp':
      case 'w':
      case 'W':
        moveActive(-1); e.preventDefault(); break;
      case 'Home':
        setActive(firstEnabled(), true); e.preventDefault(); break;
      case 'End':
        for (var i = els.items.length - 1; i >= 0; i--) {
          if (!isDisabled(els.items[i])) { setActive(i, true); break; }
        }
        e.preventDefault(); break;
      case 'Enter':
      case ' ':
        // 阻止聚焦按钮的原生点击，避免与这里重复触发
        e.preventDefault();
        activate(els.items[activeIndex]);
        break;
    }
  });

  /* ======================================================================
     8. 启动
     ====================================================================== */
  var booted = false;
  // 自检开关：index.html#preview 跳过入场动画（无头截图用），#panel-settings / #panel-credits 直接开面板
  var hash = window.location.hash || '';

  function boot() {
    if (booted) return;
    booted = true;
    if (/preview/.test(hash)) root.classList.add('is-preview');
    makeSprite();
    resize();
    applySettings(false);
    refreshSaveState();
    setActive(firstEnabled(), false);

    // 进场：天空 → 远景 → 鲸 → 前景 → 标题 → 菜单（延迟写在 HTML 的 --d 里）
    requestAnimationFrame(function () {
      root.classList.remove('is-loading');
      root.classList.add('is-ready');
    });

    requestAnimationFrame(frame);

    // 自检：直接打开某个面板 / 过场
    if (/panel-settings|panel-credits/.test(hash)) {
      openPanel(/credits/.test(hash) ? 'credits' : 'settings');
    } else if (/journey/.test(hash)) {
      pushOpen(els.journey, 'journey');
    } else if (/quit/.test(hash)) {
      openModal();
    } else if (/farewell/.test(hash)) {
      pushOpen(els.farewell, 'farewell');
    }
  }

  if (document.readyState === 'complete') boot();
  else window.addEventListener('load', boot);

  // 兜底：某些环境下 load 事件可能因图片缓慢而不触发
  setTimeout(function () {
    if (root.classList.contains('is-loading')) boot();
  }, 2600);
})();
