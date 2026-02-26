import { describe, expect, it } from 'vitest';
import { parseIcsEvent } from './ics-parser';

describe('ICS Parser RFC 5545 Compliance', () => {
  it('handles case-insensitive property names', () => {
    const ics = `BEGIN:vcalendar
version:2.0
BEGIN:vevent
summary:Case Insensitive
dtstart:20240101T120000Z
dtend:20240101T130000Z
END:vevent
END:vcalendar`;

    const result = parseIcsEvent(ics);
    expect(result).not.toBeNull();
    expect(result?.summary).toBe('Case Insensitive');
  });

  it('handles colons in property parameters', () => {
    const ics = `BEGIN:VEVENT
SUMMARY;X-PARAM="Value: with colon":Event with colon parameter
DTSTART:20240101T120000Z
DTEND:20240101T130000Z
END:VEVENT`;

    const result = parseIcsEvent(ics);
    expect(result).not.toBeNull();
    expect(result?.summary).toBe('Event with colon parameter');
  });

  it('handles semicolons in property parameters', () => {
    const ics = `BEGIN:VEVENT
SUMMARY;X-PARAM="Value; with semicolon":Event with semicolon parameter
DTSTART:20240101T120000Z
DTEND:20240101T130000Z
END:VEVENT`;

    const result = parseIcsEvent(ics);
    expect(result).not.toBeNull();
    expect(result?.summary).toBe('Event with semicolon parameter');
  });

  it('handles VALUE=DATE for all-day events', () => {
    const ics = `BEGIN:VEVENT
SUMMARY:All Day Event
DTSTART;VALUE=DATE:20240101
DTEND;VALUE=DATE:20240102
END:VEVENT`;

    const result = parseIcsEvent(ics);
    expect(result).not.toBeNull();
    expect(result?.dtstart).toBe('20240101');
    expect(result?.dtend).toBe('20240102');
  });

  it('handles escaped uppercase \\N', () => {
    const ics = `BEGIN:VEVENT
SUMMARY:Line 1\\NLine 2
DTSTART:20240101T120000Z
DTEND:20240101T130000Z
END:VEVENT`;

    const result = parseIcsEvent(ics);
    expect(result?.summary).toBe('Line 1\nLine 2');
  });

  it('handles property parameters correctly (ignores them but parses value)', () => {
    const ics = `BEGIN:VEVENT
SUMMARY;LANGUAGE=en-US:English Summary
DTSTART;TZID=Europe/Warsaw:20240101T120000
DTEND;TZID=Europe/Warsaw:20240101T130000
END:VEVENT`;

    const result = parseIcsEvent(ics);
    expect(result).not.toBeNull();
    expect(result?.summary).toBe('English Summary');
    expect(result?.dtstart).toBe('20240101T120000');
  });

  it('parses DTSTAMP and UID', () => {
    const ics = `BEGIN:VEVENT
SUMMARY:Test Required Fields
DTSTART:20240101T120000Z
DTEND:20240101T130000Z
DTSTAMP:20240226T100000Z
UID:test-uid@example.com
END:VEVENT`;

    const result = parseIcsEvent(ics);
    expect(result?.dtstamp).toBe('20240226T100000Z');
    expect(result?.uid).toBe('test-uid@example.com');
  });
});
