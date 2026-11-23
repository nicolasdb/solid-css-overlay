// CSS issue #2297, the fix carried in css-patches/ (solid-kit ADR 014).
// Run with the node of an image, against that image's own CSS:
//
//   docker run --rm -v "$PWD/test:/t:ro" --entrypoint node <image> /t/lock-wrapper.cjs
//
// Exit 0: the fix is in. Exit 2: the bug is there (what stock 7.3.0 must give;
// CI checks both, so this test is known to catch it). Exit 1: the test itself
// broke. What it reproduces: a read lock that expires after 300 ms here (6 s
// on a server), over a stream that keeps producing for longer than that, read
// with `for await` the way JsonResourceStorage reads a container listing in
// the hourly cleanup. Stock wraps the stream with Object.create, the iterator
// sees no event, the lock expires and destroy() throws "callback is not a
// function" outside any handler: on a server, the process stops.
'use strict';
const { Readable } = require('node:stream');
const dist = '/community-server/dist';
const { LockingResourceStore } = require(`${dist}/storage/LockingResourceStore`);
const { WrappedExpiringReadWriteLocker } = require(`${dist}/util/locking/WrappedExpiringReadWriteLocker`);
const { EqualReadWriteLocker } = require(`${dist}/util/locking/EqualReadWriteLocker`);
const { MemoryResourceLocker } = require(`${dist}/util/locking/MemoryResourceLocker`);
const { guardStream } = require(`${dist}/util/GuardedStream`);
const { setGlobalLoggerFactory } = require(`${dist}/logging/LogUtil`);
const { VoidLoggerFactory } = require(`${dist}/logging/VoidLoggerFactory`);
setGlobalLoggerFactory(new VoidLoggerFactory());

const EXPIRATION = 300; const STEP = 100; const CHUNKS = 8; // 800 ms of data
const failures = [];
const uncaught = [];
process.on('uncaughtException', (e) => uncaught.push(String(e && e.message || e)));
process.on('unhandledRejection', (e) => uncaught.push(String(e && e.message || e)));

function slowStream() {
  let count = 0;
  return guardStream(new Readable({
    read() {
      setTimeout(() => { this.push(count < CHUNKS ? `${count}` : null); count += 1; }, STEP);
    },
  }));
}
const expected = Array.from({ length: CHUNKS }, (_, i) => `${i}`).join(',');
function within(ms, promise) {
  return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error(`no end after ${ms} ms`)), ms))]);
}
function makeStore(source) {
  const locker = new WrappedExpiringReadWriteLocker(new EqualReadWriteLocker(new MemoryResourceLocker()), EXPIRATION);
  return new LockingResourceStore(source, locker, { isAuxiliaryIdentifier: () => false });
}

async function check(name, run) {
  try { await run(); console.log(`ok    ${name}`); }
  catch (e) { failures.push(name); console.log(`FAIL  ${name}: ${e.message}`); }
}

(async () => {
  await check('read, for await (the hourly cleanup)', async () => {
    const data = slowStream(); const originalRead = data.read;
    const store = makeStore({ getRepresentation: async () => ({ data, metadata: {} }) });
    const rep = await store.getRepresentation({ path: 'http://x/a/' }, {});
    const chunks = [];
    await within(3000, (async () => { for await (const c of rep.data) chunks.push(c.toString()); })());
    if (chunks.join(',') !== expected) throw new Error(`got [${chunks}]`);
    await new Promise((r) => setTimeout(r, 50));
    if (data.read !== originalRead) throw new Error('read not restored after the lock');
  });

  await check('read, data listener', async () => {
    const data = slowStream();
    const store = makeStore({ getRepresentation: async () => ({ data, metadata: {} }) });
    const rep = await store.getRepresentation({ path: 'http://x/b/' }, {});
    const chunks = [];
    await within(3000, new Promise((res, rej) => {
      rep.data.on('data', (c) => chunks.push(c.toString()));
      rep.data.on('end', res); rep.data.on('error', rej);
    }));
    if (chunks.join(',') !== expected) throw new Error(`got [${chunks}]`);
  });

  await check('write, for await on the input', async () => {
    const data = slowStream(); const originalRead = data.read;
    const chunks = [];
    const store = makeStore({ setRepresentation: async (id, rep) => { for await (const c of rep.data) chunks.push(c.toString()); return []; } });
    await within(3000, store.setRepresentation({ path: 'http://x/c' }, { data, metadata: {} }));
    if (chunks.join(',') !== expected) throw new Error(`got [${chunks}]`);
    if (data.read !== originalRead) throw new Error('read not restored after the lock');
  });

  await new Promise((r) => setTimeout(r, EXPIRATION + 200)); // a late expiry would show now
  if (uncaught.length > 0) { failures.push('uncaught'); console.log(`FAIL  uncaught: ${[...new Set(uncaught)].join(' | ')}`); }
  console.log(failures.length ? `#2297 present: ${failures.length} failed` : '#2297 fixed: all passed');
  process.exit(failures.length ? 2 : 0);
})().catch((e) => { console.log(`test broke: ${e.stack}`); process.exit(1); });
