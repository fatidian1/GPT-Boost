# GPT Boost (Chrome/Edge/Firefox/Opera extension)

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

## Install (Opera)
Download `crx` file from the releases tab and install it in Opera extension settings.

## Install (Developer Mode)
1. Pull the repository.
2. Install dependencies: `npm install`.
3. Build the extension: `npm run build`.
4. Open **chrome://extensions**, **edge://extensions**, **opera://extensions** or **about:debugging**.
5. In chrome enable **Developer mode** (top right) (if not already enabled).
6. Click **Load unpacked** and select the `dist` directory.

## Configure
Open the extension’s **Options** page from your browser’s extensions list.
- **Max visible messages**: how many messages are kept on-screen (default 10).
- **Batch size**: how many older messages are revealed per click/scroll (default 10).
- **Auto-reveal on scroll**: automatically reveal older messages when you reach the top.
- **Hide the oldest message when a new appears**: keep the current number of visible messages constant (default on).

## Development

This extension was created with [Extension CLI](https://oss.mobilefirst.me/extension-cli/)

### Available Commands

| Commands                | Description                                                                                             |
|-------------------------|---------------------------------------------------------------------------------------------------------|
| `npm run start`         | build extension, watch file changes                                                                     |
| `npm run build`         | generate release version                                                                                |
| `npm run build:firefox` | generate firefox release version                                                                        |
| `npm run pack:opera`    | pack opera crx release version, requires `dist` directory to be available, so run `npm run build` first |
| `npm run docs`          | generate source code docs                                                                               |
| `npm run clean`         | remove temporary files                                                                                  |
| `npm run test`          | run unit tests                                                                                          |
| `npm run sync`          | update config files                                                                                     |
| `npm run format`        | prettier reformat                                                                                       |
| `npm run format:check`  | verify code format with prettier                                                                        |

For CLI instructions see [User Guide &rarr;](https://oss.mobilefirst.me/extension-cli/)
## Translations
Translation files are located in `assets/locales/`.

For now supported languages are:

| Code    | Language         | Status                   |
|---------|------------------|--------------------------|
| `en`    | English          | Full translation         |
| `pl`    | Polish           | Full translation         |
| `ar`    | Arabic           | AI generated translation |
| `cs`    | Czech            | AI generated translation |
| `de`    | German           | AI generated translation |
| `el`    | Greek            | AI generated translation |
| `es`    | Spanish          | AI generated translation |
| `fi`    | Finnish          | AI generated translation |
| `hi`    | Hindi            | AI generated translation |
| `it`    | Italian          | AI generated translation |
| `ja`    | Japanese         | AI generated translation |
| `nl`    | Dutch            | AI generated translation |
| `no`    | Norwegian        | AI generated translation |
| `ru`    | Russian          | AI generated translation |
| `sr`    | Serbian          | AI generated translation |
| `tr`    | Turkish          | AI generated translation |
| `uk`    | Ukrainian        | AI generated translation |
| `zh_CN` | Chinese (China)  | AI generated translation |
| `zh_TW` | Chinese (Taiwan) | AI generated translation |

If you want to help with translations, please create a pull request with the new/changed translation file.

## Notes
- GPT Boost hides older DOM nodes (`display: none`) to reduce layout/paint cost. It does **not** modify or exfiltrate content.
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
