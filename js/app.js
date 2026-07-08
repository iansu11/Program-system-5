
    // =========================================================
    // 0. Eager Load (?  ?載入) & 變數 ??
    // =========================================================
    let db = { 
	categories: [], 
	problems: [], 
	version: "",
	customBanks: [] //存放使用? 自訂 ?? ?  ? ?
    };

    let executionHistories = {}; 
    let currentBankName = ""; 
    let currentBankUrl = "";  
    let currentView = 'view-login';
    let pendingUpdateDb = null;
    let hasCloudDbData = false;
    let authInitialized = false;
    let isBankSortMode = false; // ? 制?  ?題庫?  ?模 ??  ???

    // V60: 多 ?案支?  ?? ?  ???
    let currentFileIndex = -1; // -1  ?   main ? 以 ? ?   extraFiles ??index
    let adminMultiFiles = [];  // 後台設 ?專用? 暫存物 ?
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
    // 1. ? 雲端核心設 ?(Master-Tenant ?  ?)
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

    // [? 戶端] 使用?  ?專屬 Firebase (之 ??  ??  ?)
    let personalApp = null;
    let personalDb = null;
    

    // ==========================================
    // 2. 帳 ?系統
    // ==========================================
    
    let isLoginMode = true;

    function switchAuthTab(mode) {
        isLoginMode = (mode === 'login');
        document.getElementById('tabLogin').style.color = isLoginMode ? 'white' : '#aaa';
        document.getElementById('tabLogin').style.borderBottomColor = isLoginMode ? 'var(--accent)' : 'transparent';
        document.getElementById('tabRegister').style.color = !isLoginMode ? 'white' : '#aaa';
        document.getElementById('tabRegister').style.borderBottomColor = !isLoginMode ? 'var(--accent)' : 'transparent';
        
        document.getElementById('registerConfigArea').style.display = isLoginMode ? 'none' : 'block';
        document.getElementById('actionBtn').innerText = isLoginMode ? '? 入系統' : '註 ?並 ?定雲 ?;
        document.getElementById('actionBtn').className = isLoginMode ? 'btn btn-success' : 'btn btn-primary';
    }
        
    async function handleAuthAction() {
        const email = document.getElementById('emailInput').value.trim();
        const pwd = document.getElementById('passwordInput').value;
        if (!email || !pwd) { alert("請輸? 電子郵件 ?密碼 ?); return; }

        const actionBtn = document.getElementById('actionBtn');
        const originalText = actionBtn.innerText;
        actionBtn.innerText = isLoginMode ? '? 入 ?..' : '?  ? ?..';
        actionBtn.disabled = true;

        if (isLoginMode) {
            masterAuth.signInWithEmailAndPassword(email, pwd).catch(err => {
                alert("? 入失 ? ? + err.message);
                actionBtn.innerText = originalText;
                actionBtn.disabled = false;
            });
        } else {
            if (pwd.length < 6) { alert("密碼太短 ?); return; }
            const configStr = document.getElementById('registerConfigInput').value.trim();
            if (!configStr) { alert("請貼 ?Firebase ? 鑰 ?); return; }
            
            try { JSON.parse(configStr); } catch(e) { alert("??JSON ?  ?? 誤 ?); return; }

            try {
                const userCredential = await masterAuth.createUserWithEmailAndPassword(email, pwd);
                await masterDb.collection('userSettings').doc(userCredential.user.uid).set({
                    firebaseConfig: configStr
                });
                alert("??註 ??  ?並 ?定雲端 ?");
            } catch(err) { 
                alert("註 ?失 ? ? + err.message); 
                actionBtn.innerText = originalText;
                actionBtn.disabled = false;
            }
        }
    }

    function logout() {
        if (confirm("確 ?要登?  ? ?)) {
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
                // ??Master ?  ? JSON ? 鑰
                let userConfigStr = localStorage.getItem('oj_v15_firebaseConfig');
                try {
                    const doc = await masterDb.collection('userSettings').doc(user.uid).get();
                    if (doc.exists && doc.data().firebaseConfig) {
                        userConfigStr = doc.data().firebaseConfig;
                        localStorage.setItem('oj_v15_firebaseConfig', userConfigStr);
                    }
                } catch (netErr) {
                    console.warn("?  ?從雲端 ?得 ??  ?將 ?試使? 本? 快?  ?", netErr);
                }

                if (userConfigStr) {
                    const userConfig = JSON.parse(userConfigStr);
                    
                    // ?  ?? 人? 端
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
			window.location.hash = '/source-selector'; // ? 入後若?  ?定目標 ?? 登?  ?， ?跳 ??  ?源選? 器
		    }
		    handleHashChange();
		
                } else {
                    alert("?  ??  ?定 ??  ?系統將無法 ?步您? 雲端進度 ?);
                    // 移除?  ?? 出， ?? 使? 者 ?要 ?
                }
            } catch (err) {
                console.error(err);
                // 移除?  ?? 出，改?  ? ?
                alert("???? 人? 端失 ?，可? 是網路不穩！ ?? 新?  ??  ?後 ?試 ?);
            }
        } else {
            currentUser = null;
            personalDb = null;
            
            const actionBtn = document.getElementById('actionBtn');
            if (actionBtn) {
                actionBtn.disabled = false;
                actionBtn.innerText = isLoginMode ? '? 入系統' : '註 ?並 ?定雲 ?;
            }

            window.location.hash = '/login';
	    handleHashChange(); //確 ?? 登?  ?立刻顯示? 入??
        }
    });
    
    // ==========================================
    // 3. ? 端資 ?? 步 & ?  ?? 新機制
    // ==========================================
    
    async function loadUserDataFromCloud(isBackground = false) {
        if (!currentUser || !personalDb) return;
        try {
            const docSnap = await personalDb.collection('users').doc(currentUser.uid).get();
            if (docSnap.exists) {
                const data = docSnap.data();

                // 載入?  ?題庫清單 (? 是資 ?? 庫)
                if (data.userCustomBanks) {
                    const parsedBanks = JSON.parse(data.userCustomBanks);
                    try {
                        // ?   ?  ?修正： ?子 ??  ??  ??  ? customBanks 資 ?， ???1MB ? 制
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
                        console.error("載入?  ?題庫? 容失 ? ?, e);
                        db.customBanks = parsedBanks;
                    }
                }

                const isCustom = currentBankUrl && currentBankUrl.startsWith("local_custom_");

                if (!isCustom) {
                    // ?  ?設 ?庫模式】 ?讀?  ?? 進度
                    const safeKey = currentBankUrl ? currentBankUrl.replace(/[\.\#\$\[\]]/g, '_') : '';
                    if (safeKey && data.bankProgress && data.bankProgress[safeKey]) {
                        const prog = JSON.parse(data.bankProgress[safeKey]);
                        db.categories = prog.categories || [];
                        db.problems = prog.problems || [];
                        db.version = prog.version || "";
                    }
                    
                    // ?? ?  ?? 失? 自訂 ?類 ?如 ? bankProgress 存 ?失 ?， ? customCategories ?  ? ?
                    if (data.customCategories) {
                        Object.values(data.customCategories).forEach(cc => {
                            // 確 ?? 屬? 這個 ?庫 ??  ??  ?
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

                    // ?? ?  ?? 失? 自訂 ??  ?如 ? bankProgress 存 ?失 ?（ ?如容?  ?表 ?， ? customProblems ?  ? ?
                    if (data.customProblems) {
                        Object.values(data.customProblems).forEach(cp => {
                            if (cp && cp.id) {
                                const existingP = db.problems.find(p => p.id == cp.id);
                                if (existingP) {
                                    Object.assign(existingP, cp); // ? 併修改
                                } else {
                                    // 確 ??  ?屬於?  ?題庫 (檢查?  ?? 否存在)
                                    if (db.categories.some(c => c.id == cp.catId)) {
                                        db.problems.push(cp);
                                    }
                                }
                            }
                        });
                    }
                } else {
                    // ? 自訂 ?庫模式】 ??  ? ID  ?customBanks ? 庫中 ?活 ???
                    const customId = currentBankUrl.replace("local_custom_", "");
                    const targetBank = db.customBanks.find(b => b.id === customId);
                    if (targetBank) {
                        // ?   ?  ?修正： ?? 是? 景載入， ?對 ?要 ?? 目? 正? 編輯 ??  ?題庫? 容 ?
                        // ? 為? 地 localStorage ?  ??  ??  ?? 鮮?  ?? 端? 可? 是上次?  ?存 ??  ?資 ?
                        if (!isBackground) {
                            db.categories = JSON.parse(JSON.stringify(targetBank.categories || []));
                            db.problems = JSON.parse(JSON.stringify(targetBank.problems || []));
                            db.version = targetBank.version || "";
                        }
                    }
                }
                
                if (data.historyData) executionHistories = JSON.parse(data.historyData);

                // ? 新? 地快 ?，確保 ?次 ?? 整? 拿?  ?也是對 ?
                localStorage.setItem('oj_v15_data', JSON.stringify(db));
                localStorage.setItem('oj_v15_history', JSON.stringify(executionHistories));
            }

            if (!isBackground) checkUrlAndLoad();
            checkForUpdates();
        } catch (e) { 
            console.error("讀? 雲端失?  ?", e); 
        }
    }
    

    async function checkForUpdates() {
        // ?   ?? 護 1： ?? 是?  ?題庫， ?對 ??  ?GitHub ? 新請 ?
        if (!currentBankUrl || currentBankUrl.startsWith("local_custom_")) return; 
        
        const checkUrl = currentBankUrl; 
        try {
            const res = await fetch(checkUrl + '?t=' + new Date().getTime());
            if (res.ok) {
                const newDb = await res.json();
                if (newDb.version && newDb.version !== db.version) {
                    // ?   ?? 護 2： ?上網? 標籤
                    newDb._sourceUrl = checkUrl; 
                    pendingUpdateDb = newDb;
                    if (currentView === 'view-categories') { 
                        document.getElementById('updateToast').style.display = 'flex'; 
                    }
                }
            }
        } catch (e) { 
            console.error("檢查? 新失 ?", e); 
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
        
        // ?   海 ?安檢：強? 淨?  ? GitHub 下 ??  ???JSON， ??  ?小 ?殘 ?? 自訂 ? ?
        (newDb.categories || []).forEach(c => delete c.isUserAdded);
        (newDb.problems || []).forEach(p => delete p.isUserAdded);
        
        // 確 ????存在，避??.some() ? 出? 誤導致? 個 ?程中??
        newDb.categories = newDb.categories || [];
        newDb.problems = newDb.problems || [];
        
        // 1. 精 ?? 出?  ?? 容：只要 ?? 於? 地/? 端， ??  ??  ??  ??  ?? 中?  ?， ?律 ?? 自訂擴??
        const userAddedCategories = db.categories.filter(oldC => !newDb.categories.some(newC => newC.id === oldC.id));
        const userAddedProblems = db.problems.filter(oldP => !newDb.problems.some(newP => newP.id === oldP.id));
        
        // 賦 ?? 死?  ?， ?系統?  ??  ?? 自訂擴?  ?並 ?許使? 者刪??(? 含被 ??  ?汰 ??  ???
        userAddedCategories.forEach(c => c.isUserAdded = true);
        userAddedProblems.forEach(p => p.isUserAdded = true);

        // 2. 清除 Firebase ? 客製 ?紀?  ?確 ?官方題庫覆 ?
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

        // ?   ? 步保 ?程 ?碼 ?答進度，避?  ?? 更?  ?，自己寫?  ?式碼不 ?
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

        // 3. 組 ?：全?  ??  ? ?+ 你 ??  ??  ?
        newDb.categories = [...newDb.categories, ...userAddedCategories];
        newDb.problems = [...newDb.problems, ...userAddedProblems];
        
        const preservedCustomBanks = db.customBanks || [];
        db = newDb; 
        db.customBanks = preservedCustomBanks;

        // ?? 強制? 端覆 ?存 ?
        await saveToLocal(true, false);
        
        document.getElementById('updateToast').style.display = 'none'; 
        pendingUpdateDb = null;
        alert("??題庫已 ??  ?步至? ?  ??  ?\n? 設題目已全? 更?  ??  ?作 ?紀?  ??  ?題目也已安全保 ???); 
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
        // 1. 如 ?? 自訂 ?庫 ??  ??  ?編輯? 容? 填??customBanks ??? ?
        const isCustom = currentBankUrl && currentBankUrl.startsWith("local_custom_");
        if (isCustom) {
            const customId = currentBankUrl.replace("local_custom_", "");
            const bankIdx = db.customBanks.findIndex(b => b.id === customId);
            if (bankIdx !== -1) {
                db.customBanks[bankIdx].categories = JSON.parse(JSON.stringify(db.categories));
                db.customBanks[bankIdx].problems = JSON.parse(JSON.stringify(db.problems));
                
                // ?   ?  ?? 個特定 ? custom bank ? 獨立 ? subcollection
                if (syncDbToCloud && currentUser && personalDb) {
                    try {
                        personalDb.collection('users').doc(currentUser.uid).collection('customBanks').doc(customId).set(db.customBanks[bankIdx]);
                    } catch(e) {}
                }
            }
        }

        // 2. ? 地端 ??  ? ?(? 為保險)
        localStorage.setItem('oj_v15_data', JSON.stringify(db)); 
        localStorage.setItem('oj_v15_history', JSON.stringify(executionHistories));
        if (currentUser) localStorage.setItem('oj_v15_uid', currentUser.uid);

        if (!syncDbToCloud && !syncHistoryToCloud) return; 

        // 3. ? 端? 離?  ?
        if (currentUser && personalDb) { // 確 ? personalDb 存在
            try {
                let updatePayload = {
                    lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
                };

                // ?  ?：根? 當? 環境選? 儲存 ? ?
                if (syncDbToCloud) {
                    // ?   輕 ???userCustomBanks，只存基?  ?訊以維 ??  ??  ??  ? ?  主 ? ?1MB ? 制
                    const lightweightBanks = (db.customBanks || []).map(b => ({ id: b.id, name: b.name, version: b.version }));
                    updatePayload.userCustomBanks = JSON.stringify(lightweightBanks);
                    
                    if (!isCustom) {
                        // ? 移 ?70-5  ?  ?  ?輯】 ?? 用網 ??  ??  ?安全??Key
                        const safeKey = currentBankUrl ? currentBankUrl.replace(/[\.\#\$\[\]]/g, '_') : '';
                        
                        updatePayload.bankProgress = {
                            [safeKey]: JSON.stringify({
                                categories: db.categories,
                                problems: db.problems,
                                version: db.version
                            })
                        };
                        
                        // ?  ??  ?? 到? 外層
                        updatePayload.bankVersions = {
                            [safeKey]: db.version || "?  ???
                        };
                    }
                }

                if (syncHistoryToCloud) {
                    updatePayload.historyData = JSON.stringify(executionHistories);
                }

                // 寫入? 人?  ?? 庫
                await personalDb.collection('users').doc(currentUser.uid).set(updatePayload, { merge: true });
                console.log("??? 端? 離?  ??  ?");
            } catch (e) { 
                console.error("? 端? 步失 ? ?, e); 
            }
        }
    }


    // ?  ??  ??  ?? 更? 函??
    async function syncProblemDeltaToCloud(probId, diff) {
        if (!currentUser) return;
        
        // ?   ??  ?? 護： ?? 是?  ?題庫， ??  ??  ? saveToLocal 已 ??  ?存好了 ?? 裡? 接?  ?，避? 浪費雲端空??
        const isCustom = currentBankUrl && currentBankUrl.startsWith("local_custom_");
        if (isCustom) return; 

        let payload = { customProblems: {} };
        
        if (diff === null) {
            // ? 入 null  ?  要 ??  ?從雲端刪??
            payload.customProblems[probId] = firebase.firestore.FieldValue.delete();
        } else {
            // ?  ??  ?修改?  ?位」更??
            payload.customProblems[probId] = diff;
         }
        
        try {
            await personalDb.collection('users').doc(currentUser.uid).set(payload, { merge: true });
            console.log(`題目 ${probId} 已 ?? 更? 至? 端`, diff);
        } catch(e) {
            console.error("? 端局? 更? 失?  ?", e);
        }
    }
    
    // ?   ?  ?： ?步自訂 ?類至? 端 ( ?   1MB 容 ?? 制導致? 自訂 ?類遺失 ? ?
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
            console.log(`?  ? ${catId} ? 端? 步完 ?`, diff);
        } catch(e) {
            console.error(`?  ? ${catId} ? 端? 步失 ?：`, e);
        }
    }
    
    
    // ==========================================
    // 4.  ??系統?  ?? 輯
    // ==========================================
    let currentCatId = null;
    let currentProbId = null;
    let currentCompileMode = 'wandbox'; // ?  ?三段式 ???
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
	
	
	
	// ===== ?  ?：登??註 ?欄 ???Enter 快捷??=====
	const emailInput = document.getElementById('emailInput');
	const passwordInput = document.getElementById('passwordInput');
    
	if (emailInput && passwordInput) {
	    // Email 欄 ??  ? Enter，焦點跳?  ?碼 ? ?
	    emailInput.addEventListener('keydown', function(e) {
		if (e.key === 'Enter') {
		    e.preventDefault(); // ?  ?觸發網 ?? 設?  ?行 ?? 交行為
		    passwordInput.focus();
		}
	    });
        
	    // 密碼欄 ??  ? Enter，直? 執行登??註 ?流 ?
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

        // 1. ?  ?路 ?
        const hash = window.location.hash || '#/source-selector'; 
        const [path, queryString] = hash.substring(1).split('?');
        const params = new URLSearchParams(queryString || '');

        // 2. ? 優? 】公?  ?? 判?  ?讓 ?學 ?網 ?? 畫?  ??  ?步 ?不被? 入? 輯? 截
        if (path === '/firebase-tutorial') {
            showView('view-firebase-tutorial');
            return; 
        }

        // 3. ?  ?? ? 】登? 檢?  ??  ?? 「 ??  ??  ?? 未? 入?  ?存 ?
        if (!currentUser) {
            showView('view-login');
            return;
        }

        // 4. ?  ?人 ?? 】路徑判??
        if (path === '/login' || path === '') {
            window.location.hash = '/source-selector';
            return;
        }

        if (path === '/source-selector') {
            const nameEl = document.getElementById('user-name');
            if (nameEl) nameEl.innerText = currentUser.email;
            
            const emailEl = document.getElementById('sourceSelectorUserEmail');
            if (emailEl) emailEl.innerText = "?  ?? 入 ? + currentUser.email;
            
            showView('view-source-selector');
        } 
        else if (path === '/custom-portal') {
            renderCustomPortal();
            showView('view-custom-portal');
        }
        else if (path === '/portal') {
            showView('view-portal');
        } 
        else if (path === 'dashboard.html') {
            currentCatId = null;
            
            //確 ?? 新?  ?後 ?標 ?? 顯示目?  ?? 中?  ?庫 ? ?
            if (currentBankName) {
                const nameEl = document.getElementById('currentBankName');
                if (nameEl) nameEl.innerHTML = `<i class="fa-solid fa-folder-open" style="color: #60a5fa; margin-right: 8px;"></i> ?  ?題庫: ` + currentBankName;
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
            // ? 設跳 ?大廳，避? 未? 路徑 ?? 白? 面
            showView('view-portal');
        }
    }

    
    //?  ??  ?題庫?  ?模 ?
    function toggleBankSortMode() {
        isBankSortMode = !isBankSortMode;
        const btn = document.getElementById('bankSortBtn');
        if (btn) {
            btn.innerText = isBankSortMode ? "??完 ??  ?" : "??調整?  ?";
            btn.className = isBankSortMode ? "btn btn-danger" : "btn btn-outline";
            if (!isBankSortMode) {
                // 結 ??  ?? 恢復白? 樣 ?
                btn.style.color = "white";
                btn.style.borderColor = "white";
            }
        }
        renderCustomPortal(); // ? 新渲 ?? 表以 ?? 模 ?
    }
    
    //?  ??  ?題庫?  ?序 ?? 輯 (?  ??  ?? 能)
    function saveBankOrder() {
        const cards = document.querySelectorAll('#customBankList .bank-btn');
        const newOrder = [];
        cards.forEach(card => {
            const bank = db.customBanks.find(b => b.id === card.dataset.id);
            if (bank) newOrder.push(bank);
        });
        db.customBanks = newOrder;
        saveToLocal(true, false); 
    }
    
    // 渲 ??  ?題庫清單
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
            card.style.padding = '40px 20px'; // ? 大?  ?題庫?  ?高度
            card.setAttribute('draggable', isBankSortMode);
            card.dataset.idx = idx; // 紀?  ?始索 ?(保 ? ?onclick 使用)
            card.dataset.id = bank.id; // 紀? 唯一 ID (?  ???
            
            // ?  ?模 ?下 ?顯示?  ??  ?， ??  ?模 ?顯示?  ?? 刪??
            const actionsHtml = isBankSortMode ? '' : `
                <div style="position: absolute; top: 10px; right: 10px; display: flex; gap: 5px;">
                    <button class="prob-btn-icon" style="color: #1e3a8a; background: rgba(0,0,0,0.05);" onclick="renameCustomBank(event, ${idx})" title="?  ?"><i class="fa-solid fa-pen"></i></button>
                    <button class="prob-btn-icon" style="color: #ef4444; background: rgba(0,0,0,0.05);" onclick="deleteCustomBank(event, ${idx})" title="? 除">??/button>
                </div>
            `;

            card.innerHTML = `
                <div onclick="if(!isBankSortMode) loadCustomBank(${idx})" style="width:100%; height:100%; display:flex; flex-direction:column; align-items:flex-start; justify-content:center; text-align:left; padding-left: 5px; cursor: ${isBankSortMode ? 'grab' : 'pointer'};">
                    <span style="font-size:1.5rem;"><i class="fa-solid fa-folder-open" style="color: #60a5fa; margin-right: 8px;"></i> ${bank.name}</span>
                    <span class="bank-desc" style="color: inherit;">${bank.problems ? bank.problems.length : 0}  ?/span>
                </div>
                <div class="bank-actions">
                    <button class="btn btn-outline btn-sm" style="background: white; color: #333; padding: 4px 8px; font-size: 0.85rem; border-color: #ccc;" onclick="renameCustomBank(event, ${idx})" title="?  ?"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn btn-outline btn-sm" style="background: white; color: #f44747; border-color: #f44747; padding: 4px 8px; font-size: 0.85rem;" onclick="deleteCustomBank(event, ${idx})" title="? 除"><i class="fa-solid fa-trash"></i></button>
                </div>
            `;
            container.appendChild(card);
        });

        // 如 ??  ?序模式 ??  ?? 曳? 能
        if (isBankSortMode) {
            enableDragSort('customBankList', 'bank-btn', saveBankOrder);
        }
    }
    

    // ?  ??  ?題庫
    async function addCustomBank() {
    	const name = prompt("請輸? 自訂 ?庫 ?稱 ?");
    	if (!name) return;
	
	// ?  ?機制， ??  ?資 ?沒 ?? 個陣?  ?就幫它建一? 空??
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
        if (btn) { btn.disabled = true; btn.innerText = "??建 ? ?.."; }
        await saveToLocal(true, false); // ? 步? 使? 者雲 ?
        
        // ?   ? 步寫入子 ???
        if (currentUser && personalDb) {
            try {
                await personalDb.collection('users').doc(currentUser.uid).collection('customBanks').doc(newBank.id).set(newBank);
            } catch(e) {}
        }
        
        if (btn) { btn.disabled = false; btn.innerText = "+ ?  ?題庫"; }
        renderCustomPortal();
    }
    
    //?  ?? 能
    async function renameCustomBank(e, idx) {
        e.stopPropagation(); // ? 止觸發? 入題庫?  ??  ? ?
        const oldName = db.customBanks[idx].name;
        const newName = prompt("請輸? 新?  ?庫 ?稱 ?", oldName);
        
        if (newName && newName.trim() !== "" && newName !== oldName) {
            db.customBanks[idx].name = newName.trim();
            
            // ?   如 ?? 改? 是?  ? ?  使用?  ?庫 ?? 步? 新? 稱
            if (currentBankUrl === "local_custom_" + db.customBanks[idx].id) {
                currentBankName = newName.trim();
                localStorage.setItem('oj_v15_bank_name', currentBankName);
                const bankNameEl = document.getElementById('currentBankName');
                if (bankNameEl) bankNameEl.innerHTML = `<i class="fa-solid fa-folder-open" style="color: #60a5fa; margin-right: 8px;"></i> ?  ?題庫: ` + currentBankName;
            }
            
            const btn = e.target;
            const originalText = btn.innerText;
            if (btn) { btn.disabled = true; btn.innerText = "??; }
            await saveToLocal(true, false); // ? 步? 雲端 ?? 地
            
            // ?   ? 步?  ??  ?
            if (currentUser && personalDb) {
                try {
                    await personalDb.collection('users').doc(currentUser.uid).collection('customBanks').doc(db.customBanks[idx].id).set({ name: newName.trim() }, { merge: true });
                } catch(e) {}
            }
            
            if (btn) { btn.disabled = false; btn.innerText = originalText; }
            renderCustomPortal();    // 立即? 新渲 ?? 面
        }
    }
    
    // 載入?  ?? 自訂 ?庫內容到系統主 ?   
    async function loadCustomBank(idx) {
        // ?? UI ?  ?： ??  ?? 中? 畫並 ?定全?  ??  ?? 止?  ?點 ?
        const container = document.getElementById('customBankList');
        const cards = container.querySelectorAll('.bank-btn');
        let clickedCard = null;
        let originalContent = "";
        
        cards.forEach(card => {
            if (parseInt(card.dataset.idx) === idx) {
                clickedCard = card.querySelector('div[onclick]');
                if (clickedCard) {
                    originalContent = clickedCard.innerHTML;
                    clickedCard.innerHTML = `<span style="font-size:1.5rem; font-weight:bold;">??載入 ?..</span><span class="bank-desc" style="color: inherit;">?  ?並 ??  ? ?/span>`;
                }
            }
            card.style.pointerEvents = 'none';
            card.style.opacity = '0.6';
        });

        try {
            // ?  ?一下目? 在?  ?? 西
            await saveToLocal(true, false);

        // ?   ?? 護 4：強?  ?空 ?待中? 更?  ??  ? ?
        pendingUpdateDb = null;
        const toast = document.getElementById('updateToast');
        if (toast) toast.style.display = 'none';

        const selected = db.customBanks[idx];
        currentBankName = selected.name;
        currentBankUrl = "local_custom_" + selected.id;

        // 徹 ??  ?資 ?主 ?
        db.categories = JSON.parse(JSON.stringify(selected.categories || []));
        db.problems = JSON.parse(JSON.stringify(selected.problems || []));
        db.version = selected.version;

        // ?   ?  ?修正： ??  ?題庫資 ?後 ?立刻寫入 localStorage ??data
        // ?  ?如 ?使用? 此?  ? ?F5， ?讀? 到? 新網 ??  ??  ?題庫? 容?  ?導致資 ??  ? ?
        localStorage.setItem('oj_v15_data', JSON.stringify(db));

        localStorage.setItem('oj_v15_bank_name', currentBankName);
        localStorage.setItem('oj_v15_bank_url', currentBankUrl);
        
        const bankNameEl = document.getElementById('currentBankName');
        if (bankNameEl) bankNameEl.innerHTML = `<i class="fa-solid fa-folder-open" style="color: #60a5fa; margin-right: 8px;"></i> ?  ?題庫: ` + currentBankName;
        
        window.location.hash = 'dashboard.html';
        
        } catch (e) {
            console.error("?  ?題庫?  ?? 誤", e);
            alert("?  ?題庫? 發? 錯誤 ?");
        } finally {
            // ?? ? 復?  ?? ??
            cards.forEach(card => {
                card.style.pointerEvents = 'auto';
                card.style.opacity = '1';
            });
            if (clickedCard && originalContent) {
                clickedCard.innerHTML = originalContent;
            }
        }
    } 

    // ? 除?  ?題庫
    async function deleteCustomBank(e, idx) {
        e.stopPropagation();
        if (confirm(`確 ?要刪? 自訂 ?庫 ?{db.customBanks[idx].name}?  ?？此?  ??  ?復 ?? `)) {
            db.customBanks.splice(idx, 1);
            const btn = e.target;
            if (btn) { btn.disabled = true; btn.innerText = "??; }
            await saveToLocal(true, false);
            renderCustomPortal();
    	}
    }
       
    
    async function fetchAndLoadBank(jsonUrl, displayName, forceReset = false) {
        if (!currentUser) { alert("請 ?? 入帳 ? ?); return; }

        pendingUpdateDb = null;
        const toast = document.getElementById('updateToast');
        if (toast) toast.style.display = 'none'; 
        
        // ?? UI ?  ?： ??  ?? 中? 畫並 ?定全?  ???
        const buttons = document.querySelectorAll('.bank-btn');
        let clickedBtn = null;
        let originalContent = "";
        buttons.forEach(btn => {
            if (btn.getAttribute('onclick') && btn.getAttribute('onclick').includes(jsonUrl)) {
                clickedBtn = btn;
                originalContent = btn.innerHTML;
                btn.innerHTML = `<span style="font-size: 1.5rem; font-weight:bold;">??載入 ?..</span><span class="bank-desc">? 步? 端資 ?</span>`;
            }
            btn.style.pointerEvents = 'none';
            btn.style.opacity = '0.6';
        });

        try {
            // ?? ? 能?  ?：平行 ?下 ? GitHub 題庫??Firebase ? 端? 度， ??  ?? 以上 ?等 ??  ?
            const fetchPromise = fetch(jsonUrl).then(res => {
                if (!res.ok) throw new Error("伺 ??  ??  ??  ?" + res.status);
                return res.json();
            });
            const dbPromise = personalDb ? personalDb.collection('users').doc(currentUser.uid).get() : Promise.resolve(null);
            
            const [newDb, docSnap] = await Promise.all([fetchPromise, dbPromise]);
            
            // ?   海 ?安檢：強? 淨?  ? GitHub 下 ??  ???JSON， ??  ?小 ?殘 ?? 自訂 ? ?
            (newDb.categories || []).forEach(c => delete c.isUserAdded);
            (newDb.problems || []).forEach(p => delete p.isUserAdded);
            
            // 確 ????存在，避??.some() ? 出? 誤導致? 個 ?程中??
            newDb.categories = newDb.categories || [];
            newDb.problems = newDb.problems || [];
            
            let shouldSyncDb = forceReset;

            // --- 1.  ?Firebase ?  ?你在? 份題庫? 「雲端歷?  ?檔 ?---
            let savedCategories = [];
            let savedProblems = [];
            const safeKey = jsonUrl.replace(/[\.\#\$\[\]]/g, '_');

            if (personalDb) {
                try {
                    // docSnap 已 ??  ?? 透 ? Promise.all ?  ? ?
                    if (docSnap && docSnap.exists) {
                        const data = docSnap.data();
                        if (data.bankProgress && data.bankProgress[safeKey]) {
                            const prog = JSON.parse(data.bankProgress[safeKey]);
                            savedCategories = prog.categories || [];
                            savedProblems = prog.problems || [];
                        }
                        
                        // ?? ?  ?? 失? 自訂 ?類 ?如 ? bankProgress 存 ?失 ?， ? customCategories ?  ?份中?  ? ?
                        if (data.customCategories) {
                            Object.values(data.customCategories).forEach(cc => {
                                // 檢查? 否屬於?  ? ?  載入?  ? ?(jsonUrl)
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

                        // ?? ?  ?? 失? 自訂 ??  ?如 ? bankProgress 存 ?失 ?， ? customProblems ?  ?份中?  ? ?
                        if (data.customProblems) {
                            Object.values(data.customProblems).forEach(cp => {
                                if (cp && cp.id) {
                                    const existingP = savedProblems.find(p => p.id == cp.id);
                                    if (existingP) {
                                        Object.assign(existingP, cp);
                                    } else {
                                        // 確 ??  ?屬於?  ?題庫 (?  ??  ??  ??  ?? 地存 ? ?
                                        const isForThisBank = newDb.categories.some(c => c.id == cp.catId) || savedCategories.some(c => c.id == cp.catId);
                                        if (isForThisBank) {
                                            savedProblems.push(cp);
                                        }
                                    }
                                }
                            });
                        }
                    }
                } catch (e) { console.error("讀? 目標 ?庫進度失 ?", e); }
            }

            // --- 2. 絕 ??  ?? 離：只要雲端 ?， ? GitHub ? ?  ??  ??  ?，統統 ?? 「自訂擴?  ?---
            const userAddedCategories = savedCategories.filter(oldC => !newDb.categories.some(newC => newC.id === oldC.id));
            const userAddedProblems = savedProblems.filter(oldP => !newDb.problems.some(newP => newP.id === oldP.id));
            
            // 賦 ?? 死?  ?， ?系統?  ??  ?? 自訂擴?  ?並 ?許使? 者刪??(? 含被 ??  ?汰 ??  ???
            userAddedCategories.forEach(c => c.isUserAdded = true);
            userAddedProblems.forEach(p => p.isUserAdded = true);

            // --- 3. ?  ?? 設題庫? 併 (?? ? 裡就是你 ??  ?? 鍵 ? ---
            const bankVersions = JSON.parse(localStorage.getItem('oj_v15_bank_versions') || '{}');
            const lastSyncedVersion = bankVersions[jsonUrl];
            const isUpdate = (!forceReset && newDb.version && lastSyncedVersion !== undefined && newDb.version !== lastSyncedVersion);

            if (forceReset || isUpdate) {
                shouldSyncDb = true; 
                // ? 強?  ?? 模式】 ?? 新? 本?  ??  ??  ?庫 ??  ?修改?  ?述 ??  ??  ?式碼
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
                // ?  ?  ??  ?? 模式】無?  ??  ?完整保 ?你 ?官方題目?  ?任 ?修改 (? 含標 ??  ?述、測 ?
                newDb.categories = newDb.categories.map(newC => {
                    const oldC = savedCategories.find(c => c.id === newC.id);
                    return oldC ? Object.assign({}, newC, oldC) : newC;
                });
                newDb.problems = newDb.problems.map(newP => {
                    const oldP = savedProblems.find(p => p.id === newP.id);
                    return oldP ? Object.assign({}, newP, oldP) : newP;
                });
            }

            // --- 4. 完 ?組 ?： ??  ? + ?  ??  ? ---
            db.categories = [...newDb.categories, ...userAddedCategories];
            db.problems = [...newDb.problems, ...userAddedProblems];
            db.version = newDb.version || (userAddedProblems.length > 0 ? "保 ?? 度?? : ""); 

            const preservedCustomBanks = db.customBanks || [];
            db.customBanks = preservedCustomBanks;

            currentBankUrl = jsonUrl; 
            currentBankName = displayName || jsonUrl;
            bankVersions[jsonUrl] = db.version;
            localStorage.setItem('oj_v15_bank_versions', JSON.stringify(bankVersions));
            localStorage.setItem('oj_v15_bank_name', currentBankName); 
            localStorage.setItem('oj_v15_bank_url', currentBankUrl);
            
            const bankNameEl = document.getElementById('currentBankName');
            if (bankNameEl) bankNameEl.innerHTML = `<i class="fa-solid fa-folder-open" style="color: #60a5fa; margin-right: 8px;"></i> ?  ?題庫: ` + currentBankName;
                
            saveToLocal(shouldSyncDb, false);      
            window.location.hash = 'dashboard.html';
            checkForUpdates();

        } catch (err) { 
            alert("載入失 ?！ ?確 ? GitHub 檔 ?? 否存在\n\n詳細? 誤 ? + err.message); 
        } finally {
            // ?? ? 復?  ?? ?  ??  ??  ?? 失? 都 ???  ?
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
            alert("?  ?? 空?  ??  ??  ?? 新載入??); 
            return; 
        } 
        if (confirm("?  ? 警 ?：這 ??  ?? 「 ?設 ?庫」 ?? ? 自訂設定 ? ?  ，並? 新下 ?? ?  ?庫 ?\n(? 自行新增 ?題目?  ?類 ?? 被安全保 ?，執行 ??  ?不 ?消失)")) { 
            // 將 ??  ?輯交??fetchAndLoadBank ?  ?對 ??  ?
            fetchAndLoadBank(currentBankUrl, currentBankName, true); 
        } 
    }
    
    function hardResetAll() { 
        if (confirm("?  ? 警 ?：這 ??  ??  ??  ??  ?讓系統 ?? 「 ?? 空? 」 ??  ?確 ??  ?")) { 
            db = { categories: [], problems: [], version: "" }; 
            currentBankName = "?  ??  ? ?(空白)"; 
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

    // === V60: Workspace ?  ?繪製?  ???===
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
        
        // 確 ?空 ?串模?  ?? 被覆 ?
        if (p.tpl_cpp === undefined) p.tpl_cpp = p.templateCode !== undefined ? p.templateCode : defaultTemplates.cpp;
        if (p.tpl_python === undefined) p.tpl_python = defaultTemplates.python;
        
        // 確 ? multiFiles ??code 屬性 ???
        if (p.isMultiFile && p.multiFiles) {
            p.multiFiles.forEach(f => { 
                if (f.code === undefined) f.code = f.tpl !== undefined ? f.tpl : ""; 
            });
        }
        
        if (!fromAdmin) { 
                // 修正：只要是? 新? 入作 ?? （ ??  ??  ?， ?律強?  ?置為?  ?設模?  ?
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
        
        currentFileIndex = -1; // ? 入題庫?  ?設顯 ?main
        renderWorkspaceTabs();

        if (lang === 'cpp') { 
            editor.session.setMode("ace/mode/c_cpp"); 
            editor.setValue(p.code_cpp !== undefined ? p.code_cpp : p.tpl_cpp, -1); 
        } else if (lang === 'python') { 
            editor.session.setMode("ace/mode/python"); 
            editor.setValue(p.code_python !== undefined ? p.code_python : p.tpl_python, -1); 
        }
        
        document.getElementById('outputLogs').innerHTML = '<div style="color:#666;">等 ??  ?...</div>';
        showView('view-workspace');
    }

    function goToAdmin() { 
        const lang = document.getElementById('langSelect').value;
        const p = db.problems.find(x => x.id === currentProbId);
        
        // 保 ? Workspace 編輯? 目?  ?? ??
        if (lang === 'cpp' && p.isMultiFile) {
            if (currentFileIndex === -1) p.code_cpp = editor.getValue();
            else p.multiFiles[currentFileIndex].code = editor.getValue();
        } else {
            if (p) p['code_' + lang] = editor.getValue(); 
        }
        
        window.location.hash = '/admin?probId=' + currentProbId;
    }

    // === V60: Admin 多 ?案 ?? 繪製 ??  ? ===
    function toggleAdminMultiFile() {
        const isEnabled = document.getElementById('adminEnableMultiFile').checked;
        document.getElementById('adminEditorTabs').style.display = (isEnabled && currentAdminLang === 'cpp') ? 'flex' : 'none';
        
        if (isEnabled && adminMultiFiles.length === 0) {
            adminMultiFiles.push({ name: "Class.cpp", tpl: "\n" });
            adminMultiFiles.push({ name: "Class.h", tpl: "\n" });
        }
        
        if (!isEnabled || currentAdminLang !== 'cpp') { 
            switchAdminFile(-1); // ?  ??  ??  ? main ? 覽
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
                        <span class="tab-icon" title="? 新?  ?" onclick="renameAdminFile(event, ${idx})"><i class="fa-solid fa-pen"></i></span> 
                        <span class="tab-icon" title="移除" onclick="removeAdminFile(event, ${idx})">??/span>
                     </div>`;
        });
        
        html += `<div class="editor-tab" style="color:var(--success);" onclick="addAdminFile()">+ ?  ?檔 ?</div>`;
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
        const name = prompt("請輸? 新增 ?案 ? ?(例 ? Rectangle.cpp):", "NewClass.cpp");
        if (name && name.trim() !== "") {
            adminMultiFiles.push({ name: name.trim(), tpl: "// " + name.trim() + "\n" });
            switchAdminFile(adminMultiFiles.length - 1);
        }
    }

    function renameAdminFile(e, idx) {
        e.stopPropagation();
        const newName = prompt("? 新?  ?:", adminMultiFiles[idx].name);
        if (newName && newName.trim() !== "") {
            adminMultiFiles[idx].name = newName.trim();
            renderAdminTabs();
        }
    }
    
    function removeAdminFile(e, idx) {
        e.stopPropagation();
        if (confirm("確 ?? 除此 ?案 ?")) {
            const wasCurrentTab = (adminCurrentFileIndex === idx);
            if (adminCurrentFileIndex > idx) adminCurrentFileIndex--; 
            
            adminMultiFiles.splice(idx, 1); //?  ?資 ????移除

            if (wasCurrentTab) {
                adminCurrentFileIndex = -1;
                document.getElementById('editTemplate').value = adminTempTemplates[currentAdminLang] || ""; 
            }
            renderAdminTabs(); //? 渲?  ?次 ??  ?? ??
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
        
        // ?  ???Admin ?  ?檔 ?設 ?
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
            if (!e.target.classList.contains(itemClass)) return; 
            draggedItem = e.target; 
            e.target.classList.add('dragging'); 
            e.dataTransfer.effectAllowed = 'move'; 
        });
        
        container.addEventListener('dragend', (e) => { 
            if (!e.target.classList.contains(itemClass)) return; 
            e.target.classList.remove('dragging'); 
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
            
            card.innerHTML = `<div class="cat-title">${cat.name}</div><div class="cat-count">${probCount}  ?/div><div class="cat-actions"><button class="btn btn-outline btn-sm" onclick="editCategory(event, '${cat.id}')"><i class="fa-solid fa-pen"></i></button><button class="btn btn-outline btn-sm" onclick="deleteCategory(event, '${cat.id}')" style="color:#f44747; border-color:#f44747;"><i class="fa-solid fa-trash"></i></button></div>`;
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
        const cards = document.querySelectorAll('.cat-card'); 
        const newOrder = []; 
        cards.forEach(card => { 
            const cat = db.categories.find(c => c.id === card.dataset.id); 
            if (cat) newOrder.push(cat); 
        }); 
        db.categories = newOrder; 
        saveToLocal(true, false); 
    }

    
    async function createCategory() { 
        if (isCatSortMode) return; 
        const name = prompt("?  ?類 ?稱 ?"); 
        if (!name) return; 
        // ?   ?  ? isUserAdded 標籤，並綁 ? bankUrl 供跨裝置? 份辨 ?
        const newCat = { id: Date.now().toString(), name: name, isUserAdded: true, bankUrl: currentBankUrl };
        db.categories.push(newCat); 
        const btn = document.querySelector('#view-categories .btn-primary');
        if (btn) { btn.disabled = true; btn.innerText = "???  ? ?.."; }
        await saveToLocal(true, false); 
        await syncCategoryDeltaToCloud(newCat.id, newCat);
        if (btn) { btn.disabled = false; btn.innerText = "+ ?  ??  ?"; }
        renderCategoryList(); 
    }
    

    async function editCategory(e, id) { 
        e.stopPropagation(); 
        const cat = db.categories.find(c => c.id === id); 
        const newName = prompt("修改?  ?? 稱 ?, cat.name); 
        if (newName) { 
            cat.name = newName; 
            await saveToLocal(true, false); 
            await syncCategoryDeltaToCloud(cat.id, cat);
            renderCategoryList(); 
        } 
    }

    async function deleteCategory(e, id) { 
        e.stopPropagation(); 
        if (!confirm("確 ?? 除？ ?下 ?題目也 ?一併刪?  ?)) return; 
        
        const problemsToDelete = db.problems.filter(p => p.catId === id);
        
        db.categories = db.categories.filter(c => c.id !== id); 
        db.problems = db.problems.filter(p => p.catId !== id); 
        
        await saveToLocal(true, false); 
        
        // ? 端? 步? 除?  ?? 其題目
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
        document.getElementById('currentCatTitle').innerText = cat ? cat.name : "?  ?題庫";
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
                const delBtnHtml = canDelete ? `<button class="prob-btn-icon prob-del-btn" onclick="deleteProblemInList(event, '${p.id}')" title="? 除題目"><i class="fa-solid fa-trash"></i></button>` : '';
                
                item.innerHTML = `<div style="flex:1; overflow:hidden;"><div class="prob-title">${p.title}</div><div class="prob-desc-preview">${p.desc.substring(0, 50)}...</div></div><div class="prob-actions"><button class="prob-btn-icon prob-edit-btn" onclick="openMoveModal(event, '${p.id}')" title="移 ??  ?">?  </button><button class="prob-btn-icon prob-edit-btn" onclick="editProblemInList(event, '${p.id}')" title="修改題目"><i class="fa-solid fa-pen"></i></button>${delBtnHtml}</div>`;
                currentContainer.appendChild(item);
            });
        }
    }

    function saveProblemOrder() { 
        const items = document.querySelectorAll('#probListContainer .prob-item'); 
        const newCatProbs = []; 
        items.forEach(item => { 
            const p = db.problems.find(x => x.id === item.dataset.id); 
            if (p) newCatProbs.push(p); 
        }); 
        const otherProbs = db.problems.filter(p => p.catId !== currentCatId); 
        db.problems = otherProbs.concat(newCatProbs); 
        saveToLocal(true, false); 
    }

        
    async function createProblemInCat() { 
        if (isProbSortMode) return; 
        const title = prompt("題目? 稱 ?); 
        if (title) { 
            const newProb = { 
                id: Date.now().toString(), 
                catId: currentCatId, 
                title: title, 
                desc: "請輸?  ??  ? ?..", 
                tpl_cpp: defaultTemplates.cpp, 
                tpl_python: defaultTemplates.python, 
                code_cpp: defaultTemplates.cpp, 
                code_python: defaultTemplates.python, 
                testCases: [{ input: "1 2", output: "3" }], 
                lastLang: 'cpp', 
                isMultiFile: false,
                isUserAdded: true // ?   ?  ?? 死?  ?標籤
            };
            db.problems.push(newProb); 
            
            const btn = document.querySelector('#view-problem-list .btn-primary');
            if (btn) { btn.disabled = true; btn.innerText = "???  ? ?.."; }
            await saveToLocal(true, false); 
            await syncProblemDeltaToCloud(newProb.id, newProb); 
            if (btn) { btn.disabled = false; btn.innerText = "+ ?  ?題目"; }
            renderProblemList(); 
        } 
    }
    
    

    function editProblemInList(e, id) { 
        e.stopPropagation(); 
        currentProbId = id; 
        // 修正：直? 跳 ?hash，避??goToAdmin 讀? 到 editor ?  ??  ???
        window.location.hash = '/admin?probId=' + id; 
    }
    

    async function deleteProblemInList(e, id) { 
        e.stopPropagation(); 
        if (confirm("確 ?? 除 ?)) { 
            db.problems = db.problems.filter(p => p.id !== id); 
            
            await saveToLocal(true, false); 
            await syncProblemDeltaToCloud(id, null); // ?  ? null，觸? 雲端獨立刪? 該 ?
            renderProblemList(); 
        } 
    }

// ================= 移 ?題目? 能 =================
    let problemToMoveId = null;

    function openMoveModal(e, probId) { 
        e.stopPropagation(); 
        problemToMoveId = probId; 
        
        const select = document.getElementById('moveCategorySelect'); 
        select.innerHTML = ''; 
        
        // ?  ??  ??  ?類 ?? 放?  ?? 選??
        db.categories.forEach(cat => { 
            const option = document.createElement('option'); 
            option.value = cat.id; 
            option.text = cat.name; 
            if (cat.id === currentCatId) {
                option.text += " (?  ??  ?)"; 
                option.disabled = true; // ? 白， ?讓使? 者移?  ??  ??  ?
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
            // 1. ? 改題目?  ?屬 ? ?
            p.catId = targetCatId; 
            
            // 2. 存 ?並 ?步雲 ?
            const btn = document.querySelector('#moveProblemModal .btn-primary');
            if (btn) { btn.disabled = true; btn.innerText = "??移 ? ?.."; }
            await saveToLocal(true, false); 
            await syncProblemDeltaToCloud(p.id, { catId: targetCatId }); 
            if (btn) { btn.disabled = false; btn.innerText = "??確 ?移 ?"; }
            
            // 3. ? 新渲 ?? 面 (移走後 ?該 ??  ??  ?? 面消失)
            renderProblemList(); 
        } 
        
        document.getElementById('moveProblemModal').style.display = 'none'; 
        problemToMoveId = null; 
    }

    function updateSortUI() { 
        const catBtn = document.getElementById('catSortBtn'); 
        const probBtn = document.getElementById('probSortBtn'); 
        
        if (catBtn) { 
            catBtn.innerText = isCatSortMode ? "??完 ??  ?" : "??調整?  ?"; 
            catBtn.className = isCatSortMode ? "btn btn-danger" : "btn btn-outline"; 
        } 
        if (probBtn) { 
            probBtn.innerText = isProbSortMode ? "??完 ??  ?" : "??調整?  ?"; 
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
            // 1.  ?? 端 ?  ???? 建? 端
            currentCompileMode = 'custom';
            btn.innerHTML = "?? ? 建? 端";
            btn.style.color = "#a855f7"; // 紫色 (? ? 用)
            btn.style.borderColor = "#a855f7";

        } else if (currentCompileMode === 'custom') {
            // 2.  ?? 建? 端 ?  ????  ?
            currentCompileMode = 'local';
            btn.innerHTML = "?? ?  ?編譯";
            btn.style.color = "var(--success)"; // 綠色
            btn.style.borderColor = "var(--success)";

        } else {
            // 3.  ??  ? ?  ???? 端 (Wandbox)
            currentCompileMode = 'wandbox';
            btn.innerHTML = "?  ? ? 端編譯";
            btn.style.color = "var(--accent)"; // ? 色
            btn.style.borderColor = "var(--accent)";
        }
    }

    function parseContent(text) { 
        if (!text) return ""; 
    
        // 1. ?  ? HTML ?  ?符 ?轉義，確保 ???
        let escaped = text.replace(/&/g, "&amp;")
                          .replace(/</g, "&lt;")
                          .replace(/>/g, "&gt;")
                          .replace(/"/g, "&quot;")
                          .replace(/'/g, "&#039;"); 
    
        // 2. ?  ?粗 ?：只??**中 ??  ? ?* ?  ?觸發??
        // 減 ? (-) ? 單?  ???(*) ? 為沒 ?對 ?規 ?， ?? 樣輸出
        const boldRegex = /\*\*(.+?)\*\*/g;
        let html = escaped.replace(boldRegex, "<strong style='color: #282f3b;'>$1</strong>");
    
        // 3. ?  ??  ?語 ? ![Alt](URL)
        const imageRegex = /!\[(.*?)\]\((.*?)\)/g; 
        html = html.replace(imageRegex, (match, alt, url) => { 
            return `<img src="${url}" alt="${alt}">`; 
        }); 
    
        // 4. ? 後 ? \n ?  ?轉 ?網 ?標籤
        return html.replace(/\n/g, "<br>"); 
    }

    function resetCode() { 
        if (!confirm("? 置程 ?碼到?  ?模板？這 ??  ?? 本題 ?? ?  ?案 ?)) return; 
        
        const p = db.problems.find(x => x.id === currentProbId); 
        const lang = document.getElementById('langSelect').value;
        
        if (lang === 'cpp') { 
            // ? 援空 ?串 ???
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
            alert("沒 ?程 ?碼可以 ?製 ?"); 
            return; 
        } 
        
        navigator.clipboard.writeText(code).then(() => { 
            alert("??程 ?碼已複製? 剪貼簿 ?); 
        }).catch(() => { 
            const ta = document.createElement("textarea"); 
            ta.value = code; 
            document.body.appendChild(ta); 
            ta.select(); 
            document.execCommand("copy"); 
            document.body.removeChild(ta); 
            alert("??程 ?碼已複製? 剪貼簿 ?); 
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
        
        // --- ?  ?套用 UI 上 ?? 設 ?---
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
        // --- 套用? 設定 ???---

        // ?   ?  ?修正： ?待雲端 ??  ?? 跳 ?
        const btn = document.querySelector('#view-admin .btn-primary');
        if (btn) { btn.disabled = true; btn.innerText = "???  ? ?.."; }
        await saveToLocal(true, false); 
        
        // ?? ? 鍵修復： ?修改後 ?? 份題目細 ?（含? 述? 測資 ??  ?? 份??Firebase
        // ?  ?主 ?檔 ???1MB 容 ?? 制?  ?? 新?  ??  ?? 到?  ?? 份資 ?， ??  ?述 ?? 「 ?輸入題目? 述...??
        await syncProblemDeltaToCloud(currentProbId, p);

        if (btn) { btn.disabled = false; btn.innerText = "?   ?  ?並 ???; }
        history.back(); 
    }
    

    function insertBoldToDesc() {
        const descArea = document.getElementById('editDesc');
        const start = descArea.selectionStart;
        const end = descArea.selectionEnd;
        const text = descArea.value;
    
        if (start !== end) {
            // 將選?  ??  ??  ?
            const selectedText = text.substring(start, end);
            descArea.value = text.substring(0, start) + "**" + selectedText + "**" + text.substring(end);
            descArea.selectionStart = start + 2;
            descArea.selectionEnd = end + 2;
        } else {
            // ? 入空 ?法並定 ?游 ?
            descArea.value = text.substring(0, start) + "****" + text.substring(end);
            descArea.selectionStart = descArea.selectionEnd = start + 2;
        }
        descArea.focus();
    }
    
    function insertImageToDesc() { 
        const url = prompt("請輸?  ?? 網?  (URL) ?, "https://"); 
        if (url) { 
            const descArea = document.getElementById('editDesc'); 
            descArea.value += `\n\n![?  ?](${url})\n\n`; 
            descArea.focus(); 
        } 
    }

    function insertImageURL() { insertImageToDesc(); } 
    
    function handleLocalImageUpload() { 
        const fileInput = document.getElementById('localImgInput'); 
        const file = fileInput.files[0]; 
        if (!file) return; 
        
        if (file.size > 2 * 1024 * 1024) { 
            alert("?  ? ?  ?? 大！建議使??2MB 以 ??  ??  ?以 ?? 覽? 卡?  ?); 
        } 
        
        const reader = new FileReader(); 
        reader.onload = function(e) { 
            const descArea = document.getElementById('editDesc'); 
            descArea.value += `\n\n![? 地?  ?](${e.target.result})\n\n`; 
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
        
        // 精 ?上傳局? 修?  ?並只 ?dbData 不 ? History
        saveToLocal(true, false); 
        syncProblemDeltaToCloud(currentProbId, { modelAnswer: p.modelAnswer });
    }
    
    function copyModelAnswer() { 
        const text = document.getElementById('modelAnswerInput'); 
        if (!text.value.trim()) { 
            alert("沒 ?示 ? ??? 以複製 ?); 
            return; 
        } 
        text.select(); 
        document.execCommand('copy'); 
        alert("??示 ? ??已 ?製 ?"); 
    }

    async function pasteModelAnswer() { 
        try { 
            const text = await navigator.clipboard.readText(); 
            document.getElementById('modelAnswerInput').value = text; 
            alert("??已貼上解答 ?"); 
        } catch (err) { 
            alert("?  ? ? 覽? 阻?  ??  ?讀? 剪貼簿， ?? 接?  ?字 ?中 ? Ctrl+V 貼 ???); 
        } 
    }

    async function runCode() {
        const p = db.problems.find(x => x.id === currentProbId); 
        if (!p.testCases || p.testCases.length === 0) { 
            alert("? 測 ?); 
            return; 
        }
        
        const btn = document.getElementById('runBtn'); 
        const logs = document.getElementById('outputLogs'); 
        const lang = document.getElementById('langSelect').value; 
        
        // ?  ??  ?編輯? 內?  ?式碼?  ?? 中
        if (lang === 'cpp' && p.isMultiFile) {
            if (currentFileIndex === -1) p.code_cpp = editor.getValue();
            else p.multiFiles[currentFileIndex].code = editor.getValue();
        } else { 
            p['code_' + lang] = editor.getValue(); 
        }
        
        const mainCode = (lang === 'cpp' && p.isMultiFile) ? p.code_cpp : editor.getValue();

        // ?  ?多 ?案 ??  ?準 ?? 送給編譯伺 ???
        let wandboxCodes = [];
        let localExtraFiles = [];
        let extraCppFiles = []; // ? 修 ??  ??  ?外 ? .cpp 檔 ?? 稱 ?Wandbox 編譯???使用

        if (lang === 'cpp' && p.isMultiFile && p.multiFiles) {
            p.multiFiles.forEach(f => {
                wandboxCodes.push({ file: f.name, code: f.code || "" });
                localExtraFiles.push({ name: f.name, content: f.code || "" });
                
                // ? 出 .cpp ??.c 結尾?  ?屬 ? ?
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
                    // 模 ? A：公? 雲 ?(Wandbox)
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
                        tempDiv.innerHTML = `<div class="log-header" style="color:var(--fail)">??Case ${i+1}: 編譯? 誤</div><div class="log-details"><pre style="color:#f44747; margin:0;">${res.compiler_error || res.compiler_message}</pre></div>`;
                        const stopDiv = document.createElement('div'); 
                        stopDiv.style.textAlign = "center"; 
                        stopDiv.style.padding = "10px"; 
                        stopDiv.style.color = "#aaa"; 
                        stopDiv.innerHTML = "?  ? ? 編譯失?  ?已 ?止 ?續測試 ?; 
                        logs.appendChild(stopDiv);
                        isCompileError = true; 
                        break; 
                    }
                    if (res.status !== "0" && res.program_error) { 
                        tempDiv.innerHTML = `<div class="log-header" style="color:var(--fail)">??Case ${i+1}: ?  ?? 誤</div><div class="log-details"><pre style="color:#f44747; margin:0;">${res.program_error}</pre></div>`; 
                        continue; 
                    }
                    act = (res.program_message || "").trim();

                } else {
                    // 模 ? B & C：使?  ???Python Server (?  ???Render ? 端)
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

                        // ?   ? 鍵點 ??  ?模 ?決 ??  ?網 ?
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
                            tempDiv.innerHTML = `<div class="log-header" style="color:var(--fail)">??Case ${i+1}: ${res.type || "Error"}</div><div class="log-details"><pre style="color:#f44747; margin:0;">${res.message || "Unknown Error"}</pre></div>`;
                            if (res.type === '編譯? 誤') { 
                                const stopDiv = document.createElement('div'); 
                                stopDiv.style.textAlign = "center"; 
                                stopDiv.style.padding = "10px"; 
                                stopDiv.style.color = "#aaa"; 
                                stopDiv.innerHTML = "?  ? ? 編譯失?  ?已 ?止 ?續測試 ?; 
                                logs.appendChild(stopDiv); 
                                isCompileError = true; 
                                break; 
                            }
                            continue;
                        }
                        act = (res.output || "").trim();
                    } catch (err) { 
                        if (err.name === 'AbortError') throw err; // 讓 ? ?catch ?  ?超 ?
                        tempDiv.innerHTML = `<div class="log-header" style="color:var(--fail)">??Case ${i+1}: ?  ????? 伺? 器</div><div class="log-details" style="color:#aaa; font-size:0.85rem;">請確 ?${currentCompileMode === 'local' ? '?  ?' : '? 端'} 伺 ?? 是? 已?  ???/div>`; 
                        isCompileError = true; 
                        break; 
                    }
                }

                // --- ? 復： ?? 用來判?  ?案 ??  ?? 輯 ---
                let pass = act.replace(/\r\n/g, "\n") === exp.replace(/\r\n/g, "\n");
                if (pass) passCount++;
                
                let statusHtml = pass ? `<span style="color:var(--success)">??Case ${i+1}: ?  ?測試 (Accepted)</span>` : `<span style="color:var(--fail)">??Case ${i+1}: 答 ?? 誤 (Wrong Answer)</span>`;
                let actStyle = pass ? "color:#fff; border-left-color:var(--success);" : "color:var(--warning); border-left-color:var(--fail);";
                
                tempDiv.innerHTML = `<div class="log-header">${statusHtml}</div><div class="log-details"><div class="log-label">輸入 (Input):</div><div class="log-value">${inputData}</div><div class="log-label">?  ?輸出 (Expected):</div><div class="log-value">${exp}</div><div class="log-label">?  ?輸出 (Actual):</div><div class="log-value" style="${actStyle}">${act || "(? 輸??"}</div></div>`;

            } catch(e) { 
                if (e.name === 'AbortError') {
                    tempDiv.innerHTML = `<div style="color:var(--fail)">??Case ${i+1}: ?  ?超 ? (Timeout)</div><div class="log-details" style="color:#aaa; font-size:0.85rem;">?  ?超 ? 15 秒已被系統強? 中?  ?br>? 能?  ?： ?式碼? 入? 無窮迴? 」 ?伺 ?? 無?  ???/div>`; 
                } else {
                    tempDiv.innerHTML = `<div style="color:var(--fail)">??Case ${i+1}: 網路???? 誤</div><div class="log-details" style="color:#aaa; font-size:0.85rem;">?  ????? 編譯伺? 器， ?檢查網路? ?  ?/div>`; 
                }
                isCompileError = true; 
                break; 
            }
        } // for 迴 ?結 ?

        let finalStatus = "";
        if (isCompileError) { 
            finalStatus = `<span style="color:var(--fail)">??編譯?  ??失 ?</span>`; 
        } else if (passCount === p.testCases.length) { 
            finalStatus = `<span style="color:var(--success)">??? 數?  ? (${passCount}/${p.testCases.length})</span>`; 
        } else { 
            finalStatus = `<span style="color:var(--warning)">?  ? ?  ??  ? (${passCount}/${p.testCases.length})</span>`; 
        }

        // 將 ??  ?案 ?? 容?  ?存入歷史紀?  ?? 便? 頭檢 ?
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
        
        // ? 修 ?： ??  ?? 整?  ?庫 ?? 更? 本 ?LocalStorage ? 雲端 ??  ?程 ?碼 ?歷史紀?  ?
        const historyString = JSON.stringify(executionHistories);
        localStorage.setItem('oj_v15_history', historyString);
        localStorage.setItem('oj_v15_data', JSON.stringify(db)); // ? 更? 本機 ?庫暫 ?

        if (currentUser) {
            try {
                // ? 修? 】 ??  ?歷史紀?  ?步到? 端， ??  ??  ?答 ?式碼? 寫??customProblems
                await personalDb.collection('users').doc(currentUser.uid).set({
                     historyData: historyString,
                     lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });

            } catch(e) {
                console.error("? 端歷史紀?  ?檔失??", e);
            }
        }

        btn.disabled = false; 
        btn.innerText = "?  ? ?  ?";
    }

    function openHistoryModal() {
        const histList = executionHistories[currentProbId] || []; 
        const listDiv = document.getElementById('historyList'); 
        document.getElementById('historyCodeView').value = ""; 
        listDiv.innerHTML = "";
        
        if (histList.length === 0) { 
            listDiv.innerHTML = "<div style='color:#666; text-align:center; padding:30px; font-size:1.1rem;'>尚無?  ?紀??/div>"; 
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
        if (!confirm("確 ?要 ?空這 ??  ?? 歷? 執行 ??  ?？此?  ??  ?復 ???)) return; 
        delete executionHistories[currentProbId]; 
        
        // ? 更? 歷?  ??  ?不影?  ?庫主 ?
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

        //從本? 暫存 ??  ??  ?次 ??  ???
        const freshHistory = localStorage.getItem('oj_v15_history');
        if (freshHistory) {
            try { 
                executionHistories = JSON.parse(freshHistory); 
            } catch(e) {}
        }

        // ?  ??  ??  ??  ?稱以顯示?  ?示 ?? 中
        const cat = db.categories.find(c => c.id === currentCatId);
        const catName = cat ? cat.name : "此 ? ?;

        if (!confirm(`?  ? 警 ?：確定 ?清空??{catName}? 內? ?  ??  ?? 歷? 執行 ?? 】 ?？\n此 ?作無法復?  ?`)) return;

        // ? 出? 個 ?類 ??  ??  ???
        const catProblems = db.problems.filter(p => p.catId === currentCatId);
        let deletedCount = 0;

        // ? 除?  ?題目??executionHistories 中 ?紀??
        catProblems.forEach(p => {
            // ?  ?? 度? 斷，確保裡?  ??  ?紀?  ?算數
            if (executionHistories[p.id] && executionHistories[p.id].length > 0) {
                delete executionHistories[p.id];
                deletedCount++;
            }
        });

        if (deletedCount === 0) {
            alert("?  ?類目?  ?? 任何歷? 執行 ?? 可以 ?空 ?);
            return;
        }

        // ? 新? 地端 ??  ?紀??
        const historyString = JSON.stringify(executionHistories);
        localStorage.setItem('oj_v15_history', historyString);

        // ? 步? 新??Firebase ? 端
        if (currentUser) {
            try {
                await personalDb.collection('users').doc(currentUser.uid).set({
                    historyData: historyString
                }, { merge: true });
                alert(`??已 ??  ?空本?  ? ?${deletedCount} 題 ??  ?紀?  ?`);
            } catch (e) {
                console.error("? 端清除歷史紀? 失??, e);
                alert("?  ? ? 地紀? 已清除， ?? 端? 步失 ???);
            }
        } else {
            alert(`??已 ??  ?空本?  ? ?${deletedCount} 題 ??  ?紀?  ?`);
        }
    }    

    function openAIHelperModal() {
        const p = db.problems.find(x => x.id === currentProbId); 
        const lang = document.getElementById('langSelect').value; 
        
        // 確 ??  ?編輯? 內容 ?存到變數 ?
        if (lang === 'cpp' && p.isMultiFile) {
            if (currentFileIndex === -1) p.code_cpp = editor.getValue();
            else p.multiFiles[currentFileIndex].code = editor.getValue();
        } else {
            p['code_' + lang] = editor.getValue();
        }

        // ? 修 ?： ? AI ?  ??  ??  ?案內容 ?
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
            alert("程 ?碼為空 ??  ??  ???); 
            return; 
        }
        
        document.getElementById('aiPromptOutput').value = `請 ?任 ?式設計助?  ?幫 ?檢查以 ?程 ?碼 ?? 輯? 否 ?  ，並給 ?修正建議（ ??  ?體中?  ?答 ?：\n\n?  ??  ?稱】 ?${p.title}\n?  ??  ?述】 ?\n${p.desc}\n\n?  ??  ?式碼?  ?\n\`\`\`${lang}\n${fullCode}\n\`\`\``; 
        document.getElementById('aiHelperModal').style.display = 'flex';
    }

    function copyPromptOnly() { 
        const text = document.getElementById('aiPromptOutput'); 
        text.select(); 
        document.execCommand('copy'); 
        alert("??? 容已 ?製 ?"); 
        document.getElementById('aiHelperModal').style.display = 'none'; 
    }

    function copyPromptAndOpenGemini() { 
        const text = document.getElementById('aiPromptOutput'); 
        text.select(); 
        document.execCommand('copy'); 
        alert("?? ? 容已 ?製 ?\n?  ?? 您?  ? Gemini??); 
        window.open('https://gemini.google.com/app', '_blank'); 
        document.getElementById('aiHelperModal').style.display = 'none'; 
    }

    function addTestCaseUI(input='', output='') { 
        const div = document.createElement('div'); 
        div.className = 'tc-item'; 
        div.innerHTML = `<button class="btn btn-outline" style="float:right; border:none; padding:0 5px;" onclick="this.parentElement.remove()">??/button><div style="display:flex; gap:10px; margin-top:5px;"><textarea class="tc-input" rows="1" oninput="autoResize(this)" style="flex:1" placeholder="Input">${input}</textarea><textarea class="tc-output" rows="1" oninput="autoResize(this)" style="flex:1" placeholder="Output">${output}</textarea></div>`; 
        document.getElementById('adminTestCases').appendChild(div); 
        
        if (input || output) { 
            const tas = div.querySelectorAll('textarea'); 
            tas.forEach(ta => autoResize(ta)); 
        } 
    }
    
    function downloadBackup() { 
        const date = new Date().toISOString().slice(0, 10); 
        let filename = prompt("請輸?  ?案 ? ?(?  ??  ???:", `oj_backup_${date}`); 
        if (!filename) return; 
        
        if (!filename.endsWith(".txt") && !filename.endsWith(".json")) { 
            filename += ".txt"; 
        } 
        
        const backupData = btoa(encodeURIComponent(JSON.stringify(db))); 
        const blob = new Blob([backupData], { type: 'text/plain' }); 
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
            if (content.startsWith("{") || content.startsWith("[")) { 
                try { 
                    JSON.parse(content); 
                    content = btoa(encodeURIComponent(content)); 
                } catch(err) { 
                    alert("檔 ??  ?? 誤"); 
                    return; 
                } 
            } 
            document.getElementById('backupStr').value = content; 
        }; 
        reader.readAsText(file); 
        input.value = ''; 
    }

    function openBackupUI() { 
        pendingRestoreFileName = ""; 
        document.getElementById('backupStr').value = btoa(encodeURIComponent(JSON.stringify(db))); 
        document.getElementById('backupModal').style.display = 'flex'; 
    }

    function copyBackupCode() { 
        document.getElementById('backupStr').select(); 
        document.execCommand('copy'); 
        alert("已 ? ?); 
    }

    async function execRestore() { 
        try { 
            const data = JSON.parse(decodeURIComponent(atob(document.getElementById('backupStr').value))); 
            if (data.categories && data.problems) { 
                const catCount = data.categories.length || 0;
                const probCount = data.problems.length || 0;
                
                if (!confirm(`?  ? 準 ??  ?題庫 ?  ?\n\n? 即將匯?  ?? 份檔 ??  ?\n- ${catCount} ?  ?類\n- ${probCount} ?  ?? \n\n? 警? 】此?  ?將 ??  ??  ?? 」您?  ?? 本?  ?庫 ??  ?\n確 ?要繼續 ??  ?？`)) {
                    return;
                }

                let defaultName = pendingRestoreFileName || "?  ??  ?題庫"; 
                let finalName = prompt("請為? 個 ??  ?題庫?  ? ?, defaultName); 
                
                if (finalName === null) return; 
                if (finalName.trim() === "") finalName = "?  ??  ?題庫"; 
                
                const preservedCustomBanks = db.customBanks || [];
                db.categories = data.categories;
                db.problems = data.problems;
                db.version = data.version || "";
                db.customBanks = preservedCustomBanks;

                // 如 ?? 自訂 ?庫中?  ?， ?便更? 該?  ?題庫? 稱
                const isCustom = currentBankUrl && currentBankUrl.startsWith("local_custom_");
                if (isCustom) {
                    const customId = currentBankUrl.replace("local_custom_", "");
                    const bankIdx = db.customBanks.findIndex(b => b.id === customId);
                    if (bankIdx !== -1) {
                        db.customBanks[bankIdx].name = finalName;
                        db.customBanks[bankIdx].categories = JSON.parse(JSON.stringify(db.categories));
                        db.customBanks[bankIdx].problems = JSON.parse(JSON.stringify(db.problems));
                        
                        // ?   強制將 ??  ?題庫寫入子 ???
                        if (currentUser && personalDb) {
                            try {
                                personalDb.collection('users').doc(currentUser.uid).collection('customBanks').doc(customId).set(db.customBanks[bankIdx]);
                            } catch(e) {}
                        }
                    }
                } else if (currentUser && personalDb) {
                    // ?? ?  ?? 設題庫?  ?? 修復 ?必 ?將 ?? 進 ??  ??  ??  ?，批次 ?步到 Firebase ? 獨立 ?? 箱
                    let payload = {};
                    let customCatUpdates = {};
                    let customProbUpdates = {};

                    // 1. ?  ?? 端?  ?資 ?，找? 「幽?  ?案」 ?? 本? 雲端 ?但 ??  ?裡 ??  ?題目/?  ?）並標 ?? 刪??
                    try {
                        const docSnap = await personalDb.collection('users').doc(currentUser.uid).get();
                        if (docSnap.exists) {
                            const data = docSnap.data();
                            
                            // 清 ?幽 ??  ?
                            if (data.customCategories) {
                                Object.values(data.customCategories).forEach(cc => {
                                    if (cc && cc.bankUrl === currentBankUrl) {
                                        if (!db.categories.some(c => c.id === cc.id)) {
                                            customCatUpdates[cc.id] = firebase.firestore.FieldValue.delete();
                                        }
                                    }
                                });
                            }
                            
                            // 清 ?幽 ?題目： ??  ??  ??  ?屬於?  ?題庫， ??  ?檔裡沒這 ?，就殺 ?
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
                    } catch(e) { console.warn("?  ??  ?? 端幽 ?檔 ?", e); }

                    // 2. 將 ?? 進 ??  ??  ?? 細節（含作 ?紀?  ??  ?修改） ?寫 ??  ?保險 ?
                    db.categories.forEach(c => {
                        if (c.isUserAdded) customCatUpdates[c.id] = c; 
                    });
                    
                    db.problems.forEach(p => {
                        customProbUpdates[p.id] = p;
                    });

                    if (Object.keys(customCatUpdates).length > 0) payload.customCategories = customCatUpdates;
                    if (Object.keys(customProbUpdates).length > 0) payload.customProblems = customProbUpdates;

                    // 3. ? 次寫入 Firebase (? 含?  ?? 刪?  ?? 令)
                    if (Object.keys(payload).length > 0) {
                        try {
                            await personalDb.collection('users').doc(currentUser.uid).set(payload, { merge: true });
                        } catch(e) { console.warn("?  ?保險箱批次 ?? 失??, e); }
                    }
                }
                
                currentBankName = finalName;
                localStorage.setItem('oj_v15_bank_name', finalName); 
                
                // 等 ?存 ?? 雲端 ?步 ???
                await saveToLocal(true, true); 
                
                alert("?  ??  ?，並已 ?步至? 端 ?);
                
                // ?   ?  ? window.location.reload()，改? 直? 更??UI
                document.getElementById('backupModal').style.display = 'none';
                
                const nameEl = document.getElementById('currentBankName');
                if (nameEl) nameEl.innerHTML = `<i class="fa-solid fa-folder-open" style="color: #60a5fa; margin-right: 8px;"></i> ?  ?題庫: ` + currentBankName;
                
                currentCatId = null;
                renderCategoryList();
                if (currentView === 'view-problem-list') showView('view-categories');
            } else { 
                throw new Error(); 
            } 
        } catch(e) { 
            alert(" ?  ?  ?? 格式錯 ?); 
        } 
    }

    // ================= 下 ?程 ?碼 ???=================
    function downloadCode() {
        const p = db.problems.find(x => x.id === currentProbId);
        if (!p) return;

        const lang = document.getElementById('langSelect').value;

        // 1. 確 ??  ?編輯? 內?  ?式碼? 即?  ??  ?? 中
        if (lang === 'cpp' && p.isMultiFile) {
            if (currentFileIndex === -1) p.code_cpp = editor.getValue();
            else p.multiFiles[currentFileIndex].code = editor.getValue();
        } else {
            p['code_' + lang] = editor.getValue();
        }

        // 2. 準 ?檔 ?? 綴（ ?濾 ?不 ?法 ?檔 ?字 ? ?
        const safeTitle = p.title.replace(/[\/\?<>\\:\*\|":\s]/g, "_");

        if (lang === 'cpp' && p.isMultiFile) {
            // --- ?  ?多 ?案 ???(ZIP) ---
            if (typeof JSZip === 'undefined') {
                alert("?  ? ?  ???JSZip ?  ?庫 ??  ??  ??  ???);
                return;
            }
        
            const zip = new JSZip();
        
            // ? 入 main.cpp
            zip.file("main.cpp", p.code_cpp || "");
        
            // ? 入?  ?標頭檔 ?實 ? ?(.h / .cpp)
            if (p.multiFiles) {
                p.multiFiles.forEach(f => {
                    zip.file(f.name, f.code || "");
                });
            }
        
            // ?  ?壓縮檔並觸發下 ?
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
            // --- ?  ??  ?檔 ?下 ? ---
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

// ============= 上傳程 ?碼 ???============

    async function handleCodeUpload(input) {
	const files = input.files;
	if (!files || files.length === 0) return;

	const p = db.problems.find(x => x.id === currentProbId);
	if (!p) return;

	const lang = document.getElementById('langSelect').value;
    
	// 變數準 ?：用來 ??  ??  ?程 ?? ??
	let successCount = 0;
	let failMessages = [];
	let needRenderTabs = false;

	// ?  ??  ? ZIP 壓縮檔 ?? 輯 (維 ?? 本? 防?  ? ??縮 ???
	if (files.length === 1 && files[0].name.toLowerCase().endsWith('.zip')) {
	const file = files[0];
	if (lang !== 'cpp' || !p.isMultiFile) {
	alert("?  ? ?  ??  ??  ?語 ?模 ?不支?  ?檔 ?！ ?上傳?  ? .cpp ??.py 檔 ???);
	    input.value = ''; return;
	}
	if (typeof JSZip === 'undefined') {
	    alert("?  ? ?  ???JSZip ?  ?庫 ??  ?讀?  ?縮 ???);
	    input.value = ''; return;
	}
	if (!confirm("?  ? 上傳專 ?將 ?覆 ?? 目? 在? 個 ??  ?? ?  ?式碼，確定 ?繼 ??  ?")) {
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
		alert("?  ? 壓縮檔內?  ???main.cpp，無法 ??  ?案 ?");
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
	    alert("??ZIP 專 ?上傳並解?  ??  ?");

	} catch (e) {
	    console.error(e);
	    alert("?  ? 讀??ZIP 檔 ?失 ? ? + e.message);
	}
	input.value = '';
	return;
    }

    // ?  ?多個獨立 ?案 ??  ?? 輯 ( ? main.cpp, Rectangle.cpp, Rectangle.h)
      //  ?FileReader ?  ???Promise，方便用 await 循 ??  ?
      const readFileAsync = (file) => {
	return new Promise((resolve, reject) => {
	    const reader = new FileReader();
	    reader.onload = (e) => resolve(e.target.result);
	    reader.onerror = (e) => reject(e);
	    reader.readAsText(file);
	});
    };

      // 循 ?檢查並 ??  ?? 選?  ?檔 ?
      for (let i = 0; i < files.length; i++) {
	const file = files[i];
	const extension = file.name.split('.').pop().toLowerCase();

	// ?  ?檢查 1： ?言不符
	if (lang === 'python' && extension !== 'py') {
	    failMessages.push(`??[${file.name}] Python 模 ?? 能上傳 .py 檔 ?? `);
	    continue;
	}
	if (lang === 'cpp' && (extension === 'py' || extension === 'zip')) {
	    failMessages.push(`??[${file.name}] 檔 ??  ?? 誤? `);
	    continue;
	}
        
	// ?  ?檢查 2：單檔模式卻?  ? .h ?  ??  ? ?
	if (!p.isMultiFile && (extension === 'h' || files.length > 1)) {
	    alert("?  ? ?  ?? 單一檔 ?模 ?，無法 ??  ??  ??  ??  ?案 ?請 ??  ?多 ?案支?  ?);
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
		failMessages.push(`?  ? [${file.name}] 題目? 設定此檔 ??  ?，已?  ?? `);
	    }
	}
     } else {
	// ?  ?檔 ?模 ??  ???
	if (lang === 'cpp') p.code_cpp = content;
	else p.code_python = content;
	editor.setValue(content, -1);
	successCount++;
    }
        } catch (error) {
            failMessages.push(`??[${file.name}] 讀? 失? 。`);
        }
    }

    // 檔 ??  ??  ?後 ?統整並顯示 ???
    if (needRenderTabs) renderWorkspaceTabs();

    if (failMessages.length === 0 && successCount > 0) {
	alert(`???  ?載入 ${successCount} ?  ?案 ?`);
    } else if (failMessages.length > 0) {
	let msg = `載入完 ?， ?? 部?  ?況 ?\n???  ?: ${successCount} ?  ?案\n\n`;
	msg += failMessages.join('\n');
	alert(msg);
    }

    // 清除 input ? ??
    input.value = '';
}


