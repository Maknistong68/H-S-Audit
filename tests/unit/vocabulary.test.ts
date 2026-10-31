import { test, expect } from 'vitest';
import { correctTranscript, pickBestAlternative, contextWordsFor, HSE_PHRASES } from '../../src/media/vocabulary';

test('fixes common mishearings of HSE terms', () => {
  expect(correctTranscript('the ram\'s were not available at site')).toBe('the RAMS were not available at site');
  expect(correctTranscript('no rams for cable pulling')).toBe('no RAMS for cable pulling');
  expect(correctTranscript('the p t w was not displayed')).toBe('the PTW was not displayed');
  expect(correctTranscript('h s s e plan is code a on a conex')).toBe('HSSE plan is Code A on Aconex');
  expect(correctTranscript('h s e plan code b')).toBe('HSE plan Code B');
  expect(correctTranscript('old neo c number on helmets')).toBe('old NEOC number on helmets');
  expect(correctTranscript('workers without ppe')).toBe('workers without PPE');
  expect(correctTranscript('no lo to on the panel')).toBe('no LOTO on the panel');
  expect(correctTranscript('r c d not tested')).toBe('RCD not tested');
  expect(correctTranscript('k p i s not aligned')).toBe('KPIs not aligned');
  expect(correctTranscript('the tool box talk was done')).toBe('the toolbox talk was done');
  // ordinary words are left alone
  expect(correctTranscript('the ramp was blocked and a code was missing')).toBe('the ramp was blocked and a code was missing');
});

test('spoken punctuation', () => {
  expect(correctTranscript('workers had no helmets full stop new line permit missing')).toBe('workers had no helmets.\npermit missing');
  expect(correctTranscript('fire extinguisher comma first aid box period')).toBe('fire extinguisher, first aid box.');
  expect(correctTranscript('is it approved question mark')).toBe('is it approved?');
});

test('picks the guess that fits audit language, otherwise the most confident one', () => {
  const ctx = contextWordsFor('Are approved risks assessments and method statements (RAMS) available for all current tasks?');
  expect(ctx).toContain('approved');
  expect(ctx).not.toContain('and');
  expect(
    pickBestAlternative(
      [
        { transcript: 'the rums were not a proved', confidence: 0.62 },
        { transcript: 'the RAMS were not approved', confidence: 0.58 },
      ],
      ctx,
    ),
  ).toBe('the RAMS were not approved');
  expect(
    pickBestAlternative(
      [
        { transcript: 'blue sky', confidence: 0.4 },
        { transcript: 'blue skies', confidence: 0.7 },
      ],
      ctx,
    ),
  ).toBe('blue skies');
  expect(pickBestAlternative([], ctx)).toBe('');
});

test('phrase list covers the core vocabulary', () => {
  for (const p of ['RAMS', 'PTW', 'HSSE', 'NEOC', 'Aconex', 'LOTO', 'toolbox talk']) expect(HSE_PHRASES).toContain(p);
});
