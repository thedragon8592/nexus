// ==UserScript==
// @name         Nexus Chat
// @namespace    https://nexus-chat-free.onrender.com/
// @icon         https://i.ibb.co/FkXVWJnC/Chat-GPT-Image-26-jun-2026-19-06-21.png
// @version      3.6.0
// @description  Nexus chat, social features and live performance optimizer for Resurviv and Survev.
// @author       ! System
// @license      MIT
// @match        *://resurviv.biz/*
// @match        *://survev.io/*
// @match        *://*.resurviv.biz/*
// @match        *://*.survev.io/*
// @run-at       document-start
// @grant        GM.xmlHttpRequest
// @grant        GM.getValue
// @grant        GM.setValue
// @connect      nexus-chat-free.onrender.com
// @downloadURL  https://nexus-chat-free.onrender.com/nexus-chat.user.js
// @updateURL    https://nexus-chat-free.onrender.com/nexus-chat.user.js
// ==/UserScript==

(async function nexusLoader() {
    'use strict';
    if (window.__nexusTampermonkeyLoader) return;
    window.__nexusTampermonkeyLoader = true;

    const SERVER = 'https://nexus-chat-free.onrender.com';
    const LOADER_VERSION = '3.6.0';
    const TOKEN_KEY = 'nexus_social_token';

    function requestText(url) {
        return new Promise((resolve, reject) => {
            GM.xmlHttpRequest({
                method: 'GET',
                url,
                timeout: 20000,
                onload(response) {
                    if (response.status >= 200 && response.status < 300) resolve(response.responseText);
                    else reject(new Error(`HTTP ${response.status}`));
                },
                ontimeout: () => reject(new Error('Request timed out')),
                onerror: () => reject(new Error('Network request failed'))
            });
        });
    }

    function showBootstrapLoader() {
        if (document.getElementById('nx-bootstrap-loader')) return;
        const overlay = document.createElement('div');
        overlay.id = 'nx-bootstrap-loader';
        overlay.innerHTML = '<div style="width:min(360px,80vw);color:#f4eedb;font:600 13px Segoe UI,system-ui,sans-serif"><b style="display:block;color:#f2c94c;font-size:22px;letter-spacing:.12em">NEXUS</b><span id="nx-bootstrap-status" style="display:block;margin:8px 0 14px;color:#aab29a">Preparing the survival network...</span><i style="display:block;height:4px;overflow:hidden;border-radius:8px;background:#252b1f"><i style="display:block;width:42%;height:100%;background:linear-gradient(90deg,#718552,#f2c94c);animation:nxBootstrap 1.2s ease-in-out infinite alternate"></i></i></div>';
        const style = document.createElement('style');
        style.textContent = '#nx-bootstrap-loader{position:fixed;inset:0;z-index:2147483646;display:grid;place-items:center;background:#0d100b}@keyframes nxBootstrap{to{width:92%}}';
        (document.head || document.documentElement).append(style, overlay);
    }

    showBootstrapLoader();
    window.addEventListener('NEXUS_SOCIAL_TOKEN', (event) => {
        const token = event.detail && event.detail.token;
        if (typeof token === 'string' && /^(?:NXR-)?[A-Za-z0-9_-]{40,160}$/.test(token)) GM.setValue(TOKEN_KEY, token);
    });

    try {
        const savedToken = await GM.getValue(TOKEN_KEY, '');
        const [socketIoCode, clientCode] = await Promise.all([
            requestText(`${SERVER}/socket.io/socket.io.js?v=4.7.2`),
            requestText(`${SERVER}/client.js?v=${LOADER_VERSION}`)
        ]);
        const script = document.createElement('script');
        script.textContent = `window.__NEXUS_BOOTSTRAP__=${JSON.stringify({ socialToken: savedToken, serverUrl: SERVER, clientType: 'userscript', installedVersion: LOADER_VERSION })};\n${socketIoCode}\n${clientCode}`;
        (document.head || document.documentElement).appendChild(script);
        script.remove();
    } catch (error) {
        const status = document.getElementById('nx-bootstrap-status');
        if (status) status.textContent = `Nexus could not start: ${error.message}. Reload to retry.`;
        console.error('[NexusChat] Loader error:', error);
    }
})();
