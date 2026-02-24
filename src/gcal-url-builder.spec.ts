import { describe, expect, it } from 'vitest';
import { buildGoogleCalendarUrl } from './gcal-url-builder';
import type { IcsEvent } from './ics-parser';

describe('Google Calendar URL Builder', () => {
  it('builds a URL with all fields populated', () => {
    const event: IcsEvent = {
      summary: 'Test Event',
      dtstart: '20240101T120000Z',
      dtend: '20240101T130000Z',
      description: 'This is a description',
      location: 'Test Location',
    };

    const url = buildGoogleCalendarUrl(event);
    const parsedUrl = new URL(url);

    expect(parsedUrl.origin).toBe('https://calendar.google.com');
    expect(parsedUrl.pathname).toBe('/calendar/render');
    expect(parsedUrl.searchParams.get('action')).toBe('TEMPLATE');
    expect(parsedUrl.searchParams.get('text')).toBe('Test Event');
    expect(parsedUrl.searchParams.get('dates')).toBe('20240101T120000Z/20240101T130000Z');
    expect(parsedUrl.searchParams.get('details')).toBe('This is a description');
    expect(parsedUrl.searchParams.get('location')).toBe('Test Location');
  });

  it('builds a URL with missing optional fields', () => {
    const event: IcsEvent = {
      summary: 'Minimal Event',
      dtstart: '20240101T120000Z',
      dtend: '20240101T130000Z',
    };

    const url = buildGoogleCalendarUrl(event);
    const parsedUrl = new URL(url);

    expect(parsedUrl.searchParams.get('text')).toBe('Minimal Event');
    expect(parsedUrl.searchParams.get('details')).toBeNull();
    expect(parsedUrl.searchParams.get('location')).toBeNull();
  });

  it('properly encodes special characters', () => {
    const event: IcsEvent = {
      summary: 'Zażółć gęślą jaźń',
      dtstart: '20240101T120000Z',
      dtend: '20240101T130000Z',
      description: 'Multi\nLine\nDescription with, commas & & symbols',
      location: 'Warsaw, Poland',
    };

    const url = buildGoogleCalendarUrl(event);

    // URLSearchParams automatically handles encoding, ensuring it's valid:
    expect(url).toContain('details=Multi%0ALine%0ADescription+with%2C+commas+%26+%26+symbols');
    expect(url).toContain('location=Warsaw%2C+Poland');
  });
});
