import { buildGoogleCalendarUrl } from './gcal-url-builder';
import { parseIcsEvent } from './ics-parser';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'FETCH_AND_OPEN') {
    // Directly fetch the ICS from a known URL and open Google Calendar
    fetchIcsAndOpenGcal(message.url);
    sendResponse({ success: true });
  }

  // Return true to indicate we may send an async response
  return true;
});

async function fetchIcsAndOpenGcal(url: string) {
  try {
    // Security check: only allow HTTPS URLs from facebook.com or its CDNs (fbcdn.net)
    const parsedUrl = new URL(url);
    const allowedDomains = ['facebook.com', 'fbcdn.net'];
    const isAllowed = allowedDomains.some(
      (domain) =>
        parsedUrl.protocol === 'https:' &&
        (parsedUrl.hostname === domain || parsedUrl.hostname.endsWith(`.${domain}`)),
    );

    if (!isAllowed) {
      console.error('[GCal Export] Blocked attempt to fetch from unauthorized domain:', url);
      return;
    }

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
