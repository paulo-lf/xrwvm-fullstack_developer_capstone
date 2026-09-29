const express = require('express');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const Reviews = require('./review');
const Dealerships = require('./dealership');

const app = express();
const port = Number(process.env.PORT || 3030);

const mongoUri =
  process.env.MONGODB_URI ||
  'mongodb://mongo_db:27017/dealershipsDB';

app.use(cors());
app.use(express.urlencoded({ extended: false }));

const reviews_data = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, 'data', 'reviews.json'),
    'utf8'
  )
);

const dealerships_data = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, 'data', 'dealerships.json'),
    'utf8'
  )
);

// Express route to home
app.get('/', async (req, res) => {
    res.send("Welcome to the Mongoose API");
});

// Express route to fetch all reviews
app.get('/fetchReviews', async (req, res) => {
  try {
    const documents = await Reviews.find();
    res.json(documents);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching documents' });
  }
});

// Express route to fetch reviews by a particular dealer
app.get('/fetchReviews/dealer/:id', async (req, res) => {
  try {
    const documents = await Reviews.find({dealership: req.params.id});
    res.json(documents);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching documents' });
  }
});

// Fetch all dealerships.
app.get('/fetchDealers', async (req, res) => {
  try {
    const documents = await Dealerships.find().sort({ id: 1 });
    res.json(documents);
  } catch (error) {
    console.error('Failed to fetch dealerships:', error);
    res.status(500).json({
      error: 'Error fetching dealerships',
    });
  }
});

// Fetch dealerships in one state.
app.get('/fetchDealers/:state', async (req, res) => {
  try {
    const documents = await Dealerships.find({
      state: req.params.state,
    }).sort({ id: 1 });

    res.json(documents);
  } catch (error) {
    console.error('Failed to fetch dealerships by state:', error);
    res.status(500).json({
      error: 'Error fetching dealerships by state',
    });
  }
});

// Fetch a dealership by its numeric ID.
app.get('/fetchDealer/:id', async (req, res) => {
  const dealerId = Number(req.params.id);

  if (!Number.isSafeInteger(dealerId) || dealerId <= 0) {
    return res.status(400).json({
      error: 'Dealer ID must be a positive integer',
    });
  }

  try {
    const documents = await Dealerships.find({
      id: dealerId,
    });

    res.json(documents);
  } catch (error) {
    console.error('Failed to fetch dealership:', error);
    res.status(500).json({
      error: 'Error fetching dealership',
    });
  }
});

//Express route to insert review
app.post('/insert_review', express.raw({ type: '*/*' }), async (req, res) => {
  const data = JSON.parse(req.body);
  const documents = await Reviews.find().sort({ id: -1 });
  const new_id = documents[0].id + 1;

  const review = new Reviews({
    "id": new_id,
    "name": data.name,
    "dealership": data.dealership,
    "review": data.review,
    "purchase": data.purchase,
    "purchase_date": data.purchase_date,
    "car_make": data.car_make,
    "car_model": data.car_model,
    "car_year": data.car_year,
  });

  try {
    const savedReview = await review.save();
    res.json(savedReview);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: 'Error inserting review' });
  }
});

async function startServer() {
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB');

  // Load dealership examples only when this collection is empty.
  if ((await Dealerships.countDocuments()) === 0) {
    await Dealerships.insertMany(
      dealerships_data.dealerships
    );

    console.log('Loaded dealership sample data');
  }

  // Load review examples only when this collection is empty.
  if ((await Reviews.countDocuments()) === 0) {
    await Reviews.insertMany(
      reviews_data.reviews
    );

    console.log('Loaded review sample data');
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`API listening on port ${port}`);
  });
}

startServer().catch((error) => {
  console.error('Failed to start the API:', error);
  process.exit(1);
});
