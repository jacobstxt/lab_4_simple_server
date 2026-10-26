import { Command } from 'commander';
import http from 'node:http';
import fs from 'node:fs';

const program = new Command();

program
  .helpOption('--help', 'показати довідку') 
  .requiredOption('-i, --input <path>', 'шлях до файлу даних')
  .requiredOption('-h, --host <address>', 'адреса сервера')
  .requiredOption('-p, --port <number>', 'порт сервера')
  .option('-o, --output <path>', 'файл для запису останньої відповіді');

program.parse(process.argv);
const { input, host, port, output } = program.opts();


const portNumber = Number(port);
if (!Number.isInteger(portNumber) || portNumber < 0 || portNumber > 65535) {
  console.error('Port must be an integer from 0 to 65535');
  process.exit(1);
}

function sendJson(res, status, body) {
  const text = JSON.stringify(body);

  const send = (code, payload) => {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(payload);
  };

  if (!output) {
    send(status, text);
    return;
  }

  fs.writeFile(output, text, (err) => {
    if (err) {
      send(500, JSON.stringify({ error: 'Не вдалося записати відповідь у вихідний файл' }));
      return;
    }
    send(status, text);
  });
}

function toNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n)) {
      return n;
    }
  }
  return null;
}

function buildResult(records, showMfo, onlyNormal) {
  const result = [];

  for (const record of records) {
    const stateCode = toNumber(record?.COD_STATE);

    if (onlyNormal && stateCode !== 1) {
      continue;
    }

    const item = {};
    if (showMfo) {
      item.mfo_code = toNumber(record?.MFO);
    }
    item.name = typeof record?.SHORTNAME === 'string' ? record.SHORTNAME : null;
    item.state_code = stateCode;

    result.push(item);
  }

  return result;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname !== '/') {
    sendJson(res, 404, { error: 'Маршрут не знайдено' });
    return;
  }


  const showMfo = url.searchParams.get('mfo') === 'true';
  const onlyNormal = url.searchParams.get('normal') === 'true';

  fs.readFile(input, 'utf8', (err, text) => {
    if (err) {
      sendJson(res, 500, { error: 'Не вдалося прочитати файл даних' });
      return;
    }

    let records;
    try {
      records = JSON.parse(text);
    } catch {
      sendJson(res, 500, { error: 'Файл даних пошкоджено: це не коректний JSON' });
      return;
    }

    if (!Array.isArray(records)) {
      sendJson(res, 500, { error: 'Файл даних має містити JSON-масив' });
      return;
    }

    const result = buildResult(records, showMfo, onlyNormal);
    sendJson(res, 200, result);
  });
});

server.on('error', (err) => {
  console.error(`Server error: ${err.message}`);
  process.exit(1);
});

fs.access(input, fs.constants.R_OK, (err) => {
  if (err) {
    console.error('Cannot find input file');
    process.exit(1);
  }

  server.listen(portNumber, host, () => {
    console.log(`Server running at http://${host}:${portNumber}/`);
  });
});