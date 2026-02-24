import type { IcsEvent } from './ics-parser';

/**
 * Builds a Google Calendar template URL from an IcsEvent object.
 * Format: https://calendar.google.com/calendar/render?action=TEMPLATE&text=...
 */
export function buildGoogleCalendarUrl(event: IcsEvent): string {
  const baseUrl = 'https://calendar.google.com/calendar/render';
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.summary,
    dates: `${event.dtstart}/${event.dtend}`,
  });

  if (event.description) {
    params.append('details', event.description);
  }

  if (event.location) {
    params.append('location', event.location);
  }

  return `${baseUrl}?${params.toString()}`;
}
