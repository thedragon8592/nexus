(function nexusOptimizerEarly() {
    'use strict';
    if (window.__nexusOptimizerEarlyLoaded || window.top !== window.self) return;
    window.__nexusOptimizerEarlyLoaded = true;

    const SETTINGS_KEY = 'nxo:settings:v1';
    const BASELINE_KEY = 'nxo:baseline:v1';
    const GAME_CONFIG_KEY = 'surviv_config';
    const REGION_LEASE_KEY = 'nxo:region-lease:v1';
    const defaults = {
        enabled: true, preset: 'balanced', targetFps: 75, lowResTextures: true,
        renderAt1x: true, keepInterpolation: false, disableScreenShake: true,
        muteAudio: false, reduceLobbyMotion: true, quietGameplay: true,
        competitiveMode: false, lockSelectedRegion: false, smartRegion: true,
        regionLeaseHours: 72, autoTune: true, blockThirdParty: false,
        sleepMonitorInGame: true
    };
    const gameDefaults = {
        highResTex: true, interpolation: true, localRotation: true,
        screenShake: true, muteAudio: false, regionSelected: false
    };
    const readJson = (key, fallback) => {
        try {
            const value = JSON.parse(localStorage.getItem(key) || 'null');
            return value && typeof value === 'object' ? value : fallback;
        } catch (error) { return fallback; }
    };
    const settings = { ...defaults, ...readJson(SETTINGS_KEY, {}) };
    const gameConfig = readJson(GAME_CONFIG_KEY, {});
    const startupAt = Date.now();
    const connection = navigator.connection;
    const networkFingerprint = [connection?.type || 'unknown', connection?.effectiveType || 'unknown'].join('|');

    let baseline = readJson(BASELINE_KEY, null);
    if (!baseline?.values) {
        baseline = {
            capturedAt: new Date().toISOString(),
            values: Object.fromEntries(Object.keys(gameDefaults).map((key) => [key, Object.hasOwn(gameConfig, key) ? gameConfig[key] : gameDefaults[key]]))
        };
        try { localStorage.setItem(BASELINE_KEY, JSON.stringify(baseline)); } catch (error) {}
    }

    const original = { ...gameDefaults, ...baseline.values };
    const regionLease = readJson(REGION_LEASE_KEY, null);
    const leaseDurationMs = Math.max(1, Number(settings.regionLeaseHours) || 72) * 60 * 60 * 1000;
    let regionMode = 'automatic';

    if (settings.enabled) {
        gameConfig.highResTex = settings.lowResTextures ? false : original.highResTex;
        gameConfig.interpolation = Boolean(settings.keepInterpolation);
        gameConfig.localRotation = true;
        gameConfig.screenShake = settings.disableScreenShake ? false : original.screenShake;
        gameConfig.muteAudio = settings.muteAudio ? true : original.muteAudio;
        if (settings.lockSelectedRegion && gameConfig.region) {
            gameConfig.regionSelected = true;
            regionMode = 'manual';
        } else if (settings.smartRegion && gameConfig.region) {
            const leaseValid = regionLease
                && regionLease.region === gameConfig.region
                && regionLease.networkFingerprint === networkFingerprint
                && Number(regionLease.expiresAt) > startupAt;
            gameConfig.regionSelected = Boolean(leaseValid);
            regionMode = leaseValid ? 'smart-locked' : 'smart-probe';
        } else {
            gameConfig.regionSelected = false;
        }
    } else {
        Object.assign(gameConfig, original);
        gameConfig.localRotation = true;
    }
    try { localStorage.setItem(GAME_CONFIG_KEY, JSON.stringify(gameConfig)); } catch (error) {}

    const nativeDpr = window.devicePixelRatio || 1;
    let dprOverrideApplied = false;
    let ownDprDescriptor;
    let restoreCanvasHook = () => {};
    if (settings.enabled && settings.renderAt1x && nativeDpr > 1) {
        try {
            ownDprDescriptor = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio');
            Object.defineProperty(window, 'devicePixelRatio', { configurable: true, enumerable: true, get: () => 1 });
            dprOverrideApplied = window.devicePixelRatio === 1;
        } catch (error) { dprOverrideApplied = false; }
    }

    const restoreDprGetter = () => {
        if (!dprOverrideApplied) return;
        try {
            if (ownDprDescriptor) Object.defineProperty(window, 'devicePixelRatio', ownDprDescriptor);
            else delete window.devicePixelRatio;
        } catch (error) {}
    };

    const announce = () => window.postMessage({
        source: 'nxo:early',
        version: 4,
        applied: {
            enabled: settings.enabled,
            lowResTextures: settings.enabled && settings.lowResTextures,
            renderAt1x: dprOverrideApplied,
            interpolation: gameConfig.interpolation,
            localRotation: gameConfig.localRotation,
            screenShake: gameConfig.screenShake,
            muteAudio: gameConfig.muteAudio,
            regionLocked: Boolean(gameConfig.regionSelected),
            regionMode
        },
        nativeDpr
    }, location.origin);

    if (dprOverrideApplied) {
        try {
            const originalGetContext = HTMLCanvasElement.prototype.getContext;
            HTMLCanvasElement.prototype.getContext = function (...args) {
                const context = Reflect.apply(originalGetContext, this, args);
                if (this.id === 'cvs') {
                    restoreDprGetter();
                    restoreCanvasHook();
                    announce();
                }
                return context;
            };
            restoreCanvasHook = () => {
                HTMLCanvasElement.prototype.getContext = originalGetContext;
                restoreCanvasHook = () => {};
            };
        } catch (error) {}
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', announce, { once: true });
    else announce();

    window.addEventListener('pagehide', () => {
        if (settings.enabled && settings.smartRegion && regionMode !== 'smart-locked' && regionMode !== 'manual' && Date.now() - startupAt >= 5000) {
            const latestConfig = readJson(GAME_CONFIG_KEY, {});
            if (latestConfig.region) {
                try {
                    localStorage.setItem(REGION_LEASE_KEY, JSON.stringify({
                        region: latestConfig.region,
                        networkFingerprint,
                        measuredAt: new Date().toISOString(),
                        expiresAt: Date.now() + leaseDurationMs
                    }));
                } catch (error) {}
            }
        }
        restoreDprGetter();
        restoreCanvasHook();
    }, { once: true });

    window.setTimeout(() => { restoreDprGetter(); restoreCanvasHook(); }, 30000);
    connection?.addEventListener?.('change', () => {
        try { localStorage.removeItem(REGION_LEASE_KEY); } catch (error) {}
    });
})();
