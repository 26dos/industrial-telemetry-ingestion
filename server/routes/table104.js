const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const TABLE_DIR = path.join(__dirname, '../data/104-tables');
const USE_PATH = path.join(__dirname, '../data/104-use.json');

const upload = multer({
  dest: path.join(__dirname, '../data/_uploads'),
  limits: { fileSize: 10 * 1024 * 1024 },
});

function getUseFile() {
  return JSON.parse(fs.readFileSync(USE_PATH, 'utf-8'));
}

router.post('/get104List', (req, res) => {
  try {
    const files = fs.readdirSync(TABLE_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace('.json', ''));
    const { use } = getUseFile();
    res.json({ code: 200, success: true, data: { list: files, use }, msg: '操作成功' });
  } catch (e) {
    res.json({ code: 500, success: false, data: null, msg: e.message });
  }
});

router.post('/get104Info', (req, res) => {
  try {
    const { name } = req.body;
    const filePath = path.join(TABLE_DIR, `${name}.json`);
    if (!fs.existsSync(filePath)) {
      return res.json({ code: 404, success: false, data: null, msg: '104转发表文件不存在' });
    }
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    res.json({ code: 200, success: true, data, msg: '操作成功' });
  } catch (e) {
    res.json({ code: 500, success: false, data: null, msg: e.message });
  }
});

router.post('/set104File', (req, res) => {
  try {
    const { name } = req.body;
    const filePath = path.join(TABLE_DIR, `${name}.json`);
    if (!fs.existsSync(filePath)) {
      return res.json({ code: 404, success: false, data: null, msg: '104转发表文件不存在' });
    }
    fs.writeFileSync(USE_PATH, JSON.stringify({ use: name }, null, 2), 'utf-8');
    res.json({ code: 200, success: true, data: null, msg: '操作成功' });
  } catch (e) {
    res.json({ code: 500, success: false, data: null, msg: e.message });
  }
});

router.post('/upload104File', upload.single('file'), (req, res) => {
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

router.post('/delete104File', (req, res) => {
  try {
    const { name } = req.body;
    const filePath = path.join(TABLE_DIR, `${name}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    const useData = getUseFile();
    if (useData.use === name) {
      fs.writeFileSync(USE_PATH, JSON.stringify({ use: '' }, null, 2), 'utf-8');
    }
    res.json({ code: 200, success: true, data: null, msg: '删除成功' });
  } catch (e) {
    res.json({ code: 500, success: false, data: null, msg: e.message });
  }
});

module.exports = router;
