const assert = require('node:assert/strict');
const { test } = require('node:test');
const { mkdtemp, writeFile, rm } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const { createApp, seedInventory, startServer } = require('../app');
const Cars = require('../inventory');

async function serve(t, carsModel) {
  const server = await new Promise((resolve) => {
    const listener = createApp(carsModel).listen(0, '127.0.0.1', () => resolve(listener));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

async function seedFile(t, data) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'car-inventory-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const filename = path.join(directory, 'cars.json');
  await writeFile(filename, JSON.stringify(data));
  return filename;
}

test('root responds with the lab welcome message and allows browser requests', async (t) => {
  const base = await serve(t, {});
  const response = await fetch(base);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'Welcome to the Mongoose API');
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
});

test('dealer, make, model, and inclusive year routes query the selected dealer', async (t) => {
  const queries = [];
  const cars = [{ dealer_id: 7, make: 'Land Rover', model: 'Range Rover', year: 2022 }];
  const base = await serve(t, { find: async (query) => { queries.push(query); return cars; } });
  const cases = [
    ['/cars/7', { dealer_id: 7 }],
    ['/carsbymake/7/Land%20Rover', { dealer_id: 7, make: 'Land Rover' }],
    ['/carsbymodel/7/Range%20Rover', { dealer_id: 7, model: 'Range Rover' }],
    ['/carsbyyear/7/2022', { dealer_id: 7, year: { $gte: 2022 } }],
  ];
  for (const [endpoint, query] of cases) {
    const response = await fetch(base + endpoint);
    assert.equal(response.status, 200, endpoint);
    assert.deepEqual(await response.json(), cars);
    assert.deepEqual(queries.at(-1), query, endpoint);
  }
});

test('invalid IDs and years return 400 without querying MongoDB', async (t) => {
  let queries = 0;
  const base = await serve(t, { find: async () => { queries += 1; return []; } });
  const paths = [
    '/cars/nope', '/cars/0', '/cars/-1', '/cars/1.5', '/cars/1e3',
    '/cars/9007199254740992', '/carsbyyear/1/2022x', '/carsbyyear/1/-2022',
    '/carsbyyear/1/999', '/carsbyyear/1/10000',
    '/carsbymaxmileage/1/0', '/carsbymaxmileage/1/50000x',
    '/carsbymaxmileage/1/200002', '/carsbymaxmileage/1/55000',
    '/carsbyprice/1/0', '/carsbyprice/1/80002', '/carsbyprice/1/45000',
  ];
  for (const endpoint of paths) {
    const response = await fetch(base + endpoint);
    assert.equal(response.status, 400, endpoint);
    assert.ok((await response.json()).error);
  }
  assert.equal(queries, 0);
});

test('mileage and price selectors use disjoint bands with exact boundaries', async (t) => {
  const queries = [];
  const base = await serve(t, { find: async (query) => { queries.push(query); return []; } });
  const cases = [
    ['carsbymaxmileage', 'mileage', 50000, { $lte: 50000 }],
    ['carsbymaxmileage', 'mileage', 100000, { $gt: 50000, $lte: 100000 }],
    ['carsbymaxmileage', 'mileage', 150000, { $gt: 100000, $lte: 150000 }],
    ['carsbymaxmileage', 'mileage', 200000, { $gt: 150000, $lte: 200000 }],
    ['carsbymaxmileage', 'mileage', 200001, { $gt: 200000 }],
    ['carsbyprice', 'price', 20000, { $lte: 20000 }],
    ['carsbyprice', 'price', 40000, { $gt: 20000, $lte: 40000 }],
    ['carsbyprice', 'price', 60000, { $gt: 40000, $lte: 60000 }],
    ['carsbyprice', 'price', 80000, { $gt: 60000, $lte: 80000 }],
    ['carsbyprice', 'price', 80001, { $gt: 80000 }],
  ];
  for (const [route, field, selector, range] of cases) {
    const response = await fetch(`${base}/${route}/7/${selector}`);
    assert.equal(response.status, 200);
    assert.deepEqual(queries.at(-1), { dealer_id: 7, [field]: range });
  }
});

test('a dealer without matching cars returns an empty array', async (t) => {
  const base = await serve(t, { find: async () => [] });
  const response = await fetch(`${base}/cars/9999`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), []);
});

test('database failures return a generic JSON 500 response', async (t) => {
  t.mock.method(console, 'error', () => {});
  const base = await serve(t, { find: async () => { throw new Error('private database details'); } });
  const response = await fetch(`${base}/cars/1`);
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: 'Error fetching car inventory' });
});

test('schema preserves all seven fields, including price', async () => {
  const record = new Cars({
    dealer_id: 1, make: 'Nissan', model: 'Pathfinder', bodyType: 'SUV',
    year: 2023, mileage: 15000, price: 30000,
  });
  await record.validate();
  assert.equal(record.price, 30000);
  assert.equal(Cars.collection.name, 'cars');
  record.price = -1;
  await assert.rejects(record.validate(), /price/);
});

test('empty collections are seeded once and existing inventory is preserved', async (t) => {
  const cars = [{ dealer_id: 1, price: 30000 }];
  const filename = await seedFile(t, { cars });
  const inserted = [];
  const model = {
    countDocuments: async () => inserted.length,
    insertMany: async (records) => inserted.push(...records),
  };
  assert.equal(await seedInventory(model, filename), 1);
  assert.deepEqual(inserted, cars);
  // Existing data does not depend on the seed file remaining readable.
  assert.equal(await seedInventory(model, '/missing-seed.json'), 0);
  assert.deepEqual(inserted, cars);
});

test('invalid seed data prevents an empty inventory from silently starting', async (t) => {
  const filename = await seedFile(t, { cars: [] });
  await assert.rejects(seedInventory({ countDocuments: async () => 0 }, filename), /non-empty cars array/);
});

test('startup connects and awaits seeding before serving requests', async (t) => {
  t.mock.method(console, 'log', () => {});
  const events = [];
  const filename = await seedFile(t, { cars: [{ dealer_id: 1 }] });
  const model = {
    countDocuments: async () => { events.push('count'); return 0; },
    insertMany: async () => { events.push('seed'); },
    find: async () => [],
  };
  const connection = {
    connect: async (uri) => { assert.equal(uri, 'mongodb://example/cars'); events.push('connect'); },
    disconnect: async () => { events.push('disconnect'); },
  };
  const server = await startServer({ port: 0, host: '127.0.0.1', mongoUri: 'mongodb://example/cars', carsModel: model, connection, seedPath: filename });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  assert.deepEqual(events, ['connect', 'count', 'seed']);
  assert.equal((await fetch(`http://127.0.0.1:${server.address().port}/cars/1`)).status, 200);
});

test('startup failure closes the database connection and propagates the error', async () => {
  const events = [];
  const connection = {
    connect: async () => { events.push('connect'); },
    disconnect: async () => { events.push('disconnect'); },
  };
  await assert.rejects(startServer({
    port: 0, connection,
    carsModel: { countDocuments: async () => { throw new Error('database unavailable'); } },
  }), /database unavailable/);
  assert.deepEqual(events, ['connect', 'disconnect']);
});
