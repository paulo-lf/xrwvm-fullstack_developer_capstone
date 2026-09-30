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

test('matches state substrings regardless of case and restores all dealerships without refetching', async () => {
  global.fetch.mockResolvedValue(response({ dealers }));
  useSession.mockReturnValue({ user: { userName: 'reviewer' } });
  render(<Dealers />);
  expect(screen.getByRole('status')).toHaveTextContent('Loading dealerships');
  expect(await screen.findByRole('link', { name: 'Texas Cars' })).toBeInTheDocument();
  const filter = screen.getByRole('textbox', { name: 'Filter dealerships by state' });
  expect(filter).toHaveAttribute('placeholder', 'Search states...');

  fireEvent.change(filter, { target: { value: 'fOrN' } });
  expect(screen.getByRole('link', { name: 'California Cars' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Texas Cars' })).not.toBeInTheDocument();

  fireEvent.change(filter, { target: { value: 'xA' } });
  fireEvent.blur(filter);
  expect(filter).toHaveValue('xA');
  expect(screen.getByRole('link', { name: 'Texas Cars' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'California Cars' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Review Texas Cars' })).toHaveAttribute('href', '/postreview/2');

  fireEvent.change(filter, { target: { value: 'a' } });
  expect(screen.getByRole('link', { name: 'California Cars' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Texas Cars' })).toBeInTheDocument();

  fireEvent.change(filter, { target: { value: 'Texas' } });
  fireEvent.change(filter, { target: { value: '' } });
  expect(screen.getByRole('link', { name: 'California Cars' })).toBeInTheDocument();
  fireEvent.blur(filter);
  expect(screen.getByRole('link', { name: 'California Cars' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Texas Cars' })).toBeInTheDocument();
  expect(global.fetch.mock.calls.map(([url]) => url)).toEqual(['/djangoapp/get_dealers']);
});

test('shows an empty result for unmatched states and allows searching again', async () => {
  global.fetch.mockResolvedValue(response({ dealers }));
  render(<Dealers />);
  await screen.findByRole('link', { name: 'Texas Cars' });
  const filter = screen.getByRole('textbox', { name: 'Filter dealerships by state' });
  fireEvent.change(filter, { target: { value: 'Atlantis' } });
  fireEvent.blur(filter);
  expect(screen.getByText('No dealerships found for this state.')).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'California Cars' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Texas Cars' })).not.toBeInTheDocument();

  fireEvent.change(filter, { target: { value: 'tex' } });
  expect(screen.getByRole('link', { name: 'Texas Cars' })).toBeInTheDocument();
  expect(screen.queryByText('No dealerships found for this state.')).not.toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test('applies the latest search when dealerships finish loading', async () => {
  let resolveDealers;
  global.fetch.mockReturnValue(new Promise(resolve => { resolveDealers = resolve; }));
  render(<Dealers />);
  const filter = screen.getByRole('textbox', { name: 'Filter dealerships by state' });
  fireEvent.change(filter, { target: { value: 'cal' } });
  fireEvent.change(filter, { target: { value: 'tex' } });
  expect(screen.getByRole('status')).toHaveTextContent('Loading dealerships');
  await act(async () => { resolveDealers(response({ dealers })); });
  expect(screen.queryByRole('link', { name: 'California Cars' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Texas Cars' })).toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test('shows an HTTP failure and retries without requiring a page refresh', async () => {
  global.fetch.mockResolvedValueOnce({ ok: false, status: 502 })
    .mockResolvedValueOnce(response({ dealers }));
  render(<Dealers />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load dealerships');
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'tex' } });
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('link', { name: 'Texas Cars' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'California Cars' })).not.toBeInTheDocument();
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
  expect(screen.getByRole('link', { name: 'Search Cars' })).toHaveAttribute('href', '/searchcars/1');
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
  expect(screen.getByRole('link', { name: 'Search Cars' })).toHaveAttribute('href', '/searchcars/1');
  reviewsFail = false;
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(screen.getByText(/No reviews yet/)).toBeInTheDocument());
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
