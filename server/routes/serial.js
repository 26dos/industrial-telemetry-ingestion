const router = require('express').Router();
const fs = require('fs');
const path = require('path');

const SERIAL_PATH = path.join(__dirname, '../data/serials.json');

function readSerials() {
  return JSON.parse(fs.readFileSync(SERIAL_PATH, 'utf-8'));
}

router.post('/getSerialInfo', (req, res) => {
  try {
    const store = readSerials();
    res.json({ code: 200, success: true, data: store.serials, msg: '操作成功' });
  } catch (e) {
    res.json({ code: 500, success: false, data: null, msg: e.message });
  }
});

router.post('/setSerialInfo', (req, res) => {
  try {
    const { serials } = req.body;
    const store = readSerials();
    if (serials.length > store.serial_max) {
      return res.json({ code: 400, success: false, data: null, msg: `串口数量不能超过${store.serial_max}` });
    }
    store.serials = serials;
    fs.writeFileSync(SERIAL_PATH, JSON.stringify(store, null, 2), 'utf-8');
    res.json({ code: 200, success: true, data: null, msg: '操作成功' });
  } catch (e) {
    res.json({ code: 500, success: false, data: null, msg: e.message });
  }
});

router.post('/getSerialMax', (req, res) => {
  try {
    const store = readSerials();
    res.json({ code: 200, success: true, data: { serial_max: store.serial_max }, msg: '操作成功' });
  } catch (e) {
    res.json({ code: 500, success: false, data: null, msg: e.message });
  }
});

module.exports = router;
