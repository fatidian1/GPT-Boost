# GPT Boost (Chrome/Edge/Firefox extension)

GPT Boost reduces lag on long ChatGPT conversations by **lazy-loading**: it shows only the latest messages and hides older ones until you scroll to the top or click **Show older**. Thresholds are configurable.

## Features
- Auto-collapses older messages when a chat exceeds *Max visible messages* (default **10**).
- Click **Show older** in the sticky pill to reveal the next batch (default **10**).
- Optional auto-reveal when you scroll to the top.
- Optional trimming of the oldest visible message when new ones arrive.
- Simple, non-intrusive UI; per-site content script (no background service worker).
- Works on conversation URLs like `https://chatgpt.com/share/*` and `https://chatgpt.com/c/*`.

## Install (Chrome Web Store)
You can download the extension from: https://chromewebstore.google.com/detail/elieiaigindaijkbgndpolchbngejadc?utm_source=github

## Install (Microsoft Edge)
You can download the extension from: https://microsoftedge.microsoft.com/addons/detail/gpt-boost/ncklidjanbceeolimmgnjebcjjhnmjla?utm_source=github

## Install (Firefox)
You can download the extension from: https://addons.mozilla.org/en-US/firefox/addon/gpt-boost/?utm_source=github

## Install (Developer Mode)
1. Download the ZIP from the releases tab and extract it.
2. Open **chrome://extensions**, **edge://extensions** or **about:debugging**.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select the extracted `gpt-boost` folder.
5. Visit ChatGPT and open a long conversation.

## Configure
Open the extension’s **Options** page from your browser’s extensions list.
- **Max visible messages**: how many messages are kept on-screen (default 10).
- **Batch size**: how many older messages are revealed per click/scroll (default 10).
- **Auto-reveal on scroll**: automatically reveal older messages when you reach the top.
- **Hide the oldest message when a new appears**: keep the current number of visible messages constant (default on).

## Development

This extension was created with [Extension CLI](https://oss.mobilefirst.me/extension-cli/)

### Available Commands

| Commands | Description |
| --- | --- |
| `npm run start` | build extension, watch file changes |
| `npm run build` | generate release version |
| `npm run docs` | generate source code docs |
| `npm run clean` | remove temporary files |
| `npm run test` | run unit tests |
| `npm run sync` | update config files |

For CLI instructions see [User Guide &rarr;](https://oss.mobilefirst.me/extension-cli/)

## Notes
- GPT Boost hides older DOM nodes (display: none) to reduce layout/paint cost. It does **not** modify or exfiltrate content.
- The ChatGPT DOM evolves. The extension attempts to detect messages via several robust selectors and re-applies windowing as the page updates.
- You can always collapse back to the threshold using the **Collapse** button in the pill.

## Privacy
- No external requests. Settings are stored via `chrome.storage.sync`.

## Contributing
Pull requests are welcome, please open an issue first to discuss what you would like to change.

## Support me
If you like this extension, please consider buying me a coffee: https://buymeacoffee.com/fatidian1

## License
MIT
