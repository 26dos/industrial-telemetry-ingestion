const router = require('express').Router();
const { execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const NET_PATH = path.join(__dirname, '../data/network.json');

function readNetwork() {
  return JSON.parse(fs.readFileSync(NET_PATH, 'utf-8'));
}

function getNetworkInterface() {
  try {
    const output = execSync("ip route show default | awk '{print $5}'", { encoding: 'utf-8' }).trim();
    return output || 'eth0';
  } catch {
    return 'eth0';
  }
}

router.post('/getNetwork', (req, res) => {
  try {
    const data = readNetwork();
    res.json({ code: 200, success: true, data, msg: '操作成功' });
  } catch (e) {
    res.json({ code: 500, success: false, data: null, msg: e.message });
  }
});

router.post('/setNetwork', (req, res) => {
  try {
    const { ip, netmask, gateway } = req.body;
    if (!ip || !netmask) {
      return res.json({ code: 400, success: false, data: null, msg: 'IP和子网掩码不能为空' });
    }
    const data = { ip, netmask, gateway: gateway || '' };
    fs.writeFileSync(NET_PATH, JSON.stringify(data, null, 2), 'utf-8');
    res.json({ code: 200, success: true, data: null, msg: '操作成功' });
  } catch (e) {
    res.json({ code: 500, success: false, error: e.message });
  }
});

router.post('/restartNetwork', (req, res) => {
  const iface = getNetworkInterface();
  const config = readNetwork();
  console.log(`[Network] 重启网络 iface=${iface} ip=${config.ip}`);

  try {
    execSync(`ip addr flush dev ${iface}`, { timeout: 5000 });
    execSync(`ip addr add ${config.ip}/${netmaskToCidr(config.netmask)} dev ${iface}`, { timeout: 5000 });
    execSync(`ip link set ${iface} up`, { timeout: 5000 });
    if (config.gateway) {
      execSync(`ip route add default via ${config.gateway} dev ${iface}`, { timeout: 5000 });
    }
    res.json({ code: 200, success: true, data: null, msg: '网络已重启' });
  } catch (e) {
    console.error('[Network] 重启失败，尝试 systemctl 方式:', e.message);
    exec('systemctl restart networking 2>/dev/null || systemctl restart NetworkManager 2>/dev/null', { timeout: 15000 }, (err) => {
      if (err) {
        return res.json({ code: 500, success: false, data: null, msg: `网络重启失败: ${err.message}` });
      }
      res.json({ code: 200, success: true, data: null, msg: '网络已重启' });
    });
  }
});

function netmaskToCidr(mask) {
  return mask.split('.').reduce((cidr, octet) => {
    return cidr + (Number(octet) >>> 0).toString(2).split('1').length - 1;
  }, 0);
}

module.exports = router;
