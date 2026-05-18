const router = require('express').Router();
const { getRealtimeStore, publishControl } = require('../services/mqttService');

router.post('/getAllData/YC', (req, res) => {
  const store = getRealtimeStore();
  res.json({ code: 200, success: true, data: store.yc, msg: 'Operation successful' });
});

router.post('/getAllData/YX', (req, res) => {
  const store = getRealtimeStore();
  res.json({ code: 200, success: true, data: store.yx, msg: 'Operation successful' });
});

router.post('/getControlList/YT', (req, res) => {
  const store = getRealtimeStore();
  res.json({ code: 200, success: true, data: { yt: store.yt }, msg: 'Operation successful' });
});

router.post('/control/YT', (req, res) => {
  const { index, value } = req.body;
  if (index === undefined || value === undefined) {
    return res.json({ code: 400, success: false, data: null, msg: 'Missing index or value parameter' });
  }
  publishControl(index, value);
  res.json({ code: 200, success: true, data: null, msg: 'Setpoint command sent successfully' });
});

module.exports = router;
