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
        list.innerHTML = '讀取失敗: ' + e.message;
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
        alert("新增失敗: " + e.message);
    }
}

async function deleteAnnouncement(id) {
    if (!confirm("確定要刪除此公告？")) return;
    try {
        await masterDb.collection('announcements').doc(id).delete();
        loadAnnouncements();
    } catch(e) {
        alert("刪除失敗: " + e.message);
    }
}

// === GitHub 整合設定 ===
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
        alert("儲存失敗: " + e.message);
    }
}

// === 發布題庫至 GitHub ===
async function loadCustomBanksForSelect() {
    const select = document.getElementById('sourceBankSelect');
    select.innerHTML = '<option value="">請選擇要發布的自訂題庫...</option>';
    
    // 需要從 personalDb 抓取完整的 customBanks，因為 local 可能沒有 problems 陣列
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
    if (!bankData) return alert("找不到題庫資料！");
    
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
