// =========================================================
// Eager Load (預先載入) & 變數宣告
// =========================================================
let db = { 
    categories: [], 
    problems: [], 
    version: "",
    customBanks: [] // 存放使用者自訂的所有題庫
};

let executionHistories = {}; 
let currentBankName = ""; 
let currentBankUrl = "";  
let pendingUpdateDb = null;
let hasCloudDbData = false;
let authInitialized = false;
let isBankSortMode = false; // 控制自訂題庫排序模式的變數

// V60: 多檔案支援的狀態變數
let currentFileIndex = -1; // -1 代表 main，0 以上代表 extraFiles 的 index
let adminMultiFiles = [];  // 後台設定專用的暫存物件
let adminCurrentFileIndex = -1; 

const localData = localStorage.getItem('oj_v15_data');
if (localData) { 
    try { 
        db = JSON.parse(localData); 
    } catch(e) {} 
}

const localHistory = localStorage.getItem('oj_v15_history');
if (localHistory) { 
    try { 
        executionHistories = JSON.parse(localHistory); 
    } catch(e) {} 
}

const localBankName = localStorage.getItem('oj_v15_bank_name');
if (localBankName) currentBankName = localBankName;

const localBankUrl = localStorage.getItem('oj_v15_bank_url');
if (localBankUrl) currentBankUrl = localBankUrl;

// ==========================================
// 雙雲端核心設定 (Master-Tenant 架構)
// ==========================================
const masterConfig = {
    apiKey: "AIzaSyA3xQLjtZ95UzGJIpo2QmhKb4HEeifWhdI",
    authDomain: "program-system-2-ca5a8.firebaseapp.com",
    projectId: "program-system-2-ca5a8",
    storageBucket: "program-system-2-ca5a8.firebasestorage.app",
    messagingSenderId: "382670100845",
    appId: "1:382670100845:web:0d05e40672e18c6a5ce264",
    measurementId: "G-CNV16D9EFV"
};

firebase.initializeApp(masterConfig);
const masterAuth = firebase.auth();
const masterDb = firebase.firestore();
let currentUser = null;

// [用戶端] 使用者的專屬 Firebase (之後動態生成)
let personalApp = null;
let personalDb = null;
