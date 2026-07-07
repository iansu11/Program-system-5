const defaultTemplates = { cpp: '#include <iostream>\nusing namespace std;\n\nint main() {\n    // your code here\n    return 0;\n}', python: '# your code here\n' };

// ==========================================
// 題庫後台管理邏輯 (js/admin.js)
// ==========================================

let adminProbId = null;

function initAdmin() {
    const path = window.location.pathname;
    const match = path.match(/^\/admin\/([a-zA-Z0-9_-]+)$/);
    const probIdStr = match ? match[1] : null;
    
    if (!probIdStr) {
        alert("找不到題目 ID，返回大廳");
        window.location.href = '/categories';
        return;
    }
    
    adminProbId = probIdStr;
    const p = db.problems.find(x => x.id === adminProbId);
    
    if (!p) {
        alert("找不到此題目，可能已被刪除");
        window.location.href = '/categories';
        return;
    }

    document.getElementById('view-admin').style.display = 'flex';
    renderAdmin();
}

function goBackToWorkspace() {
    window.location.href = '/workspace.html?probId=' + adminProbId;
}

function renderAdmin() {
    const p = db.problems.find(x => x.id === adminProbId);
    if (!p) return;
    
    document.getElementById('adminTitle').value = p.title;
    document.getElementById('adminDesc').value = p.desc || "";
    
    renderTestCasesAdmin(p);
}

function renderTestCasesAdmin(p) {
    const cont = document.getElementById('adminTestCases');
    cont.innerHTML = '';
    
    p.testCases = p.testCases || [];
    
    p.testCases.forEach((tc, idx) => {
        const div = document.createElement('div');
        div.className = 'tc-row';
        div.innerHTML = `
            <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                <label>Case ${idx + 1}</label>
                <button class="btn btn-danger btn-sm" onclick="deleteTestCase(${idx})">刪除</button>
            </div>
            <textarea placeholder="Input" onchange="updateTestCase(${idx}, 'input', this.value)">${tc.input}</textarea>
            <textarea placeholder="Expected Output" onchange="updateTestCase(${idx}, 'output', this.value)">${tc.output}</textarea>
        `;
        cont.appendChild(div);
    });
}

function updateTestCase(idx, field, value) {
    const p = db.problems.find(x => x.id === adminProbId);
    if (p && p.testCases[idx]) {
        p.testCases[idx][field] = value;
    }
}

function addTestCase() {
    const p = db.problems.find(x => x.id === adminProbId);
    if (p) {
        p.testCases.push({ input: "", output: "" });
        renderTestCasesAdmin(p);
    }
}

function deleteTestCase(idx) {
    const p = db.problems.find(x => x.id === adminProbId);
    if (p) {
        p.testCases.splice(idx, 1);
        renderTestCasesAdmin(p);
    }
}

function saveProblem() {
    const p = db.problems.find(x => x.id === adminProbId);
    if (!p) return;
    
    p.title = document.getElementById('adminTitle').value.trim();
    p.desc = document.getElementById('adminDesc').value;
    
    saveToLocal(true, false);
    syncProblemDeltaToCloud(p.id, p);
    
    alert("題目設定已儲存！");
}

// === Migrated from legacy ===
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


function doAdminDrag(e) { 
    const bottomArea = document.getElementById('adminRowBottom');
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


if (window.isDbLoaded) {
    initAdmin();
} else {
    window.addEventListener('dbLoaded', initAdmin);
}
