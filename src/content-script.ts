// Lookups for English and Polish UI
const TEXT_MATCHERS = {
  EXPORT_EVENT_TITLE: ['Eksportuj wydarzenie', 'Export Event'],
  ADD_TO_CALENDAR: ['Dodaj do kalendarza', 'Add to calendar'],
  SEND_TO_EMAIL: ['Wyślij na adres e-mail', 'Send to email'],
  EXPORT_BUTTON: ['Eksportuj', 'Export'],
  CLOSE_BUTTON_ARIA: ['Zamknij', 'Close'],
};

const GCAL_OPTION_ID = 'gcal-export-option';

function getGcalText(lang: 'pl' | 'en'): string {
  return lang === 'pl' ? 'Eksportuj do kalendarza Google' : 'Export to Google Calendar';
}

let isOptionInjected = false;
let isGcalSelected = false;
// Stores the checked/unchecked className for the radio dot, learned dynamically
let dotCheckedClassName = '';
let dotUncheckedClassName = '';
// Stores the inner dot HTML (the filled circle that appears when checked)
let innerDotHtml = '';
// Stores the ICS download URL captured at injection time
let savedIcsUrl = '';
// Stores computed styles of the unchecked dot for the cover overlay
let uncheckedDotBorderColor = '';
let uncheckedDotSize = 0;
const DOT_COVER_ID = 'gcal-native-dot-cover';

// Inject CSS for our option's hover and cursor.
function injectHoverStyles() {
  if (document.getElementById('gcal-ext-styles')) return;
  const style = document.createElement('style');
  style.id = 'gcal-ext-styles';
  style.textContent = `
    #${GCAL_OPTION_ID} [role="button"] {
      cursor: pointer;
    }
    #${GCAL_OPTION_ID} [role="button"]:hover {
      background-color: rgba(255, 255, 255, 0.1);
    }
  `;
  document.head.appendChild(style);
}

// Observe body for modal injections
const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    if (mutation.addedNodes.length) {
      checkForExportModal();
    }
  }
});
observer.observe(document.body, { childList: true, subtree: true });

function checkForExportModal() {
  if (isOptionInjected) return;

  const dialogs = document.querySelectorAll('div[role="dialog"]');
  for (const dialog of dialogs) {
    const isExportModal = Array.from(dialog.querySelectorAll('span')).some(
      (span) =>
        span.textContent &&
        TEXT_MATCHERS.EXPORT_EVENT_TITLE.includes(span.textContent.trim()),
    );
    if (isExportModal) {
      injectGoogleCalendarOption(dialog as HTMLElement);
      break;
    }
  }
}

function injectGoogleCalendarOption(dialog: HTMLElement) {
  // Detect language
  const allSpans = Array.from(dialog.querySelectorAll('span'));
  const calendarSpan = allSpans.find(
    (s) => s.textContent && TEXT_MATCHERS.ADD_TO_CALENDAR.includes(s.textContent.trim()),
  );
  const emailSpan = allSpans.find(
    (s) => s.textContent && TEXT_MATCHERS.SEND_TO_EMAIL.includes(s.textContent.trim()),
  );
  if (!calendarSpan || !emailSpan) return;

  const lang: 'pl' | 'en' = calendarSpan.textContent?.trim() === 'Dodaj do kalendarza' ? 'pl' : 'en';

  // Find the section wrappers.
  // Structure: dialog > sectionDiv > innerDiv > div[role="button"]
  const calendarRow = calendarSpan.closest('[role="button"]') as HTMLElement;
  const emailRow = emailSpan.closest('[role="button"]') as HTMLElement;
  if (!calendarRow || !emailRow) return;

  const calendarSection = calendarRow.parentElement?.parentElement;
  const emailSection = emailRow.parentElement?.parentElement;
  if (!calendarSection || !emailSection || !calendarSection.parentElement) return;

  // Learn the checked/unchecked dot class names from the existing native rows
  const checkedDot = findRadioDot(calendarRow);
  const uncheckedDot = findRadioDot(emailRow);
  if (checkedDot) {
    dotCheckedClassName = checkedDot.className;
    // The inner dot is the child div of the checked outer circle
    if (checkedDot.firstElementChild) {
      innerDotHtml = checkedDot.firstElementChild.outerHTML;
    }
  }
  if (uncheckedDot) {
    dotUncheckedClassName = uncheckedDot.className;
    // Read the computed styles of the unchecked dot for later use as an overlay
    const computed = window.getComputedStyle(uncheckedDot);
    uncheckedDotBorderColor = computed.borderColor;
    uncheckedDotSize = uncheckedDot.offsetWidth;
  }

  // Clone the EMAIL section (the unchecked one) — this gives us:
  // 1. Correct unchecked dot visual by default
  // 2. Correct spacing classes (not the first-item special padding)
  const gcalSection = emailSection.cloneNode(true) as HTMLElement;
  gcalSection.id = GCAL_OPTION_ID;

  // Change the text label
  const gcalTextSpan = Array.from(gcalSection.querySelectorAll('span')).find(
    (s) => s.textContent && TEXT_MATCHERS.SEND_TO_EMAIL.includes(s.textContent.trim()),
  );
  if (gcalTextSpan) {
    gcalTextSpan.textContent = getGcalText(lang);
  }

  // Update the input
  const gcalInput = gcalSection.querySelector('input[type="radio"]') as HTMLInputElement;
  if (gcalInput) {
    gcalInput.checked = false;
    gcalInput.setAttribute('aria-checked', 'false');
    gcalInput.name = 'gcal_export';
    gcalInput.value = 'gcal';
    gcalInput.removeAttribute('aria-labelledby');
  }

  // Remove any id from cloned label to avoid duplicates
  const gcalLabel = gcalSection.querySelector('label');
  if (gcalLabel) gcalLabel.removeAttribute('id');

  // Insert between the two native sections
  calendarSection.parentElement.insertBefore(gcalSection, emailSection);
  isOptionInjected = true;

  // Save the ICS download URL now, while "Add to calendar" is still selected.
  // If the user later clicks email, Facebook removes this link from the DOM.
  const downloadLink = dialog.querySelector(
    'a[download][href*="ical"], a[download][href*=".ics"]',
  ) as HTMLAnchorElement;
  if (downloadLink) {
    savedIcsUrl = downloadLink.href;
  }

  // Inject CSS hover styles
  injectHoverStyles();

  // Setup interaction — pass calendarRow so we can overlay its dot
  setupGcalInteraction(dialog, gcalSection, calendarRow);
}

/**
 * Find the radio dot element — the outer circle div that changes classes for checked/unchecked.
 * DOM structure inside role="button":
 *   div.html-div (row content)
 *     > div (radio circle area)
 *       > div.html-div (OUTER CIRCLE — this toggles checked/unchecked classes)
 *         > div.html-div (INNER DOT — only visible when checked)
 *       > div[role="none"] (circle-area hover overlay)
 *       > input[type="radio"]
 *     > label > span (text)
 *   div[role="none"] (row-level hover overlay, opacity toggles on hover)
 */
function findRadioDot(radioRow: HTMLElement): HTMLElement | null {
  const input = radioRow.querySelector('input[type="radio"]');
  if (!input || !input.parentElement) return null;
  // The outer circle div is the first child of the input's parent that is an html-div with children
  for (const child of Array.from(input.parentElement.children)) {
    if (
      child.tagName === 'DIV' &&
      child !== input &&
      child.getAttribute('role') !== 'none' &&
      child.children.length >= 0 &&
      child.classList.contains('html-div')
    ) {
      return child as HTMLElement;
    }
  }
  return null;
}


function setupGcalInteraction(dialog: HTMLElement, gcalSection: HTMLElement, nativeCalendarRow: HTMLElement) {
  const gcalRow = gcalSection.querySelector('[role="button"]') as HTMLElement;
  if (!gcalRow) return;

  // Handle click on our Google Calendar option
  gcalRow.addEventListener(
    'click',
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      if (isGcalSelected) return; // Already selected, don't trigger anything
      isGcalSelected = true;

      // Update our dot to checked (className + insert inner dot child)
      const gcalDot = findRadioDot(gcalRow);
      if (gcalDot && dotCheckedClassName) {
        gcalDot.className = dotCheckedClassName;
        if (innerDotHtml && !gcalDot.firstElementChild) {
          gcalDot.insertAdjacentHTML('afterbegin', innerDotHtml);
        }
      }

      // Update our input
      const gcalInput = gcalSection.querySelector('input[type="radio"]') as HTMLInputElement;
      if (gcalInput) {
        gcalInput.checked = true;
        gcalInput.setAttribute('aria-checked', 'true');
      }

      // Show a fake unfilled dot over the native checked dot
      showNativeDotCover(nativeCalendarRow);
    },
    true,
  );

  // Listen for clicks on native radio rows to uncheck ours
  const nativeRows = dialog.querySelectorAll('[role="button"]');
  nativeRows.forEach((row) => {
    if (row === gcalRow) return;
    if (!row.querySelector('input[type="radio"]')) return;

    row.addEventListener('click', () => {
      if (!isGcalSelected) return;
      isGcalSelected = false;

      // Reset only our own radio to unchecked
      const gcalDot = findRadioDot(gcalRow);
      if (gcalDot && dotUncheckedClassName) {
        gcalDot.className = dotUncheckedClassName;
        // Remove inner dot child
        while (gcalDot.firstChild) gcalDot.removeChild(gcalDot.firstChild);
      }
      const gcalInput = gcalSection.querySelector('input[type="radio"]') as HTMLInputElement;
      if (gcalInput) {
        gcalInput.checked = false;
        gcalInput.setAttribute('aria-checked', 'false');
      }

      // Remove the fake dot cover from the native row
      hideNativeDotCover();
    });
  });

  // Intercept the export action via a capturing listener on the dialog
  setupExportInterception(dialog);
}

/**
 * Place an absolutely-positioned unfilled circle over the native checked dot
 * to visually "uncheck" it without modifying React's DOM.
 */
function showNativeDotCover(nativeRow: HTMLElement) {
  if (document.getElementById(DOT_COVER_ID)) return;

  const nativeDot = findRadioDot(nativeRow);
  if (!nativeDot || !nativeDot.parentElement) return;

  // Ensure the dot's parent is a positioning context
  const dotParent = nativeDot.parentElement;
  dotParent.style.position = 'relative';

  const cover = document.createElement('div');
  cover.id = DOT_COVER_ID;

  // Get the actual background color from the dialog for a perfect match
  const dialog = nativeRow.closest('[role="dialog"]');
  const bgColor = dialog
    ? window.getComputedStyle(dialog).backgroundColor
    : '#242526';

  cover.style.cssText = `
    position: absolute;
    top: ${nativeDot.offsetTop}px;
    left: ${nativeDot.offsetLeft}px;
    width: ${uncheckedDotSize || nativeDot.offsetWidth}px;
    height: ${uncheckedDotSize || nativeDot.offsetHeight}px;
    border-radius: 50%;
    border: 2px solid ${uncheckedDotBorderColor || 'rgba(255, 255, 255, 0.3)'};
    background: ${bgColor};
    box-sizing: border-box;
    pointer-events: none;
    z-index: 2;
  `;

  dotParent.appendChild(cover);
}

function hideNativeDotCover() {
  const cover = document.getElementById(DOT_COVER_ID);
  if (cover) cover.remove();
}

function setupExportInterception(dialog: HTMLElement) {
  dialog.addEventListener(
    'click',
    (e) => {
      if (!isGcalSelected) return;

      const target = e.target as HTMLElement;

      // Don't intercept clicks inside our own gcal option section
      if (target.closest('#' + GCAL_OPTION_ID)) return;

      // Check if the click target is inside an export button/link
      const clickedEl =
        (target.closest('a[role="link"]') as HTMLElement) ||
        (target.closest('div[role="button"]') as HTMLElement);
      if (!clickedEl) return;

      // Ensure this is an export button (not Cancel, Close, or a radio row)
      const hasExportText =
        clickedEl.textContent &&
        TEXT_MATCHERS.EXPORT_BUTTON.some((t) => clickedEl.textContent?.includes(t));
      const isRadioRow = !!clickedEl.querySelector('input[type="radio"]');
      if (!hasExportText || isRadioRow) return;

      // It's an export click while our option is selected!
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      // Use the ICS URL we saved at injection time
      if (savedIcsUrl) {
        chrome.runtime.sendMessage({ action: 'FETCH_AND_OPEN', url: savedIcsUrl });
      }

      // Close the modal
      const closeSelectors = TEXT_MATCHERS.CLOSE_BUTTON_ARIA.map(
        (aria) => `div[aria-label="${aria}"]`,
      ).join(', ');
      const closeButton = dialog.querySelector(closeSelectors) as HTMLElement;
      if (closeButton) {
        setTimeout(() => closeButton.click(), 50);
      }
    },
    true,
  );
}

// Reset state when modal is removed from DOM
const resetObserver = new MutationObserver(() => {
  if (!isOptionInjected) return;

  const dialogs = document.querySelectorAll('div[role="dialog"]');
  const isExportModalOpen = Array.from(dialogs).some((dialog) =>
    Array.from(dialog.querySelectorAll('span')).some(
      (span) =>
        span.textContent &&
        TEXT_MATCHERS.EXPORT_EVENT_TITLE.includes(span.textContent.trim()),
    ),
  );

  if (!isExportModalOpen) {
    isOptionInjected = false;
    isGcalSelected = false;
  }
});
resetObserver.observe(document.body, { childList: true, subtree: true });
