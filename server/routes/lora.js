const router = require('express').Router();
const fs = require('fs');
const path = require('path');

const LORA_PATH = path.join(__dirname, '../data/lora.json');

function readLoRa() {
  return JSON.parse(fs.readFileSync(LORA_PATH, 'utf-8'));
}

router.post('/getLoRaInfo', (req, res) => {
  try {
    const data = readLoRa();
    res.json({ code: 200, success: true, data, msg: 'Operation successful' });
  } catch (e) {
    res.json({ code: 500, success: false, data: null, msg: e.message });
  }
});

router.post('/setLoRaInfo', (req, res) => {
  try {
    const loraConfig = req.body;
    fs.writeFileSync(LORA_PATH, JSON.stringify(loraConfig, null, 2), 'utf-8');
    res.json({ code: 200, success: true, data: null, msg: 'Operation successful' });
  } catch (e) {
    res.json({ code: 500, success: false, data: null, msg: e.message });
  }
});

module.exports = router;
