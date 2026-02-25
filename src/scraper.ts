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
  currentLangName?: string;
  results: Record<string, Record<string, string>>;
}

let isScraperStopped = false;

export function initScraper() {
  if (typeof window === 'undefined') return;

  // Listen for keyboard shortcut (Alt + S for start, Alt + A for stop)
  window.addEventListener('keydown', (e) => {
    if (e.altKey && e.key.toLowerCase() === 's') {
      startScraper();
    }
    if (e.altKey && e.key.toLowerCase() === 'a') {
      stopScraper();
    }
  });

  const stateJson = localStorage.getItem('fb_lang_scraper');
  if (stateJson) {
    try {
      const state: ScraperState = JSON.parse(stateJson);
      if (state.active) {
        console.log('[Scraper] Resuming scraper in phase:', state.phase);
        isScraperStopped = false;
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

function stopScraper() {
  console.log('[Scraper] Stopping...');
  isScraperStopped = true;
  const stateJson = localStorage.getItem('fb_lang_scraper');
  if (stateJson) {
    try {
      const state: ScraperState = JSON.parse(stateJson);
      state.active = false;
      saveState(state);
    } catch (e) {
      console.error('[Scraper] Failed to parse state for stopping', e);
    }
  }
}

function startScraper() {
  console.log('[Scraper] Starting...');
  isScraperStopped = false;
  const state: ScraperState = {
    active: true,
    phase: 'INIT',
    langIndex: 0,
    maxLangs: 999,
    results: {},
  };
  saveState(state);
  runScraperStep(state);
}

function isElementVisible(el: Element): boolean {
  if (el.closest('[aria-hidden="true"]')) return false;
  
  // Facebook Comet UI uses inline styles to slide menus horizontally.
  // The active menu has `transform: translateX(0%)` or no transform.
  // The hidden ones have `transform: translateX(-100%)` or `translateX(100%)`.
  if (el.closest('[style*="translateX(-100%)"], [style*="translateX(100%)"]')) {
    return false;
  }

  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  
  // Reject if it's completely off-screen
  if (rect.right <= 0 || rect.left >= window.innerWidth) return false;
  
  return true;
}

function findByBgPosition(x: string, y: string): HTMLElement | null {
  const icons = document.querySelectorAll('i[data-visualcompletion="css-img"]');
  for (const i of icons) {
    const bg = (i as HTMLElement).style.backgroundPosition;
    if (bg?.includes(x) && bg?.includes(y)) {
      const container = i.closest('[role="button"], [role="menuitem"], [role="link"]') as HTMLElement;
      // Skip if this part of the DOM is hidden
      if (container && isElementVisible(container)) {
        return container;
      }
    }
  }
  return null;
}

function findBySvgPath(pathStart: string): HTMLElement | null {
  const paths = document.querySelectorAll('path');
  for (const p of paths) {
    if (p.getAttribute('d')?.startsWith(pathStart)) {
      const container = p.closest('[role="menuitem"], [role="button"]') as HTMLElement;
      // Skip if hidden
      if (container && isElementVisible(container)) {
        return container;
      }
    }
  }
  return null;
}

function getAccountButton() {
  // Use the exact obfuscated class Facebook uses for the profile picture SVG in the top bar
  const exactSvg = document.querySelector('svg.x3ajldb');
  if (exactSvg) {
    return exactSvg.closest('[role="button"], [role="link"]') as HTMLElement;
  }

  const banner = document.querySelector('div[role="banner"]');
  if (!banner) return null;

  // Account button is typically an SVG containing an <image> element for the profile picture
  // or a <mask> element for the circular crop.
  const svgWithMask = banner.querySelector('svg mask');
  if (svgWithMask) {
    return svgWithMask.closest('[role="button"]') as HTMLElement;
  }

  const svgWithImage = banner.querySelector('svg image');
  if (svgWithImage) {
    return svgWithImage.closest('[role="button"]') as HTMLElement;
  }

  // Fallback: The last button in the banner is usually the account button
  const buttons = Array.from(banner.querySelectorAll('div[role="button"]'));
  if (buttons.length > 0) {
    return buttons[buttons.length - 1] as HTMLElement;
  }

  return null;
}

function getLanguageListItems(): HTMLElement[] {
  // Try finding search inputs first
  const inputs = Array.from(document.querySelectorAll(
    'input[placeholder*="anguag"], input[aria-label*="anguag"]'
  )) as HTMLInputElement[];

  const searchInput = inputs.find(el => isElementVisible(el));

  let listContainer: HTMLElement | null = null;
  if (searchInput) {
    listContainer = searchInput.closest('div[role="dialog"], div[role="menu"]') as HTMLElement;
  }

  // Active menu fallback for Comet UI without search input inside the menu
  if (!listContainer) {
    const containers = Array.from(document.querySelectorAll('div[role="menu"], div[role="dialog"]'))
      .filter(m => isElementVisible(m));
    
    // Usually the last mounted visible container in the DOM is the active nested panel
    if (containers.length > 0) {
      listContainer = containers[containers.length - 1] as HTMLElement;
    }
  }

  // If no suitable container is visible, return empty list (do NOT fallback to body)
  if (!listContainer) return [];

  const items = Array.from(
    listContainer.querySelectorAll('div[role="listitem"] div[role="button"], div[role="menuitem"]')
  );
  
  return items.filter((el) => {
    // Basic hygiene: visible, no search input inside it
    if (!isElementVisible(el) || el.querySelector('input')) return false;
    
    // Filter out common "Back" buttons in language selector
    const text = el.textContent?.trim().toLowerCase() || "";
    if (["wróć", "back"].includes(text) || text.includes("back to") || text.includes("wróć do")) return false;

    return true;
  }) as HTMLElement[];
}

function extractModalStrings(): Record<string, string> {
  const dialog = document.querySelector('div[role="dialog"]');
  if (!dialog) return {};

  const res: Record<string, string> = {};
  
  // 1. Header -> EXPORT_EVENT_TITLE
  const header = dialog.querySelector('h2');
  if (header?.textContent) {
    res.EXPORT_EVENT_TITLE = header.textContent.trim();
  }

  // 2. Labels -> ADD_TO_CALENDAR, SEND_TO_EMAIL
  // These are labels for radio buttons.
  const labels = Array.from(dialog.querySelectorAll('label span'));
  if (labels.length >= 2) {
    res.ADD_TO_CALENDAR = labels[0].textContent?.trim() || '';
    res.SEND_TO_EMAIL = labels[labels.length - 1].textContent?.trim() || '';
  }

  // 3. Export button text -> EXPORT_BUTTON
  // Usually in the footer, inside a link (since it downloads an ICS).
  const exportBtnLink = dialog.querySelector('a[role="link"] span');
  if (exportBtnLink?.textContent) {
    res.EXPORT_BUTTON = exportBtnLink.textContent.trim();
  }

  // 4. Close aria-label -> CLOSE_BUTTON_ARIA
  // It's a button at the top usually.
  const closeBtn = Array.from(dialog.querySelectorAll('div[role="button"][aria-label]'))
    .find(el => {
      const aria = el.getAttribute('aria-label');
      return aria && aria.length < 20 && !aria.includes(res.EXPORT_BUTTON || "___");
    });
    
  if (closeBtn) {
    const aria = closeBtn.getAttribute('aria-label');
    if (aria) res.CLOSE_BUTTON_ARIA = aria;
  }

  return res;
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
  if (isScraperStopped) {
    console.log('[Scraper] Stopped via user request.');
    return;
  }
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
        moreBtn.dispatchEvent(new MouseEvent('click', {
          view: window,
          bubbles: true,
          cancelable: true
        }));

        state.phase = 'MODAL_OPEN';
        saveState(state);
        setTimeout(() => runScraperStep(state), 2000);
        break;
      }
      case 'MODAL_OPEN': {
        const addToCalBtn = findByBgPosition('0px', '-293px');
        if (addToCalBtn) {
          addToCalBtn.dispatchEvent(new MouseEvent('click', {
            view: window,
            bubbles: true,
            cancelable: true
          }));
        } else {
          console.warn('[Scraper] Add to calendar button not found yet');
          setTimeout(() => runScraperStep(state), 1500);
          return;
        }

        setTimeout(() => {
          const strings = extractModalStrings();
          console.log('[Scraper] Extracted:', strings);

          const closeBtn = findByBgPosition('0px', '-548px');
          if (closeBtn) {
            closeBtn.dispatchEvent(new MouseEvent('click', {
              view: window,
              bubbles: true,
              cancelable: true
            }));
          }

          // Save results to the language name we decided on in the previous phase
          const langName = state.currentLangName || "Initial";
          state.results[langName] = strings;
          console.log(`[Scraper] Saved results for: ${langName}`);

          state.phase = 'ACCOUNT_MENU';
          state.langIndex++; // Move to next lang for next iteration
          saveState(state);
          setTimeout(() => runScraperStep(state), 2000);
        }, 2000);
        break;
      }
      case 'ACCOUNT_MENU': {
        const accountBtn = getAccountButton();
        if (!accountBtn) {
          console.warn('[Scraper] Account button not found');
          setTimeout(() => runScraperStep(state), 2000);
          return;
        }
        
        // Use dispatchEvent for better React handling
        accountBtn.dispatchEvent(new MouseEvent('click', {
          view: window,
          bubbles: true,
          cancelable: true
        }));
        
        state.phase = 'SETTINGS_MENU';
        saveState(state);
        setTimeout(() => runScraperStep(state), 2000);
        break;
      }
      case 'SETTINGS_MENU': {
        // -42px -348px is the gear icon for "Settings & privacy"
        const settingsBtn = findByBgPosition('-42px', '-348px');
        if (!settingsBtn) {
          console.warn('[Scraper] Settings button not found');
          setTimeout(() => runScraperStep(state), 2000);
          return;
        }
        
        // Ensure we are clicking the right role
        const clickable = settingsBtn.closest('[role="menuitem"], [role="button"]') as HTMLElement;
        const target = clickable || settingsBtn;
        
        target.dispatchEvent(new MouseEvent('click', {
          view: window,
          bubbles: true,
          cancelable: true
        }));
        
        state.phase = 'LANGUAGE_MENU';
        saveState(state);
        setTimeout(() => runScraperStep(state), 2000);
        break;
      }
      case 'LANGUAGE_MENU': {
        // Path M8.116 3.116
        const langBtn = findBySvgPath('M8.116 3.116');
        if (!langBtn) {
          console.warn('[Scraper] Language button not found');
          setTimeout(() => runScraperStep(state), 2000);
          return;
        }
        
        langBtn.dispatchEvent(new MouseEvent('click', {
          view: window,
          bubbles: true,
          cancelable: true
        }));
        
        state.phase = 'FB_LANGUAGE_MENU';
        saveState(state);
        setTimeout(() => runScraperStep(state), 2000);
        break;
      }
      case 'FB_LANGUAGE_MENU': {
        // 0px -235px (Globe) or 0px -108px (Right arrow)
        const fbLangBtn = findByBgPosition('0px', '-235px') || findByBgPosition('0px', '-108px');
        if (!fbLangBtn) {
          console.warn('[Scraper] Facebook Language button not found');
          setTimeout(() => runScraperStep(state), 2000);
          return;
        }
        
        const clickable = fbLangBtn.closest('[role="menuitem"], [role="button"]') as HTMLElement;
        const target = clickable || fbLangBtn;
        
        target.dispatchEvent(new MouseEvent('click', {
          view: window,
          bubbles: true,
          cancelable: true
        }));

        // Wait for language list to open
        setTimeout(() => {
          const items = getLanguageListItems();
          if (items.length === 0) {
            console.warn('[Scraper] No languages found');
            setTimeout(() => runScraperStep(state), 2000);
            return;
          }
          state.maxLangs = items.length;

          if (state.langIndex >= state.maxLangs) {
            console.log('[Scraper] Finished all languages!', state.results);
            state.active = false;
            saveState(state);
            downloadResults(state.results);
            return;
          }

          const nextLangName = (items[state.langIndex].textContent || `Lang_${state.langIndex}`).trim();
          console.log(
            `[Scraper] Clicking language ${state.langIndex}/${state.maxLangs}:`,
            nextLangName,
          );

          state.currentLangName = nextLangName;
          state.phase = 'EVENT_PAGE';
          saveState(state);
          
          // Click! This will reload the page
          items[state.langIndex].dispatchEvent(new MouseEvent('click', {
            view: window,
            bubbles: true,
            cancelable: true
          }));
        }, 2000);
        break;
      }
    }
  } catch (e) {
    console.error('[Scraper] Error in phase', state.phase, e);
  }
}
