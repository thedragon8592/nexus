const test = require('node:test');
const assert = require('node:assert/strict');
const { readProfile } = require('../src/server/validation');

test('profile bios allow up to 250 words and reject larger payloads', () => {
  const validBio = Array.from({ length: 250 }, (_, index) => `word${index}`).join(' ');
  const invalidBio = `${validBio} overflow`;

  assert.equal(readProfile({ avatarUrl: '', bio: validBio }).ok, true);
  const invalid = readProfile({ avatarUrl: '', bio: invalidBio });
  assert.equal(invalid.ok, false);
  assert.match(invalid.error, /250 words/);
});
