# Changelog

## 3.6.0 - Runtime and social polish

- Unlock Web Audio only after a real user gesture, preventing repeated autoplay warnings.
- Retry the server connection automatically and refresh the room after Nexus ID detection.
- Restore a lightweight, live Kill Leader banner that follows every leader change in a match.
- Prevent optimization progress from getting stuck when an individual cleanup task fails.
- Fix the scroll-to-latest control and enforce a two-second send cooldown in every channel.
- Show outgoing friend-request status and allow requests to be cancelled.
- Display current profile names in historical messages after a rename.
- Expand profile previews and allow biographies of up to 250 words.

## 3.5.0 - Reliable inbox and performance release

- Added persistent unread counts for direct messages received while offline.
- Sorted friend conversations by the most recent message.
- Marked direct messages as read consistently in memory and Turso storage.
- Removed the animated kill-leader GIF, DOM polling, and mutation observer from Nexus Chat.
- Batched message rendering and cached mention parsing to reduce main-thread work.
- Reduced default effects, smooth scrolling, reminder timers, and audio churn.
- Rebuilt the browser package as a standards-compatible ZIP without `./` archive paths.
- Preserved client-side player rotation in every optimized game preset.

## 3.4.0 — Public release

- Added the full command set to Match and Global.
- Kept command results inside their originating channel.
- Added Global polls, pins, online lists, and statistics.
- Added mention suggestions to Match, Global, and friend conversations.
- Fixed mentions for display names containing spaces.
- Limited friend-conversation suggestions to the friend currently open.
- Added futuristic sound cues with volume and Do Not Disturb controls.
- Integrated live performance presets while preserving client-side player rotation.
- Reduced rendering, observer, audio, and history overhead.
- Fixed private-message targeting, avatar refresh, reactions, typing, blocking, and Dim behavior.
- Added privacy, security, release, and deployment documentation.

## 3.3.0

- Added persistent Nexus identities, profiles, friends, Global chat, and direct messages.
- Added Turso-backed social persistence and synchronized extension packaging.
