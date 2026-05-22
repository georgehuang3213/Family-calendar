const formData = new FormData();
const buffer = Buffer.from('test audio content');
const blob = new Blob([buffer], { type: 'audio/mp4' });
formData.append('file', blob, 'audio.mp4');
console.log('Blob size:', blob.size);
console.log('FormData:', formData);
