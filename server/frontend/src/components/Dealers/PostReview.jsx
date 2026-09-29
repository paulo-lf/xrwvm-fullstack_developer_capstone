import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Header from '../Header/Header';
import useSession from '../../hooks/useSession';
import './Dealers.css';
import '../assets/style.css';

const getCsrfToken = () => {
  const cookie = document.cookie.split('; ').find((item) => item.startsWith('csrftoken='));
  return cookie ? decodeURIComponent(cookie.slice('csrftoken='.length)) : '';
};

const PostReview = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, loading: sessionLoading, error: sessionError } = useSession();
  const [dealer, setDealer] = useState(null);
  const [cars, setCars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [review, setReview] = useState('');
  const [carId, setCarId] = useState('');
  const [year, setYear] = useState('');
  const [date, setDate] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const maxYear = new Date().getFullYear() + 1;
  const today = new Date();
  const maxDate = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError('');

    const loadDetails = async () => {
      try {
        const options = { credentials: 'same-origin', signal: controller.signal };
        const [dealerResponse, carsResponse] = await Promise.all([
          fetch(`/djangoapp/dealer/${id}`, options),
          fetch('/djangoapp/get_cars', options),
        ]);
        const [dealerData, carsData] = await Promise.all([
          dealerResponse.json(), carsResponse.json(),
        ]);
        if (!dealerResponse.ok || dealerData.status !== 200 || !dealerData.dealer?.length) {
          throw new Error(dealerData.message || 'Could not load this dealership.');
        }
        if (!carsResponse.ok || !Array.isArray(carsData.CarModels)) {
          throw new Error(carsData.message || 'Could not load the available cars.');
        }
        if (!controller.signal.aborted) {
          setDealer(dealerData.dealer[0]);
          setCars(carsData.CarModels);
        }
      } catch (failure) {
        if (!controller.signal.aborted) {
          setLoadError(failure.message || 'Could not load the review form. Please try again.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    loadDetails();
    return () => controller.abort();
  }, [id]);

  const postReview = async (event) => {
    event.preventDefault();
    if (pending) return;
    setError('');
    const car = cars.find((item) => String(item.id) === carId);
    const carYear = Number(year);
    if (!review.trim() || !car || !date || date > maxDate || !Number.isInteger(carYear) || carYear < 1886 || carYear > maxYear) {
      setError('Complete the review, purchase date, car make and model, and a valid car year.');
      return;
    }
    const csrfToken = getCsrfToken();
    if (!csrfToken) {
      setError('Your session could not be verified. Refresh this page and try again.');
      return;
    }

    setPending(true);
    try {
      const response = await fetch('/djangoapp/add_review', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken },
        body: JSON.stringify({
          dealership: Number(id),
          review: review.trim(),
          purchase: true,
          purchase_date: date,
          car_make: car.CarMake,
          car_model: car.CarModel,
          car_year: carYear,
        }),
      });
      // Django may return an HTML error for an expired CSRF token.
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.status !== 200) {
        if (response.status === 403 && result.message === 'Sign in before posting a review.') {
          setSessionExpired(true);
        }
        throw new Error(result.message || 'Could not post your review. Refresh the page and try again.');
      }
      navigate(`/dealer/${id}`);
    } catch (failure) {
      setError(failure.message || 'Could not post your review. Please try again.');
    } finally {
      setPending(false);
    }
  };

  return (
    <div>
      <Header />
      <main className="dealers-page">
        <Link to={`/dealer/${id}`} className="back-link">← Back to dealership</Link>
        <h1 className="page-heading">Post a review</h1>
        {sessionLoading ? <p role="status">Checking your session…</p> : sessionError ? (
          <p role="alert">{sessionError}</p>
        ) : !user || sessionExpired ? (
          <p className="page-message">Please <Link to="/login">sign in</Link> to post a review.</p>
        ) : loading ? <p role="status">Loading review form…</p> : loadError ? (
          <p role="alert">{loadError}</p>
        ) : cars.length === 0 ? (
          <p role="alert">No cars are available yet. Please try again later.</p>
        ) : (
          <form className="review-form" onSubmit={postReview}>
            <h2>{dealer.full_name}</h2>
            <p className="review-help">Share your purchase experience as {user.userName}. All fields are required.</p>
            {error && <p className="alert alert-danger" role="alert">{error}</p>}
            <fieldset disabled={pending}>
              <div className="review-field">
                <label htmlFor="review">Your review</label>
                <textarea id="review" name="review" rows="5" required value={review} onChange={(event) => setReview(event.target.value)} placeholder="Tell us about your experience with this dealership." />
              </div>
              <div className="review-form-grid">
                <div className="review-field">
                  <label htmlFor="purchase-date">Purchase date</label>
                  <input id="purchase-date" name="purchase_date" type="date" required max={maxDate} value={date} onChange={(event) => setDate(event.target.value)} />
                </div>
                <div className="review-field">
                  <label htmlFor="cars">Car make and model</label>
                  <select id="cars" name="cars" required value={carId} onChange={(event) => setCarId(event.target.value)}>
                    <option value="" disabled>Choose car make and model</option>
                    {cars.map((car) => <option key={car.id} value={car.id}>{car.CarMake} {car.CarModel}</option>)}
                  </select>
                </div>
                <div className="review-field">
                  <label htmlFor="car-year">Car year</label>
                  <input id="car-year" name="car_year" type="number" required min="1886" max={maxYear} step="1" value={year} onChange={(event) => setYear(event.target.value)} placeholder="e.g. 2024" />
                </div>
              </div>
              <button className="btn btn-primary review-submit" type="submit">{pending ? 'Posting review…' : 'Post Review'}</button>
            </fieldset>
          </form>
        )}
      </main>
    </div>
  );
};

export default PostReview;
