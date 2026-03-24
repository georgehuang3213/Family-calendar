import http from 'http';

const data = JSON.stringify({ events: [] });

const req = http.request('http://localhost:3000/api/line/webhook', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-line-signature': 'invalid-signature',
    'Content-Length': Buffer.byteLength(data)
  }
}, (res) => {
  console.log('STATUS:', res.statusCode);
  console.log('HEADERS:', JSON.stringify(res.headers));
  res.on('data', d => process.stdout.write(d));
});
req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
});
req.write(data);
req.end();
