import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

const EXCEL_DATA = [
  { title: '家族旅遊', start_date: '2026/3/28', end_date: '2026/3/29', time: '', member_name: '全家', color: '#111827', companions: '' },
  { title: '排休', start_date: '2026/3/22', end_date: '2026/3/22', time: '', member_name: '黃喬裕', color: '#2563EB', companions: '' },
  { title: '排休', start_date: '2026/3/23', end_date: '2026/3/23', time: '', member_name: '黃喬裕', color: '#2563EB', companions: '' },
  { title: '排休', start_date: '2026/3/28', end_date: '2026/3/28', time: '', member_name: '黃喬裕', color: '#2563EB', companions: '' },
  { title: '排休', start_date: '2026/3/29', end_date: '2026/3/29', time: '', member_name: '黃喬裕', color: '#2563EB', companions: '' },
  { title: '排休', start_date: '2026/3/30', end_date: '2026/3/30', time: '', member_name: '黃喬裕', color: '#2563EB', companions: '' },
  { title: '排休', start_date: '2026/3/22', end_date: '2026/3/22', time: '', member_name: '郭力維', color: '#BE185D', companions: '' },
  { title: '排休', start_date: '2026/3/23', end_date: '2026/3/23', time: '', member_name: '郭力維', color: '#BE185D', companions: '' },
  { title: '排休', start_date: '2026/3/28', end_date: '2026/3/28', time: '', member_name: '郭力維', color: '#BE185D', companions: '' },
  { title: '排休', start_date: '2026/3/29', end_date: '2026/3/29', time: '', member_name: '郭力維', color: '#BE185D', companions: '' },
  { title: '日本關西櫻花五日遊', start_date: '2026/4/7', end_date: '2026/4/11', time: '', member_name: '江雪卿', color: '#E11D48', companions: '' },
  { title: '母親節大餐（膳香）', start_date: '2026/5/3', end_date: '2026/5/3', time: '17:30 - 19:30', member_name: '全家', color: '#111827', companions: '' },
  { title: '日本福岡八日遊', start_date: '2026/5/8', end_date: '2026/5/15', time: '00:00', member_name: '黃喬裕', color: '#2563EB', companions: '黃宣綾,黃宣綸,陳愉婷' },
  { title: '嘉義同學會', start_date: '2026/4/12', end_date: '2026/4/12', time: '09:00 - 19:40', member_name: '江雪卿', color: '#E11D48', companions: '' },
  { title: '掃墓', start_date: '2026/3/22', end_date: '2026/3/22', time: '08:30', member_name: '江雪卿', color: '#E11D48', companions: '黃喬裕' },
  { title: '綾演講決賽', start_date: '2026/4/18', end_date: '2026/4/18', time: '', member_name: '全家', color: '#111827', companions: '' },
  { title: '排休', start_date: '2026/4/3', end_date: '2026/4/3', time: '', member_name: '黃喬裕', color: '#2563EB', companions: '' },
  { title: '排休', start_date: '2026/4/6', end_date: '2026/4/6', time: '', member_name: '黃喬裕', color: '#2563EB', companions: '' },
  { title: '排休', start_date: '2026/4/7', end_date: '2026/4/7', time: '', member_name: '黃喬裕', color: '#2563EB', companions: '' },
  { title: '排休', start_date: '2026/4/12', end_date: '2026/4/12', time: '', member_name: '黃喬裕', color: '#2563EB', companions: '' },
  { title: '排休', start_date: '2026/4/13', end_date: '2026/4/13', time: '', member_name: '黃喬裕', color: '#2563EB', companions: '' },
  { title: '排休', start_date: '2026/4/18', end_date: '2026/4/18', time: '', member_name: '黃喬裕', color: '#2563EB', companions: '' },
  { title: '排休', start_date: '2026/4/19', end_date: '2026/4/19', time: '', member_name: '黃喬裕', color: '#2563EB', companions: '' },
  { title: '排休', start_date: '2026/4/26', end_date: '2026/4/26', time: '', member_name: '黃喬裕', color: '#2563EB', companions: '' },
  { title: '排休', start_date: '2026/4/27', end_date: '2026/4/27', time: '', member_name: '黃喬裕', color: '#2563EB', companions: '' },
  { title: '台南員工旅遊', start_date: '2026/4/10', end_date: '2026/4/10', time: '', member_name: '黃喬裕', color: '#2563EB', companions: '' },
  { title: '台東三日遊', start_date: '2026/6/7', end_date: '2026/6/9', time: '07:00 - 18:00', member_name: '江雪卿', color: '#E11D48', companions: '' },
  { title: '阿里山兩日', start_date: '2026/5/15', end_date: '2026/5/16', time: '06:00 - 18:00', member_name: '江雪卿', color: '#E11D48', companions: '' },
  { title: '排休', start_date: '2026/4/2', end_date: '2026/4/2', time: '', member_name: '郭力維', color: '#BE185D', companions: '' },
  { title: '排休', start_date: '2026/4/5', end_date: '2026/4/5', time: '', member_name: '郭力維', color: '#BE185D', companions: '' },
  { title: '排休', start_date: '2026/4/6', end_date: '2026/4/6', time: '', member_name: '郭力維', color: '#BE185D', companions: '' },
  { title: '排休', start_date: '2026/4/10', end_date: '2026/4/10', time: '', member_name: '郭力維', color: '#BE185D', companions: '' },
  { title: '排休', start_date: '2026/4/11', end_date: '2026/4/11', time: '', member_name: '郭力維', color: '#BE185D', companions: '' },
  { title: '排休', start_date: '2026/4/15', end_date: '2026/4/15', time: '', member_name: '郭力維', color: '#BE185D', companions: '' },
  { title: '排休', start_date: '2026/4/16', end_date: '2026/4/16', time: '', member_name: '郭力維', color: '#BE185D', companions: '' },
  { title: '排休', start_date: '2026/4/20', end_date: '2026/4/20', time: '', member_name: '郭力維', color: '#BE185D', companions: '' },
  { title: '排休', start_date: '2026/4/21', end_date: '2026/4/21', time: '', member_name: '郭力維', color: '#BE185D', companions: '' },
  { title: '排休', start_date: '2026/4/25', end_date: '2026/4/25', time: '', member_name: '郭力維', color: '#BE185D', companions: '' },
  { title: '排休', start_date: '2026/4/30', end_date: '2026/4/30', time: '', member_name: '郭力維', color: '#BE185D', companions: '' },
  { title: '上班', start_date: '2026/4/20', end_date: '2026/4/20', time: '08:00 - 17:30', member_name: '黃郁慈', color: '#EA580C', companions: '' },
  { title: '晚餐潤餅', start_date: '2026/4/6', end_date: '2026/4/6', time: '17:30 - 18:30', member_name: '全家', color: '#111827', companions: '全家' },
  { title: '排休', start_date: '2026/4/22', end_date: '2026/4/22', time: '', member_name: '黃喬裕', color: '#2563EB', companions: '' },
  { title: 'Test', start_date: '2026/3/27', end_date: '2026/3/28', time: '08:31 - 20:31', member_name: '全家', color: '#111827', companions: '全家' },
  { title: '上班', start_date: '2026/4/1', end_date: '2026/4/1', time: '08:00 - 17:30', member_name: '黃郁慈', color: '#EA580C', companions: '' },
  { title: '面交多功能抽屜手推車', start_date: '2026/4/4', end_date: '2026/4/4', time: '20:25 - 20:30', member_name: '黃郁慈', color: '#EA580C', companions: '' },
  { title: '艾莉絲看牙齒', start_date: '2026/4/14', end_date: '2026/4/14', time: '09:55 - 10:30', member_name: '郭品彤', color: '#0D9488', companions: '' },
  { title: '送貨', start_date: '2026/4/7', end_date: '2026/4/7', time: '09:15 - 13:30', member_name: '黃郁婷', color: '#0891B2', companions: '黃郁慈,郭品彤' },
  { title: '9點訂由布院之森', start_date: '2026/4/11', end_date: '2026/4/11', time: '08:55 - 09:00', member_name: '黃喬裕', color: '#2563EB', companions: '黃宣綸,黃宣綾,陳愉婷' },
  { title: '上班', start_date: '2026/4/28', end_date: '2026/4/28', time: '08:00 - 17:30', member_name: '黃郁慈', color: '#EA580C', companions: '' },
  { title: '上班', start_date: '2026/4/24', end_date: '2026/4/24', time: '08:00 - 17:30', member_name: '黃郁慈', color: '#EA580C', companions: '' },
  { title: '送貨', start_date: '2026/4/15', end_date: '2026/4/15', time: '09:15 - 12:15', member_name: '黃郁婷', color: '#DB2777', companions: '江雪卿,黃郁慈,郭品彤' },
  { title: '濟州島七日遊', start_date: '2026/10/10', end_date: '2026/10/16', time: '07:00 - 21:00', member_name: '江雪卿', color: '#E11D48', companions: '黃郁婷,黃力維,黃郁慈,郭品佑,郭品彤' },
  { title: '安適洗牙', start_date: '2026/4/21', end_date: '2026/4/21', time: '18:45 - 18:50', member_name: '黃郁慈', color: '#EA580C', companions: '郭品佑' },
  { title: '安適洗牙', start_date: '2026/4/21', end_date: '2026/4/21', time: '15:30 - 16:30', member_name: '黃郁婷', color: '#0891B2', companions: '江雪卿' },
  { title: '上班', start_date: '2026/4/27', end_date: '2026/4/27', time: '08:00 - 17:30', member_name: '黃郁慈', color: '#EA580C', companions: '' },
  { title: '上班', start_date: '2026/5/11', end_date: '2026/5/11', time: '08:00 - 17:30', member_name: '黃郁慈', color: '#EA580C', companions: '' },
  { title: '上班', start_date: '2026/5/6', end_date: '2026/5/6', time: '08:00 - 17:30', member_name: '黃郁慈', color: '#EA580C', companions: '' },
  { title: '上班', start_date: '2026/5/18', end_date: '2026/5/18', time: '08:00 - 17:30', member_name: '黃郁慈', color: '#EA580C', companions: '' },
  { title: '上班', start_date: '2026/5/22', end_date: '2026/5/22', time: '08:00 - 17:30', member_name: '黃郁慈', color: '#EA580C', companions: '' },
  { title: '中山回診', start_date: '2026/5/29', end_date: '2026/5/29', time: '14:00 - 15:00', member_name: '郭品佑', color: '#65A30D', companions: '黃宣綾,黃宣綸,黃郁慈,陳愉婷' },
  { title: '送貨', start_date: '2026/4/20', end_date: '2026/4/20', time: '09:30 - 13:30', member_name: '黃郁婷', color: '#DB2777', companions: '江雪卿,郭品彤' },
  { title: '送貨', start_date: '2026/4/29', end_date: '2026/4/29', time: '09:30 - 13:30', member_name: '黃郁婷', color: '#DB2777', companions: '江雪卿,郭品佑,郭品彤' },
  { title: '媽台北', start_date: '2026/4/22', end_date: '2026/4/22', time: '09:00 - 17:00', member_name: '江雪卿', color: '#E11D48', companions: '' },
  { title: '苗栗小木屋', start_date: '2026/5/8', end_date: '2026/5/9', time: '13:00 - 16:00', member_name: '江雪卿', color: '#E11D48', companions: '黃郁婷,黃宣綾,黃郁慈,郭品彤' },
  { title: '送貨', start_date: '2026/4/23', end_date: '2026/4/23', time: '09:30 - 13:30', member_name: '黃郁婷', color: '#DB2777', companions: '黃郁慈,陳愉婷,江雪卿' },
  { title: 'TEST', start_date: '2026/4/17', end_date: '2026/4/17', time: '00:00', member_name: '全家', color: '#111827', companions: '全家' },
];

async function importFromUpload() {
  try {
    console.log(`Starting import of ${EXCEL_DATA.length} records...`);
    for (const item of EXCEL_DATA) {
      // Need to format dates to yyyy-mm-dd
      const formatDate = (dateStr: string) => {
        const [y, m, d] = dateStr.split('/');
        return `${y}-${m.length === 1 ? '0' + m : m}-${d.length === 1 ? '0' + d : d}`;
      };
      
      const formattedItem = {
        ...item,
        start_date: formatDate(item.start_date),
        end_date: formatDate(item.end_date),
      };
      await addDoc(collection(db, 'events'), formattedItem);
      console.log(`Imported: ${item.title}`);
    }
    console.log('Import completed successfully.');
  } catch (error) {
    console.error('Import failed:', error);
  }
}

importFromUpload();
