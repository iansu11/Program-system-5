const defaultTemplates = { cpp: '#include <iostream>\nusing namespace std;\n\nint main() {\n    // your code here\n    return 0;\n}', python: '# your code here\n' };


let currentFontSize = 16;
let adminTempTemplates = { cpp: '', python: '' };
let currentAdminLang = 'cpp';
let pendingRestoreFileName = '';
let currentLang = 'cpp';

// ==========================================
// 程式碼編輯與執行區 (js/workspace.js)
// ==========================================

currentFileIndex = -1;

let currentProbId = null;
let editor = null;
let currentCompileMode = 'wandbox'; 


function initWorkspace() {
try {
    if (!editor) {
        editor = ace.edit("editor");
        editor.setTheme("ace/theme/twilight");
        editor.session.setMode("ace/mode/c_cpp");
        editor.setFontSize(currentFontSize);
        editor.setShowPrintMargin(false);
        if (typeof initResizer === 'function') initResizer();
    }

    const path = window.location.pathname;
    const urlParams = new URLSearchParams(window.location.search);
    let probIdStr = null;

    // 1. 優先嘗試從 Vercel 轉導過去的 URL 查詢參數中獲取 probId
    if (urlParams.has('probId')) {
        probIdStr = urlParams.get('probId');
    } 
    // 2. 如果沒有參數，嘗試直接從網址路徑中抽取出最後一段作為題目 ID
    else {
        const pathSegments = path.split('/').filter(Boolean);
        // 如果網址結構符合 /categories/xxx/problems/yyy，最後一段就是題目 ID
        if (pathSegments.length >= 4 && pathSegments[pathSegments.length - 2] === 'problems') {
            probIdStr = pathSegments[pathSegments.length - 1];
        } else {
            // 備用方案：傳統的 /workspace/題目ID 結構
            const match = path.match(/^\/workspace\/(.+)$/);
            probIdStr = match ? match[1] : null;
            if (probIdStr) {
                try { probIdStr = decodeURIComponent(probIdStr); } catch(e) {}
                if (probIdStr.endsWith('/')) probIdStr = probIdStr.slice(0, -1);
            }
        }
    }

    if (!probIdStr) {
        alert("找不到題目 ID，返回大廳");
        window.location.href = '/categories';
        return;
    }

    currentProbId = probIdStr;
    
    // 檢查 db 的完整性
    if (!db || !db.problems) {
        console.error("資料庫未就緒，延遲初始化");
        return;
    }

    const p = db.problems.find(x => String(x.id) === String(currentProbId));
    if (!p) {
        alert("找不到該題目的詳細資料！");
        window.location.href = '/categories';
        return;
    }

    document.getElementById('wsTitle').innerText = p.title || "未命名題目";
    const descContent = p.desc ? p.desc : "這個題目目前沒有描述。請回到設定頁面加入描述。";
    
    // 依據 78-2.html 完整複製 parseContent 邏輯
    function parseContent(text) {
        if (!text) return "";
        let html = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\n/g, '<br>');
        
        // 解析粗體 **文字**
        html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        // 解析行內程式碼 `文字`
        html = html.replace(/`(.*?)`/g, '<code style="background:#f1f5f9; padding:2px 6px; border-radius:4px; font-family:monospace; color:#ef4444;">$1</code>');
        return html;
    }

    document.getElementById('wsDesc').innerHTML = parseContent(descContent);
    
    const lang = p.lastLang || 'cpp'; 
    document.getElementById('langSelect').value = lang; 
    
    currentFileIndex = -1; // 進入題庫時預設顯示 main
    if (typeof renderWorkspaceTabs === 'function') renderWorkspaceTabs();

    // 確保空字串模板不會被覆蓋
    if (p.tpl_cpp === undefined) p.tpl_cpp = p.templateCode !== undefined ? p.templateCode : defaultTemplates.cpp;
    if (p.tpl_python === undefined) p.tpl_python = defaultTemplates.python;

    // 確保 multiFiles 的 code 屬性存在
    if (p.isMultiFile && p.multiFiles) {
        p.multiFiles.forEach(f => {
            if (f.code === undefined) f.code = f.tpl !== undefined ? f.tpl : "";
        });
    }

    const fromAdmin = urlParams.has('fromAdmin') && urlParams.get('fromAdmin') === '1';

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

    if (lang === 'cpp') { 
        editor.session.setMode("ace/mode/c_cpp"); 
        editor.setValue(p.code_cpp !== undefined ? p.code_cpp : p.tpl_cpp, -1); 
    } else if (lang === 'python') { 
        editor.session.setMode("ace/mode/python"); 
        editor.setValue(p.code_python !== undefined ? p.code_python : p.tpl_python, -1); 
    }
    
    document.getElementById('outputLogs').innerHTML = '<div style="color:#666;">等待執行...</div>';
    document.getElementById('view-workspace').style.display = 'flex';
  } catch (e) {
    document.body.innerHTML = '<div style="color:red; padding:20px; font-size:20px;">CRITICAL ERROR in initWorkspace: <br><pre>' + e.stack + '</pre></div>';
    console.error(e);
  }
}


// ==========================================
// 輔助功能
// ==========================================
    function toggleCompileMode() {
        const btn = document.getElementById('modeBtn');
    
        if (currentCompileMode === 'wandbox') {
            // 1. 從 雲端 切換到 自建雲端
            currentCompileMode = 'custom';
            btn.innerHTML = "🚀 自建雲端";
            btn.style.color = "#a855f7"; // 紫色 (區分用)
            btn.style.borderColor = "#a855f7";

        } else if (currentCompileMode === 'custom') {
            // 2. 從 自建雲端 切換到 本機
            currentCompileMode = 'local';
            btn.innerHTML = "🔌 本機編譯";
            btn.style.color = "var(--success)"; // 綠色
            btn.style.borderColor = "var(--success)";

        } else {
            // 3. 從 本機 切換回 雲端 (Wandbox)
            currentCompileMode = 'wandbox';
            btn.innerHTML = "☁️ 雲端編譯";
            btn.style.color = "var(--accent)"; // 藍色
            btn.style.borderColor = "var(--accent)";
        }
    }

function openModelAnswerModal() {
    const p = db.problems.find(x => String(x.id) === String(currentProbId));
    if (p && p.modelAnswer) {
        document.getElementById('modelAnswerInput').value = p.modelAnswer;
    } else {
        document.getElementById('modelAnswerInput').value = "";
    }
    document.getElementById('modelAnswerModal').style.display = 'flex';
}

function copyModelAnswer() {
    const input = document.getElementById('modelAnswerInput');
    input.select();
    document.execCommand('copy');
    alert("示範解答已複製！");
}

function pasteModelAnswer() {
    const input = document.getElementById('modelAnswerInput');
    input.value = editor.getValue();
}

function saveModelAnswerFromModal() {
    const p = db.problems.find(x => String(x.id) === String(currentProbId));
    if (p) {
        p.modelAnswer = document.getElementById('modelAnswerInput').value;
        saveToLocal(true, false);
        syncProblemDeltaToCloud(p.id, { modelAnswer: p.modelAnswer });
        alert("示範解答已設定並存檔！");
    }
    document.getElementById('modelAnswerModal').style.display = 'none';
}

// === Migrated from legacy ===
function changeWorkspaceLang() { 
        const p = db.problems.find(x => String(x.id) === String(currentProbId)); 
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
        
        const p = db.problems.find(x => String(x.id) === String(currentProbId)); 
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
        const p = db.problems.find(x => String(x.id) === String(currentProbId)); 
        
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
        const p = db.problems.find(x => String(x.id) === String(currentProbId)); 
        document.getElementById('modelAnswerInput').value = p.modelAnswer || ""; 
        document.getElementById('modelAnswerModal').style.display = 'flex'; 
    }

    function openHistoryModal() {
        let histList = executionHistories[currentProbId];
        if (!histList && typeof currentBankUrl !== 'undefined') {
            histList = executionHistories[currentBankUrl + "_" + currentProbId];
        }
        histList = histList || []; 
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
        const p = db.problems.find(x => String(x.id) === String(currentProbId)); 
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
                if (currentView === 'view-problem-list') window.location.href='/categories';
            } else { 
                throw new Error(); 
            } 
        } catch(e) { 
            alert("代碼無效或格式錯誤"); 
        } 
    }

    function downloadCode() {
        const p = db.problems.find(x => String(x.id) === String(currentProbId));
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

function resetCode() { 
        if (!confirm("重置程式碼到初始模板？這將會還原本題的所有檔案。")) return; 
        
        const p = db.problems.find(x => String(x.id) === String(currentProbId)); 
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

async function handleCodeUpload(input) {
	const files = input.files;
	if (!files || files.length === 0) return;

	const p = db.problems.find(x => String(x.id) === String(currentProbId));
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

function openModelAnswerUI() { 
        const p = db.problems.find(x => String(x.id) === String(currentProbId)); 
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

function openAIHelperModal() {
        const p = db.problems.find(x => String(x.id) === String(currentProbId)); 
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

function switchWorkspaceFile(idx) {
        const p = db.problems.find(x => String(x.id) === String(currentProbId));
        
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

function renderWorkspaceTabs() {
    const p = db.problems.find(x => String(x.id) === String(currentProbId));
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


function doDrag(e) { 
    const consoleArea = document.getElementById('consoleArea');
    const paneRight = document.getElementById('paneRight');
    const deltaY = window.dragStartY - e.clientY; 
    let newHeight = window.dragStartHeight + deltaY; 
    if (newHeight < 40) newHeight = 40; 
    if (newHeight > paneRight.offsetHeight - 100) newHeight = paneRight.offsetHeight - 100; 
    consoleArea.style.height = newHeight + 'px'; 
    if(typeof editor !== 'undefined') editor.resize(); 
}
function stopDrag() { 
    document.removeEventListener('mousemove', doDrag); 
    document.removeEventListener('mouseup', stopDrag); 
    document.body.classList.remove('resizing'); 
    const editorDiv = document.getElementById('editor');
    if (editorDiv) editorDiv.style.pointerEvents = 'auto'; 
}



    async function runCode() {
        const p = db.problems.find(x => String(x.id) === String(currentProbId)); 
        if (!p || !p.testCases || p.testCases.length === 0) { 
            alert("無測資"); 
            return; 
        }
        
        const btn = document.getElementById('runBtn'); 
        const logs = document.getElementById('outputLogs'); 
        const lang = document.getElementById('langSelect').value; 
        
        // 儲存當前編輯器內的程式碼到變數中
        if (lang === 'cpp' && p.isMultiFile) {
            if (currentFileIndex === -1) p.code_cpp = editor.getValue();
            else p.multiFiles[currentFileIndex].code = editor.getValue();
        } else { 
            p['code_' + lang] = editor.getValue(); 
        }
        
        const mainCode = (lang === 'cpp' && p.isMultiFile) ? p.code_cpp : editor.getValue();

        // 整理多檔案資料，準備傳送給編譯伺服器
        let wandboxCodes = [];
        let localExtraFiles = [];
        let extraCppFiles = []; // 【修正1】紀錄額外的 .cpp 檔案名稱供 Wandbox 編譯連結使用

        if (lang === 'cpp' && p.isMultiFile && p.multiFiles) {
            p.multiFiles.forEach(f => {
                wandboxCodes.push({ file: f.name, code: f.code || "" });
                localExtraFiles.push({ name: f.name, content: f.code || "" });
                
                // 找出 .cpp 或 .c 結尾的附屬檔案
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
                    // 模式 A：公共雲端 (Wandbox)
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
                        tempDiv.innerHTML = `<div class="log-header" style="color:var(--fail)">❌ Case ${i+1}: 編譯錯誤</div><div class="log-details"><pre style="color:#f44747; margin:0;">${res.compiler_error || res.compiler_message}</pre></div>`;
                        const stopDiv = document.createElement('div'); 
                        stopDiv.style.textAlign = "center"; 
                        stopDiv.style.padding = "10px"; 
                        stopDiv.style.color = "#aaa"; 
                        stopDiv.innerHTML = "⚠️ 因編譯失敗，已終止後續測試。"; 
                        logs.appendChild(stopDiv);
                        isCompileError = true; 
                        break; 
                    }
                    if (res.status !== "0" && res.program_error) { 
                        tempDiv.innerHTML = `<div class="log-header" style="color:var(--fail)">❌ Case ${i+1}: 執行錯誤</div><div class="log-details"><pre style="color:#f44747; margin:0;">${res.program_error}</pre></div>`; 
                        continue; 
                    }
                    act = (res.program_message || "").trim();

                } else {
                    // 模式 B & C：使用你的 Python Server (本機或 Render 雲端)
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

                        // 🔴 關鍵點：根據模式決定目標網址
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
                            tempDiv.innerHTML = `<div class="log-header" style="color:var(--fail)">❌ Case ${i+1}: ${res.type || "Error"}</div><div class="log-details"><pre style="color:#f44747; margin:0;">${res.message || "Unknown Error"}</pre></div>`;
                            if (res.type === '編譯錯誤') { 
                                const stopDiv = document.createElement('div'); 
                                stopDiv.style.textAlign = "center"; 
                                stopDiv.style.padding = "10px"; 
                                stopDiv.style.color = "#aaa"; 
                                stopDiv.innerHTML = "⚠️ 因編譯失敗，已終止後續測試。"; 
                                logs.appendChild(stopDiv); 
                                isCompileError = true; 
                                break; 
                            }
                            continue;
                        }
                        act = (res.output || "").trim();
                    } catch (err) { 
                        if (err.name === 'AbortError') throw err; // 讓外層 catch 處理超時
                        tempDiv.innerHTML = `<div class="log-header" style="color:var(--fail)">❌ Case ${i+1}: 無法連線至伺服器</div><div class="log-details" style="color:#aaa; font-size:0.85rem;">請確認 ${currentCompileMode === 'local' ? '本機' : '雲端'} 伺服器是否已啟動。</div>`; 
                        isCompileError = true; 
                        break; 
                    }
                }

                // --- 恢復：原本用來判斷答案對錯的邏輯 ---
                let pass = act.replace(/\r\n/g, "\n") === exp.replace(/\r\n/g, "\n");
                if (pass) passCount++;
                
                let statusHtml = pass ? `<span style="color:var(--success)">✅ Case ${i+1}: 通過測試 (Accepted)</span>` : `<span style="color:var(--fail)">❌ Case ${i+1}: 答案錯誤 (Wrong Answer)</span>`;
                let actStyle = pass ? "color:#fff; border-left-color:var(--success);" : "color:var(--warning); border-left-color:var(--fail);";
                
                tempDiv.innerHTML = `<div class="log-header">${statusHtml}</div><div class="log-details"><div class="log-label">輸入 (Input):</div><div class="log-value">${inputData}</div><div class="log-label">預期輸出 (Expected):</div><div class="log-value">${exp}</div><div class="log-label">您的輸出 (Actual):</div><div class="log-value" style="${actStyle}">${act || "(無輸出)"}</div></div>`;

            } catch(e) { 
                if (e.name === 'AbortError') {
                    tempDiv.innerHTML = `<div style="color:var(--fail)">❌ Case ${i+1}: 執行超時 (Timeout)</div><div class="log-details" style="color:#aaa; font-size:0.85rem;">執行超過 15 秒已被系統強制中斷。<br>可能原因：程式碼陷入「無窮迴圈」或伺服器無回應。</div>`; 
                } else {
                    tempDiv.innerHTML = `<div style="color:var(--fail)">❌ Case ${i+1}: 網路連線錯誤</div><div class="log-details" style="color:#aaa; font-size:0.85rem;">無法連線至編譯伺服器，請檢查網路狀態。</div>`; 
                }
                isCompileError = true; 
                break; 
            }
        } // for 迴圈結束

        let finalStatus = "";
        if (isCompileError) { 
            finalStatus = `<span style="color:var(--fail)">❌ 編譯或連線失敗</span>`; 
        } else if (passCount === p.testCases.length) { 
            finalStatus = `<span style="color:var(--success)">✅ 全數通過 (${passCount}/${p.testCases.length})</span>`; 
                } else { 
            finalStatus = `<span style="color:var(--warning)">⚠️ 部分通過 (${passCount}/${p.testCases.length})</span>`; 
        }

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
            status: finalStatus,
            bankUrl: localStorage.getItem('oj_v15_bank_url') || '',
            bankName: localStorage.getItem('oj_v15_bank_name') || ''
        });
        
        if (typeof recent3Submissions !== 'undefined') {
            recent3Submissions = recent3Submissions.filter(s => String(s.probId) !== String(currentProbId));
            recent3Submissions.unshift({
                probId: String(currentProbId),
                title: p.title || '未知題目',
                status: finalStatus,
                time: new Date().toLocaleString('zh-TW', { hour12: false }),
                timestamp: new Date().getTime(),
                bankUrl: localStorage.getItem('oj_v15_bank_url') || '',
                bankName: localStorage.getItem('oj_v15_bank_name') || ''
            });
            recent3Submissions = recent3Submissions.slice(0, 3);
            localStorage.setItem('oj_v15_recent3', JSON.stringify(recent3Submissions));
        }

        if (executionHistories[currentProbId].length > 20) {
            executionHistories[currentProbId].pop();
        }

        const historyString = JSON.stringify(executionHistories);
        localStorage.setItem('oj_v15_history', historyString);
        localStorage.setItem('oj_v15_data', JSON.stringify(db)); // 僅更新本機題庫暫存

        if (currentUser) {
            try {
                // 【修改】：僅將歷史紀錄同步到雲端，不再將「作答程式碼」寫入 customProblems
                const updatePayload = {
                    historyData: historyString,
                    lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
                };
                if (typeof recent3Submissions !== 'undefined') {
                    updatePayload.recent3Submissions = JSON.stringify(recent3Submissions);
                }
                await personalDb.collection('users').doc(currentUser.uid).set(updatePayload, { merge: true });
            } catch(e) {
                console.error("雲端歷史紀錄存檔失敗:", e);
            }
        }

        btn.disabled = false; 
        btn.innerText = "▶️ 執行";
    }


function goBackToProblemList() {
    autoSaveCode();
    const p = db.problems.find(x => String(x.id) === String(currentProbId));
    if (p) {
        window.location.href = '/categories' + p.catId + '/problems';
    } else {
        window.location.href = '/categories';
    }
}


window.addEventListener('dbLoaded', () => {
    if (typeof initWorkspace === 'function') initWorkspace();
});
if (window.isDbLoaded) {
    if (typeof initWorkspace === 'function') initWorkspace();
}

function goToAdmin() {
    window.location.href = '/admin/' + currentProbId;
}


function restoreHistoryCode() {
    const code = document.getElementById('historyCodeView').value;
    if (code) {
        editor.setValue(code, -1);
        document.getElementById('historyModal').style.display = 'none';
        alert('代碼已成功載入！');
    }
}
