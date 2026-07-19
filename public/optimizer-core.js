(function nexusOptimizerCore() {
    'use strict';
    if (window.NexusOptimizer) return;

    const SETTINGS_KEY = 'nxo:settings:v1';
    const BASELINE_KEY = 'nxo:baseline:v1';
    const AUTO_TUNE_KEY = 'nxo:auto-tune:v1';
    const GAME_CONFIG_KEY = 'surviv_config';
    const REGION_LEASE_KEY = 'nxo:region-lease:v1';
    const THIRD_PARTY_EVENT = 'nxo:set-network-quiet';

    const DEFAULTS = Object.freeze({
        enabled: true,
        preset: 'balanced',
        targetFps: 75,
        lowResTextures: true,
        renderAt1x: true,
        keepInterpolation: false,
        disableScreenShake: true,
        muteAudio: false,
        reduceLobbyMotion: true,
        quietGameplay: true,
        competitiveMode: false,
        lockSelectedRegion: false,
        smartRegion: true,
        regionLeaseHours: 72,
        autoTune: true,
        blockThirdParty: false,
        sleepMonitorInGame: true
    });

    const PRESETS = Object.freeze({
        quality: {
            enabled: true, lowResTextures: false, renderAt1x: false, keepInterpolation: true,
            disableScreenShake: false, muteAudio: false, reduceLobbyMotion: true,
            quietGameplay: false, competitiveMode: false, lockSelectedRegion: false,
            smartRegion: true, autoTune: false, blockThirdParty: false, sleepMonitorInGame: true
        },
        balanced: {
            enabled: true, lowResTextures: true, renderAt1x: true, keepInterpolation: false,
            disableScreenShake: true, muteAudio: false, reduceLobbyMotion: true,
            quietGameplay: true, competitiveMode: false, lockSelectedRegion: false,
            smartRegion: true, autoTune: true, blockThirdParty: false, sleepMonitorInGame: true
        },
        performance: {
            enabled: true, lowResTextures: true, renderAt1x: true, keepInterpolation: false,
            disableScreenShake: true, muteAudio: false, reduceLobbyMotion: true,
            quietGameplay: true, competitiveMode: false, lockSelectedRegion: false,
            smartRegion: true, autoTune: false, blockThirdParty: true, sleepMonitorInGame: true
        },
        competitive: {
            enabled: true, lowResTextures: true, renderAt1x: true, keepInterpolation: false,
            disableScreenShake: true, muteAudio: false, reduceLobbyMotion: true,
            quietGameplay: true, competitiveMode: true, lockSelectedRegion: false,
            smartRegion: true, autoTune: false, blockThirdParty: true, sleepMonitorInGame: true
        },
        extreme: {
            enabled: true, lowResTextures: true, renderAt1x: true, keepInterpolation: false,
            disableScreenShake: true, muteAudio: true, reduceLobbyMotion: true,
            quietGameplay: true, competitiveMode: false, lockSelectedRegion: true,
            smartRegion: false, autoTune: false, blockThirdParty: true, sleepMonitorInGame: true
        },
        original: {
            enabled: false, lowResTextures: false, renderAt1x: false, keepInterpolation: true,
            disableScreenShake: false, muteAudio: false, reduceLobbyMotion: false,
            quietGameplay: false, competitiveMode: false, lockSelectedRegion: false,
            smartRegion: false, autoTune: false, blockThirdParty: false, sleepMonitorInGame: false
        }
    });

    const OPTION_DEFS = Object.freeze([
        { key: 'lowResTextures', title: 'Light textures', description: 'Uses the low-resolution atlases already included by the game. Reduces VRAM and asset load.' },
        { key: 'renderAt1x', title: 'Render at 1x', description: 'Avoids drawing at 2x on HiDPI displays. This can cut the game canvas pixel workload substantially.' },
        { key: 'keepInterpolation', title: 'Client-side interpolation', description: 'Smoother movement, but it performs interpolation work for visible players every frame.' },
        { key: 'disableScreenShake', title: 'Disable screen shake', description: 'Removes nonessential camera motion and its small per-frame cost.' },
        { key: 'muteAudio', title: 'Mute game audio', description: 'Optional extreme saving. Audio provides gameplay information, so normal presets keep it enabled.' },
        { key: 'reduceLobbyMotion', title: 'Reduce lobby motion', description: 'Stops decorative lobby animations and transitions without changing the in-match HUD.' },
        { key: 'quietGameplay', title: 'Sleep lobby while playing', description: 'Hides lobby backgrounds, ads, and decorative composition only during a match.' },
        { key: 'competitiveMode', title: 'Competitive mode', description: 'Prioritizes input-to-frame consistency and keeps monitoring asleep during gameplay.' },
        { key: 'sleepMonitorInGame', title: 'Sleep diagnostics in match', description: 'Stops optimizer metrics when the Performance page is closed or a match is active.' },
        { key: 'autoTune', title: 'Automatic calibration', description: 'Measures four seconds in the lobby at most once every seven days and recommends a stable preset.' },
        { key: 'smartRegion', title: 'Smart region lease', description: 'Reuses the game-selected region for 72 hours on the same network, avoiding repeated startup probes.' },
        { key: 'lockSelectedRegion', title: 'Lock selected region', description: 'Forces the saved game region. It reduces startup probes but a poor region choice can increase ping.' },
        { key: 'blockThirdParty', title: 'Block third-party traffic', description: 'Extension only. Blocks observed ads and analytics, never matchmaking, game WebSockets, or Cloudflare.' }
    ]);

    const readJson = (key, fallback) => {
        try {
            const value = JSON.parse(localStorage.getItem(key) || 'null');
            return value && typeof value === 'object' ? value : fallback;
        } catch (error) {
            return fallback;
        }
    };

    const writeJson = (key, value) => {
        try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (error) { return false; }
    };

    const normalize = (value = {}) => ({
        ...DEFAULTS,
        ...value,
        preset: Object.hasOwn(PRESETS, value.preset) || value.preset === 'custom' ? value.preset : 'balanced',
        regionLeaseHours: Math.max(1, Math.min(720, Number(value.regionLeaseHours) || 72)),
        targetFps: Math.max(30, Math.min(240, Number(value.targetFps) || 75))
    });

    const storedSettings = normalize(readJson(SETTINGS_KEY, {}));
    let settings = storedSettings.preset !== 'custom' && Object.hasOwn(PRESETS, storedSettings.preset)
        ? normalize({ ...storedSettings, ...PRESETS[storedSettings.preset], preset: storedSettings.preset })
        : storedSettings;
    let playing = false;
    let gameObserver = null;
    let gameSearchTimer = null;
    let metricsStop = null;
    let autoTuneTimer = null;

    const deviceSignature = () => [
        navigator.hardwareConcurrency || 0,
        navigator.deviceMemory || 0,
        `${screen.width}x${screen.height}`,
        window.devicePixelRatio || 1
    ].join('|');

    const captureBaseline = () => {
        const existing = readJson(BASELINE_KEY, null);
        if (existing?.values) return existing;
        const config = readJson(GAME_CONFIG_KEY, {});
        const defaults = { highResTex: true, interpolation: true, localRotation: true, screenShake: true, muteAudio: false, regionSelected: false };
        const baseline = {
            capturedAt: new Date().toISOString(),
            values: Object.fromEntries(Object.keys(defaults).map((key) => [key, Object.hasOwn(config, key) ? config[key] : defaults[key]]))
        };
        writeJson(BASELINE_KEY, baseline);
        return baseline;
    };

    const applyGameConfig = (next) => {
        const baseline = captureBaseline().values;
        const gameConfig = readJson(GAME_CONFIG_KEY, {});
        if (!next.enabled) {
            Object.assign(gameConfig, baseline);
        } else {
            gameConfig.highResTex = next.lowResTextures ? false : baseline.highResTex;
            gameConfig.interpolation = Boolean(next.keepInterpolation);
            gameConfig.screenShake = next.disableScreenShake ? false : baseline.screenShake;
            gameConfig.muteAudio = next.muteAudio ? true : baseline.muteAudio;
            if (next.lockSelectedRegion && gameConfig.region) gameConfig.regionSelected = true;
            else if (!next.smartRegion) gameConfig.regionSelected = false;
        }
        gameConfig.localRotation = true;
        writeJson(GAME_CONFIG_KEY, gameConfig);
        return gameConfig;
    };

    const PAGE_STYLE = `
        html[data-nxo-motion="reduced"] #start-menu-wrapper *,
        html[data-nxo-motion="reduced"] #background,
        html[data-nxo-motion="reduced"] #start-overlay { animation-duration:.001ms !important; animation-iteration-count:1 !important; transition-duration:.001ms !important; scroll-behavior:auto !important; }
        html[data-nxo-playing="true"][data-nxo-quiet="true"] #background,
        html[data-nxo-playing="true"][data-nxo-quiet="true"] #start-overlay,
        html[data-nxo-playing="true"][data-nxo-quiet="true"] .ad-block-header,
        html[data-nxo-playing="true"][data-nxo-quiet="true"] .ad-block-left-center,
        html[data-nxo-playing="true"][data-nxo-quiet="true"] .ad-block-right-center,
        html[data-nxo-playing="true"][data-nxo-quiet="true"] .ad-block-leaderboard-bottom,
        html[data-nxo-playing="true"][data-nxo-quiet="true"] #ad-rail-left,
        html[data-nxo-playing="true"][data-nxo-quiet="true"] #ad-rail-right { content-visibility:hidden !important; visibility:hidden !important; }
    `;

    const applyPageFlags = () => {
        const root = document.documentElement;
        if (!root) return;
        root.dataset.nxoMotion = settings.enabled && settings.reduceLobbyMotion ? 'reduced' : 'normal';
        root.dataset.nxoQuiet = settings.enabled && settings.quietGameplay ? 'true' : 'false';
        root.dataset.nxoCompetitive = settings.enabled && settings.competitiveMode ? 'true' : 'false';
    };

    const pauseLobbyMedia = () => {
        document.querySelectorAll('#background video, #start-menu-wrapper video, #start-overlay video').forEach((video) => {
            if (!video.paused) video.pause().catch(() => {});
        });
    };

    const detectPlaying = () => {
        const game = document.getElementById('game-area-wrapper');
        const next = Boolean(game && getComputedStyle(game).display !== 'none');
        if (next && !playing) pauseLobbyMedia();
        playing = next;
        if (document.documentElement) document.documentElement.dataset.nxoPlaying = String(playing);
        window.dispatchEvent(new CustomEvent('NEXUS_OPTIMIZER_PLAY_STATE', { detail: { playing } }));
        if (playing && settings.sleepMonitorInGame && metricsStop) metricsStop();
    };

    const installRuntime = (attempt = 0) => {
        if (!document.getElementById('nxo-page-style')) {
            const style = document.createElement('style');
            style.id = 'nxo-page-style';
            style.textContent = PAGE_STYLE;
            (document.head || document.documentElement).appendChild(style);
        }
        applyPageFlags();
        detectPlaying();
        const game = document.getElementById('game-area-wrapper');
        if (game && !gameObserver) {
            gameObserver = new MutationObserver(detectPlaying);
            gameObserver.observe(game, { attributes: true, attributeFilter: ['class', 'style'] });
        } else if (!game && attempt < 20) {
            clearTimeout(gameSearchTimer);
            gameSearchTimer = setTimeout(() => installRuntime(attempt + 1), 1000);
        }
    };

    const rulesetForHost = () => location.hostname.endsWith('survev.io') || location.hostname.endsWith('resurviv.biz');
    const networkBlockingSupported = () => Boolean(rulesetForHost() && globalThis.chrome?.runtime?.sendMessage);
    const syncNetworkRules = async (next = settings) => {
        if (!networkBlockingSupported()) return { ok: false, unsupported: true };
        try {
            return await globalThis.chrome.runtime.sendMessage({
                type: THIRD_PARTY_EVENT,
                host: location.hostname,
                enabled: Boolean(next.enabled && next.blockThirdParty)
            });
        } catch (error) {
            return { ok: false, error: String(error) };
        }
    };

    const percentile = (values, fraction) => {
        if (!values.length) return 0;
        const sorted = [...values].sort((a, b) => a - b);
        return sorted[Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1))];
    };

    const nearestRefreshRate = (rawRefresh) => [60, 75, 90, 120, 144, 165, 240].reduce((best, rate) => (
        Math.abs(rate - rawRefresh) < Math.abs(best - rawRefresh) ? rate : best
    ), 60);

    const collectFor = (durationMs = 4000, onUpdate) => new Promise((resolve) => {
        const frames = [];
        let longTasks = 0;
        let longTaskMs = 0;
        let raf = 0;
        let observer = null;
        const startedAt = performance.now();
        const sample = (now) => {
            frames.push(now);
            if (onUpdate) onUpdate(calculateMetrics(frames, longTasks, longTaskMs));
            if (now - startedAt < durationMs) raf = requestAnimationFrame(sample);
            else finish();
        };
        const finish = () => {
            if (raf) cancelAnimationFrame(raf);
            observer?.disconnect();
            resolve(calculateMetrics(frames, longTasks, longTaskMs));
        };
        try {
            observer = new PerformanceObserver((list) => {
                list.getEntries().forEach((entry) => { longTasks += 1; longTaskMs += entry.duration; });
            });
            observer.observe({ entryTypes: ['longtask'] });
        } catch (error) { observer = null; }
        raf = requestAnimationFrame(sample);
    });

    const calculateMetrics = (frames, longTasks, longTaskMs, inputToFrame = [], peakFps = 0) => {
        const intervals = [];
        for (let index = 1; index < frames.length; index += 1) {
            const interval = frames[index] - frames[index - 1];
            if (interval > 0 && interval < 250) intervals.push(interval);
        }
        const p95 = percentile(intervals, .95);
        const p99 = percentile(intervals, .99);
        const median = percentile(intervals, .5);
        const rawRefresh = median ? 1000 / median : 0;
        const displayHz = nearestRefreshRate(rawRefresh || 60);
        return {
            fps: median ? Math.round(1000 / median) : 0,
            onePercentLow: p99 ? Number((1000 / p99).toFixed(1)) : 0,
            p95: Number(p95.toFixed(2)),
            longTasks,
            longTaskMs: Number(longTaskMs.toFixed(1)),
            inputP95: Number(percentile(inputToFrame, .95).toFixed(2)),
            peakFps,
            displayHz,
            passiveRtt: Number(navigator.connection?.rtt) || 0
        };
    };

    const startMetrics = (onUpdate) => {
        if (metricsStop) metricsStop();
        let stopped = false;
        const frames = [];
        let longTasks = 0;
        let longTaskMs = 0;
        let raf = 0;
        let timer = 0;
        let observer = null;
        let peakFps = 0;
        const inputToFrame = [];
        const sampleInput = (event) => {
            if (!settings.enabled || !settings.competitiveMode) return;
            if (event.type === 'keydown' && (event.repeat || event.key === 'F8')) return;
            const inputAt = performance.now();
            requestAnimationFrame((frameAt) => {
                inputToFrame.push(Math.max(0, frameAt - inputAt));
                if (inputToFrame.length > 120) inputToFrame.shift();
            });
        };
        const sample = (now) => {
            if (stopped) return;
            frames.push(now);
            const cutoff = now - 5000;
            while (frames.length && frames[0] < cutoff) frames.shift();
            raf = requestAnimationFrame(sample);
        };
        try {
            observer = new PerformanceObserver((list) => list.getEntries().forEach((entry) => { longTasks += 1; longTaskMs += entry.duration; }));
            observer.observe({ entryTypes: ['longtask'] });
        } catch (error) { observer = null; }
        document.addEventListener('pointerdown', sampleInput, true);
        document.addEventListener('keydown', sampleInput, true);
        raf = requestAnimationFrame(sample);
        timer = setInterval(() => {
            const now = performance.now();
            peakFps = Math.max(peakFps, frames.filter((time) => time >= now - 1000).length);
            onUpdate?.(calculateMetrics(frames, longTasks, longTaskMs, inputToFrame, peakFps));
        }, settings.competitiveMode ? 2000 : 1000);
        metricsStop = () => {
            stopped = true;
            cancelAnimationFrame(raf);
            clearInterval(timer);
            observer?.disconnect();
            document.removeEventListener('pointerdown', sampleInput, true);
            document.removeEventListener('keydown', sampleInput, true);
            metricsStop = null;
        };
        return metricsStop;
    };

    const calibrate = async () => {
        if (playing) return { ok: false, error: 'Calibration is available in the lobby only.' };
        const metrics = await collectFor(4000);
        const displayHz = nearestRefreshRate(metrics.fps || 60);
        const target = Math.min(75, displayHz);
        const budget = 1000 / target;
        const stressed = metrics.p95 > budget * 1.2
            || (metrics.onePercentLow > 0 && metrics.onePercentLow < target * .8)
            || metrics.longTasks > 0
            || (navigator.deviceMemory && navigator.deviceMemory <= 4)
            || (navigator.hardwareConcurrency || 8) <= 4;
        const recommended = stressed ? 'performance' : 'balanced';
        const report = { ...metrics, displayHz, measuredAt: Date.now(), deviceSignature: deviceSignature(), recommended, targetFps: target };
        writeJson(AUTO_TUNE_KEY, report);
        if (['balanced', 'performance'].includes(settings.preset)) {
            settings = normalize({ ...settings, ...PRESETS[recommended], preset: recommended, targetFps: target, autoTune: true });
            writeJson(SETTINGS_KEY, settings);
            applyGameConfig(settings);
            applyPageFlags();
            await syncNetworkRules(settings);
        }
        window.dispatchEvent(new CustomEvent('NEXUS_OPTIMIZER_CALIBRATED', { detail: report }));
        return { ok: true, report, settings: { ...settings } };
    };

    const scheduleAutoTune = () => {
        clearTimeout(autoTuneTimer);
        const report = readJson(AUTO_TUNE_KEY, null);
        const stale = !report || report.deviceSignature !== deviceSignature() || Date.now() - Number(report.measuredAt || 0) > 7 * 24 * 60 * 60 * 1000;
        if (!settings.enabled || !settings.autoTune || !stale) return;
        autoTuneTimer = setTimeout(() => { if (!playing) calibrate(); }, 5000);
    };

    const settingsForPreset = (preset, base = settings) => {
        if (preset === 'custom') return normalize({ ...base, preset: 'custom' });
        return normalize({ ...base, ...(PRESETS[preset] || PRESETS.balanced), preset: Object.hasOwn(PRESETS, preset) ? preset : 'balanced' });
    };

    const apply = async (next) => {
        settings = normalize(next);
        if (settings.preset !== 'custom' && Object.hasOwn(PRESETS, settings.preset)) settings = settingsForPreset(settings.preset, settings);
        writeJson(SETTINGS_KEY, settings);
        const gameConfig = applyGameConfig(settings);
        applyPageFlags();
        const network = await syncNetworkRules(settings);
        scheduleAutoTune();
        window.dispatchEvent(new CustomEvent('NEXUS_OPTIMIZER_SETTINGS', { detail: { settings: { ...settings }, gameConfig, network } }));
        return { settings: { ...settings }, gameConfig, network, reloadRequired: true };
    };

    const restore = async () => apply(settingsForPreset('original'));
    const destroy = () => {
        clearTimeout(gameSearchTimer);
        clearTimeout(autoTuneTimer);
        gameObserver?.disconnect();
        metricsStop?.();
    };

    window.NexusOptimizer = Object.freeze({
        defaults: { ...DEFAULTS },
        presets: Object.fromEntries(Object.entries(PRESETS).map(([key, value]) => [key, { ...value }])),
        options: OPTION_DEFS.map((option) => ({ ...option })),
        getSettings: () => ({ ...settings }),
        getAutoTuneReport: () => readJson(AUTO_TUNE_KEY, null),
        isPlaying: () => playing,
        isNetworkBlockingSupported: networkBlockingSupported,
        settingsForPreset,
        apply,
        restore,
        calibrate,
        startMetrics,
        stopMetrics: () => metricsStop?.(),
        destroy
    });

    captureBaseline();
    applyGameConfig(settings);
    installRuntime();
    syncNetworkRules(settings);
    scheduleAutoTune();
    window.addEventListener('pagehide', destroy, { once: true });
})();
