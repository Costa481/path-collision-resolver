import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createResolver, numericSuffix, timestampSuffix } from '../src/index.js';

/** Build a resolver backed by a Set so tests are deterministic and hermetic. */
function resolverWith(existing, opts = {}) {
  const taken = new Set(existing);
  return {
    resolver: createResolver({ exists: (p) => taken.has(p), ...opts }),
    taken,
  };
}

test('returns the original path when nothing exists', () => {
  const { resolver } = resolverWith([]);
  assert.equal(resolver('report.txt'), 'report.txt');
});

test('appends (1) on a single collision', () => {
  const { resolver } = resolverWith(['report.txt']);
  assert.equal(resolver('report.txt'), 'report (1).txt');
});

test('increments through (1), (2), (3) when all are taken', () => {
  const { resolver } = resolverWith(['a.txt', 'a (1).txt', 'a (2).txt']);
  assert.equal(resolver('a.txt'), 'a (3).txt');
});

test('preserves the directory portion', () => {
  const { resolver } = resolverWith(['/var/log/app.log']);
  assert.equal(resolver('/var/log/app.log'), '/var/log/app (1).log');
});

test('handles backslash separators on windows-style paths', () => {
  const { resolver } = resolverWith(['C:\\Users\\me\\file.txt']);
  assert.equal(resolver('C:\\Users\\me\\file.txt'), 'C:\\Users\\me\\file (1).txt');
});

test('treats only the final dot as the extension', () => {
  const { resolver } = resolverWith(['archive.tar.gz']);
  assert.equal(resolver('archive.tar.gz'), 'archive.tar (1).gz');
});

test('dotfiles with no other dot keep the leading dot in the base', () => {
  const { resolver } = resolverWith(['.bashrc']);
  assert.equal(resolver('.bashrc'), '.bashrc (1)');
});

test('files with no extension still get a suffix', () => {
  const { resolver } = resolverWith(['Makefile']);
  assert.equal(resolver('Makefile'), 'Makefile (1)');
});

test('throws when maxAttempts is exceeded', () => {
  const existing = [];
  for (let i = 0; i <= 5; i++) {
    existing.push(i === 0 ? 'f.txt' : `f (${i}).txt`);
  }
  const { resolver } = resolverWith(existing, { maxAttempts: 5 });
  assert.throws(() => resolver('f.txt'), /gave up after 5 attempts/);
});

test('rejects empty path input', () => {
  const { resolver } = resolverWith([]);
  assert.throws(() => resolver(''), /non-empty path/);
});

test('rejects non-string path input', () => {
  const { resolver } = resolverWith([]);
  assert.throws(() => resolver(42), /non-empty path/);
});

test('numericSuffix rejects non-positive attempt', () => {
  assert.throws(() => numericSuffix(0), /positive integer/);
  assert.throws(() => numericSuffix(-1), /positive integer/);
});

test('timestampSuffix uses the injected clock and UTC formatting', () => {
  // 2024-01-02T03:04:05Z → 20240102-030405
  const fixed = () => Date.UTC(2024, 0, 2, 3, 4, 5);
  const makeSuffix = (attempt) => timestampSuffix(attempt, fixed);
  const { resolver } = resolverWith(['note.md'], { suffix: makeSuffix });
  assert.equal(resolver('note.md'), 'note 20240102-030405.md');
});

test('timestampSuffix falls back to -2 when the bare timestamp collides', () => {
  const fixed = () => Date.UTC(2024, 0, 2, 3, 4, 5);
  const makeSuffix = (attempt) => timestampSuffix(attempt, fixed);
  const { resolver } = resolverWith(
    ['note.md', 'note 20240102-030405.md'],
    { suffix: makeSuffix }
  );
  assert.equal(resolver('note.md'), 'note 20240102-030405-2.md');
});

test('timestampSuffix -3 when timestamp and -2 both collide', () => {
  const fixed = () => Date.UTC(2024, 0, 2, 3, 4, 5);
  const makeSuffix = (attempt) => timestampSuffix(attempt, fixed);
  const { resolver } = resolverWith(
    ['note.md', 'note 20240102-030405.md', 'note 20240102-030405-2.md'],
    { suffix: makeSuffix }
  );
  assert.equal(resolver('note.md'), 'note 20240102-030405-3.md');
});

test('createResolver requires an exists predicate', () => {
  assert.throws(() => createResolver({}), /exists/);
  assert.throws(() => createResolver(), /exists/);
});
