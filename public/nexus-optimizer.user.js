// ==UserScript==
// @name         Nexus Optimizer Compatibility Loader
// @namespace    https://nexus-chat-free.onrender.com/
// @version      3.7.0
// @description  Compatibility loader for the Nexus 75 engine. Install Nexus Chat to configure modes in Performance.
// @author       ! System
// @license      MIT
// @match        *://resurviv.biz/*
// @match        *://survev.io/*
// @match        *://*.resurviv.biz/*
// @match        *://*.survev.io/*
// @run-at       document-start
// @grant        GM.xmlHttpRequest
// @connect      nexus-chat-free.onrender.com
// @downloadURL  https://nexus-chat-free.onrender.com/nexus-optimizer.user.js
// @updateURL    https://nexus-chat-free.onrender.com/nexus-optimizer.user.js
// ==/UserScript==

(async function nexusOptimizerCompatibilityLoader() {
    'use strict';
    if (window.__nexusOptimizerCompatibilityLoader || window.__nexusTampermonkeyLoader) return;
    window.__nexusOptimizerCompatibilityLoader = true;

    const SERVER = 'https://nexus-chat-free.onrender.com';
    const VERSION = '3.7.0';
    const requestText = (url) => new Promise((resolve, reject) => GM.xmlHttpRequest({
        method: 'GET',
        url,
        timeout: 20000,
        onload: (response) => response.status >= 200 && response.status < 300
            ? resolve(response.responseText)
            : reject(new Error(`HTTP ${response.status}`)),
        ontimeout: () => reject(new Error('Request timed out')),
        onerror: () => reject(new Error('Network request failed'))
    }));

    try {
        const [earlyCode, coreCode] = await Promise.all([
            requestText(`${SERVER}/optimizer-early.js?v=${VERSION}`),
            requestText(`${SERVER}/optimizer-core.js?v=${VERSION}`)
        ]);
        const script = document.createElement('script');
        script.textContent = `${earlyCode}\n${coreCode}`;
        (document.head || document.documentElement).appendChild(script);
        script.remove();
        console.info('[Nexus Optimizer] Nexus 75 loaded. Configure it from Nexus Chat > Settings > Performance.');
    } catch (error) {
        console.error('[Nexus Optimizer] Loader error:', error);
    }
})();
