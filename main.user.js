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

  const FLVJS_CDN = 'https://doges3bucket2.img.shygo.cn/flv.js/1.6.2/flv.min.js';

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if ([...document.scripts].some(s => s.src === src)) return resolve();
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = (e) => reject(e);
      document.head.appendChild(s);
    });
  }

  function extractFlvUrlFromFlashvars(flashvars) {
    if (!flashvars) return null;

    const m = flashvars.match(/config\s*=\s*({[\s\S]*})\s*$/);
    if (!m) return null;

    let cfgText = m[1];

    try {
      const cfg = JSON.parse(cfgText);
      const url = cfg?.clip?.url;
      return url || null;
    } catch (e) {
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
    const dataAttr = (objEl.getAttribute('data') || '').toLowerCase();
    const isFlowplayer = dataAttr.includes('flowplayer') && dataAttr.endsWith('.swf');
    if (!isFlowplayer) return false;
    const flashvarsParam = objEl.querySelector('param[name="flashvars" i]');
    const flashvars = flashvarsParam?.getAttribute('value') || '';
    const flvUrlRaw = extractFlvUrlFromFlashvars(flashvars);
    if (!flvUrlRaw) return false;

    const flvUrl = toAbsoluteUrl(flvUrlRaw);
    const width = parseInt(objEl.getAttribute('width') || '640', 10) || 640;
    const height = parseInt(objEl.getAttribute('height') || '480', 10) || 480;
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
    const tip = document.createElement('div');
    tip.style.fontSize = '12px';
    tip.style.color = '#666';
    tip.style.marginTop = '6px';
    tip.textContent = `FLV 视频（flv.js）：${flvUrl}`;

    wrapper.appendChild(video);
    wrapper.appendChild(tip);
    objEl.parentNode.insertBefore(wrapper, objEl);
    objEl.remove();
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
      video._flvjsPlayer = player;
    } catch (e) {
      console.error('[TM flv.js] init error', e);
      tip.textContent = 'flv.js 初始化失败，建议直接下载观看：' + flvUrl;
    }

    return true;
  }

  async function main() {
    try {
      await loadScript(FLVJS_CDN);
    } catch (e) {
      console.error('[TM flv.js] failed to load flv.js from cdnjs', e);
      return;
    }
    const objects = Array.from(document.querySelectorAll('object'));
    let replaced = 0;
    objects.forEach((obj, i) => {
      if (replaceOneObject(obj, i)) replaced++;
    });
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
