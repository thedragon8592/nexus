(function() {
    if (window.__nexusGameIdInterceptor) return;
    window.__nexusGameIdInterceptor = true;
    const OriginalWebSocket = window.WebSocket;
    window.WebSocket = new Proxy(OriginalWebSocket, {
        construct(Target, args) {
            const match = String(args[0] || '').match(/play\?gameId=([a-zA-Z0-9._:-]+)/i);
            if (match) {
                window.postMessage({ type: 'NEXUS_GAMEID', gameId: match[1] }, window.location.origin);
            }
            return Reflect.construct(Target, args);
        }
    });
    const fromURL = (window.location.hash + window.location.search).match(/gameId=([a-zA-Z0-9._:-]+)/i);
    if (fromURL) {
        window.postMessage({ type: 'NEXUS_GAMEID', gameId: fromURL[1] }, window.location.origin);
    }
})();
