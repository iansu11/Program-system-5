// ==========================================
// 雲端資料同步 & 自動更新機制 (js/db.js)
// ==========================================

window.addEventListener('personalCloudReady', () => {
    loadUserDataFromCloud(false);
});

async function loadUserDataFromCloud(isBackground = false) {
    if (!currentUser || !personalDb) {
        if (!isBackground) { window.isDbLoaded = true; window.dispatchEvent(new Event('dbLoaded')); }
        return;
    }
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
                
                // 🚀 救回遺失的自訂分類
                if (data.customCategories) {
                    Object.values(data.customCategories).forEach(cc => {
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

                // 🚀 救回遺失的自訂題目
                if (data.customProblems) {
                    Object.values(data.customProblems).forEach(cp => {
                        if (cp && cp.id) {
                            const existingP = db.problems.find(p => p.id == cp.id);
                            if (existingP) {
                                Object.assign(existingP, cp);
                            } else {
                                if (db.categories.some(c => c.id == cp.catId)) {
                                    db.problems.push(cp);
                                }
                            }
                        }
                    });
                }

                // 🛑 防呆機制：如果合併雲端進度後發現題庫依然是空的，代表本地快取或雲端存檔損毀，強制重新從伺服器抓取！
                if (db.categories.length === 0 && currentBankUrl) {
                    console.warn("偵測到題庫異常為空，正在重新拉取官方題庫...");
                    // 傳入 true 強制寫入雲端，以修復雲端損毀的紀錄
                    fetchAndLoadBank(currentBankUrl, currentBankName, true);
                    return; // 中斷，由 fetchAndLoadBank 負責後續的 reload 與 render
                }
            } else {
                // 【自訂題庫模式】：根據 ID 從 customBanks 倉庫中激活資料
                const customId = currentBankUrl.replace("local_custom_", "");
                const targetBank = db.customBanks.find(b => b.id === customId);
                if (targetBank) {
                    if (!isBackground) {
                        db.categories = JSON.parse(JSON.stringify(targetBank.categories || []));
                        db.problems = JSON.parse(JSON.stringify(targetBank.problems || []));
                        db.version = targetBank.version || "";
                    }
                }
            }
            
            if (data.historyData) executionHistories = JSON.parse(data.historyData);

            // 更新本地快取
            localStorage.setItem('oj_v15_data', JSON.stringify(db));
            localStorage.setItem('oj_v15_history', JSON.stringify(executionHistories));
        }

        if (!isBackground) {
            // 資料載入完成後發送事件，讓各頁面自行更新 UI
            window.isDbLoaded = true; window.dispatchEvent(new Event('dbLoaded'));
        }
        checkForUpdates();
    } catch (e) { 
        console.error("讀取雲端失敗：", e); 
        if (!isBackground) {
            window.isDbLoaded = true; window.dispatchEvent(new Event('dbLoaded'));
        }
    }
}

async function checkForUpdates() {
    if (!currentBankUrl || currentBankUrl.startsWith("local_custom_")) return; 
    
    const checkUrl = currentBankUrl; 
    try {
        const res = await fetch(checkUrl + '?t=' + new Date().getTime());
        if (res.ok) {
            const newDb = await res.json();
            if (newDb.version && newDb.version !== db.version) {
                newDb._sourceUrl = checkUrl; 
                pendingUpdateDb = newDb;
                
                // 通知 UI 顯示更新提示
                window.dispatchEvent(new CustomEvent('updateAvailable', { detail: pendingUpdateDb }));
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
        window.dispatchEvent(new Event('updateDismissed'));
        return;
    }

    const newDb = pendingUpdateDb;
    
    (newDb.categories || []).forEach(c => delete c.isUserAdded);
    (newDb.problems || []).forEach(p => delete p.isUserAdded);
    
    newDb.categories = newDb.categories || [];
    newDb.problems = newDb.problems || [];
    
    const userAddedCategories = db.categories.filter(oldC => !newDb.categories.some(newC => newC.id === oldC.id));
    const userAddedProblems = db.problems.filter(oldP => !newDb.problems.some(newP => newP.id === oldP.id));
    
    userAddedCategories.forEach(c => c.isUserAdded = true);
    userAddedProblems.forEach(p => p.isUserAdded = true);

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

    newDb.categories = [...newDb.categories, ...userAddedCategories];
    newDb.problems = [...newDb.problems, ...userAddedProblems];
    
    const preservedCustomBanks = db.customBanks || [];
    db = newDb; 
    db.customBanks = preservedCustomBanks;

    await saveToLocal(true, false);
    
    pendingUpdateDb = null;
    alert("✅ 題庫已成功同步至最新版本！"); 
    
    // 通知 UI 重新渲染
    window.isDbLoaded = true; window.dispatchEvent(new Event('dbLoaded'));
}

async function saveToLocal(syncDbToCloud = true, syncHistoryToCloud = true) { 
    const isCustom = currentBankUrl && currentBankUrl.startsWith("local_custom_");
    if (isCustom) {
        const customId = currentBankUrl.replace("local_custom_", "");
        const bankIdx = db.customBanks.findIndex(b => b.id === customId);
        if (bankIdx !== -1) {
            db.customBanks[bankIdx].categories = JSON.parse(JSON.stringify(db.categories));
            db.customBanks[bankIdx].problems = JSON.parse(JSON.stringify(db.problems));
        }
    }

    localStorage.setItem('oj_v15_data', JSON.stringify(db)); 
    localStorage.setItem('oj_v15_history', JSON.stringify(executionHistories));
    if (currentUser) localStorage.setItem('oj_v15_uid', currentUser.uid);

    if (!syncDbToCloud && !syncHistoryToCloud) return; 

    if (currentUser && personalDb) {
        try {
            let updatePayload = {
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            };

            if (syncDbToCloud) {
                const lightweightBanks = (db.customBanks || []).map(b => ({ id: b.id, name: b.name, version: b.version }));
                updatePayload.userCustomBanks = JSON.stringify(lightweightBanks);
                
                // 🚀 修復：確保所有的自訂題庫完整資料都被寫入雲端子集合
                const batch = personalDb.batch();
                (db.customBanks || []).forEach(b => {
                    const docRef = personalDb.collection('users').doc(currentUser.uid).collection('customBanks').doc(b.id);
                    batch.set(docRef, b);
                });
                await batch.commit();
                
                if (!isCustom) {
                    const safeKey = currentBankUrl ? currentBankUrl.replace(/[\.\#\$\[\]]/g, '_') : '';
                    if (safeKey) {
                        updatePayload.bankProgress = {
                            [safeKey]: JSON.stringify({
                                categories: db.categories,
                                problems: db.problems,
                                version: db.version
                            })
                        };
                        updatePayload.bankVersions = {
                            [safeKey]: db.version || "未記錄"
                        };
                    }
                }
            }

            if (syncHistoryToCloud) {
                updatePayload.historyData = JSON.stringify(executionHistories);
            }

            await personalDb.collection('users').doc(currentUser.uid).set(updatePayload, { merge: true });
            console.log("✅ 雲端分離儲存成功");
        } catch (e) { 
            console.error("雲端同步失敗：", e); 
        }
    }
}

async function syncProblemDeltaToCloud(probId, diff) {
    if (!currentUser) return;
    
    const isCustom = currentBankUrl && currentBankUrl.startsWith("local_custom_");
    if (isCustom) return; 

    let payload = { customProblems: {} };
    
    if (diff === null) {
        payload.customProblems[probId] = firebase.firestore.FieldValue.delete();
    } else {
        payload.customProblems[probId] = diff;
    }

    try {
        await personalDb.collection('users').doc(currentUser.uid).set(payload, { merge: true });
        console.log(`✅ 題目 ${probId} 局部更新至保險箱成功`);
    } catch(e) {
        console.error(`局部更新失敗: `, e);
    }
}

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
        console.log(`✅ 分類 ${catId} 局部更新至保險箱成功`);
    } catch(e) {
        console.error(`局部更新失敗: `, e);
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
            const onclickAttr = btn.getAttribute('onclick');
            if (onclickAttr && onclickAttr.includes(jsonUrl)) {
                clickedBtn = btn;
                originalContent = btn.innerHTML;
                btn.innerHTML = `<span style="font-size: 1.5rem; font-weight:bold;">⏳ 載入中...</span><span class="bank-desc">同步雲端資料</span>`;
            }
            btn.style.pointerEvents = 'none';
            btn.style.opacity = '0.6';
        });

        try {
            // 🚀 效能優化：平行化下載 GitHub 題庫與 Firebase 雲端進度
            // 加上時間戳記強制繞過瀏覽器的 404 快取
            const fetchPromise = fetch(jsonUrl + '?t=' + new Date().getTime()).then(res => {
                if (!res.ok) throw new Error("伺服器錯誤: " + res.status);
                return res.json();
            });
            const dbPromise = personalDb ? personalDb.collection('users').doc(currentUser.uid).get().catch(err => {
                console.warn("個人雲端讀取失敗，將跳過雲端合併", err);
                return null;
            }) : Promise.resolve(null);
            
            const [newDb, docSnap] = await Promise.all([fetchPromise, dbPromise]);
            
            (newDb.categories || []).forEach(c => delete c.isUserAdded);
            (newDb.problems || []).forEach(p => delete p.isUserAdded);
            
            newDb.categories = newDb.categories || [];
            newDb.problems = newDb.problems || [];
            
            let shouldSyncDb = forceReset;

            // --- 1. 從 Firebase 抓取你在這份題庫的「雲端歷史存檔」 ---
            let savedCategories = [];
            let savedProblems = [];
            const safeKey = jsonUrl.replace(/[\.\#\$\[\]]/g, '_');

            if (personalDb) {
                try {
                    if (docSnap && docSnap.exists) {
                        const data = docSnap.data();
                        if (data.bankProgress && data.bankProgress[safeKey]) {
                            const prog = JSON.parse(data.bankProgress[safeKey]);
                            savedCategories = prog.categories || [];
                            savedProblems = prog.problems || [];
                        }
                        
                        if (data.customCategories) {
                            Object.values(data.customCategories).forEach(cc => {
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

                        if (data.customProblems) {
                            Object.values(data.customProblems).forEach(cp => {
                                if (cp && cp.id) {
                                    const existingP = savedProblems.find(p => p.id == cp.id);
                                    if (existingP) {
                                        Object.assign(existingP, cp);
                                    } else {
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

            // --- 2. 篩選出純粹的「自訂擴充」 ---
            const userAddedCategories = savedCategories.filter(oldC => !newDb.categories.some(newC => newC.id === oldC.id));
            const userAddedProblems = savedProblems.filter(oldP => !newDb.problems.some(newP => newP.id === oldP.id));
            
            userAddedCategories.forEach(c => c.isUserAdded = true);
            userAddedProblems.forEach(p => p.isUserAdded = true);

            // --- 3. 處理預設題庫合併 ---
            const bankVersions = JSON.parse(localStorage.getItem('oj_v15_bank_versions') || '{}');
            const lastSyncedVersion = bankVersions[jsonUrl];
            const isUpdate = (!forceReset && newDb.version && lastSyncedVersion !== undefined && newDb.version !== lastSyncedVersion);

            if (forceReset || isUpdate) {
                shouldSyncDb = true; 
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
            window.location.href = 'dashboard.html';
            checkForUpdates();

        } catch (err) { 
            console.error(err);
            alert("載入失敗！請確認 GitHub 檔案是否存在\n\n詳細錯誤：" + err.message); 
            if (clickedBtn && originalContent) {
                clickedBtn.innerHTML = originalContent;
            }
        } finally {
            buttons.forEach(btn => {
                btn.style.pointerEvents = 'auto';
                btn.style.opacity = '1';
            });
        }
    }
