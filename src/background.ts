import { buildGoogleCalendarUrl } from './gcal-url-builder';
import { parseIcsEvent } from './ics-parser';

let isIntercepting = false;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'START_INTERCEPT') {
    isIntercepting = true;
    console.log('[GCal Export] Started intercepting downloads.');
    sendResponse({ success: true });
  }

  if (message.action === 'FETCH_AND_OPEN') {
    // Directly fetch the ICS from a known URL and open Google Calendar
    fetchIcsAndOpenGcal(message.url);
    sendResponse({ success: true });
  }

  // Return true to indicate we may send an async response
  return true;
});

chrome.downloads.onCreated.addListener((downloadItem) => {
  if (!isIntercepting) return;

  // Check if this looks like a Facebook ICS download
  const url = downloadItem.url || '';
  const filename = downloadItem.filename || '';
  const isFacebookIcs =
    (url.includes('facebook') || url.includes('fbcdn')) &&
    (filename.endsWith('.ics') || url.includes('ical'));

  if (!isFacebookIcs) return;

  console.log('[GCal Export] Intercepted ICS download:', downloadItem);

  // Cancel the native download
  chrome.downloads.cancel(downloadItem.id);
  isIntercepting = false;

  fetchIcsAndOpenGcal(downloadItem.url);
});

async function fetchIcsAndOpenGcal(url: string) {
  try {
    console.log('[GCal Export] Fetching ICS from:', url);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const icsContent = await response.text();
    console.log('[GCal Export] ICS content length:', icsContent.length);

    const event = parseIcsEvent(icsContent);

    if (event) {
      const gcalUrl = buildGoogleCalendarUrl(event);
      console.log('[GCal Export] Opening Google Calendar:', gcalUrl);
      chrome.tabs.create({ url: gcalUrl });
    } else {
      console.error('[GCal Export] Failed to parse ICS event from downloaded content.');
    }
  } catch (error) {
    console.error('[GCal Export] Error fetching/parsing the ICS file:', error);
  }
}
