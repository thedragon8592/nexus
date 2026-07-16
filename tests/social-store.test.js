const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { SocialStore } = require('../src/server/social-store');

test('social data survives a store restart without persisting raw access tokens', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-social-'));
  const filePath = path.join(directory, 'social.json');
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  const first = new SocialStore(filePath);
  const registration = await first.register('PersistentPlayer');
  await first.addGlobalMessage(registration.user.id, 'saved message');

  const raw = fs.readFileSync(filePath, 'utf8');
  assert.equal(raw.includes(registration.token), false);

  const second = new SocialStore(filePath);
  const authenticated = second.findByToken(registration.token);
  assert.equal(authenticated.username, 'PersistentPlayer');
  assert.equal(second.data.globalMessages[0].text, 'saved message');
});
