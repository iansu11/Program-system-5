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
let recent3Submissions = []; 
let currentBankName = ""; 
let currentBankUrl = "";  
let pendingUpdateDb = null;
let hasCloudDbData = false;
let authInitialized = false;

// [版本控制]
const SYSTEM_VERSION = "1.10.1";

// 全域排序變數，避免舊版程式碼產生 ReferenceError 導致畫面空白
let isBankSortMode = false;

// 預設關閉開發者除錯模式的變數

// V60: 多檔案支援的狀態變數
let currentFileIndex = -1; // -1 代表 main，0 以上代表 extraFiles 的 index
let adminMultiFiles = [];  // 後台設定專用的暫存物件
let adminCurrentFileIndex = -1; 

const localData = localStorage.getItem('oj_v15_data');
const localDataUrl = localStorage.getItem('oj_v15_data_url');
const localBankUrl = localStorage.getItem('oj_v15_bank_url');

if (localData && (!localDataUrl || localDataUrl === localBankUrl)) { 
    try { 
        db = JSON.parse(localData); 
    } catch(e) {} 
}

const localRecent3 = localStorage.getItem('oj_v15_recent3');
if (localRecent3) { try { recent3Submissions = JSON.parse(localRecent3); } catch(e) {} }

const localHistory = localStorage.getItem('oj_v15_history');
if (localHistory) { 
    try { 
        executionHistories = JSON.parse(localHistory); 
    } catch(e) {} 
}

const localBankName = localStorage.getItem('oj_v15_bank_name');
if (localBankName) currentBankName = localBankName;

if (localBankUrl) currentBankUrl = localBankUrl;

// ==========================================
// 雙雲端核心設定 (Master-Tenant 架構)
// ==========================================
const masterConfig = {
    apiKey: "AIzaSyCfmxMbNAnKE6t8rOk6nv7zNXUkheqGkoo",
    authDomain: "program-system-3.firebaseapp.com",
    projectId: "program-system-3",
    storageBucket: "program-system-3.firebasestorage.app",
    messagingSenderId: "494972479318",
    appId: "1:494972479318:web:ac4e7fd68b88339afe18f7",
    measurementId: "G-0TDMYYMXH9"
};

firebase.initializeApp(masterConfig);
const masterAuth = firebase.auth();
const masterDb = firebase.firestore();
let currentUser = null;

// [用戶端] 使用者的專屬 Firebase (之後動態生成)
let personalApp = null;
let personalDb = null;

// 🚀 效能優化 (Optimistic UI)：如果在本地已有快取的資料，不需要等待 Firebase 網路載入，直接瞬間渲染畫面！
document.addEventListener('DOMContentLoaded', () => {
    const isLoginPage = window.location.pathname.includes('login') || window.location.pathname.endsWith('index.html') || window.location.pathname === '/';
    if (!isLoginPage && db && db.version !== undefined) {
        // 先用本地資料渲染
        window.dispatchEvent(new Event('dbLoaded'));
    }
});





