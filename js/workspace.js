    function enableTabInTextarea(id) {
\n        const el = document.getElementById(id); 
\n\n    function autoResize(el) { 
\n        el.style.height = 'auto'; 
\n\n    function initResizer() {
\n        const handle = document.getElementById('dragHandle'); 
\n\n            function doDrag(e) { 
\n                const deltaY = startY - e.clientY; 
\n\n            function stopDrag() { 
\n                document.removeEventListener('mousemove', doDrag); 
\n\n    function renderWorkspaceTabs() {
\n        const p = db.problems.find(x => x.id === currentProbId);
\n\n    function switchWorkspaceFile(idx) {
\n        const p = db.problems.find(x => x.id === currentProbId);
\n\n    function changeWorkspaceLang() { 
\n        const p = db.problems.find(x => x.id === currentProbId); 
\n\n    function toggleCompileMode() {
\n        const btn = document.getElementById('modeBtn');
\n\n    function resetCode() { 
\n        if (!confirm("重置程式碼到初始模板？這將會還原本題的所有檔案。")) return; 
\n\n    function adjustFontSize(change) { 
\n        currentFontSize += change; 
\n\n    function copyCode() { 
\n        const code = editor.getValue(); 
\n\n    function openModelAnswerUI() { 
\n        const p = db.problems.find(x => x.id === currentProbId); 
\n\n    function saveModelAnswerFromModal() { 
\n        const p = db.problems.find(x => x.id === currentProbId); 
\n\n    function copyModelAnswer() { 
\n        const text = document.getElementById('modelAnswerInput'); 
\n\n    async function pasteModelAnswer() { 
\n        try { 
\n\n    async function runCode() {
\n        const p = db.problems.find(x => x.id === currentProbId); 
\n\n    function openHistoryModal() {
\n        const histList = executionHistories[currentProbId] || []; 
\n\n    function clearProblemHistory() { 
\n        if (!confirm("確定要清空這題的所有歷史執行紀錄嗎？此動作無法復原。")) return; 
\n\n    function openAIHelperModal() {
\n        const p = db.problems.find(x => x.id === currentProbId); 
\n\n    function copyPromptOnly() { 
\n        const text = document.getElementById('aiPromptOutput'); 
\n\n    function copyPromptAndOpenGemini() { 
\n        const text = document.getElementById('aiPromptOutput'); 
\n\n    function downloadCode() {
\n        const p = db.problems.find(x => x.id === currentProbId);
\n\n    async function handleCodeUpload(input) {
\n	const files = input.files;
\n\n
