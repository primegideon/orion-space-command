// Test the new parser logic against the actual Horizons response format
const KM_PER_AU = 149_597_870.7;

const SAMPLE_BLOCK = `2461277.500000000 = A.D. 2026-Aug-25 00:00:00.0000 TDB 
 X = 2.106314424986716E+07 Y =-4.425297238412986E+08 Z =-6.876146736493140E+06
 VX= 1.729913039798875E+01 VY= 4.067621971649389E+00 VZ=-1.861829481723865E-02
 LT= 1.510231419264444E+03 RG= 4.525487124862718E+08 RR=-2.175855773641898E+01`;

function extractVal(block, label) {
  const re = new RegExp(label + "\\s*=\\s*([+-]?[\\d.]+E[+-]?\\d+|[+-]?[\\d.]+)", "i");
  const m = block.match(re);
  return m ? parseFloat(m[1]) : null;
}

const jdMatch = SAMPLE_BLOCK.match(/^([\d.]+)\s*=/m);
console.log('JD:', jdMatch?.[1]);

const xKm = extractVal(SAMPLE_BLOCK, "X");
const yKm = extractVal(SAMPLE_BLOCK, "Y");
const zKm = extractVal(SAMPLE_BLOCK, "Z");
const vx  = extractVal(SAMPLE_BLOCK, "VX");
const vy  = extractVal(SAMPLE_BLOCK, "VY");
const vz  = extractVal(SAMPLE_BLOCK, "VZ");

console.log('X km:', xKm, '→', xKm / KM_PER_AU, 'AU');
console.log('Y km:', yKm, '→', yKm / KM_PER_AU, 'AU');
console.log('Z km:', zKm, '→', zKm / KM_PER_AU, 'AU');
console.log('VX km/s:', vx);
console.log('VY km/s:', vy);
console.log('VZ km/s:', vz);

// Test name cleaning
const names = ['(2016 XJ)', '523609 (2005 PJ2)', '2016 XJ', '(2019 DN1)'];
for (const name of names) {
  const parenMatch = name.match(/\(([^)]+)\)\s*$/);
  const designation = parenMatch ? parenMatch[1].trim() : name.replace(/^\s*\(|\)\s*$/g, "").trim();
  console.log('NAME:', JSON.stringify(name), '-> DESIGNATION:', JSON.stringify(designation));
}
