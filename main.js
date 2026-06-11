document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const fileInput = document.getElementById('csv-file');
    const fileNameDisplay = document.getElementById('file-name');
    const startBtn = document.getElementById('start-btn');
    const restartBtn = document.getElementById('restart-btn');
    const downloadBtn = document.getElementById('download-btn');
    
    const startScreen = document.getElementById('start-screen');
    const comparisonScreen = document.getElementById('comparison-screen');
    const resultScreen = document.getElementById('result-screen');
    
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    const comparisonLabel = document.getElementById('comparison-label');
    
    const cardA = document.getElementById('card-a');
    const cardB = document.getElementById('card-b');
    const textA = document.getElementById('text-a');
    const textB = document.getElementById('text-b');
    
    const rankingList = document.getElementById('ranking-list');
    const saveStatus = document.getElementById('save-status');

    // App State
    let items = []; // Array of { sample_id, item_id, text, score }
    let pairs = []; // Array of objects {pair_id, item1, item2}
    let currentPairIndex = 0;
    let judgments = [];
    let currentIsSwapped = false;
    let currentPairShownAt = null;
    let acceptingChoice = false;
    let labelName = '';
    let currentResultFileName = '';

    // 1. Handle File Upload
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            fileNameDisplay.textContent = file.name;
            labelName = getLabelNameFromFile(file.name);
            comparisonLabel.textContent = `ラベル: ${labelName}`;
            const reader = new FileReader();
            reader.onload = (event) => {
                const csvData = event.target.result;
                parseCSV(csvData);
            };
            reader.readAsText(file);
        }
    });

    // Parse CSV
    function parseCSV(csvText) {
        const lines = csvText.trim().split('\n');
        items = [];
        
        // Skip header and parse lines
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            // Handle basic CSV split
            const firstComma = line.indexOf(',');
            const secondComma = line.indexOf(',', firstComma + 1);
            
            if (firstComma !== -1 && secondComma !== -1) {
                const sample_id = line.substring(0, firstComma).trim();
                const item_id = line.substring(firstComma + 1, secondComma).trim();
                let text = line.substring(secondComma + 1).trim();
                
                // Remove surrounding quotes if they exist
                if (text.startsWith('"') && text.endsWith('"')) {
                    text = text.substring(1, text.length - 1);
                }

                items.push({
                    sample_id: parseInt(sample_id, 10),
                    item_id: item_id,
                    text: text,
                    score: 0
                });
            }
        }

        if (items.length !== 10) {
            alert(`CSVから10個のアイテムを読み込めませんでした。現在の読み込み数: ${items.length}個`);
        } else {
            startBtn.disabled = false;
            startBtn.classList.replace('secondary', 'primary');
            document.getElementById('start-btn').style.background = 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)';
            document.getElementById('start-btn').style.borderColor = 'transparent';
        }
    }

    // 2. Start Game
    startBtn.addEventListener('click', () => {
        if (items.length !== 10) return;
        
        // Reset scores
        items.forEach(item => item.score = 0);
        
        // Generate pairs
        pairs = [];
        let pairId = 1;
        for (let i = 0; i < items.length; i++) {
            for (let j = i + 1; j < items.length; j++) {
                pairs.push({
                    pair_id: pairId++,
                    item1: items[i],
                    item2: items[j]
                });
            }
        }
        
        judgments = [];
        // Shuffle pairs
        shuffleArray(pairs);
        
        currentPairIndex = 0;
        currentPairShownAt = null;
        currentResultFileName = '';
        acceptingChoice = true;
        comparisonLabel.textContent = `ラベル: ${labelName || '-'}`;
        showScreen(comparisonScreen);
        renderPair();
    });

    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    // 3. Render Pair
    function renderPair() {
        if (currentPairIndex >= pairs.length) {
            showResult();
            return;
        }

        const pair = pairs[currentPairIndex];
        // Randomize left/right
        currentIsSwapped = Math.random() > 0.5;
        currentPairShownAt = {
            iso: new Date().toISOString(),
            performanceNow: performance.now()
        };
        acceptingChoice = true;
        
        const item1 = currentIsSwapped ? pair.item2 : pair.item1; // text_a
        const item2 = currentIsSwapped ? pair.item1 : pair.item2; // text_b

        textA.textContent = item1.text;
        textB.textContent = item2.text;

        // Store current items in DOM for click handler
        cardA.dataset.selectedId = item1.sample_id;
        cardB.dataset.selectedId = item2.sample_id;

        // Update progress
        const currentNum = currentPairIndex + 1;
        progressText.textContent = `${currentNum} / 45`;
        progressBar.style.width = `${(currentNum / 45) * 100}%`;
    }

    // 4. Handle Choice
    function handleChoice(selectedId) {
        if (!acceptingChoice) return;
        acceptingChoice = false;

        const selectedAt = {
            iso: new Date().toISOString(),
            performanceNow: performance.now()
        };
        const responseTimeMs = currentPairShownAt
            ? Math.round(selectedAt.performanceNow - currentPairShownAt.performanceNow)
            : '';

        // Find item and increment score
        const selectedItem = items.find(i => i.sample_id === parseInt(selectedId, 10));
        if (selectedItem) {
            selectedItem.score += 1;
        }
        
        // Record judgment
        const pair = pairs[currentPairIndex];
        const itemA = currentIsSwapped ? pair.item2 : pair.item1;
        const itemB = currentIsSwapped ? pair.item1 : pair.item2;
        const direction = currentIsSwapped ? 'reverse' : 'forward';

        judgments.push({
            judgment_id: judgments.length + 1,
            pair_id: pair.pair_id,
            direction: direction,
            text_a: itemA,
            text_b: itemB,
            selected: selectedItem,
            pair_shown_at: currentPairShownAt ? currentPairShownAt.iso : '',
            selected_at: selectedAt.iso,
            response_time_ms: responseTimeMs,
            response_time_sec: responseTimeMs === '' ? '' : (responseTimeMs / 1000).toFixed(3)
        });
        
        currentPairIndex++;
        
        // Add subtle animation out
        cardA.style.opacity = '0';
        cardB.style.opacity = '0';
        
        setTimeout(() => {
            renderPair();
            cardA.style.opacity = '1';
            cardB.style.opacity = '1';
        }, 200);
    }

    cardA.addEventListener('click', () => handleChoice(cardA.dataset.selectedId));
    cardB.addEventListener('click', () => handleChoice(cardB.dataset.selectedId));

    // 5. Show Result
    function showResult() {
        acceptingChoice = false;
        showScreen(resultScreen);
        saveStatus.textContent = '結果を保存しています...';
        
        // Sort items by score (descending), then by sample_id (ascending) if tie
        const sortedItems = [...items].sort((a, b) => {
            if (b.score !== a.score) {
                return b.score - a.score;
            }
            return a.sample_id - b.sample_id;
        });

        rankingList.innerHTML = '';
        
        // Calculate ranks with ties (同点なら同順位)
        let currentRank = 1;
        let previousScore = null;

        sortedItems.forEach((item, index) => {
            if (item.score !== previousScore) {
                currentRank = index + 1;
            }
            
            const li = document.createElement('li');
            li.className = 'ranking-item';
            
            // Add specific class for top 3 ranks
            let rankClass = '';
            if (currentRank === 1) rankClass = 'rank-1';
            else if (currentRank === 2) rankClass = 'rank-2';
            else if (currentRank === 3) rankClass = 'rank-3';

            li.innerHTML = `
                <div class="rank-badge ${rankClass}">${currentRank}</div>
                <div class="ranking-text">
                    <div style="font-size:0.8rem; color:#94a3b8; margin-bottom:0.2rem">Sample ID: ${item.sample_id}</div>
                    ${item.text}
                </div>
                <div class="ranking-score">${item.score} pt</div>
            `;
            
            rankingList.appendChild(li);
            
            previousScore = item.score;
        });

        autoSaveResult();
    }

    // Restart
    restartBtn.addEventListener('click', () => {
        showScreen(startScreen);
        // We keep the parsed items, but reset score
        if (items.length === 10) {
            startBtn.disabled = false;
        }
    });

    // Download CSV
    downloadBtn.addEventListener('click', () => {
        if (!judgments || judgments.length === 0) return;

        downloadCsv(buildJudgmentCsv(), currentResultFileName || buildResultFileName());
    });

    function buildJudgmentCsv() {
        const csvRows = [];
        
        // Header
        const header = ['model', 'temperature', 'judgment_id', 'pair_id', 'direction', 'pair_shown_at', 'selected_at', 'response_time_ms', 'response_time_sec', 'text_a_sample_id', 'text_a_item_id', 'text_a', 'text_b_sample_id', 'text_b_item_id', 'text_b', 'selected_sample_id', 'selected_item_id', 'selected_text'];
        csvRows.push(header.join(','));

        judgments.forEach(j => {
            const esc = (text) => '"' + String(text).replace(/"/g, '""') + '"';
            csvRows.push([
                'human',
                '0.0',
                j.judgment_id,
                j.pair_id,
                j.direction,
                j.pair_shown_at,
                j.selected_at,
                j.response_time_ms,
                j.response_time_sec,
                j.text_a.sample_id,
                j.text_a.item_id,
                esc(j.text_a.text),
                j.text_b.sample_id,
                j.text_b.item_id,
                esc(j.text_b.text),
                j.selected.sample_id,
                j.selected.item_id,
                esc(j.selected.text)
            ].join(','));
        });

        return csvRows.join('\n');
    }

    async function autoSaveResult() {
        if (!judgments || judgments.length === 0) return;

        const csvString = buildJudgmentCsv();
        currentResultFileName = buildResultFileName();

        try {
            const response = await fetch('/save-result', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    fileName: currentResultFileName,
                    csv: csvString
                })
            });

            if (!response.ok) {
                throw new Error('save failed');
            }

            const result = await response.json();
            saveStatus.textContent = `結果を result/${result.fileName} に保存しました。`;
            downloadBtn.textContent = '同じCSVをダウンロード';
        } catch (error) {
            saveStatus.textContent = '自動保存できませんでした。下のボタンからCSVをダウンロードしてください。';
            downloadBtn.textContent = '結果をCSVでダウンロード';
        }
    }

    function downloadCsv(csvString, fileName) {
        // Add BOM for Excel compatibility in Japanese
        const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
        const blob = new Blob([bom, csvString], { type: 'text/csv;charset=utf-8;' });
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.style.display = 'none';
        
        document.body.appendChild(a);
        a.click();
        
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function getLabelNameFromFile(fileName) {
        const baseName = fileName.replace(/\.[^/.]+$/, '');
        return baseName
            .replace(/[_-]phrase[_-]samples$/i, '')
            .replace(/[_-]samples$/i, '')
            .trim() || 'label';
    }

    function buildResultFileName() {
        const safeLabel = (labelName || 'label').replace(/[\\/:*?"<>|]/g, '_');
        return `${safeLabel}_${formatLocalDateTime(new Date())}.csv`;
    }

    function formatLocalDateTime(date) {
        const pad = (number) => String(number).padStart(2, '0');
        return [
            date.getFullYear(),
            pad(date.getMonth() + 1),
            pad(date.getDate())
        ].join('') + '_' + [
            pad(date.getHours()),
            pad(date.getMinutes()),
            pad(date.getSeconds())
        ].join('');
    }

    // Helper: Show Screen
    function showScreen(screenElement) {
        [startScreen, comparisonScreen, resultScreen].forEach(s => {
            s.classList.remove('active');
        });
        screenElement.classList.add('active');
    }
});
