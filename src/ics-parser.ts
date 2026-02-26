export interface IcsEvent {
  summary: string;
  dtstart: string;
  dtend: string;
  dtstamp?: string;
  uid?: string;
  description?: string;
  location?: string;
  url?: string;
}

/**
 * Unfolds an ICS file string by joining continuation lines.
 * RFC 5545 §3.1: Lines that begin with a space or tab are continuation lines.
 */
export function unfoldIcs(icsString: string): string {
  // Replace CRLF+space/tab or LF+space/tab with nothing
  return icsString.replace(/\r?\n[ \t]/g, '');
}

/**
 * Unescapes special characters in text properties.
 * RFC 5545: \n -> newline, \, -> comma, \\ -> backslash, \; -> semicolon
 */
export function unescapeIcsProperty(text: string): string {
  return text
    .replace(/\\n/gi, '\n')
    .replace(/\\N/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

/**
 * Parses an ICS string and extracts the first VEVENT.
 * Returns null if no VEVENT is found.
 */
export function parseIcsEvent(icsContent: string): IcsEvent | null {
  const unfolded = unfoldIcs(icsContent);
  const lines = unfolded.split(/\r?\n/);

  let inEvent = false;
  const event: Partial<IcsEvent> = {};

  for (const line of lines) {
    const upperLine = line.toUpperCase();
    if (upperLine.startsWith('BEGIN:VEVENT')) {
      inEvent = true;
      continue;
    }
    if (upperLine.startsWith('END:VEVENT')) {
      if (inEvent) break;
      continue;
    }

    if (!inEvent) continue;

    // Find the first colon that is not inside a quoted parameter value.
    // RFC 5545 §3.2: Parameter values containing COLON, SEMICOLON or COMMA must be quoted.
    let colonIndex = -1;
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ':' && !inQuotes) {
        colonIndex = i;
        break;
      }
    }

    if (colonIndex === -1) continue;

    const propertyNamePart = line.substring(0, colonIndex);
    const propertyValue = line.substring(colonIndex + 1);

    // Get base property name (before any semicolon parameters) and normalize to uppercase
    const propertyName = propertyNamePart.split(';')[0].toUpperCase();

    switch (propertyName) {
      case 'SUMMARY':
        event.summary = unescapeIcsProperty(propertyValue);
        break;
      case 'DTSTART':
        event.dtstart = propertyValue;
        break;
      case 'DTEND':
        event.dtend = propertyValue;
        break;
      case 'DTSTAMP':
        event.dtstamp = propertyValue;
        break;
      case 'UID':
        event.uid = propertyValue;
        break;
      case 'DESCRIPTION':
        event.description = unescapeIcsProperty(propertyValue);
        break;
      case 'LOCATION':
        event.location = unescapeIcsProperty(propertyValue);
        break;
      case 'URL':
        event.url = propertyValue;
        break;
    }
  }

  // Ensure required fields are present
  // Note: While DTSTAMP and UID are MUST in RFC 5545, for our GCal export purposes
  // we primarily need summary, dtstart and dtend.
  if (!event.summary || !event.dtstart || !event.dtend) {
    return null; // Invalid ICS event for our purposes
  }

  return event as IcsEvent;
}
