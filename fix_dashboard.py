import re

with open('dashboard.html', 'r', encoding='utf-8') as f:
    content = f.read()

# We want to replace from the end of view-custom-portal up to view-problem-list
match = re.search(r'(<div id="view-custom-portal".*?</div>\s*</div>)', content, re.DOTALL)
if match:
    custom_portal_end = match.end()
    
    match_prob_list = re.search(r'(<div id="view-problem-list">)', content[custom_portal_end:])
    if match_prob_list:
        prob_list_start = custom_portal_end + match_prob_list.start()
        
        # New text to insert
        new_text = """

<div id="view-portal">
    <div class="portal-container">
        
        <h2 style="font-size: 2rem; margin-bottom: 10px; margin-top: 0; letter-spacing: 1px;">系統預設題庫</h2>
        <p style="color: #a7f3d0; margin-bottom: 30px;">🟢 雲端同步已開啟，執行紀錄將永久保存於您的帳號</p>
        
        <div class="portal-grid">
            <button class="bank-btn" onclick="fetchAndLoadBank('https://raw.githubusercontent.com/iansu11/Program-system-image/refs/heads/main/program-1.json', '📚 114-第一學期程式設計')">
                <span>📚 114-第一學期程式設計</span>
                <span class="bank-desc">載入 program-1.json</span>
            </button>
            <button class="bank-btn" onclick="fetchAndLoadBank('https://raw.githubusercontent.com/iansu11/Program-system-image/refs/heads/main/program-oop.json', '🏆 114-第二學期物件導向')">
                <span>🏆 114-第二學期物件導向</span>
                <span class="bank-desc">載入 program-oop.json</span>
            </button>
            <button class="bank-btn" onclick="fetchAndLoadBank('https://raw.githubusercontent.com/iansu11/Program-system-image/refs/heads/main/program-exam.json', '🔥 其他題目')">
                <span>🔥 其他題目</span>
                <span class="bank-desc">載入 program-exam.json</span>
            </button>
        </div>
    </div>
</div>

<div id="view-categories">
    <div style="max-width: 1400px; margin: 0 auto; width: 100%;">
        <div class="page-header">
            <div style="display:flex; align-items:center; gap:15px;">
                <h2 id="currentBankName" style="margin:0; color:#111827;"><i class="fa-solid fa-folder-open" style="color: #2563eb; margin-right: 8px;"></i> 目前題庫</h2>
            </div>
            
            <div style="display:flex; gap:10px; flex-wrap: wrap; align-items: center; justify-content: flex-end;">
                <button id="catSortBtn" class="btn btn-outline btn-header-action" onclick="toggleCatSortMode()">⇅ 調整順序</button>
                <button class="btn btn-outline btn-header-action" onclick="openBackupUI()">📦 備份/還原</button>
                <button class="btn btn-warning" onclick="resetCurrentBank()">🔄 重新載入本題庫</button>
                <button class="btn btn-danger" onclick="hardResetAll()">💣 全部重置</button>
                <button class="btn btn-primary" onclick="createCategory()">+ 新增分類</button>
            </div>
        </div>
        <div id="groupedCategoryContainer"></div>
    </div>
</div>

"""
        
        final_content = content[:custom_portal_end] + new_text + content[prob_list_start:]
        with open('dashboard.html', 'w', encoding='utf-8') as f:
            f.write(final_content)
        print("Successfully restored dashboard.html")
    else:
        print("Could not find view-problem-list")
else:
    print("Could not find view-custom-portal")
