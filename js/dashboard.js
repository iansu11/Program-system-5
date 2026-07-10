var isCatSortMode = false;
var isProbSortMode = false;

// ==========================================
// 題庫大廳與分類列表邏輯 (js/dashboard.js)
// ==========================================

let currentCatId = null;
let currentView = 'view-source-selector';
let pendingRestoreFileName = "";
let problemToMoveId = null;

function updateLearningStats() {
    const solvedCountEl = document.getElementById('stats-solved-count');
    const totalCountEl = document.getElementById('stats-total-problems-count');
    const progressBar = document.getElementById('stats-progress-bar');
    
    let solvedCount = 0;
    if (solvedCountEl) {
        let history = {};
        try {
            history = JSON.parse(localStorage.getItem('oj_v15_history') || '{}');
        } catch(e) {}
        
        for (let probId in history) {
            const records = history[probId];
            if (records && records.length > 0) {
                const hasAC = records.some(r => r.status && (r.status.includes('全數通過') || r.status.includes('AC')));
                if (hasAC) solvedCount++;
            }
        }
        solvedCountEl.innerText = solvedCount;
    }
    
    let totalProblems = 0;
    
    // 計算自訂題庫的總題目數
    let totalCustomProblems = 0;
    if (typeof db !== 'undefined' && db && db.customBanks) {
        db.customBanks.forEach(b => {
            if (b.problems) totalCustomProblems += b.problems.length;
        });
    }
    
    // 計算預設題庫的總題目數 (利用 localStorage 緩存避免每次發送請求)
    let totalDefaultProblems = localStorage.getItem('oj_v15_total_default_problems');
    if (!totalDefaultProblems) {
        Promise.all([
            fetch('/program-1.json').then(r=>r.json()).catch(()=>({problems:[]})),
            fetch('/program-oop.json').then(r=>r.json()).catch(()=>({problems:[]})),
            fetch('/program-exam.json').then(r=>r.json()).catch(()=>({problems:[]}))
        ]).then(results => {
            let count = 0;
            results.forEach(res => {
                if (res.problems) count += res.problems.length;
            });
            localStorage.setItem('oj_v15_total_default_problems', count);
            // 重新呼叫以更新 UI
            updateLearningStats();
        });
        totalDefaultProblems = 0;
    } else {
        totalDefaultProblems = parseInt(totalDefaultProblems);
    }
    
    totalProblems = totalDefaultProblems + totalCustomProblems;
    
    if (totalCountEl) {
        // 如果還在非同步抓取中且無緩存，先顯示載入中或目前的自訂數
        totalCountEl.innerText = totalProblems > 0 ? totalProblems : (totalDefaultProblems === 0 ? '載入中...' : 0);
    }
    
    if (progressBar) {
        let progress = totalProblems > 0 ? Math.round((solvedCount / totalProblems) * 100) : 0;
        if (progress > 100) progress = 100;
        progressBar.style.width = progress + '%';
        // 可選：如果你希望進度條上顯示文字，可以加這裡，不過目前只有線條
    }
}

function showView(viewId) {
    currentView = viewId;
    const views = ['view-source-selector', 'view-portal', 'view-custom-portal', 'view-categories', 'view-problem-list', 'view-login'];
    views.forEach(v => {
        const el = document.getElementById(v);
        if (el) {
            if (v === viewId) {
                if (v === 'view-login') {
                    el.style.display = 'flex';
                    document.body.style.backgroundColor = '#232731';
                } else {
                    el.style.display = 'block';
                    document.body.style.backgroundColor = '#E2E8F0';
                }
            } else {
                el.style.display = 'none';
            }
        }
    });
}

function navigateTo(path) {
    history.pushState(null, '', path);
    handleRouteChange();
}

function handleRouteChange() {
    let path = window.location.pathname;
    const urlParams = new URLSearchParams(window.location.search);

    // Normalize paths
    if (path === '/' || path === '/dashboard.html') {
        path = '/source-selector';
    }

    if (path === '/source-selector') {
        updateLearningStats();
        showView('view-source-selector');
    }
    else if (path === '/portal') {
        if (typeof renderRecentSubmissions === 'function') renderRecentSubmissions();
        showView('view-portal');
    }
    else if (path === '/custom-portal') {
        renderCustomPortal();
        showView('view-custom-portal');
    }
    else if (path === '/categories') {
        if (!currentBankUrl) {
            navigateTo('/source-selector');
            return;
        }
        currentCatId = null;
        
        const nameEl = document.getElementById('currentBankName');
        if (nameEl) nameEl.innerHTML = `<i class="fa-solid fa-folder-open" style="color: #60a5fa; margin-right: 8px;"></i> 目前題庫: ` + currentBankName;
        
        renderCategoryList();
        showView('view-categories');
    }
    else if (path.match(/^\/categories\/([a-zA-Z0-9_-]+)\/problems$/)) {
        if (!currentBankUrl) {
            navigateTo('/source-selector');
            return;
        }
        const match = path.match(/^\/categories\/([a-zA-Z0-9_-]+)\/problems$/);
        const catId = match[1];
        if (catId) {
            currentCatId = catId;
            
            const cat = db.categories.find(c => c.id == currentCatId);
            const catTitleEl = document.getElementById('currentCatTitle');
            if (catTitleEl) {
                catTitleEl.innerHTML = `<i class="fa-solid fa-list-check" style="color: #60a5fa; margin-right: 8px;"></i> ` + (cat ? cat.name : "未知分類");
            }
            
            renderProblemList();
            showView('view-problem-list');
        } else {
            navigateTo('/categories');
        }
    }
}

window.addEventListener('popstate', handleRouteChange);

function initDashboard() {
    const path = window.location.pathname;
    if (path === '/' || path === '/dashboard.html') {
        navigateTo('/source-selector');
    } else {
        handleRouteChange();
    }
}

if (window.isDbLoaded) {
    initDashboard();
} else {
    window.addEventListener('dbLoaded', initDashboard);
}

function openDefaultBank() {
    currentBankUrl = "/db.json";
    currentBankName = "官方預設題庫";
    localStorage.setItem('oj_v15_bank_url', currentBankUrl);
    localStorage.setItem('oj_v15_bank_name', currentBankName);
    navigateTo('/categories');
}

function renderCustomBankPortal() {
    const grid = document.getElementById('customBankGrid');
    if (!grid) return;
    grid.innerHTML = '';
    
    // 從 db.customBanks 渲染
    (db.customBanks || []).forEach(bank => {
        const btn = document.createElement('div');
        btn.className = 'bank-btn';
        btn.innerHTML = `
            <i class="fa-solid fa-book" style="font-size: 2rem; color: #60a5fa;"></i>
            <span>${bank.name}</span>
            <span class="bank-desc">自訂題庫</span>
            
            <div class="bank-actions">
                <button class="prob-btn-icon prob-edit-btn" onclick="event.stopPropagation(); editCustomBank('${bank.id}', '${bank.name}')" title="編輯名稱">
                    <i class="fa-solid fa-pen"></i>
                </button>
                <button class="prob-btn-icon prob-del-btn" onclick="event.stopPropagation(); deleteCustomBank('${bank.id}')" title="刪除題庫">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        `;
        btn.onclick = () => loadBank("local_custom_" + bank.id, bank.name);
        grid.appendChild(btn);
    });

    const createBtn = document.createElement('div');
    createBtn.className = 'bank-btn';
    createBtn.style.border = '2px dashed #60a5fa';
    createBtn.style.background = 'transparent';
    createBtn.style.color = 'white';
    createBtn.innerHTML = `
        <i class="fa-solid fa-plus" style="font-size: 2rem;"></i>
        <span>建立新題庫</span>
    `;
    createBtn.onclick = createNewCustomBank;
    grid.appendChild(createBtn);
}

function loadBank(url, name) {
    currentBankUrl = url;
    currentBankName = name;
    localStorage.setItem('oj_v15_bank_url', currentBankUrl);
    localStorage.setItem('oj_v15_bank_name', currentBankName);
    navigateTo('/categories');
}

function goBackToSourceSelector() {
    navigateTo('/source-selector');
}

function renderCategoryList() {
    const list = document.getElementById('categoryList');
    if (!list) return;
    list.innerHTML = '';
    db.categories.forEach((cat, index) => {
        const div = document.createElement('div');
        div.className = 'cat-card';
        div.draggable = isCatSortMode; 
        div.dataset.index = index; 

        const probCount = db.problems.filter(p => p.catId == cat.id).length;
        div.innerHTML = `
            <div class="cat-title">${cat.name}</div>
            <div class="cat-count"><i class="fa-solid fa-list"></i> ${probCount} 題</div>
            <div class="cat-actions">
                <button class="btn btn-outline btn-sm" onclick="event.stopPropagation(); editCategory(${cat.id}, '${cat.name}')"><i class="fa-solid fa-pen"></i></button>
                <button class="btn btn-danger btn-sm" onclick="event.stopPropagation(); deleteCategory(${cat.id})"><i class="fa-solid fa-trash"></i></button>
            </div>
        `;
        div.onclick = () => {
            if (!isCatSortMode) {
                navigateTo('/categories/' + cat.id + '/problems');
            }
        };
        list.appendChild(div);
    });
    if (isCatSortMode) {
        enableDragSort('categoryList', 'cat-card', saveCategoryOrder);
    }
}

function renderProblemList() {
    const list = document.getElementById('probListContainer');
    if (!list) return;
    list.innerHTML = '';
    const filtered = db.problems.filter(p => p.catId == currentCatId);
    
    filtered.forEach((p) => {
        const div = document.createElement('div');
        div.className = 'prob-item';
        div.draggable = isBankSortMode; 
        div.dataset.id = p.id; 
        
        let statusIcon = '<i class="fa-regular fa-circle" style="color:#ccc;"></i>';
        let historyKey = `${currentBankUrl}_${p.id}`;
        if (!executionHistories[historyKey] && executionHistories[p.id]) {
            historyKey = p.id;
        }
        if (executionHistories[historyKey] && executionHistories[historyKey].length > 0) {
            const h = executionHistories[historyKey];
            // Since pass property doesn't exist in V5 workspace.js, we check the latest run's status
            let latestRun = h[0];
            if (latestRun.status && (latestRun.status.includes('全數通過') || latestRun.status === 'AC')) {
                statusIcon = '<i class="fa-solid fa-circle-check" style="color:var(--success);"></i>';
            } else {
                statusIcon = '<i class="fa-solid fa-circle-xmark" style="color:var(--fail);"></i>';
            }
        }

        const previewText = (p.desc || "").substring(0, 50).replace(/#/g, '') + "...";

        div.innerHTML = `
                <div style="display:flex; align-items:center; gap:15px; flex:1; min-width:0;">
                    <div style="flex:1; min-width:0;">
                        <a href="/workspace/${p.id}" target="_blank" class="prob-title" style="text-decoration:none; color:inherit; display:block;">${p.title}</a>
                        <div class="prob-desc-preview" style="pointer-events:none;">${previewText}</div>
                    </div>
                </div>
            
            <div class="prob-actions">
                <button class="prob-btn-icon prob-edit-btn" onclick="event.stopPropagation(); openAdmin(${p.id})" title="題目設定與測資">
                    <i class="fa-solid fa-gear"></i>
                </button>
                <button class="prob-btn-icon prob-del-btn" onclick="event.stopPropagation(); deleteProblem(${p.id})" title="刪除此題">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </div>
        `;
        div.onclick = () => {
            if (!isBankSortMode) {
                window.open('/workspace/' + p.id, '_blank');
            }
        };
        list.appendChild(div);
    });
}

function openAdmin(probId) {
    window.location.href = '/admin/' + probId;
}

function createCategory() {
    const name = prompt("請輸入新分類名稱：");
    if (name && name.trim()) {
        const id = Date.now();
        const newCat = { id, name: name.trim(), isUserAdded: true, bankUrl: currentBankUrl };
        db.categories.push(newCat);
        saveToLocal(true, false);
        syncCategoryDeltaToCloud(id, newCat);
        renderCategoryList();
    }
}

function createProblem() {
    const title = prompt("請輸入新題目名稱：");
    if (title && title.trim()) {
        const id = Date.now().toString();
        const newProb = {
            id,
            catId: currentCatId,
            title: title.trim(),
            desc: "在此輸入題目敘述...",
            tpl_cpp: "#include <iostream>\nusing namespace std;\n\nint main() {\n    // your code here\n    return 0;\n}",
            tpl_python: "# your code here\n",
            code_cpp: "#include <iostream>\nusing namespace std;\n\nint main() {\n    // your code here\n    return 0;\n}",
            code_python: "# your code here\n",
            testCases: [{ input: "1 2", output: "3" }],
            isUserAdded: true
        };
        db.problems.push(newProb);
        saveToLocal(true, false);
        syncProblemDeltaToCloud(id, newProb);
        renderProblemList();
        
        // 詢問是否要立刻跳去編輯
        if (confirm("建立成功！是否要立刻前往後台編輯此題目？")) {
            openAdmin(id);
        }
    }
}

function deleteCategory(catId) {
    if (confirm("確定要刪除此分類及其下所有題目嗎？(無法復原)")) {
        const toDeleteProbs = db.problems.filter(p => p.catId == catId);
        
        db.problems = db.problems.filter(p => p.catId != catId);
        db.categories = db.categories.filter(c => c.id != catId);
        
        saveToLocal(true, false);
        syncCategoryDeltaToCloud(catId, null);
        toDeleteProbs.forEach(p => syncProblemDeltaToCloud(p.id, null));
        
        renderCategoryList();
    }
}

function deleteProblem(probId) {
    if (confirm("確定要刪除此題目嗎？(無法復原)")) {
        db.problems = db.problems.filter(p => p.id != probId);
        saveToLocal(true, false);
        syncProblemDeltaToCloud(probId, null);
        renderProblemList();
    }
}

function editCategory(catId, oldName) {
    const name = prompt("修改分類名稱：", oldName);
    if (name && name.trim() && name !== oldName) {
        const c = db.categories.find(x => x.id == catId);
        if (c) {
            c.name = name.trim();
            saveToLocal(true, false);
            syncCategoryDeltaToCloud(catId, c);
            renderCategoryList();
        }
    }
}

// 建立自訂題庫







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

    function toggleCatSortMode() { 
        isCatSortMode = !isCatSortMode; 
        updateSortUI(); 
        renderCategoryList(); 
    }

    function toggleProbSortMode() { 
        isProbSortMode = !isProbSortMode; 
        updateSortUI(); 
        renderProblemList(); 
    }


// === Migrated from legacy ===
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

async function deleteCustomBank(e, idx) {
    e.stopPropagation();
    const bank = db.customBanks[idx];
    if (confirm(`確定要刪除題庫「${bank.name}」嗎？這將會永久刪除雲端備份且無法復原！`)) {
        const bankId = bank.id;
        db.customBanks.splice(idx, 1);
        
        // 若刪除的是目前開啟的題庫，退回大廳
        if (currentBankUrl === "local_custom_" + bankId) {
            currentBankUrl = "";
            currentBankName = "";
            localStorage.removeItem('oj_v15_bank_url');
            localStorage.removeItem('oj_v15_bank_name');
        }

        const btn = e.target.closest('button');
        if (btn) btn.disabled = true;
        await saveToLocal(true, false);
        
        // 刪除雲端資料
        if (currentUser && personalDb) {
            try {
                await personalDb.collection('users').doc(currentUser.uid).collection('customBanks').doc(bankId).delete();
            } catch(e) {
                console.warn("雲端刪除失敗", e);
            }
        }
        
        renderCustomPortal();
    }
}

    async function loadCustomBank(idx) {
        // 🚀 UI 防呆：加入載入中動畫並鎖定全域按鈕，防止重複點擊
        const container = document.getElementById('customBankList');
        const cards = container.querySelectorAll('.saas-card');
        let clickedCard = null;
        let originalContent = "";
        
        cards.forEach(card => {
            if (parseInt(card.dataset.idx) === idx) {
                clickedCard = card.querySelector('div[onclick]');
                if (clickedCard) {
                    originalContent = clickedCard.innerHTML;
                    clickedCard.innerHTML = `<div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; text-align:center;">
                        <div class="card-icon-box bg-blue" style="margin:0 auto 10px auto;"><i class="fa-solid fa-spinner fa-spin"></i></div>
                        <h3 style="margin:0 0 5px 0;">載入中...</h3>
                        <p style="margin:0;">儲存並切換題庫</p>
                    </div>`;
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
        
        navigateTo('/categories');
        
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

function backToPortal() { 
        navigateTo('/portal');
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
            card.className = 'saas-card saas-card-sm clickable';
            card.style.position = 'relative';
            card.setAttribute('draggable', isBankSortMode);
            card.dataset.idx = idx; 
            card.dataset.id = bank.id; 

            // 確保非排序模式才顯示操作按鈕
            card.innerHTML = `
                <div onclick="if(!isBankSortMode) loadCustomBank(${idx})" style="width:100%; height:100%; display:flex; flex-direction:column; align-items:flex-start; justify-content:center; text-align:left; pointer-events: ${isBankSortMode ? 'none' : 'auto'};">
                    <div class="card-icon-box bg-purple" style="margin-bottom: 12px;"><i class="fa-solid fa-flask"></i></div>
                    <h3 style="margin:0 0 5px 0; font-size:1.15rem;">${bank.name}</h3>
                    <p style="margin:0 0 15px 0; font-size:0.9rem; color:var(--text-muted);">${bank.problems ? bank.problems.length : 0} 題</p>
                </div>
                <div class="card-actions-hover" style="display: ${isBankSortMode ? 'none' : 'flex'};">
                    <button class="prob-btn-icon prob-edit-btn" style="background: rgba(0,0,0,0.05); padding:6px 10px;" onclick="renameCustomBank(event, ${idx})" title="更名"><i class="fa-solid fa-pen"></i></button>
                    <button class="prob-btn-icon prob-del-btn" style="background: rgba(0,0,0,0.05); padding:6px 10px; color:#000;" onclick="deleteCustomBank(event, ${idx})" title="刪除"><i class="fa-solid fa-trash"></i></button>
                </div>
            `;
            container.appendChild(card);
        });

        // 如果在排序模式，啟動拖曳功能
        if (isBankSortMode) {
            enableDragSort('customBankList', 'saas-card', saveBankOrder);
        }
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
        window.location.href = '/admin/' + id; 
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

function openBackupUI() { 
        pendingRestoreFileName = ""; 
        document.getElementById('backupStr').value = btoa(encodeURIComponent(JSON.stringify(db))); 
        document.getElementById('backupModal').style.display = 'flex'; 
    }

function downloadBackup() { 
        const date = new Date().toISOString().slice(0, 10); 
        let filename = prompt("請輸入檔案名稱 (無需副檔名):", `oj_backup_${date}`); 
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
                    alert("檔案格式錯誤"); 
                    return; 
                } 
            } 
            document.getElementById('backupStr').value = content; 
        }; 
        reader.readAsText(file); 
        input.value = ''; 
    }

function copyBackupCode() { 
        document.getElementById('backupStr').select(); 
        document.execCommand('copy'); 
        alert("已複製"); 
    }

async function execRestore() { 
        try { 
            const data = JSON.parse(decodeURIComponent(atob(document.getElementById('backupStr').value))); 
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
                if (currentView === 'view-problem-list') navigateTo('/categories');
            } else { 
                throw new Error(); 
            } 
        } catch(e) { 
            alert("代碼無效或格式錯誤"); 
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

function renderRecentSubmissions() {
    const listContainer = document.getElementById('recent-submissions-list');
    if (!listContainer) return;
    
    let localHistory = localStorage.getItem('oj_v15_history');
    if (localHistory) {
        try {
            executionHistories = JSON.parse(localHistory);
        } catch(e) {}
    }
    
    let allSubs = [];
    for (let key in executionHistories) {
        let histList = executionHistories[key];
        if (histList && Array.isArray(histList)) {
            // 取最新3筆來比較時間即可
            for (let i = 0; i < Math.min(3, histList.length); i++) {
                let run = histList[i];
                let timeStr = run.time.replace(/[\u202F\u2009]/g, ' ');
                let t = new Date(timeStr).getTime();
                if (isNaN(t)) {
                    t = Date.now() - Math.random() * 10000;
                }
                allSubs.push({
                    probId: key,
                    time: run.time,
                    status: run.status,
                    timestamp: t,
                    bankUrl: run.bankUrl,
                    bankName: run.bankName
                });
            }
        }
    }
    allSubs.sort((a, b) => b.timestamp - a.timestamp);
    let recentSubs = allSubs.slice(0, 3);
    
    if (recentSubs.length === 0) {
        listContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted); font-size:1.1rem; font-weight:500;">目前暫時沒有作答紀錄</div>';
        return;
    }
    
    listContainer.innerHTML = '';
    recentSubs.forEach(sub => {
        let probId = sub.probId;
        if (probId.includes('_')) probId = probId.split('_')[1];
        
        let globalTitleMap = {};
        try { globalTitleMap = JSON.parse(localStorage.getItem('oj_v15_titles') || '{}'); } catch(e) {}
        
        if (typeof db !== 'undefined' && db && db.problems && db.problems.length > 0) {
            db.problems.forEach(p => {
                globalTitleMap[String(p.id)] = p.title;
            });
            try { localStorage.setItem('oj_v15_titles', JSON.stringify(globalTitleMap)); } catch(e) {}
        }

        let title = globalTitleMap[String(probId)] || "未知的題目";
        let catName = sub.bankName || "綜合題庫";
        
        // 如果舊紀錄沒有 bankName，但它是自訂題庫的題目，我們可以反查
        if (!sub.bankName && sub.probId.startsWith('custom_')) {
            if (typeof db !== 'undefined' && db && db.customBanks) {
                const customId = sub.probId.split('_')[1];
                const bank = db.customBanks.find(b => String(b.id) === String(customId));
                if (bank) {
                    catName = bank.name;
                    sub.bankUrl = "local_custom_" + bank.id;
                }
            }
        } else if (!sub.bankName) {
            // 對於預設題庫的舊紀錄，我們可以嘗試從目前載入的題庫抓名稱 (不完美但堪用)
            if (typeof db !== 'undefined' && db && db.problems && db.problems.length > 0) {
                const p = db.problems.find(x => String(x.id) === String(probId));
                if (p && localStorage.getItem('oj_v15_bank_name')) {
                    catName = localStorage.getItem('oj_v15_bank_name');
                    sub.bankUrl = localStorage.getItem('oj_v15_bank_url');
                }
            }
        }
        let statusClass = "badge-fail";
        let statusText = "WA 錯誤";
        
        if (sub.status && typeof sub.status === 'string') {
            if (sub.status.includes('全數通過') || sub.status === "AC") {
                statusClass = "badge-success";
                statusText = "AC 通過";
            } else if (sub.status.includes('編譯') || sub.status === "CE") {
                statusText = "CE 編譯錯誤";
            } else if (sub.status.includes('執行錯誤') || sub.status === "RE") {
                statusText = "RE 執行錯誤";
            } else if (sub.status.includes('超時') || sub.status === "TLE") {
                statusText = "TLE 超時";
            } else if (sub.status.includes('部分通過')) {
                statusText = "部分通過";
            }
        }
        
        const div = document.createElement('div');
        div.className = 'list-item';
        div.style.cursor = 'pointer';
        div.onclick = () => {
            if (sub.bankUrl) {
                localStorage.setItem('oj_v15_bank_url', sub.bankUrl);
            }
            if (sub.bankName) {
                localStorage.setItem('oj_v15_bank_name', sub.bankName);
            } else if (catName !== "綜合題庫") {
                localStorage.setItem('oj_v15_bank_name', catName);
            }
            window.open('/workspace/' + sub.probId, '_blank');
        };
        
        // 排版修正：標題在上方，分類與時間在下方同一列並有間距
        div.innerHTML = `
            <div class="item-info" style="width: 100%;">
                <h4 style="font-size:1rem; margin-bottom:6px;">${title}</h4>
                <div style="font-size:0.85rem; color:#888; display:flex; align-items:center;">
                    <span style="font-weight:500; color:var(--primary); min-width:80px;">${catName}</span>
                    <span style="margin: 0 10px; color: #ccc;">|</span>
                    <span>${sub.time}</span>
                </div>
            </div>
            <div style="display:flex; align-items:center; margin-left: 10px;">
                <span class="status-badge ${statusClass}" style="white-space:nowrap;">${statusText}</span>
            </div>
        `;
        
        div.style.display = 'flex';
        div.style.justifyContent = 'space-between';
        div.style.alignItems = 'center';
        
        listContainer.appendChild(div);
    });
}

if (typeof renderRecentSubmissions === 'function') setTimeout(renderRecentSubmissions, 0);

window.addEventListener('dbLoaded', updateLearningStats);
