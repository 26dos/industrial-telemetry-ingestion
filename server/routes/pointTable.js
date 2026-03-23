const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const TABLE_DIR = path.join(__dirname, '../data/inverter-tables');

const upload = multer({
  dest: path.join(__dirname, '../data/_uploads'),
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.post('/getInverterTableList', (req, res) => {
  try {
    const files = fs.readdirSync(TABLE_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace('.json', ''));
    res.json({ code: 200, success: true, data: files, msg: '操作成功' });
  } catch (e) {
    res.json({ code: 500, success: false, data: null, msg: e.message });
  }
});

router.post('/getInverterTableInfo', (req, res) => {
  try {
    const { name } = req.body;
    const filePath = path.join(TABLE_DIR, `${name}.json`);
    if (!fs.existsSync(filePath)) {
      return res.json({ code: 404, success: false, data: null, msg: '点表文件不存在' });
    }
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    res.json({ code: 200, success: true, data, msg: '操作成功' });
  } catch (e) {
    res.json({ code: 500, success: false, data: null, msg: e.message });
  }
});

router.post('/uploadInverterTableFile', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.json({ code: 400, success: false, data: null, msg: '未上传文件' });
    }
    const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf-8');
    const baseName = path.parse(originalName).name;
    const dest = path.join(TABLE_DIR, `${baseName}.json`);
    fs.renameSync(req.file.path, dest);
    res.json({ code: 200, success: true, data: null, msg: '上传成功' });
  } catch (e) {
    res.json({ code: 500, success: false, data: null, msg: e.message });
  }
});

router.post('/deleteInverterTableFile', (req, res) => {
  try {
    const { name } = req.body;
    const filePath = path.join(TABLE_DIR, `${name}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    res.json({ code: 200, success: true, data: null, msg: '删除成功' });
  } catch (e) {
    res.json({ code: 500, success: false, data: null, msg: e.message });
  }
});

module.exports = router;
