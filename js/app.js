
    // =========================================================
    // 0. Eager Load (?å?è¼‰å…¥) & è®Šæ•¸å®??
    // =========================================================
    let db = { 
	categories: [], 
	problems: [], 
	version: "",
	customBanks: [] //å­˜æ”¾ä½¿ç”¨?…è‡ªè¨‚ç??€?‰é?åº?
    };

    let executionHistories = {}; 
    let currentBankName = ""; 
    let currentBankUrl = "";  
    let currentView = 'view-login';
    let pendingUpdateDb = null;
    let hasCloudDbData = false;
    let authInitialized = false;
    let isBankSortMode = false; // ?§åˆ¶?ªè?é¡Œåº«?’å?æ¨¡å??„è???

    // V60: å¤šæ?æ¡ˆæ”¯?´ç??€?‹è???
    let currentFileIndex = -1; // -1 ä»?¡¨ mainï¼? ä»¥ä?ä»?¡¨ extraFiles ??index
    let adminMultiFiles = [];  // å¾Œå°è¨­å?å°ˆç”¨?„æš«å­˜ç‰©ä»?
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
    // 1. ?™é›²ç«¯æ ¸å¿ƒè¨­å®?(Master-Tenant ?¶æ?)
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

    // [?¨æˆ¶ç«¯] ä½¿ç”¨?…ç?å°ˆå±¬ Firebase (ä¹‹å??•æ??Ÿæ?)
    let personalApp = null;
    let personalDb = null;
    

    // ==========================================
    // 2. å¸³è?ç³»çµ±
    // ==========================================
    
    let isLoginMode = true;

    function switchAuthTab(mode) {
        isLoginMode = (mode === 'login');
        document.getElementById('tabLogin').style.color = isLoginMode ? 'white' : '#aaa';
        document.getElementById('tabLogin').style.borderBottomColor = isLoginMode ? 'var(--accent)' : 'transparent';
        document.getElementById('tabRegister').style.color = !isLoginMode ? 'white' : '#aaa';
        document.getElementById('tabRegister').style.borderBottomColor = !isLoginMode ? 'var(--accent)' : 'transparent';
        
        document.getElementById('registerConfigArea').style.display = isLoginMode ? 'none' : 'block';
        document.getElementById('actionBtn').innerText = isLoginMode ? '?»å…¥ç³»çµ±' : 'è¨»å?ä¸¦ç?å®šé›²ç«?;
        document.getElementById('actionBtn').className = isLoginMode ? 'btn btn-success' : 'btn btn-primary';
    }
        
    async function handleAuthAction() {
        const email = document.getElementById('emailInput').value.trim();
        const pwd = document.getElementById('passwordInput').value;
        if (!email || !pwd) { alert("è«‹è¼¸?¥é›»å­éƒµä»¶è?å¯†ç¢¼ï¼?); return; }

        const actionBtn = document.getElementById('actionBtn');
        const originalText = actionBtn.innerText;
        actionBtn.innerText = isLoginMode ? '?»å…¥ä¸?..' : '?•ç?ä¸?..';
        actionBtn.disabled = true;

        if (isLoginMode) {
            masterAuth.signInWithEmailAndPassword(email, pwd).catch(err => {
                alert("?»å…¥å¤±æ?ï¼? + err.message);
                actionBtn.innerText = originalText;
                actionBtn.disabled = false;
            });
        } else {
            if (pwd.length < 6) { alert("å¯†ç¢¼å¤ªçŸ­ï¼?); return; }
            const configStr = document.getElementById('registerConfigInput').value.trim();
            if (!configStr) { alert("è«‹è²¼ä¸?Firebase ?‘é‘°ï¼?); return; }
            
            try { JSON.parse(configStr); } catch(e) { alert("??JSON ?¼å??¯èª¤ï¼?); return; }

            try {
                const userCredential = await masterAuth.createUserWithEmailAndPassword(email, pwd);
                await masterDb.collection('userSettings').doc(userCredential.user.uid).set({
                    firebaseConfig: configStr
                });
                alert("??è¨»å??å?ä¸¦ç?å®šé›²ç«¯ï?");
            } catch(err) { 
                alert("è¨»å?å¤±æ?ï¼? + err.message); 
                actionBtn.innerText = originalText;
                actionBtn.disabled = false;
            }
        }
    }

    function logout() {
        if (confirm("ç¢ºå?è¦ç™»?ºå?ï¼?)) {
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
                // ??Master ?“å? JSON ?‘é‘°
                let userConfigStr = localStorage.getItem('oj_v15_firebaseConfig');
                try {
                    const doc = await masterDb.collection('userSettings').doc(user.uid).get();
                    if (doc.exists && doc.data().firebaseConfig) {
                        userConfigStr = doc.data().firebaseConfig;
                        localStorage.setItem('oj_v15_firebaseConfig', userConfigStr);
                    }
                } catch (netErr) {
                    console.warn("?¡æ?å¾é›²ç«¯å?å¾—é??°ï?å°‡å?è©¦ä½¿?¨æœ¬?°å¿«?–ï?", netErr);
                }

                if (userConfigStr) {
                    const userConfig = JSON.parse(userConfigStr);
                    
                    // ?Ÿå??‹äºº?²ç«¯
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
			window.location.hash = '/source-selector'; // ?»å…¥å¾Œè‹¥?¡æ?å®šç›®æ¨™æ??¨ç™»?¥é?ï¼Œå?è·³è??°ä?æºé¸?‡å™¨
		    }
		    handleHashChange();
		
                } else {
                    alert("?¾ä??°ç?å®šè??™ï?ç³»çµ±å°‡ç„¡æ³•å?æ­¥æ‚¨?„é›²ç«¯é€²åº¦ï¼?);
                    // ç§»é™¤?ªå??»å‡ºï¼Œå??ä½¿?¨è€…ç?è¦æ?
                }
            } catch (err) {
                console.error(err);
                // ç§»é™¤?ªå??»å‡ºï¼Œæ”¹?ºæ?ç¤?
                alert("????‹äºº?²ç«¯å¤±æ?ï¼Œå¯?½æ˜¯ç¶²è·¯ä¸ç©©ï¼è??æ–°?´ç??–ç?å¾Œå?è©¦ã€?);
            }
        } else {
            currentUser = null;
            personalDb = null;
            
            const actionBtn = document.getElementById('actionBtn');
            if (actionBtn) {
                actionBtn.disabled = false;
                actionBtn.innerText = isLoginMode ? '?»å…¥ç³»çµ±' : 'è¨»å?ä¸¦ç?å®šé›²ç«?;
            }

            window.location.hash = '/login';
	    handleHashChange(); //ç¢ºä??ªç™»?¥æ?ç«‹åˆ»é¡¯ç¤º?»å…¥??
        }
    });
    
    // ==========================================
    // 3. ?²ç«¯è³‡æ??Œæ­¥ & ?ªå??´æ–°æ©Ÿåˆ¶
    // ==========================================
    
    async function loadUserDataFromCloud(isBackground = false) {
        if (!currentUser || !personalDb) return;
        try {
            const docSnap = await personalDb.collection('users').doc(currentUser.uid).get();
            if (docSnap.exists) {
                const data = docSnap.data();

                // è¼‰å…¥?ªè?é¡Œåº«æ¸…å–® (?™æ˜¯è³‡æ??‰åº«)
                if (data.userCustomBanks) {
                    const parsedBanks = JSON.parse(data.userCustomBanks);
                    try {
                        // ?’¡ ?¸å?ä¿®æ­£ï¼šå?å­é??ˆæ??–å??´ç? customBanks è³‡æ?ï¼Œç???1MB ?åˆ¶
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
                        console.error("è¼‰å…¥?ªè?é¡Œåº«?§å®¹å¤±æ?ï¼?, e);
                        db.customBanks = parsedBanks;
                    }
                }

                const isCustom = currentBankUrl && currentBankUrl.startsWith("local_custom_");

                if (!isCustom) {
                    // ?é?è¨­é?åº«æ¨¡å¼ã€‘ï?è®€?–é??¢é€²åº¦
                    const safeKey = currentBankUrl ? currentBankUrl.replace(/[\.\#\$\[\]]/g, '_') : '';
                    if (safeKey && data.bankProgress && data.bankProgress[safeKey]) {
                        const prog = JSON.parse(data.bankProgress[safeKey]);
                        db.categories = prog.categories || [];
                        db.problems = prog.problems || [];
                        db.version = prog.version || "";
                    }
                    
                    // ?? ?‘å??ºå¤±?„è‡ªè¨‚å?é¡ï?å¦‚æ? bankProgress å­˜æ?å¤±æ?ï¼Œå? customCategories ?‘å?ä¾?
                    if (data.customCategories) {
                        Object.values(data.customCategories).forEach(cc => {
                            // ç¢ºä??¯å±¬?¼é€™å€‹é?åº«ç??ªè??†é?
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

                    // ?? ?‘å??ºå¤±?„è‡ªè¨‚é??®ï?å¦‚æ? bankProgress å­˜æ?å¤±æ?ï¼ˆä?å¦‚å®¹?ç?è¡¨ï?ï¼Œå? customProblems ?‘å?ä¾?
                    if (data.customProblems) {
                        Object.values(data.customProblems).forEach(cp => {
                            if (cp && cp.id) {
                                const existingP = db.problems.find(p => p.id == cp.id);
                                if (existingP) {
                                    Object.assign(existingP, cp); // ?ˆä½µä¿®æ”¹
                                } else {
                                    // ç¢ºä??™é?å±¬æ–¼?¶å?é¡Œåº« (æª¢æŸ¥?†é??¯å¦å­˜åœ¨)
                                    if (db.categories.some(c => c.id == cp.catId)) {
                                        db.problems.push(cp);
                                    }
                                }
                            }
                        });
                    }
                } else {
                    // ?è‡ªè¨‚é?åº«æ¨¡å¼ã€‘ï??¹æ? ID å¾?customBanks ?‰åº«ä¸­æ?æ´»è???
                    const customId = currentBankUrl.replace("local_custom_", "");
                    const targetBank = db.customBanks.find(b => b.id === customId);
                    if (targetBank) {
                        // ?’¡ ?¸å?ä¿®æ­£ï¼šå??œæ˜¯?Œæ™¯è¼‰å…¥ï¼Œç?å°ä?è¦è??‹ç›®?æ­£?¨ç·¨è¼¯ç??ªè?é¡Œåº«?§å®¹ï¼?
                        // ? ç‚º?¬åœ° localStorage ?„è??™æ??¯æ??°é®®?„ï??²ç«¯?„å¯?½æ˜¯ä¸Šæ¬¡?„æ?å­˜å??„è?è³‡æ?
                        if (!isBackground) {
                            db.categories = JSON.parse(JSON.stringify(targetBank.categories || []));
                            db.problems = JSON.parse(JSON.stringify(targetBank.problems || []));
                            db.version = targetBank.version || "";
                        }
                    }
                }
                
                if (data.historyData) executionHistories = JSON.parse(data.historyData);

                // ?´æ–°?¬åœ°å¿«å?ï¼Œç¢ºä¿ä?æ¬¡é??°æ•´?†æ‹¿?°ç?ä¹Ÿæ˜¯å°ç?
                localStorage.setItem('oj_v15_data', JSON.stringify(db));
                localStorage.setItem('oj_v15_history', JSON.stringify(executionHistories));
            }

            if (!isBackground) checkUrlAndLoad();
            checkForUpdates();
        } catch (e) { 
            console.error("è®€?–é›²ç«¯å¤±?—ï?", e); 
        }
    }
    

    async function checkForUpdates() {
        // ?›¡ï¸??²è­· 1ï¼šå??œæ˜¯?ªè?é¡Œåº«ï¼Œç?å°ä??¼é€?GitHub ?´æ–°è«‹æ?
        if (!currentBankUrl || currentBankUrl.startsWith("local_custom_")) return; 
        
        const checkUrl = currentBankUrl; 
        try {
            const res = await fetch(checkUrl + '?t=' + new Date().getTime());
            if (res.ok) {
                const newDb = await res.json();
                if (newDb.version && newDb.version !== db.version) {
                    // ?›¡ï¸??²è­· 2ï¼šæ?ä¸Šç¶²?€æ¨™ç±¤
                    newDb._sourceUrl = checkUrl; 
                    pendingUpdateDb = newDb;
                    if (currentView === 'view-categories') { 
                        document.getElementById('updateToast').style.display = 'flex'; 
                    }
                }
            }
        } catch (e) { 
            console.error("æª¢æŸ¥?´æ–°å¤±æ?", e); 
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
        
        // ?’¡ æµ·é?å®‰æª¢ï¼šå¼·?¶æ·¨?–å? GitHub ä¸‹è??„å???JSONï¼Œæ??¤ä?å°å?æ®˜ç??„è‡ªè¨‚æ?ç±?
        (newDb.categories || []).forEach(c => delete c.isUserAdded);
        (newDb.problems || []).forEach(p => delete p.isUserAdded);
        
        // ç¢ºä????å­˜åœ¨ï¼Œé¿??.some() ?‹å‡º?¯èª¤å°è‡´?´å€‹æ?ç¨‹ä¸­??
        newDb.categories = newDb.categories || [];
        newDb.problems = newDb.problems || [];
        
        // 1. ç²¾æ??½å‡º?ªè??§å®¹ï¼šåªè¦å??¨æ–¼?¬åœ°/?²ç«¯ï¼Œä??Œä??¨æ??°å??¹å??®ä¸­?ç?ï¼Œä?å¾‹è??ºè‡ªè¨‚æ“´??
        const userAddedCategories = db.categories.filter(oldC => !newDb.categories.some(newC => newC.id === oldC.id));
        const userAddedProblems = db.problems.filter(oldP => !newDb.problems.some(newP => newP.id === oldP.id));
        
        // è³¦ä??æ­»?‘ç?ï¼Œè?ç³»çµ±?¥é??™ä??¯è‡ªè¨‚æ“´?…ï?ä¸¦å?è¨±ä½¿?¨è€…åˆª??(?…å«è¢«å??¹æ?æ±°ç??Šé???
        userAddedCategories.forEach(c => c.isUserAdded = true);
        userAddedProblems.forEach(p => p.isUserAdded = true);

        // 2. æ¸…é™¤ Firebase ?Šå®¢è£½å?ç´€?„ï?ç¢ºä?å®˜æ–¹é¡Œåº«è¦†è?
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

        // ?’¡ ?Œæ­¥ä¿ç?ç¨‹å?ç¢¼ä?ç­”é€²åº¦ï¼Œé¿?å??¹æ›´?°å?ï¼Œè‡ªå·±å¯«?„ç?å¼ç¢¼ä¸è?
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

        // 3. çµ„å?ï¼šå…¨?°å??¹é?åº?+ ä½ ç??ªè??´å?
        newDb.categories = [...newDb.categories, ...userAddedCategories];
        newDb.problems = [...newDb.problems, ...userAddedProblems];
        
        const preservedCustomBanks = db.customBanks || [];
        db = newDb; 
        db.customBanks = preservedCustomBanks;

        // ?? å¼·åˆ¶?²ç«¯è¦†è?å­˜æ?
        await saveToLocal(true, false);
        
        document.getElementById('updateToast').style.display = 'none'; 
        pendingUpdateDb = null;
        alert("??é¡Œåº«å·²æ??Ÿå?æ­¥è‡³?€?°ç??¬ï?\n?è¨­é¡Œç›®å·²å…¨?¢æ›´?°ï??¨ç?ä½œç?ç´€?„è??ªè?é¡Œç›®ä¹Ÿå·²å®‰å…¨ä¿ç???); 
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
        // 1. å¦‚æ??¯è‡ªè¨‚é?åº«ï??ˆå??¶å?ç·¨è¼¯?§å®¹?å¡«??customBanks ???ä¸?
        const isCustom = currentBankUrl && currentBankUrl.startsWith("local_custom_");
        if (isCustom) {
            const customId = currentBankUrl.replace("local_custom_", "");
            const bankIdx = db.customBanks.findIndex(b => b.id === customId);
            if (bankIdx !== -1) {
                db.customBanks[bankIdx].categories = JSON.parse(JSON.stringify(db.categories));
                db.customBanks[bankIdx].problems = JSON.parse(JSON.stringify(db.problems));
                
                // ?’¡ ?²å??™å€‹ç‰¹å®šç? custom bank ?°ç¨ç«‹ç? subcollection
                if (syncDbToCloud && currentUser && personalDb) {
                    try {
                        personalDb.collection('users').doc(currentUser.uid).collection('customBanks').doc(customId).set(db.customBanks[bankIdx]);
                    } catch(e) {}
                }
            }
        }

        // 2. ?¬åœ°ç«¯å??´å?æª?(?šç‚ºä¿éšª)
        localStorage.setItem('oj_v15_data', JSON.stringify(db)); 
        localStorage.setItem('oj_v15_history', JSON.stringify(executionHistories));
        if (currentUser) localStorage.setItem('oj_v15_uid', currentUser.uid);

        if (!syncDbToCloud && !syncHistoryToCloud) return; 

        // 3. ?²ç«¯?†é›¢?²å?
        if (currentUser && personalDb) { // ç¢ºä? personalDb å­˜åœ¨
            try {
                let updatePayload = {
                    lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
                };

                // ?†æ?ï¼šæ ¹?šç•¶?ç’°å¢ƒé¸?‡å„²å­˜æ?ä½?
                if (syncDbToCloud) {
                    // ?’¡ è¼•é???userCustomBanksï¼Œåªå­˜åŸº?¬è?è¨Šä»¥ç¶­æ??’å??‡æ??®ï?è§?±ºä¸»æ?ä»?1MB ?åˆ¶
                    const lightweightBanks = (db.customBanks || []).map(b => ({ id: b.id, name: b.name, version: b.version }));
                    updatePayload.userCustomBanks = JSON.stringify(lightweightBanks);
                    
                    if (!isCustom) {
                        // ?ç§»æ¤?70-5 æ­?¸¸?ˆé?è¼¯ã€‘ï??©ç”¨ç¶²å??¢ç??¨ç?å®‰å…¨??Key
                        const safeKey = currentBankUrl ? currentBankUrl.replace(/[\.\#\$\[\]]/g, '_') : '';
                        
                        updatePayload.bankProgress = {
                            [safeKey]: JSON.stringify({
                                categories: db.categories,
                                problems: db.problems,
                                version: db.version
                            })
                        };
                        
                        // ?Šç??¬è??‰åˆ°?€å¤–å±¤
                        updatePayload.bankVersions = {
                            [safeKey]: db.version || "?ªè???
                        };
                    }
                }

                if (syncHistoryToCloud) {
                    updatePayload.historyData = JSON.stringify(executionHistories);
                }

                // å¯«å…¥?‹äºº?„è??™åº«
                await personalDb.collection('users').doc(currentUser.uid).set(updatePayload, { merge: true });
                console.log("???²ç«¯?†é›¢?²å??å?");
            } catch (e) { 
                console.error("?²ç«¯?Œæ­¥å¤±æ?ï¼?, e); 
            }
        }
    }


    // ?¨ç??²å??‡å??¨æ›´?°å‡½??
    async function syncProblemDeltaToCloud(probId, diff) {
        if (!currentUser) return;
        
        // ?›¡ï¸??°å??²è­·ï¼šå??œæ˜¯?ªè?é¡Œåº«ï¼Œå??ºå??¢ç? saveToLocal å·²ç??´å?å­˜å¥½äº†ï??™è£¡?´æ¥?»æ?ï¼Œé¿?æµªè²»é›²ç«¯ç©º??
        const isCustom = currentBankUrl && currentBankUrl.startsWith("local_custom_");
        if (isCustom) return; 

        let payload = { customProblems: {} };
        
        if (diff === null) {
            // ?³å…¥ null ä»?¡¨è¦æ??™é?å¾é›²ç«¯åˆª??
            payload.customProblems[probId] = firebase.firestore.FieldValue.delete();
        } else {
            // ?å??Œæ?ä¿®æ”¹?„æ?ä½ã€æ›´??
            payload.customProblems[probId] = diff;
         }
        
        try {
            await personalDb.collection('users').doc(currentUser.uid).set(payload, { merge: true });
            console.log(`é¡Œç›® ${probId} å·²å??¨æ›´?°è‡³?²ç«¯`, diff);
        } catch(e) {
            console.error("?²ç«¯å±€?¨æ›´?°å¤±?—ï?", e);
        }
    }
    
    // ?’¡ ?°å?ï¼šå?æ­¥è‡ªè¨‚å?é¡è‡³?²ç«¯ (è§?±º 1MB å®¹é??åˆ¶å°è‡´?„è‡ªè¨‚å?é¡éºå¤±å?é¡?
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
            console.log(`?†é? ${catId} ?²ç«¯?Œæ­¥å®Œæ?`, diff);
        } catch(e) {
            console.error(`?†é? ${catId} ?²ç«¯?Œæ­¥å¤±æ?ï¼š`, e);
        }
    }
    
    
    // ==========================================
    // 4. è§??ç³»çµ±?¸å??è¼¯
    // ==========================================
    let currentCatId = null;
    let currentProbId = null;
    let currentCompileMode = 'wandbox'; // ?¨å?ä¸‰æ®µå¼è???
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
	
	
	
	// ===== ?°å?ï¼šç™»??è¨»å?æ¬„ä???Enter å¿«æ·??=====
	const emailInput = document.getElementById('emailInput');
	const passwordInput = document.getElementById('passwordInput');
    
	if (emailInput && passwordInput) {
	    // Email æ¬„ä??‰ä? Enterï¼Œç„¦é»è·³?°å?ç¢¼æ?ä½?
	    emailInput.addEventListener('keydown', function(e) {
		if (e.key === 'Enter') {
		    e.preventDefault(); // ?¿å?è§¸ç™¼ç¶²é??è¨­?„æ?è¡Œæ??äº¤è¡Œç‚º
		    passwordInput.focus();
		}
	    });
        
	    // å¯†ç¢¼æ¬„ä??‰ä? Enterï¼Œç›´?¥åŸ·è¡Œç™»??è¨»å?æµç?
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

        // 1. ?–å?è·¯å?
        const hash = window.location.hash || '#/source-selector'; 
        const [path, queryString] = hash.substring(1).split('?');
        const params = new URLSearchParams(queryString || '');

        // 2. ?å„ª?ˆã€‘å…¬?‹é??¢åˆ¤?·ï?è®“æ?å­¸é?ç¶²å??‡ç•«?¢ä??å?æ­¥ï?ä¸è¢«?»å…¥?è¼¯?”æˆª
        if (path === '/firebase-tutorial') {
            showView('view-firebase-tutorial');
            return; 
        }

        // 3. ?å??€?¡ã€‘ç™»?¥æª¢?¥ï??ªæ??ªã€Œé??¬é??ä??Œæœª?»å…¥?ç?å­˜å?
        if (!currentUser) {
            showView('view-login');
            return;
        }

        // 4. ?ç?äººé??¢ã€‘è·¯å¾‘åˆ¤??
        if (path === '/login' || path === '') {
            window.location.hash = '/source-selector';
            return;
        }

        if (path === '/source-selector') {
            const nameEl = document.getElementById('user-name');
            if (nameEl) nameEl.innerText = currentUser.email;
            
            const emailEl = document.getElementById('sourceSelectorUserEmail');
            if (emailEl) emailEl.innerText = "?®å??»å…¥ï¼? + currentUser.email;
            
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
            
            //ç¢ºä??æ–°?´ç?å¾Œï?æ¨™é??½é¡¯ç¤ºç›®?è??¸ä¸­?„é?åº«å?ç¨?
            if (currentBankName) {
                const nameEl = document.getElementById('currentBankName');
                if (nameEl) nameEl.innerHTML = `<i class="fa-solid fa-folder-open" style="color: #60a5fa; margin-right: 8px;"></i> ?®å?é¡Œåº«: ` + currentBankName;
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
            // ?è¨­è·³è?å¤§å»³ï¼Œé¿?æœª?¥è·¯å¾‘å??´ç™½?«é¢
            showView('view-portal');
        }
    }

    
    //?‡æ??ªè?é¡Œåº«?’å?æ¨¡å?
    function toggleBankSortMode() {
        isBankSortMode = !isBankSortMode;
        const btn = document.getElementById('bankSortBtn');
        if (btn) {
            btn.innerText = isBankSortMode ? "??å®Œæ??’å?" : "??èª¿æ•´?†å?";
            btn.className = isBankSortMode ? "btn btn-danger" : "btn btn-outline";
            if (!isBankSortMode) {
                // çµæ??’å??‚æ¢å¾©ç™½?²æ¨£å¼?
                btn.style.color = "white";
                btn.style.borderColor = "white";
            }
        }
        renderCustomPortal(); // ?æ–°æ¸²æ??—è¡¨ä»¥å??¨æ¨¡å¼?
    }
    
    //?²å??ªè?é¡Œåº«?°é?åºç??è¼¯ (?­é??’å??Ÿèƒ½)
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
    
    // æ¸²æ??ªè?é¡Œåº«æ¸…å–®
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
            card.style.padding = '40px 20px'; // ? å¤§?ªè?é¡Œåº«?¡ç?é«˜åº¦
            card.setAttribute('draggable', isBankSortMode);
            card.dataset.idx = idx; // ç´€?„å?å§‹ç´¢å¼?(ä¿ç?çµ?onclick ä½¿ç”¨)
            card.dataset.id = bank.id; // ç´€?„å”¯ä¸€ ID (?’å???
            
            // ?’å?æ¨¡å?ä¸‹ä?é¡¯ç¤º?ä??‰é?ï¼Œé??’å?æ¨¡å?é¡¯ç¤º?´å??‡åˆª??
            const actionsHtml = isBankSortMode ? '' : `
                <div style="position: absolute; top: 10px; right: 10px; display: flex; gap: 5px;">
                    <button class="prob-btn-icon" style="color: #1e3a8a; background: rgba(0,0,0,0.05);" onclick="renameCustomBank(event, ${idx})" title="?´å?"><i class="fa-solid fa-pen"></i></button>
                    <button class="prob-btn-icon" style="color: #ef4444; background: rgba(0,0,0,0.05);" onclick="deleteCustomBank(event, ${idx})" title="?ªé™¤">??/button>
                </div>
            `;

            card.innerHTML = `
                <div onclick="if(!isBankSortMode) loadCustomBank(${idx})" style="width:100%; height:100%; display:flex; flex-direction:column; align-items:flex-start; justify-content:center; text-align:left; padding-left: 5px; cursor: ${isBankSortMode ? 'grab' : 'pointer'};">
                    <span style="font-size:1.5rem;"><i class="fa-solid fa-folder-open" style="color: #60a5fa; margin-right: 8px;"></i> ${bank.name}</span>
                    <span class="bank-desc" style="color: inherit;">${bank.problems ? bank.problems.length : 0} é¡?/span>
                </div>
                <div class="bank-actions">
                    <button class="btn btn-outline btn-sm" style="background: white; color: #333; padding: 4px 8px; font-size: 0.85rem; border-color: #ccc;" onclick="renameCustomBank(event, ${idx})" title="?´å?"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn btn-outline btn-sm" style="background: white; color: #f44747; border-color: #f44747; padding: 4px 8px; font-size: 0.85rem;" onclick="deleteCustomBank(event, ${idx})" title="?ªé™¤"><i class="fa-solid fa-trash"></i></button>
                </div>
            `;
            container.appendChild(card);
        });

        // å¦‚æ??¨æ?åºæ¨¡å¼ï??Ÿå??–æ›³?Ÿèƒ½
        if (isBankSortMode) {
            enableDragSort('customBankList', 'bank-btn', saveBankOrder);
        }
    }
    

    // ?°å??ªè?é¡Œåº«
    async function addCustomBank() {
    	const name = prompt("è«‹è¼¸?¥è‡ªè¨‚é?åº«å?ç¨±ï?");
    	if (!name) return;
	
	// ?²å?æ©Ÿåˆ¶ï¼Œå??œè?è³‡æ?æ²’æ??™å€‹é™£?—ï?å°±å¹«å®ƒå»ºä¸€?‹ç©º??
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
        if (btn) { btn.disabled = true; btn.innerText = "??å»ºç?ä¸?.."; }
        await saveToLocal(true, false); // ?Œæ­¥?°ä½¿?¨è€…é›²ç«?
        
        // ?’¡ ?Œæ­¥å¯«å…¥å­é???
        if (currentUser && personalDb) {
            try {
                await personalDb.collection('users').doc(currentUser.uid).collection('customBanks').doc(newBank.id).set(newBank);
            } catch(e) {}
        }
        
        if (btn) { btn.disabled = false; btn.innerText = "+ ?°å?é¡Œåº«"; }
        renderCustomPortal();
    }
    
    //?´å??Ÿèƒ½
    async function renameCustomBank(e, idx) {
        e.stopPropagation(); // ?²æ­¢è§¸ç™¼?²å…¥é¡Œåº«?„é??Šä?ä»?
        const oldName = db.customBanks[idx].name;
        const newName = prompt("è«‹è¼¸?¥æ–°?„é?åº«å?ç¨±ï?", oldName);
        
        if (newName && newName.trim() !== "" && newName !== oldName) {
            db.customBanks[idx].name = newName.trim();
            
            // ?’¡ å¦‚æ??´æ”¹?„æ˜¯?®å?æ­?œ¨ä½¿ç”¨?„é?åº«ï??Œæ­¥?´æ–°?ç¨±
            if (currentBankUrl === "local_custom_" + db.customBanks[idx].id) {
                currentBankName = newName.trim();
                localStorage.setItem('oj_v15_bank_name', currentBankName);
                const bankNameEl = document.getElementById('currentBankName');
                if (bankNameEl) bankNameEl.innerHTML = `<i class="fa-solid fa-folder-open" style="color: #60a5fa; margin-right: 8px;"></i> ?®å?é¡Œåº«: ` + currentBankName;
            }
            
            const btn = e.target;
            const originalText = btn.innerText;
            if (btn) { btn.disabled = true; btn.innerText = "??; }
            await saveToLocal(true, false); // ?Œæ­¥?°é›²ç«¯è??¬åœ°
            
            // ?’¡ ?Œæ­¥?°å??†å?
            if (currentUser && personalDb) {
                try {
                    await personalDb.collection('users').doc(currentUser.uid).collection('customBanks').doc(db.customBanks[idx].id).set({ name: newName.trim() }, { merge: true });
                } catch(e) {}
            }
            
            if (btn) { btn.disabled = false; btn.innerText = originalText; }
            renderCustomPortal();    // ç«‹å³?æ–°æ¸²æ??«é¢
        }
    }
    
    // è¼‰å…¥?¹å??„è‡ªè¨‚é?åº«å…§å®¹åˆ°ç³»çµ±ä¸»é?   
    async function loadCustomBank(idx) {
        // ?? UI ?²å?ï¼šå??¥è??¥ä¸­?•ç•«ä¸¦é?å®šå…¨?Ÿæ??•ï??²æ­¢?è?é»æ?
        const container = document.getElementById('customBankList');
        const cards = container.querySelectorAll('.bank-btn');
        let clickedCard = null;
        let originalContent = "";
        
        cards.forEach(card => {
            if (parseInt(card.dataset.idx) === idx) {
                clickedCard = card.querySelector('div[onclick]');
                if (clickedCard) {
                    originalContent = clickedCard.innerHTML;
                    clickedCard.innerHTML = `<span style="font-size:1.5rem; font-weight:bold;">??è¼‰å…¥ä¸?..</span><span class="bank-desc" style="color: inherit;">?²å?ä¸¦å??›é?åº?/span>`;
                }
            }
            card.style.pointerEvents = 'none';
            card.style.opacity = '0.6';
        });

        try {
            // ?ˆå?ä¸€ä¸‹ç›®?åœ¨?©ç??±è¥¿
            await saveToLocal(true, false);

        // ?›¡ï¸??²è­· 4ï¼šå¼·?¶æ?ç©ºç?å¾…ä¸­?„æ›´?°å??‡å?çª?
        pendingUpdateDb = null;
        const toast = document.getElementById('updateToast');
        if (toast) toast.style.display = 'none';

        const selected = db.customBanks[idx];
        currentBankName = selected.name;
        currentBankUrl = "local_custom_" + selected.id;

        // å¾¹å??‡æ?è³‡æ?ä¸»é?
        db.categories = JSON.parse(JSON.stringify(selected.categories || []));
        db.problems = JSON.parse(JSON.stringify(selected.problems || []));
        db.version = selected.version;

        // ?’¡ ?¸å?ä¿®æ­£ï¼šå??›å?é¡Œåº«è³‡æ?å¾Œï?ç«‹åˆ»å¯«å…¥ localStorage ??data
        // ?¦å?å¦‚æ?ä½¿ç”¨?…æ­¤?‚æ?ä¸?F5ï¼Œæ?è®€?–åˆ°?Œæ–°ç¶²å??ä??Œè?é¡Œåº«?§å®¹?ï?å°è‡´è³‡æ??¯ä?ï¼?
        localStorage.setItem('oj_v15_data', JSON.stringify(db));

        localStorage.setItem('oj_v15_bank_name', currentBankName);
        localStorage.setItem('oj_v15_bank_url', currentBankUrl);
        
        const bankNameEl = document.getElementById('currentBankName');
        if (bankNameEl) bankNameEl.innerHTML = `<i class="fa-solid fa-folder-open" style="color: #60a5fa; margin-right: 8px;"></i> ?®å?é¡Œåº«: ` + currentBankName;
        
        window.location.hash = '/categories';
        
        } catch (e) {
            console.error("?‡æ?é¡Œåº«?¼ç??¯èª¤", e);
            alert("?‡æ?é¡Œåº«?‚ç™¼?ŸéŒ¯èª¤ï?");
        } finally {
            // ?? ?¢å¾©?‰é??€??
            cards.forEach(card => {
                card.style.pointerEvents = 'auto';
                card.style.opacity = '1';
            });
            if (clickedCard && originalContent) {
                clickedCard.innerHTML = originalContent;
            }
        }
    } 

    // ?ªé™¤?ªè?é¡Œåº«
    async function deleteCustomBank(e, idx) {
        e.stopPropagation();
        if (confirm(`ç¢ºå?è¦åˆª?¤è‡ªè¨‚é?åº«ã€?{db.customBanks[idx].name}?å?ï¼Ÿæ­¤?•ä??¡æ?å¾©å??‚`)) {
            db.customBanks.splice(idx, 1);
            const btn = e.target;
            if (btn) { btn.disabled = true; btn.innerText = "??; }
            await saveToLocal(true, false);
            renderCustomPortal();
    	}
    }
       
    
    async function fetchAndLoadBank(jsonUrl, displayName, forceReset = false) {
        if (!currentUser) { alert("è«‹å??»å…¥å¸³è?ï¼?); return; }

        pendingUpdateDb = null;
        const toast = document.getElementById('updateToast');
        if (toast) toast.style.display = 'none'; 
        
        // ?? UI ?²å?ï¼šå??¥è??¥ä¸­?•ç•«ä¸¦é?å®šå…¨?Ÿæ???
        const buttons = document.querySelectorAll('.bank-btn');
        let clickedBtn = null;
        let originalContent = "";
        buttons.forEach(btn => {
            if (btn.getAttribute('onclick') && btn.getAttribute('onclick').includes(jsonUrl)) {
                clickedBtn = btn;
                originalContent = btn.innerHTML;
                btn.innerHTML = `<span style="font-size: 1.5rem; font-weight:bold;">??è¼‰å…¥ä¸?..</span><span class="bank-desc">?Œæ­¥?²ç«¯è³‡æ?</span>`;
            }
            btn.style.pointerEvents = 'none';
            btn.style.opacity = '0.6';
        });

        try {
            // ?? ?ˆèƒ½?ªå?ï¼šå¹³è¡Œå?ä¸‹è? GitHub é¡Œåº«??Firebase ?²ç«¯?²åº¦ï¼Œç??ä??Šä»¥ä¸Šç?ç­‰å??‚é?
            const fetchPromise = fetch(jsonUrl).then(res => {
                if (!res.ok) throw new Error("ä¼ºæ??¨å??³ç??‹ï?" + res.status);
                return res.json();
            });
            const dbPromise = personalDb ? personalDb.collection('users').doc(currentUser.uid).get() : Promise.resolve(null);
            
            const [newDb, docSnap] = await Promise.all([fetchPromise, dbPromise]);
            
            // ?’¡ æµ·é?å®‰æª¢ï¼šå¼·?¶æ·¨?–å? GitHub ä¸‹è??„å???JSONï¼Œæ??¤ä?å°å?æ®˜ç??„è‡ªè¨‚æ?ç±?
            (newDb.categories || []).forEach(c => delete c.isUserAdded);
            (newDb.problems || []).forEach(p => delete p.isUserAdded);
            
            // ç¢ºä????å­˜åœ¨ï¼Œé¿??.some() ?‹å‡º?¯èª¤å°è‡´?´å€‹æ?ç¨‹ä¸­??
            newDb.categories = newDb.categories || [];
            newDb.problems = newDb.problems || [];
            
            let shouldSyncDb = forceReset;

            // --- 1. å¾?Firebase ?“å?ä½ åœ¨?™ä»½é¡Œåº«?„ã€Œé›²ç«¯æ­·?²å?æª”ã€?---
            let savedCategories = [];
            let savedProblems = [];
            const safeKey = jsonUrl.replace(/[\.\#\$\[\]]/g, '_');

            if (personalDb) {
                try {
                    // docSnap å·²ç??¨ä??¹é€é? Promise.all ?–å?äº?
                    if (docSnap && docSnap.exists) {
                        const data = docSnap.data();
                        if (data.bankProgress && data.bankProgress[safeKey]) {
                            const prog = JSON.parse(data.bankProgress[safeKey]);
                            savedCategories = prog.categories || [];
                            savedProblems = prog.problems || [];
                        }
                        
                        // ?? ?‘å??ºå¤±?„è‡ªè¨‚å?é¡ï?å¦‚æ? bankProgress å­˜æ?å¤±æ?ï¼Œå? customCategories ?„å?ä»½ä¸­?ˆå?ä¾?
                        if (data.customCategories) {
                            Object.values(data.customCategories).forEach(cc => {
                                // æª¢æŸ¥?¯å¦å±¬æ–¼?¶å?æ­?œ¨è¼‰å…¥?„é?åº?(jsonUrl)
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

                        // ?? ?‘å??ºå¤±?„è‡ªè¨‚é??®ï?å¦‚æ? bankProgress å­˜æ?å¤±æ?ï¼Œå? customProblems ?„å?ä»½ä¸­?ˆå?ä¾?
                        if (data.customProblems) {
                            Object.values(data.customProblems).forEach(cp => {
                                if (cp && cp.id) {
                                    const existingP = savedProblems.find(p => p.id == cp.id);
                                    if (existingP) {
                                        Object.assign(existingP, cp);
                                    } else {
                                        // ç¢ºä??™é?å±¬æ–¼?¶å?é¡Œåº« (?†é??¨å??¹å??®æ??¬åœ°å­˜æ?ä¸?
                                        const isForThisBank = newDb.categories.some(c => c.id == cp.catId) || savedCategories.some(c => c.id == cp.catId);
                                        if (isForThisBank) {
                                            savedProblems.push(cp);
                                        }
                                    }
                                }
                            });
                        }
                    }
                } catch (e) { console.error("è®€?–ç›®æ¨™é?åº«é€²åº¦å¤±æ?", e); }
            }

            // --- 2. çµ•å??²å??†é›¢ï¼šåªè¦é›²ç«¯æ?ï¼Œä? GitHub ?€?°å??¹æ??‰ç?ï¼Œçµ±çµ±è??ºã€Œè‡ªè¨‚æ“´?…ã€?---
            const userAddedCategories = savedCategories.filter(oldC => !newDb.categories.some(newC => newC.id === oldC.id));
            const userAddedProblems = savedProblems.filter(oldP => !newDb.problems.some(newP => newP.id === oldP.id));
            
            // è³¦ä??æ­»?‘ç?ï¼Œè?ç³»çµ±?¥é??™ä??¯è‡ªè¨‚æ“´?…ï?ä¸¦å?è¨±ä½¿?¨è€…åˆª??(?…å«è¢«å??¹æ?æ±°ç??Šé???
            userAddedCategories.forEach(c => c.isUserAdded = true);
            userAddedProblems.forEach(p => p.isUserAdded = true);

            // --- 3. ?•ç??è¨­é¡Œåº«?ˆä½µ (?? ?™è£¡å°±æ˜¯ä½ æ??¹ç??œéµï¼? ---
            const bankVersions = JSON.parse(localStorage.getItem('oj_v15_bank_versions') || '{}');
            const lastSyncedVersion = bankVersions[jsonUrl];
            const isUpdate = (!forceReset && newDb.version && lastSyncedVersion !== undefined && newDb.version !== lastSyncedVersion);

            if (forceReset || isUpdate) {
                shouldSyncDb = true; 
                // ?å¼·?¶è??‹æ¨¡å¼ã€‘ï??‰æ–°?ˆæœ¬?‚ï??¨å??¹é?åº«è??‹ä?ä¿®æ”¹?„æ?è¿°ï??ªä??™ç?å¼ç¢¼
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
                // ?’¡?ä??¬å??›æ¨¡å¼ã€‘ç„¡?è??¥ï?å®Œæ•´ä¿ç?ä½ å?å®˜æ–¹é¡Œç›®?šç?ä»»ä?ä¿®æ”¹ (?…å«æ¨™é??æ?è¿°ã€æ¸¬è³?
                newDb.categories = newDb.categories.map(newC => {
                    const oldC = savedCategories.find(c => c.id === newC.id);
                    return oldC ? Object.assign({}, newC, oldC) : newC;
                });
                newDb.problems = newDb.problems.map(newP => {
                    const oldP = savedProblems.find(p => p.id === newP.id);
                    return oldP ? Object.assign({}, newP, oldP) : newP;
                });
            }

            // --- 4. å®Œç?çµ„å?ï¼šå??¹ç? + ?ªè??´å? ---
            db.categories = [...newDb.categories, ...userAddedCategories];
            db.problems = [...newDb.problems, ...userAddedProblems];
            db.version = newDb.version || (userAddedProblems.length > 0 ? "ä¿ç??²åº¦?? : ""); 

            const preservedCustomBanks = db.customBanks || [];
            db.customBanks = preservedCustomBanks;

            currentBankUrl = jsonUrl; 
            currentBankName = displayName || jsonUrl;
            bankVersions[jsonUrl] = db.version;
            localStorage.setItem('oj_v15_bank_versions', JSON.stringify(bankVersions));
            localStorage.setItem('oj_v15_bank_name', currentBankName); 
            localStorage.setItem('oj_v15_bank_url', currentBankUrl);
            
            const bankNameEl = document.getElementById('currentBankName');
            if (bankNameEl) bankNameEl.innerHTML = `<i class="fa-solid fa-folder-open" style="color: #60a5fa; margin-right: 8px;"></i> ?®å?é¡Œåº«: ` + currentBankName;
                
            saveToLocal(shouldSyncDb, false);      
            window.location.hash = '/categories';
            checkForUpdates();

        } catch (err) { 
            alert("è¼‰å…¥å¤±æ?ï¼è?ç¢ºè? GitHub æª”æ??¯å¦å­˜åœ¨\n\nè©³ç´°?¯èª¤ï¼? + err.message); 
        } finally {
            // ?? ?¢å¾©?‰é??€?‹ï??¡è??å??–å¤±?—éƒ½è§???‰é?
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
            alert("?®å??¯ç©º?½ç??‹ï??¡æ??æ–°è¼‰å…¥??); 
            return; 
        } 
        if (confirm("? ï? è­¦å?ï¼šé€™å??ƒæ??¤ã€Œé?è¨­é?åº«ã€ç??€?‰è‡ªè¨‚è¨­å®šè?ä»?¢¼ï¼Œä¸¦?æ–°ä¸‹è??€?°é?åº«ï?\n(?¨è‡ªè¡Œæ–°å¢ç?é¡Œç›®?‡å?é¡å??ƒè¢«å®‰å…¨ä¿ç?ï¼ŒåŸ·è¡Œç??„ä?ä¸æ?æ¶ˆå¤±)")) { 
            // å°‡æ??¤é?è¼¯äº¤??fetchAndLoadBank ?¨æ?å°å??·è?
            fetchAndLoadBank(currentBankUrl, currentBankName, true); 
        } 
    }
    
    function hardResetAll() { 
        if (confirm("? ï? è­¦å?ï¼šé€™å??ƒæ??¤æ??‰è??™ï?è®“ç³»çµ±å??°ã€Œå??¨ç©º?½ã€ç??‹ï?ç¢ºå??ï?")) { 
            db = { categories: [], problems: [], version: "" }; 
            currentBankName = "?ªè??°é?åº?(ç©ºç™½)"; 
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

    // === V60: Workspace ?†é?ç¹ªè£½?‡å???===
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
        
        // ç¢ºä?ç©ºå?ä¸²æ¨¡?¿ä??ƒè¢«è¦†è?
        if (p.tpl_cpp === undefined) p.tpl_cpp = p.templateCode !== undefined ? p.templateCode : defaultTemplates.cpp;
        if (p.tpl_python === undefined) p.tpl_python = defaultTemplates.python;
        
        // ç¢ºä? multiFiles ??code å±¬æ€§å???
        if (p.isMultiFile && p.multiFiles) {
            p.multiFiles.forEach(f => { 
                if (f.code === undefined) f.code = f.tpl !== undefined ? f.tpl : ""; 
            });
        }
        
        if (!fromAdmin) { 
                // ä¿®æ­£ï¼šåªè¦æ˜¯?¨æ–°?²å…¥ä½œç??€ï¼ˆé??°å??ï?ï¼Œä?å¾‹å¼·?¶é?ç½®ç‚º?Œé?è¨­æ¨¡?¿ã€?
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
        
        currentFileIndex = -1; // ?²å…¥é¡Œåº«?‚é?è¨­é¡¯ç¤?main
        renderWorkspaceTabs();

        if (lang === 'cpp') { 
            editor.session.setMode("ace/mode/c_cpp"); 
            editor.setValue(p.code_cpp !== undefined ? p.code_cpp : p.tpl_cpp, -1); 
        } else if (lang === 'python') { 
            editor.session.setMode("ace/mode/python"); 
            editor.setValue(p.code_python !== undefined ? p.code_python : p.tpl_python, -1); 
        }
        
        document.getElementById('outputLogs').innerHTML = '<div style="color:#666;">ç­‰å??·è?...</div>';
        showView('view-workspace');
    }

    function goToAdmin() { 
        const lang = document.getElementById('langSelect').value;
        const p = db.problems.find(x => x.id === currentProbId);
        
        // ä¿å? Workspace ç·¨è¼¯?¨ç›®?ç??€??
        if (lang === 'cpp' && p.isMultiFile) {
            if (currentFileIndex === -1) p.code_cpp = editor.getValue();
            else p.multiFiles[currentFileIndex].code = editor.getValue();
        } else {
            if (p) p['code_' + lang] = editor.getValue(); 
        }
        
        window.location.hash = '/admin?probId=' + currentProbId;
    }

    // === V60: Admin å¤šæ?æ¡ˆå??ç¹ªè£½è??‡æ? ===
    function toggleAdminMultiFile() {
        const isEnabled = document.getElementById('adminEnableMultiFile').checked;
        document.getElementById('adminEditorTabs').style.display = (isEnabled && currentAdminLang === 'cpp') ? 'flex' : 'none';
        
        if (isEnabled && adminMultiFiles.length === 0) {
            adminMultiFiles.push({ name: "Class.cpp", tpl: "\n" });
            adminMultiFiles.push({ name: "Class.h", tpl: "\n" });
        }
        
        if (!isEnabled || currentAdminLang !== 'cpp') { 
            switchAdminFile(-1); // ?¥é??‰å??‡å? main ?è¦½
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
                        <span class="tab-icon" title="?æ–°?½å?" onclick="renameAdminFile(event, ${idx})"><i class="fa-solid fa-pen"></i></span> 
                        <span class="tab-icon" title="ç§»é™¤" onclick="removeAdminFile(event, ${idx})">??/span>
                     </div>`;
        });
        
        html += `<div class="editor-tab" style="color:var(--success);" onclick="addAdminFile()">+ ?°å?æª”æ?</div>`;
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
        const name = prompt("è«‹è¼¸?¥æ–°å¢æ?æ¡ˆå?ç¨?(ä¾‹å? Rectangle.cpp):", "NewClass.cpp");
        if (name && name.trim() !== "") {
            adminMultiFiles.push({ name: name.trim(), tpl: "// " + name.trim() + "\n" });
            switchAdminFile(adminMultiFiles.length - 1);
        }
    }

    function renameAdminFile(e, idx) {
        e.stopPropagation();
        const newName = prompt("?æ–°?½å?:", adminMultiFiles[idx].name);
        if (newName && newName.trim() !== "") {
            adminMultiFiles[idx].name = newName.trim();
            renderAdminTabs();
        }
    }
    
    function removeAdminFile(e, idx) {
        e.stopPropagation();
        if (confirm("ç¢ºå??ªé™¤æ­¤æ?æ¡ˆï?")) {
            const wasCurrentTab = (adminCurrentFileIndex === idx);
            if (adminCurrentFileIndex > idx) adminCurrentFileIndex--; 
            
            adminMultiFiles.splice(idx, 1); //?ˆå?è³‡æ????ç§»é™¤

            if (wasCurrentTab) {
                adminCurrentFileIndex = -1;
                document.getElementById('editTemplate').value = adminTempTemplates[currentAdminLang] || ""; 
            }
            renderAdminTabs(); //?ªæ¸²?“ä?æ¬¡æ??°ç??€??
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
        
        // ?å???Admin ?„å?æª”æ?è¨­å?
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
            
            card.innerHTML = `<div class="cat-title">${cat.name}</div><div class="cat-count">${probCount} é¡?/div><div class="cat-actions"><button class="btn btn-outline btn-sm" onclick="editCategory(event, '${cat.id}')"><i class="fa-solid fa-pen"></i></button><button class="btn btn-outline btn-sm" onclick="deleteCategory(event, '${cat.id}')" style="color:#f44747; border-color:#f44747;"><i class="fa-solid fa-trash"></i></button></div>`;
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
        const name = prompt("?°å?é¡å?ç¨±ï?"); 
        if (!name) return; 
        // ?’¡ ? ä? isUserAdded æ¨™ç±¤ï¼Œä¸¦ç¶å? bankUrl ä¾›è·¨è£ç½®?™ä»½è¾¨è?
        const newCat = { id: Date.now().toString(), name: name, isUserAdded: true, bankUrl: currentBankUrl };
        db.categories.push(newCat); 
        const btn = document.querySelector('#view-categories .btn-primary');
        if (btn) { btn.disabled = true; btn.innerText = "???°å?ä¸?.."; }
        await saveToLocal(true, false); 
        await syncCategoryDeltaToCloud(newCat.id, newCat);
        if (btn) { btn.disabled = false; btn.innerText = "+ ?°å??†é?"; }
        renderCategoryList(); 
    }
    

    async function editCategory(e, id) { 
        e.stopPropagation(); 
        const cat = db.categories.find(c => c.id === id); 
        const newName = prompt("ä¿®æ”¹?†é??ç¨±ï¼?, cat.name); 
        if (newName) { 
            cat.name = newName; 
            await saveToLocal(true, false); 
            await syncCategoryDeltaToCloud(cat.id, cat);
            renderCategoryList(); 
        } 
    }

    async function deleteCategory(e, id) { 
        e.stopPropagation(); 
        if (!confirm("ç¢ºå??ªé™¤ï¼Ÿå?ä¸‹ç?é¡Œç›®ä¹Ÿæ?ä¸€ä½µåˆª?¤ã€?)) return; 
        
        const problemsToDelete = db.problems.filter(p => p.catId === id);
        
        db.categories = db.categories.filter(c => c.id !== id); 
        db.problems = db.problems.filter(p => p.catId !== id); 
        
        await saveToLocal(true, false); 
        
        // ?²ç«¯?Œæ­¥?ªé™¤?†é??‡å…¶é¡Œç›®
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
        document.getElementById('currentCatTitle').innerText = cat ? cat.name : "?†é?é¡Œåº«";
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
                const delBtnHtml = canDelete ? `<button class="prob-btn-icon prob-del-btn" onclick="deleteProblemInList(event, '${p.id}')" title="?ªé™¤é¡Œç›®"><i class="fa-solid fa-trash"></i></button>` : '';
                
                item.innerHTML = `<div style="flex:1; overflow:hidden;"><div class="prob-title">${p.title}</div><div class="prob-desc-preview">${p.desc.substring(0, 50)}...</div></div><div class="prob-actions"><button class="prob-btn-icon prob-edit-btn" onclick="openMoveModal(event, '${p.id}')" title="ç§»å??†é?">?“¦</button><button class="prob-btn-icon prob-edit-btn" onclick="editProblemInList(event, '${p.id}')" title="ä¿®æ”¹é¡Œç›®"><i class="fa-solid fa-pen"></i></button>${delBtnHtml}</div>`;
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
        const title = prompt("é¡Œç›®?ç¨±ï¼?); 
        if (title) { 
            const newProb = { 
                id: Date.now().toString(), 
                catId: currentCatId, 
                title: title, 
                desc: "è«‹è¼¸?¥é??®æ?è¿?..", 
                tpl_cpp: defaultTemplates.cpp, 
                tpl_python: defaultTemplates.python, 
                code_cpp: defaultTemplates.cpp, 
                code_python: defaultTemplates.python, 
                testCases: [{ input: "1 2", output: "3" }], 
                lastLang: 'cpp', 
                isMultiFile: false,
                isUserAdded: true // ?’¡ ? ä??æ­»?‘ç?æ¨™ç±¤
            };
            db.problems.push(newProb); 
            
            const btn = document.querySelector('#view-problem-list .btn-primary');
            if (btn) { btn.disabled = true; btn.innerText = "???°å?ä¸?.."; }
            await saveToLocal(true, false); 
            await syncProblemDeltaToCloud(newProb.id, newProb); 
            if (btn) { btn.disabled = false; btn.innerText = "+ ?°å?é¡Œç›®"; }
            renderProblemList(); 
        } 
    }
    
    

    function editProblemInList(e, id) { 
        e.stopPropagation(); 
        currentProbId = id; 
        // ä¿®æ­£ï¼šç›´?¥è·³è½?hashï¼Œé¿??goToAdmin è®€?–åˆ° editor ?„é??Ÿè???
        window.location.hash = '/admin?probId=' + id; 
    }
    

    async function deleteProblemInList(e, id) { 
        e.stopPropagation(); 
        if (confirm("ç¢ºå??ªé™¤ï¼?)) { 
            db.problems = db.problems.filter(p => p.id !== id); 
            
            await saveToLocal(true, false); 
            await syncProblemDeltaToCloud(id, null); // ?³é? nullï¼Œè§¸?¼é›²ç«¯ç¨ç«‹åˆª?¤è©²é¡?
            renderProblemList(); 
        } 
    }

// ================= ç§»å?é¡Œç›®?Ÿèƒ½ =================
    let problemToMoveId = null;

    function openMoveModal(e, probId) { 
        e.stopPropagation(); 
        problemToMoveId = probId; 
        
        const select = document.getElementById('moveCategorySelect'); 
        select.innerHTML = ''; 
        
        // ?“å??®å??„å?é¡æ??®æ”¾?¥ä??‰é¸??
        db.categories.forEach(cat => { 
            const option = document.createElement('option'); 
            option.value = cat.id; 
            option.text = cat.name; 
            if (cat.id === currentCatId) {
                option.text += " (?®å??†é?)"; 
                option.disabled = true; // ?ç™½ï¼Œä?è®“ä½¿?¨è€…ç§»?°å??¬ç??†é?
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
            // 1. ?´æ”¹é¡Œç›®?„æ?å±¬å?é¡?
            p.catId = targetCatId; 
            
            // 2. å­˜æ?ä¸¦å?æ­¥é›²ç«?
            const btn = document.querySelector('#moveProblemModal .btn-primary');
            if (btn) { btn.disabled = true; btn.innerText = "??ç§»å?ä¸?.."; }
            await saveToLocal(true, false); 
            await syncProblemDeltaToCloud(p.id, { catId: targetCatId }); 
            if (btn) { btn.disabled = false; btn.innerText = "??ç¢ºè?ç§»å?"; }
            
            // 3. ?æ–°æ¸²æ??«é¢ (ç§»èµ°å¾Œï?è©²é??ƒå??®å??«é¢æ¶ˆå¤±)
            renderProblemList(); 
        } 
        
        document.getElementById('moveProblemModal').style.display = 'none'; 
        problemToMoveId = null; 
    }

    function updateSortUI() { 
        const catBtn = document.getElementById('catSortBtn'); 
        const probBtn = document.getElementById('probSortBtn'); 
        
        if (catBtn) { 
            catBtn.innerText = isCatSortMode ? "??å®Œæ??’å?" : "??èª¿æ•´?†å?"; 
            catBtn.className = isCatSortMode ? "btn btn-danger" : "btn btn-outline"; 
        } 
        if (probBtn) { 
            probBtn.innerText = isProbSortMode ? "??å®Œæ??’å?" : "??èª¿æ•´?†å?"; 
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
            // 1. å¾??²ç«¯ ?‡æ????ªå»º?²ç«¯
            currentCompileMode = 'custom';
            btn.innerHTML = "?? ?ªå»º?²ç«¯";
            btn.style.color = "#a855f7"; // ç´«è‰² (?€?†ç”¨)
            btn.style.borderColor = "#a855f7";

        } else if (currentCompileMode === 'custom') {
            // 2. å¾??ªå»º?²ç«¯ ?‡æ????¬æ?
            currentCompileMode = 'local';
            btn.innerHTML = "?? ?¬æ?ç·¨è­¯";
            btn.style.color = "var(--success)"; // ç¶ è‰²
            btn.style.borderColor = "var(--success)";

        } else {
            // 3. å¾??¬æ? ?‡æ????²ç«¯ (Wandbox)
            currentCompileMode = 'wandbox';
            btn.innerHTML = "?ï? ?²ç«¯ç·¨è­¯";
            btn.style.color = "var(--accent)"; // ?è‰²
            btn.style.borderColor = "var(--accent)";
        }
    }

    function parseContent(text) { 
        if (!text) return ""; 
    
        // 1. ?ˆå? HTML ?¹æ?ç¬¦è?è½‰ç¾©ï¼Œç¢ºä¿å???
        let escaped = text.replace(/&/g, "&amp;")
                          .replace(/</g, "&lt;")
                          .replace(/>/g, "&gt;")
                          .replace(/"/g, "&quot;")
                          .replace(/'/g, "&#039;"); 
    
        // 2. ?•ç?ç²—é?ï¼šåª??**ä¸­é??‰æ?å­?* ?æ?è§¸ç™¼??
        // æ¸›è? (-) ?‡å–®?‹æ???(*) ? ç‚ºæ²’æ?å°æ?è¦å?ï¼Œæ??Ÿæ¨£è¼¸å‡º
        const boldRegex = /\*\*(.+?)\*\*/g;
        let html = escaped.replace(boldRegex, "<strong style='color: #282f3b;'>$1</strong>");
    
        // 3. ?•ç??–ç?èªæ? ![Alt](URL)
        const imageRegex = /!\[(.*?)\]\((.*?)\)/g; 
        html = html.replace(imageRegex, (match, alt, url) => { 
            return `<img src="${url}" alt="${alt}">`; 
        }); 
    
        // 4. ?€å¾Œå? \n ?›è?è½‰æ?ç¶²é?æ¨™ç±¤
        return html.replace(/\n/g, "<br>"); 
    }

    function resetCode() { 
        if (!confirm("?ç½®ç¨‹å?ç¢¼åˆ°?å?æ¨¡æ¿ï¼Ÿé€™å??ƒé??Ÿæœ¬é¡Œç??€?‰æ?æ¡ˆã€?)) return; 
        
        const p = db.problems.find(x => x.id === currentProbId); 
        const lang = document.getElementById('langSelect').value;
        
        if (lang === 'cpp') { 
            // ?¯æ´ç©ºå?ä¸²é???
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
            alert("æ²’æ?ç¨‹å?ç¢¼å¯ä»¥è?è£½ï?"); 
            return; 
        } 
        
        navigator.clipboard.writeText(code).then(() => { 
            alert("??ç¨‹å?ç¢¼å·²è¤‡è£½?°å‰ªè²¼ç°¿ï¼?); 
        }).catch(() => { 
            const ta = document.createElement("textarea"); 
            ta.value = code; 
            document.body.appendChild(ta); 
            ta.select(); 
            document.execCommand("copy"); 
            document.body.removeChild(ta); 
            alert("??ç¨‹å?ç¢¼å·²è¤‡è£½?°å‰ªè²¼ç°¿ï¼?); 
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
        
        // --- ?‹å?å¥—ç”¨ UI ä¸Šç??°è¨­å®?---
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
        // --- å¥—ç”¨?°è¨­å®šç???---

        // ?’¡ ?¸å?ä¿®æ­£ï¼šç?å¾…é›²ç«¯å??å??è·³è½?
        const btn = document.querySelector('#view-admin .btn-primary');
        if (btn) { btn.disabled = true; btn.innerText = "???²å?ä¸?.."; }
        await saveToLocal(true, false); 
        
        // ?? ?œéµä¿®å¾©ï¼šæ?ä¿®æ”¹å¾Œç??´ä»½é¡Œç›®ç´°ç?ï¼ˆå«?˜è¿°?æ¸¬è³‡ï??¨ç??™ä»½??Firebase
        // ?¿å?ä¸»å?æª”è???1MB å®¹é??åˆ¶?‚ï??æ–°?´ç??ƒè??–åˆ°?Šç??™ä»½è³‡æ?ï¼Œå??´æ?è¿°è??ã€Œè?è¼¸å…¥é¡Œç›®?è¿°...??
        await syncProblemDeltaToCloud(currentProbId, p);

        if (btn) { btn.disabled = false; btn.innerText = "?’¾ ?²å?ä¸¦è???; }
        history.back(); 
    }
    

    function insertBoldToDesc() {
        const descArea = document.getElementById('editDesc');
        const start = descArea.selectionStart;
        const end = descArea.selectionEnd;
        const text = descArea.value;
    
        if (start !== end) {
            // å°‡é¸?–ç??‡å??…ä?
            const selectedText = text.substring(start, end);
            descArea.value = text.substring(0, start) + "**" + selectedText + "**" + text.substring(end);
            descArea.selectionStart = start + 2;
            descArea.selectionEnd = end + 2;
        } else {
            // ?’å…¥ç©ºè?æ³•ä¸¦å®šä?æ¸¸æ?
            descArea.value = text.substring(0, start) + "****" + text.substring(end);
            descArea.selectionStart = descArea.selectionEnd = start + 2;
        }
        descArea.focus();
    }
    
    function insertImageToDesc() { 
        const url = prompt("è«‹è¼¸?¥å??‡ç¶²?€ (URL)ï¼?, "https://"); 
        if (url) { 
            const descArea = document.getElementById('editDesc'); 
            descArea.value += `\n\n![?–ç?](${url})\n\n`; 
            descArea.focus(); 
        } 
    }

    function insertImageURL() { insertImageToDesc(); } 
    
    function handleLocalImageUpload() { 
        const fileInput = document.getElementById('localImgInput'); 
        const file = fileInput.files[0]; 
        if (!file) return; 
        
        if (file.size > 2 * 1024 * 1024) { 
            alert("? ï? ?–ç??å¤§ï¼å»ºè­°ä½¿??2MB ä»¥ä??„å??‡ï?ä»¥å??è¦½?¨å¡?“ã€?); 
        } 
        
        const reader = new FileReader(); 
        reader.onload = function(e) { 
            const descArea = document.getElementById('editDesc'); 
            descArea.value += `\n\n![?¬åœ°?–ç?](${e.target.result})\n\n`; 
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
        
        // ç²¾æ?ä¸Šå‚³å±€?¨ä¿®?¹ï?ä¸¦åªå­?dbData ä¸å? History
        saveToLocal(true, false); 
        syncProblemDeltaToCloud(currentProbId, { modelAnswer: p.modelAnswer });
    }
    
    function copyModelAnswer() { 
        const text = document.getElementById('modelAnswerInput'); 
        if (!text.value.trim()) { 
            alert("æ²’æ?ç¤ºç?è§???¯ä»¥è¤‡è£½ï¼?); 
            return; 
        } 
        text.select(); 
        document.execCommand('copy'); 
        alert("??ç¤ºç?è§??å·²è?è£½ï?"); 
    }

    async function pasteModelAnswer() { 
        try { 
            const text = await navigator.clipboard.readText(); 
            document.getElementById('modelAnswerInput').value = text; 
            alert("??å·²è²¼ä¸Šè§£ç­”ï?"); 
        } catch (err) { 
            alert("? ï? ?è¦½?¨é˜»?‹æ??¡æ?è®€?–å‰ªè²¼ç°¿ï¼Œè??´æ¥?¨æ?å­—æ?ä¸­æ? Ctrl+V è²¼ä???); 
        } 
    }

    async function runCode() {
        const p = db.problems.find(x => x.id === currentProbId); 
        if (!p.testCases || p.testCases.length === 0) { 
            alert("?¡æ¸¬è³?); 
            return; 
        }
        
        const btn = document.getElementById('runBtn'); 
        const logs = document.getElementById('outputLogs'); 
        const lang = document.getElementById('langSelect').value; 
        
        // ?²å??¶å?ç·¨è¼¯?¨å…§?„ç?å¼ç¢¼?°è??¸ä¸­
        if (lang === 'cpp' && p.isMultiFile) {
            if (currentFileIndex === -1) p.code_cpp = editor.getValue();
            else p.multiFiles[currentFileIndex].code = editor.getValue();
        } else { 
            p['code_' + lang] = editor.getValue(); 
        }
        
        const mainCode = (lang === 'cpp' && p.isMultiFile) ? p.code_cpp : editor.getValue();

        // ?´ç?å¤šæ?æ¡ˆè??™ï?æº–å??³é€çµ¦ç·¨è­¯ä¼ºæ???
        let wandboxCodes = [];
        let localExtraFiles = [];
        let extraCppFiles = []; // ?ä¿®æ­??‘ç??„é?å¤–ç? .cpp æª”æ??ç¨±ä¾?Wandbox ç·¨è­¯???ä½¿ç”¨

        if (lang === 'cpp' && p.isMultiFile && p.multiFiles) {
            p.multiFiles.forEach(f => {
                wandboxCodes.push({ file: f.name, code: f.code || "" });
                localExtraFiles.push({ name: f.name, content: f.code || "" });
                
                // ?¾å‡º .cpp ??.c çµå°¾?„é?å±¬æ?æ¡?
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
                    // æ¨¡å? Aï¼šå…¬?±é›²ç«?(Wandbox)
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
                        tempDiv.innerHTML = `<div class="log-header" style="color:var(--fail)">??Case ${i+1}: ç·¨è­¯?¯èª¤</div><div class="log-details"><pre style="color:#f44747; margin:0;">${res.compiler_error || res.compiler_message}</pre></div>`;
                        const stopDiv = document.createElement('div'); 
                        stopDiv.style.textAlign = "center"; 
                        stopDiv.style.padding = "10px"; 
                        stopDiv.style.color = "#aaa"; 
                        stopDiv.innerHTML = "? ï? ? ç·¨è­¯å¤±?—ï?å·²ç?æ­¢å?çºŒæ¸¬è©¦ã€?; 
                        logs.appendChild(stopDiv);
                        isCompileError = true; 
                        break; 
                    }
                    if (res.status !== "0" && res.program_error) { 
                        tempDiv.innerHTML = `<div class="log-header" style="color:var(--fail)">??Case ${i+1}: ?·è??¯èª¤</div><div class="log-details"><pre style="color:#f44747; margin:0;">${res.program_error}</pre></div>`; 
                        continue; 
                    }
                    act = (res.program_message || "").trim();

                } else {
                    // æ¨¡å? B & Cï¼šä½¿?¨ä???Python Server (?¬æ???Render ?²ç«¯)
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

                        // ?”´ ?œéµé»ï??¹æ?æ¨¡å?æ±ºå??®æ?ç¶²å?
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
                            if (res.type === 'ç·¨è­¯?¯èª¤') { 
                                const stopDiv = document.createElement('div'); 
                                stopDiv.style.textAlign = "center"; 
                                stopDiv.style.padding = "10px"; 
                                stopDiv.style.color = "#aaa"; 
                                stopDiv.innerHTML = "? ï? ? ç·¨è­¯å¤±?—ï?å·²ç?æ­¢å?çºŒæ¸¬è©¦ã€?; 
                                logs.appendChild(stopDiv); 
                                isCompileError = true; 
                                break; 
                            }
                            continue;
                        }
                        act = (res.output || "").trim();
                    } catch (err) { 
                        if (err.name === 'AbortError') throw err; // è®“å?å±?catch ?•ç?è¶…æ?
                        tempDiv.innerHTML = `<div class="log-header" style="color:var(--fail)">??Case ${i+1}: ?¡æ?????³ä¼º?å™¨</div><div class="log-details" style="color:#aaa; font-size:0.85rem;">è«‹ç¢ºèª?${currentCompileMode === 'local' ? '?¬æ?' : '?²ç«¯'} ä¼ºæ??¨æ˜¯?¦å·²?Ÿå???/div>`; 
                        isCompileError = true; 
                        break; 
                    }
                }

                // --- ?¢å¾©ï¼šå??¬ç”¨ä¾†åˆ¤?·ç?æ¡ˆå??¯ç??è¼¯ ---
                let pass = act.replace(/\r\n/g, "\n") === exp.replace(/\r\n/g, "\n");
                if (pass) passCount++;
                
                let statusHtml = pass ? `<span style="color:var(--success)">??Case ${i+1}: ?šé?æ¸¬è©¦ (Accepted)</span>` : `<span style="color:var(--fail)">??Case ${i+1}: ç­”æ??¯èª¤ (Wrong Answer)</span>`;
                let actStyle = pass ? "color:#fff; border-left-color:var(--success);" : "color:var(--warning); border-left-color:var(--fail);";
                
                tempDiv.innerHTML = `<div class="log-header">${statusHtml}</div><div class="log-details"><div class="log-label">è¼¸å…¥ (Input):</div><div class="log-value">${inputData}</div><div class="log-label">?æ?è¼¸å‡º (Expected):</div><div class="log-value">${exp}</div><div class="log-label">?¨ç?è¼¸å‡º (Actual):</div><div class="log-value" style="${actStyle}">${act || "(?¡è¼¸??"}</div></div>`;

            } catch(e) { 
                if (e.name === 'AbortError') {
                    tempDiv.innerHTML = `<div style="color:var(--fail)">??Case ${i+1}: ?·è?è¶…æ? (Timeout)</div><div class="log-details" style="color:#aaa; font-size:0.85rem;">?·è?è¶…é? 15 ç§’å·²è¢«ç³»çµ±å¼·?¶ä¸­?·ã€?br>?¯èƒ½?Ÿå?ï¼šç?å¼ç¢¼?·å…¥?Œç„¡çª®è¿´?ˆã€æ?ä¼ºæ??¨ç„¡?æ???/div>`; 
                } else {
                    tempDiv.innerHTML = `<div style="color:var(--fail)">??Case ${i+1}: ç¶²è·¯????¯èª¤</div><div class="log-details" style="color:#aaa; font-size:0.85rem;">?¡æ?????³ç·¨è­¯ä¼º?å™¨ï¼Œè?æª¢æŸ¥ç¶²è·¯?€?‹ã€?/div>`; 
                }
                isCompileError = true; 
                break; 
            }
        } // for è¿´å?çµæ?

        let finalStatus = "";
        if (isCompileError) { 
            finalStatus = `<span style="color:var(--fail)">??ç·¨è­¯?–é€??å¤±æ?</span>`; 
        } else if (passCount === p.testCases.length) { 
            finalStatus = `<span style="color:var(--success)">???¨æ•¸?šé? (${passCount}/${p.testCases.length})</span>`; 
        } else { 
            finalStatus = `<span style="color:var(--warning)">? ï? ?¨å??šé? (${passCount}/${p.testCases.length})</span>`; 
        }

        // å°‡æ??‰æ?æ¡ˆç??§å®¹?´å?å­˜å…¥æ­·å²ç´€?„ï??¹ä¾¿?é ­æª¢è?
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
        
        // ?ä¿®æ­?ï¼šä??ä??³æ•´?‹é?åº«ï??…æ›´?°æœ¬æ©?LocalStorage ?‡é›²ç«¯å??¨ç?ç¨‹å?ç¢¼è?æ­·å²ç´€?„ã€?
        const historyString = JSON.stringify(executionHistories);
        localStorage.setItem('oj_v15_history', historyString);
        localStorage.setItem('oj_v15_data', JSON.stringify(db)); // ?…æ›´?°æœ¬æ©Ÿé?åº«æš«å­?

        if (currentUser) {
            try {
                // ?ä¿®?¹ã€‘ï??…å?æ­·å²ç´€?„å?æ­¥åˆ°?²ç«¯ï¼Œä??å??Œä?ç­”ç?å¼ç¢¼?å¯«??customProblems
                await personalDb.collection('users').doc(currentUser.uid).set({
                     historyData: historyString,
                     lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });

            } catch(e) {
                console.error("?²ç«¯æ­·å²ç´€?„å?æª”å¤±??", e);
            }
        }

        btn.disabled = false; 
        btn.innerText = "?¶ï? ?·è?";
    }

    function openHistoryModal() {
        const histList = executionHistories[currentProbId] || []; 
        const listDiv = document.getElementById('historyList'); 
        document.getElementById('historyCodeView').value = ""; 
        listDiv.innerHTML = "";
        
        if (histList.length === 0) { 
            listDiv.innerHTML = "<div style='color:#666; text-align:center; padding:30px; font-size:1.1rem;'>å°šç„¡?·è?ç´€??/div>"; 
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
        if (!confirm("ç¢ºå?è¦æ?ç©ºé€™é??„æ??‰æ­·?²åŸ·è¡Œç??„å?ï¼Ÿæ­¤?•ä??¡æ?å¾©å???)) return; 
        delete executionHistories[currentProbId]; 
        
        // ?…æ›´?°æ­·?²ç??„ï?ä¸å½±?¿é?åº«ä¸»é«?
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

        //å¾æœ¬?°æš«å­˜é??°è??–ä?æ¬¡æ??°ç???
        const freshHistory = localStorage.getItem('oj_v15_history');
        if (freshHistory) {
            try { 
                executionHistories = JSON.parse(freshHistory); 
            } catch(e) {}
        }

        // ?–å??®å??†é??„å?ç¨±ä»¥é¡¯ç¤º?¨æ?ç¤ºè??¯ä¸­
        const cat = db.categories.find(c => c.id === currentCatId);
        const catName = cat ? cat.name : "æ­¤å?é¡?;

        if (!confirm(`? ï? è­¦å?ï¼šç¢ºå®šè?æ¸…ç©º??{catName}?å…§?€?‰é??®ç??æ­·?²åŸ·è¡Œç??„ã€‘å?ï¼Ÿ\næ­¤å?ä½œç„¡æ³•å¾©?Ÿï?`)) return;

        // ?¾å‡º?™å€‹å?é¡ä??„æ??‰é???
        const catProblems = db.problems.filter(p => p.catId === currentCatId);
        let deletedCount = 0;

        // ?ªé™¤?™ä?é¡Œç›®??executionHistories ä¸­ç?ç´€??
        catProblems.forEach(p => {
            // ? ä??·åº¦?¤æ–·ï¼Œç¢ºä¿è£¡?¢ç??„æ?ç´€?„æ?ç®—æ•¸
            if (executionHistories[p.id] && executionHistories[p.id].length > 0) {
                delete executionHistories[p.id];
                deletedCount++;
            }
        });

        if (deletedCount === 0) {
            alert("?¬å?é¡ç›®?æ??‰ä»»ä½•æ­·?²åŸ·è¡Œç??„å¯ä»¥æ?ç©ºã€?);
            return;
        }

        // ?´æ–°?¬åœ°ç«¯ç??²å?ç´€??
        const historyString = JSON.stringify(executionHistories);
        localStorage.setItem('oj_v15_history', historyString);

        // ?Œæ­¥?´æ–°??Firebase ?²ç«¯
        if (currentUser) {
            try {
                await personalDb.collection('users').doc(currentUser.uid).set({
                    historyData: historyString
                }, { merge: true });
                alert(`??å·²æ??Ÿæ?ç©ºæœ¬?†é?ä¸?${deletedCount} é¡Œç??·è?ç´€?„ï?`);
            } catch (e) {
                console.error("?²ç«¯æ¸…é™¤æ­·å²ç´€?„å¤±??, e);
                alert("? ï? ?¬åœ°ç´€?„å·²æ¸…é™¤ï¼Œä??²ç«¯?Œæ­¥å¤±æ???);
            }
        } else {
            alert(`??å·²æ??Ÿæ?ç©ºæœ¬?†é?ä¸?${deletedCount} é¡Œç??·è?ç´€?„ï?`);
        }
    }    

    function openAIHelperModal() {
        const p = db.problems.find(x => x.id === currentProbId); 
        const lang = document.getElementById('langSelect').value; 
        
        // ç¢ºä??®å?ç·¨è¼¯?¨å…§å®¹æ?å­˜åˆ°è®Šæ•¸è£?
        if (lang === 'cpp' && p.isMultiFile) {
            if (currentFileIndex === -1) p.code_cpp = editor.getValue();
            else p.multiFiles[currentFileIndex].code = editor.getValue();
        } else {
            p['code_' + lang] = editor.getValue();
        }

        // ?ä¿®æ­?ï¼šè? AI ?½æ??–æ??‰æ?æ¡ˆå…§å®¹ã€?
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
            alert("ç¨‹å?ç¢¼ç‚ºç©ºï??¡æ??†æ???); 
            return; 
        }
        
        document.getElementById('aiPromptOutput').value = `è«‹æ?ä»»ç?å¼è¨­è¨ˆåŠ©?™ï?å¹«æ?æª¢æŸ¥ä»¥ä?ç¨‹å?ç¢¼ç??è¼¯?¯å¦æ­?¢ºï¼Œä¸¦çµ¦ä?ä¿®æ­£å»ºè­°ï¼ˆè??¨ç?é«”ä¸­?‡å?ç­”ï?ï¼š\n\n?é??®å?ç¨±ã€‘ï?${p.title}\n?é??®æ?è¿°ã€‘ï?\n${p.desc}\n\n?æ??„ç?å¼ç¢¼?‘ï?\n\`\`\`${lang}\n${fullCode}\n\`\`\``; 
        document.getElementById('aiHelperModal').style.display = 'flex';
    }

    function copyPromptOnly() { 
        const text = document.getElementById('aiPromptOutput'); 
        text.select(); 
        document.execCommand('copy'); 
        alert("???§å®¹å·²è?è£½ï?"); 
        document.getElementById('aiHelperModal').style.display = 'none'; 
    }

    function copyPromptAndOpenGemini() { 
        const text = document.getElementById('aiPromptOutput'); 
        text.select(); 
        document.execCommand('copy'); 
        alert("?? ?§å®¹å·²è?è£½ï?\n?³å??ºæ‚¨?“é? Gemini??); 
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
        let filename = prompt("è«‹è¼¸?¥æ?æ¡ˆå?ç¨?(?¡é??¯æ???:", `oj_backup_${date}`); 
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
                    alert("æª”æ??¼å??¯èª¤"); 
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
        alert("å·²è?è£?); 
    }

    async function execRestore() { 
        try { 
            const data = JSON.parse(decodeURIComponent(atob(document.getElementById('backupStr').value))); 
            if (data.categories && data.problems) { 
                const catCount = data.categories.length || 0;
                const probCount = data.problems.length || 0;
                
                if (!confirm(`? ï? æº–å??„å?é¡Œåº« ? ï?\n\n?¨å³å°‡åŒ¯?¥ç??™ä»½æª”å??«ï?\n- ${catCount} ?‹å?é¡\n- ${probCount} ?“é??®\n\n?è­¦?Šã€‘æ­¤?ä?å°‡æ??Œå??¨è??‹ã€æ‚¨?®å??„æœ¬?°é?åº«è??™ï?\nç¢ºå?è¦ç¹¼çºŒé??Ÿå?ï¼Ÿ`)) {
                    return;
                }

                let defaultName = pendingRestoreFileName || "?ªè??„å?é¡Œåº«"; 
                let finalName = prompt("è«‹ç‚º?™å€‹é??Ÿç?é¡Œåº«?½å?ï¼?, defaultName); 
                
                if (finalName === null) return; 
                if (finalName.trim() === "") finalName = "?ªè??„å?é¡Œåº«"; 
                
                const preservedCustomBanks = db.customBanks || [];
                db.categories = data.categories;
                db.problems = data.problems;
                db.version = data.version || "";
                db.customBanks = preservedCustomBanks;

                // å¦‚æ??¨è‡ªè¨‚é?åº«ä¸­?„å?ï¼Œé?ä¾¿æ›´?°è©²?ªè?é¡Œåº«?ç¨±
                const isCustom = currentBankUrl && currentBankUrl.startsWith("local_custom_");
                if (isCustom) {
                    const customId = currentBankUrl.replace("local_custom_", "");
                    const bankIdx = db.customBanks.findIndex(b => b.id === customId);
                    if (bankIdx !== -1) {
                        db.customBanks[bankIdx].name = finalName;
                        db.customBanks[bankIdx].categories = JSON.parse(JSON.stringify(db.categories));
                        db.customBanks[bankIdx].problems = JSON.parse(JSON.stringify(db.problems));
                        
                        // ?’¡ å¼·åˆ¶å°‡é??Ÿç?é¡Œåº«å¯«å…¥å­é???
                        if (currentUser && personalDb) {
                            try {
                                personalDb.collection('users').doc(currentUser.uid).collection('customBanks').doc(customId).set(db.customBanks[bankIdx]);
                            } catch(e) {}
                        }
                    }
                } else if (currentUser && personalDb) {
                    // ?? ?å??è¨­é¡Œåº«?„é??Ÿä¿®å¾©ï?å¿…é?å°‡é??Ÿé€²ä??„é??®è??†é?ï¼Œæ‰¹æ¬¡å?æ­¥åˆ° Firebase ?„ç¨ç«‹ä??ªç®±
                    let payload = {};
                    let customCatUpdates = {};
                    let customProbUpdates = {};

                    // 1. ?“å??²ç«¯?¾æ?è³‡æ?ï¼Œæ‰¾?ºã€Œå¹½?ˆæ?æ¡ˆã€ï??Ÿæœ¬?¨é›²ç«¯ï?ä½†é??Ÿæ?è£¡æ??‰ç?é¡Œç›®/?†é?ï¼‰ä¸¦æ¨™è??ºåˆª??
                    try {
                        const docSnap = await personalDb.collection('users').doc(currentUser.uid).get();
                        if (docSnap.exists) {
                            const data = docSnap.data();
                            
                            // æ¸…ç?å¹½é??†é?
                            if (data.customCategories) {
                                Object.values(data.customCategories).forEach(cc => {
                                    if (cc && cc.bankUrl === currentBankUrl) {
                                        if (!db.categories.some(c => c.id === cc.id)) {
                                            customCatUpdates[cc.id] = firebase.firestore.FieldValue.delete();
                                        }
                                    }
                                });
                            }
                            
                            // æ¸…ç?å¹½é?é¡Œç›®ï¼šå??œé??®ç??†é?å±¬æ–¼?¶å?é¡Œåº«ï¼Œä??„å?æª”è£¡æ²’é€™é?ï¼Œå°±æ®ºæ?
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
                    } catch(e) { console.warn("?¡æ??“å??²ç«¯å¹½é?æª”æ?", e); }

                    // 2. å°‡é??Ÿé€²ä??„æ??‰é??®ç´°ç¯€ï¼ˆå«ä½œç?ç´€?„è??ªè?ä¿®æ”¹ï¼‰è?å¯«å??¨ç?ä¿éšªç®?
                    db.categories.forEach(c => {
                        if (c.isUserAdded) customCatUpdates[c.id] = c; 
                    });
                    
                    db.problems.forEach(p => {
                        customProbUpdates[p.id] = p;
                    });

                    if (Object.keys(customCatUpdates).length > 0) payload.customCategories = customCatUpdates;
                    if (Object.keys(customProbUpdates).length > 0) payload.customProblems = customProbUpdates;

                    // 3. ?¹æ¬¡å¯«å…¥ Firebase (?…å«?°å??‡åˆª?¤ç??‡ä»¤)
                    if (Object.keys(payload).length > 0) {
                        try {
                            await personalDb.collection('users').doc(currentUser.uid).set(payload, { merge: true });
                        } catch(e) { console.warn("?¨ç?ä¿éšªç®±æ‰¹æ¬¡é??Ÿå¤±??, e); }
                    }
                }
                
                currentBankName = finalName;
                localStorage.setItem('oj_v15_bank_name', finalName); 
                
                // ç­‰å?å­˜æ??‡é›²ç«¯å?æ­¥å???
                await saveToLocal(true, true); 
                
                alert("?„å??å?ï¼Œä¸¦å·²å?æ­¥è‡³?²ç«¯ï¼?);
                
                // ?’¡ ?–æ? window.location.reload()ï¼Œæ”¹?ºç›´?¥æ›´??UI
                document.getElementById('backupModal').style.display = 'none';
                
                const nameEl = document.getElementById('currentBankName');
                if (nameEl) nameEl.innerHTML = `<i class="fa-solid fa-folder-open" style="color: #60a5fa; margin-right: 8px;"></i> ?®å?é¡Œåº«: ` + currentBankName;
                
                currentCatId = null;
                renderCategoryList();
                if (currentView === 'view-problem-list') showView('view-categories');
            } else { 
                throw new Error(); 
            } 
        } catch(e) { 
            alert("ä»?¢¼?¡æ??–æ ¼å¼éŒ¯èª?); 
        } 
    }

    // ================= ä¸‹è?ç¨‹å?ç¢¼å???=================
    function downloadCode() {
        const p = db.problems.find(x => x.id === currentProbId);
        if (!p) return;

        const lang = document.getElementById('langSelect').value;

        // 1. ç¢ºä??¶å?ç·¨è¼¯?¨å…§?„ç?å¼ç¢¼?‰å³?‚å??¥è??¸ä¸­
        if (lang === 'cpp' && p.isMultiFile) {
            if (currentFileIndex === -1) p.code_cpp = editor.getValue();
            else p.multiFiles[currentFileIndex].code = editor.getValue();
        } else {
            p['code_' + lang] = editor.getValue();
        }

        // 2. æº–å?æª”å??ç¶´ï¼ˆé?æ¿¾æ?ä¸å?æ³•ç?æª”æ?å­—å?ï¼?
        const safeTitle = p.title.replace(/[\/\?<>\\:\*\|":\s]/g, "_");

        if (lang === 'cpp' && p.isMultiFile) {
            // --- ?•ç?å¤šæ?æ¡ˆæ???(ZIP) ---
            if (typeof JSZip === 'undefined') {
                alert("? ï? ?ªè???JSZip ?½å?åº«ï??¡æ??²è??“å???);
                return;
            }
        
            const zip = new JSZip();
        
            // ?¾å…¥ main.cpp
            zip.file("main.cpp", p.code_cpp || "");
        
            // ?¾å…¥?¶ä?æ¨™é ­æª”è?å¯¦ä?æª?(.h / .cpp)
            if (p.multiFiles) {
                p.multiFiles.forEach(f => {
                    zip.file(f.name, f.code || "");
                });
            }
        
            // ?¢ç?å£“ç¸®æª”ä¸¦è§¸ç™¼ä¸‹è?
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
            // --- ?•ç??®ä?æª”æ?ä¸‹è? ---
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

// ============= ä¸Šå‚³ç¨‹å?ç¢¼å???============

    async function handleCodeUpload(input) {
	const files = input.files;
	if (!files || files.length === 0) return;

	const p = db.problems.find(x => x.id === currentProbId);
	if (!p) return;

	const lang = document.getElementById('langSelect').value;
    
	// è®Šæ•¸æº–å?ï¼šç”¨ä¾†è??„ä??³é?ç¨‹ç??€??
	let successCount = 0;
	let failMessages = [];
	let needRenderTabs = false;

	// ?•ç??®ä? ZIP å£“ç¸®æª”ç??è¼¯ (ç¶­æ??Ÿæœ¬?„é˜²?†è?è§??ç¸®æ???
	if (files.length === 1 && files[0].name.toLowerCase().endsWith('.zip')) {
	const file = files[0];
	if (lang !== 'cpp' || !p.isMultiFile) {
	alert("? ï? ?®å??„é??®æ?èªè?æ¨¡å?ä¸æ”¯?´å?æª”æ?ï¼è?ä¸Šå‚³?®ä? .cpp ??.py æª”æ???);
	    input.value = ''; return;
	}
	if (typeof JSZip === 'undefined') {
	    alert("? ï? ?ªè???JSZip ?½å?åº«ï??¡æ?è®€?–å?ç¸®æ???);
	    input.value = ''; return;
	}
	if (!confirm("? ï? ä¸Šå‚³å°ˆæ?å°‡æ?è¦†è??¨ç›®?åœ¨?™å€‹é??®ç??€?‰ç?å¼ç¢¼ï¼Œç¢ºå®šè?ç¹¼ç??ï?")) {
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
		alert("? ï? å£“ç¸®æª”å…§?¾ä???main.cppï¼Œç„¡æ³•è??¥å?æ¡ˆï?");
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
	    alert("??ZIP å°ˆæ?ä¸Šå‚³ä¸¦è§£?æ??Ÿï?");

	} catch (e) {
	    console.error(e);
	    alert("? ï? è®€??ZIP æª”æ?å¤±æ?ï¼? + e.message);
	}
	input.value = '';
	return;
    }

    // ?•ç?å¤šå€‹ç¨ç«‹æ?æ¡ˆä??³ç??è¼¯ (å¦? main.cpp, Rectangle.cpp, Rectangle.h)
      // å°?FileReader ?…è???Promiseï¼Œæ–¹ä¾¿ç”¨ await å¾ªå??•ç?
      const readFileAsync = (file) => {
	return new Promise((resolve, reject) => {
	    const reader = new FileReader();
	    reader.onload = (e) => resolve(e.target.result);
	    reader.onerror = (e) => reject(e);
	    reader.readAsText(file);
	});
    };

      // å¾ªå?æª¢æŸ¥ä¸¦è??–æ??‹é¸?–ç?æª”æ?
      for (let i = 0; i < files.length; i++) {
	const file = files[i];
	const extension = file.name.split('.').pop().toLowerCase();

	// ?²å?æª¢æŸ¥ 1ï¼šè?è¨€ä¸ç¬¦
	if (lang === 'python' && extension !== 'py') {
	    failMessages.push(`??[${file.name}] Python æ¨¡å??ªèƒ½ä¸Šå‚³ .py æª”æ??‚`);
	    continue;
	}
	if (lang === 'cpp' && (extension === 'py' || extension === 'zip')) {
	    failMessages.push(`??[${file.name}] æª”æ??¼å??¯èª¤?‚`);
	    continue;
	}
        
	// ?²å?æª¢æŸ¥ 2ï¼šå–®æª”æ¨¡å¼å»?³ä? .h ?–å??‹æ?æ¡?
	if (!p.isMultiFile && (extension === 'h' || files.length > 1)) {
	    alert("? ï? ?®å??ºå–®ä¸€æª”æ?æ¨¡å?ï¼Œç„¡æ³•ä??³æ??­æ??–å??‹æ?æ¡ˆï?è«‹å??‹å?å¤šæ?æ¡ˆæ”¯?´ã€?);
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
		failMessages.push(`? ï? [${file.name}] é¡Œç›®?ªè¨­å®šæ­¤æª”æ??†é?ï¼Œå·²?¥é??‚`);
	    }
	}
     } else {
	// ?®ä?æª”æ?æ¨¡å??„è???
	if (lang === 'cpp') p.code_cpp = content;
	else p.code_python = content;
	editor.setValue(content, -1);
	successCount++;
    }
        } catch (error) {
            failMessages.push(`??[${file.name}] è®€?–å¤±?—ã€‚`);
        }
    }

    // æª”æ??½è??†å?å¾Œï?çµ±æ•´ä¸¦é¡¯ç¤ºç???
    if (needRenderTabs) renderWorkspaceTabs();

    if (failMessages.length === 0 && successCount > 0) {
	alert(`???å?è¼‰å…¥ ${successCount} ?‹æ?æ¡ˆï?`);
    } else if (failMessages.length > 0) {
	let msg = `è¼‰å…¥å®Œæ?ï¼Œä??‰éƒ¨?†ç?æ³ï?\n???å?: ${successCount} ?‹æ?æ¡ˆ\n\n`;
	msg += failMessages.join('\n');
	alert(msg);
    }

    // æ¸…é™¤ input ?€??
    input.value = '';
}


