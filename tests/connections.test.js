const test = require('node:test');
const assert = require('node:assert/strict');
const { hasAcceptedConnection } = require('../src/utils/connection');

test('returns true for an accepted follow in either direction', () => {
  const follows = [{ follower_id: 'user-1', following_id: 'user-2', status: 'ACCEPTED' }];
  assert.equal(hasAcceptedConnection(follows, 'user-1', 'user-2'), true);
  assert.equal(hasAcceptedConnection(follows, 'user-2', 'user-1'), true);
});

test('returns false for pending or missing follow rows', () => {
  assert.equal(hasAcceptedConnection([], 'user-1', 'user-2'), false);
  assert.equal(hasAcceptedConnection([{ follower_id: 'user-1', following_id: 'user-2', status: 'PENDING' }], 'user-1', 'user-2'), false);
});
