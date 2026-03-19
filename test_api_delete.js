import axios from 'axios';
async function test() {
  try {
    const res = await axios.delete('http://localhost:3000/api/events/Sheet1-3');
    console.log(res.data);
  } catch (e) {
    console.error(e.response ? e.response.data : e.message);
  }
}
test();
