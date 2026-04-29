const firebaseConfig = {
        apiKey: "AIzaSyD_DeIkusZN7r92UNE_yrR509IC_ZCa21U",
        authDomain: "program-system-1a17b.firebaseapp.com",
        projectId: "program-system-1a17b",
        storageBucket: "program-system-1a17b.firebasestorage.app",
        messagingSenderId: "278539071308",
        appId: "1:278539071308:web:eac59d0bf1c2e40a0f29e9",
        measurementId: "G-N23Z373WW7"
    };

    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    const firestore = firebase.firestore();
    let currentUser = null;