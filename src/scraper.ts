export interface ScraperState {
  active: boolean;
  phase:
    | 'INIT'
    | 'EVENT_PAGE'
    | 'MODAL_OPEN'
    | 'ACCOUNT_MENU'
    | 'SETTINGS_MENU'
    | 'LANGUAGE_MENU'
    | 'FB_LANGUAGE_MENU';
  langIndex: number;
  maxLangs: number;
  results: {
    langName: string;
    strings: string[];
  }[];
}

export function initScraper() {
  if (typeof window === 'undefined') return;

  // Listen for keyboard shortcut (Alt + S)
  window.addEventListener('keydown', (e) => {
    if (e.altKey && e.key.toLowerCase() === 's') {
      startScraper();
    }
  });

  const stateJson = localStorage.getItem('fb_lang_scraper');
  if (stateJson) {
    try {
      const state: ScraperState = JSON.parse(stateJson);
      if (state.active) {
        console.log('[Scraper] Resuming scraper in phase:', state.phase);
        // Add a slight delay to allow Facebook React to mount DOM
        setTimeout(() => runScraperStep(state), 3000); // 3 seconds to let Facebook load
      }
    } catch (e) {
      console.error('[Scraper] Failed to parse state', e);
    }
  }
}

function saveState(state: ScraperState) {
  localStorage.setItem('fb_lang_scraper', JSON.stringify(state));
}

function startScraper() {
  console.log('[Scraper] Starting...');
  const state: ScraperState = {
    active: true,
    phase: 'INIT',
    langIndex: 0,
    maxLangs: 999,
    results: [],
  };
  saveState(state);
  runScraperStep(state);
}

function findByBgPosition(x: string, y: string): HTMLElement | null {
  const icons = document.querySelectorAll('i[data-visualcompletion="css-img"]');
  for (const i of icons) {
    const bg = (i as HTMLElement).style.backgroundPosition;
    if (bg?.includes(x) && bg?.includes(y)) {
      return i.closest('[role="button"], [role="menuitem"], [role="link"]') as HTMLElement;
    }
  }
  return null;
}

function findBySvgPath(pathStart: string): HTMLElement | null {
  const paths = document.querySelectorAll('path');
  for (const p of paths) {
    if (p.getAttribute('d')?.startsWith(pathStart)) {
      return p.closest('[role="menuitem"], [role="button"]') as HTMLElement;
    }
  }
  return null;
}

function getAccountButton() {
  const banner = document.querySelector('div[role="banner"]');
  if (!banner) return null;
  // Account button is typically the last element with an svg having mask in banner
  const svg = document.evaluate(
    './/svg[mask]',
    banner,
    null,
    XPathResult.FIRST_ORDERED_NODE_TYPE,
    null,
  ).singleNodeValue as HTMLElement;
  if (svg) return svg.closest('[role="button"]') as HTMLElement;
  return null;
}

function getLanguageListItems(): HTMLElement[] {
  const searchInput = document.querySelector(
    'input[placeholder="Search languages"], input[aria-label*="anguage"], input[role="textbox"]',
  );
  if (!searchInput) return [];
  const listContainer =
    searchInput.closest('div[role="dialog"], div[role="menu"], div[role="main"]') || document.body;
  const items = Array.from(
    listContainer.querySelectorAll('div[role="listitem"] div[role="button"], div[role="menuitem"]'),
  );
  return items.filter((el) => !el.querySelector('input[role="textbox"]')) as HTMLElement[];
}

function extractModalStrings(): string[] {
  const dialog = document.querySelector('div[role="dialog"]');
  if (!dialog) return [];

  const texts = new Set<string>();
  const walker = document.createTreeWalker(dialog, NodeFilter.SHOW_TEXT, null);
  let node = walker.nextNode();
  while (node) {
    const val = node.nodeValue?.trim();
    if (val && val.length > 1) {
      // Skip empty / single chars like 'X'
      texts.add(val);
    }
    node = walker.nextNode();
  }
  return Array.from(texts);
}

function downloadResults(results: ScraperState['results']) {
  const dataStr =
    'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(results, null, 2));
  const dlAnchorElem = document.createElement('a');
  dlAnchorElem.setAttribute('href', dataStr);
  dlAnchorElem.setAttribute('download', 'facebook_translations.json');
  dlAnchorElem.click();
}

async function runScraperStep(state: ScraperState) {
  try {
    console.log('[Scraper] Running phase:', state.phase);
    switch (state.phase) {
      case 'INIT':
      case 'EVENT_PAGE': {
        const moreBtn = findByBgPosition('0px', '-797px') || findByBgPosition('0px', '-882px');
        if (!moreBtn) {
          console.error('[Scraper] Could not find ... button');
          return;
        }
        moreBtn.click();

        state.phase = 'MODAL_OPEN';
        saveState(state);
        setTimeout(() => runScraperStep(state), 1000);
        break;
      }
      case 'MODAL_OPEN': {
        const addToCalBtn = findByBgPosition('0px', '-293px');
        if (addToCalBtn) {
          addToCalBtn.click();
        } else {
          console.warn('[Scraper] Add to calendar button not found yet');
          setTimeout(() => runScraperStep(state), 1000);
          return;
        }

        setTimeout(() => {
          const strings = extractModalStrings();
          console.log('[Scraper] Extracted:', strings);

          const closeBtn = findByBgPosition('0px', '-548px');
          if (closeBtn) closeBtn.click();

          state.results.push({
            langName: `Lang_${state.langIndex}`,
            strings,
          });

          state.phase = 'ACCOUNT_MENU';
          saveState(state);
          setTimeout(() => runScraperStep(state), 1500);
        }, 1500);
        break;
      }
      case 'ACCOUNT_MENU': {
        const accountBtn = getAccountButton();
        if (!accountBtn) {
          console.warn('[Scraper] Account button not found');
          // Retry logic could go here
          return;
        }
        accountBtn.click();
        state.phase = 'SETTINGS_MENU';
        saveState(state);
        setTimeout(() => runScraperStep(state), 1000);
        break;
      }
      case 'SETTINGS_MENU': {
        // -42px -348px
        const settingsBtn = findByBgPosition('-42px', '-348px');
        if (!settingsBtn) {
          console.warn('[Scraper] Settings button not found');
          setTimeout(() => runScraperStep(state), 1000);
          return;
        }
        settingsBtn.click();
        state.phase = 'LANGUAGE_MENU';
        saveState(state);
        setTimeout(() => runScraperStep(state), 1000);
        break;
      }
      case 'LANGUAGE_MENU': {
        // Path M8.116 3.116
        const langBtn = findBySvgPath('M8.116 3.116');
        if (!langBtn) {
          console.warn('[Scraper] Language button not found');
          setTimeout(() => runScraperStep(state), 1000);
          return;
        }
        langBtn.click();
        state.phase = 'FB_LANGUAGE_MENU';
        saveState(state);
        setTimeout(() => runScraperStep(state), 1000);
        break;
      }
      case 'FB_LANGUAGE_MENU': {
        // 0px -235px
        const fbLangBtn = findByBgPosition('0px', '-235px');
        if (!fbLangBtn) {
          console.warn('[Scraper] Facebook Language button not found');
          setTimeout(() => runScraperStep(state), 1000);
          return;
        }
        fbLangBtn.click();

        // Wait for language list to open
        setTimeout(() => {
          const items = getLanguageListItems();
          if (items.length === 0) {
            console.warn('[Scraper] No languages found');
            return;
          }
          state.maxLangs = items.length;
          state.langIndex++;

          if (state.langIndex >= state.maxLangs) {
            console.log('[Scraper] Finished all languages!', state.results);
            state.active = false;
            saveState(state);
            downloadResults(state.results);
            return;
          }

          const nextLangName = items[state.langIndex].textContent || `Lang_${state.langIndex}`;
          console.log(
            `[Scraper] Clicking language ${state.langIndex}/${state.maxLangs}:`,
            nextLangName,
          );

          state.results[state.results.length - 1].langName = nextLangName;

          // Phase reset for next page reload
          state.phase = 'EVENT_PAGE';
          saveState(state);
          // Click! This will reload the page
          items[state.langIndex].click();
        }, 1500);
        break;
      }
    }
  } catch (e) {
    console.error('[Scraper] Error in phase', state.phase, e);
  }
}
