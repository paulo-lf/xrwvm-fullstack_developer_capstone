const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema(
  {
    dealer_id: { type: Number, required: true, index: true },
    make: { type: String, required: true },
    model: { type: String, required: true },
    bodyType: { type: String, required: true },
    year: { type: Number, required: true },
    mileage: { type: Number, required: true, min: 0 },
    price: { type: Number, required: true, min: 0 },
  },
  { collection: 'cars' }
);

module.exports = mongoose.model('cars', inventorySchema);
