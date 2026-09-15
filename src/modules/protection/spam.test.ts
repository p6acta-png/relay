import { describe, expect, it } from 'vitest';
import { assessMessage } from './spam';

describe('assessMessage', () => {
  it('lets ordinary customer messages through', () => {
    expect(assessMessage('Hi! Can I book a service for my Brompton next Tuesday?').flagged).toBe(false);
    expect(assessMessage('Kan dere fikse bremsene på sykkelen min i morgen?').flagged).toBe(false);
  });

  it('flags link spam and typical spam terms', () => {
    expect(assessMessage('see http://a.example http://b.example www.c.example').reasons).toContain('links');
    expect(assessMessage('We offer SEO services and backlinks for your site').reasons).toContain(
      'spam_terms',
    );
  });

  it('flags markup that looks like an injection attempt', () => {
    expect(assessMessage('<script>alert(1)</script>').reasons).toContain('markup');
    expect(assessMessage('<img src=x onerror=alert(1)>').reasons).toContain('markup');
  });

  it('flags the same message sent over and over', () => {
    expect(assessMessage('hello', ['hello', 'HELLO ']).reasons).toContain('repeated');
    expect(assessMessage('hello', ['hello']).flagged).toBe(false);
  });

  it('flags keyboard mashing', () => {
    expect(assessMessage('sdfghjklqwrtzxcvbnmsdfghjkl').reasons).toContain('gibberish');
    expect(assessMessage('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa').reasons).toContain('gibberish');
  });
});
