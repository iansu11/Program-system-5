const defaultTemplates = { cpp: '#include <iostream>\nusing namespace std;\n\nint main() {\n    // your code here\n    return 0;\n}', python: '# your code here\n' };

// ==========================================
// 題庫後台管理邏輯 (js/admin.js)
// ==========================================

let adminProbId = null;
let adminTempTemplates = { cpp: '', python: '' };
let currentAdminLang = 'cpp';

function autoResize(textarea) {
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
}

function enableTabInTextarea(id) {
    const el = document.getElementById(id); 
    if (!el) return;
    if (el.dataset.tabEnabled) return;
    el.dataset.tabEnabled = "true";
    el.addEventListener('keydown', function(e) {
        if (e.key === 'Tab') { 
            e.preventDefault(); 
            this.setRangeText('    ', this.selectionStart, this.selectionEnd, 'end');
        }
    });
}

function initAdmin() {
    const path = window.location.pathname;
    const urlParams = new URLSearchParams(window.location.search);
    let probIdStr = null;
    if (urlParams.has('probId')) {
        probIdStr = urlParams.get('probId');
    } else {
        const match = path.match(/^\/admin\/([a-zA-Z0-9_-]+)$/);
        probIdStr = match ? match[1] : null;
    }
    
    if (!probIdStr) {
        alert("找不到題目 ID，返回大廳");
        window.location.href = '/categories';
        return;
    }
    
    adminProbId = probIdStr;
    const p = db.problems.find(x => String(x.id) === String(adminProbId));
    
    if (!p) {
        alert("找不到此題目，可能已被刪除");
        window.location.href = '/categories';
        return;
    }

    document.getElementById('view-admin').style.display = 'flex';
    renderAdmin();
    initAdminResizer();
    enableTabInTextarea('editTemplate');
    enableTabInTextarea('modelAnswerInput');
}

function goToWorkspace() {
    window.open('/workspace/' + adminProbId + '&fromAdmin=1', '_blank');
}

function renderAdmin() {
    const p = db.problems.find(x => String(x.id) === String(adminProbId));
    if (!p) return;
    
    document.getElementById('editTitle').value = p.title || "";
    document.getElementById('editDesc').value = p.desc || "";
    
    adminTempTemplates.cpp = (p.tpl_cpp !== undefined) ? p.tpl_cpp : (p.templateCode !== undefined ? p.templateCode : defaultTemplates.cpp); 
    adminTempTemplates.python = (p.tpl_python !== undefined) ? p.tpl_python : defaultTemplates.python;
    document.getElementById('adminLangSelect').value = 'cpp'; 
    currentAdminLang = 'cpp';
    
    adminCurrentFileIndex = -1;
    adminMultiFiles = p.multiFiles ? JSON.parse(JSON.stringify(p.multiFiles)) : [];
    
    const multiFileCheck = document.getElementById('adminEnableMultiFile');
    if (multiFileCheck) multiFileCheck.checked = !!p.isMultiFile;
    
    document.getElementById('editTemplate').value = adminTempTemplates.cpp;

    toggleAdminMultiFile();

    const c = document.getElementById('adminTestCases'); 
    if (c) {
        c.innerHTML = ''; 
        (p.testCases || []).forEach(tc => addTestCaseUI(tc.input, tc.output)); 
        setTimeout(() => { 
            document.querySelectorAll('#adminTestCases textarea').forEach(ta => autoResize(ta)); 
        }, 0);
    }
}

function changeAdminLang() {
    if (adminCurrentFileIndex === -1) { 
        adminTempTemplates[currentAdminLang] = document.getElementById('editTemplate').value; 
    }
    
    const newLang = document.getElementById('adminLangSelect').value;
    currentAdminLang = newLang;
    
    const tabsContainer = document.getElementById('adminEditorTabs');
    const multiFileCheck = document.getElementById('adminEnableMultiFile');
    if (tabsContainer && multiFileCheck) {
        tabsContainer.style.display = (multiFileCheck.checked && newLang === 'cpp') ? 'flex' : 'none';
    }
    
    switchAdminFile(-1); // Switch back to main template view for the new language
}

async function saveAdminAndBack() { 
    const p = db.problems.find(x => String(x.id) === String(adminProbId)); 
    
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

    const multiFileCheck = document.getElementById('adminEnableMultiFile');
    p.isMultiFile = multiFileCheck ? multiFileCheck.checked : false;
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

    const btn = document.querySelector('#view-admin .btn-primary');
    if (btn) { btn.disabled = true; btn.innerText = "⏳ 儲存中..."; }
    await saveToLocal(true, false); 
    
    if (typeof syncProblemDeltaToCloud === 'function') {
        await syncProblemDeltaToCloud(adminProbId, p);
    }

    if (btn) { btn.disabled = false; btn.innerText = "💾 儲存並返回"; }
    window.location.href = '/workspace/' + adminProbId;
}

function insertBoldToDesc() {
    const descArea = document.getElementById('editDesc');
    const start = descArea.selectionStart;
    const end = descArea.selectionEnd;
    const text = descArea.value;

    if (start !== end) {
        const selectedText = text.substring(start, end);
        descArea.value = text.substring(0, start) + "**" + selectedText + "**" + text.substring(end);
        descArea.selectionStart = start + 2;
        descArea.selectionEnd = end + 2;
    } else {
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

function toggleAdminMultiFile() {
    const multiFileCheck = document.getElementById('adminEnableMultiFile');
    const isEnabled = multiFileCheck ? multiFileCheck.checked : false;
    const tabsContainer = document.getElementById('adminEditorTabs');
    if (tabsContainer) {
        tabsContainer.style.display = (isEnabled && currentAdminLang === 'cpp') ? 'flex' : 'none';
    }
    
    if (isEnabled && adminMultiFiles.length === 0) {
        adminMultiFiles.push({ name: "Class.cpp", tpl: "\n" });
        adminMultiFiles.push({ name: "Class.h", tpl: "\n" });
    }
    
    if (!isEnabled || currentAdminLang !== 'cpp') { 
        switchAdminFile(-1); 
    } else { 
        renderAdminTabs(); 
    }
}

function renderAdminTabs() {
    const tabsContainer = document.getElementById('adminEditorTabs');
    if (!tabsContainer) return;
    
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
    if (adminCurrentFileIndex === -1) { 
        adminTempTemplates[currentAdminLang] = document.getElementById('editTemplate').value; 
    } else if (adminMultiFiles[adminCurrentFileIndex]) { 
        adminMultiFiles[adminCurrentFileIndex].tpl = document.getElementById('editTemplate').value; 
    }
    
    adminCurrentFileIndex = idx;
    
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
        
        adminMultiFiles.splice(idx, 1); 

        if (wasCurrentTab) {
            adminCurrentFileIndex = -1;
            document.getElementById('editTemplate').value = adminTempTemplates[currentAdminLang] || ""; 
        }
        renderAdminTabs(); 
    }
}

function initAdminResizer() {
    const handle = document.getElementById('adminDragHandle'); 
    const bottomArea = document.getElementById('adminRowBottom');
    
    if (!handle || !bottomArea) return;

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

function doAdminDrag(e) { 
    const bottomArea = document.getElementById('adminRowBottom');
    if (!bottomArea) return;
    const deltaY = window.adminDragStartY - e.clientY; 
    let newHeight = window.adminDragStartHeight + deltaY; 
    if (newHeight < 100) newHeight = 100; 
    bottomArea.style.height = newHeight + 'px'; 
}

function stopAdminDrag() { 
    document.removeEventListener('mousemove', doAdminDrag); 
    document.removeEventListener('mouseup', stopAdminDrag); 
    document.body.classList.remove('resizing'); 
}

function openModelAnswerUI() {
    const p = db.problems.find(x => String(x.id) === String(adminProbId));
    if (!p) return;
    if (p.testCases && p.testCases.length > 0) {
        document.getElementById('modelAnswerInput').value = p.testCases[0].output || "";
    } else {
        document.getElementById('modelAnswerInput').value = "";
    }
    const modal = document.getElementById('modelAnswerModal');
    if (modal) modal.style.display = 'flex';
}

function saveModelAnswerFromModal() {
    const modalInput = document.getElementById('modelAnswerInput').value;
    
    // update test cases UI list if empty, else update first output
    const inputs = document.querySelectorAll('.tc-input'); 
    const outputs = document.querySelectorAll('.tc-output'); 
    
    if (inputs.length === 0) {
        addTestCaseUI("", modalInput);
    } else {
        outputs[0].value = modalInput;
    }
    
    const modal = document.getElementById('modelAnswerModal');
    if (modal) modal.style.display = 'none';
}

function openHistoryModal() {
    const modal = document.getElementById('historyModal');
    if (!modal) return;
    
    const listDiv = document.getElementById('historyList');
    const codeView = document.getElementById('historyCodeView');
    
    if (listDiv) listDiv.innerHTML = "";
    if (codeView) codeView.value = "";
    
    let histList = typeof executionHistories !== 'undefined' ? executionHistories[adminProbId] : null;
    if (!histList && typeof currentBankUrl !== 'undefined' && typeof executionHistories !== 'undefined') {
        histList = executionHistories[currentBankUrl + "_" + adminProbId];
    }
    histList = histList || [];
    
    if (histList.length === 0) {
        if (listDiv) listDiv.innerHTML = "<div style='color:#666; text-align:center; padding:30px; font-size:1.1rem;'>尚無執行紀錄</div>";
    } else {
        histList.forEach((hist, idx) => {
            const item = document.createElement('div');
            item.className = 'hist-item';
            item.style.padding = '10px';
            item.style.borderBottom = '1px solid #333';
            item.style.cursor = 'pointer';
            
            item.onclick = () => {
                const items = listDiv.querySelectorAll('.hist-item');
                items.forEach(el => el.style.background = 'transparent');
                item.style.background = '#2a2a2a';
                if (codeView) codeView.value = hist.code || "";
            };
            
            item.innerHTML = `<div style="font-size:0.85rem; color:#aaa;">${hist.time || ''} <span style="color:var(--accent)">[${hist.lang || ''}]</span></div><div style="margin-top:5px; font-weight:bold;">${hist.status || ''}</div>`;
            if (listDiv) listDiv.appendChild(item);
            
            if (idx === 0) item.click();
        });
    }

    modal.style.display = 'flex';
}

function clearProblemHistory() {
    if (confirm('確定清空此題紀錄？此動作無法復原。')) {
        const list = document.getElementById('historyList');
        if (list) list.innerHTML = "<div style='color:#666; text-align:center; padding:30px; font-size:1.1rem;'>尚無執行紀錄</div>";
        const codeView = document.getElementById('historyCodeView');
        if (codeView) codeView.value = '';
        
        if (typeof executionHistories !== 'undefined') {
            delete executionHistories[adminProbId];
            if (typeof currentBankUrl !== 'undefined') {
                delete executionHistories[currentBankUrl + "_" + adminProbId];
            }
            const historyString = JSON.stringify(executionHistories);
            localStorage.setItem('oj_v15_history', historyString);
            if (typeof currentUser !== 'undefined' && currentUser && typeof personalDb !== 'undefined') {
                personalDb.collection('users').doc(currentUser.uid).set({
                    historyData: historyString
                }, { merge: true });
            }
        }
    }
}

function copyModelAnswer() {
    const input = document.getElementById('modelAnswerInput');
    if (input && input.value) {
        navigator.clipboard.writeText(input.value);
        alert('已複製示範解答');
    }
}

function pasteModelAnswer() {
    navigator.clipboard.readText().then(clipText => {
        const input = document.getElementById('modelAnswerInput');
        if (input) input.value = clipText;
    });
}

function copyBackupCode() {
    const backupStr = document.getElementById('backupStr');
    if (backupStr && backupStr.value) {
        navigator.clipboard.writeText(backupStr.value);
        alert('已複製備份代碼');
    }
}

function execRestore() {
    alert('此功能需要在 workspace 中執行');
}

if (window.isDbLoaded) {
    initAdmin();
} else {
    window.addEventListener('dbLoaded', initAdmin);
}
