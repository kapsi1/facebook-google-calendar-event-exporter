// Lookups for English and Polish UI
const TEXT_MATCHERS = {
  EXPORT_EVENT_TITLE: ['Eksportuj wydarzenie', 'Export Event'],
  ADD_TO_CALENDAR: ['Dodaj do kalendarza', 'Add to calendar'],
  EXPORT_BUTTON: ['Eksportuj', 'Export'],
  CLOSE_BUTTON_ARIA: ['Zamknij', 'Close'],
};

function getGcalText(matchedNativeText: string): string {
  return matchedNativeText === 'Dodaj do kalendarza'
    ? 'Eksportuj do kalendarza Google'
    : 'Export to Google Calendar';
}

let isOptionInjected = false;
let isGcalSelected = false;

// We use an observer to detect when the export modal is added to the DOM
const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    if (mutation.addedNodes.length) {
      checkForExportModal();
    }
  }
});

// Start observing the body for modal injections
observer.observe(document.body, { childList: true, subtree: true });

function checkForExportModal() {
  if (isOptionInjected) return;

  // Facebook modals often have a role="dialog"
  const dialogs = document.querySelectorAll('div[role="dialog"]');
  for (const dialog of dialogs) {
    const isExportModal = Array.from(dialog.querySelectorAll('span')).some(
      (span) => span.textContent && TEXT_MATCHERS.EXPORT_EVENT_TITLE.includes(span.textContent),
    );

    if (isExportModal) {
      injectGoogleCalendarOption(dialog as HTMLElement);
      break;
    }
  }
}

function injectGoogleCalendarOption(dialog: HTMLElement) {
  // Find the "Add to calendar" option
  const spans = Array.from(dialog.querySelectorAll('span'));
  let matchedNativeText: string | null = null;
  const addToCalendarSpan = spans.find((s) => {
    if (s.textContent && TEXT_MATCHERS.ADD_TO_CALENDAR.includes(s.textContent)) {
      matchedNativeText = s.textContent;
      return true;
    }
    return false;
  });

  if (!addToCalendarSpan || !matchedNativeText) return;

  // Traverse up to find the clickable radio button container
  // Facebook's radio items are typically divs with role="button" containing the radio input
  const nativeRadioButton = addToCalendarSpan.closest('[role="button"]') as HTMLElement;

  if (!nativeRadioButton || !nativeRadioButton.parentNode) return;

  // Clone the native radio button to keep Facebook's exact styling
  const gcalOption = nativeRadioButton.cloneNode(true) as HTMLElement;

  // Find the input in our clone and uncheck it
  const gcalInput = gcalOption.querySelector('input[type="radio"]') as HTMLInputElement;
  if (gcalInput) {
    gcalInput.checked = false;
    gcalInput.setAttribute('aria-checked', 'false');
    gcalInput.name = 'gcal_export'; // Avoid conflict with native names
  }

  // Uncheck visual state by default
  // (Visual maintenance is now handled in setupRadioBehavior via templates)


  // Modify the cloned element to represent Google Calendar
  const textSpan = Array.from(gcalOption.querySelectorAll('span')).find(
    (s) => s.textContent === matchedNativeText,
  );
  if (textSpan) {
    textSpan.textContent = getGcalText(matchedNativeText);
  }

  // Insert it after the native option
  nativeRadioButton.parentNode.insertBefore(gcalOption, nativeRadioButton.nextSibling);
  isOptionInjected = true;

  // Setup click listeners for the custom radio behavior
  setupRadioBehavior(dialog, gcalOption);
  setupExportButtonInterceptor(dialog);
}

function setupRadioBehavior(dialog: HTMLElement, gcalRadio: HTMLElement) {
  isGcalSelected = false;

  // Find all radio-like containers in the modal.
  // In the provided HTML, they are role="button" containing an input[type="radio"]
  const getRadios = () => Array.from(dialog.querySelectorAll('[role="button"]'))
    .filter(el => el.querySelector('input[type="radio"]')) as HTMLElement[];

  const allRadios = getRadios();
  
  // Dynamically learn the class names for checked/unchecked states from native radios
  let checkedClasses: string[] = [];
  let uncheckedClasses: string[] = [];

  const updateTemplates = () => {
    const nativeRadios = getRadios().filter(r => r !== gcalRadio);
    const checked = nativeRadios.find(r => (r.querySelector('input') as HTMLInputElement).checked);
    const unchecked = nativeRadios.find(r => !(r.querySelector('input') as HTMLInputElement).checked);

    if (checked) {
      const dot = findInnerDot(checked);
      if (dot) checkedClasses = Array.from(dot.classList);
    }
    if (unchecked) {
      const dot = findInnerDot(unchecked);
      if (dot) uncheckedClasses = Array.from(dot.classList);
    }
  };

  updateTemplates();

  allRadios.forEach((radio) => {
    radio.addEventListener('click', (e) => {
      if (radio === gcalRadio) {
        e.preventDefault();
        e.stopPropagation();
        isGcalSelected = true;
        
        // Manually sync visuals since we stopped propagation
        getRadios().forEach(r => {
          const isOurTarget = r === gcalRadio;
          const input = r.querySelector('input') as HTMLInputElement;
          if (input) {
            input.checked = isOurTarget;
            input.setAttribute('aria-checked', isOurTarget ? 'true' : 'false');
          }
          const dot = findInnerDot(r);
          if (dot) {
            dot.className = (isOurTarget ? checkedClasses : uncheckedClasses).join(' ');
          }
        });
      } else {
        // Native radio clicked
        isGcalSelected = false;
        // Let Facebook handle the native selection logic, but we need to ensure our Gcal radio looks unchecked
        setTimeout(() => {
          const gcalDot = findInnerDot(gcalRadio);
          if (gcalDot) gcalDot.className = uncheckedClasses.join(' ');
          const gcalInput = gcalRadio.querySelector('input') as HTMLInputElement;
          if (gcalInput) {
            gcalInput.checked = false;
            gcalInput.setAttribute('aria-checked', 'false');
          }
        }, 0);
      }
    });
  });
}

// Facebook's radio dots are typically the nested div with lots of classes
function findInnerDot(container: HTMLElement): HTMLElement | null {
  // It's the div inside the radio container that isn't a span/input and has a nested class structure
  return container.querySelector('div[class*="x"] div[class*="x"]') as HTMLElement;
}

function setupExportButtonInterceptor(dialog: HTMLElement) {
  // Find only the VISIBLE Export button
  const getVisibleExportButton = () => {
    const interactables = Array.from(dialog.querySelectorAll('div[role="button"], a[role="link"]'));
    return interactables.find((b) => {
      const hasText = b.textContent && TEXT_MATCHERS.EXPORT_BUTTON.some((t) => b.textContent?.includes(t));
      // Element is visible and not aria-hidden
      const style = window.getComputedStyle(b);
      const isVisible = b.getClientRects().length > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      const isAriaHidden = b.getAttribute('aria-hidden') === 'true' || b.closest('[aria-hidden="true"]');
      return hasText && isVisible && !isAriaHidden;
    }) as HTMLElement;
  };

  const exportButton = getVisibleExportButton();
  if (!exportButton) return;

  // Intercept clicks on the export button
  exportButton.addEventListener('click', (e) => {
    if (isGcalSelected) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      executeGoogleCalendarExport();

      // Close the modal
      const closeSelectors = TEXT_MATCHERS.CLOSE_BUTTON_ARIA.map((aria) => `div[aria-label="${aria}"]`).join(', ');
      const closeButton = dialog.querySelector(closeSelectors) as HTMLElement;
      if (closeButton) closeButton.click();
    }
  }, true);
}

function executeGoogleCalendarExport() {
  chrome.runtime.sendMessage({ action: 'START_INTERCEPT' }, (response) => {
    if (response?.success) {
      // Find the native "Add to calendar" option to trigger the download
      const spans = Array.from(document.querySelectorAll('span'));
      const addCalSpan = spans.find(
        (s) => s.textContent && TEXT_MATCHERS.ADD_TO_CALENDAR.includes(s.textContent),
      );
      const nativeRadio = addCalSpan?.closest('[role="button"]') as HTMLElement;

      if (nativeRadio) {
        nativeRadio.click(); // Select native state in React

        setTimeout(() => {
          // Find the visible export button again to click it
          const dialog = nativeRadio.closest('[role="dialog"]');
          if (!dialog) return;

          const interactables = Array.from(dialog.querySelectorAll('div[role="button"], a[role="link"]'));
          const exportBtn = interactables.find((b) => {
            const hasText = b.textContent && TEXT_MATCHERS.EXPORT_BUTTON.some((t) => b.textContent?.includes(t));
            const style = window.getComputedStyle(b);
            const isVisible = b.getClientRects().length > 0 && style.display !== 'none' && style.visibility !== 'hidden';
            const isAriaHidden = b.getAttribute('aria-hidden') === 'true' || b.closest('[aria-hidden="true"]');
            return hasText && isVisible && !isAriaHidden;
          }) as HTMLElement;

          if (exportBtn) {
            exportBtn.click(); // Triggers the actual download
          }
        }, 150);
      }
    }
  });
}

// Reset state when modal closes
document.addEventListener('click', () => {
  setTimeout(() => {
    const dialogs = document.querySelectorAll('div[role="dialog"]');
    const isExportModalOpen = Array.from(dialogs).some((dialog) =>
      Array.from(dialog.querySelectorAll('span')).some(
        (span) => span.textContent && TEXT_MATCHERS.EXPORT_EVENT_TITLE.includes(span.textContent),
      ),
    );

    if (!isExportModalOpen) {
      isOptionInjected = false;
      isGcalSelected = false;
    }
  }, 200);
});
