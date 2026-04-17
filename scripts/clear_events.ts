import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function clearEvents() {
  const querySnapshot = await getDocs(collection(db, 'events'));
  for (const document of querySnapshot.docs) {
    await deleteDoc(doc(db, 'events', document.id));
    console.log(`Deleted: ${document.id}`);
  }
  console.log('Events cleared.');
}

clearEvents();
