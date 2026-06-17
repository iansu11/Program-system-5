
let currentFontSize = 16;
let adminTempTemplates = { cpp: '', python: '' };
let currentAdminLang = 'cpp';
let pendingRestoreFileName = '';

// ==========================================
// 程式碼編輯與執行區 (js/workspace.js)
// ==========================================

let currentProbId = null;
let editor = null;
let currentCompileMode = 'wandbox'; 

window.addEventListener('dbLoaded', () => {
    // 取得網址上的題目 ID
    const urlParams = new URLSearchParams(window.location.search);
    const probIdStr = urlParams.get('probId');
    
    if (!probIdStr) {
        alert("找不到題目 ID，返回大廳");
        window.location.href = 'dashboard.html';
        return;
    }
    
    currentProbId = parseInt(probIdStr, 10);
    const p = db.problems.find(x => x.id === currentProbId);
    
    if (!p) {
        alert("找不到此題目，可能已被刪除");
        window.location.href = 'dashboard.html';
        return;
    }
    
    // 初始化 Ace Editor
    if (!editor) {
        editor = ace.edit("editor");
        editor.setTheme("ace/theme/vscodedark");
        editor.setOptions({
            fontSize: "16px",
            showPrintMargin: false,
            wrap: true,
            enableBasicAutocompletion: true,
            enableLiveAutocompletion: true,
            useSoftTabs: true,
            tabSize: 4
        });
        
        // 根據上一次使用的語言自動切換
        const langSelect = document.getElementById('langSelect');
        if (langSelect && p.lastLang) {
            langSelect.value = p.lastLang;
        }
        changeLang(); 
    }
    
    document.getElementById('view-workspace').style.display = 'flex';
    renderWorkspace();
});

function goBackToProblemList() {
    // 自動儲存目前的程式碼
    autoSaveCode();
    
    const p = db.problems.find(x => x.id === currentProbId);
    if (p) {
        window.location.href = 'dashboard.html?catId=' + p.catId;
    } else {
        window.location.href = 'dashboard.html';
    }
}

function openAdmin() {
    autoSaveCode();
    window.location.href = 'admin.html?probId=' + currentProbId;
}

function changeLang() {
    const lang = document.getElementById('langSelect').value;
    if (lang === 'cpp') editor.session.setMode("ace/mode/c_cpp");
    else if (lang === 'python') editor.session.setMode("ace/mode/python");

    const p = db.problems.find(x => x.id === currentProbId);
    if (!p) return;
    
    p.lastLang = lang;
    
    if (lang === 'cpp') {
        editor.setValue(p.code_cpp || "", -1);
    } else {
        editor.setValue(p.code_python || "", -1);
    }
}

function autoSaveCode() {
    if (!editor || !currentProbId) return;
    const p = db.problems.find(x => x.id === currentProbId);
    if (!p) return;
    
    const lang = document.getElementById('langSelect').value;
    if (lang === 'cpp') {
        p.code_cpp = editor.getValue();
    } else {
        p.code_python = editor.getValue();
    }
    
    saveToLocal(true, false);
}

// 每 30 秒自動存檔
setInterval(autoSaveCode, 30000);

async function runCode() {
    const p = db.problems.find(x => x.id === currentProbId);
    if (!p) return;

    // 先自動存檔
    autoSaveCode();

    const lang = document.getElementById('langSelect').value;
    const mainCode = editor.getValue();
    const logs = document.getElementById('outputLogs');
    logs.innerHTML = ''; 

    if (lang === 'cpp' && p.isMultiFile) {
        if (!p.multiFiles || p.multiFiles.length === 0) {
            alert("此題目為多檔案測驗，但尚未設定標頭檔或實作檔！請通知老師。");
            return;
        }
    }

    if (!p.testCases || p.testCases.length === 0) {
        logs.innerHTML = '<div style="color:var(--warning);">此題尚未設定測資。</div>';
        return;
    }

    // 準備多檔案資料
    let wandboxCodes = [];
    let localExtraFiles = {};
    let extraCppFiles = []; 
    
    if (lang === 'cpp' && p.isMultiFile && p.multiFiles) {
        p.multiFiles.forEach(f => {
            wandboxCodes.push({ file: f.name, code: f.code || "" });
            localExtraFiles[f.name] = f.code || "";
            if (f.name.endsWith(".cpp")) {
                extraCppFiles.push(f.name);
            }
        });
    }

    const runBtn = document.querySelector('.ws-header .btn-success');
    const originalRunBtnHtml = runBtn.innerHTML;
    runBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 執行中...';
    runBtn.disabled = true;

    let isCompileError = false;
    let newHistory = [];

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
                    isCompileError = true;
                    break;
                }
                act = (res.program_output || "").trim();
                if (res.program_error) {
                    act += "\n[Error]\n" + res.program_error;
                }
            } else {
                const localPayload = { language: lang, code: mainCode, input: inputData };
                if (lang === 'cpp' && p.isMultiFile) {
                    localPayload.extraFiles = localExtraFiles;
                }
                
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
                    isCompileError = true;
                    break;
                }
                act = (res.output || "").trim();
            }

            const pass = (act === exp); 
            newHistory.push({ pass, act, exp, input: inputData }); 

            const statusHtml = pass ? `<span style="color:var(--success)">✅ Case ${i+1}: 通過</span>` : `<span style="color:var(--fail)">❌ Case ${i+1}: 失敗</span>`;
            const actStyle = pass ? "color:var(--success)" : "color:var(--fail)";
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
    }

    if (!isCompileError) {
        const historyKey = `${currentBankUrl}_${currentProbId}`;
        executionHistories[historyKey] = newHistory; 
        
        const key = `${historyKey}_history`;
        let arr = JSON.parse(localStorage.getItem(key) || "[]");
        arr.unshift({ time: new Date().toLocaleString(), code: mainCode, result: newHistory });
        if (arr.length > 30) arr = arr.slice(0, 30);
        localStorage.setItem(key, JSON.stringify(arr));
        
        saveToLocal(false, true); 
    }

    runBtn.innerHTML = originalRunBtnHtml;
    runBtn.disabled = false;
}

function renderWorkspace() {
    const p = db.problems.find(x => x.id === currentProbId);
    if (!p) return;
    
    document.getElementById('probTitle').innerText = p.title;
    
    const md = window.markdownit({ html: true });
    document.getElementById('probDesc').innerHTML = md.render(p.desc || "");
    
    document.getElementById('compileModeSelect').value = currentCompileMode;
}

// ==========================================
// 輔助功能
// ==========================================
function toggleCompileMode() {
    currentCompileMode = document.getElementById('compileModeSelect').value;
}

function openModelAnswerModal() {
    const p = db.problems.find(x => x.id === currentProbId);
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
    const p = db.problems.find(x => x.id === currentProbId);
    if (p) {
        p.modelAnswer = document.getElementById('modelAnswerInput').value;
        saveToLocal(true, false);
        syncProblemDeltaToCloud(p.id, { modelAnswer: p.modelAnswer });
        alert("示範解答已設定並存檔！");
    }
    document.getElementById('modelAnswerModal').style.display = 'none';
}
