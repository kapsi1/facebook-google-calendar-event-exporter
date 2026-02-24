import { buildGoogleCalendarUrl } from './gcal-url-builder';
import { parseIcsEvent } from './ics-parser';

let isIntercepting = false;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'START_INTERCEPT') {
    isIntercepting = true;
    console.log('Started intercepting downloads for Google Calendar shortcut.');
    sendResponse({ success: true });
  }
});

chrome.downloads.onCreated.addListener((downloadItem) => {
  if (
    !isIntercepting ||
    !downloadItem.url.includes('facebook') ||
    !downloadItem.filename.endsWith('.ics')
  ) {
    return;
  }

  // We caught the ICS file!
  console.log('Intercepted ICS download:', downloadItem);

  // Cancel the native download so the user doesn't get a random .ics file in their downloads folder
  chrome.downloads.cancel(downloadItem.id);
  isIntercepting = false;

  // Unfortunately, cancelling a download doesn't give us the contents.
  // Instead, since the URL is usually a Blob URL or a Facebook Graph URL, let's fetch it.
  fetchIcsAndOpenGcal(downloadItem.url);
});

async function fetchIcsAndOpenGcal(url: string) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const icsContent = await response.text();
    const event = parseIcsEvent(icsContent);

    if (event) {
      const gcalUrl = buildGoogleCalendarUrl(event);
      // Open the Google Calendar URL in a new tab
      chrome.tabs.create({ url: gcalUrl });
    } else {
      console.error('Failed to parse ICS event from downloaded content.');
    }
  } catch (error) {
    console.error('Error fetching/parsing the ICS file:', error);
  }
}
