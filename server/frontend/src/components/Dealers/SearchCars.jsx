import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import Header from '../Header/Header';
import './Dealers.css';
import './SearchCars.css';

const emptyFilters = () => ({ make: 'all', model: 'all', year: 'all', mileage: 'all', price: 'all' });
const numberFormat = new Intl.NumberFormat('en-US');
const priceFormat = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const uniqueValues = (cars, field) => [...new Set(cars.map(car => car[field]).filter(Boolean))]
  .sort((first, second) => first.localeCompare(second));

// Match the inventory service's inclusive upper bounds and exclusive lower bounds.
const matchesRange = (value, selection, step, highest) => {
  if (selection === 'all') return true;
  const upper = Number(selection);
  if (upper > highest) return Number(value) > highest;
  return Number(value) <= upper && (upper === step || Number(value) > upper - step);
};

const matchingCars = (cars, filters) => cars.filter(car => (
  (filters.make === 'all' || car.make === filters.make)
  && (filters.model === 'all' || car.model === filters.model)
  && (filters.year === 'all' || Number(car.year) >= Number(filters.year))
  && matchesRange(car.mileage, filters.mileage, 50000, 200000)
  && matchesRange(car.price, filters.price, 20000, 80000)
));

const SearchCars = () => {
  const { id } = useParams();
  const [cars, setCars] = useState([]);
  const [makes, setMakes] = useState([]);
  const [models, setModels] = useState([]);
  const [dealer, setDealer] = useState(null);
  const [filters, setFilters] = useState(emptyFilters);
  const [inventoryReady, setInventoryReady] = useState(false);
  const [loadingCars, setLoadingCars] = useState(true);
  const [loadingDealer, setLoadingDealer] = useState(true);
  const [carsError, setCarsError] = useState('');
  const [dealerError, setDealerError] = useState('');
  const inventoryController = useRef(null);
  const dealerController = useRef(null);
  const fullInventory = useRef([]);
  const currentFilters = useRef(emptyFilters());
  const lastFilter = useRef(null);

  const fetchDealer = useCallback(async () => {
    dealerController.current?.abort();
    const controller = new AbortController();
    dealerController.current = controller;
    setLoadingDealer(true);
    setDealerError('');
    try {
      const response = await fetch(`/djangoapp/dealer/${id}`, { method: 'GET', signal: controller.signal });
      if (response.status === 404) throw new Error('Dealer not found.');
      if (!response.ok) throw new Error('Invalid dealership response.');
      const data = await response.json();
      if (data.status !== 200 || !Array.isArray(data.dealer) || !data.dealer[0]) {
        throw new Error('Invalid dealership response.');
      }
      if (!controller.signal.aborted) setDealer(data.dealer[0]);
    } catch (error) {
      if (!controller.signal.aborted) {
        setDealerError(error.message === 'Dealer not found.' ? error.message : 'Unable to load this dealership. Please try again.');
      }
    } finally {
      if (!controller.signal.aborted) setLoadingDealer(false);
    }
  }, [id]);

  const fetchCars = useCallback(async (criteria, field = null) => {
    inventoryController.current?.abort();
    const controller = new AbortController();
    inventoryController.current = controller;
    lastFilter.current = field;
    setLoadingCars(true);
    setCarsError('');

    // The Django proxy accepts one changed filter; intersect the other selections locally.
    const parameters = new URLSearchParams();
    if (field && criteria[field] !== 'all') parameters.set(field, criteria[field]);
    const query = parameters.toString();
    const url = `/djangoapp/get_inventory/${id}${query ? `?${query}` : ''}`;

    try {
      const response = await fetch(url, { method: 'GET', signal: controller.signal });
      if (!response.ok) throw new Error('Inventory request failed.');
      const data = await response.json();
      if (data.status !== 200 || !Array.isArray(data.cars)) throw new Error('Invalid inventory response.');
      if (controller.signal.aborted) return;
      if (!query) {
        fullInventory.current = data.cars;
        setMakes(uniqueValues(data.cars, 'make'));
        setModels(uniqueValues(data.cars, 'model'));
        setInventoryReady(true);
      }
      setCars(matchingCars(data.cars, criteria));
    } catch (error) {
      if (!controller.signal.aborted) setCarsError('Unable to load cars. Please try again.');
    } finally {
      if (!controller.signal.aborted) setLoadingCars(false);
    }
  }, [id]);

  useEffect(() => {
    const defaults = emptyFilters();
    currentFilters.current = defaults;
    fullInventory.current = [];
    setFilters(defaults);
    setDealer(null);
    setCars([]);
    setMakes([]);
    setModels([]);
    setInventoryReady(false);
    fetchDealer();
    fetchCars(defaults);
    return () => {
      inventoryController.current?.abort();
      dealerController.current?.abort();
    };
  }, [id, fetchDealer, fetchCars]);

  const changeFilter = (field, value) => {
    const next = { ...currentFilters.current, [field]: value };
    if (field === 'make' && value !== 'all' && next.model !== 'all'
      && !fullInventory.current.some(car => car.make === value && car.model === next.model)) {
      next.model = 'all';
    }
    if (field === 'model' && value !== 'all') {
      const modelMakes = uniqueValues(fullInventory.current.filter(car => car.model === value), 'make');
      if (modelMakes.length === 1) next.make = modelMakes[0];
    }
    currentFilters.current = next;
    setFilters(next);
    fetchCars(next, field);
  };

  const reset = () => {
    const defaults = emptyFilters();
    currentFilters.current = defaults;
    setFilters(defaults);
    fetchCars(defaults);
  };

  const retry = () => {
    if (dealerError) fetchDealer();
    if (carsError) fetchCars(currentFilters.current, lastFilter.current);
  };

  const hasFilters = Object.values(filters).some(value => value !== 'all');
  const renderSelect = (field, label, options) => (
    <div className="inventory-filter">
      <label htmlFor={field}>{label}</label>
      <select id={field} name={field} value={filters[field]} disabled={!inventoryReady}
        onChange={event => changeFilter(field, event.target.value)}>
        <option value="all">All</option>
        {options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
      </select>
    </div>
  );

  return (
    <div>
      <Header />
      <main className="inventory-page">
        <div className="inventory-heading">
          <a className="inventory-back-link" href={`/dealer/${id}`}>Back to dealership</a>
          <h1>{dealer ? `Cars at ${dealer.full_name}` : 'Car inventory'}</h1>
          <p>Find a car by make, model, year, mileage, and price.</p>
        </div>
        {loadingDealer && <p className="inventory-feedback" role="status">Loading dealership…</p>}
        {dealerError && <p className="inventory-feedback inventory-error" role="alert">{dealerError}</p>}
        <fieldset className="inventory-filters">
          <legend>Filter cars</legend>
          {renderSelect('make', 'Make', makes.map(make => [make, make]))}
          {renderSelect('model', 'Model', models.map(model => [model, model]))}
          {renderSelect('year', 'Year', [2024, 2023, 2022, 2021, 2020].map(year => [String(year), `${year} or newer`]))}
          {renderSelect('mileage', 'Mileage', [
            ['50000', '50,000 miles or less'], ['100000', 'Over 50,000 to 100,000 miles'],
            ['150000', 'Over 100,000 to 150,000 miles'], ['200000', 'Over 150,000 to 200,000 miles'],
            ['200001', 'Over 200,000 miles'],
          ])}
          {renderSelect('price', 'Price', [
            ['20000', '$20,000 or less'], ['40000', 'Over $20,000 to $40,000'],
            ['60000', 'Over $40,000 to $60,000'], ['80000', 'Over $60,000 to $80,000'],
            ['80001', 'Over $80,000'],
          ])}
          <button type="button" className="inventory-reset" onClick={reset}>Reset filters</button>
        </fieldset>
        <section className="inventory-results" aria-label="Car search results" aria-busy={loadingCars}>
          {loadingCars && <p className="inventory-feedback" role="status">Loading cars…</p>}
          {carsError && <p className="inventory-feedback inventory-error" role="alert">{carsError}</p>}
          {!loadingCars && !carsError && (
            <>
              <p className="inventory-count" role="status">{cars.length} {cars.length === 1 ? 'car' : 'cars'} found</p>
              {cars.length === 0 ? (
                <p className="inventory-empty">{hasFilters ? 'No cars found matching criteria.' : 'No cars are available at this dealership.'}</p>
              ) : (
                <div className="inventory-grid">
                  {cars.map((car, index) => (
                    <article className="inventory-card" key={car._id ?? car.id ?? `${car.make}-${car.model}-${index}`}>
                      <h2>{car.make} {car.model}</h2>
                      <dl className="inventory-card-details">
                        <dt>Year</dt><dd>{car.year}</dd>
                        <dt>Mileage</dt><dd>{numberFormat.format(car.mileage)} miles</dd>
                        <dt>Price</dt><dd>{priceFormat.format(car.price)}</dd>
                        <dt>Body type</dt><dd>{car.bodyType || 'Not specified'}</dd>
                      </dl>
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
        {(dealerError || carsError) && <button type="button" className="inventory-retry" onClick={retry}>Try again</button>}
      </main>
    </div>
  );
};

export default SearchCars;
