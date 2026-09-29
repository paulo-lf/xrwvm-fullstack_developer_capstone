import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PostReview from './PostReview';

jest.mock('../Header/Header', () => () => null);

const originalFetch = global.fetch;
const response = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });
let authenticated;
let saveResponse;

beforeEach(() => {
  authenticated = true;
  saveResponse = Promise.resolve(response({ status: 200, message: 'Review posted.' }));
  sessionStorage.clear();
  document.cookie = 'csrftoken=review-csrf-token; path=/';
  global.fetch = jest.fn((url) => {
    if (url === '/djangoapp/session') return Promise.resolve(response({ authenticated, userName: authenticated ? 'reviewer' : '' }));
    if (url === '/djangoapp/dealer/7') return Promise.resolve(response({ status: 200, dealer: [{ id: 7, full_name: 'City Motors' }] }));
    if (url === '/djangoapp/get_cars') return Promise.resolve(response({ CarModels: [{ id: 42, CarMake: 'Land Rover', CarModel: 'Range Rover Sport' }] }));
    if (url === '/djangoapp/add_review') return saveResponse;
    throw new Error(`Unexpected request: ${url}`);
  });
});

afterEach(() => {
  global.fetch = originalFetch;
  document.cookie = 'csrftoken=; path=/; max-age=0';
  sessionStorage.clear();
});

const renderPage = () => render(
  <MemoryRouter initialEntries={['/postreview/7']}>
    <Routes>
      <Route path="/postreview/:id" element={<PostReview />} />
      <Route path="/dealer/:id" element={<h1>Dealer reviews after posting</h1>} />
    </Routes>
  </MemoryRouter>,
);

const fillReview = async () => {
  fireEvent.change(await screen.findByLabelText('Your review'), { target: { value: '  A friendly and helpful team.  ' } });
  fireEvent.change(screen.getByLabelText('Purchase date'), { target: { value: '2024-05-22' } });
  fireEvent.change(screen.getByLabelText('Car make and model'), { target: { value: '42' } });
  fireEvent.change(screen.getByLabelText('Car year'), { target: { value: '2024' } });
};

const savedCalls = () => global.fetch.mock.calls.filter(([url]) => url === '/djangoapp/add_review');

test('posts a CSRF-protected review with full multiword car names and numeric fields, then opens dealer reviews', async () => {
  let finishSave;
  saveResponse = new Promise((resolve) => { finishSave = resolve; });
  renderPage();
  await fillReview();
  fireEvent.click(screen.getByRole('button', { name: 'Post Review' }));

  expect(screen.getByRole('button', { name: 'Posting review…' })).toBeDisabled();
  expect(screen.getByLabelText('Your review')).toBeDisabled();
  expect(savedCalls()).toHaveLength(1);
  const [, options] = savedCalls()[0];
  expect(options).toMatchObject({
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-CSRFToken': 'review-csrf-token' },
  });
  expect(JSON.parse(options.body)).toEqual({
    dealership: 7,
    review: 'A friendly and helpful team.',
    purchase: true,
    purchase_date: '2024-05-22',
    car_make: 'Land Rover',
    car_model: 'Range Rover Sport',
    car_year: 2024,
  });
  await act(async () => { finishSave(response({ status: 200 })); });
  expect(await screen.findByRole('heading', { name: 'Dealer reviews after posting' })).toBeInTheDocument();
});

test('checks the server session and hides the form for a logged-out user despite stale browser storage', async () => {
  authenticated = false;
  sessionStorage.setItem('username', 'stale-user');
  renderPage();

  expect(await screen.findByRole('link', { name: 'sign in' })).toHaveAttribute('href', '/login');
  expect(screen.queryByLabelText('Your review')).not.toBeInTheDocument();
  expect(sessionStorage.getItem('username')).toBeNull();
  expect(savedCalls()).toHaveLength(0);
});

test('keeps entered details and allows retry after a failed save', async () => {
  saveResponse = Promise.resolve(response({ status: 502, message: 'A backend service could not complete the request.' }, 502));
  renderPage();
  await fillReview();
  fireEvent.click(screen.getByRole('button', { name: 'Post Review' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('A backend service could not complete the request.');
  expect(screen.getByLabelText('Your review')).toHaveValue('  A friendly and helpful team.  ');
  expect(screen.getByLabelText('Car make and model')).toHaveValue('42');
  expect(screen.getByRole('button', { name: 'Post Review' })).toBeEnabled();
  expect(screen.queryByRole('heading', { name: 'Dealer reviews after posting' })).not.toBeInTheDocument();

  saveResponse = Promise.resolve(response({ status: 200 }));
  fireEvent.click(screen.getByRole('button', { name: 'Post Review' }));
  expect(await screen.findByRole('heading', { name: 'Dealer reviews after posting' })).toBeInTheDocument();
  expect(savedCalls()).toHaveLength(2);
});

test('does not send a mutation when the CSRF cookie is missing', async () => {
  document.cookie = 'csrftoken=; path=/; max-age=0';
  renderPage();
  await fillReview();
  fireEvent.click(screen.getByRole('button', { name: 'Post Review' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('Your session could not be verified.');
  expect(savedCalls()).toHaveLength(0);
});

test('rejects a whitespace-only review before submitting', async () => {
  renderPage();
  await fillReview();
  fireEvent.change(screen.getByLabelText('Your review'), { target: { value: '   ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Post Review' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('Complete the review');
  expect(savedCalls()).toHaveLength(0);
});

test('asks the user to sign in again when the session expires during submission', async () => {
  saveResponse = Promise.resolve(response({ status: 403, message: 'Sign in before posting a review.' }, 403));
  renderPage();
  await fillReview();
  fireEvent.click(screen.getByRole('button', { name: 'Post Review' }));

  expect(await screen.findByRole('link', { name: 'sign in' })).toHaveAttribute('href', '/login');
  await waitFor(() => expect(screen.queryByLabelText('Your review')).not.toBeInTheDocument());
});
