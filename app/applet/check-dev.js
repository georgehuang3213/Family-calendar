import https from 'https';

https.get('https://ais-dev-h4dxrjv5ea6sjkshufuqk5-248877524671.asia-northeast1.run.app/api/line/webhook', (res) => {
  console.log('STATUS:', res.statusCode);
  console.log('HEADERS:', res.headers);
}).on('error', (e) => {
  console.error(e);
});
