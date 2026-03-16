// ==UserScript==
// @name         lovephysics.sysu.edu.cn Flash Flowplayer -> flv.js
// @version      1.0.1
// @description  Replace legacy Flash flowplayer embeds with flv.js (cdnjs) HTML5 player on lovephysics.sysu.edu.cn
// @match        http://lovephysics.sysu.edu.cn/*
// @match        https://lovephysics.sysu.edu.cn/*
// @run-at       document-end
// @grant        none
// @author       Du
// @namespace    https://github.com/pipidu/lovephysicsVideoFix/
// ==/UserScript==

(function () {
  'use strict';

  // cdnjs flv.js (你也可以改版本号)
  const FLVJS_CDN = 'https://doges3bucket2.img.shygo.cn/flv.js/1.6.2/flv.min.js';

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      // 避免重复加载
      if ([...document.scripts].some(s => s.src === src)) return resolve();
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = (e) => reject(e);
      document.head.appendChild(s);
    });
  }

  // 从 flashvars 里提取 config JSON，再取 clip.url
  function extractFlvUrlFromFlashvars(flashvars) {
    if (!flashvars) return null;

    // 典型：config={"clip":{"url":"/lib/exe/fetch.php?media=media:exp_a5.flv", ...}}
    const m = flashvars.match(/config\s*=\s*({[\s\S]*})\s*$/);
    if (!m) return null;

    let cfgText = m[1];

    // 有些页面用单引号包住整个 flashvars，内部 JSON 仍是双引号；一般可直接 JSON.parse
    // 但如果出现不标准 JSON，这里做个兜底替换（尽量不破坏合法 JSON）
    try {
      const cfg = JSON.parse(cfgText);
      const url = cfg?.clip?.url;
      return url || null;
    } catch (e) {
      // 兜底：粗暴提取 "url":"...flv"
      const m2 = cfgText.match(/"url"\s*:\s*"([^"]+\.flv[^"]*)"/i);
      if (m2) return m2[1];
      return null;
    }
  }

  function toAbsoluteUrl(url) {
    try {
      return new URL(url, location.href).toString();
    } catch {
      return url;
    }
  }

  function replaceOneObject(objEl, index) {
    // 只处理 flowplayer swf 的 object
    const dataAttr = (objEl.getAttribute('data') || '').toLowerCase();
    const isFlowplayer = dataAttr.includes('flowplayer') && dataAttr.endsWith('.swf');
    if (!isFlowplayer) return false;

    // 找 flashvars
    const flashvarsParam = objEl.querySelector('param[name="flashvars" i]');
    const flashvars = flashvarsParam?.getAttribute('value') || '';
    const flvUrlRaw = extractFlvUrlFromFlashvars(flashvars);
    if (!flvUrlRaw) return false;

    const flvUrl = toAbsoluteUrl(flvUrlRaw);

    // 尺寸
    const width = parseInt(objEl.getAttribute('width') || '640', 10) || 640;
    const height = parseInt(objEl.getAttribute('height') || '480', 10) || 480;

    // 构造替换容器
    const wrapper = document.createElement('div');
    wrapper.style.maxWidth = '100%';
    wrapper.style.width = width + 'px';

    const videoId = `tm_flvjs_video_${Date.now()}_${index}`;
    const video = document.createElement('video');
    video.id = videoId;
    video.controls = true;
    video.style.width = '100%';
    video.style.height = 'auto';
    video.style.background = '#000';
    video.setAttribute('playsinline', '');
    // 需要的话可开启自动播放（不建议）
    // video.autoplay = true;

    // 提示信息（当 flv.js 不支持时）
    const tip = document.createElement('div');
    tip.style.fontSize = '12px';
    tip.style.color = '#666';
    tip.style.marginTop = '6px';
    tip.textContent = `FLV 视频（flv.js）：${flvUrl}`;

    wrapper.appendChild(video);
    wrapper.appendChild(tip);

    // 用 wrapper 替换 object
    objEl.parentNode.insertBefore(wrapper, objEl);
    objEl.remove();

    // 初始化 flv.js
    if (!window.flvjs) {
      console.warn('[TM flv.js] flvjs not loaded yet.');
      return true;
    }
    if (!window.flvjs.isSupported()) {
      tip.textContent = '当前浏览器不支持 flv.js 播放。你可以尝试更换浏览器或下载视频观看：' + flvUrl;
      return true;
    }

    try {
      const player = window.flvjs.createPlayer({
        type: 'flv',
        url: flvUrl,
        isLive: false,
        cors: true
      }, {
        enableStashBuffer: true,
        stashInitialSize: 128
      });

      player.attachMediaElement(video);
      player.load();

      // 可选：点击后再播放（避免某些浏览器策略）
      // video.addEventListener('play', () => player.play(), { once: true });

      // 暴露到元素上方便调试
      video._flvjsPlayer = player;
    } catch (e) {
      console.error('[TM flv.js] init error', e);
      tip.textContent = 'flv.js 初始化失败，建议直接下载观看：' + flvUrl;
    }

    return true;
  }

  async function main() {
    // 先加载 flv.js
    try {
      await loadScript(FLVJS_CDN);
    } catch (e) {
      console.error('[TM flv.js] failed to load flv.js from cdnjs', e);
      return;
    }

    // 替换页面内所有 object flowplayer
    const objects = Array.from(document.querySelectorAll('object'));
    let replaced = 0;
    objects.forEach((obj, i) => {
      if (replaceOneObject(obj, i)) replaced++;
    });

    // 如果页面后续可能 AJAX/动态插入，再加 MutationObserver
    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          const newObjs = node.matches?.('object') ? [node] : Array.from(node.querySelectorAll?.('object') || []);
          newObjs.forEach((obj, i) => {
            if (replaceOneObject(obj, i)) replaced++;
          });
        }
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });

    console.log(`[TM flv.js] replaced ${replaced} flowplayer object(s).`);
  }

  main();
})();
