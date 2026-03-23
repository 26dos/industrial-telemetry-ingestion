const router = require('express').Router();
const fs = require('fs');
const path = require('path');

const LORA_PATH = path.join(__dirname, '../data/lora.json');

function readLora() {
  return JSON.parse(fs.readFileSync(LORA_PATH, 'utf-8'));
}

router.post('/getLoraInfo', (req, res) => {
  try {
    const data = readLora();
    res.json({ code: 200, success: true, data, msg: '操作成功' });
  } catch (e) {
    res.json({ code: 500, success: false, data: null, msg: e.message });
  }
});

router.post('/setLoraInfo', (req, res) => {
  try {
    const loraConfig = req.body;
    fs.writeFileSync(LORA_PATH, JSON.stringify(loraConfig, null, 2), 'utf-8');
    res.json({ code: 200, success: true, data: null, msg: '操作成功' });
  } catch (e) {
    res.json({ code: 500, success: false, data: null, msg: e.message });
  }
});

module.exports = router;
