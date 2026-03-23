const router = require('express').Router();
const { getRealtimeStore, publishControl } = require('../services/mqttService');

router.post('/getAllData/YC', (req, res) => {
  const store = getRealtimeStore();
  res.json({ code: 200, success: true, data: store.yc, msg: '操作成功' });
});

router.post('/getAllData/YX', (req, res) => {
  const store = getRealtimeStore();
  res.json({ code: 200, success: true, data: store.yx, msg: '操作成功' });
});

router.post('/getControlList/YT', (req, res) => {
  const store = getRealtimeStore();
  res.json({ code: 200, success: true, data: { yt: store.yt }, msg: '操作成功' });
});

router.post('/control/YT', (req, res) => {
  const { index, value } = req.body;
  if (index === undefined || value === undefined) {
    return res.json({ code: 400, success: false, data: null, msg: '缺少 index 或 value 参数' });
  }
  publishControl(index, value);
  res.json({ code: 200, success: true, data: null, msg: '遥调下发成功' });
});

module.exports = router;
