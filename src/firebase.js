import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// TODO: Replace with your Firebase config from the Firebase Console
// Go to: https://console.firebase.google.com/project/unit3quiz-v005-coo/settings/general
// Scroll to "Your apps" section and copy the config
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "unit3quiz-v005-coo.firebaseapp.com",
  projectId: "unit3quiz-v005-coo",
  storageBucket: "unit3quiz-v005-coo.firebasestorage.app",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);

