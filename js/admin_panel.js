// admin_panel.js
window.addEventListener('personalCloudReady', () => {
    // Only allow admin
    const role = window.currentUserRole || localStorage.getItem('oj_v15_userRole');
    if (role !== 'admin') {
        alert("權限不足，將返回大廳。");
        window.location.href = '/dashboard.html';
        return;
    }
    
    // UI ready
    document.getElementById('user-name-admin').innerText = currentUser ? currentUser.email : "Admin";

    loadAnnouncements();
    loadGitHubSettings();
    loadCustomBanksForSelect();
    loadSystemBanksIndex();
});

// === 公告管理 ===
async function loadAnnouncements() {
    if (!masterDb) return;
    const list = document.getElementById('admin-announcements-list');
    list.innerHTML = '讀取中...';
    try {
        const snap = await masterDb.collection('announcements').orderBy('timestamp', 'desc').get();
        if (snap.empty) {
            list.innerHTML = '目前無任何公告。';
            return;
        }
        list.innerHTML = '';
        snap.docs.forEach(doc => {
            const data = doc.data();
            const div = document.createElement('div');
            div.style.padding = '10px';
            div.style.borderBottom = '1px solid #e5e7eb';
            div.style.display = 'flex';
            div.style.justifyContent = 'space-between';
            div.style.alignItems = 'center';
            
            const dateStr = data.timestamp ? new Date(data.timestamp.toDate()).toLocaleString() : '';
            div.innerHTML = `
                <div style="flex: 1; padding-right: 15px;">
                    <div style="font-weight: 600; color: #1e293b; margin-bottom: 4px;">${data.title || '無標題'}</div>
                    <div style="color: #475569; font-size: 0.9rem; margin-bottom: 4px; white-space: pre-wrap;">${data.content || ''}</div>
                    <div style="color: #94a3b8; font-size: 0.8rem;">${dateStr}</div>
                </div>
                <button class="btn btn-danger btn-sm" style="flex-shrink: 0;" onclick="deleteAnnouncement('${doc.id}')">刪除</button>
            `;
            list.appendChild(div);
        });
    } catch(e) {
        list.innerHTML = '讀取失敗:  ' + e.message;
    }
}

async function addAnnouncement() {
    const titleInput = document.getElementById('announcementTitle');
    const contentInput = document.getElementById('announcementContent');
    const title = titleInput ? titleInput.value.trim() : '';
    const content = contentInput ? contentInput.value.trim() : '';
    if (!title || !content) return alert("請輸入標題與內容");
    
    try {
        await masterDb.collection('announcements').add({
            title: title,
            content: content,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        if (titleInput) titleInput.value = '';
        if (contentInput) contentInput.value = '';
        loadAnnouncements();
    } catch(e) {
        alert("發佈失敗: : " + e.message);
    }
}

async function deleteAnnouncement(id) {
    if (!confirm("確定要刪除此公告嗎？")) return;
    try {
        await masterDb.collection('announcements').doc(id).delete();
        loadAnnouncements();
    } catch(e) {
        alert("刪除失敗: : " + e.message);
    }
}

// === GitHub 設定 ===
async function loadGitHubSettings() {
    try {
        const doc = await masterDb.collection('systemSettings').doc('githubConfig').get();
        if (doc.exists) {
            const data = doc.data();
            if (data.owner) document.getElementById('ghOwner').value = data.owner;
            if (data.repo) document.getElementById('ghRepo').value = data.repo;
            if (data.token) document.getElementById('ghToken').value = data.token;
        }
    } catch(e) {
        console.error("Failed to load GH settings:", e);
    }
}

async function saveGitHubSettings() {
    const owner = document.getElementById('ghOwner').value.trim();
    const repo = document.getElementById('ghRepo').value.trim();
    const token = document.getElementById('ghToken').value.trim();
    
    if (!owner || !repo || !token) return alert("請填寫所有 GitHub 設定欄位");
    
    try {
        await masterDb.collection('systemSettings').doc('githubConfig').set({
            owner: owner,
            repo: repo,
            token: token
        });
        alert("✅ GitHub 設定已儲存");
    } catch(e) {
        alert("發佈失敗: : " + e.message);
    }
}

// === 發布題庫至 GitHub ===
async function loadCustomBanksForSelect() {
    const select = document.getElementById('sourceBankSelect');
    select.innerHTML = '<option value="">請選擇要發布的自訂題庫...</option>';
    
    // 需要從 personalDb 拿取完整的 customBanks，因為 local 可能沒有 problems 資料
    if (!personalDb || !currentUser) return;
    try {
        const snap = await personalDb.collection('users').doc(currentUser.uid).collection('customBanks').get();
        window.adminCustomBanks = {};
        snap.docs.forEach(doc => {
            const b = doc.data();
            window.adminCustomBanks[b.id] = b;
            const opt = document.createElement('option');
            opt.value = b.id;
            opt.innerText = b.name;
            select.appendChild(opt);
        });
    } catch(e) {
        select.innerHTML = '<option value="">載入自訂題庫失敗</option>';
    }
}

async function publishToGitHub() {
    const sourceId = document.getElementById('sourceBankSelect').value;
    const targetFile = document.getElementById('targetBankSelect').value;
    const owner = document.getElementById('ghOwner').value.trim();
    const repo = document.getElementById('ghRepo').value.trim();
    const token = document.getElementById('ghToken').value.trim();
    
    if (!sourceId) return alert("請選擇來源題庫！");
    if (!owner || !repo || !token) return alert("請先完成並儲存 GitHub 設定！");
    
    const bankData = window.adminCustomBanks[sourceId];
    if (!bankData) return alert("找不到來源題庫資料");
    
    const btn = document.getElementById('publishBtn');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 發布中...';
    btn.disabled = true;
    
    try {
        // Prepare JSON payload (match system format)
        const payloadObj = {
            version: bankData.version || "1.0",
            categories: bankData.categories || [],
            problems: bankData.problems || []
        };
        const contentStr = JSON.stringify(payloadObj, null, 4);
        
        // Base64 encode for GitHub API (UTF-8 safe)
        const encodedContent = btoa(unescape(encodeURIComponent(contentStr)));
        
        const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${targetFile}`;
        
        // Step 1: Get SHA of existing file to overwrite
        let sha = null;
        const getRes = await fetch(apiUrl, {
            headers: { 'Authorization': `token ${token}` }
        });
        if (getRes.ok) {
            const getJson = await getRes.json();
            sha = getJson.sha;
        }
        
        // Step 2: PUT request to create/update
        const body = {
            message: `Update ${targetFile} via Admin Panel`,
            content: encodedContent
        };
        if (sha) body.sha = sha;
        
        const putRes = await fetch(apiUrl, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
        
        if (!putRes.ok) {
            const errJson = await putRes.json();
            throw new Error(errJson.message || 'Unknown GitHub API Error');
        }
        
        alert(`✅ 成功發布至 GitHub: ${targetFile}\n大廳讀取時將會自動抓取最新的檔案！`);
    } catch(e) {
        alert("❌ 發布失敗: " + e.message);
    } finally {
        btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> 發布至 GitHub';
        btn.disabled = false;
    }
}

// === 第二部份：系統預設題庫線上編輯器 ===
window.currentSystemBankData = null;
window.currentSystemBankFile = null;
window.currentSystemBankSha = null;

async function loadSystemBankForEdit() {
    const fileName = document.getElementById('systemBankSelect').value;
    const owner = document.getElementById('ghOwner').value.trim();
    const repo = document.getElementById('ghRepo').value.trim();
    const token = document.getElementById('ghToken').value.trim();
    
    if (!owner || !repo || !token) return alert("請先完成並儲存 GitHub 設定！");
    
    document.getElementById('editingBankTitle').innerText = `載入中...`;
    
    try {
        const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${fileName}`;
        const res = await fetch(apiUrl, {
            headers: { 'Authorization': `token ${token}` }
        });
        
        if (!res.ok) throw new Error("讀取題庫檔案失敗");
        
        const data = await res.json();
        const jsonStr = decodeURIComponent(escape(atob(data.content)));
        
        window.currentSystemBankData = JSON.parse(jsonStr);
        window.currentSystemBankFile = fileName;
        window.currentSystemBankSha = data.sha;
        
        // 保留結構完整
        if (!window.currentSystemBankData.categories) window.currentSystemBankData.categories = [];
        if (!window.currentSystemBankData.problems) window.currentSystemBankData.problems = [];
        
        // 寫入 localStorage 供 admin.html 使用
        localStorage.setItem('oj_system_edit_data', JSON.stringify(window.currentSystemBankData));
        
        document.getElementById('editingBankTitle').innerText = `編輯中：${fileName}`;
        document.getElementById('systemBankEditorArea').style.display = 'block';
        
        renderSystemBankTree();
    } catch(e) {
        alert("載入失" + e.message);
    }
}

function renderSystemBankTree() {
    const treeDiv = document.getElementById('systemBankTree');
    treeDiv.innerHTML = '';
    
    if (!window.currentSystemBankData) return;
    
    const cats = window.currentSystemBankData.categories || [];
    const probs = window.currentSystemBankData.problems || [];
    
    if (cats.length === 0) {
        treeDiv.innerHTML = '<div style="color:#94a3b8; text-align:center;">此題庫沒有任何分類</div>';
        return;
    }
    
    cats.forEach((c, catIdx) => {
        const catProbs = probs.filter(p => p.category === c.id || p.catId === c.id);
        let probsHtml = '';
        catProbs.forEach((p, pIdx) => {
            probsHtml += `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 5px 10px; margin-left: 20px; border-left: 2px solid #e2e8f0; border-bottom: 1px solid #f8fafc;">
                    <div style="flex:1; display:flex; align-items:center; gap: 8px;">
                        <div style="display:flex; flex-direction:column; gap:2px;">
                            <button title="上移" onclick="moveSystemBankProblem('${p.id}', -1)" style="border:none; background:none; cursor:pointer; font-size:10px; padding:0; color:#94a3b8; ${pIdx===0 ? 'visibility:hidden;':''}">⬆️</button>
                            <button title="下移" onclick="moveSystemBankProblem('${p.id}', 1)" style="border:none; background:none; cursor:pointer; font-size:10px; padding:0; color:#94a3b8; ${pIdx===catProbs.length-1 ? 'visibility:hidden;':''}">⬇️</button>
                        </div>
                        <span style="color:#64748b; font-size:0.8rem;">[${p.id}]</span> 
                        <span>${p.title}</span>
                    </div>
                    <div>
                        <button class="action-btn edit-btn" style="padding:2px 8px; font-size:0.75rem; background:#3b82f6; color:white;" onclick="testSystemBankProblem('${p.id}')">👁️ 測試</button>
                        <button class="action-btn edit-btn" style="padding:2px 8px; font-size:0.75rem;" onclick="editSystemBankProblem('${p.id}')">編輯</button>
                        <button class="action-btn delete-btn" style="padding:2px 8px; font-size:0.75rem;" onclick="deleteSystemBankProblem('${p.id}')">刪除</button>
                    </div>
                </div>
            `;
        });
        
        treeDiv.innerHTML += `
            <div style="margin-bottom: 10px; background: white; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; border-bottom: 1px solid #f1f5f9; padding-bottom: 5px;">
                    <div style="display:flex; align-items:center; gap: 8px; font-weight: bold; color: #1e293b;">
                        <div style="display:flex; flex-direction:column; gap:2px;">
                            <button title="上移" onclick="moveSystemBankCategory('${c.id}', -1)" style="border:none; background:none; cursor:pointer; font-size:12px; padding:0; color:#94a3b8; ${catIdx===0 ? 'visibility:hidden;':''}">⬆️</button>
                            <button title="下移" onclick="moveSystemBankCategory('${c.id}', 1)" style="border:none; background:none; cursor:pointer; font-size:12px; padding:0; color:#94a3b8; ${catIdx===cats.length-1 ? 'visibility:hidden;':''}">⬇️</button>
                        </div>
                        📁 ${c.name}
                    </div>
                    <div>
                        <button class="action-btn edit-btn" style="padding:2px 8px; font-size:0.75rem;" onclick="addSystemBankProblem('${c.id}')">+ 新增題目</button>
                        <button class="action-btn edit-btn" style="padding:2px 8px; font-size:0.75rem;" onclick="editSystemBankCategory('${c.id}', '${c.name}')">重新命名</button>
                        <button class="action-btn delete-btn" style="padding:2px 8px; font-size:0.75rem;" onclick="deleteSystemBankCategory('${c.id}')">刪除分類</button>
                    </div>
                </div>
                ${probsHtml}
            </div>
        `;
    });
}

function moveSystemBankCategory(id, dir) {
    const cats = window.currentSystemBankData.categories;
    const idx = cats.findIndex(c => c.id === id);
    if (idx < 0) return;
    const targetIdx = idx + dir;
    if (targetIdx >= 0 && targetIdx < cats.length) {
        // Swap
        [cats[idx], cats[targetIdx]] = [cats[targetIdx], cats[idx]];
        syncSystemBankToLocal();
        renderSystemBankTree();
    }
}

function moveSystemBankProblem(id, dir) {
    const probs = window.currentSystemBankData.problems;
    const pIdx = probs.findIndex(p => p.id === id);
    if (pIdx < 0) return;
    const p = probs[pIdx];
    const catId = p.category || p.catId;
    
    // 找出分類中題目的索引
    const catProbsIndices = [];
    probs.forEach((prob, index) => {
        if (prob.category === catId || prob.catId === catId) {
            catProbsIndices.push(index);
        }
    });
    
    const currentLocalIdx = catProbsIndices.indexOf(pIdx);
    const targetLocalIdx = currentLocalIdx + dir;
    
    if (targetLocalIdx >= 0 && targetLocalIdx < catProbsIndices.length) {
        const targetGlobalIdx = catProbsIndices[targetLocalIdx];
        // Swap in the global array
        [probs[pIdx], probs[targetGlobalIdx]] = [probs[targetGlobalIdx], probs[pIdx]];
        syncSystemBankToLocal();
        renderSystemBankTree();
    }
}

function testSystemBankProblem(probId) {
    window.open(`workspace.html?v=27&mode=system_edit&probId=${probId}`, '_blank');
}

function addSystemBankCategory() {
    const name = prompt("請輸入新分類名稱：");
    if (!name || !name.trim()) return;
    const newId = Date.now().toString();
    window.currentSystemBankData.categories.push({ id: newId, name: name.trim() });
    syncSystemBankToLocal();
    renderSystemBankTree();
}

function editSystemBankCategory(id, oldName) {
    const newName = prompt("修改分類名稱：", oldName);
    if (!newName || !newName.trim() || newName === oldName) return;
    const cat = window.currentSystemBankData.categories.find(c => c.id === id);
    if (cat) {
        cat.name = newName.trim();
        syncSystemBankToLocal();
        renderSystemBankTree();
    }
}

function deleteSystemBankCategory(id) {
    if (confirm("確定要刪除此分類？底下的題目也會一起刪除喔！")) {
        window.currentSystemBankData.categories = window.currentSystemBankData.categories.filter(c => c.id !== id);
        window.currentSystemBankData.problems = window.currentSystemBankData.problems.filter(p => p.category !== id && p.catId !== id);
        syncSystemBankToLocal();
        renderSystemBankTree();
    }
}

function deleteSystemBankProblem(id) {
    if (confirm("確定要刪除此公告嗎？題目")) {
        window.currentSystemBankData.problems = window.currentSystemBankData.problems.filter(p => p.id !== id);
        syncSystemBankToLocal();
        renderSystemBankTree();
    }
}

function addSystemBankProblem(catId) {
    // 從編輯器回到首頁，進入 mode=system_edit
    window.open(`admin.html?mode=system_edit&action=new&catId=${catId}`, '_blank');
}

function editSystemBankProblem(probId) {
    window.open(`admin.html?mode=system_edit&probId=${probId}`, '_blank');
}

    // admin.html 修改 localStorage 後這裡接收事件並更新頁面
window.addEventListener('storage', function(e) {
    if (e.key === 'oj_system_edit_data') {
        if (e.newValue) {
            window.currentSystemBankData = JSON.parse(e.newValue);
            renderSystemBankTree();
        }
    }
});

function syncSystemBankToLocal() {
            // 確保陣列不為空，避免錯誤的同步
    localStorage.setItem('oj_system_edit_data', JSON.stringify(window.currentSystemBankData));
}

async function publishEditedSystemBank() {
    if (!window.currentSystemBankData || !window.currentSystemBankFile || !window.currentSystemBankSha) return;
    
    const owner = document.getElementById('ghOwner').value.trim();
    const repo = document.getElementById('ghRepo').value.trim();
    const token = document.getElementById('ghToken').value.trim();
    const fileName = window.currentSystemBankFile;
    const sha = window.currentSystemBankSha;
    
    const btn = document.getElementById('saveSystemBankBtn');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 儲存上傳中...';
    btn.disabled = true;
    
    try {
        const contentStr = JSON.stringify(window.currentSystemBankData, null, 4);
        const encodedContent = btoa(unescape(encodeURIComponent(contentStr)));
        const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${fileName}`;
        
        const body = {
            message: `Update ${fileName} via System Bank Editor`,
            content: encodedContent,
            sha: sha
        };
        
        const putRes = await fetch(apiUrl, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
        
        if (!putRes.ok) {
            const errJson = await putRes.json();
            throw new Error(errJson.message || 'Unknown Error');
        }
        
        const newJson = await putRes.json();
        window.currentSystemBankSha = newJson.content.sha; // 更新 SHA 防止下次衝突
        
        alert(`✅ 成功推播更新至 GitHub: ${fileName}！`);
    } catch (e) {
        alert("❌ 推播失敗：" + e.message);
    } finally {
        btn.innerHTML = '<i class="fa-solid fa-upload"></i> 儲存並推播至 GitHub';
        btn.disabled = false;
    }
}

// === 系統題庫目錄管理 ===
let systemBanksIndexData = [];

async function loadSystemBanksIndex() {
    try {
        const res = await fetch('/system-banks-index.json?_t=' + new Date().getTime());
        if (res.ok) {
            systemBanksIndexData = await res.json();
            
            const targetSel = document.getElementById('targetBankSelect');
            const systemSel = document.getElementById('systemBankSelect');
            
            const optionsHtml = systemBanksIndexData.map(b => 
                `<option value="${b.file}">${b.icon || '📁'} ${b.shortTitle || b.title} (${b.file})</option>`
            ).join('');
            
            if (targetSel) targetSel.innerHTML = optionsHtml;
            if (systemSel) systemSel.innerHTML = optionsHtml;
        }
    } catch (e) {
        console.error("載入系統題庫目錄失敗:", e);
    }
}

async function createNewSystemBank() {
    const bankName = prompt("請輸入新題庫標題 (例如: 2026-前端網頁設計):");
    if (!bankName) return;
    
    const bankFileName = prompt("請輸入新題庫檔案名稱 (必須以 .json 結尾，例如 frontend-2026.json):");
    if (!bankFileName || !bankFileName.endsWith('.json')) {
        return alert("檔案名稱無效，必須以 .json 結尾");
    }
    
    const bankIcon = prompt("請輸入一個 Emoji 作為題庫圖示 (例如: 📁):", "📁");
    
    const owner = document.getElementById('ghOwner').value.trim();
    const repo = document.getElementById('ghRepo').value.trim();
    const token = document.getElementById('ghToken').value.trim();
    if (!owner || !repo || !token) return alert("請先完成並儲存 GitHub 設定！");
    
    try {
        // 1. 建立空題庫
        const emptyContent = { problems: [] };
        const b64Content = btoa(encodeURIComponent(JSON.stringify(emptyContent, null, 2)).replace(/%([0-9A-F]{2})/g, function(match, p1) {
            return String.fromCharCode('0x' + p1);
        }));
        
        let res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${bankFileName}`, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: `Create new system bank: ${bankFileName}`,
                content: b64Content
            })
        });
        
        if (!res.ok) throw new Error("建立題庫檔案失敗");
        
        // 2. 更新 system-banks-index.json
        const newBankEntry = {
            file: bankFileName,
            title: bankName,
            shortTitle: bankName,
            desc: "全新系統題庫",
            footer: "載入題目",
            iconBoxClass: "bg-blue",
            faIcon: "fa-solid fa-folder",
            icon: bankIcon || "📁"
        };
        
        systemBanksIndexData.push(newBankEntry);
        
        // 抓取目前 index 的 sha
        let sha = null;
        try {
            const getRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/system-banks-index.json`, {
                headers: { 'Authorization': `token ${token}` }
            });
            if (getRes.ok) {
                const getData = await getRes.json();
                sha = getData.sha;
            }
        } catch(e){}
        
        const indexB64 = btoa(encodeURIComponent(JSON.stringify(systemBanksIndexData, null, 4)).replace(/%([0-9A-F]{2})/g, function(match, p1) {
            return String.fromCharCode('0x' + p1);
        }));
        
        const updateBody = {
            message: `Update system banks index with ${bankFileName}`,
            content: indexB64
        };
        if (sha) updateBody.sha = sha;
        
        res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/system-banks-index.json`, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updateBody)
        });
        
        if (!res.ok) throw new Error("更新題庫目錄失敗");
        
        alert("✅ 成功建立新題庫！");
        window.location.reload();
        
    } catch (e) {
        alert("發生錯誤：" + e.message);
    }
}

async function editSystemBankInfo() {
    const fileName = document.getElementById('systemBankSelect').value;
    if (!fileName) return alert("請先選擇題庫");

    const owner = document.getElementById('ghOwner').value.trim();
    const repo = document.getElementById('ghRepo').value.trim();
    const token = document.getElementById('ghToken').value.trim();
    if (!owner || !repo || !token) return alert("請先完成並儲存 GitHub 設定！");

    const bankIndex = systemBanksIndexData.findIndex(b => b.file === fileName);
    if (bankIndex === -1) return alert("找不到該題庫的索引資料");

    const currentBank = systemBanksIndexData[bankIndex];

    const newTitle = prompt("修改題庫標題：", currentBank.title);
    if (newTitle === null) return;
    
    const newIcon = prompt("修改題庫圖示 (Emoji)：", currentBank.icon || "📁");
    if (newIcon === null) return;

    if (newTitle === currentBank.title && newIcon === currentBank.icon) return;

    currentBank.title = newTitle;
    currentBank.shortTitle = newTitle;
    currentBank.icon = newIcon;

    try {
        let sha = null;
        const getRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/system-banks-index.json`, {
            headers: { 'Authorization': `token ${token}` }
        });
        if (getRes.ok) {
            const getData = await getRes.json();
            sha = getData.sha;
        }

        const indexB64 = btoa(encodeURIComponent(JSON.stringify(systemBanksIndexData, null, 4)).replace(/%([0-9A-F]{2})/g, function(match, p1) {
            return String.fromCharCode('0x' + p1);
        }));

        const updateBody = {
            message: `Update system bank info for ${fileName}`,
            content: indexB64
        };
        if (sha) updateBody.sha = sha;

        const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/system-banks-index.json`, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updateBody)
        });

        if (!res.ok) throw new Error("更新題庫目錄失敗");

        alert("✅ 成功修改題庫資訊！");
        window.location.reload();
    } catch (e) {
        alert("發生錯誤：" + e.message);
    }
}

async function deleteSystemBank() {
    const fileName = document.getElementById('systemBankSelect').value;
    if (!fileName) return alert("請先選擇題庫");

    const owner = document.getElementById('ghOwner').value.trim();
    const repo = document.getElementById('ghRepo').value.trim();
    const token = document.getElementById('ghToken').value.trim();
    if (!owner || !repo || !token) return alert("請先完成並儲存 GitHub 設定！");

    if (!confirm(`確定要清除題庫 ${fileName} 嗎？這會將它從系統目錄中移除。`)) return;

    const bankIndex = systemBanksIndexData.findIndex(b => b.file === fileName);
    if (bankIndex === -1) return alert("找不到該題庫的索引資料");

    // Remove from index array
    systemBanksIndexData.splice(bankIndex, 1);

    try {
        let sha = null;
        const getRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/system-banks-index.json`, {
            headers: { 'Authorization': `token ${token}` }
        });
        if (getRes.ok) {
            const getData = await getRes.json();
            sha = getData.sha;
        }

        const indexB64 = btoa(encodeURIComponent(JSON.stringify(systemBanksIndexData, null, 4)).replace(/%([0-9A-F]{2})/g, function(match, p1) {
            return String.fromCharCode('0x' + p1);
        }));

        const updateBody = {
            message: `Remove system bank ${fileName}`,
            content: indexB64
        };
        if (sha) updateBody.sha = sha;

        const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/system-banks-index.json`, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updateBody)
        });

        if (!res.ok) throw new Error("更新題庫目錄失敗");

        alert("✅ 成功清除題庫！");
        window.location.reload();
    } catch (e) {
        alert("清除失敗：" + e.message);
    }
}
