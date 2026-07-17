const LIMITS = Object.freeze({
  gameId: 96,
  username: 15,
  message: 250,
  pinnedMessage: 160,
  pollQuestion: 120,
  pollOption: 60,
  pollOptions: 6,
  activePolls: 10,
  history: 50,
  messageId: 80,
  friendCode: 14,
  bio: 160,
  avatarUrl: 500,
});

const VALID_REACTIONS = new Set(['\u{1F44D}', '\u{1F602}', '\u{1F62E}', '\u2764\uFE0F', '\u{1F525}']);
const GAME_ID_PATTERN = /^[a-zA-Z0-9._:-]+$/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const SAFE_COLOR = /^(#[0-9a-f]{6}|hsl\(\s*(?:\d|[1-9]\d|[12]\d\d|3[0-5]\d|360)\s*,\s*(?:\d|[1-9]\d|100)%\s*,\s*(?:\d|[1-9]\d|100)%\s*\))$/i;

function normalizeName(value) {
  return typeof value === 'string' ? value.trim().toLocaleLowerCase() : '';
}

function readText(value, { name, min = 1, max, allowEmpty = false }) {
  if (typeof value !== 'string') {
    return { ok: false, error: `${name} must be text.` };
  }
  const text = value.trim();
  if (allowEmpty && text.length === 0) return { ok: true, value: '' };
  if (text.length < min || text.length > max || CONTROL_CHARACTERS.test(text)) {
    return { ok: false, error: `${name} must contain between ${min} and ${max} valid characters.` };
  }
  return { ok: true, value: text };
}

function readGameId(value) {
  const result = readText(value, { name: 'Game ID', max: LIMITS.gameId });
  if (!result.ok) return result;
  if (!GAME_ID_PATTERN.test(result.value)) {
    return { ok: false, error: 'Game ID contains invalid characters.' };
  }
  return result;
}

function readUsername(value) {
  return readText(value, { name: 'Username', max: LIMITS.username });
}

function readFriendCode(value) {
  const result = readText(value, { name: 'Friend code', max: LIMITS.friendCode });
  if (!result.ok) return result;
  if (!/^NX-[0-9A-F]{6,8}$/i.test(result.value)) {
    return { ok: false, error: 'Friend code must look like NX-12AB34 or NX-12AB34CD.' };
  }
  return { ok: true, value: result.value.toUpperCase() };
}

function readProfile(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, error: 'Profile data is invalid.' };
  }
  const bio = readText(payload.bio || '', {
    name: 'Bio', min: 0, max: LIMITS.bio, allowEmpty: true,
  });
  if (!bio.ok) return bio;
  const avatarUrl = typeof payload.avatarUrl === 'string' ? payload.avatarUrl.trim() : '';
  if (avatarUrl.length > LIMITS.avatarUrl) {
    return { ok: false, error: `Avatar URL must be at most ${LIMITS.avatarUrl} characters.` };
  }
  if (avatarUrl) {
    try {
      const parsed = new URL(avatarUrl);
      if (parsed.protocol !== 'https:') throw new Error('Avatar must use HTTPS.');
    } catch {
      return { ok: false, error: 'Avatar URL must be a valid HTTPS URL.' };
    }
  }
  return { ok: true, value: { bio: bio.value, avatarUrl } };
}

function readColor(value) {
  return typeof value === 'string' && SAFE_COLOR.test(value.trim())
    ? value.trim()
    : '#5dade2';
}

function readKills(value) {
  const kills = Number.parseInt(value, 10);
  return Number.isFinite(kills) ? Math.max(0, Math.min(kills, 999)) : 0;
}

function readChatPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, error: 'Message payload is invalid.' };
  }
  const text = readText(payload.text, { name: 'Message', max: LIMITS.message });
  if (!text.ok) return text;

  let recipient = null;
  if (payload.recipient !== null && payload.recipient !== undefined && payload.recipient !== '') {
    const parsedRecipient = readUsername(payload.recipient);
    if (!parsedRecipient.ok) return parsedRecipient;
    recipient = parsedRecipient.value;
  }

  return {
    ok: true,
    value: {
      text: text.value,
      recipient,
      authorColor: readColor(payload.authorColor),
      kills: readKills(payload.kills),
    },
  };
}

function readPoll(payload) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.options)) {
    return { ok: false, error: 'Poll payload is invalid.' };
  }
  const question = readText(payload.question, {
    name: 'Poll question',
    max: LIMITS.pollQuestion,
  });
  if (!question.ok) return question;
  if (payload.options.length < 2 || payload.options.length > LIMITS.pollOptions) {
    return { ok: false, error: `A poll needs 2 to ${LIMITS.pollOptions} options.` };
  }
  const options = [];
  for (const value of payload.options) {
    const option = readText(value, { name: 'Poll option', max: LIMITS.pollOption });
    if (!option.ok) return option;
    options.push(option.value);
  }
  if (new Set(options.map((option) => option.toLocaleLowerCase())).size !== options.length) {
    return { ok: false, error: 'Poll options must be unique.' };
  }
  return { ok: true, value: { question: question.value, options } };
}

module.exports = {
  ALLOWED_REACTIONS: VALID_REACTIONS,
  LIMITS,
  normalizeName,
  readChatPayload,
  readColor,
  readFriendCode,
  readGameId,
  readPoll,
  readProfile,
  readText,
  readUsername,
};
