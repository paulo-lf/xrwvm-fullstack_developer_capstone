import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import './Dealers.css';
import '../assets/style.css';
import positiveIcon from '../assets/positive.png';
import neutralIcon from '../assets/neutral.png';
import negativeIcon from '../assets/negative.png';
import Header from '../Header/Header';
import useSession from '../../hooks/useSession';

const sentimentIcons = { positive: positiveIcon, neutral: neutralIcon, negative: negativeIcon };

const Dealer = () => {
  const { id } = useParams();
  const [dealer, setDealer] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loadingDealer, setLoadingDealer] = useState(true);
  const [loadingReviews, setLoadingReviews] = useState(true);
  const [dealerError, setDealerError] = useState('');
  const [reviewsError, setReviewsError] = useState('');
  const [retry, setRetry] = useState(0);
  const { user } = useSession();

  useEffect(() => {
    const controller = new AbortController();
    setDealer(null);
    setReviews([]);
    setDealerError('');
    setReviewsError('');
    setLoadingDealer(true);
    setLoadingReviews(true);

    const loadDealer = async () => {
      try {
        const response = await fetch(`/djangoapp/dealer/${id}`, { signal: controller.signal });
        if (response.status === 404) throw new Error('Dealer not found.');
        if (!response.ok) throw new Error('Unable to load this dealership. Please try again.');
        const data = await response.json();
        if (data.status !== 200 || !Array.isArray(data.dealer) || !data.dealer[0]) {
          throw new Error('Unable to load this dealership. Please try again.');
        }
        if (!controller.signal.aborted) setDealer(data.dealer[0]);
      } catch (error) {
        if (!controller.signal.aborted) {
          setDealerError(error.message === 'Dealer not found.' ? error.message : 'Unable to load this dealership. Please try again.');
        }
      } finally {
        if (!controller.signal.aborted) setLoadingDealer(false);
      }
    };

    const loadReviews = async () => {
      try {
        const response = await fetch(`/djangoapp/reviews/dealer/${id}`, { signal: controller.signal });
        if (!response.ok) throw new Error('Review request failed.');
        const data = await response.json();
        if (data.status !== 200 || !Array.isArray(data.reviews)) throw new Error('Invalid review response.');
        if (!controller.signal.aborted) setReviews(data.reviews);
      } catch (error) {
        if (!controller.signal.aborted) setReviewsError('Unable to load reviews. Please try again.');
      } finally {
        if (!controller.signal.aborted) setLoadingReviews(false);
      }
    };

    loadDealer();
    loadReviews();
    return () => controller.abort();
  }, [id, retry]);

  return (
    <div>
      <Header />
      <main className="dealers-page">
        <a href="/dealers" className="dealer-back-link">Back to dealerships</a>
        {loadingDealer && <p role="status">Loading dealership…</p>}
        {dealerError && <div className="alert alert-danger" role="alert">{dealerError}</div>}
        {dealer && (
          <>
            <div className="dealer-heading">
              <h1>{dealer.full_name}</h1>
              {user && <a className="btn btn-info" href={`/postreview/${id}`}>Post Review</a>}
            </div>
            <p className="dealer-address">{dealer.address}, {dealer.city}, {dealer.state} {dealer.zip}</p>
            <h2 className="dealer-reviews-heading">Customer reviews</h2>
            {loadingReviews && <p role="status">Loading reviews…</p>}
            {reviewsError && <div className="alert alert-danger" role="alert">{reviewsError}</div>}
            {!loadingReviews && !reviewsError && reviews.length === 0 && <p>No reviews yet. Be the first to share your experience.</p>}
            <div className="reviews_panel">
              {reviews.map((review, index) => {
                const sentiment = sentimentIcons[review.sentiment] ? review.sentiment : 'neutral';
                return (
                  <article className="review_panel" key={review.id ?? review._id ?? index}>
                    <div className="review-sentiment">
                      <img src={sentimentIcons[sentiment]} className="emotion_icon" alt={`${sentiment} sentiment`} />
                      <span>{sentiment}</span>
                    </div>
                    <p className="review">{review.review}</p>
                    <div className="reviewer">
                      <strong>{review.name}</strong>
                      {review.purchase && <span>{[review.car_year, review.car_make, review.car_model].filter(Boolean).join(' ')}</span>}
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}
        {(dealerError || reviewsError) && <button className="btn btn-outline-secondary" onClick={() => setRetry(value => value + 1)}>Try again</button>}
      </main>
    </div>
  );
};

export default Dealer;
