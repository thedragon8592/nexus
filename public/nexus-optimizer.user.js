// ==UserScript==
// @name         Nexus Optimizer Pro
// @namespace    https://nexus-chat-p7ph.onrender.com/
// @version      2.0.0
// @description  Safe performance presets using real Survev and Resurviv configuration keys.
// @author       ! System
// @license      MIT
// @match        *://resurviv.biz/*
// @match        *://survev.io/*
// @match        *://*.resurviv.biz/*
// @match        *://*.survev.io/*
// @run-at       document-start
// @grant        none
// @downloadURL  https://nexus-chat-p7ph.onrender.com/nexus-optimizer.user.js
// @updateURL    https://nexus-chat-p7ph.onrender.com/nexus-optimizer.user.js
// ==/UserScript==

(function nexusOptimizer() {
    'use strict';
    if (window.__nexusOptimizerLoaded) return;
    window.__nexusOptimizerLoaded = true;

    const MODE_KEY = 'nexus_optimizer_mode';
    const CONFIG_KEY = 'surviv_config';
    const modes = {
        native: null,
        balanced: { highResTex: false, screenShake: false, interpolation: true, localRotation: false },
        'low-power': { highResTex: false, screenShake: false, interpolation: false, localRotation: false }
    };

    function readJson(key, fallback) {
        try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (_) { return fallback; }
    }
    function apply(mode) {
        localStorage.setItem(MODE_KEY, mode);
        if (!modes[mode]) return;
        localStorage.setItem(CONFIG_KEY, JSON.stringify(Object.assign(readJson(CONFIG_KEY, {}), modes[mode])));
    }

    let currentMode = localStorage.getItem(MODE_KEY) || 'balanced';
    if (!Object.prototype.hasOwnProperty.call(modes, currentMode)) currentMode = 'balanced';
    apply(currentMode);

    function createPanel() {
        if (!document.body) { requestAnimationFrame(createPanel); return; }
        const panel = document.createElement('section');
        panel.id = 'nx-optimizer';
        panel.innerHTML = `<header><span><b>NEXUS</b><small>Optimizer</small></span><button id="nxo-close">&minus;</button></header><main><p>Real game presets, without WebSocket patches or fake FPS limits.</p><label>Performance preset<select id="nxo-mode"><option value="native">Native</option><option value="balanced">Balanced</option><option value="low-power">Low power</option></select></label><div class="nxo-grid"><span>High-res textures<b id="nxo-tex">Off</b></span><span>Screen shake<b id="nxo-shake">Off</b></span><span>Interpolation<b id="nxo-interpolation">On</b></span><span>Local rotation<b id="nxo-rotation">Off</b></span></div><button id="nxo-reload">Reload and apply</button><small>Press P to show or hide this panel.</small></main>`;
        const style = document.createElement('style');
        style.textContent = '#nx-optimizer{position:fixed;right:18px;top:18px;z-index:2147483000;width:278px;color:#f4eedb;background:linear-gradient(145deg,rgba(27,33,22,.97),rgba(11,14,10,.98));border:1px solid rgba(242,201,76,.28);border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.58);font:12px Segoe UI,system-ui,sans-serif;overflow:hidden}#nx-optimizer header{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid rgba(226,219,183,.14)}#nx-optimizer header span{display:flex;align-items:baseline;gap:7px}#nx-optimizer header b{color:#f2c94c;letter-spacing:.12em}#nx-optimizer header small,#nx-optimizer p,#nx-optimizer main>small{color:#aab29a}#nx-optimizer button,#nx-optimizer select{border:1px solid rgba(226,219,183,.16);border-radius:9px;background:#20271a;color:#f4eedb;padding:8px}#nx-optimizer header button{padding:2px 8px}#nx-optimizer main{padding:14px}#nx-optimizer p{margin:0 0 12px;line-height:1.45}#nx-optimizer label{display:grid;gap:5px;font-weight:700}#nx-optimizer select{width:100%}.nxo-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin:11px 0}.nxo-grid span{padding:8px;background:rgba(255,255,255,.035);border-radius:9px;color:#aab29a;font-size:10px}.nxo-grid b{display:block;margin-top:3px;color:#f4eedb;font-size:11px}#nxo-reload{width:100%;background:linear-gradient(135deg,#f2c94c,#c6a332)!important;color:#171a10!important;font-weight:800}#nx-optimizer main>small{display:block;margin-top:9px;text-align:center}#nx-optimizer.nxo-min main{display:none}';
        document.head.appendChild(style);
        document.body.appendChild(panel);
        const select = document.getElementById('nxo-mode');
        select.value = currentMode;
        function refresh() {
            const preset = modes[currentMode];
            document.getElementById('nxo-tex').textContent = preset ? (preset.highResTex ? 'On' : 'Off') : 'Game';
            document.getElementById('nxo-shake').textContent = preset ? (preset.screenShake ? 'On' : 'Off') : 'Game';
            document.getElementById('nxo-interpolation').textContent = preset ? (preset.interpolation ? 'On' : 'Off') : 'Game';
            document.getElementById('nxo-rotation').textContent = preset ? (preset.localRotation ? 'On' : 'Off') : 'Game';
        }
        select.addEventListener('change', () => { currentMode = select.value; apply(currentMode); refresh(); });
        document.getElementById('nxo-close').addEventListener('click', () => panel.classList.toggle('nxo-min'));
        document.getElementById('nxo-reload').addEventListener('click', () => location.reload());
        document.addEventListener('keydown', (event) => { if (event.key.toLowerCase() === 'p' && !/input|textarea|select/i.test(event.target.tagName)) panel.hidden = !panel.hidden; });
        refresh();
    }
    createPanel();
})();
