// What the admin route must get right, on fake stores: who may call it, and
// the order (pod contents through the store, the root through the accessor,
// the account record last), because a pod root left behind keeps its name
// taken and an account deleted first leaves pods nobody can reach.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { NotFoundHttpError } = require('@solid/community-server');
const { AdminDeleteAccountHandler } = require('../dist');

const POD = 'https://gone.example.org/';

// A pod as the file backend lists it: containers end in '/', .acl files are
// listed as children, .meta files are not.
function makeWorld({ failOn } = {}) {
  const tree = {
    [POD]: [`${POD}.acl`, `${POD}profile/`, `${POD}README`, `${POD}README.acl`],
    [`${POD}profile/`]: [`${POD}profile/card`],
  };
  const log = [];
  const logins = {
    admin: [{ id: 'l1', email: 'admin@example.org' }],
    bob: [{ id: 'l2', email: 'bob@example.org' }],
    target: [{ id: 'l3', email: 'gone@example.org' }],
  };
  const world = {
    log,
    accountStorage: { delete: async (type, id) => { log.push(`account:${type}:${id}`); } },
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
  world.handler = new AdminDeleteAccountHandler(
    world.accountStorage, world.passwordStore, world.podStore, world.webIdStore,
    world.store, world.accessor, world.auxiliaryStrategy, world.locker,
    [' Admin@Example.org '],
  );
  return world;
}

const call = (world, accountId, json) => world.handler.handle({ accountId, json, method: 'POST', target: { path: 'x' } });

test('refuses a caller who is not signed in (401)', async () => {
  const world = makeWorld();
  await assert.rejects(call(world, undefined, { email: 'gone@example.org' }), (error) => error.statusCode === 401);
  assert.deepEqual(world.log, []);
});

test('refuses a signed-in account that is not an admin (403), and deletes nothing', async () => {
  const world = makeWorld();
  await assert.rejects(call(world, 'bob', { email: 'gone@example.org' }), (error) => error.statusCode === 403);
  assert.deepEqual(world.log, []);
});

test('an empty admin list lets nobody in', async () => {
  const world = makeWorld();
  const handler = new AdminDeleteAccountHandler(
    world.accountStorage, world.passwordStore, world.podStore, world.webIdStore,
    world.store, world.accessor, world.auxiliaryStrategy, world.locker, [],
  );
  await assert.rejects(handler.handle({ accountId: 'admin', json: { email: 'gone@example.org' } }),
    (error) => error.statusCode === 403);
});

test('deletes contents depth first through the store, the root through the accessor, the account last', async () => {
  const world = makeWorld();
  const result = await call(world, 'admin', { email: 'gone@example.org' });
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

test('a failure inside a pod leaves the account in place, so the call can run again', async () => {
  const world = makeWorld({ failOn: `${POD}README` });
  await assert.rejects(call(world, 'admin', { email: 'gone@example.org' }), /disk full/u);
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
  await call(world, 'admin', { email: 'gone@example.org' });
  assert.equal(world.log.at(-1), 'account:account:target');
});

test('an admin cannot delete their own account here', async () => {
  const world = makeWorld();
  await assert.rejects(call(world, 'admin', { email: 'admin@example.org' }), (error) => error.statusCode === 400);
  assert.deepEqual(world.log, []);
});

test('an unknown email is a 404; no target is a 400', async () => {
  const world = makeWorld();
  await assert.rejects(call(world, 'admin', { email: 'nobody@example.org' }), (error) => error.statusCode === 404);
  await assert.rejects(call(world, 'admin', {}), (error) => error.statusCode === 400);
});
