import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveRouterBasename } from './routerBase.ts';

test('uses the gateway platform base for production dashboard paths', () => {
  assert.equal(resolveRouterBasename('/platform'), '/platform');
  assert.equal(resolveRouterBasename('/platform/'), '/platform');
  assert.equal(resolveRouterBasename('/platform/caio'), '/platform');
});

test('keeps the root base for local and unrelated paths', () => {
  assert.equal(resolveRouterBasename('/'), undefined);
  assert.equal(resolveRouterBasename('/caio'), undefined);
  assert.equal(resolveRouterBasename('/platformer'), undefined);
});
