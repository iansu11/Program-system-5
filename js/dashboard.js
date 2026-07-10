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
            let finalBankUrl = sub.bankUrl;
            let finalBankName = sub.bankName || catName;
            
            // 延遲解析：如果最初沒有解析出 bankUrl，在點擊的當下再次解析
            if (!finalBankUrl) {
                if (window.globalDefaultBankMap && window.globalDefaultBankMap[sub.probId]) {
                    finalBankUrl = window.globalDefaultBankMap[sub.probId].bankUrl;
                    finalBankName = window.globalDefaultBankMap[sub.probId].bankName;
                } else if (typeof db !== 'undefined' && db && db.customBanks) {
                    for (let bank of db.customBanks) {
                        if (bank.problems && bank.problems.some(p => String(p.id) === String(sub.probId))) {
                            finalBankUrl = "local_custom_" + bank.id;
                            finalBankName = bank.name;
                            break;
                        }
                    }
                }
            }
            
            if (finalBankUrl) {
                localStorage.setItem('oj_v15_bank_url', finalBankUrl);
            }
            if (finalBankName && finalBankName !== "綜合題庫") {
                localStorage.setItem('oj_v15_bank_name', finalBankName);
            }
            window.open('/workspace/' + encodeURIComponent(sub.probId), '_blank');
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
        
        listContainer.appendChild(div);
    });
}

if (typeof renderRecentSubmissions === 'function') setTimeout(renderRecentSubmissions, 0);

window.addEventListener('dbLoaded', () => {
    updateLearningStats();
    if (typeof renderRecentSubmissions === 'function') renderRecentSubmissions();
});


// 自動背景建立預設題庫的對應表，用以精準還原舊紀錄的題庫來源
window.globalDefaultBankMap = {};
async function buildGlobalDefaultBankMap() {
    const cachedMap = localStorage.getItem('oj_v15_default_bank_map');
    if (cachedMap) {
        try {
            window.globalDefaultBankMap = JSON.parse(cachedMap);
            // 立刻重繪一次紀錄，這樣一進來就能看到
            if (typeof renderRecentSubmissions === 'function') renderRecentSubmissions();
        } catch(e) {}
    }
    
    const banks = [
        { url: '/program-1.json', name: '114-第一學期程式設計' },
        { url: '/program-oop.json', name: '114-第二學期物件導向' },
        { url: '/program-cpe.json', name: 'CPE 一顆星選集' }
    ];
    
    let isUpdated = false;
    for (let b of banks) {
        try {
            const res = await fetch(b.url);
            const data = await res.json();
            if (data && data.problems) {
                data.problems.forEach(p => {
                    if (!window.globalDefaultBankMap[String(p.id)]) {
                        window.globalDefaultBankMap[String(p.id)] = {
                            bankUrl: b.url,
                            bankName: b.name
                        };
                        isUpdated = true;
                    }
                });
            }
        } catch(e) {
            console.warn("Failed to fetch default bank for mapping:", b.url);
        }
    }
    
    if (isUpdated) {
        localStorage.setItem('oj_v15_default_bank_map', JSON.stringify(window.globalDefaultBankMap));
        // 重繪以套用新找到的預設題庫
        if (typeof renderRecentSubmissions === 'function') renderRecentSubmissions();
    }
}
window.addEventListener('load', buildGlobalDefaultBankMap);


// --- Admin Logic & Announcements ---
async function loadAdminAndAnnouncements() {
    // Inject Admin Panel button if role is admin
    const role = window.currentUserRole || localStorage.getItem('oj_v15_userRole');
    if (role === 'admin') {
        document.querySelectorAll('.user-profile').forEach(el => {
            if (!el.querySelector('.admin-btn')) {
                const btn = document.createElement('button');
                btn.className = 'btn btn-outline btn-sm admin-btn';
                btn.style.marginLeft = '10px';
                btn.style.borderColor = '#8b5cf6';
                btn.style.color = '#8b5cf6';
                btn.innerHTML = '<i class="fa-solid fa-crown"></i> 管理者後台';
                btn.onclick = () => window.location.href = '/admin_panel.html';
                el.insertBefore(btn, el.lastElementChild);
            }
        });
    }

    // Load Announcements
    if (masterDb) {
        try {
            const snap = await masterDb.collection('announcements').orderBy('timestamp', 'desc').limit(5).get();
            const container = document.getElementById('announcements-container');
            const list = document.getElementById('announcements-list');
            if (container && list) {
                container.style.display = 'block';
                if (snap.empty) {
                    list.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">目前無系統公告</div>';
                } else {
                    list.innerHTML = '';
                    snap.docs.forEach(doc => {
                        const data = doc.data();
                        const div = document.createElement('div');
                        div.className = 'list-item clickable';
                        div.style.cursor = 'pointer';
                        
                        const dateStr = data.timestamp ? new Date(data.timestamp.toDate()).toLocaleDateString() : '';
                        div.innerHTML = `
                            <div class="item-info">
                                <h4 style="color: var(--primary); margin: 0 0 5px 0;">${data.title || '系統公告'}</h4>
                                <span style="font-size: 0.85rem; color: var(--text-muted);">${dateStr}</span>
                            </div>
                        `;
                        div.onclick = () => {
                            if (!document.getElementById('announcementModal')) {
                                const modalHTML = `
                                    <div id="announcementModal" class="modal">
                                        <div class="modal-box" style="width: 500px; max-width: 90%; background: #f8fafc; border: 1px solid #e2e8f0; box-shadow: 0 10px 25px rgba(0,0,0,0.1); color: #334155;">
                                            <h3 id="annModalTitle" style="color: #2563eb; margin-top: 0; font-size: 1.3rem;">公告標題</h3>
                                            <p id="annModalDate" style="color: #64748b; font-size: 0.9rem; margin-top: -10px; margin-bottom: 20px;">日期</p>
                                            <div id="annModalContent" style="color: #1e293b; white-space: pre-wrap; line-height: 1.6; max-height: 300px; overflow-y: auto; padding-right: 10px; border-top: 1px solid #e2e8f0; padding-top: 15px;"></div>
                                            <div style="display: flex; justify-content: flex-end; margin-top: 20px;">
                                                <button class="btn" style="background: #e2e8f0; color: #334155; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 500;" onclick="document.getElementById('announcementModal').style.display='none'">關閉</button>
                                            </div>
                                        </div>
                                    </div>
                                `;
                                document.body.insertAdjacentHTML('beforeend', modalHTML);
                            }
                            
                            document.getElementById('annModalTitle').innerText = data.title || '系統公告';
                            document.getElementById('annModalDate').innerText = dateStr;
                            document.getElementById('annModalContent').innerText = data.content || '';
                            document.getElementById('announcementModal').style.display = 'flex';
                        };
                        list.appendChild(div);
                    });
                }
            }
        } catch(e) {
            console.error("Failed to load announcements:", e);
        }
    }
}

if (window.isDbLoaded) {
    loadAdminAndAnnouncements();
}
window.addEventListener('dbLoaded', loadAdminAndAnnouncements);
window.addEventListener('personalCloudReady', loadAdminAndAnnouncements);


// --- 個人設定與升級邏輯 ---
function bindAvatarSettings() {
    document.querySelectorAll('.user-avatar').forEach(el => {
        el.style.cursor = 'pointer';
        el.title = "點擊開啟個人設定";
        el.onclick = () => {
            const modal = document.getElementById('settingsModal');
            if(modal) modal.style.display = 'flex';
        };
    });
}

// 嘗試立即綁定，並且在 DOMContentLoaded 時再次綁定確保萬無一失
bindAvatarSettings();
document.addEventListener('DOMContentLoaded', bindAvatarSettings);
window.addEventListener('dbLoaded', bindAvatarSettings);

async function upgradeToAdmin() {
    if (!currentUser || !masterDb) return alert("系統尚未準備好，請稍後再試。");
    const code = prompt("請輸入管理者授權碼：");
    if (code === 'antigravity-admin-2026') {
        try {
            await masterDb.collection('userSettings').doc(currentUser.uid).update({ role: 'admin' });
            alert("✅ 授權碼正確！您已升級為系統管理員。\n畫面即將重新整理以套用新權限。");
            localStorage.setItem('oj_v15_userRole', 'admin');
            window.location.reload();
        } catch(e) {
            // 如果原本沒有 userSettings document，則使用 set + merge
            try {
                await masterDb.collection('userSettings').doc(currentUser.uid).set({ role: 'admin' }, { merge: true });
                alert("✅ 授權碼正確！您已升級為系統管理員。\n畫面即將重新整理以套用新權限。");
                localStorage.setItem('oj_v15_userRole', 'admin');
                window.location.reload();
            } catch(e2) {
                alert("❌ 更新權限失敗：" + e2.message);
            }
        }
    } else if (code !== null) {
        alert("❌ 授權碼錯誤！");
    }
}
