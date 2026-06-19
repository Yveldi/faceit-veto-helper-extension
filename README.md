# Faceit Veto Helper (Extension)

<p align="center">
Standalone extension that helps you win matches through smarter map picks.
</p>
<p align="center">
<img width="249" height="200" alt="image" src="https://github.com/user-attachments/assets/23e3bc1d-4677-493a-b593-00ebf9906086" />
</p>

<p align="center"><em>Unofficial. Not affiliated with, endorsed by, or sponsored by FACEIT.</em></p>

## Features

▣ Lobby Veto Helper: per-map win probabilities for your team and full player stats in matchrooms.

▣ Auto-accept the match-ready popup after a countdown you can configure (with a cancel button).

▣ Control panel (toolbar icon) to toggle and manage features.

▣ Auto-veto servers

▣ Auto-veto maps, highly configurable.

## Privacy

All FACEIT data is read using your existing session and stays in your browser. Nothing is collected or transmitted. See [PRIVACY.md](PRIVACY.md).

## Build from source

`npm install`, then `npm run build` (output in `dist/`). Load `dist/` as an unpacked extension (Chrome: `chrome://extensions`; Firefox: `about:debugging`), then hard-refresh faceit.com.
