import axios from 'axios';
async function test() {
  try {
    const res = await axios.post('https://script.google.com/macros/s/AKfycbzHmhXCD94w9IoX3LI4pDSy5FAcaMo39BPo-FL0yF9o2yUPvpEME0qitkX2k0sm5SY7Rg/exec', {
      action: 'delete',
      id: '123e4567-e89b-12d3-a456-426614174000',
      sheet: 'Sheet1'
    });
    console.log(res.data);
  } catch (e) {
    console.error(e.message);
  }
}
test();
