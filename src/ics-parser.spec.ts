import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { parseIcsEvent, unescapeIcsProperty, unfoldIcs } from './ics-parser';

describe('ICS Parser', () => {
  describe('unfoldIcs', () => {
    it('unfolds lines starting with space or tab', () => {
      const folded = `DESCRIPTION:This is a long
  string that is folded
 \twith mixed whitespace`;
      const unfolded = unfoldIcs(folded);
      expect(unfolded).toBe(
        'DESCRIPTION:This is a long string that is folded\twith mixed whitespace',
      );
    });

    it('handles CRLF correctly', () => {
      const folded = 'DESCRIPTION:Line 1\r\n Line 2';
      expect(unfoldIcs(folded)).toBe('DESCRIPTION:Line 1Line 2');
    });
  });

  describe('unescapeIcsProperty', () => {
    it('unescapes newlines, commas, semicolons, and backslashes', () => {
      const escaped = 'New\\nline, comma\\, semicolon\\; backslash\\\\';
      expect(unescapeIcsProperty(escaped)).toBe('New\nline, comma, semicolon; backslash\\');
    });
  });

  describe('parseIcsEvent', () => {
    it('parses a basic event', () => {
      const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
SUMMARY:Test Event
DTSTART:20240101T120000Z
DTEND:20240101T130000Z
END:VEVENT
END:VCALENDAR`;

      const result = parseIcsEvent(ics);
      expect(result).toStrictEqual({
        summary: 'Test Event',
        dtstart: '20240101T120000Z',
        dtend: '20240101T130000Z',
      });
    });

    it('parses the real Facebook ICS file', () => {
      const icsPath = join(__dirname, '../res/e1222469870066926.ics');
      const icsContent = readFileSync(icsPath, 'utf8');

      const result = parseIcsEvent(icsContent);
      expect(result).not.toBeNull();

      expect(result?.summary).toBe('Zwiedzanie Schronu O.P.P.M. szpital im. S. Żeromskiego');
      expect(result?.dtstart).toBe('20260228T170000Z');
      expect(result?.dtend).toBe('20260228T200000Z');
      expect(result?.location).toBe('Schron - OPPM - Szpital Żeromskiego');
      expect(result?.url).toBe('https://www.facebook.com/events/1222469870066926/');

      // Check partial content of unfolded description
      expect(result?.description).toContain('Zapraszamy do unikalnego schronu');
      expect(result?.description).toContain('Szpitala im. S. Żeromskiego, w którym'); // Notice the unescaped comma
      expect(result?.description).toContain('na miejscu, za gotówkę.'); // Unescaped comma
      expect(result?.description).toContain('\n'); // Unescaped new line
    });

    it('returns null if required fields are missing', () => {
      const ics = `BEGIN:VEVENT
SUMMARY:Test
END:VEVENT`;
      expect(parseIcsEvent(ics)).toBeNull();
    });
  });
});
