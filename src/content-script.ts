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
  if (checkedDot) dotCheckedClassName = checkedDot.className;
  if (uncheckedDot) dotUncheckedClassName = uncheckedDot.className;

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

  // Setup interaction
  setupGcalInteraction(dialog, gcalSection);
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

/**
 * Find the row-level hover overlay — the last child div of role="button" with role="none"
 * and data-visualcompletion="ignore". It has opacity 0 normally, 1 on hover.
 */
function findHoverOverlay(radioRow: HTMLElement): HTMLElement | null {
  // It's the last child of the role="button" element
  const lastChild = radioRow.lastElementChild as HTMLElement;
  if (lastChild?.getAttribute('role') === 'none' && lastChild?.getAttribute('data-visualcompletion') === 'ignore') {
    return lastChild;
  }
  return null;
}

function setupGcalInteraction(dialog: HTMLElement, gcalSection: HTMLElement) {
  const gcalRow = gcalSection.querySelector('[role="button"]') as HTMLElement;
  if (!gcalRow) return;

  // Setup hover effect by toggling the overlay's opacity (matching native behavior)
  const hoverOverlay = findHoverOverlay(gcalRow);
  if (hoverOverlay) {
    gcalRow.addEventListener('mouseenter', () => {
      hoverOverlay.style.opacity = '1';
    });
    gcalRow.addEventListener('mouseleave', () => {
      hoverOverlay.style.opacity = '0';
    });
  }

  // Handle click on our Google Calendar option
  gcalRow.addEventListener(
    'click',
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      if (isGcalSelected) return; // Already selected, don't trigger anything
      isGcalSelected = true;

      // Update our dot to checked
      const gcalDot = findRadioDot(gcalRow);
      if (gcalDot && dotCheckedClassName) {
        gcalDot.className = dotCheckedClassName;
      }

      // Update our input
      const gcalInput = gcalSection.querySelector('input[type="radio"]') as HTMLInputElement;
      if (gcalInput) {
        gcalInput.checked = true;
        gcalInput.setAttribute('aria-checked', 'true');
      }

      // Uncheck all native radios visually
      const nativeRows = dialog.querySelectorAll('[role="button"]');
      nativeRows.forEach((row) => {
        if (row === gcalRow) return;
        const input = row.querySelector('input[type="radio"]') as HTMLInputElement;
        if (!input) return;

        input.checked = false;
        input.setAttribute('aria-checked', 'false');

        const dot = findRadioDot(row as HTMLElement);
        if (dot && dotUncheckedClassName) {
          dot.className = dotUncheckedClassName;
        }
      });
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

      // Reset our radio to unchecked after a tick (let Facebook update its own first)
      setTimeout(() => {
        const gcalDot = findRadioDot(gcalRow);
        if (gcalDot && dotUncheckedClassName) {
          gcalDot.className = dotUncheckedClassName;
        }
        const gcalInput = gcalSection.querySelector('input[type="radio"]') as HTMLInputElement;
        if (gcalInput) {
          gcalInput.checked = false;
          gcalInput.setAttribute('aria-checked', 'false');
        }
      }, 10);
    });
  });

  // Intercept the export action via a capturing listener on the dialog
  setupExportInterception(dialog);
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

      // Get the ICS download URL directly from the <a download> link in the dialog
      const downloadLink = dialog.querySelector(
        'a[download][href*="ical"], a[download][href*=".ics"]',
      ) as HTMLAnchorElement;
      if (downloadLink) {
        const icsUrl = downloadLink.href;
        chrome.runtime.sendMessage({ action: 'FETCH_AND_OPEN', url: icsUrl });
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
