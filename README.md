# Nexus Chat

Nexus Chat is a real-time social overlay and live performance toolkit for Survev and Resurviv.

## Public release

Current version: **3.7.0**

- Match and Global chat with the same command set
- Friends, profiles, persistent Nexus IDs, and saved direct messages
- Private messages in Match and Global
- Smart mentions, including usernames with spaces
- Reactions, typing indicators, blocking, polls, pins, and online lists
- Integrated performance presets that keep client-side player rotation enabled
- Fully hidden Dim mode that does not intercept game input
- Futuristic sound cues with volume and Do Not Disturb controls

## Commands

The following commands work in Match and Global:

- `/help`
- `/online`
- `/poll "Question" "Option 1" "Option 2"`
- `/pin Message`
- `/stats`
- `/me action`

Use `(name) message` for a private message in Match or Global. Type `@` to open mention suggestions.

## Installation

### Browser extension

Download the current ZIP from [wnexuschat.netlify.app](https://wnexuschat.netlify.app), extract it, enable Developer mode in Chrome or Edge, and choose **Load unpacked**.

### Tampermonkey

Install [nexus-chat.user.js](https://nexus-chat-free.onrender.com/nexus-chat.user.js). The userscript loads the current production client from the Nexus server.

## Development

Requirements: Node.js 20 or newer.

```bash
npm install
npm test
npm run check
npm run build:extension
npm start
```

Production requires both `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`. Never commit the auth token.

## Data and security

Read [PRIVACY.md](PRIVACY.md) and [SECURITY.md](SECURITY.md) before operating a public deployment. Recovery keys must remain private.

## License

MIT. Nexus Chat is an independent community project and is not affiliated with Survev or Resurviv.
