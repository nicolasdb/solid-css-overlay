// The guard is the only thing between a pod name and a hostname that no
// certificate covers. Each case here is a name that CSS 7.2 alone accepts.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PodNameGuard, podNameProblem } = require('../dist');

const reserved = new Set(['www', 'mcp']);
const source = {
  generate: (name) => ({ path: `https://${name.replaceAll(/\W/gu, '-').toLowerCase()}.example.org/` }),
  extractPod: (id) => ({ path: `pod-of:${id.path}` }),
};

test('accepts names that make a valid label, after CSS clean-up', () => {
  for (const name of ['openfab-bxl', 'a', 'atelier2', 'Atelier', 'Open Fab', 'x'.repeat(63)]) {
    assert.equal(podNameProblem(name, reserved), undefined, name);
  }
});

test('refuses an underscore: CSS keeps it, a hostname cannot', () => {
  assert.match(podNameProblem('open_fab', reserved), /cannot be a pod name/u);
});

test('refuses 64 characters and more', () => {
  assert.match(podNameProblem('x'.repeat(64), reserved), /63 characters at most \(this one has 64\)/u);
});

test('refuses a hyphen at either end, including one CSS made', () => {
  for (const name of ['-fab', 'fab-', 'fab!', ' fab.']) {
    assert.ok(podNameProblem(name, reserved), name);
  }
});

test('refuses reserved names, whatever their case', () => {
  assert.match(podNameProblem('WWW', reserved), /"www" is reserved/u);
  assert.match(podNameProblem('mcp', reserved), /reserved/u);
});

test('throws a 400 and never reaches the source generator', () => {
  let called = false;
  const guard = new PodNameGuard({ ...source, generate: () => { called = true; } }, ['www']);
  assert.throws(() => guard.generate('open_fab'), (error) => error.statusCode === 400);
  assert.equal(called, false);
});

test('passes a good name and extractPod through unchanged', () => {
  const guard = new PodNameGuard(source, ['www']);
  assert.deepEqual(guard.generate('openfab-bxl'), { path: 'https://openfab-bxl.example.org/' });
  assert.deepEqual(guard.extractPod({ path: 'p' }), { path: 'pod-of:p' });
});
