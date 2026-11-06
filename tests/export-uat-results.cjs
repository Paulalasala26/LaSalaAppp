const fs = require('node:fs');
const path = require('node:path');

const reportPath = path.resolve(process.argv[2] || 'test-results/report.json');
const outputPath = path.resolve(process.argv[3] || 'test-results/uat-results.csv');

if (!fs.existsSync(reportPath)) {
  console.error(`No existe el informe Playwright: ${reportPath}`);
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
const specs = [];
function collect(suites = []) {
  for (const suite of suites) {
    specs.push(...(suite.specs || []));
    collect(suite.suites || []);
  }
}
collect(report.suites || []);

const coverage = new Map();
const rangePattern = /UAT-(\d+)\s*(?:(?:–|—|-| a )\s*(?:UAT-)?(\d+))?/gu;
for (const spec of specs) {
  const tests = spec.tests || [];
  const attempts = tests.flatMap(test => test.results || []);
  const statuses = tests.map(test => test.status);
  let state = 'PASO_FIXTURE';
  if (statuses.some(status => status === 'skipped')) state = 'NO_EJECUTADO';
  else if (statuses.some(status => status === 'flaky') || (spec.ok && attempts.some(attempt => attempt.status !== 'passed'))) state = 'INESTABLE';
  else if (!spec.ok || statuses.some(status => status !== 'expected')) state = 'FALLO';

  const duration = attempts.reduce((sum, attempt) => sum + (attempt.duration || 0), 0);
  const evidence = {
    test: spec.title,
    file: spec.file,
    line: spec.line,
    duration,
    state
  };

  for (const match of spec.title.matchAll(rangePattern)) {
    const first = Number(match[1]);
    const last = match[2] ? Number(match[2]) : first;
    for (let id = Math.min(first, last); id <= Math.max(first, last); id++) {
      const key = `UAT-${String(id).padStart(3, '0')}`;
      if (!coverage.has(key)) coverage.set(key, []);
      coverage.get(key).push(evidence);
    }
  }
}

function csv(value) {
  const text = String(value ?? '').replace(/[\r\n]+/g, ' ');
  return `"${text.replace(/"/g, '""')}"`;
}

const runDate = report.stats?.startTime ? new Date(report.stats.startTime).toISOString() : '';
const header = ['UAT', 'Estado automatizado', 'Fecha de ejecución', 'Prueba', 'Archivo', 'Línea', 'Duración ms', 'Entorno', 'Alcance de datos'];
const rows = [header.join(';')];
for (const [id, evidence] of [...coverage.entries()].sort(([a], [b]) => Number(a.slice(4)) - Number(b.slice(4)))) {
  const combinedState = evidence.some(item => item.state === 'FALLO') ? 'FALLO'
    : evidence.some(item => item.state === 'INESTABLE') ? 'INESTABLE'
      : evidence.every(item => item.state === 'NO_EJECUTADO') ? 'NO_EJECUTADO'
        : 'PASA_FIXTURE';
  const first = evidence[0];
  rows.push([
    id,
    combinedState,
    runDate,
    evidence.map(item => item.test).join(' | '),
    evidence.map(item => item.file).join(' | '),
    evidence.map(item => item.line).join(' | '),
    evidence.reduce((sum, item) => sum + item.duration, 0),
    'Chromium',
    'Firebase interceptado; no acredita datos de TEST/PRD'
  ].map(csv).join(';'));
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `\uFEFF${rows.join('\r\n')}\r\n`, 'utf8');
console.log(`Generado ${outputPath}: ${coverage.size} UAT únicos desde ${specs.length} pruebas Playwright.`);
