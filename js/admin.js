// ==========================================
// 題庫後台管理邏輯 (js/admin.js)
// ==========================================

let adminProbId = null;

window.addEventListener('dbLoaded', () => {
    // 取得網址上的題目 ID
    const urlParams = new URLSearchParams(window.location.search);
    const probIdStr = urlParams.get('probId');
    
    if (!probIdStr) {
        alert("找不到題目 ID，返回大廳");
        window.location.href = 'dashboard.html';
        return;
    }
    
    adminProbId = parseInt(probIdStr, 10);
    const p = db.problems.find(x => x.id === adminProbId);
    
    if (!p) {
        alert("找不到此題目，可能已被刪除");
        window.location.href = 'dashboard.html';
        return;
    }

    document.getElementById('view-admin').style.display = 'flex';
    renderAdmin();
});

function goBackToWorkspace() {
    window.location.href = 'workspace.html?probId=' + adminProbId;
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
