# Facebook → Google Calendar Event Exporter — Browser Extension

## 1. Project Setup
- [x] Create `package.json` with project metadata, TypeScript, and build tooling
- [x] Initialize git repository
- [x] Add `.gitignore` (node_modules, dist, .env, etc.)
- [x] Install dev dependencies: TypeScript, vite, `@types/chrome`
- [x] Set up TypeScript config (`tsconfig.json`) targeting ES2020+ with strict mode
- [x] Set up bundler config (vite) for building the extension
  - Entry points: content script, background service worker, (optional) popup
  - Output to `dist/` folder

## 2. Extension Manifest
- [x] Create `manifest.json` (Manifest V3)
  - `name`: "Facebook to Google Calendar Exporter"
  - `version`: "1.0.0"
  - `permissions`: `["activeTab"]`
  - `host_permissions`: `["https://www.facebook.com/*"]`
  - `content_scripts`: inject into `facebook.com` pages
  - `background`: service worker for intercepting downloads / advanced logic
  - `icons`: provide 16×16, 48×48, 128×128 icons

## 3. ICS File Parser (`src/ics-parser.ts`)
- [x] Implement ICS line unfolding (RFC 5545 §3.1): join continuation lines that begin with a space/tab
- [x] Parse the `VEVENT` block and extract fields:
  - `SUMMARY` → event title
  - `DTSTART` / `DTEND` → start and end datetimes (keep `YYYYMMDDTHHMMSSz` format)
  - `DESCRIPTION` → event description (unescape `\\n` → newline, `\\,` → comma, etc.)
  - `LOCATION` → event location (also needs unfolding)
  - `URL` → original Facebook event URL (append to description)
- [x] Write unit tests for the parser using a sample `.ics` file (the one in the repo)
  - Test line unfolding with multi-byte UTF-8 characters
  - Test description unescaping (`\\n`, `\\,`, `\\;`, `\\\\`)
  - Test events with missing optional fields (no LOCATION, no DESCRIPTION)

## 4. Google Calendar URL Builder (`src/gcal-url-builder.ts`)
- [x] Build a function that takes parsed event data and returns a Google Calendar prefilled URL:
  ```
  https://calendar.google.com/calendar/render?action=TEMPLATE
    &text=<SUMMARY>
    &dates=<DTSTART>/<DTEND>
    &details=<DESCRIPTION>
    &location=<LOCATION>
  ```
- [x] URL-encode all parameter values properly (use `encodeURIComponent`)
- [x] Handle optional fields gracefully (omit `&location=` if no location, etc.)
- [x] Write unit tests:
  - Verify correct URL structure with all fields populated
  - Verify correct URL with missing optional fields
  - Verify proper encoding of special characters (Polish diacritics, commas, newlines)

## 5. Content Script — DOM Injection (`src/content-script.ts`)
- [ ] Detect when the Facebook "Eksportuj wydarzenie" ("Export event") modal opens
  - Use a `MutationObserver` on the document body to detect the modal dialog appearing
  - Identify the modal by its structure: look for the radio button group containing "Dodaj do kalendarza" and "Wyślij na adres e-mail"
- [ ] Inject a third radio option: "Eksportuj do Google Calendar" ("Export to Google Calendar")
  - Clone the styling of existing radio buttons so it blends in with Facebook's UI
  - Insert the new option after "Dodaj do kalendarza" or at the end of the radio group
- [ ] Track which radio option is selected (original behavior vs. new Google Calendar option)
- [ ] When "Eksportuj" ("Export") button is clicked **and** the Google Calendar option is selected:
  1. Intercept the click event (prevent default if needed)
  2. Trigger the existing "Dodaj do kalendarza" download to get the .ics file
  3. Parse the downloaded .ics file content
  4. Build the Google Calendar URL from the parsed data
  5. Open the Google Calendar URL in a new tab (`window.open(url, '_blank')`)
- [ ] When a non-Google-Calendar option is selected, let the default Facebook behavior proceed unchanged

## 6. Background Service Worker (`src/background.ts`) — Optional
- [ ] If needed: listen for download events to intercept the .ics file download
  - Use `chrome.downloads.onDeterminingFilename` or `chrome.downloads.onCreated`
  - Read the file contents, parse, build URL, and open tab
  - Cancel or clean up the .ics download afterward
- [ ] Alternatively: use `fetch()` in the content script to directly request the .ics download URL (if it can be extracted from the page DOM before clicking Export)
  - This avoids needing download interception entirely

## 7. Styling
- [ ] Style the injected radio option to match Facebook's dark-mode and light-mode themes
- [ ] Add a small Google Calendar icon next to the "Eksportuj do Google Calendar" label
  - Bundle the icon as a base64 data URI or as an extension asset
- [ ] Ensure the option looks native and doesn't cause layout shifts in the modal

## 8. Build & Package
- [ ] Add npm scripts:
  - `pnpm run build` — production build (minified, output to `dist/`)
  - `pnpm run dev` — watch mode for development
  - `pnpm run test` — run unit tests
  - `pnpm run lint` — run Biome
- [ ] Copy `manifest.json` and icons to `dist/` during build
- [ ] Test loading the unpacked extension in Chrome (`chrome://extensions` → Developer mode → Load unpacked)
- [ ] Test loading in Firefox if desired (may need minor manifest changes)

## 9. Testing & QA
- [ ] Manual testing checklist:
  - [ ] Navigate to a Facebook event page
  - [ ] Click "Dodaj do kalendarza" → "Eksportuj" — verify extension adds the 3rd option
  - [ ] Select "Eksportuj do Google Calendar" → click "Eksportuj" — verify Google Calendar opens in new tab with correct event data
  - [ ] Verify original "Dodaj do kalendarza" option still works normally when selected
  - [ ] Verify "Wyślij na adres e-mail" option still works normally when selected
  - [ ] Test with events that have:
    - Polish characters in title/description/location
    - Very long descriptions
    - No location
    - All-day events (DATE vs DATETIME format)
- [ ] Unit tests pass for ICS parser and URL builder

## 10. Documentation
- [ ] Write `README.md`:
  - What the extension does (with screenshots)
  - Installation instructions (load unpacked)
  - Development setup (`pnpm install`, `pnpm run dev`)
  - How the Google Calendar URL template works
  - Known limitations
- [ ] Add a `LICENSE` file (MIT or your preferred license)
