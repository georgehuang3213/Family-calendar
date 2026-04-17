import { getFirestore, collection, getDocs } from 'firebase/firestore';
import { initializeApp } from 'firebase/app';
import firebaseConfig from '../firebase-applet-config.json';
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function checkData() {
  try {
    const querySnapshot = await getDocs(collection(db, 'events'));
    console.log(`Found ${querySnapshot.size} documents in 'events' collection (named DB).`);
    if (querySnapshot.size > 0) {
        console.log('Sample data:', querySnapshot.docs[0].data());
    }
  } catch (error) {
    console.error('Error checking data:', error);
  }
}

checkData();
