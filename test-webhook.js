import http from 'http';

const req = http.request('http://localhost:3000/api/line/webhook', { method: 'POST' }, (res) => {
  console.log('STATUS:', res.statusCode);
  console.log('HEADERS:', JSON.stringify(res.headers));
});
req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
});
req.end();
