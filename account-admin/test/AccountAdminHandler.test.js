// What the admin route must get right, on fake stores: that only the token
// opens it, and the deletion order (pod contents through the store, the root
// through the accessor, the account record last), because a pod root left
// behind keeps its name taken and an account deleted first leaves pods
// nobody can reach.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { NotFoundHttpError } = require('@solid/community-server');
const { AccountAdminHandler } = require('../dist');

const POD = 'https://gone.example.org/';
const TOKEN = 't'.repeat(43);

// A pod as the file backend lists it: containers end in '/', .acl files are
// listed as children, .meta files are not.
function makeWorld({ failOn, token = TOKEN } = {}) {
  const tree = {
    [POD]: [`${POD}.acl`, `${POD}profile/`, `${POD}README`, `${POD}README.acl`],
    [`${POD}profile/`]: [`${POD}profile/card`],
  };
  const log = [];
  const logins = {
    keep: [{ id: 'l2', email: 'keep@example.org' }],
    target: [{ id: 'l3', email: 'gone@example.org' }],
    halfway: [],
  };
  const world = {
    log,
    accountStorage: {
      delete: async (type, id) => { log.push(`account:${type}:${id}`); },
      has: async (type, id) => type === 'account' && id in logins,
      entries: async function* (type) {
        assert.equal(type, 'account');
        for (const id of Object.keys(logins)) {
          yield { id, rememberLogin: false };
        }
      },
    },
    passwordStore: {
      findByAccount: async (id) => logins[id] ?? [],
      findByEmail: async (email) => {
        const entry = Object.entries(logins).find(([, list]) => list.some((login) => login.email === email));
        return entry && { accountId: entry[0], id: 'x' };
      },
    },
    podStore: { findPods: async (id) => (id === 'target' ? [{ id: 'p1', baseUrl: POD }] : []) },
    webIdStore: { findLinks: async (id) => (id === 'target' ? [{ id: 'w1', webId: `${POD}profile/card#me` }] : []) },
    store: {
      deleteResource: async ({ path }) => {
        if (path === failOn) {
          throw new Error('disk full');
        }
        if (path.endsWith('.acl')) {
          // The store removes an auxiliary with its subject; never asked alone here.
          throw new Error(`asked to delete auxiliary ${path}`);
        }
        log.push(`store:${path}`);
      },
    },
    accessor: {
      getChildren: async function* ({ path }) {
        for (const child of tree[path] ?? []) {
          yield { identifier: { value: child } };
        }
      },
      deleteResource: async ({ path }) => { log.push(`accessor:${path}`); },
    },
    auxiliaryStrategy: { isAuxiliaryIdentifier: ({ path }) => path.endsWith('.acl') },
    locker: {
      withWriteLock: async ({ path }, fn) => {
        log.push(`lock:${path}`);
        const result = await fn();
        log.push(`unlock:${path}`);
        return result;
      },
    },
  };
  world.handler = new AccountAdminHandler(
    world.accountStorage, world.passwordStore, world.podStore, world.webIdStore,
    world.store, world.accessor, world.auxiliaryStrategy, world.locker, token,
  );
  return world;
}

const call = (world, json) => world.handler.handle({ json, method: 'POST', target: { path: 'x' } });

test('refuses a wrong, missing or same-length-but-different token (403), and deletes nothing', async () => {
  const world = makeWorld();
  for (const token of [undefined, '', 'nope', 'u'.repeat(43), 42]) {
    await assert.rejects(call(world, { token, action: 'delete', email: 'gone@example.org' }),
      (error) => error.statusCode === 403, String(token));
  }
  assert.deepEqual(world.log, []);
});

test('a configured token shorter than 32 characters refuses everyone, even when it is sent back', async () => {
  for (const token of ['', 'short']) {
    const world = makeWorld({ token });
    await assert.rejects(call(world, { token, action: 'list' }), (error) => error.statusCode === 403);
  }
});

test('lists every account with its logins, pods and WebIDs, a halfway sign-up included', async () => {
  const { json } = await call(makeWorld(), { token: TOKEN, action: 'list' });
  assert.deepEqual(json.accounts, [
    { accountId: 'keep', emails: ['keep@example.org'], pods: [], webIds: [] },
    { accountId: 'target', emails: ['gone@example.org'], pods: [POD], webIds: [`${POD}profile/card#me`] },
    { accountId: 'halfway', emails: [], pods: [], webIds: [] },
  ]);
});

test('deletes contents depth first through the store, the root through the accessor, the account last', async () => {
  const world = makeWorld();
  const result = await call(world, { token: TOKEN, action: 'delete', email: 'Gone@Example.org ' });
  assert.deepEqual(world.log, [
    `store:${POD}profile/card`,
    `store:${POD}profile/`,
    `store:${POD}README`,
    `lock:${POD}`,
    `accessor:${POD}`,
    `unlock:${POD}`,
    'account:account:target',
  ]);
  assert.deepEqual(result.json.deleted, {
    accountId: 'target',
    emails: ['gone@example.org'],
    pods: [POD],
    webIds: [`${POD}profile/card#me`],
  });
});

test('deletes an account without a login by its id', async () => {
  const world = makeWorld();
  await call(world, { token: TOKEN, action: 'delete', accountId: 'halfway' });
  assert.deepEqual(world.log, ['account:account:halfway']);
});

test('a failure inside a pod leaves the account in place, so the call can run again', async () => {
  const world = makeWorld({ failOn: `${POD}README` });
  await assert.rejects(call(world, { token: TOKEN, action: 'delete', email: 'gone@example.org' }), /disk full/u);
  assert.ok(!world.log.some((entry) => entry.startsWith('account:')));
  assert.ok(!world.log.some((entry) => entry.startsWith('accessor:')));
});

test('a resource already gone is not an error', async () => {
  const world = makeWorld();
  world.store.deleteResource = async ({ path }) => {
    if (path.endsWith('README')) {
      throw new NotFoundHttpError();
    }
    world.log.push(`store:${path}`);
  };
  await call(world, { token: TOKEN, action: 'delete', email: 'gone@example.org' });
  assert.equal(world.log.at(-1), 'account:account:target');
});

test('unknown email or id is a 404; no target or no action is a 400', async () => {
  const world = makeWorld();
  await assert.rejects(call(world, { token: TOKEN, action: 'delete', email: 'nobody@example.org' }),
    (error) => error.statusCode === 404);
  await assert.rejects(call(world, { token: TOKEN, action: 'delete', accountId: 'nope' }),
    (error) => error.statusCode === 404);
  await assert.rejects(call(world, { token: TOKEN, action: 'delete' }), (error) => error.statusCode === 400);
  await assert.rejects(call(world, { token: TOKEN }), (error) => error.statusCode === 400);
});
