# Security Policy

## Supported version

Security fixes are provided for the latest public Nexus Chat release.

## Reporting a vulnerability

Do not publish exploitable details, recovery keys, database credentials, or user messages in a public issue. Contact the maintainers privately through the official Nexus Chat Discord linked at [wnexuschat.netlify.app](https://wnexuschat.netlify.app).

Include the affected version, reproduction steps, expected impact, and any safe proof of concept. Allow reasonable time for investigation before public disclosure.

## Secrets

- Never commit `TURSO_AUTH_TOKEN` or a Nexus recovery key.
- Rotate a credential immediately if it is exposed.
- Use Render environment variables for production secrets.
- Treat browser recovery keys as passwords.
