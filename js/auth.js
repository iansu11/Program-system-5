// ==========================================
// 帳號系統與認證邏輯 (js/auth.js)
// ==========================================

async function handleAuthAction() {
    const email = document.getElementById('emailInput').value.trim();
    const pwd = document.getElementById('passwordInput').value;
    if (!email || !pwd) { alert("請輸入電子郵件與密碼"); return; }

    const mode = typeof isLoginMode !== 'undefined' ? isLoginMode : true;

    const actionBtn = document.getElementById('actionBtn');
    const originalText = actionBtn.innerText;
    actionBtn.innerText = mode ? '登入中...' : '註冊中...';
    actionBtn.disabled = true;

    if (mode) {
        window.isExplicitLoggingIn = true; // 標記正在明確登入
        try {
            const userCredential = await masterAuth.signInWithEmailAndPassword(email, pwd);
            const user = userCredential.user;
            
            // 明確登入：第一件要做的事情是去系統雲端查詢金鑰
            // 依據使用者建議，給予一小段緩衝時間確保 Firebase Auth 與 Firestore 狀態完全同步
            await new Promise(resolve => setTimeout(resolve, 800));
            // 強制從伺服器讀取，避免讀到舊的本地快取 (認為找不到文件)
            const doc = await masterDb.collection('userSettings').doc(user.uid).get({ source: 'server' });
            if (doc.exists && doc.data().firebaseConfig) {
                const configStr = doc.data().firebaseConfig;
                localStorage.setItem('oj_v15_firebaseConfig', configStr);
                const role = doc.data().role || 'user';
                localStorage.setItem('oj_v15_userRole', role);
                window.currentUserRole = role;

                // 結合金鑰進入系統
                const userConfig = JSON.parse(configStr);
                if (window.personalApp) await window.personalApp.delete();
                window.personalApp = firebase.initializeApp(userConfig, "PersonalCloud");
                await window.personalApp.auth().signInAnonymously();
                window.personalDb = window.personalApp.firestore();

                // 跳轉大廳
                if (window.location.protocol === 'file:') {
                    window.location.href = 'dashboard.html';
                } else {
                    window.location.href = '/source-selector';
                }
            } else {
                // 查不到金鑰或未註冊
                alert("尚未註冊帳號或未綁定雲端金鑰！");
                await masterAuth.signOut();
                window.isExplicitLoggingIn = false;
                actionBtn.innerText = originalText;
                actionBtn.disabled = false;
            }
        } catch (err) {
            alert("登入失敗：" + err.message);
            window.isExplicitLoggingIn = false;
            actionBtn.innerText = originalText;
            actionBtn.disabled = false;
        }
    } else {
        if (pwd.length < 6) { alert("密碼太短"); actionBtn.innerText = originalText; actionBtn.disabled = false; return; }
        const configStr = document.getElementById('registerConfigInput').value.trim();
        if (!configStr) { alert("請貼上Firebase 金鑰"); actionBtn.innerText = originalText; actionBtn.disabled = false; return; }
        
        try { JSON.parse(configStr); } catch(e) { alert("❌ JSON 格式錯誤"); actionBtn.innerText = originalText; actionBtn.disabled = false; return; }

        window.isExplicitLoggingIn = true; // 標記正在明確註冊
        try {
            const userCredential = await masterAuth.createUserWithEmailAndPassword(email, pwd);
            await masterDb.collection('userSettings').doc(userCredential.user.uid).set({
                firebaseConfig: configStr,
                role: 'user'
            });
            localStorage.setItem('oj_v15_firebaseConfig', configStr);
            localStorage.setItem('oj_v15_userRole', 'user');
            
            alert("成功註冊帳號並綁定雲端！");
            if (window.location.protocol === 'file:') {
                window.location.href = 'dashboard.html';
            } else {
                window.location.href = '/source-selector';
            }
        } catch(err) {
            alert("註冊失敗：" + err.message); 
            window.isExplicitLoggingIn = false;
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
            localStorage.removeItem('oj_v15_firebaseConfig');
            localStorage.removeItem('oj_v15_userRole');
            window.location.href = '/index.html'; 
        });
    }
}

// 監聽 Firebase 登入狀態改變
masterAuth.onAuthStateChanged(async (user) => {
    authInitialized = true;
    const isLoginPage = window.location.pathname.includes('login') || window.location.pathname.endsWith('index.html') || window.location.pathname === '/';

    if (user) {
        // 如果是按登入鍵後觸發的，交給 handleAuthAction 處理，不要在這裡動作
        if (window.isExplicitLoggingIn) return;

        currentUser = user;
        const userNameEls = document.querySelectorAll('.user-name-display');
        userNameEls.forEach(el => el.innerText = user.email);
        
        // 自動登入狀態 (例如重整頁面)，僅使用本地快取
        let userConfigStr = localStorage.getItem('oj_v15_firebaseConfig');
        
        // 如果沒有本地快取，強制將這個幽靈帳號登出，顯示登入畫面，確保使用者可以手動登入
        if (!userConfigStr) {
            await masterAuth.signOut();
            return;
        }

        // 若本地有 role 緩存則載入
        const cachedRole = localStorage.getItem('oj_v15_userRole');
        if (cachedRole) window.currentUserRole = cachedRole;

        try {
            const userConfig = JSON.parse(userConfigStr);
            
            // 啟動個人雲端
            if (personalApp) await personalApp.delete();
            personalApp = firebase.initializeApp(userConfig, "PersonalCloud");
            await personalApp.auth().signInAnonymously();
            personalDb = personalApp.firestore();
            
            // 如果目前在登入頁面，自動跳轉至儀表板
            if (isLoginPage && !window.disableAutoLoginRedirect) {
                if (window.location.protocol === 'file:') {
                    window.location.href = 'dashboard.html';
                } else {
                    window.location.href = '/source-selector';
                }
            }
            
            window.dispatchEvent(new Event('personalCloudReady'));
        } catch (err) {
            console.error(err);
            alert("初始化個人雲端失敗，請重新登入！");
            await masterAuth.signOut();
        }
    } else {
        currentUser = null;
        personalDb = null;
        
        // 如果不在登入頁面，強制導向登入頁
        if (!isLoginPage) {
            if (window.location.protocol === 'file:') {
                window.location.href = 'index.html';
            } else {
                window.location.href = '/index.html';
            }
        } else {
            const actionBtn = document.getElementById('actionBtn');
            if (actionBtn) {
                actionBtn.disabled = false;
                actionBtn.innerText = typeof isLoginMode !== 'undefined' && isLoginMode ? '登入系統' : '註冊並綁定雲端';
            }
            const leftCover = document.querySelector('.split-left');
            const rightForm = document.querySelector('.split-right');
            if (leftCover) leftCover.style.opacity = '1';
            if (rightForm) rightForm.style.opacity = '1';
        }
    }
});
