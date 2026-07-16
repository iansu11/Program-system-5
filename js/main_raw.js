
    // =========================================================
    // 0. Eager Load (預先載入) & 變數宣告
    // =========================================================
    let db = { 
	categories: [], 
	problems: [], 
	version: "",
	customBanks: [] //存放使用者自訂的所有題庫
    };

    let executionHistories = {}; 
    let currentBankName = ""; 
    let currentBankUrl = "";  
    let currentView = 'view-login';
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
    // 1. 雙雲端核心設定 (Master-Tenant 架構)
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
    

    // ==========================================
    // 2. 帳號系統
    // ==========================================
    
    let isLoginMode = true;

    function switchAuthTab(mode) {
        isLoginMode = (mode === 'login');
        document.getElementById('tabLogin').style.color = isLoginMode ? 'white' : '#aaa';
        document.getElementById('tabLogin').style.borderBottomColor = isLoginMode ? 'var(--accent)' : 'transparent';
        document.getElementById('tabRegister').style.color = !isLoginMode ? 'white' : '#aaa';
        document.getElementById('tabRegister').style.borderBottomColor = !isLoginMode ? 'var(--accent)' : 'transparent';
        
        document.getElementById('registerConfigArea').style.display = isLoginMode ? 'none' : 'block';
        document.getElementById('actionBtn').innerText = isLoginMode ? '登入系統' : '註冊並綁定雲端';
        document.getElementById('actionBtn').className = isLoginMode ? 'btn btn-success' : 'btn btn-primary';
    }
        
    async function handleAuthAction() {
        const email = document.getElementById('emailInput').value.trim();
        const pwd = document.getElementById('passwordInput').value;
        if (!email || !pwd) { alert("請輸入電子郵件與密碼！"); return; }

        const actionBtn = document.getElementById('actionBtn');
        const originalText = actionBtn.innerText;
        actionBtn.innerText = isLoginMode ? '登入中...' : '處理中...';
        actionBtn.disabled = true;

        if (isLoginMode) {
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
                window.location.href = window.location.href.split('?')[0]; 
            });
        }
    }
   
    masterAuth.onAuthStateChanged(async (user) => {
	authInitialized = true;
        if (user) {
            currentUser = user;
            document.getElementById('user-name').innerText = user.email;
            
            try {
                // 去 Master 抓取 JSON 金鑰
                let userConfigStr = localStorage.getItem('oj_v15_firebaseConfig');
                try {
                    const doc = await masterDb.collection('userSettings').doc(user.uid).get();
                    if (doc.exists && doc.data().firebaseConfig) {
                        userConfigStr = doc.data().firebaseConfig;
                        localStorage.setItem('oj_v15_firebaseConfig', userConfigStr);
                    }
                } catch (netErr) {
                    console.warn("無法從雲端取得金鑰，將嘗試使用本地快取：", netErr);
                }

                if (userConfigStr) {
                    const userConfig = JSON.parse(userConfigStr);
                    
                    // 啟動個人雲端
                    if (personalApp) await personalApp.delete();
		    personalApp = firebase.initializeApp(userConfig, "PersonalCloud");
                    await personalApp.auth().signInAnonymously();
                    personalDb = personalApp.firestore();
                    
                    const storedUid = localStorage.getItem('oj_v15_uid');
                    const isSameUser = (storedUid === user.uid);
                    
                    if (isSameUser && db && db.problems && db.problems.length > 0) {
                        handleHashChange(); 
                        loadUserDataFromCloud(true); 
                    } else {
                        if (!isSameUser) {
                            db = { categories: [], problems: [], version: "" };
                            executionHistories = {};
                            localStorage.removeItem('oj_v15_data');
                            localStorage.removeItem('oj_v15_history');
                        }
                        await loadUserDataFromCloud(false); 
                    }

		    if (!window.location.hash || window.location.hash === '#/login') {
			window.location.hash = '/source-selector'; // 登入後若無指定目標或在登入頁，則跳轉到來源選擇器
		    }
		    handleHashChange();
		
                } else {
                    alert("找不到綁定資料，系統將無法同步您的雲端進度！");
                    // 移除自動登出，尊重使用者的要求
                }
            } catch (err) {
                console.error(err);
                // 移除自動登出，改為提示
                alert("連線個人雲端失敗，可能是網路不穩！請重新整理或稍後再試。");
            }
        } else {
            currentUser = null;
            personalDb = null;
            
            const actionBtn = document.getElementById('actionBtn');
            if (actionBtn) {
                actionBtn.disabled = false;
                actionBtn.innerText = isLoginMode ? '登入系統' : '註冊並綁定雲端';
            }

            window.location.hash = '/login';
	    handleHashChange(); //確保未登入時立刻顯示登入頁
        }
    });
    
    // ==========================================
    // 3. 雲端資料同步 & 自動更新機制
    // ==========================================
    
    async function loadUserDataFromCloud(isBackground = false) {
        if (!currentUser || !personalDb) return;
        try {
            const docSnap = await personalDb.collection('users').doc(currentUser.uid).get();
            if (docSnap.exists) {
                const data = docSnap.data();

                // 載入自訂題庫清單 (這是資料倉庫)
                if (data.userCustomBanks) {
                    const parsedBanks = JSON.parse(data.userCustomBanks);
                    try {
                        // 💡 核心修正：從子集合抓取完整的 customBanks 資料，突破 1MB 限制
                        const customBanksSnap = await personalDb.collection('users').doc(currentUser.uid).collection('customBanks').get();
                        if (!customBanksSnap.empty) {
                            const fullBanksMap = {};
                            customBanksSnap.docs.forEach(doc => { fullBanksMap[doc.id] = doc.data(); });
                            db.customBanks = parsedBanks.map(b => {
                                if (fullBanksMap[b.id]) return fullBanksMap[b.id];
                                return b; 
                            });
                        } else {
                            db.customBanks = parsedBanks;
                        }
                    } catch(e) {
                        console.error("載入自訂題庫內容失敗：", e);
                        db.customBanks = parsedBanks;
                    }
                }

                const isCustom = currentBankUrl && currentBankUrl.startsWith("local_custom_");

                if (!isCustom) {
                    // 【預設題庫模式】：讀取隔離進度
                    const safeKey = currentBankUrl ? currentBankUrl.replace(/[\.\#\$\[\]]/g, '_') : '';
                    if (safeKey && data.bankProgress && data.bankProgress[safeKey]) {
                        const prog = JSON.parse(data.bankProgress[safeKey]);
                        db.categories = prog.categories || [];
                        db.problems = prog.problems || [];
                        db.version = prog.version || "";
                    }
                    
                    // 🚀 救回遺失的自訂分類：如果 bankProgress 存檔失敗，從 customCategories 救回來
                    if (data.customCategories) {
                        Object.values(data.customCategories).forEach(cc => {
                            // 確保是屬於這個題庫的自訂分類
                            if (cc && cc.id && cc.bankUrl === currentBankUrl) {
                                const existingC = db.categories.find(c => c.id == cc.id);
                                if (existingC) {
                                    Object.assign(existingC, cc);
                                } else {
                                    db.categories.push(cc);
                                }
                            }
                        });
                    }

                    // 🚀 救回遺失的自訂題目：如果 bankProgress 存檔失敗（例如容量爆表），從 customProblems 救回來
                    if (data.customProblems) {
                        Object.values(data.customProblems).forEach(cp => {
                            if (cp && cp.id) {
                                const existingP = db.problems.find(p => p.id == cp.id);
                                if (existingP) {
                                    Object.assign(existingP, cp); // 合併修改
                                } else {
                                    // 確保這題屬於當前題庫 (檢查分類是否存在)
                                    if (db.categories.some(c => c.id == cp.catId)) {
                                        db.problems.push(cp);
                                    }
                                }
                            }
                        });
                    }
                } else {
                    // 【自訂題庫模式】：根據 ID 從 customBanks 倉庫中激活資料
                    const customId = currentBankUrl.replace("local_custom_", "");
                    const targetBank = db.customBanks.find(b => b.id === customId);
                    if (targetBank) {
                        // 💡 核心修正：如果是背景載入，絕對不要覆蓋目前正在編輯的自訂題庫內容！
                        // 因為本地 localStorage 的資料才是最新鮮的，雲端的可能是上次還沒存完的舊資料
                        if (!isBackground) {
                            db.categories = JSON.parse(JSON.stringify(targetBank.categories || []));
                            db.problems = JSON.parse(JSON.stringify(targetBank.problems || []));
                            db.version = targetBank.version || "";
                        }
                    }
                }
                
                if (data.historyData) executionHistories = JSON.parse(data.historyData);

                // 更新本地快取，確保下次重新整理拿到的也是對的
                localStorage.setItem('oj_v15_data', JSON.stringify(db));
                localStorage.setItem('oj_v15_history', JSON.stringify(executionHistories));
            }

            if (!isBackground) checkUrlAndLoad();
            checkForUpdates();
        } catch (e) { 
            console.error("讀取雲端失敗：", e); 
        }
    }
    

    async function checkForUpdates() {
        // 🛡️ 防護 1：如果是自訂題庫，絕對不發送 GitHub 更新請求
        if (!currentBankUrl || currentBankUrl.startsWith("local_custom_")) return; 
        
        const checkUrl = currentBankUrl; 
        try {
            const res = await fetch(checkUrl + '?t=' + new Date().getTime());
            if (res.ok) {
                const newDb = await res.json();
                if (newDb.version && newDb.version !== db.version) {
                    // 🛡️ 防護 2：打上網址標籤
                    newDb._sourceUrl = checkUrl; 
                    pendingUpdateDb = newDb;
                    if (currentView === 'view-categories') { 
                        document.getElementById('updateToast').style.display = 'flex'; 
                    }
                }
            }
        } catch (e) { 
            console.error("檢查更新失敗", e); 
        }
    }
    
    async function applyUpdate() {
        if (!pendingUpdateDb) return;
        if (pendingUpdateDb._sourceUrl !== currentBankUrl) {
            pendingUpdateDb = null;
            document.getElementById('updateToast').style.display = 'none';
            return;
        }

        const newDb = pendingUpdateDb;
        
        // 💡 海關安檢：強制淨化從 GitHub 下載的官方 JSON，拔除不小心殘留的自訂標籤
        (newDb.categories || []).forEach(c => delete c.isUserAdded);
        (newDb.problems || []).forEach(p => delete p.isUserAdded);
        
        // 確保陣列存在，避免 .some() 拋出錯誤導致整個流程中斷
        newDb.categories = newDb.categories || [];
        newDb.problems = newDb.problems || [];
        
        // 1. 精準抽出自訂內容：只要存在於本地/雲端，但「不在最新官方名單中」的，一律視為自訂擴充
        const userAddedCategories = db.categories.filter(oldC => !newDb.categories.some(newC => newC.id === oldC.id));
        const userAddedProblems = db.problems.filter(oldP => !newDb.problems.some(newP => newP.id === oldP.id));
        
        // 賦予免死金牌，讓系統知道這些是自訂擴充，並允許使用者刪除 (包含被官方淘汰的舊題目)
        userAddedCategories.forEach(c => c.isUserAdded = true);
        userAddedProblems.forEach(p => p.isUserAdded = true);

        // 2. 清除 Firebase 舊客製化紀錄，確保官方題庫覆蓋
        if (currentUser && personalDb) {
            let customUpdates = {};
            newDb.problems.forEach(p => {
                customUpdates[p.id] = firebase.firestore.FieldValue.delete();
            });
            try {
                await personalDb.collection('users').doc(currentUser.uid).set({
                    customProblems: customUpdates
                }, { merge: true });
            } catch(e) {}
        }

        // 💡 同步保留程式碼作答進度，避免官方更新後，自己寫的程式碼不見
        newDb.problems.forEach(newP => {
            const oldP = db.problems.find(p => p.id === newP.id);
            if (oldP) {
                if (oldP.code_cpp !== undefined) newP.code_cpp = oldP.code_cpp;
                if (oldP.code_python !== undefined) newP.code_python = oldP.code_python;
                if (oldP.lastLang !== undefined) newP.lastLang = oldP.lastLang;
                if (oldP.modelAnswer !== undefined) newP.modelAnswer = oldP.modelAnswer;
                if (oldP.multiFiles) newP.multiFiles = oldP.multiFiles;
            }
        });

        // 3. 組合：全新官方題庫 + 你的自訂擴充
        newDb.categories = [...newDb.categories, ...userAddedCategories];
        newDb.problems = [...newDb.problems, ...userAddedProblems];
        
        const preservedCustomBanks = db.customBanks || [];
        db = newDb; 
        db.customBanks = preservedCustomBanks;

        // 🚀 強制雲端覆蓋存檔
        await saveToLocal(true, false);
        
        document.getElementById('updateToast').style.display = 'none'; 
        pendingUpdateDb = null;
        alert("✅ 題庫已成功同步至最新版本！\n預設題目已全面更新，您的作答紀錄與自訂題目也已安全保留。"); 
        renderCategoryList();
    }
    

    function checkUrlAndLoad() {
        if (!window.location.hash || window.location.hash === '#/login') {
            window.location.hash = '/source-selector';
        } else {
            handleHashChange();
        }
    }
   

    async function saveToLocal(syncDbToCloud = true, syncHistoryToCloud = true) { 
        // 1. 如果是自訂題庫，先將當前編輯內容回填到 customBanks 陣列中
        const isCustom = currentBankUrl && currentBankUrl.startsWith("local_custom_");
        if (isCustom) {
            const customId = currentBankUrl.replace("local_custom_", "");
            const bankIdx = db.customBanks.findIndex(b => b.id === customId);
            if (bankIdx !== -1) {
                db.customBanks[bankIdx].categories = JSON.parse(JSON.stringify(db.categories));
                db.customBanks[bankIdx].problems = JSON.parse(JSON.stringify(db.problems));
                
                // 💡 儲存這個特定的 custom bank 到獨立的 subcollection
                if (syncDbToCloud && currentUser && personalDb) {
                    try {
                        personalDb.collection('users').doc(currentUser.uid).collection('customBanks').doc(customId).set(db.customBanks[bankIdx]);
                    } catch(e) {}
                }
            }
        }

        // 2. 本地端完整存檔 (做為保險)
        localStorage.setItem('oj_v15_data', JSON.stringify(db)); 
        localStorage.setItem('oj_v15_history', JSON.stringify(executionHistories));
        if (currentUser) localStorage.setItem('oj_v15_uid', currentUser.uid);

        if (!syncDbToCloud && !syncHistoryToCloud) return; 

        // 3. 雲端分離儲存
        if (currentUser && personalDb) { // 確保 personalDb 存在
            try {
                let updatePayload = {
                    lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
                };

                // 分流：根據當前環境選擇儲存欄位
                if (syncDbToCloud) {
                    // 💡 輕量化 userCustomBanks，只存基本資訊以維持排序與清單，解決主文件 1MB 限制
                    const lightweightBanks = (db.customBanks || []).map(b => ({ id: b.id, name: b.name, version: b.version }));
                    updatePayload.userCustomBanks = JSON.stringify(lightweightBanks);
                    
                    if (!isCustom) {
                        // 【移植 70-5 正常版邏輯】：利用網址產生獨立安全的 Key
                        const safeKey = currentBankUrl ? currentBankUrl.replace(/[\.\#\$\[\]]/g, '_') : '';
                        
                        updatePayload.bankProgress = {
                            [safeKey]: JSON.stringify({
                                categories: db.categories,
                                problems: db.problems,
                                version: db.version
                            })
                        };
                        
                        // 把版本號拉到最外層
                        updatePayload.bankVersions = {
                            [safeKey]: db.version || "未記錄"
                        };
                    }
                }

                if (syncHistoryToCloud) {
                    updatePayload.historyData = JSON.stringify(executionHistories);
                }

                // 寫入個人的資料庫
                await personalDb.collection('users').doc(currentUser.uid).set(updatePayload, { merge: true });
                console.log("✅ 雲端分離儲存成功");
            } catch (e) { 
                console.error("雲端同步失敗：", e); 
            }
        }
    }


    // 獨立儲存與局部更新函數
    async function syncProblemDeltaToCloud(probId, diff) {
        if (!currentUser) return;
        
        // 🛡️ 新增防護：如果是自訂題庫，因為前面的 saveToLocal 已經整包存好了，這裡直接阻擋，避免浪費雲端空間
        const isCustom = currentBankUrl && currentBankUrl.startsWith("local_custom_");
        if (isCustom) return; 

        let payload = { customProblems: {} };
        
        if (diff === null) {
            // 傳入 null 代表要把這題從雲端刪除
            payload.customProblems[probId] = firebase.firestore.FieldValue.delete();
        } else {
            // 針對「有修改的欄位」更新
            payload.customProblems[probId] = diff;
         }
        
        try {
            await personalDb.collection('users').doc(currentUser.uid).set(payload, { merge: true });
            console.log(`題目 ${probId} 已局部更新至雲端`, diff);
        } catch(e) {
            console.error("雲端局部更新失敗：", e);
        }
    }
    
    // 💡 新增：同步自訂分類至雲端 (解決 1MB 容量限制導致的自訂分類遺失問題)
    async function syncCategoryDeltaToCloud(catId, diff) {
        if (!currentUser) return;
        
        const isCustom = currentBankUrl && currentBankUrl.startsWith("local_custom_");
        if (isCustom) return; 

        let payload = { customCategories: {} };
        
        if (diff === null) {
            payload.customCategories[catId] = firebase.firestore.FieldValue.delete();
        } else {
            payload.customCategories[catId] = diff;
        }
        
        try {
            await personalDb.collection('users').doc(currentUser.uid).set(payload, { merge: true });
            console.log(`分類 ${catId} 雲端同步完成`, diff);
        } catch(e) {
            console.error(`分類 ${catId} 雲端同步失敗：`, e);
        }
    }
    
    
    // ==========================================
    // 4. 解題系統核心邏輯
    // ==========================================
    let currentCatId = null;
    let currentProbId = null;
    let currentCompileMode = 'wandbox'; // 全域三段式變數
    let pendingRestoreFileName = ""; 
    
    const defaultTemplates = {
        cpp: `#include <iostream>\nusing namespace std;\n\nint main() {\n    \n    \n    return 0;\n}`,
        python: `import sys\n\n# Python Solution\ndef main():\n    # Read input from stdin\n    lines = sys.stdin.read().splitlines()\n    # Write logic here\n    pass\n\nif __name__ == "__main__":\n    main()`
    };

    let editor = null;
    let isCatSortMode = false;
    let isProbSortMode = false;
    let currentFontSize = 16;
    let adminTempTemplates = { cpp: "", python: "" };
    let currentAdminLang = 'cpp';

    window.onload = function() {
        editor = ace.edit("editor");
        editor.setTheme("ace/theme/twilight");
        editor.session.setMode("ace/mode/c_cpp");
        editor.setFontSize(currentFontSize);
        editor.setShowPrintMargin(false);
        
        window.addEventListener('hashchange', handleHashChange);
        initResizer(); 
        initAdminResizer(); 
        enableTabInTextarea('editTemplate'); 
        enableTabInTextarea('modelAnswerInput');
	
	
	
	// ===== 新增：登入/註冊欄位的 Enter 快捷鍵 =====
	const emailInput = document.getElementById('emailInput');
	const passwordInput = document.getElementById('passwordInput');
    
	if (emailInput && passwordInput) {
	    // Email 欄位按下 Enter，焦點跳到密碼欄位
	    emailInput.addEventListener('keydown', function(e) {
		if (e.key === 'Enter') {
		    e.preventDefault(); // 避免觸發網頁預設的換行或提交行為
		    passwordInput.focus();
		}
	    });
        
	    // 密碼欄位按下 Enter，直接執行登入/註冊流程
	    passwordInput.addEventListener('keydown', function(e) {
		if (e.key === 'Enter') {
		    e.preventDefault();
		    handleAuthAction();
		}
	    });
	}
	// ==================================
	handleHashChange();
    };

   
    function handleHashChange() {
        if (!authInitialized) return;

        // 1. 取得路徑
        const hash = window.location.hash || '#/source-selector'; 
        const [path, queryString] = hash.substring(1).split('?');
        const params = new URLSearchParams(queryString || '');

        // 2. 【優先】公開頁面判斷：讓教學頁網址與畫面保持同步，不被登入邏輯攔截
        if (path === '/firebase-tutorial') {
            showView('view-firebase-tutorial');
            return; 
        }

        // 3. 【守門員】登入檢查：只攔截「非公開」且「未登入」的存取
        if (!currentUser) {
            showView('view-login');
            return;
        }

        // 4. 【私人頁面】路徑判斷
        if (path === '/login' || path === '') {
            window.location.hash = '/source-selector';
            return;
        }

        if (path === '/source-selector') {
            const nameEl = document.getElementById('user-name');
            if (nameEl) nameEl.innerText = currentUser.email;
            
            const emailEl = document.getElementById('sourceSelectorUserEmail');
            if (emailEl) emailEl.innerText = "目前登入：" + currentUser.email;
            
            showView('view-source-selector');
        } 
        else if (path === '/custom-portal') {
            renderCustomPortal();
            showView('view-custom-portal');
        }
        else if (path === '/portal') {
            showView('view-portal');
        } 
        else if (path === '/categories') {
            currentCatId = null;
            
            //確保重新整理後，標題能顯示目前變數中的題庫名稱
            if (currentBankName) {
                const nameEl = document.getElementById('currentBankName');
                if (nameEl) nameEl.innerHTML = `<i class="fa-solid fa-folder-open" style="color: #60a5fa; margin-right: 8px;"></i> 目前題庫: ` + currentBankName;
            }
            
            renderCategoryList();
            showView('view-categories');
        } 
        else if (path === '/problem-list') {
            const catId = params.get('catId');
            if (catId) currentCatId = catId;
            renderProblemList();
            showView('view-problem-list');
        } 
        else if (path === '/workspace') {
            const probId = params.get('probId');
            if (probId) {
                const fromAdmin = (currentView === 'view-admin');
                _enterWorkspaceInternal(probId, fromAdmin);
            }
        } 
        else if (path === '/admin') {
            const probId = params.get('probId');
            if (probId) {
                currentProbId = probId;
                _goToAdminInternal();
            }
        } else {
            // 預設跳轉大廳，避免未知路徑導致白畫面
            showView('view-portal');
        }
    }

    
    //切換自訂題庫排序模式
    function toggleBankSortMode() {
        isBankSortMode = !isBankSortMode;
        const btn = document.getElementById('bankSortBtn');
        if (btn) {
            btn.innerText = isBankSortMode ? "✅ 完成排序" : "⇅ 調整順序";
            btn.className = isBankSortMode ? "btn btn-danger" : "btn btn-outline";
            if (!isBankSortMode) {
                // 結束排序時恢復白色樣式
                btn.style.color = "white";
                btn.style.borderColor = "white";
            }
        }
        renderCustomPortal(); // 重新渲染列表以套用模式
    }
    
    //儲存自訂題庫新順序的邏輯 (搭配排序功能)
    function saveBankOrder() {
        const cards = document.querySelectorAll('#customBankList .bank-btn');
        const newOrder = [];
        cards.forEach(card => {
            const bank = db.customBanks.find(b => String(b.id) === String(card.dataset.id));
            if (bank) newOrder.push(bank);
        });
        if (cards.length > 0 && newOrder.length === 0) return;
        db.customBanks = newOrder;
        saveToLocal(true, false); 
    }
    
    // 渲染自訂題庫清單
    function renderCustomPortal() {
        const container = document.getElementById('customBankList');
        container.innerHTML = '';
        
        if (isBankSortMode) {
            container.classList.add('sort-mode');
        } else {
            container.classList.remove('sort-mode');
        }

        (db.customBanks || []).forEach((bank, idx) => {
            const card = document.createElement('div');
            card.className = 'bank-btn';
            card.style.position = 'relative';
            card.style.padding = '40px 20px'; // 加大自訂題庫卡片高度
            card.setAttribute('draggable', isBankSortMode);
            card.dataset.idx = idx; // 紀錄原始索引 (保留給 onclick 使用)
            card.dataset.id = bank.id; // 紀錄唯一 ID (排序用)
            
            // 排序模式下不顯示操作按鈕，非排序模式顯示更名與刪除
            const actionsHtml = isBankSortMode ? '' : `
                <div style="position: absolute; top: 10px; right: 10px; display: flex; gap: 5px;">
                    <button class="prob-btn-icon" style="color: #1e3a8a; background: rgba(0,0,0,0.05);" onclick="renameCustomBank(event, ${idx})" title="更名"><i class="fa-solid fa-pen"></i></button>
                    <button class="prob-btn-icon" style="color: #ef4444; background: rgba(0,0,0,0.05);" onclick="deleteCustomBank(event, ${idx})" title="刪除">✕</button>
                </div>
            `;

            card.innerHTML = `
                <div onclick="if(!isBankSortMode) loadCustomBank(${idx})" style="width:100%; height:100%; display:flex; flex-direction:column; align-items:flex-start; justify-content:center; text-align:left; padding-left: 5px; cursor: ${isBankSortMode ? 'grab' : 'pointer'};">
                    <span style="font-size:1.5rem;"><i class="fa-solid fa-folder-open" style="color: #60a5fa; margin-right: 8px;"></i> ${bank.name}</span>
                    <span class="bank-desc" style="color: inherit;">${bank.problems ? bank.problems.length : 0} 題</span>
                </div>
                <div class="bank-actions">
                    <button class="btn btn-outline btn-sm" style="background: white; color: #333; padding: 4px 8px; font-size: 0.85rem; border-color: #ccc;" onclick="renameCustomBank(event, ${idx})" title="更名"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn btn-outline btn-sm" style="background: white; color: #f44747; border-color: #f44747; padding: 4px 8px; font-size: 0.85rem;" onclick="deleteCustomBank(event, ${idx})" title="刪除"><i class="fa-solid fa-trash"></i></button>
                </div>
            `;
            container.appendChild(card);
        });

        // 如果在排序模式，啟動拖曳功能
        if (isBankSortMode) {
            enableDragSort('customBankList', 'bank-btn', saveBankOrder);
        }
    }
    

    // 新增自訂題庫
    async function addCustomBank() {
    	const name = prompt("請輸入自訂題庫名稱：");
    	if (!name) return;
	
	// 防呆機制，如果舊資料沒有這個陣列，就幫它建一個空的
	if (!db.customBanks) {
	    db.customBanks = [];
	}
    
        const newBank = {
            id: "custom_" + Date.now(),
            name: name,
            categories: [],
            problems: [],
            version: "custom-1.0"
        };
    	db.customBanks.push(newBank);
    
        const btn = document.querySelector('#view-custom-portal .btn-success');
        if (btn) { btn.disabled = true; btn.innerText = "⏳ 建立中..."; }
        await saveToLocal(true, false); // 同步到使用者雲端
        
        // 💡 同步寫入子集合
        if (currentUser && personalDb) {
            try {
                await personalDb.collection('users').doc(currentUser.uid).collection('customBanks').doc(newBank.id).set(newBank);
            } catch(e) {}
        }
        
        if (btn) { btn.disabled = false; btn.innerText = "+ 新增題庫"; }
        renderCustomPortal();
    }
    
    //更名功能
    async function renameCustomBank(e, idx) {
        e.stopPropagation(); // 防止觸發進入題庫的點擊事件
        const oldName = db.customBanks[idx].name;
        const newName = prompt("請輸入新的題庫名稱：", oldName);
        
        if (newName && newName.trim() !== "" && newName !== oldName) {
            db.customBanks[idx].name = newName.trim();
            
            // 💡 如果更改的是目前正在使用的題庫，同步更新名稱
            if (currentBankUrl === "local_custom_" + db.customBanks[idx].id) {
                currentBankName = newName.trim();
                localStorage.setItem('oj_v15_bank_name', currentBankName);
                const bankNameEl = document.getElementById('currentBankName');
                if (bankNameEl) bankNameEl.innerHTML = `<i class="fa-solid fa-folder-open" style="color: #60a5fa; margin-right: 8px;"></i> 目前題庫: ` + currentBankName;
            }
            
            const btn = e.target;
            const originalText = btn.innerText;
            if (btn) { btn.disabled = true; btn.innerText = "⏳"; }
            await saveToLocal(true, false); // 同步到雲端與本地
            
            // 💡 同步到子集合
            if (currentUser && personalDb) {
                try {
                    await personalDb.collection('users').doc(currentUser.uid).collection('customBanks').doc(db.customBanks[idx].id).set({ name: newName.trim() }, { merge: true });
                } catch(e) {}
            }
            
            if (btn) { btn.disabled = false; btn.innerText = originalText; }
            renderCustomPortal();    // 立即重新渲染畫面
        }
    }
    
    // 載入特定的自訂題庫內容到系統主體   
    async function loadCustomBank(idx) {
        // 🚀 UI 防呆：加入載入中動畫並鎖定全域按鈕，防止重複點擊
        const container = document.getElementById('customBankList');
        const cards = container.querySelectorAll('.bank-btn');
        let clickedCard = null;
        let originalContent = "";
        
        cards.forEach(card => {
            if (parseInt(card.dataset.idx) === idx) {
                clickedCard = card.querySelector('div[onclick]');
                if (clickedCard) {
                    originalContent = clickedCard.innerHTML;
                    clickedCard.innerHTML = `<span style="font-size:1.5rem; font-weight:bold;">⏳ 載入中...</span><span class="bank-desc" style="color: inherit;">儲存並切換題庫</span>`;
                }
            }
            card.style.pointerEvents = 'none';
            card.style.opacity = '0.6';
        });

        try {
            // 先存一下目前在玩的東西
            await saveToLocal(true, false);

        // 🛡️ 防護 4：強制清空等待中的更新包與彈窗
        pendingUpdateDb = null;
        const toast = document.getElementById('updateToast');
        if (toast) toast.style.display = 'none';

        const selected = db.customBanks[idx];
        currentBankName = selected.name;
        currentBankUrl = "local_custom_" + selected.id;

        // 徹底切換資料主體
        db.categories = JSON.parse(JSON.stringify(selected.categories || []));
        db.problems = JSON.parse(JSON.stringify(selected.problems || []));
        db.version = selected.version;

        // 💡 核心修正：切換完題庫資料後，立刻寫入 localStorage 的 data
        // 否則如果使用者此時按下 F5，會讀取到「新網址」但「舊題庫內容」，導致資料錯亂！
        localStorage.setItem('oj_v15_data', JSON.stringify(db));

        localStorage.setItem('oj_v15_bank_name', currentBankName);
        localStorage.setItem('oj_v15_bank_url', currentBankUrl);
        
        const bankNameEl = document.getElementById('currentBankName');
        if (bankNameEl) bankNameEl.innerHTML = `<i class="fa-solid fa-folder-open" style="color: #60a5fa; margin-right: 8px;"></i> 目前題庫: ` + currentBankName;
        
        window.location.hash = '/categories';
        
        } catch (e) {
            console.error("切換題庫發生錯誤", e);
            alert("切換題庫時發生錯誤！");
        } finally {
            // 🚀 恢復按鈕狀態
            cards.forEach(card => {
                card.style.pointerEvents = 'auto';
                card.style.opacity = '1';
            });
            if (clickedCard && originalContent) {
                clickedCard.innerHTML = originalContent;
            }
        }
    } 

    // 刪除自訂題庫
    async function deleteCustomBank(e, idx) {
        e.stopPropagation();
        if (confirm(`確定要刪除自訂題庫「${db.customBanks[idx].name}」嗎？此動作無法復原。`)) {
            db.customBanks.splice(idx, 1);
            const btn = e.target;
            if (btn) { btn.disabled = true; btn.innerText = "⏳"; }
            await saveToLocal(true, false);
            renderCustomPortal();
    	}
    }
       
    
    async function fetchAndLoadBank(jsonUrl, displayName, forceReset = false) {
        if (!currentUser) { alert("請先登入帳號！"); return; }

        pendingUpdateDb = null;
        const toast = document.getElementById('updateToast');
        if (toast) toast.style.display = 'none'; 
        
        // 🚀 UI 防呆：加入載入中動畫並鎖定全域按鈕
        const buttons = document.querySelectorAll('.bank-btn');
        let clickedBtn = null;
        let originalContent = "";
        buttons.forEach(btn => {
            if (btn.getAttribute('onclick') && btn.getAttribute('onclick').includes(jsonUrl)) {
                clickedBtn = btn;
                originalContent = btn.innerHTML;
                btn.innerHTML = `<span style="font-size: 1.5rem; font-weight:bold;">⏳ 載入中...</span><span class="bank-desc">同步雲端資料</span>`;
            }
            btn.style.pointerEvents = 'none';
            btn.style.opacity = '0.6';
        });

        try {
            // 🚀 效能優化：平行化下載 GitHub 題庫與 Firebase 雲端進度，節省一半以上的等待時間
            const fetchPromise = fetch(jsonUrl).then(res => {
                if (!res.ok) throw new Error("伺服器回傳狀態：" + res.status);
                return res.json();
            });
            const dbPromise = personalDb ? personalDb.collection('users').doc(currentUser.uid).get() : Promise.resolve(null);
            
            const [newDb, docSnap] = await Promise.all([fetchPromise, dbPromise]);
            
            // 💡 海關安檢：強制淨化從 GitHub 下載的官方 JSON，拔除不小心殘留的自訂標籤
            (newDb.categories || []).forEach(c => delete c.isUserAdded);
            (newDb.problems || []).forEach(p => delete p.isUserAdded);
            
            // 確保陣列存在，避免 .some() 拋出錯誤導致整個流程中斷
            newDb.categories = newDb.categories || [];
            newDb.problems = newDb.problems || [];
            
            let shouldSyncDb = forceReset;

            // --- 1. 從 Firebase 抓取你在這份題庫的「雲端歷史存檔」 ---
            let savedCategories = [];
            let savedProblems = [];
            const safeKey = jsonUrl.replace(/[\.\#\$\[\]]/g, '_');

            if (personalDb) {
                try {
                    // docSnap 已經在上方透過 Promise.all 取得了
                    if (docSnap && docSnap.exists) {
                        const data = docSnap.data();
                        if (data.bankProgress && data.bankProgress[safeKey]) {
                            const prog = JSON.parse(data.bankProgress[safeKey]);
                            savedCategories = prog.categories || [];
                            savedProblems = prog.problems || [];
                        }
                        
                        // 🚀 救回遺失的自訂分類：如果 bankProgress 存檔失敗，從 customCategories 的備份中撈回來
                        if (data.customCategories) {
                            Object.values(data.customCategories).forEach(cc => {
                                // 檢查是否屬於當前正在載入的題庫 (jsonUrl)
                                if (cc && cc.id && cc.bankUrl === jsonUrl) {
                                    const existingC = savedCategories.find(c => c.id == cc.id);
                                    if (existingC) {
                                        Object.assign(existingC, cc);
                                    } else {
                                        savedCategories.push(cc);
                                    }
                                }
                            });
                        }

                        // 🚀 救回遺失的自訂題目：如果 bankProgress 存檔失敗，從 customProblems 的備份中撈回來
                        if (data.customProblems) {
                            Object.values(data.customProblems).forEach(cp => {
                                if (cp && cp.id) {
                                    const existingP = savedProblems.find(p => p.id == cp.id);
                                    if (existingP) {
                                        Object.assign(existingP, cp);
                                    } else {
                                        // 確保這題屬於當前題庫 (分類在官方名單或本地存檔中)
                                        const isForThisBank = newDb.categories.some(c => c.id == cp.catId) || savedCategories.some(c => c.id == cp.catId);
                                        if (isForThisBank) {
                                            savedProblems.push(cp);
                                        }
                                    }
                                }
                            });
                        }
                    }
                } catch (e) { console.error("讀取目標題庫進度失敗", e); }
            }

            // --- 2. 絕對防呆分離：只要雲端有，但 GitHub 最新官方沒有的，統統視為「自訂擴充」 ---
            const userAddedCategories = savedCategories.filter(oldC => !newDb.categories.some(newC => newC.id === oldC.id));
            const userAddedProblems = savedProblems.filter(oldP => !newDb.problems.some(newP => newP.id === oldP.id));
            
            // 賦予免死金牌，讓系統知道這些是自訂擴充，並允許使用者刪除 (包含被官方淘汰的舊題目)
            userAddedCategories.forEach(c => c.isUserAdded = true);
            userAddedProblems.forEach(p => p.isUserAdded = true);

            // --- 3. 處理預設題庫合併 (🚀 這裡就是你漏改的關鍵！) ---
            const bankVersions = JSON.parse(localStorage.getItem('oj_v15_bank_versions') || '{}');
            const lastSyncedVersion = bankVersions[jsonUrl];
            const isUpdate = (!forceReset && newDb.version && lastSyncedVersion !== undefined && newDb.version !== lastSyncedVersion);

            if (forceReset || isUpdate) {
                shouldSyncDb = true; 
                // 【強制覆蓋模式】：有新版本時，用官方題庫覆蓋你修改的敘述，只保留程式碼
                if (currentUser && personalDb && isUpdate) {
                    let customUpdates = {};
                    newDb.problems.forEach(p => { customUpdates[p.id] = firebase.firestore.FieldValue.delete(); });
                    try { await personalDb.collection('users').doc(currentUser.uid).set({ customProblems: customUpdates }, { merge: true }); } catch(e) {}
                }

                newDb.problems.forEach(newP => {
                    const oldP = savedProblems.find(p => p.id === newP.id);
                    if (oldP) {
                        if (oldP.code_cpp !== undefined) newP.code_cpp = oldP.code_cpp;
                        if (oldP.code_python !== undefined) newP.code_python = oldP.code_python;
                        if (oldP.lastLang !== undefined) newP.lastLang = oldP.lastLang;
                        if (oldP.modelAnswer !== undefined) newP.modelAnswer = oldP.modelAnswer; 
                        if (oldP.multiFiles) newP.multiFiles = oldP.multiFiles; 
                    }
                });
            } else {
                // 💡【一般切換模式】無損載入：完整保留你對官方題目做的任何修改 (包含標題、敘述、測資)
                newDb.categories = newDb.categories.map(newC => {
                    const oldC = savedCategories.find(c => c.id === newC.id);
                    return oldC ? Object.assign({}, newC, oldC) : newC;
                });
                newDb.problems = newDb.problems.map(newP => {
                    const oldP = savedProblems.find(p => p.id === newP.id);
                    return oldP ? Object.assign({}, newP, oldP) : newP;
                });
            }

            // --- 4. 完美組合：官方版 + 自訂擴充 ---
            db.categories = [...newDb.categories, ...userAddedCategories];
            db.problems = [...newDb.problems, ...userAddedProblems];
            db.version = newDb.version || (userAddedProblems.length > 0 ? "保留進度版" : ""); 

            const preservedCustomBanks = db.customBanks || [];
            db.customBanks = preservedCustomBanks;

            currentBankUrl = jsonUrl; 
            currentBankName = displayName || jsonUrl;
            bankVersions[jsonUrl] = db.version;
            localStorage.setItem('oj_v15_bank_versions', JSON.stringify(bankVersions));
            localStorage.setItem('oj_v15_bank_name', currentBankName); 
            localStorage.setItem('oj_v15_bank_url', currentBankUrl);
            
            const bankNameEl = document.getElementById('currentBankName');
            if (bankNameEl) bankNameEl.innerHTML = `<i class="fa-solid fa-folder-open" style="color: #60a5fa; margin-right: 8px;"></i> 目前題庫: ` + currentBankName;
                
            saveToLocal(shouldSyncDb, false);      
            window.location.hash = '/categories';
            checkForUpdates();

        } catch (err) { 
            alert("載入失敗！請確認 GitHub 檔案是否存在\n\n詳細錯誤：" + err.message); 
        } finally {
            // 🚀 恢復按鈕狀態：無論成功或失敗都解鎖按鈕
            buttons.forEach(btn => {
                btn.style.pointerEvents = 'auto';
                btn.style.opacity = '1';
            });
            if (clickedBtn && originalContent) {
                clickedBtn.innerHTML = originalContent;
            }
        }
    }
    
    
    
        
    function backToPortal() { 
        window.location.hash = '/portal';
    }

    async function resetCurrentBank() { 
        if (!currentBankUrl) { 
            alert("目前是空白狀態，無法重新載入。"); 
            return; 
        } 
        if (confirm("⚠️ 警告：這將會清除「預設題庫」的所有自訂設定與代碼，並重新下載最新題庫！\n(您自行新增的題目與分類將會被安全保留，執行紀錄也不會消失)")) { 
            // 將清除邏輯交由 fetchAndLoadBank 在比對後執行
            fetchAndLoadBank(currentBankUrl, currentBankName, true); 
        } 
    }
    
    function hardResetAll() { 
        if (confirm("⚠️ 警告：這將會清除所有資料，讓系統回到「完全空白」狀態！確定嗎？")) { 
            db = { categories: [], problems: [], version: "" }; 
            currentBankName = "自訂新題庫 (空白)"; 
            currentBankUrl = ""; 
            localStorage.setItem('oj_v15_bank_name', currentBankName); 
            localStorage.removeItem('oj_v15_bank_url'); 
            saveToLocal(); 
            document.getElementById('currentBankName').innerHTML = `<i class="fa-solid fa-folder-open" style="color: #60a5fa; margin-right: 8px;"></i> ` + currentBankName; 
            renderCategoryList(); 
        } 
    }

    function enableTabInTextarea(id) {
        const el = document.getElementById(id); 
        if (!el) return;
        el.addEventListener('keydown', function(e) {
            if (e.key === 'Tab') { 
                e.preventDefault(); 
                const start = this.selectionStart; 
                const end = this.selectionEnd; 
                this.value = this.value.substring(0, start) + "    " + this.value.substring(end); 
                this.selectionStart = this.selectionEnd = start + 4; 
            }
        });
    }

    function autoResize(el) { 
        el.style.height = 'auto'; 
        el.style.height = el.scrollHeight + 'px'; 
    }

    function initResizer() {
        const handle = document.getElementById('dragHandle'); 
        const consoleArea = document.getElementById('consoleArea'); 
        const paneRight = document.getElementById('paneRight'); 
        const editorDiv = document.getElementById('editor');
        
        handle.addEventListener('mousedown', function(e) {
            e.preventDefault(); 
            document.body.classList.add('resizing'); 
            editorDiv.style.pointerEvents = 'none';
            const startY = e.clientY; 
            const startHeight = consoleArea.offsetHeight; 
            const paneHeight = paneRight.offsetHeight;
            
            function doDrag(e) { 
                const deltaY = startY - e.clientY; 
                let newHeight = startHeight + deltaY; 
                if (newHeight < 40) newHeight = 40; 
                if (newHeight > paneHeight - 100) newHeight = paneHeight - 100; 
                consoleArea.style.height = newHeight + 'px'; 
                editor.resize(); 
            }
            function stopDrag() { 
                document.removeEventListener('mousemove', doDrag); 
                document.removeEventListener('mouseup', stopDrag); 
                document.body.classList.remove('resizing'); 
                editorDiv.style.pointerEvents = 'auto'; 
            }
            
            document.addEventListener('mousemove', doDrag); 
            document.addEventListener('mouseup', stopDrag);
        });
    }

    function initAdminResizer() {
        const handle = document.getElementById('adminDragHandle'); 
        const bottomArea = document.getElementById('adminRowBottom');
        
        handle.addEventListener('mousedown', function(e) {
            e.preventDefault(); 
            document.body.classList.add('resizing');
            const startHeight = bottomArea.offsetHeight; 
            bottomArea.style.flex = 'none'; 
            bottomArea.style.height = startHeight + 'px'; 
            const startY = e.clientY;
            
            function doDrag(e) { 
                const deltaY = startY - e.clientY; 
                let newHeight = startHeight + deltaY; 
                if (newHeight < 100) newHeight = 100; 
                bottomArea.style.height = newHeight + 'px'; 
            }
            function stopDrag() { 
                document.removeEventListener('mousemove', doDrag); 
                document.removeEventListener('mouseup', stopDrag); 
                document.body.classList.remove('resizing'); 
            }
            
            document.addEventListener('mousemove', doDrag); 
            document.addEventListener('mouseup', stopDrag);
        });
    }

    function showView(viewId) {
        currentView = viewId; 
        isCatSortMode = false; 
        isProbSortMode = false; 
        updateSortUI();
        
        if (viewId === 'view-categories' || viewId === 'view-problem-list') {
            document.body.classList.add('light-mode'); 
        } else {
            document.body.classList.remove('light-mode');
        }
        
        ['view-login', 'view-source-selector', 'view-custom-portal', 'view-portal', 'view-categories', 'view-problem-list', 'view-workspace', 'view-admin', 'view-firebase-tutorial'].forEach(id => { 
            const el = document.getElementById(id); 
            if (el) el.style.display = 'none'; 
        });
        
        const target = document.getElementById(viewId);
        if (target) { 
            if (['view-login','view-source-selector', 'view-custom-portal', 'view-portal', 'view-workspace', 'view-admin', 'view-firebase-tutorial'].includes(viewId)) { 
                target.style.display = 'flex';
            } else { 
                target.style.display = 'block'; 
            } 
        }

        if (viewId === 'view-workspace' && editor) setTimeout(() => editor.resize(), 50);

        const toast = document.getElementById('updateToast');
        if (toast) { 
            if (viewId === 'view-categories' && pendingUpdateDb) { 
                toast.style.display = 'flex'; 
            } else { 
                toast.style.display = 'none'; 
            } 
        }
    }

    function openCategory(id) { 
        window.location.hash = '/problem-list?catId=' + id;
    }

    // === V60: Workspace 分頁繪製與切換 ===
    function renderWorkspaceTabs() {
        const p = db.problems.find(x => x.id === currentProbId);
        const tabsContainer = document.getElementById('wsEditorTabs');
        if (!p.isMultiFile || document.getElementById('langSelect').value !== 'cpp') {
            tabsContainer.style.display = 'none';
            return;
        }
        tabsContainer.style.display = 'flex';
        let html = `<div class="editor-tab ${currentFileIndex === -1 ? 'active' : ''}" onclick="switchWorkspaceFile(-1)">main.cpp</div>`;
        if (p.multiFiles) {
            p.multiFiles.forEach((file, idx) => {
                html += `<div class="editor-tab ${currentFileIndex === idx ? 'active' : ''}" onclick="switchWorkspaceFile(${idx})">${file.name}</div>`;
            });
        }
        tabsContainer.innerHTML = html;
    }

    function switchWorkspaceFile(idx) {
        const p = db.problems.find(x => x.id === currentProbId);
        
        // Save current code
        if (currentFileIndex === -1) { 
            p.code_cpp = editor.getValue(); 
        } else if (p.multiFiles && p.multiFiles[currentFileIndex]) { 
            p.multiFiles[currentFileIndex].code = editor.getValue(); 
        }
        
        currentFileIndex = idx;
        
        // Load new code
        if (currentFileIndex === -1) {
            editor.setValue(p.code_cpp !== undefined ? p.code_cpp : p.tpl_cpp, -1);
        } else {
            const f = p.multiFiles[currentFileIndex];
            editor.setValue(f.code !== undefined ? f.code : f.tpl, -1);
        }
        renderWorkspaceTabs();
    }

    function _enterWorkspaceInternal(id, fromAdmin = false) {
        currentProbId = id;
        const p = db.problems.find(x => x.id === id);
        if (!p) return;
        
        // 確保空字串模板不會被覆蓋
        if (p.tpl_cpp === undefined) p.tpl_cpp = p.templateCode !== undefined ? p.templateCode : defaultTemplates.cpp;
        if (p.tpl_python === undefined) p.tpl_python = defaultTemplates.python;
        
        // 確保 multiFiles 的 code 屬性存在
        if (p.isMultiFile && p.multiFiles) {
            p.multiFiles.forEach(f => { 
                if (f.code === undefined) f.code = f.tpl !== undefined ? f.tpl : ""; 
            });
        }
        
        if (!fromAdmin) { 
                // 修正：只要是全新進入作答區（開新分頁），一律強制重置為「預設模板」
        p.code_cpp = p.tpl_cpp; 
                        p.code_python = p.tpl_python; 
                        if (p.isMultiFile && p.multiFiles) { 
                                p.multiFiles.forEach(f => { 
                                f.code = f.tpl !== undefined ? f.tpl : ""; 
                                }); 
                        }
                }
        
        document.getElementById('wsTitle').innerText = p.title;
        document.getElementById('wsDesc').innerHTML = parseContent(p.desc || "");
        const lang = p.lastLang || 'cpp'; 
        document.getElementById('langSelect').value = lang; 
        
        currentFileIndex = -1; // 進入題庫時預設顯示 main
        renderWorkspaceTabs();

        if (lang === 'cpp') { 
            editor.session.setMode("ace/mode/c_cpp"); 
            editor.setValue(p.code_cpp !== undefined ? p.code_cpp : p.tpl_cpp, -1); 
        } else if (lang === 'python') { 
            editor.session.setMode("ace/mode/python"); 
            editor.setValue(p.code_python !== undefined ? p.code_python : p.tpl_python, -1); 
        }
        
        document.getElementById('outputLogs').innerHTML = '<div style="color:#666;">等待執行...</div>';
        showView('view-workspace');
    }

    function goToAdmin() { 
        const lang = document.getElementById('langSelect').value;
        const p = db.problems.find(x => x.id === currentProbId);
        
        // 保存 Workspace 編輯器目前的狀態
        if (lang === 'cpp' && p.isMultiFile) {
            if (currentFileIndex === -1) p.code_cpp = editor.getValue();
            else p.multiFiles[currentFileIndex].code = editor.getValue();
        } else {
            if (p) p['code_' + lang] = editor.getValue(); 
        }
        
        window.location.hash = '/admin?probId=' + currentProbId;
    }

    // === V60: Admin 多檔案分頁繪製與切換 ===
    function toggleAdminMultiFile() {
        const isEnabled = document.getElementById('adminEnableMultiFile').checked;
        document.getElementById('adminEditorTabs').style.display = (isEnabled && currentAdminLang === 'cpp') ? 'flex' : 'none';
        
        if (isEnabled && adminMultiFiles.length === 0) {
            adminMultiFiles.push({ name: "Class.cpp", tpl: "\n" });
            adminMultiFiles.push({ name: "Class.h", tpl: "\n" });
        }
        
        if (!isEnabled || currentAdminLang !== 'cpp') { 
            switchAdminFile(-1); // 若關閉則切回 main 預覽
        } else { 
            renderAdminTabs(); 
        }
    }

    function renderAdminTabs() {
        const tabsContainer = document.getElementById('adminEditorTabs');
        let html = `<div class="editor-tab ${adminCurrentFileIndex === -1 ? 'active' : ''}" onclick="switchAdminFile(-1)">main.cpp</div>`;
        
        adminMultiFiles.forEach((f, idx) => {
            html += `<div class="editor-tab ${adminCurrentFileIndex === idx ? 'active' : ''}" onclick="switchAdminFile(${idx})">
                        ${f.name} 
                        <span class="tab-icon" title="重新命名" onclick="renameAdminFile(event, ${idx})"><i class="fa-solid fa-pen"></i></span> 
                        <span class="tab-icon" title="移除" onclick="removeAdminFile(event, ${idx})">❌</span>
                     </div>`;
        });
        
        html += `<div class="editor-tab" style="color:var(--success);" onclick="addAdminFile()">+ 新增檔案</div>`;
        tabsContainer.innerHTML = html;
    }

    function switchAdminFile(idx) {
        // Save old tab
        if (adminCurrentFileIndex === -1) { 
            adminTempTemplates[currentAdminLang] = document.getElementById('editTemplate').value; 
        } else if (adminMultiFiles[adminCurrentFileIndex]) { 
            adminMultiFiles[adminCurrentFileIndex].tpl = document.getElementById('editTemplate').value; 
        }
        
        adminCurrentFileIndex = idx;
        
        // Load new tab
        if (adminCurrentFileIndex === -1) { 
            document.getElementById('editTemplate').value = adminTempTemplates[currentAdminLang] || ""; 
        } else { 
            document.getElementById('editTemplate').value = adminMultiFiles[adminCurrentFileIndex].tpl || ""; 
        }
        
        renderAdminTabs();
    }

    function addAdminFile() {
        const name = prompt("請輸入新增檔案名稱 (例如 Rectangle.cpp):", "NewClass.cpp");
        if (name && name.trim() !== "") {
            adminMultiFiles.push({ name: name.trim(), tpl: "// " + name.trim() + "\n" });
            switchAdminFile(adminMultiFiles.length - 1);
        }
    }

    function renameAdminFile(e, idx) {
        e.stopPropagation();
        const newName = prompt("重新命名:", adminMultiFiles[idx].name);
        if (newName && newName.trim() !== "") {
            adminMultiFiles[idx].name = newName.trim();
            renderAdminTabs();
        }
    }
    
    function removeAdminFile(e, idx) {
        e.stopPropagation();
        if (confirm("確定刪除此檔案？")) {
            const wasCurrentTab = (adminCurrentFileIndex === idx);
            if (adminCurrentFileIndex > idx) adminCurrentFileIndex--; 
            
            adminMultiFiles.splice(idx, 1); //先從資料陣列移除

            if (wasCurrentTab) {
                adminCurrentFileIndex = -1;
                document.getElementById('editTemplate').value = adminTempTemplates[currentAdminLang] || ""; 
            }
            renderAdminTabs(); //只渲染一次最新的狀態
        }
    }
    

    function _goToAdminInternal() {
        const p = db.problems.find(x => x.id === currentProbId); 
        document.getElementById('editTitle').value = p.title; 
        document.getElementById('editDesc').value = p.desc; 
        
        adminTempTemplates.cpp = (p.tpl_cpp !== undefined) ? p.tpl_cpp : (p.templateCode !== undefined ? p.templateCode : defaultTemplates.cpp); 
        adminTempTemplates.python = (p.tpl_python !== undefined) ? p.tpl_python : defaultTemplates.python;
        document.getElementById('adminLangSelect').value = 'cpp'; 
        currentAdminLang = 'cpp';
        
        // 初始化 Admin 的多檔案設定
        adminCurrentFileIndex = -1;
        adminMultiFiles = p.multiFiles ? JSON.parse(JSON.stringify(p.multiFiles)) : [];
        document.getElementById('adminEnableMultiFile').checked = !!p.isMultiFile;
        document.getElementById('editTemplate').value = adminTempTemplates.cpp;

        toggleAdminMultiFile();

        const c = document.getElementById('adminTestCases'); 
        c.innerHTML = ''; 
        
        (p.testCases || []).forEach(tc => addTestCaseUI(tc.input, tc.output)); 
        setTimeout(() => { 
            document.querySelectorAll('#adminTestCases textarea').forEach(ta => autoResize(ta)); 
        }, 0);
        showView('view-admin'); 
    }

    function enableDragSort(containerId, itemClass, onUpdateOrder) {
        const container = document.getElementById(containerId); 
        let draggedItem = null;
        
        container.addEventListener('dragstart', (e) => { 
            const target = e.target.closest(`.${itemClass}`);
            if (!target) return; 
            draggedItem = target; 
            target.classList.add('dragging'); 
            if(e.dataTransfer) e.dataTransfer.effectAllowed = 'move'; 
        });
        
        container.addEventListener('dragend', (e) => { 
            const target = e.target.closest(`.${itemClass}`);
            if (!target) return; 
            target.classList.remove('dragging'); 
            draggedItem = null; 
            onUpdateOrder(); 
        });
        
        container.addEventListener('dragenter', (e) => { 
            e.preventDefault(); 
            if (!draggedItem) return; 
            const target = e.target.closest(`.${itemClass}`); 
            if (target && target !== draggedItem) { 
                const children = [...container.children]; 
                const curIndex = children.indexOf(draggedItem); 
                const targetIndex = children.indexOf(target); 
                if (curIndex > targetIndex) { 
                    container.insertBefore(draggedItem, target); 
                } else { 
                    container.insertBefore(draggedItem, target.nextSibling); 
                } 
            } 
        });
        
        container.addEventListener('dragover', (e) => { 
            e.preventDefault(); 
        });
    }

    function toggleCatSortMode() { 
        isCatSortMode = !isCatSortMode; 
        updateSortUI(); 
        renderCategoryList(); 
    }
    
    function renderCategoryList() {
        const container = document.getElementById('groupedCategoryContainer'); 
        container.innerHTML = '';
        const grid = document.createElement('div'); 
        grid.className = 'cat-grid'; 
        grid.id = 'main-cat-grid';
        
        if (isCatSortMode) { 
            grid.classList.add('sort-mode'); 
        }
        
        db.categories.forEach(cat => {
            const probCount = db.problems.filter(p => p.catId === cat.id).length;
            const card = document.createElement('div'); 
            card.className = 'cat-card'; 
            card.setAttribute('draggable', isCatSortMode); 
            card.dataset.id = cat.id;
            
            card.innerHTML = `<div class="cat-title">${cat.name}</div><div class="cat-count">${probCount} 題</div><div class="cat-actions"><button class="btn btn-outline btn-sm" onclick="editCategory(event, '${cat.id}')"><i class="fa-solid fa-pen"></i></button><button class="btn btn-outline btn-sm" onclick="deleteCategory(event, '${cat.id}')" style="color:#f44747; border-color:#f44747;"><i class="fa-solid fa-trash"></i></button></div>`;
            card.onclick = (e) => { 
                if (!isCatSortMode && !e.target.closest('button')) openCategory(cat.id); 
            };
            grid.appendChild(card);
        });
        
        container.appendChild(grid);
        if (isCatSortMode) { 
            enableDragSort(grid.id, 'cat-card', saveCategoryOrder); 
        }
    }

    function saveCategoryOrder() { 
        const cards = document.querySelectorAll('#main-cat-grid .cat-card'); 
        const newOrder = []; 
        cards.forEach(card => { 
            const cat = db.categories.find(c => String(c.id) === String(card.dataset.id)); 
            if (cat) newOrder.push(cat); 
        }); 
        if (cards.length > 0 && newOrder.length === 0) return;
        db.categories = newOrder; 
        saveToLocal(true, false); 
    }

    
    async function createCategory() { 
        if (isCatSortMode) return; 
        const name = prompt("新分類名稱："); 
        if (!name) return; 
        // 💡 加上 isUserAdded 標籤，並綁定 bankUrl 供跨裝置備份辨識
        const newCat = { id: Date.now().toString(), name: name, isUserAdded: true, bankUrl: currentBankUrl };
        db.categories.push(newCat); 
        const btn = document.querySelector('#view-categories .btn-primary');
        if (btn) { btn.disabled = true; btn.innerText = "⏳ 新增中..."; }
        await saveToLocal(true, false); 
        await syncCategoryDeltaToCloud(newCat.id, newCat);
        if (btn) { btn.disabled = false; btn.innerText = "+ 新增分類"; }
        renderCategoryList(); 
    }
    

    async function editCategory(e, id) { 
        e.stopPropagation(); 
        const cat = db.categories.find(c => c.id === id); 
        const newName = prompt("修改分類名稱：", cat.name); 
        if (newName) { 
            cat.name = newName; 
            await saveToLocal(true, false); 
            await syncCategoryDeltaToCloud(cat.id, cat);
            renderCategoryList(); 
        } 
    }

    async function deleteCategory(e, id) { 
        e.stopPropagation(); 
        if (!confirm("確定刪除？底下的題目也會一併刪除。")) return; 
        
        const problemsToDelete = db.problems.filter(p => p.catId === id);
        
        db.categories = db.categories.filter(c => c.id !== id); 
        db.problems = db.problems.filter(p => p.catId !== id); 
        
        await saveToLocal(true, false); 
        
        // 雲端同步刪除分類與其題目
        await syncCategoryDeltaToCloud(id, null);
        for (const p of problemsToDelete) {
            await syncProblemDeltaToCloud(p.id, null);
        }
        
        renderCategoryList(); 
    }

    function toggleProbSortMode() { 
        isProbSortMode = !isProbSortMode; 
        updateSortUI(); 
        renderProblemList(); 
    }

    function renderProblemList() {
        const cat = db.categories.find(c => c.id === currentCatId); 
        document.getElementById('currentCatTitle').innerText = cat ? cat.name : "分類題庫";
        const container = document.getElementById('probListContainer');
        
        if (isProbSortMode) { 
            container.classList.add('sort-mode'); 
        } else { 
            container.classList.remove('sort-mode'); 
            const newCont = container.cloneNode(false); 
            container.parentNode.replaceChild(newCont, container); 
        }
        
        const currentContainer = document.getElementById('probListContainer');
        if (isProbSortMode) { 
            enableDragSort('probListContainer', 'prob-item', saveProblemOrder); 
        }
        
        currentContainer.innerHTML = '';
        const catProblems = db.problems.filter(p => p.catId === currentCatId);
        const emptyMsg = document.getElementById('emptyMsg');
        
        if (catProblems.length === 0) { 
            emptyMsg.style.display = 'block'; 
        } else {
            emptyMsg.style.display = 'none';
            catProblems.forEach(p => {
                const item = document.createElement('div'); 
                item.className = 'prob-item'; 
                item.setAttribute('draggable', isProbSortMode); 
                item.dataset.id = p.id;
                
                item.onclick = (e) => { 
                    if (!isProbSortMode && !e.target.closest('button')) { 
                        const baseUrl = window.location.href.split('#')[0].split('?')[0]; 
                        window.open(`${baseUrl}#/workspace?probId=${p.id}`, '_blank'); 
                    } 
                };
                
                const isCustomBank = currentBankUrl && currentBankUrl.startsWith("local_custom_");
                const canDelete = isCustomBank || p.isUserAdded;
                const delBtnHtml = canDelete ? `<button class="prob-btn-icon prob-del-btn" onclick="deleteProblemInList(event, '${p.id}')" title="刪除題目"><i class="fa-solid fa-trash"></i></button>` : '';
                
                item.innerHTML = `<div style="flex:1; overflow:hidden;"><div class="prob-title">${p.title}</div><div class="prob-desc-preview">${p.desc.substring(0, 50)}...</div></div><div class="prob-actions"><button class="prob-btn-icon prob-edit-btn" onclick="openMoveModal(event, '${p.id}')" title="移動分類">📦</button><button class="prob-btn-icon prob-edit-btn" onclick="editProblemInList(event, '${p.id}')" title="修改題目"><i class="fa-solid fa-pen"></i></button>${delBtnHtml}</div>`;
                currentContainer.appendChild(item);
            });
        }
    }

    function saveProblemOrder() { 
        const items = document.querySelectorAll('#probListContainer .prob-item'); 
        const newCatProbs = []; 
        items.forEach(item => { 
            const p = db.problems.find(x => String(x.id) === String(item.dataset.id)); 
            if (p) newCatProbs.push(p); 
        }); 
        const otherProbs = db.problems.filter(p => p.catId !== currentCatId); 
        db.problems = otherProbs.concat(newCatProbs); 
        saveToLocal(true, false); 
    }

        
    async function createProblemInCat() { 
        if (isProbSortMode) return; 
        const title = prompt("題目名稱："); 
        if (title) { 
            const newProb = { 
                id: Date.now().toString(), 
                catId: currentCatId, 
                title: title, 
                desc: "請輸入題目描述...", 
                tpl_cpp: defaultTemplates.cpp, 
                tpl_python: defaultTemplates.python, 
                code_cpp: defaultTemplates.cpp, 
                code_python: defaultTemplates.python, 
                testCases: [{ input: "1 2", output: "3" }], 
                lastLang: 'cpp', 
                isMultiFile: false,
                isUserAdded: true // 💡 加上免死金牌標籤
            };
            db.problems.push(newProb); 
            
            const btn = document.querySelector('#view-problem-list .btn-primary');
            if (btn) { btn.disabled = true; btn.innerText = "⏳ 新增中..."; }
            await saveToLocal(true, false); 
            await syncProblemDeltaToCloud(newProb.id, newProb); 
            if (btn) { btn.disabled = false; btn.innerText = "+ 新增題目"; }
            renderProblemList(); 
        } 
    }
    
    

    function editProblemInList(e, id) { 
        e.stopPropagation(); 
        currentProbId = id; 
        // 修正：直接跳轉 hash，避免 goToAdmin 讀取到 editor 的過期資料
        window.location.hash = '/admin?probId=' + id; 
    }
    

    async function deleteProblemInList(e, id) { 
        e.stopPropagation(); 
        if (confirm("確定刪除？")) { 
            db.problems = db.problems.filter(p => p.id !== id); 
            
            await saveToLocal(true, false); 
            await syncProblemDeltaToCloud(id, null); // 傳遞 null，觸發雲端獨立刪除該題
            renderProblemList(); 
        } 
    }

// ================= 移動題目功能 =================
    let problemToMoveId = null;

    function openMoveModal(e, probId) { 
        e.stopPropagation(); 
        problemToMoveId = probId; 
        
        const select = document.getElementById('moveCategorySelect'); 
        select.innerHTML = ''; 
        
        // 抓取目前的分類清單放入下拉選單
        db.categories.forEach(cat => { 
            const option = document.createElement('option'); 
            option.value = cat.id; 
            option.text = cat.name; 
            if (cat.id === currentCatId) {
                option.text += " (目前分類)"; 
                option.disabled = true; // 反白，不讓使用者移到原本的分類
            }
            select.appendChild(option); 
        }); 
        
        select.value = currentCatId; 
        document.getElementById('moveProblemModal').style.display = 'flex'; 
    }

    async function confirmMoveProblem() { 
        const targetCatId = document.getElementById('moveCategorySelect').value; 
        
        if (!targetCatId || targetCatId === currentCatId) { 
            document.getElementById('moveProblemModal').style.display = 'none'; 
            return; 
        }

        const p = db.problems.find(x => x.id === problemToMoveId); 
        if (p) { 
            // 1. 更改題目的所屬分類
            p.catId = targetCatId; 
            
            // 2. 存檔並同步雲端
            const btn = document.querySelector('#moveProblemModal .btn-primary');
            if (btn) { btn.disabled = true; btn.innerText = "⏳ 移動中..."; }
            await saveToLocal(true, false); 
            await syncProblemDeltaToCloud(p.id, { catId: targetCatId }); 
            if (btn) { btn.disabled = false; btn.innerText = "✅ 確認移動"; }
            
            // 3. 重新渲染畫面 (移走後，該題會從目前畫面消失)
            renderProblemList(); 
        } 
        
        document.getElementById('moveProblemModal').style.display = 'none'; 
        problemToMoveId = null; 
    }

    function updateSortUI() { 
        const catBtn = document.getElementById('catSortBtn'); 
        const probBtn = document.getElementById('probSortBtn'); 
        
        if (catBtn) { 
            catBtn.innerText = isCatSortMode ? "✅ 完成排序" : "⇅ 調整順序"; 
            catBtn.className = isCatSortMode ? "btn btn-danger" : "btn btn-outline"; 
        } 
        if (probBtn) { 
            probBtn.innerText = isProbSortMode ? "✅ 完成排序" : "⇅ 調整順序"; 
            probBtn.className = isProbSortMode ? "btn btn-danger" : "btn btn-outline"; 
        } 
    }
    
    function changeWorkspaceLang() { 
        const p = db.problems.find(x => x.id === currentProbId); 
        const oldLang = p.lastLang || 'cpp';
        
        // Save current code before switching
        if (oldLang === 'cpp' && p.isMultiFile) {
            if (currentFileIndex === -1) p.code_cpp = editor.getValue();
            else p.multiFiles[currentFileIndex].code = editor.getValue();
        } else {
            p['code_' + oldLang] = editor.getValue(); 
        }
        
        const newLang = document.getElementById('langSelect').value; 
        p.lastLang = newLang; 
        
        // Only C++ supports multi-file in this context normally, so reset index when switching
        currentFileIndex = -1; 
        renderWorkspaceTabs();
        
        if (newLang === 'cpp') { 
            editor.session.setMode("ace/mode/c_cpp"); 
            editor.setValue(p.code_cpp !== undefined ? p.code_cpp : (p.tpl_cpp !== undefined ? p.tpl_cpp : ""), -1); 
        } else if (newLang === 'python') { 
            editor.session.setMode("ace/mode/python"); 
            editor.setValue(p.code_python !== undefined ? p.code_python : (p.tpl_python !== undefined ? p.tpl_python : ""), -1); 
        }
    }

    function toggleCompileMode() {
        const btn = document.getElementById('modeBtn');
    
        if (currentCompileMode === 'wandbox') {
            // 1. 從 雲端 切換到 自建雲端
            currentCompileMode = 'custom';
            btn.innerHTML = "🚀 自建雲端";
            btn.style.color = "#a855f7"; // 紫色 (區分用)
            btn.style.borderColor = "#a855f7";

        } else if (currentCompileMode === 'custom') {
            // 2. 從 自建雲端 切換到 本機
            currentCompileMode = 'local';
            btn.innerHTML = "🔌 本機編譯";
            btn.style.color = "var(--success)"; // 綠色
            btn.style.borderColor = "var(--success)";

        } else {
            // 3. 從 本機 切換回 雲端 (Wandbox)
            currentCompileMode = 'wandbox';
            btn.innerHTML = "☁️ 雲端編譯";
            btn.style.color = "var(--accent)"; // 藍色
            btn.style.borderColor = "var(--accent)";
        }
    }

    function parseContent(text) { 
        if (!text) return ""; 
    
        // 1. 先將 HTML 特殊符號轉義，確保安全
        let escaped = text.replace(/&/g, "&amp;")
                          .replace(/</g, "&lt;")
                          .replace(/>/g, "&gt;")
                          .replace(/"/g, "&quot;")
                          .replace(/'/g, "&#039;"); 
    
        // 2. 處理粗體：只有 **中間有文字** 才會觸發。
        // 減號 (-) 與單個星號 (*) 因為沒有對應規則，會原樣輸出
        const boldRegex = /\*\*(.+?)\*\*/g;
        let html = escaped.replace(boldRegex, "<strong style='color: #282f3b;'>$1</strong>");
    
        // 3. 處理圖片語法 ![Alt](URL)
        const imageRegex = /!\[(.*?)\]\((.*?)\)/g; 
        html = html.replace(imageRegex, (match, alt, url) => { 
            return `<img src="${url}" alt="${alt}">`; 
        }); 
    
        // 4. 最後將 \n 換行轉成網頁標籤
        return html.replace(/\n/g, "<br>"); 
    }

    function resetCode() { 
        if (!confirm("重置程式碼到初始模板？這將會還原本題的所有檔案。")) return; 
        
        const p = db.problems.find(x => x.id === currentProbId); 
        const lang = document.getElementById('langSelect').value;
        
        if (lang === 'cpp') { 
            // 支援空字串還原
            p.code_cpp = (p.tpl_cpp !== undefined) ? p.tpl_cpp : defaultTemplates.cpp; 
            
            if (p.isMultiFile && p.multiFiles) {
                p.multiFiles.forEach(f => { f.code = f.tpl !== undefined ? f.tpl : ""; });
            }
            if (currentFileIndex === -1) {
                editor.setValue(p.code_cpp, -1); 
            } else {
                editor.setValue(p.multiFiles[currentFileIndex].code, -1);
            }
        } else { 
            p.code_python = (p.tpl_python !== undefined) ? p.tpl_python : defaultTemplates.python; 
            editor.setValue(p.code_python, -1); 
        }
    }
    
    function adjustFontSize(change) { 
        currentFontSize += change; 
        if (currentFontSize < 10) currentFontSize = 10; 
        if (currentFontSize > 30) currentFontSize = 30; 
        editor.setFontSize(currentFontSize); 
    }

    function copyCode() { 
        const code = editor.getValue(); 
        if (!code) { 
            alert("沒有程式碼可以複製！"); 
            return; 
        } 
        
        navigator.clipboard.writeText(code).then(() => { 
            alert("✅ 程式碼已複製到剪貼簿！"); 
        }).catch(() => { 
            const ta = document.createElement("textarea"); 
            ta.value = code; 
            document.body.appendChild(ta); 
            ta.select(); 
            document.execCommand("copy"); 
            document.body.removeChild(ta); 
            alert("✅ 程式碼已複製到剪貼簿！"); 
        }); 
    }
    
    function changeAdminLang() {
        if (adminCurrentFileIndex === -1) { 
            adminTempTemplates[currentAdminLang] = document.getElementById('editTemplate').value; 
        }
        
        const newLang = document.getElementById('adminLangSelect').value;
        currentAdminLang = newLang;
        
        document.getElementById('adminEditorTabs').style.display = 
            (document.getElementById('adminEnableMultiFile').checked && newLang === 'cpp') ? 'flex' : 'none';
        
        switchAdminFile(-1); // Switch back to main template view for the new language
    }

    
    async function saveAdminAndBack() { 
        const p = db.problems.find(x => x.id === currentProbId); 
        
        // --- 開始套用 UI 上的新設定 ---
        p.title = document.getElementById('editTitle').value; 
        p.desc = document.getElementById('editDesc').value; 
        
        if (adminCurrentFileIndex === -1) { 
            adminTempTemplates[currentAdminLang] = document.getElementById('editTemplate').value; 
        } else { 
            adminMultiFiles[adminCurrentFileIndex].tpl = document.getElementById('editTemplate').value; 
        }
        
        p.tpl_cpp = adminTempTemplates.cpp; 
        p.tpl_python = adminTempTemplates.python;

        if (p.code_cpp === undefined || p.code_cpp === defaultTemplates.cpp) {
            p.code_cpp = p.tpl_cpp;
        }
        if (p.code_python === undefined || p.code_python === defaultTemplates.python) {
            p.code_python = p.tpl_python;
        }

        p.isMultiFile = document.getElementById('adminEnableMultiFile').checked;
        p.multiFiles = JSON.parse(JSON.stringify(adminMultiFiles)); 
        
        if (p.multiFiles) { 
            p.multiFiles.forEach((f, idx) => { 
                if (f.code === undefined || f.code === "") {
                    f.code = f.tpl !== undefined ? f.tpl : "";
                }
            }); 
        }

        const inputs = document.querySelectorAll('.tc-input'); 
        const outputs = document.querySelectorAll('.tc-output'); 
        p.testCases = []; 
        for (let i = 0; i < inputs.length; i++) {
            p.testCases.push({ input: inputs[i].value, output: outputs[i].value }); 
        }
        // --- 套用新設定結束 ---

        // 💡 核心修正：等待雲端完成後才跳轉
        const btn = document.querySelector('#view-admin .btn-primary');
        if (btn) { btn.disabled = true; btn.innerText = "⏳ 儲存中..."; }
        await saveToLocal(true, false); 
        
        // 🚀 關鍵修復：把修改後的整份題目細節（含敘述、測資）獨立備份到 Firebase
        // 避免主存檔超過 1MB 容量限制時，重新整理會讀取到舊的備份資料，導致敘述變回「請輸入題目描述...」
        await syncProblemDeltaToCloud(currentProbId, p);

        if (btn) { btn.disabled = false; btn.innerText = "💾 儲存並返回"; }
        history.back(); 
    }
    

    function insertBoldToDesc() {
        const descArea = document.getElementById('editDesc');
        const start = descArea.selectionStart;
        const end = descArea.selectionEnd;
        const text = descArea.value;
    
        if (start !== end) {
            // 將選取的文字包住
            const selectedText = text.substring(start, end);
            descArea.value = text.substring(0, start) + "**" + selectedText + "**" + text.substring(end);
            descArea.selectionStart = start + 2;
            descArea.selectionEnd = end + 2;
        } else {
            // 插入空語法並定位游標
            descArea.value = text.substring(0, start) + "****" + text.substring(end);
            descArea.selectionStart = descArea.selectionEnd = start + 2;
        }
        descArea.focus();
    }
    
    function insertImageToDesc() { 
        const url = prompt("請輸入圖片網址 (URL)：", "https://"); 
        if (url) { 
            const descArea = document.getElementById('editDesc'); 
            descArea.value += `\n\n![圖片](${url})\n\n`; 
            descArea.focus(); 
        } 
    }

    function insertImageURL() { insertImageToDesc(); } 
    
    function handleLocalImageUpload() { 
        const fileInput = document.getElementById('localImgInput'); 
        const file = fileInput.files[0]; 
        if (!file) return; 
        
        if (file.size > 2 * 1024 * 1024) { 
            alert("⚠️ 圖片過大！建議使用 2MB 以下的圖片，以免瀏覽器卡頓。"); 
        } 
        
        const reader = new FileReader(); 
        reader.onload = function(e) { 
            const descArea = document.getElementById('editDesc'); 
            descArea.value += `\n\n![本地圖片](${e.target.result})\n\n`; 
            descArea.focus(); 
            fileInput.value = ''; 
        }; 
        reader.readAsDataURL(file); 
    }

    function openModelAnswerUI() { 
        const p = db.problems.find(x => x.id === currentProbId); 
        document.getElementById('modelAnswerInput').value = p.modelAnswer || ""; 
        document.getElementById('modelAnswerModal').style.display = 'flex'; 
    }
    
    function saveModelAnswerFromModal() { 
        const p = db.problems.find(x => x.id === currentProbId); 
        p.modelAnswer = document.getElementById('modelAnswerInput').value; 
        document.getElementById('modelAnswerModal').style.display = 'none'; 
        
        // 精準上傳局部修改，並只存 dbData 不存 History
        saveToLocal(true, false); 
        syncProblemDeltaToCloud(currentProbId, { modelAnswer: p.modelAnswer });
    }
    
    function copyModelAnswer() { 
        const text = document.getElementById('modelAnswerInput'); 
        if (!text.value.trim()) { 
            alert("沒有示範解答可以複製！"); 
            return; 
        } 
        text.select(); 
        document.execCommand('copy'); 
        alert("✅ 示範解答已複製！"); 
    }

    async function pasteModelAnswer() { 
        try { 
            const text = await navigator.clipboard.readText(); 
            document.getElementById('modelAnswerInput').value = text; 
            alert("✅ 已貼上解答！"); 
        } catch (err) { 
            alert("⚠️ 瀏覽器阻擋或無法讀取剪貼簿，請直接在文字框中按 Ctrl+V 貼上。"); 
        } 
    }

    async function runCode() {
        const p = db.problems.find(x => x.id === currentProbId); 
        if (!p.testCases || p.testCases.length === 0) { 
            alert("無測資"); 
            return; 
        }
        
        const btn = document.getElementById('runBtn'); 
        const logs = document.getElementById('outputLogs'); 
        const lang = document.getElementById('langSelect').value; 
        
        // 儲存當前編輯器內的程式碼到變數中
        if (lang === 'cpp' && p.isMultiFile) {
            if (currentFileIndex === -1) p.code_cpp = editor.getValue();
            else p.multiFiles[currentFileIndex].code = editor.getValue();
        } else { 
            p['code_' + lang] = editor.getValue(); 
        }
        
        const mainCode = (lang === 'cpp' && p.isMultiFile) ? p.code_cpp : editor.getValue();

        // 整理多檔案資料，準備傳送給編譯伺服器
        let wandboxCodes = [];
        let localExtraFiles = [];
        let extraCppFiles = []; // 【修正1】紀錄額外的 .cpp 檔案名稱供 Wandbox 編譯連結使用

        if (lang === 'cpp' && p.isMultiFile && p.multiFiles) {
            p.multiFiles.forEach(f => {
                wandboxCodes.push({ file: f.name, code: f.code || "" });
                localExtraFiles.push({ name: f.name, content: f.code || "" });
                
                // 找出 .cpp 或 .c 結尾的附屬檔案
                if (f.name.toLowerCase().endsWith('.cpp') || f.name.toLowerCase().endsWith('.c')) {
                    extraCppFiles.push(f.name);
                }
            });
        }

        btn.disabled = true; 
        btn.innerText = "..."; 
        logs.innerHTML = '';
        let passCount = 0; 
        let isCompileError = false;

        for (let i = 0; i < p.testCases.length; i++) {
            const tempDiv = document.createElement('div'); 
            tempDiv.className = 'log-case'; 
            tempDiv.innerHTML = `<span style="color:yellow">Case ${i+1}: Running...</span>`; 
            logs.appendChild(tempDiv); 
            tempDiv.scrollIntoView({ behavior: "smooth", block: "end" });

            try {
                let act = ""; 
                let exp = (p.testCases[i].output || "").trim(); 
                let inputData = p.testCases[i].input || "";

                if (currentCompileMode === 'wandbox') {
                    // 模式 A：公共雲端 (Wandbox)
                    const apiCompiler = lang === 'cpp' ? 'gcc-head' : 'cpython-head';
                    const payload = { compiler: apiCompiler, code: mainCode, stdin: inputData };
                    if (wandboxCodes.length > 0) { 
                        payload.codes = wandboxCodes; 
                        if (lang === 'cpp' && extraCppFiles.length > 0) {
                            payload["compiler-option-raw"] = extraCppFiles.join("\n");
                        }
                    } 

                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 15000);
                    const res = await fetch('https://wandbox.org/api/compile.json', { 
                        method: 'POST', 
                        headers: {'Content-Type': 'application/json'}, 
                        body: JSON.stringify(payload),
                        signal: controller.signal
                    }).then(r => r.json());
                    clearTimeout(timeoutId);
                    
                    if (res.compiler_error || res.compiler_message) {
                        tempDiv.innerHTML = `<div class="log-header" style="color:var(--fail)">❌ Case ${i+1}: 編譯錯誤</div><div class="log-details"><pre style="color:#f44747; margin:0;">${res.compiler_error || res.compiler_message}</pre></div>`;
                        const stopDiv = document.createElement('div'); 
                        stopDiv.style.textAlign = "center"; 
                        stopDiv.style.padding = "10px"; 
                        stopDiv.style.color = "#aaa"; 
                        stopDiv.innerHTML = "⚠️ 因編譯失敗，已終止後續測試。"; 
                        logs.appendChild(stopDiv);
                        isCompileError = true; 
                        break; 
                    }
                    if (res.status !== "0" && res.program_error) { 
                        tempDiv.innerHTML = `<div class="log-header" style="color:var(--fail)">❌ Case ${i+1}: 執行錯誤</div><div class="log-details"><pre style="color:#f44747; margin:0;">${res.program_error}</pre></div>`; 
                        continue; 
                    }
                    act = (res.program_message || "").trim();

                } else {
                    // 模式 B & C：使用你的 Python Server (本機或 Render 雲端)
                    try {
                        let filesDict = {};
                        if (lang === 'cpp') {
                            filesDict['main.cpp'] = mainCode; 
                            if (p.isMultiFile && localExtraFiles.length > 0) {
                                localExtraFiles.forEach(f => { filesDict[f.name] = f.content; });
                            }
                        } else {
                            filesDict['main.py'] = mainCode;
                        }

                        const localPayload = { lang: lang, files: filesDict, stdin: inputData };

                        // 🔴 關鍵點：根據模式決定目標網址
                        const apiUrl = (currentCompileMode === 'local') 
                            ? 'http://127.0.0.1:3000/run' 
                            : 'https://python-compiler-sever.onrender.com/run'; 

                        const controller = new AbortController();
                        const timeoutId = setTimeout(() => controller.abort(), 15000);
                        const res = await fetch(apiUrl, { 
                            method: 'POST', 
                            headers: {'Content-Type': 'application/json'}, 
                            body: JSON.stringify(localPayload),
                            signal: controller.signal
                        }).then(r => r.json());
                        clearTimeout(timeoutId);

                        if (res.error) {
                            tempDiv.innerHTML = `<div class="log-header" style="color:var(--fail)">❌ Case ${i+1}: ${res.type || "Error"}</div><div class="log-details"><pre style="color:#f44747; margin:0;">${res.message || "Unknown Error"}</pre></div>`;
                            if (res.type === '編譯錯誤') { 
                                const stopDiv = document.createElement('div'); 
                                stopDiv.style.textAlign = "center"; 
                                stopDiv.style.padding = "10px"; 
                                stopDiv.style.color = "#aaa"; 
                                stopDiv.innerHTML = "⚠️ 因編譯失敗，已終止後續測試。"; 
                                logs.appendChild(stopDiv); 
                                isCompileError = true; 
                                break; 
                            }
                            continue;
                        }
                        act = (res.output || "").trim();
                    } catch (err) { 
                        if (err.name === 'AbortError') throw err; // 讓外層 catch 處理超時
                        tempDiv.innerHTML = `<div class="log-header" style="color:var(--fail)">❌ Case ${i+1}: 無法連線至伺服器</div><div class="log-details" style="color:#aaa; font-size:0.85rem;">請確認 ${currentCompileMode === 'local' ? '本機' : '雲端'} 伺服器是否已啟動。</div>`; 
                        isCompileError = true; 
                        break; 
                    }
                }

                // --- 恢復：原本用來判斷答案對錯的邏輯 ---
                let pass = act.replace(/\r\n/g, "\n") === exp.replace(/\r\n/g, "\n");
                if (pass) passCount++;
                
                let statusHtml = pass ? `<span style="color:var(--success)">✅ Case ${i+1}: 通過測試 (Accepted)</span>` : `<span style="color:var(--fail)">❌ Case ${i+1}: 答案錯誤 (Wrong Answer)</span>`;
                let actStyle = pass ? "color:#fff; border-left-color:var(--success);" : "color:var(--warning); border-left-color:var(--fail);";
                
                tempDiv.innerHTML = `<div class="log-header">${statusHtml}</div><div class="log-details"><div class="log-label">輸入 (Input):</div><div class="log-value">${inputData}</div><div class="log-label">預期輸出 (Expected):</div><div class="log-value">${exp}</div><div class="log-label">您的輸出 (Actual):</div><div class="log-value" style="${actStyle}">${act || "(無輸出)"}</div></div>`;

            } catch(e) { 
                if (e.name === 'AbortError') {
                    tempDiv.innerHTML = `<div style="color:var(--fail)">❌ Case ${i+1}: 執行超時 (Timeout)</div><div class="log-details" style="color:#aaa; font-size:0.85rem;">執行超過 15 秒已被系統強制中斷。<br>可能原因：程式碼陷入「無窮迴圈」或伺服器無回應。</div>`; 
                } else {
                    tempDiv.innerHTML = `<div style="color:var(--fail)">❌ Case ${i+1}: 網路連線錯誤</div><div class="log-details" style="color:#aaa; font-size:0.85rem;">無法連線至編譯伺服器，請檢查網路狀態。</div>`; 
                }
                isCompileError = true; 
                break; 
            }
        } // for 迴圈結束

        let finalStatus = "";
        if (isCompileError) { 
            finalStatus = `<span style="color:var(--fail)">❌ 編譯或連線失敗</span>`; 
        } else if (passCount === p.testCases.length) { 
            finalStatus = `<span style="color:var(--success)">✅ 全數通過 (${passCount}/${p.testCases.length})</span>`; 
        } else { 
            finalStatus = `<span style="color:var(--warning)">⚠️ 部分通過 (${passCount}/${p.testCases.length})</span>`; 
        }

        // 將所有檔案的內容整合存入歷史紀錄，方便回頭檢視
        let fullCodeForHistory = mainCode;
        if (lang === 'cpp' && p.isMultiFile && p.multiFiles) {
            fullCodeForHistory = `// === main.cpp ===\n${mainCode}\n`;
            p.multiFiles.forEach(f => {
                fullCodeForHistory += `\n// === ${f.name} ===\n${f.code || ""}\n`;
            });
        }

        if (!executionHistories[currentProbId]) executionHistories[currentProbId] = [];
        executionHistories[currentProbId].unshift({ 
            time: new Date().toLocaleString('zh-TW', { hour12: false }), 
            lang: lang, 
            code: fullCodeForHistory, 
            status: finalStatus 
        });
        
        if (executionHistories[currentProbId].length > 30) {
            executionHistories[currentProbId].pop();
        }
        
        // 【修正3：不再上傳整個題庫，僅更新本機 LocalStorage 與雲端局部的程式碼與歷史紀錄】
        const historyString = JSON.stringify(executionHistories);
        localStorage.setItem('oj_v15_history', historyString);
        localStorage.setItem('oj_v15_data', JSON.stringify(db)); // 僅更新本機題庫暫存

        if (currentUser) {
            try {
                // 【修改】：僅將歷史紀錄同步到雲端，不再將「作答程式碼」寫入 customProblems
                await personalDb.collection('users').doc(currentUser.uid).set({
                     historyData: historyString,
                     lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });

            } catch(e) {
                console.error("雲端歷史紀錄存檔失敗:", e);
            }
        }

        btn.disabled = false; 
        btn.innerText = "▶️ 執行";
    }

    function openHistoryModal() {
        const histList = executionHistories[currentProbId] || []; 
        const listDiv = document.getElementById('historyList'); 
        document.getElementById('historyCodeView').value = ""; 
        listDiv.innerHTML = "";
        
        if (histList.length === 0) { 
            listDiv.innerHTML = "<div style='color:#666; text-align:center; padding:30px; font-size:1.1rem;'>尚無執行紀錄</div>"; 
        } else { 
            histList.forEach((hist, idx) => { 
                const item = document.createElement('div'); 
                item.className = 'hist-item'; 
                item.onclick = () => { 
                    document.querySelectorAll('.hist-item').forEach(el => el.classList.remove('active')); 
                    item.classList.add('active'); 
                    document.getElementById('historyCodeView').value = hist.code; 
                }; 
                item.innerHTML = `<div style="font-size:0.85rem; color:#aaa;">${hist.time} <span style="color:var(--accent)">[${hist.lang}]</span></div><div style="margin-top:5px; font-weight:bold;">${hist.status}</div>`; 
                listDiv.appendChild(item); 
                if (idx === 0) item.click(); 
            }); 
        }
        document.getElementById('historyModal').style.display = 'flex';
    }

    function clearProblemHistory() { 
        if (!confirm("確定要清空這題的所有歷史執行紀錄嗎？此動作無法復原。")) return; 
        delete executionHistories[currentProbId]; 
        
        // 僅更新歷史紀錄，不影響題庫主體
        const historyString = JSON.stringify(executionHistories);
        localStorage.setItem('oj_v15_history', historyString);
        if (currentUser) {
            personalDb.collection('users').doc(currentUser.uid).set({
                historyData: historyString
            }, { merge: true }).then(() => openHistoryModal());
        } else {
            openHistoryModal();
        }
    }

    async function clearCategoryHistory() {
        if (!currentCatId) return;

        //從本地暫存重新讀取一次最新紀錄
        const freshHistory = localStorage.getItem('oj_v15_history');
        if (freshHistory) {
            try { 
                executionHistories = JSON.parse(freshHistory); 
            } catch(e) {}
        }

        // 取得目前分類的名稱以顯示在提示訊息中
        const cat = db.categories.find(c => c.id === currentCatId);
        const catName = cat ? cat.name : "此分類";

        if (!confirm(`⚠️ 警告：確定要清空「${catName}」內所有題目的【歷史執行紀錄】嗎？\n此動作無法復原！`)) return;

        // 找出這個分類下的所有題目
        const catProblems = db.problems.filter(p => p.catId === currentCatId);
        let deletedCount = 0;

        // 刪除這些題目在 executionHistories 中的紀錄
        catProblems.forEach(p => {
            // 加上長度判斷，確保裡面真的有紀錄才算數
            if (executionHistories[p.id] && executionHistories[p.id].length > 0) {
                delete executionHistories[p.id];
                deletedCount++;
            }
        });

        if (deletedCount === 0) {
            alert("本分類目前沒有任何歷史執行紀錄可以清空。");
            return;
        }

        // 更新本地端的儲存紀錄
        const historyString = JSON.stringify(executionHistories);
        localStorage.setItem('oj_v15_history', historyString);

        // 同步更新至 Firebase 雲端
        if (currentUser) {
            try {
                await personalDb.collection('users').doc(currentUser.uid).set({
                    historyData: historyString
                }, { merge: true });
                alert(`✅ 已成功清空本分類中 ${deletedCount} 題的執行紀錄！`);
            } catch (e) {
                console.error("雲端清除歷史紀錄失敗", e);
                alert("⚠️ 本地紀錄已清除，但雲端同步失敗。");
            }
        } else {
            alert(`✅ 已成功清空本分類中 ${deletedCount} 題的執行紀錄！`);
        }
    }    

    function openAIHelperModal() {
        const p = db.problems.find(x => x.id === currentProbId); 
        const lang = document.getElementById('langSelect').value; 
        
        // 確保目前編輯器內容有存到變數裡
        if (lang === 'cpp' && p.isMultiFile) {
            if (currentFileIndex === -1) p.code_cpp = editor.getValue();
            else p.multiFiles[currentFileIndex].code = editor.getValue();
        } else {
            p['code_' + lang] = editor.getValue();
        }

        // 【修正2：讓 AI 能抓取所有檔案內容】
        let fullCode = "";
        if (lang === 'cpp' && p.isMultiFile) {
            fullCode = `// === main.cpp ===\n${p.code_cpp || ""}\n`;
            if (p.multiFiles) {
                p.multiFiles.forEach(f => {
                    fullCode += `\n// === ${f.name} ===\n${f.code || ""}\n`;
                });
            }
        } else {
            fullCode = editor.getValue();
        }
        
        if (!fullCode || fullCode.trim() === "") { 
            alert("程式碼為空，無法分析。"); 
            return; 
        }
        
        document.getElementById('aiPromptOutput').value = `請擔任程式設計助教，幫我檢查以下程式碼的邏輯是否正確，並給予修正建議（請用繁體中文回答）：\n\n【題目名稱】：${p.title}\n【題目描述】：\n${p.desc}\n\n【我的程式碼】：\n\`\`\`${lang}\n${fullCode}\n\`\`\``; 
        document.getElementById('aiHelperModal').style.display = 'flex';
    }

    function copyPromptOnly() { 
        const text = document.getElementById('aiPromptOutput'); 
        text.select(); 
        document.execCommand('copy'); 
        alert("✅ 內容已複製！"); 
        document.getElementById('aiHelperModal').style.display = 'none'; 
    }

    function copyPromptAndOpenGemini() { 
        const text = document.getElementById('aiPromptOutput'); 
        text.select(); 
        document.execCommand('copy'); 
        alert("📋 內容已複製！\n即將為您打開 Gemini。"); 
        window.open('https://gemini.google.com/app', '_blank'); 
        document.getElementById('aiHelperModal').style.display = 'none'; 
    }

    function addTestCaseUI(input='', output='') { 
        const div = document.createElement('div'); 
        div.className = 'tc-item'; 
        div.innerHTML = `<button class="btn btn-outline" style="float:right; border:none; padding:0 5px;" onclick="this.parentElement.remove()">✕</button><div style="display:flex; gap:10px; margin-top:5px;"><textarea class="tc-input" rows="1" oninput="autoResize(this)" style="flex:1" placeholder="Input">${input}</textarea><textarea class="tc-output" rows="1" oninput="autoResize(this)" style="flex:1" placeholder="Output">${output}</textarea></div>`; 
        document.getElementById('adminTestCases').appendChild(div); 
        
        if (input || output) { 
            const tas = div.querySelectorAll('textarea'); 
            tas.forEach(ta => autoResize(ta)); 
        } 
    }
    
    function downloadBackup() { 
        const date = new Date().toISOString().slice(0, 10); 
        const defaultName = (typeof currentBankName !== 'undefined' && currentBankName) ? `${currentBankName}_備份_${date}` : `oj_backup_${date}`;
        let filename = prompt("請輸入檔案名稱 (無需副檔名):", defaultName); 
        if (!filename) return; 
        
        if (!filename.endsWith(".txt") && !filename.endsWith(".json")) { 
            filename += ".json"; 
        } 
        
        const backupData = JSON.stringify(db, null, 4); 
        const blob = new Blob([backupData], { type: 'application/json' }); 
        const url = window.URL.createObjectURL(blob); 
        const a = document.createElement('a'); 
        a.href = url; 
        a.download = filename; 
        document.body.appendChild(a); 
        a.click(); 
        window.URL.revokeObjectURL(url); 
        document.body.removeChild(a); 
    }

    function handleBackupFile(input) { 
        const file = input.files[0]; 
        if (!file) return; 
        
        pendingRestoreFileName = file.name; 
        const reader = new FileReader(); 
        
        reader.onload = function(e) { 
            let content = e.target.result.trim(); 
            // 不再強制轉換成 base64，保持原樣塞入
            document.getElementById('backupStr').value = content; 
        }; 
        reader.readAsText(file); 
        input.value = ''; 
    }

    function openBackupUI() { 
        pendingRestoreFileName = ""; 
        document.getElementById('backupStr').value = JSON.stringify(db); // 使用單行 JSON 以便安全複製貼上
        document.getElementById('backupModal').style.display = 'flex'; 
    }

    function copyBackupCode() { 
        document.getElementById('backupStr').select(); 
        document.execCommand('copy'); 
        alert("已複製"); 
    }

    async function execRestore() { 
        try { 
            const val = document.getElementById('backupStr').value.trim();
            let data;
            if (val.startsWith("{") || val.startsWith("[")) {
                data = JSON.parse(val);
            } else {
                data = JSON.parse(decodeURIComponent(atob(val))); 
            }
            if (data.categories && data.problems) { 
                const catCount = data.categories.length || 0;
                const probCount = data.problems.length || 0;
                
                if (!confirm(`⚠️ 準備還原題庫 ⚠️\n\n您即將匯入的備份檔包含：\n- ${catCount} 個分類\n- ${probCount} 道題目\n\n【警告】此操作將會「完全覆蓋」您目前的本地題庫資料！\n確定要繼續還原嗎？`)) {
                    return;
                }

                let defaultName = pendingRestoreFileName || "自訂還原題庫"; 
                let finalName = prompt("請為這個還原的題庫命名：", defaultName); 
                
                if (finalName === null) return; 
                if (finalName.trim() === "") finalName = "自訂還原題庫"; 
                
                const preservedCustomBanks = db.customBanks || [];
                db.categories = data.categories;
                db.problems = data.problems;
                db.version = data.version || "";
                db.customBanks = preservedCustomBanks;

                // 如果在自訂題庫中還原，順便更新該自訂題庫名稱
                const isCustom = currentBankUrl && currentBankUrl.startsWith("local_custom_");
                if (isCustom) {
                    const customId = currentBankUrl.replace("local_custom_", "");
                    const bankIdx = db.customBanks.findIndex(b => b.id === customId);
                    if (bankIdx !== -1) {
                        db.customBanks[bankIdx].name = finalName;
                        db.customBanks[bankIdx].categories = JSON.parse(JSON.stringify(db.categories));
                        db.customBanks[bankIdx].problems = JSON.parse(JSON.stringify(db.problems));
                        
                        // 💡 強制將還原的題庫寫入子集合
                        if (currentUser && personalDb) {
                            try {
                                personalDb.collection('users').doc(currentUser.uid).collection('customBanks').doc(customId).set(db.customBanks[bankIdx]);
                            } catch(e) {}
                        }
                    }
                } else if (currentUser && personalDb) {
                    // 🚀 針對預設題庫的還原修復：必須將還原進來的題目與分類，批次同步到 Firebase 的獨立保險箱
                    let payload = {};
                    let customCatUpdates = {};
                    let customProbUpdates = {};

                    // 1. 抓取雲端現有資料，找出「幽靈檔案」（原本在雲端，但還原檔裡沒有的題目/分類）並標記為刪除
                    try {
                        const docSnap = await personalDb.collection('users').doc(currentUser.uid).get();
                        if (docSnap.exists) {
                            const data = docSnap.data();
                            
                            // 清理幽靈分類
                            if (data.customCategories) {
                                Object.values(data.customCategories).forEach(cc => {
                                    if (cc && cc.bankUrl === currentBankUrl) {
                                        if (!db.categories.some(c => c.id === cc.id)) {
                                            customCatUpdates[cc.id] = firebase.firestore.FieldValue.delete();
                                        }
                                    }
                                });
                            }
                            
                            // 清理幽靈題目：如果題目的分類屬於當前題庫，但還原檔裡沒這題，就殺掉
                            const currentCatIds = db.categories.map(c => c.id);
                            if (data.customProblems) {
                                Object.values(data.customProblems).forEach(cp => {
                                    if (cp && currentCatIds.includes(cp.catId)) {
                                        if (!db.problems.some(p => p.id === cp.id)) {
                                            customProbUpdates[cp.id] = firebase.firestore.FieldValue.delete();
                                        }
                                    }
                                });
                            }
                        }
                    } catch(e) { console.warn("無法抓取雲端幽靈檔案", e); }

                    // 2. 將還原進來的所有題目細節（含作答紀錄與自訂修改）覆寫回獨立保險箱
                    db.categories.forEach(c => {
                        if (c.isUserAdded) customCatUpdates[c.id] = c; 
                    });
                    
                    db.problems.forEach(p => {
                        customProbUpdates[p.id] = p;
                    });

                    if (Object.keys(customCatUpdates).length > 0) payload.customCategories = customCatUpdates;
                    if (Object.keys(customProbUpdates).length > 0) payload.customProblems = customProbUpdates;

                    // 3. 批次寫入 Firebase (包含新增與刪除的指令)
                    if (Object.keys(payload).length > 0) {
                        try {
                            await personalDb.collection('users').doc(currentUser.uid).set(payload, { merge: true });
                        } catch(e) { console.warn("獨立保險箱批次還原失敗", e); }
                    }
                }
                
                currentBankName = finalName;
                localStorage.setItem('oj_v15_bank_name', finalName); 
                
                // 等待存檔與雲端同步完成
                await saveToLocal(true, true); 
                
                alert("還原成功，並已同步至雲端！");
                
                // 💡 取消 window.location.reload()，改為直接更新 UI
                document.getElementById('backupModal').style.display = 'none';
                
                const nameEl = document.getElementById('currentBankName');
                if (nameEl) nameEl.innerHTML = `<i class="fa-solid fa-folder-open" style="color: #60a5fa; margin-right: 8px;"></i> 目前題庫: ` + currentBankName;
                
                currentCatId = null;
                renderCategoryList();
                if (currentView === 'view-problem-list') showView('view-categories');
            } else { 
                throw new Error(); 
            } 
        } catch(e) { 
            alert("代碼無效或格式錯誤"); 
        } 
    }

    // ================= 下載程式碼功能 =================
    function downloadCode() {
        const p = db.problems.find(x => x.id === currentProbId);
        if (!p) return;

        const lang = document.getElementById('langSelect').value;

        // 1. 確保當前編輯器內的程式碼有即時存入變數中
        if (lang === 'cpp' && p.isMultiFile) {
            if (currentFileIndex === -1) p.code_cpp = editor.getValue();
            else p.multiFiles[currentFileIndex].code = editor.getValue();
        } else {
            p['code_' + lang] = editor.getValue();
        }

        // 2. 準備檔名前綴（過濾掉不合法的檔案字元）
        const safeTitle = p.title.replace(/[\/\?<>\\:\*\|":\s]/g, "_");

        if (lang === 'cpp' && p.isMultiFile) {
            // --- 處理多檔案打包 (ZIP) ---
            if (typeof JSZip === 'undefined') {
                alert("⚠️ 未載入 JSZip 函式庫，無法進行打包。");
                return;
            }
        
            const zip = new JSZip();
        
            // 放入 main.cpp
            zip.file("main.cpp", p.code_cpp || "");
        
            // 放入其他標頭檔與實作檔 (.h / .cpp)
            if (p.multiFiles) {
                p.multiFiles.forEach(f => {
                    zip.file(f.name, f.code || "");
                });
            }
        
            // 產生壓縮檔並觸發下載
            zip.generateAsync({type: "blob"}).then(function(content) {
                const url = window.URL.createObjectURL(content);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                a.download = `${safeTitle}_Project.zip`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            });
        
        } else {
            // --- 處理單一檔案下載 ---
            let content = lang === 'cpp' ? (p.code_cpp || "") : (p.code_python || "");
            let ext = lang === 'cpp' ? '.cpp' : '.py';
            let filename = `${safeTitle}${ext}`;
        
            const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        }
    }

// ============= 上傳程式碼功能 ============

    async function handleCodeUpload(input) {
	const files = input.files;
	if (!files || files.length === 0) return;

	const p = db.problems.find(x => x.id === currentProbId);
	if (!p) return;

	const lang = document.getElementById('langSelect').value;
    
	// 變數準備：用來記錄上傳過程的狀態
	let successCount = 0;
	let failMessages = [];
	let needRenderTabs = false;

	// 處理單一 ZIP 壓縮檔的邏輯 (維持原本的防呆與解壓縮機制)
	if (files.length === 1 && files[0].name.toLowerCase().endsWith('.zip')) {
	const file = files[0];
	if (lang !== 'cpp' || !p.isMultiFile) {
	alert("⚠️ 目前的題目或語言模式不支援多檔案！請上傳單一 .cpp 或 .py 檔案。");
	    input.value = ''; return;
	}
	if (typeof JSZip === 'undefined') {
	    alert("⚠️ 未載入 JSZip 函式庫，無法讀取壓縮檔。");
	    input.value = ''; return;
	}
	if (!confirm("⚠️ 上傳專案將會覆蓋您目前在這個題目的所有程式碼，確定要繼續嗎？")) {
	    input.value = ''; return;
	}

	try {
	    const zip = await JSZip.loadAsync(file);
	    let hasMain = false;
	    let newMultiFiles = [];
	    let mainCode = "";
	    let promises = [];

	    zip.forEach((relativePath, zipEntry) => {
		if (zipEntry.dir || relativePath.includes('__MACOSX')) return;

		promises.push(zipEntry.async("string").then(content => {
		    const actualFilename = relativePath.split('/').pop();
		    if (actualFilename === 'main.cpp') {
			mainCode = content;
			hasMain = true;
		    } else if (actualFilename.endsWith('.cpp') || actualFilename.endsWith('.h') || actualFilename.endsWith('.c')) {
			newMultiFiles.push({ name: actualFilename, code: content, tpl: "" });
		    }
		}));
	    });

	    await Promise.all(promises);

	    if (!hasMain) {
		alert("⚠️ 壓縮檔內找不到 main.cpp，無法載入專案！");
		input.value = ''; return;
	    }

	    p.code_cpp = mainCode;
	    if (p.multiFiles) {
		newMultiFiles.forEach(nf => {
		const oldFile = p.multiFiles.find(of => of.name === nf.name);
		if (oldFile && oldFile.tpl !== undefined) nf.tpl = oldFile.tpl;
		});
	    }
	    p.multiFiles = newMultiFiles;
	    currentFileIndex = -1;
	    editor.setValue(p.code_cpp, -1);
	    renderWorkspaceTabs();
	    alert("✅ ZIP 專案上傳並解析成功！");

	} catch (e) {
	    console.error(e);
	    alert("⚠️ 讀取 ZIP 檔案失敗：" + e.message);
	}
	input.value = '';
	return;
    }

    // 處理多個獨立檔案上傳的邏輯 (如: main.cpp, Rectangle.cpp, Rectangle.h)
      // 將 FileReader 包裝成 Promise，方便用 await 循序處理
      const readFileAsync = (file) => {
	return new Promise((resolve, reject) => {
	    const reader = new FileReader();
	    reader.onload = (e) => resolve(e.target.result);
	    reader.onerror = (e) => reject(e);
	    reader.readAsText(file);
	});
    };

      // 循序檢查並讀取每個選取的檔案
      for (let i = 0; i < files.length; i++) {
	const file = files[i];
	const extension = file.name.split('.').pop().toLowerCase();

	// 防呆檢查 1：語言不符
	if (lang === 'python' && extension !== 'py') {
	    failMessages.push(`❌ [${file.name}] Python 模式只能上傳 .py 檔案。`);
	    continue;
	}
	if (lang === 'cpp' && (extension === 'py' || extension === 'zip')) {
	    failMessages.push(`❌ [${file.name}] 檔案格式錯誤。`);
	    continue;
	}
        
	// 防呆檢查 2：單檔模式卻傳了 .h 或多個檔案
	if (!p.isMultiFile && (extension === 'h' || files.length > 1)) {
	    alert("⚠️ 目前為單一檔案模式，無法上傳標頭檔或多個檔案！請先開啟多檔案支援。");
	    input.value = ''; return;
	}

	try {
	const content = await readFileAsync(file);

	if (lang === 'cpp' && p.isMultiFile) {
	    if (file.name === 'main.cpp') {
		p.code_cpp = content;
		successCount++;
		if (currentFileIndex === -1) editor.setValue(content, -1);
	} else {
	    let targetIdx = p.multiFiles.findIndex(f => f.name === file.name);
	    if (targetIdx !== -1) {
		p.multiFiles[targetIdx].code = content;
		successCount++;
		needRenderTabs = true;
		if (currentFileIndex === targetIdx) editor.setValue(content, -1);
	    } else {
		failMessages.push(`⚠️ [${file.name}] 題目未設定此檔案分頁，已略過。`);
	    }
	}
     } else {
	// 單一檔案模式的覆蓋
	if (lang === 'cpp') p.code_cpp = content;
	else p.code_python = content;
	editor.setValue(content, -1);
	successCount++;
    }
        } catch (error) {
            failMessages.push(`❌ [${file.name}] 讀取失敗。`);
        }
    }

    // 檔案都處理完後，統整並顯示結果
    if (needRenderTabs) renderWorkspaceTabs();

    if (failMessages.length === 0 && successCount > 0) {
	alert(`✅ 成功載入 ${successCount} 個檔案！`);
    } else if (failMessages.length > 0) {
	let msg = `載入完成，但有部分狀況：\n✅ 成功: ${successCount} 個檔案\n\n`;
	msg += failMessages.join('\n');
	alert(msg);
    }

    // 清除 input 狀態
    input.value = '';
}

