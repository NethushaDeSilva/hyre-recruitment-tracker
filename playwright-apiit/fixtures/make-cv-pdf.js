const fs = require('fs');
const text = "John Doe\nSoftware Engineer\nExperience: 5 years building web applications with React, TypeScript and Node.js\nEducation: BSc in Computer Science, University of Colombo\nSkills: JavaScript, React, TypeScript, Node.js, SQL, Git\nWork History:\n2019-2024 Senior Frontend Developer at TechCorp - built and maintained large scale React applications\n2016-2019 Software Developer at StartupCo - full stack development using Node.js and PostgreSQL";
const lines = text.split('\n');
let content = 'BT /F1 12 Tf 40 750 Td 14 TL\n';
for (const line of lines) {
  const esc = line.split('\\').join('\\\\').split('(').join('\\(').split(')').join('\\)');
  content += '(' + esc + ') Tj T*\n';
}
content += 'ET';

const objs = [];
objs.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
objs.push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
objs.push('3 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 612 792] /Contents 5 0 R >>\nendobj\n');
objs.push('4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n');
const streamObj = '5 0 obj\n<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream\nendobj\n';
objs.push(streamObj);

let pdf = '%PDF-1.4\n';
const offsets = [];
for (const o of objs) {
  offsets.push(pdf.length);
  pdf += o;
}
const xrefStart = pdf.length;
pdf += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n';
for (const off of offsets) {
  pdf += String(off).padStart(10, '0') + ' 00000 n \n';
}
pdf += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xrefStart + '\n%%EOF';

fs.writeFileSync(__dirname + '/test-cv.pdf', pdf, 'binary');
console.log('wrote', __dirname + '/test-cv.pdf', pdf.length, 'bytes');
