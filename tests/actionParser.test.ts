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
});
