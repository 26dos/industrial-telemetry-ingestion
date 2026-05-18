const router = require('express').Router();
const fs = require('fs');
const path = require('path');

const INV_PATH = path.join(__dirname, '../data/inverters.json');

function readInverters() {
  return JSON.parse(fs.readFileSync(INV_PATH, 'utf-8'));
}

router.post('/getInverterInfo', (req, res) => {
  try {
    const store = readInverters();
    res.json({ code: 200, success: true, data: store.inverters, msg: 'Operation successful' });
  } catch (e) {
    res.json({ code: 500, success: false, data: null, msg: e.message });
  }
});

router.post('/setInverterInfo', (req, res) => {
  try {
    const { inverters } = req.body;
    const store = readInverters();
    if (inverters.length > store.inverter_max) {
      return res.json({ code: 400, success: false, data: null, msg: `Inverter count cannot exceed ${store.inverter_max}` });
    }
    store.inverters = inverters;
    fs.writeFileSync(INV_PATH, JSON.stringify(store, null, 2), 'utf-8');
    res.json({ code: 200, success: true, data: null, msg: 'Operation successful' });
  } catch (e) {
    res.json({ code: 500, success: false, data: null, msg: e.message });
  }
});

router.post('/getInverterMax', (req, res) => {
  try {
    const store = readInverters();
    res.json({ code: 200, success: true, data: { inverter_max: store.inverter_max }, msg: 'Operation successful' });
  } catch (e) {
    res.json({ code: 500, success: false, data: null, msg: e.message });
  }
});

module.exports = router;
