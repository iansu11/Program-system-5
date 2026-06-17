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

    function checkUrlAndLoad() {
        if (!window.location.hash || window.location.hash === '#/login') {
            window.location.hash = '/source-selector';
        } else {
            handleHashChange();
        }
    }

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
            window.location.href='login.html';
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
            
            window.location.href='dashboard.html';
        } 
        else if (path === '/custom-portal') {
            renderCustomPortal();
            showView('view-custom-portal');
        }
        else if (path === '/portal') {
            window.location.href='dashboard.html';
        } 
        else if (path === '/categories') {
            currentCatId = null;
            
            //確保重新整理後，標題能顯示目前變數中的題庫名稱
            if (currentBankName) {
                const nameEl = document.getElementById('currentBankName');
                if (nameEl) nameEl.innerHTML = `<i class="fa-solid fa-folder-open" style="color: #60a5fa; margin-right: 8px;"></i> 目前題庫: ` + currentBankName;
            }
            
            renderCategoryList();
            window.location.href='dashboard.html';
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
            window.location.href='dashboard.html';
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
        window.location.href='workspace.html?probId='+(typeof currentProbId !== 'undefined' ? currentProbId : '');
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
        window.location.href='admin.html?probId='+(typeof currentProbId !== 'undefined' ? currentProbId : ''); 
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



    function openBackupUI() { 
        pendingRestoreFileName = ""; 
        document.getElementById('backupStr').value = btoa(encodeURIComponent(JSON.stringify(db))); 
        document.getElementById('backupModal').style.display = 'flex'; 
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
                if (currentView === 'view-problem-list') window.location.href='dashboard.html';
            } else { 
                throw new Error(); 
            } 
        } catch(e) { 
            alert("代碼無效或格式錯誤"); 
        } 
    }

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

