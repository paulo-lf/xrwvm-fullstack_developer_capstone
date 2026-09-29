import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import Dealers from './Dealers';
import Dealer from './Dealer';
import useSession from '../../hooks/useSession';

jest.mock('../Header/Header', () => () => null);
jest.mock('../../hooks/useSession', () => jest.fn());
jest.mock('react-router-dom', () => ({ useParams: () => ({ id: '1' }) }));

const dealers = [
  { id: 1, full_name: 'California Cars', state: 'California', city: 'Oakland', address: '1 Main Street', zip: '94612' },
  { id: 2, full_name: 'Texas Cars', state: 'Texas', city: 'Austin', address: '2 Main Street', zip: '78701' },
];
const response = data => ({ ok: true, status: 200, json: async () => ({ status: 200, ...data }) });
const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = jest.fn();
  useSession.mockReturnValue({ user: null, loading: false, error: '' });
});

afterEach(() => {
  global.fetch = originalFetch;
  jest.clearAllMocks();
});

test('switches states repeatedly and restores all dealerships', async () => {
  global.fetch.mockImplementation(async url => response({
    dealers: url === '/djangoapp/get_dealers' ? dealers : dealers.filter(dealer => url.endsWith(dealer.state)),
  }));
  useSession.mockReturnValue({ user: { userName: 'reviewer' } });
  render(<Dealers />);
  expect(screen.getByRole('status')).toHaveTextContent('Loading dealerships');
  expect(await screen.findByRole('link', { name: 'Texas Cars' })).toBeInTheDocument();
  const filter = screen.getByRole('combobox', { name: 'Filter dealerships by state' });

  fireEvent.change(filter, { target: { value: 'California' } });
  expect(await screen.findByRole('link', { name: 'California Cars' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Texas Cars' })).not.toBeInTheDocument();

  fireEvent.change(filter, { target: { value: 'Texas' } });
  expect(await screen.findByRole('link', { name: 'Texas Cars' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'California Cars' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Review Texas Cars' })).toHaveAttribute('href', '/postreview/2');

  fireEvent.change(filter, { target: { value: 'All' } });
  expect(await screen.findByRole('link', { name: 'California Cars' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Texas Cars' })).toBeInTheDocument();
  expect(global.fetch.mock.calls.map(([url]) => url)).toEqual([
    '/djangoapp/get_dealers', '/djangoapp/get_dealers/California', '/djangoapp/get_dealers/Texas', '/djangoapp/get_dealers',
  ]);
});

test('an obsolete state response cannot replace the latest selection', async () => {
  let resolveCalifornia;
  let californiaSignal;
  global.fetch.mockImplementation((url, options) => {
    if (url.endsWith('/California')) {
      californiaSignal = options.signal;
      return new Promise(resolve => { resolveCalifornia = resolve; });
    }
    return Promise.resolve(response({ dealers: url.endsWith('/Texas') ? [dealers[1]] : dealers }));
  });
  render(<Dealers />);
  await screen.findByRole('link', { name: 'Texas Cars' });
  const filter = screen.getByRole('combobox');
  fireEvent.change(filter, { target: { value: 'California' } });
  fireEvent.change(filter, { target: { value: 'Texas' } });
  await screen.findByRole('link', { name: 'Texas Cars' });
  expect(californiaSignal.aborted).toBe(true);
  await act(async () => { resolveCalifornia(response({ dealers: [dealers[0]] })); });
  expect(screen.queryByRole('link', { name: 'California Cars' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Texas Cars' })).toBeInTheDocument();
});

test('shows an HTTP failure and retries without requiring a page refresh', async () => {
  global.fetch.mockResolvedValueOnce({ ok: false, status: 502 })
    .mockResolvedValueOnce(response({ dealers }));
  render(<Dealers />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load dealerships');
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('link', { name: 'California Cars' })).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.queryByRole('columnheader', { name: 'Review Dealer' })).not.toBeInTheDocument();
});

test('shows dealer reviews, sentiment, purchase details, and the signed-in review link', async () => {
  useSession.mockReturnValue({ user: { userName: 'reviewer' } });
  global.fetch.mockImplementation(async url => response(url.includes('/reviews/') ? {
    reviews: [{ id: 10, name: 'Alex', review: 'Excellent service.', sentiment: 'positive', purchase: true, car_year: 2024, car_make: 'Land Rover', car_model: 'Range Rover' }],
  } : { dealer: [dealers[0]] }));
  render(<Dealer />);
  expect(await screen.findByRole('heading', { name: 'California Cars' })).toBeInTheDocument();
  expect(await screen.findByText('Excellent service.')).toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'positive sentiment' })).toBeInTheDocument();
  expect(screen.getByText('2024 Land Rover Range Rover')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Post Review' })).toHaveAttribute('href', '/postreview/1');
});

test('distinguishes a review service failure from a dealership with no reviews', async () => {
  let reviewsFail = true;
  global.fetch.mockImplementation(async url => url.includes('/reviews/')
    ? reviewsFail ? { ok: false, status: 502 } : response({ reviews: [] })
    : response({ dealer: [dealers[0]] }));
  render(<Dealer />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load reviews');
  expect(screen.queryByText(/No reviews yet/)).not.toBeInTheDocument();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Post Review' })).not.toBeInTheDocument();
  reviewsFail = false;
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(screen.getByText(/No reviews yet/)).toBeInTheDocument());
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
