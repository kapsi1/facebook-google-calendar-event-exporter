import { buildGoogleCalendarUrl } from './gcal-url-builder';
import { parseIcsEvent } from './ics-parser';

// Constants for Polish Facebook UI
// (We could internationalize this later, but addressing user's exact UI first)
const ADD_TO_CALENDAR_TEXT = 'Dodaj do kalendarza';
const EXPORT_EVENT_TITLE = 'Eksportuj wydarzenie';
const EXPORT_BUTTON_TEXT = 'Eksportuj';
const GCAL_OPTION_TEXT = 'Eksportuj do Google Calendar';

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
      (span) => span.textContent === EXPORT_EVENT_TITLE,
    );

    if (isExportModal) {
      injectGoogleCalendarOption(dialog as HTMLElement);
      break;
    }
  }
}

function injectGoogleCalendarOption(dialog: HTMLElement) {
  // Find the "Dodaj do kalendarza" option
  const spans = Array.from(dialog.querySelectorAll('span'));
  const addToCalendarSpan = spans.find((s) => s.textContent === ADD_TO_CALENDAR_TEXT);

  if (!addToCalendarSpan) return;

  // Traverse up to find the clickable radio button container
  // Facebook's DOM is deeply nested div soup, so we traverse up a few levels until we find a div with role="radio" or similar clickable wrapper
  const nativeRadioButton =
    addToCalendarSpan.closest('[role="radio"]') ||
    addToCalendarSpan.parentElement?.parentElement?.parentElement;

  if (!nativeRadioButton || !nativeRadioButton.parentNode) return;

  // Clone the native radio button to keep Facebook's exact styling
  const gcalOption = nativeRadioButton.cloneNode(true) as HTMLElement;

  // Modify the cloned element to represent Google Calendar
  const textSpan = Array.from(gcalOption.querySelectorAll('span')).find(
    (s) => s.textContent === ADD_TO_CALENDAR_TEXT,
  );
  if (textSpan) {
    textSpan.textContent = GCAL_OPTION_TEXT;
  }

  // Insert it after the native option
  nativeRadioButton.parentNode.insertBefore(gcalOption, nativeRadioButton.nextSibling);
  isOptionInjected = true;

  // Setup click listeners for the custom radio behavior since cloned nodes don't copy event listeners
  setupRadioBehavior(dialog, nativeRadioButton as HTMLElement, gcalOption);
  setupExportButtonInterceptor(dialog);
}

function setupRadioBehavior(dialog: HTMLElement, nativeRadio: HTMLElement, gcalRadio: HTMLElement) {
  // By default, Gcal is not selected
  isGcalSelected = false;

  // Grab all radio options in the modal
  const allRadios = Array.from(nativeRadio.parentNode?.children || []) as HTMLElement[];

  allRadios.forEach((radio) => {
    radio.addEventListener('click', (e) => {
      // If the clicked radio is our custom Google Calendar one
      if (radio === gcalRadio) {
        isGcalSelected = true;
        // Visual trickery: make ours look checked, others look unchecked
        // (This relies heavily on Facebook's specific SVG/CSS structure, might need tuning based on actual DOM)
        updateRadioVisuals(allRadios, gcalRadio);
        e.stopPropagation(); // Stop facebook scripts from getting confused by our custom radioactive button
      } else {
        isGcalSelected = false;
        // Let Facebook handle checking their own, but ensure ours looks unchecked
        updateRadioVisuals(allRadios, radio);
      }
    });
  });
}

function updateRadioVisuals(allRadios: HTMLElement[], selectedRadio: HTMLElement) {
  // Facebook usually uses an outer circle with a smaller inner blue circle for selected state.
  // Assuming the inner circle is hidden/shown via opacity or DOM presence.
  // This is a rough approximation that we will refine during visual testing
  console.log('Selected radio:', selectedRadio);
}

function setupExportButtonInterceptor(dialog: HTMLElement) {
  // Find the Export button
  const buttons = Array.from(dialog.querySelectorAll('div[role="button"]'));
  const exportButton = buttons.find((b) => b.textContent?.includes(EXPORT_BUTTON_TEXT));

  if (!exportButton) return;

  // Intercept clicks on the export button
  exportButton.addEventListener(
    'click',
    (e) => {
      if (isGcalSelected) {
        // Prevent default Facebook export
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        executeGoogleCalendarExport();

        // Optionally close the modal
        const closeButton = dialog.querySelector('div[aria-label="Zamknij"]') as HTMLElement;
        if (closeButton) closeButton.click();
      }
    },
    true,
  ); // Use capture phase to intercept before React
}

function executeGoogleCalendarExport() {
  // To get the .ics file, we have two options:
  // 1. Tell our background worker to intercept the next download. (Hard, timing issues).
  // 2. We can send a message to the background worker to trigger the fetch itself, OR grab it from the page if we can find the API endpoint.
  // For now, let's use the Background worker download interception approach.

  chrome.runtime.sendMessage({ action: 'START_INTERCEPT' });

  // Now, programmatically click the ACTUAL "Dodaj do kalendarza" option and then Export, so Facebook generates the file.
  // Wait, if we click export, Facebook triggers a download.
  const dialogs = document.querySelectorAll('div[role="dialog"]');
  const addCalSpan = Array.from(document.querySelectorAll('span')).find(
    (s) => s.textContent === ADD_TO_CALENDAR_TEXT,
  );
  const nativeRadio = addCalSpan?.closest('[role="radio"]') as HTMLElement;

  if (nativeRadio) {
    nativeRadio.click(); // Select native

    setTimeout(() => {
      const exportBtn = Array.from(document.querySelectorAll('div[role="button"]')).find((b) =>
        b.textContent?.includes(EXPORT_BUTTON_TEXT),
      ) as HTMLElement;
      if (exportBtn) {
        exportBtn.click(); // Export! Background worker will catch the download.
      }
    }, 100);
  }
}

// Reset state when modal closes
document.addEventListener('click', () => {
  setTimeout(() => {
    const dialogs = document.querySelectorAll('div[role="dialog"]');
    const isExportModalOpen = Array.from(dialogs).some((dialog) =>
      Array.from(dialog.querySelectorAll('span')).some(
        (span) => span.textContent === EXPORT_EVENT_TITLE,
      ),
    );

    if (!isExportModalOpen) {
      isOptionInjected = false;
      isGcalSelected = false;
    }
  }, 200);
});
