const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { SocialStore, createAccessToken } = require('../src/server/social-store');

test('social data survives a store restart without persisting raw access tokens', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-social-'));
  const filePath = path.join(directory, 'social.json');
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  const first = new SocialStore(filePath);
  const registration = await first.register('PersistentPlayer');
  const publicProfile = await first.updateUsername(registration.user.id, 'PersistentPlayer');
  assert.equal(publicProfile.tokenHash, undefined);
  await first.addGlobalMessage(registration.user.id, 'saved message');

  const raw = fs.readFileSync(filePath, 'utf8');
  assert.equal(raw.includes(registration.token), false);

  const second = new SocialStore(filePath);
  const authenticated = second.findByToken(registration.token);
  assert.equal(authenticated.username, 'PersistentPlayer');
  assert.equal(second.data.globalMessages[0].text, 'saved message');
});

test('a recovery key derives the same Nexus ID without server storage', async () => {
  const token = createAccessToken();
  const first = new SocialStore(null);
  const second = new SocialStore(null);

  const initial = await first.register('FirstName', token);
  const restored = await second.register('ChangedName', token);

  assert.equal(restored.user.id, initial.user.id);
  assert.equal(restored.user.friendCode, initial.user.friendCode);
  assert.notEqual(restored.user.username, initial.user.username);
});
