const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const fs = require('node:fs/promises');
const path = require('node:path');

const Cars = require('./inventory');

const defaultSeedPath = path.join(__dirname, 'data', 'car_records.json');

function positiveInteger(value, label) {
  if (!/^\d+$/.test(value)) {
    throw new Error(`${label} must be a positive integer`);
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return number;
}

function rangeSelector(value, label, upperBounds, finalSelector) {
  const selector = positiveInteger(value, label);
  if (selector === finalSelector) {
    return { $gt: upperBounds.at(-1) };
  }
  const index = upperBounds.indexOf(selector);
  if (index === -1) {
    throw new Error(`${label} must be one of ${[...upperBounds, finalSelector].join(', ')}`);
  }
  return index === 0
    ? { $lte: selector }
    : { $gt: upperBounds[index - 1], $lte: selector };
}

function createApp(carsModel = Cars) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors());

  app.get('/', (req, res) => {
    res.send('Welcome to the Mongoose API');
  });

  function inventoryRoute(route, filter = () => ({})) {
    app.get(route, async (req, res) => {
      let query;
      try {
        query = {
          dealer_id: positiveInteger(req.params.id, 'Dealer ID'),
          ...filter(req.params),
        };
      } catch (error) {
        return res.status(400).json({ error: error.message });
      }

      try {
        const cars = await carsModel.find(query);
        return res.json(cars);
      } catch (error) {
        console.error('Failed to fetch car inventory:', error.message);
        return res.status(500).json({ error: 'Error fetching car inventory' });
      }
    });
  }

  inventoryRoute('/cars/:id');
  inventoryRoute('/carsbymake/:id/:make', ({ make }) => ({ make }));
  inventoryRoute('/carsbymodel/:id/:model', ({ model }) => ({ model }));
  inventoryRoute('/carsbymaxmileage/:id/:mileage', ({ mileage }) => ({
    mileage: rangeSelector(mileage, 'Mileage', [50000, 100000, 150000, 200000], 200001),
  }));
  inventoryRoute('/carsbyprice/:id/:price', ({ price }) => ({
    price: rangeSelector(price, 'Price', [20000, 40000, 60000, 80000], 80001),
  }));
  inventoryRoute('/carsbyyear/:id/:year', ({ year }) => {
    const minimumYear = positiveInteger(year, 'Year');
    if (minimumYear < 1000 || minimumYear > 9999) {
      throw new Error('Year must be between 1000 and 9999');
    }
    return { year: { $gte: minimumYear } };
  });

  return app;
}

async function seedInventory(carsModel = Cars, seedPath = defaultSeedPath) {
  // Keep user data intact across restarts, and avoid duplicate imports.
  if ((await carsModel.countDocuments()) !== 0) {
    return 0;
  }

  const data = JSON.parse(await fs.readFile(seedPath, 'utf8'));
  if (!Array.isArray(data.cars) || data.cars.length === 0) {
    throw new Error('Inventory seed data must contain a non-empty cars array');
  }
  await carsModel.insertMany(data.cars);
  return data.cars.length;
}

async function startServer({
  port = Number(process.env.PORT || 3050),
  host = '0.0.0.0',
  mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27018/carsInventory',
  carsModel = Cars,
  connection = mongoose,
  seedPath = defaultSeedPath,
} = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error('PORT must be an integer between 0 and 65535');
  }

  try {
    await connection.connect(mongoUri, { serverSelectionTimeoutMS: 10000 });
    const seeded = await seedInventory(carsModel, seedPath);
    if (seeded > 0) {
      console.log(`Loaded ${seeded} inventory records`);
    }

    const app = createApp(carsModel);
    const server = await new Promise((resolve, reject) => {
      const listener = app.listen(port, host, () => resolve(listener));
      listener.once('error', reject);
    });
    console.log(`Car inventory API listening on port ${server.address().port}`);
    return server;
  } catch (error) {
    await connection.disconnect();
    throw error;
  }
}

if (require.main === module) {
  startServer()
    .then((server) => {
      let stopping = false;
      const shutdown = () => {
        if (stopping) return;
        stopping = true;
        server.close(async () => {
          try {
            await mongoose.disconnect();
          } catch (error) {
            console.error('Failed to close MongoDB connection:', error.message);
            process.exitCode = 1;
          }
        });
      };
      process.once('SIGTERM', shutdown);
      process.once('SIGINT', shutdown);
    })
    .catch((error) => {
      console.error('Failed to start car inventory API:', error.message);
      process.exitCode = 1;
    });
}

module.exports = { createApp, seedInventory, startServer };
