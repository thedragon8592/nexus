'use strict';

const RULESET_BY_SITE = Object.freeze({
  'survev.io': 'lean_survev',
  'resurviv.biz': 'lean_resurviv',
});

function rulesetForHost(host = '') {
  const normalized = String(host).toLowerCase();
  return Object.entries(RULESET_BY_SITE).find(([site]) => normalized === site || normalized.endsWith(`.${site}`))?.[1];
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'nxo:set-network-quiet') return false;
  const ruleset = rulesetForHost(message.host);
  if (!ruleset) {
    sendResponse({ ok: false, error: 'unsupported_host' });
    return false;
  }
  chrome.declarativeNetRequest.getEnabledRulesets()
    .then((enabled) => {
      const shouldEnable = Boolean(message.enabled);
      if (enabled.includes(ruleset) === shouldEnable) return null;
      return chrome.declarativeNetRequest.updateEnabledRulesets({
        enableRulesetIds: shouldEnable ? [ruleset] : [],
        disableRulesetIds: shouldEnable ? [] : [ruleset],
      });
    })
    .then(
      () => sendResponse({ ok: true, ruleset, enabled: Boolean(message.enabled) }),
      (error) => sendResponse({ ok: false, error: String(error) }),
    );
  return true;
});
