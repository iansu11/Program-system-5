// ==========================================
// 帳號系統與認證邏輯 (js/auth.js)
// ==========================================

async function handleAuthAction() {
    const email = document.getElementById('emailInput').value.trim();
    const pwd = document.getElementById('passwordInput').value;
    if (!email || !pwd) { alert("請輸入電子郵件與密碼！"); return; }

    // isLoginMode 變數來自 login.html，若在其他頁面呼叫此函數，預設為 true
    const mode = typeof isLoginMode !== 'undefined' ? isLoginMode : true;

    const actionBtn = document.getElementById('actionBtn');
    const originalText = actionBtn.innerText;
    actionBtn.innerText = mode ? '登入中...' : '處理中...';
    actionBtn.disabled = true;

    if (mode) {
        masterAuth.signInWithEmailAndPassword(email, pwd).catch(err => {
            alert("登入失敗：" + err.message);
            actionBtn.innerText = originalText;
            actionBtn.disabled = false;
        });
    } else {
        if (pwd.length < 6) { alert("密碼太短！"); return; }
        const configStr = document.getElementById('registerConfigInput').value.trim();
        if (!configStr) { alert("請貼上 Firebase 金鑰！"); return; }
        
        try { JSON.parse(configStr); } catch(e) { alert("❌ JSON 格式錯誤！"); return; }

        try {
            const userCredential = await masterAuth.createUserWithEmailAndPassword(email, pwd);
            await masterDb.collection('userSettings').doc(userCredential.user.uid).set({
                firebaseConfig: configStr
            });
            alert("✅ 註冊成功並綁定雲端！");
        } catch(err) { 
            alert("註冊失敗：" + err.message); 
            actionBtn.innerText = originalText;
            actionBtn.disabled = false;
        }
    }
}

function logout() {
    if (confirm("確定要登出嗎？")) {
        masterAuth.signOut().then(() => {
            localStorage.removeItem('oj_v15_data');
            localStorage.removeItem('oj_v15_history');
            localStorage.removeItem('oj_v15_bank_name');
            localStorage.removeItem('oj_v15_bank_url');
            window.location.href = 'login.html'; 
        });
    }
}

// 監聽 Firebase 登入狀態變化
masterAuth.onAuthStateChanged(async (user) => {
    authInitialized = true;
    const isLoginPage = window.location.pathname.endsWith('login.html') || window.location.pathname.endsWith('/');

    if (user) {
        currentUser = user;
        const userNameEl = document.getElementById('user-name');
        if (userNameEl) userNameEl.innerText = user.email;
        
        try {
            // 🚀 效能優化：如果已經有快取金鑰，直接使用，不必每次換頁都重新等待雲端下載
            let userConfigStr = localStorage.getItem('oj_v15_firebaseConfig');
            
            if (!userConfigStr) {
                try {
                    const doc = await masterDb.collection('userSettings').doc(user.uid).get();
                    if (doc.exists && doc.data().firebaseConfig) {
                        userConfigStr = doc.data().firebaseConfig;
                        localStorage.setItem('oj_v15_firebaseConfig', userConfigStr);
                    }
                } catch (netErr) {
                    console.warn("無法從雲端取得金鑰，將嘗試使用本地快取：", netErr);
                }
            }

            if (userConfigStr) {
                const userConfig = JSON.parse(userConfigStr);
                
                // 啟動個人雲端
                if (personalApp) await personalApp.delete();
                personalApp = firebase.initializeApp(userConfig, "PersonalCloud");
                await personalApp.auth().signInAnonymously();
                personalDb = personalApp.firestore();
                
                // 如果目前在登入頁面，自動跳轉至儀表板
                if (isLoginPage) {
                    window.location.href = '/source-selector';
                }
                
                // 觸發頁面各自的資料載入邏輯 (透過 dispatchEvent)
                window.dispatchEvent(new Event('personalCloudReady'));

            } else {
                alert("未設定雲端系統將無法同步您的雲端進度");
                window.dispatchEvent(new Event('personalCloudReady'));
            }
        } catch (err) {
            console.error(err);
            alert("初始化個人雲端失敗，可能是網路不穩！請重新整理後再試。");
            window.dispatchEvent(new Event('personalCloudReady'));
        }
    } else {
        currentUser = null;
        personalDb = null;
        
        // 如果不在登入頁面，強制導向登入頁
        if (!isLoginPage) {
            window.location.href = 'login.html';
        } else {
            const actionBtn = document.getElementById('actionBtn');
            if (actionBtn) {
                actionBtn.disabled = false;
                actionBtn.innerText = typeof isLoginMode !== 'undefined' && isLoginMode ? '登入系統' : '註冊並綁定雲端';
            }
        }
    }
});
