import React, { useState, useEffect } from 'react';
import './Dealers.css';
import '../assets/style.css';
import Header from '../Header/Header';
import useSession from '../../hooks/useSession';
import reviewIcon from '../assets/reviewicon.png';

const Dealers = () => {
  const [dealers, setDealers] = useState([]);
  const [states, setStates] = useState([]);
  const [selectedState, setSelectedState] = useState('All');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const { user } = useSession();
  const isLoggedIn = Boolean(user);

  useEffect(() => {
    const controller = new AbortController();
    const loadDealers = async () => {
      setLoading(true);
      setError('');
      const url = selectedState === 'All'
        ? '/djangoapp/get_dealers'
        : `/djangoapp/get_dealers/${encodeURIComponent(selectedState)}`;

      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error('Dealership request failed.');
        const data = await response.json();
        if (data.status !== 200 || !Array.isArray(data.dealers)) {
          throw new Error('Invalid dealership response.');
        }
        if (controller.signal.aborted) return;
        setDealers(data.dealers);
        if (selectedState === 'All') {
          setStates([...new Set(data.dealers.map(dealer => dealer.state).filter(Boolean))].sort());
        }
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setDealers([]);
          setError('Unable to load dealerships. Please try again.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    loadDealers();
    return () => controller.abort();
  }, [selectedState, retry]);

  return (
    <div>
      <Header />
      <main className="dealers-page">
        <h1>Car dealerships</h1>
        <p>Find a dealership and select its name to read customer reviews.</p>
        {error && (
          <div className="alert alert-danger" role="alert">
            {error} <button className="btn btn-outline-danger btn-sm" onClick={() => setRetry(value => value + 1)}>Try again</button>
          </div>
        )}
        <div className="table-responsive">
          <table className="table table-striped dealers-table">
            <caption className="visually-hidden">Dealerships by state</caption>
            <thead>
              <tr>
                <th scope="col">ID</th>
                <th scope="col">Dealer Name</th>
                <th scope="col">City</th>
                <th scope="col">Address</th>
                <th scope="col">Zip</th>
                <th scope="col">
                  <label htmlFor="state" className="visually-hidden">Filter dealerships by state</label>
                  <select name="state" id="state" className="form-select" value={selectedState} onChange={event => setSelectedState(event.target.value)}>
                    <option value="All">All States</option>
                    {states.map(state => <option key={state} value={state}>{state}</option>)}
                  </select>
                </th>
                {isLoggedIn && <th scope="col">Review Dealer</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={isLoggedIn ? 7 : 6}><span role="status">Loading dealerships…</span></td></tr>
              ) : dealers.length === 0 ? (
                <tr><td colSpan={isLoggedIn ? 7 : 6}>{error ? 'Dealerships are unavailable.' : 'No dealerships found for this state.'}</td></tr>
              ) : dealers.map(dealer => (
                <tr key={dealer.id}>
                  <td>{dealer.id}</td>
                  <td><a href={`/dealer/${dealer.id}`}>{dealer.full_name}</a></td>
                  <td>{dealer.city}</td>
                  <td>{dealer.address}</td>
                  <td>{dealer.zip}</td>
                  <td>{dealer.state}</td>
                  {isLoggedIn && (
                    <td><a href={`/postreview/${dealer.id}`} aria-label={`Review ${dealer.full_name}`}><img src={reviewIcon} className="review_icon" alt="Post Review" /></a></td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
};

export default Dealers;
