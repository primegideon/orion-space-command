const names = ['(2016 XJ)', '2016 XJ', '523609 (2005 PJ2)', '2005 PJ2', '(2005 PJ2)'];
const SOE = '$$SOE';
const EOE = '$$EOE';

(async () => {
  for (const name of names) {
    const designation = name.replace(/^\s*\(|\)\s*$/g, '').trim();
    const params = new URLSearchParams({
      format: 'json', COMMAND: designation, OBJ_DATA: 'NO',
      MAKE_EPHEM: 'YES', EPHEM_TYPE: 'VECTORS', CENTER: '500@10',
      START_TIME: '2026-08-25', STOP_TIME: '2026-08-26',
      STEP_SIZE: '1d', VEC_TABLE: '2', CSV_FORMAT: 'NO'
    });
    try {
      const r = await fetch('https://ssd.jpl.nasa.gov/api/horizons.api?' + params, { signal: AbortSignal.timeout(12000) });
      const d = await r.json();
      const result = d.result || '';
      const hasSoe = result.includes(SOE);
      const errMsg = d.error ? d.error.slice(0,120) : 'none';
      console.log('NAME:', JSON.stringify(name), '-> CMD:', JSON.stringify(designation));
      console.log('  status:', r.status, 'hasSoe:', hasSoe, 'error:', errMsg);
      if (hasSoe) {
        const block = result.slice(result.indexOf(SOE), result.indexOf(SOE) + 300);
        console.log('  BLOCK:', block);
      }
    } catch(e) { console.log('FAIL', name, e.message); }
    console.log('');
  }
})();
