let isCatSortMode = false;
let isProbSortMode = false;

// ==========================================
// 題庫大廳與分類列表邏輯 (js/dashboard.js)
// ==========================================

let currentCatId = null;

window.addEventListener('dbLoaded', () => {
    // 判斷要顯示大廳還是分類列表
    if (currentBankUrl) {
        document.getElementById('view-source-selector').style.display = 'none';
        document.getElementById('view-custom-portal').style.display = 'none';
        
        const nameEl = document.getElementById('currentBankName');
        if (nameEl) nameEl.innerHTML = `<i class="fa-solid fa-folder-open" style="color: #60a5fa; margin-right: 8px;"></i> 目前題庫: ` + currentBankName;
        
        // 檢查 URL 參數看是否在某個分類內
        const urlParams = new URLSearchParams(window.location.search);
        const catId = urlParams.get('catId');
        if (catId) {
            showProblemList(parseInt(catId, 10));
        } else {
            document.getElementById('view-categories').style.display = 'block';
            document.getElementById('view-problem-list').style.display = 'none';
            renderCategoryList();
        }
    } else {
        document.getElementById('view-categories').style.display = 'none';
        document.getElementById('view-problem-list').style.display = 'none';
        document.getElementById('view-source-selector').style.display = 'flex';
    }
});

function openDefaultBank() {
    currentBankUrl = "https://raw.githubusercontent.com/iansu11/Program-system-image/refs/heads/main/db.json";
    currentBankName = "官方預設題庫";
    localStorage.setItem('oj_v15_bank_url', currentBankUrl);
    localStorage.setItem('oj_v15_bank_name', currentBankName);
    window.location.href = 'dashboard.html';
}

function renderCustomBankPortal() {
    document.getElementById('view-source-selector').style.display = 'none';
    document.getElementById('view-custom-portal').style.display = 'flex';
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
    window.location.href = 'dashboard.html';
}

function goBackToSourceSelector() {
    currentBankUrl = "";
    currentBankName = "";
    localStorage.removeItem('oj_v15_bank_url');
    localStorage.removeItem('oj_v15_bank_name');
    window.location.href = 'dashboard.html';
}

function renderCategoryList() {
    const list = document.getElementById('categoryList');
    if (!list) return;
    list.innerHTML = '';
    db.categories.forEach((cat, index) => {
        const div = document.createElement('div');
        div.className = 'cat-card';
        div.draggable = isBankSortMode; 
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
            if (!isBankSortMode) {
                window.location.href = 'dashboard.html?catId=' + cat.id;
            }
        };
        list.appendChild(div);
    });
}

function showProblemList(catId) {
    currentCatId = catId;
    document.getElementById('view-categories').style.display = 'none';
    document.getElementById('view-problem-list').style.display = 'block';
    
    const cat = db.categories.find(c => c.id == catId);
    const catTitleEl = document.getElementById('currentCategoryTitle');
    if (catTitleEl) {
        catTitleEl.innerHTML = `<i class="fa-solid fa-list-check" style="color: #60a5fa; margin-right: 8px;"></i> ${cat ? cat.name : "未知分類"}`;
    }
    
    renderProblemList();
}

function goBackToCategories() {
    window.location.href = 'dashboard.html';
}

function renderProblemList() {
    const list = document.getElementById('problemList');
    if (!list) return;
    list.innerHTML = '';
    const filtered = db.problems.filter(p => p.catId == currentCatId);
    
    filtered.forEach((p) => {
        const div = document.createElement('div');
        div.className = 'prob-item';
        div.draggable = isBankSortMode; 
        div.dataset.id = p.id; 
        
        let statusIcon = '<i class="fa-regular fa-circle" style="color:#ccc;"></i>';
        const historyKey = `${currentBankUrl}_${p.id}`;
        if (executionHistories[historyKey]) {
            const h = executionHistories[historyKey];
            if (h.every(x => x.pass)) statusIcon = '<i class="fa-solid fa-circle-check" style="color:var(--success);"></i>';
            else statusIcon = '<i class="fa-solid fa-circle-xmark" style="color:var(--fail);"></i>';
        }

        const previewText = (p.desc || "").substring(0, 50).replace(/#/g, '') + "...";

        div.innerHTML = `
            <div style="display:flex; align-items:center; gap:15px; flex:1; min-width:0;">
                <div style="font-size:1.2rem; width:25px; text-align:center;">${statusIcon}</div>
                <div style="flex:1; min-width:0;">
                    <div class="prob-title">${p.title}</div>
                    <div class="prob-desc-preview">${previewText}</div>
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
                window.location.href = 'workspace.html?probId=' + p.id;
            }
        };
        list.appendChild(div);
    });
}

function openAdmin(probId) {
    window.location.href = 'admin.html?probId=' + probId;
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
        const id = Date.now();
        const newProb = {
            id,
            catId: currentCatId,
            title: title.trim(),
            desc: "在此輸入題目敘述...",
            testCases: [{ input: "", output: "" }],
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
function createNewCustomBank() {
    const name = prompt("請為新題庫命名：", "我的專屬題庫");
    if (!name) return;
    
    const newBank = {
        id: "b" + Date.now(),
        name: name.trim(),
        version: "v1",
        categories: [],
        problems: []
    };
    
    if (!db.customBanks) db.customBanks = [];
    db.customBanks.push(newBank);
    saveToLocal(true, false);
    renderCustomBankPortal();
}

function deleteCustomBank(bankId) {
    if (confirm("⚠️ 確定要刪除此題庫嗎？內部所有題目將會永久消失，無法復原！")) {
        db.customBanks = db.customBanks.filter(b => b.id !== bankId);
        
        if (currentUser && personalDb) {
            personalDb.collection('users').doc(currentUser.uid).collection('customBanks').doc(bankId).delete().catch(()=>{});
        }
        saveToLocal(true, false);
        renderCustomBankPortal();
    }
}

function editCustomBank(bankId, oldName) {
    const newName = prompt("修改題庫名稱：", oldName);
    if (newName && newName.trim() && newName !== oldName) {
        const bank = db.customBanks.find(b => b.id === bankId);
        if (bank) {
            bank.name = newName.trim();
            saveToLocal(true, false);
            renderCustomBankPortal();
        }
    }
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

