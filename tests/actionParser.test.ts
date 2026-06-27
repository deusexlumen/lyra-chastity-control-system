import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseActions } from '../src/lib/actionParser.ts';

describe('parseActions', () => {
  it('parses SET_MODULE and SET_FLAG tags', () => {
    const input = 'Willkommen. [ACTION: SET_MODULE=2][ACTION: SET_FLAG=assessment_completed:true]';
    const result = parseActions(input);
    assert.equal(result.setModule, 2);
    assert.deepEqual(result.setFlags, [{ key: 'assessment_completed', value: true }]);
    assert.equal(result.cleanText, 'Willkommen.');
  });

  it('parses positive and negative penalties', () => {
    const input = 'Deal. [ACTION: PENALTY_MINUTES=-120] Später. [ACTION: PENALTY_MINUTES=360]';
    const result = parseActions(input);
    assert.deepEqual(result.penalties, [-120, 360]);
  });

  it('parses FORCE_MEDIA tags with numeric index', () => {
    const input = 'Schau. [ACTION: FORCE_MEDIA=nuria_trigger:1]';
    const result = parseActions(input);
    assert.deepEqual(result.forceMedia, [{ category: 'nuria_trigger', index: 1 }]);
  });

  it('returns clean text without tags', () => {
    const input = 'Nur Text. [ACTION: SET_MODULE=3]';
    const result = parseActions(input);
    assert.equal(result.cleanText, 'Nur Text.');
  });

  it('handles multiple flags and penalties in one response', () => {
    const input = '[ACTION: SET_FLAG=a:true][ACTION: SET_FLAG=b:5][ACTION: PENALTY_MINUTES=10][ACTION: PENALTY_MINUTES=20]';
    const result = parseActions(input);
    assert.deepEqual(result.setFlags, [{ key: 'a', value: true }, { key: 'b', value: 5 }]);
    assert.deepEqual(result.penalties, [10, 20]);
  });

  it('returns empty clean text and no actions for empty input', () => {
    const result = parseActions('');
    assert.equal(result.setModule, null);
    assert.deepEqual(result.setFlags, []);
    assert.deepEqual(result.penalties, []);
    assert.deepEqual(result.forceMedia, []);
    assert.equal(result.cleanText, '');
  });

  it('returns identical clean text when no tags are present', () => {
    const input = 'Just plain text.\nWith a newline.';
    const result = parseActions(input);
    assert.equal(result.cleanText, input);
  });

  it('keeps only the last SET_MODULE when multiple are present', () => {
    const input = '[ACTION: SET_MODULE=1][ACTION: SET_MODULE=5][ACTION: SET_MODULE=3]';
    const result = parseActions(input);
    assert.equal(result.setModule, 3);
    assert.equal(result.cleanText, '');
  });

  it('strips unknown action tags from clean text', () => {
    const input = 'Hello [ACTION: UNKNOWN=foo] world [ACTIONS: also_unknown] end.';
    const result = parseActions(input);
    assert.equal(result.cleanText, 'Hello world end.');
  });

  it('ignores FORCE_MEDIA with non-numeric index', () => {
    const input = 'Schau. [ACTION: FORCE_MEDIA=nuria_trigger:abc]';
    const result = parseActions(input);
    assert.deepEqual(result.forceMedia, []);
    assert.equal(result.cleanText, 'Schau.');
  });

  it('ignores SET_FLAG with empty key', () => {
    const input = '[ACTION: SET_FLAG=:true][ACTION: SET_FLAG=valid:false]';
    const result = parseActions(input);
    assert.deepEqual(result.setFlags, [{ key: 'valid', value: false }]);
  });

  it('preserves SET_FLAG string value as string', () => {
    const input = '[ACTION: SET_FLAG=mood:dominant_strict]';
    const result = parseActions(input);
    assert.deepEqual(result.setFlags, [{ key: 'mood', value: 'dominant_strict' }]);
  });

  it('produces negative number in penalties for negative penalty', () => {
    const input = '[ACTION: PENALTY_MINUTES=-15]';
    const result = parseActions(input);
    assert.deepEqual(result.penalties, [-15]);
    assert.equal(result.cleanText, '');
  });
});
