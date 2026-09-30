import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useParams } from 'react-router-dom';
import SearchCars from './SearchCars';

jest.mock('../Header/Header', () => () => null);
jest.mock('react-router-dom', () => ({ useParams: jest.fn() }));

const inventoryUrl = '/djangoapp/get_inventory/29';
const dealerUrl = '/djangoapp/dealer/29';
const dealer = { id: 29, full_name: 'Community Cars' };
const car = (id, details) => ({
  _id: id, dealer_id: 29, make: 'Audi', model: 'A6', year: 2022,
  mileage: 50000, price: 80000, ...details,
});
const cars = [
  car('match'),
  car('old', { year: 2020, mileage: 30000, price: 70000 }),
  car('high-mileage', { mileage: 50001, price: 70000 }),
  car('lower-price', { mileage: 20000, price: 60000 }),
  car('other-model', { model: 'A4', mileage: 10000, price: 65000 }),
  car('other-make', { make: 'BMW', model: 'M3', year: 2024, mileage: 5000, price: 75000 }),
  car('spaced-name', { make: 'Land Rover', model: 'Range Rover', year: 2023, mileage: 80000, price: 85000 }),
];
const response = data => ({ ok: true, status: 200, json: async () => ({ status: 200, ...data }) });
const originalFetch = global.fetch;

// These explicit server responses represent the Part 2 API: one filter per request.
const queryResults = {
  '?make=Audi': cars.slice(0, 5),
  '?make=BMW': [cars[5]],
  '?make=Land+Rover': [cars[6]],
  '?model=A6': cars.slice(0, 4),
  '?model=M3': [cars[5]],
  '?model=Range+Rover': [cars[6]],
  '?year=2021': [cars[0], ...cars.slice(2)],
  '?year=2024': [cars[5]],
  '?mileage=50000': [cars[0], cars[1], cars[3], cars[4], cars[5]],
  '?price=80000': [cars[0], cars[1], cars[2], cars[4], cars[5]],
};

function mockApi(records = cars, queries = queryResults) {
  global.fetch.mockImplementation(async url => {
    if (url === dealerUrl) return response({ dealer: [dealer] });
    const parsed = new URL(url, 'http://localhost');
    if (parsed.pathname !== inventoryUrl) throw new Error(`Unexpected request: ${url}`);
    const key = parsed.search ? `?${parsed.searchParams.toString()}` : '';
    if (key && !Object.prototype.hasOwnProperty.call(queries, key)) {
      throw new Error(`Unexpected inventory query: ${url}`);
    }
    return response({ cars: key ? queries[key] : records });
  });
}

const select = (label, value) => fireEvent.change(screen.getByRole('combobox', { name: label }), {
  target: { value },
});
const titles = () => screen.queryAllByRole('heading', { level: 2 }).map(heading => heading.textContent);
const inventoryRequests = () => global.fetch.mock.calls.map(([url]) => url)
  .filter(url => url.startsWith(inventoryUrl));
const waitForCars = () => waitFor(() => {
  expect(screen.queryByText(/Loading cars/i)).not.toBeInTheDocument();
});
async function renderLoaded(records = cars, queries = queryResults) {
  mockApi(records, queries);
  render(<SearchCars />);
  await screen.findByRole('heading', { level: 1, name: 'Cars at Community Cars' });
  await waitForCars();
}

beforeEach(() => {
  global.fetch = jest.fn();
  useParams.mockReturnValue({ id: '29' });
});

afterEach(() => {
  global.fetch = originalFetch;
  jest.clearAllMocks();
});

test('loads dealership inventory and exposes five labelled filters with stable unique options', async () => {
  await renderLoaded();
  expect(global.fetch.mock.calls.map(([url]) => url)).toEqual(expect.arrayContaining([dealerUrl, inventoryUrl]));
  expect(screen.getAllByRole('combobox')).toHaveLength(5);
  ['Make', 'Model', 'Year', 'Mileage', 'Price'].forEach(label => {
    expect(screen.getByRole('combobox', { name: label })).toHaveValue('all');
  });
  expect(screen.getAllByRole('article')).toHaveLength(cars.length);
  expect(within(screen.getByRole('combobox', { name: 'Make' })).getAllByRole('option', { name: 'Audi' })).toHaveLength(1);
  expect(within(screen.getByRole('combobox', { name: 'Model' })).getAllByRole('option', { name: 'A6' })).toHaveLength(1);

  select('Make', 'Audi');
  await waitForCars();
  expect(screen.getAllByRole('article')).toHaveLength(5);
  expect(within(screen.getByRole('combobox', { name: 'Make' })).getByRole('option', { name: 'BMW' })).toBeInTheDocument();
  expect(within(screen.getByRole('combobox', { name: 'Model' })).getByRole('option', { name: 'M3' })).toBeInTheDocument();
});

test('requests each of the five API filters and intersects them to reproduce the lab example', async () => {
  await renderLoaded();
  for (const [label, value] of [['Make', 'Audi'], ['Model', 'A6'], ['Year', '2021'], ['Mileage', '50000'], ['Price', '80000']]) {
    select(label, value);
    await waitForCars();
  }
  expect(inventoryRequests()).toEqual([
    inventoryUrl,
    `${inventoryUrl}?make=Audi`,
    `${inventoryUrl}?model=A6`,
    `${inventoryUrl}?year=2021`,
    `${inventoryUrl}?mileage=50000`,
    `${inventoryUrl}?price=80000`,
  ]);
  expect(titles()).toEqual(['Audi A6']);
  const result = screen.getByRole('article');
  expect(result).toHaveTextContent('2022');
  expect(result).toHaveTextContent(/50,?000/);
  expect(result).toHaveTextContent(/80,?000/);
});

test('encodes names in request parameters and infers a model’s unique make', async () => {
  await renderLoaded();
  select('Model', 'Range Rover');
  await waitForCars();
  expect(screen.getByRole('combobox', { name: 'Make' })).toHaveValue('Land Rover');
  expect(titles()).toEqual(['Land Rover Range Rover']);
  const request = new URL(inventoryRequests().at(-1), 'http://localhost');
  expect([...request.searchParams.entries()]).toEqual([['model', 'Range Rover']]);
  expect(inventoryRequests().at(-1)).not.toContain('Range Rover');

  select('Make', 'BMW');
  await waitForCars();
  expect(screen.getByRole('combobox', { name: 'Model' })).toHaveValue('all');
  expect(titles()).toEqual(['BMW M3']);
});

test('keeps shared model names usable without choosing an arbitrary make', async () => {
  const shared = [car('one', { make: 'Maker One', model: 'Shared' }), car('two', { make: 'Maker Two', model: 'Shared' })];
  await renderLoaded(shared, { '?model=Shared': shared });
  select('Model', 'Shared');
  await waitForCars();
  expect(screen.getByRole('combobox', { name: 'Make' })).toHaveValue('all');
  expect(titles()).toEqual(['Maker One Shared', 'Maker Two Shared']);
});

test('reports no matches, clears an individual filter with All, and resets the complete search', async () => {
  await renderLoaded();
  select('Make', 'Audi');
  await waitForCars();
  select('Year', '2024');
  await waitForCars();
  expect(screen.getByText('No cars found matching criteria.')).toBeInTheDocument();
  expect(screen.queryByRole('article')).not.toBeInTheDocument();
  expect(within(screen.getByRole('combobox', { name: 'Model' })).getByRole('option', { name: 'M3' })).toBeInTheDocument();

  select('Make', 'all');
  await waitForCars();
  expect(inventoryRequests().at(-1)).toBe(inventoryUrl);
  expect(screen.getByRole('combobox', { name: 'Year' })).toHaveValue('2024');
  expect(titles()).toEqual(['BMW M3']);
  expect(screen.queryByText('No cars found matching criteria.')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }));
  await waitForCars();
  screen.getAllByRole('combobox').forEach(filter => expect(filter).toHaveValue('all'));
  expect(screen.getAllByRole('article')).toHaveLength(cars.length);
  expect(inventoryRequests().at(-1)).toBe(inventoryUrl);
});

const mileageRecords = [0, 50000, 50001, 100000, 100001, 150000, 150001, 200000, 200001, 250000]
  .map(mileage => car(`mileage-${mileage}`, { model: `Distance ${mileage}`, mileage, price: 10000 }));
const mileageBuckets = [
  ['50000', [0, 1], ['Audi Distance 0', 'Audi Distance 50000']],
  ['100000', [2, 3], ['Audi Distance 50001', 'Audi Distance 100000']],
  ['150000', [4, 5], ['Audi Distance 100001', 'Audi Distance 150000']],
  ['200000', [6, 7], ['Audi Distance 150001', 'Audi Distance 200000']],
  ['200001', [8, 9], ['Audi Distance 200001', 'Audi Distance 250000']],
];

test.each(mileageBuckets)('keeps mileage bucket %s exact when a subsequent price query returns broader data', async (value, indexes, expected) => {
  await renderLoaded(mileageRecords, {
    [`?mileage=${value}`]: indexes.map(index => mileageRecords[index]),
    '?price=20000': mileageRecords,
  });
  select('Mileage', value);
  await waitForCars();
  expect(titles()).toEqual(expected);
  select('Price', '20000');
  await waitForCars();
  expect(titles()).toEqual(expected);
});

const priceRecords = [0, 20000, 20001, 40000, 40001, 60000, 60001, 80000, 80001, 100000]
  .map(price => car(`price-${price}`, { model: `Cost ${price}`, mileage: 0, price }));
const priceBuckets = [
  ['20000', [0, 1], ['Audi Cost 0', 'Audi Cost 20000']],
  ['40000', [2, 3], ['Audi Cost 20001', 'Audi Cost 40000']],
  ['60000', [4, 5], ['Audi Cost 40001', 'Audi Cost 60000']],
  ['80000', [6, 7], ['Audi Cost 60001', 'Audi Cost 80000']],
  ['80001', [8, 9], ['Audi Cost 80001', 'Audi Cost 100000']],
];

test.each(priceBuckets)('keeps price bucket %s exact when a subsequent mileage query returns broader data', async (value, indexes, expected) => {
  await renderLoaded(priceRecords, {
    [`?price=${value}`]: indexes.map(index => priceRecords[index]),
    '?mileage=50000': priceRecords,
  });
  select('Price', value);
  await waitForCars();
  expect(titles()).toEqual(expected);
  select('Mileage', '50000');
  await waitForCars();
  expect(titles()).toEqual(expected);
});

test.each([
  ['HTTP failure', () => Promise.resolve({ ok: false, status: 502 })],
  ['network failure', () => Promise.reject(new Error('Connection unavailable'))],
  ['invalid JSON', () => Promise.resolve({ ok: true, status: 200, json: async () => { throw new SyntaxError('Invalid JSON'); } })],
  ['application failure', () => Promise.resolve(response({ status: 502, error: 'Inventory unavailable' }))],
  ['malformed inventory', () => Promise.resolve(response({ cars: {} }))],
])('shows and recovers from %s without reloading the page', async (_description, failure) => {
  let inventoryFailed = true;
  global.fetch.mockImplementation(url => {
    if (url === dealerUrl) return Promise.resolve(response({ dealer: [dealer] }));
    return inventoryFailed ? failure() : Promise.resolve(response({ cars }));
  });
  render(<SearchCars />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load cars');
  expect(screen.queryByText('No cars are available at this dealership.')).not.toBeInTheDocument();
  expect(screen.queryByText(/Loading cars/i)).not.toBeInTheDocument();
  inventoryFailed = false;
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await waitForCars();
  expect(screen.getAllByRole('article')).toHaveLength(cars.length);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('retries a failed filter request with the current selections intact', async () => {
  await renderLoaded();
  select('Make', 'Audi');
  await waitForCars();
  global.fetch.mockResolvedValueOnce({ ok: false, status: 503 });
  select('Year', '2021');
  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load cars');
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await waitForCars();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Make' })).toHaveValue('Audi');
  expect(screen.getByRole('combobox', { name: 'Year' })).toHaveValue('2021');
  expect(titles()).toEqual(['Audi A6', 'Audi A6', 'Audi A6', 'Audi A4']);
  expect(inventoryRequests().slice(-2)).toEqual([`${inventoryUrl}?year=2021`, `${inventoryUrl}?year=2021`]);
});

test('distinguishes a dealership with no inventory from a failed inventory service', async () => {
  await renderLoaded([], {});
  expect(screen.getByText('No cars are available at this dealership.')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.queryByRole('article')).not.toBeInTheDocument();
});

test('handles an unknown dealership without crashing or inventing its name', async () => {
  global.fetch.mockImplementation(async url => response(url === dealerUrl ? { dealer: [] } : { cars: [] }));
  render(<SearchCars />);
  expect(await screen.findByRole('alert')).toHaveTextContent(/dealership|dealer/i);
  expect(screen.queryByText(/Cars at undefined/)).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 1, name: 'Car inventory' })).toBeInTheDocument();
  expect(screen.queryByRole('article')).not.toBeInTheDocument();
});

test('ignores a slow previous response after a newer make selection finishes', async () => {
  await renderLoaded();
  let resolveOlder;
  global.fetch.mockImplementationOnce(() => new Promise(resolve => { resolveOlder = resolve; }));
  select('Make', 'Audi');
  select('Make', 'BMW');
  await waitForCars();
  expect(titles()).toEqual(['BMW M3']);
  await act(async () => { resolveOlder(response({ cars: queryResults['?make=Audi'] })); });
  expect(screen.getByRole('combobox', { name: 'Make' })).toHaveValue('BMW');
  expect(titles()).toEqual(['BMW M3']);
});

test('ignores an outstanding filter response after Reset filters completes', async () => {
  await renderLoaded();
  let resolveOlder;
  global.fetch.mockImplementationOnce(() => new Promise(resolve => { resolveOlder = resolve; }));
  select('Make', 'Audi');
  fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }));
  await waitForCars();
  expect(screen.getAllByRole('article')).toHaveLength(cars.length);
  await act(async () => { resolveOlder(response({ cars: queryResults['?make=Audi'] })); });
  screen.getAllByRole('combobox').forEach(filter => expect(filter).toHaveValue('all'));
  expect(screen.getAllByRole('article')).toHaveLength(cars.length);
});
