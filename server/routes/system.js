const router = require('express').Router();
const os = require('os');

router.post('/getVersion', (req, res) => {
  res.json({
    code: 200,
    success: true,
    data: {
      version: `InverterController V1.1. built on ${new Date().toISOString().slice(0, 10)}`,
    },
    msg: 'Operation successful',
  });
});

router.post('/getSystemInfo', (req, res) => {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedPer = (((totalMem - freeMem) / totalMem) * 100).toFixed(2);
  const cpus = os.cpus();
  let cpuIdle = 0;
  let cpuTotal = 0;
  for (const cpu of cpus) {
    for (const type of Object.keys(cpu.times)) {
      cpuTotal += cpu.times[type];
    }
    cpuIdle += cpu.times.idle;
  }
  const cpuUsage = (((cpuTotal - cpuIdle) / cpuTotal) * 100).toFixed(0);

  res.json({
    code: 200,
    success: true,
    data: {
      mem_total: `${Math.round(totalMem / 1024)}kB`,
      mem_available: `${Math.round(freeMem / 1024)}kB`,
      mem_usage_per: `${usedPer}%`,
      cpu_usage_per: `${cpuUsage}%`,
    },
    msg: 'Operation successful',
  });
});

router.post('/restart', (req, res) => {
  console.log('[System] Received service restart request');
  res.json({ code: 200, success: true, data: null, msg: 'Service will restart shortly' });
  setTimeout(() => {
    console.log('[System] Executing restart...');
    process.exit(0);
  }, 1500);
});

module.exports = router;
