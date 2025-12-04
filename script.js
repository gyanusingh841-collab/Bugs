// --- CONFIGURATION ---
const API_KEY = 'AIzaSyA5X1MEweP0WvQbJ2uqG1NQON_fFyPm-lY'; 
const SPREADSHEET_ID = '1rZJ7Tu-huQi_EVVSjjy7uhUumaxbM08WwsKjtjYJCn0'; 
const SHEET_NAME = 'Website Issues'; 

let allData = [];
let priorityChartInstance = null;
let statusChartInstance = null;
let activeTab = 'All';

// --- TAB SELECTION LOGIC ---
function setTab(tabName) {
    activeTab = tabName;
    const tabs = ['All', 'Pending', 'Done', 'Other'];
    tabs.forEach(t => {
        const el = document.getElementById('tab' + t);
        if(t === activeTab) {
            el.classList.remove('opacity-70');
            el.classList.add('ring-2', 'ring-offset-2', 'ring-blue-500');
        } else {
            el.classList.add('opacity-70');
            el.classList.remove('ring-2', 'ring-offset-2', 'ring-blue-500');
        }
    });
    applyFilters();
}

// --- HELPER: DETECT & RENDER MEDIA ---
function renderMediaContent(url, text) {
    if (!url) {
        // अगर URL खाली है, लेकिन टेक्स्ट ही URL जैसा है
        if (text && (text.startsWith('http') || text.startsWith('www'))) {
            url = text;
        } else {
            return text; 
        }
    }
    
    const cleanUrl = url.trim();
    const cleanText = text || "View File";
    const ext = cleanUrl.split('.').pop().toLowerCase().split('?')[0];

    // 1. IMAGE HANDLING (jpg, png, gif, webp, jpeg)
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
        return `<div class="group relative">
                    <img src="${cleanUrl}" class="h-12 w-12 object-cover rounded border border-gray-200 cursor-pointer hover:scale-150 transition-transform" 
                         onclick="window.open('${cleanUrl}', '_blank')" alt="Image">
                    <span class="text-[10px] text-gray-500 truncate w-20 block">${cleanText}</span>
                </div>`;
    }

    // 2. VIDEO HANDLING (mp4, webm)
    if (['mp4', 'webm', 'ogg'].includes(ext)) {
        return `<video src="${cleanUrl}" class="h-16 w-24 rounded shadow cursor-pointer" controls preload="metadata"></video>`;
    }

    // 3. YOUTUBE EMBED
    if (cleanUrl.includes('youtube.com') || cleanUrl.includes('youtu.be')) {
        let videoId = '';
        if (cleanUrl.includes('v=')) videoId = cleanUrl.split('v=')[1].split('&')[0];
        else if (cleanUrl.includes('youtu.be/')) videoId = cleanUrl.split('youtu.be/')[1];
        
        if (videoId) {
            return `<iframe class="w-24 h-16 rounded" src="https://www.youtube.com/embed/${videoId}" frameborder="0" allowfullscreen></iframe>`;
        }
    }

    // 4. GOOGLE DRIVE / SMART CHIPS (Styling as a Chip Button)
    if (cleanUrl.includes('drive.google.com') || cleanUrl.includes('docs.google.com')) {
        // Icon based on type guess
        let icon = 'fa-google-drive';
        if(cleanUrl.includes('spreadsheets')) icon = 'fa-file-excel text-green-600';
        else if(cleanUrl.includes('document')) icon = 'fa-file-word text-blue-600';
        else if(cleanUrl.includes('folder')) icon = 'fa-folder text-yellow-600';
        
        return `<a href="${cleanUrl}" target="_blank" class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-100 text-gray-700 text-xs font-medium hover:bg-blue-50 hover:text-blue-600 border border-gray-300 transition-colors shadow-sm" title="${cleanUrl}">
                    <i class="fab ${icon}"></i> 
                    <span class="truncate max-w-[100px]">${cleanText}</span>
                </a>`;
    }

    // 5. DEFAULT LINK (Fallback)
    return `<a href="${cleanUrl}" target="_blank" class="text-blue-600 hover:underline flex items-center gap-1 text-xs">
                <i class="fas fa-link"></i> ${cleanText.substring(0, 15)}${cleanText.length > 15 ? '...' : ''}
            </a>`;
}

// --- FETCH DATA ---
async function fetchSheetData() {
    document.getElementById('loader').style.display = 'block';
    document.getElementById('lastUpdated').innerText = 'Syncing...';
    
    // API Call fetching hyperlinks
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}?includeGridData=true&ranges=${encodeURIComponent(SHEET_NAME)}&fields=sheets(data(rowData(values(hyperlink,formattedValue,userEnteredValue))))&key=${API_KEY}`;

    try {
        const response = await fetch(url);
        const json = await response.json();

        if (json.error) {
            console.error("API Error:", json.error);
            alert("Error: " + json.error.message);
            document.getElementById('lastUpdated').innerText = 'Error';
            return;
        }

        const sheetData = json.sheets?.[0]?.data?.[0]?.rowData;
        if (!sheetData || sheetData.length <= 1) {
            allData = [];
            applyFilters();
            document.getElementById('lastUpdated').innerText = 'No Data Found';
            return;
        }

        // SMART HEADER DETECTION
        const headerRow = sheetData[0].values || [];
        const headers = headerRow.map(cell => (cell.formattedValue || '').toLowerCase());
        
        const getIdx = (keywords, defaultIdx) => {
            const idx = headers.findIndex(h => keywords.some(k => h.includes(k)));
            return idx > -1 ? idx : defaultIdx;
        };

        const IDX_ID = getIdx(['id', 'issue'], 0);
        const IDX_MODULE = getIdx(['module'], 1);
        const IDX_DESC = getIdx(['description', 'desc'], 2);
        const IDX_REF = getIdx(['reference', 'ref'], 3);
        const IDX_ASSIGN = getIdx(['assign'], 4);
        const IDX_DEV = getIdx(['dev'], 5);
        const IDX_QA = getIdx(['qa', 'quality'], 6);
        const IDX_STATUS = getIdx(['status', 'overall'], 7);
        const IDX_PRIORITY = getIdx(['priority'], 8);
        const IDX_DATE = getIdx(['date'], 9);

        // DATA MAPPING
        const dataRows = sheetData.slice(1);
        allData = dataRows.map(row => {
            const cells = row.values || [];
            const getVal = (idx) => cells[idx]?.formattedValue || "";
            // Robust Link Extraction: Check hyperlink -> then formula -> then text
            const getLink = (idx) => {
                if (cells[idx]?.hyperlink) return cells[idx].hyperlink;
                // Sometimes smart chips store url in userEnteredValue formula
                const formula = cells[idx]?.userEnteredValue?.formulaValue;
                if (formula && formula.includes('HYPERLINK("')) {
                    return formula.split('"')[1]; 
                }
                // Fallback: If text is URL
                const txt = cells[idx]?.formattedValue || "";
                if(txt.startsWith('http')) return txt;
                return "";
            };

            return {
                id: getVal(IDX_ID),
                module: getVal(IDX_MODULE) || "Other",
                desc: getVal(IDX_DESC),
                ref: getVal(IDX_REF),      
                refUrl: getLink(IDX_REF),  // Smart extraction
                assign: getVal(IDX_ASSIGN) || "Unassigned",
                dev: getVal(IDX_DEV),
                qa: getVal(IDX_QA),
                status: (getVal(IDX_STATUS) || "Other").trim(),
                priority: (getVal(IDX_PRIORITY) || "Low").trim(),
                date: getVal(IDX_DATE)
            };
        })
        .filter(item => item.id.trim() !== "")
        .sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true }));

        applyFilters();
        document.getElementById('lastUpdated').innerText = 'Updated: ' + new Date().toLocaleTimeString();

    } catch (error) {
        console.error("Fetch failure:", error);
        alert("Failed to connect.");
    } finally {
        document.getElementById('loader').style.display = 'none';
    }
}

// --- FILTER LOGIC ---
function applyFilters() {
    const search = document.getElementById('filterSearch').value.toLowerCase();
    const module = document.getElementById('filterModule').value;
    const priority = document.getElementById('filterPriority').value;
    const dateFrom = document.getElementById('filterDateFrom').value;
    const dateTo = document.getElementById('filterDateTo').value;

    const baseData = allData.filter(item => {
        const inSearch = (item.id.toLowerCase().includes(search) || 
                          item.desc.toLowerCase().includes(search) || 
                          item.assign.toLowerCase().includes(search));
        
        const inModule = module === 'All' || item.module === module;

        let itemP = item.priority.toLowerCase();
        let filterP = priority.toLowerCase();
        let inPriority = priority === 'All';
        if (filterP === 'medium' && (itemP.includes('medium') || itemP.includes('midium'))) inPriority = true;
        else if (filterP !== 'all' && itemP.includes(filterP)) inPriority = true;

        let inDate = true;
        if (dateFrom && item.date < dateFrom) inDate = false;
        if (dateTo && item.date > dateTo) inDate = false;

        return inSearch && inModule && inPriority && inDate;
    });

    updateCardCounts(baseData);

    const finalData = baseData.filter(item => {
        if (activeTab === 'All') return true;
        const s = item.status.toLowerCase();
        if (activeTab === 'Pending') return s === 'pending';
        if (activeTab === 'Done') return s === 'done';
        if (activeTab === 'Other') return s !== 'pending' && s !== 'done';
        return true;
    });

    renderTableAndCharts(finalData);
}

// --- UPDATE SUMMARY CARDS ---
function updateCardCounts(data) {
    const total = data.length;
    const pending = data.filter(d => d.status.toLowerCase() === 'pending').length;
    const done = data.filter(d => d.status.toLowerCase() === 'done').length;
    const other = data.filter(d => {
        const s = d.status.toLowerCase();
        return s !== 'pending' && s !== 'done';
    }).length;

    document.getElementById('countTotal').innerText = total;
    document.getElementById('countPending').innerText = pending;
    document.getElementById('countDone').innerText = done;
    document.getElementById('countOther').innerText = other;
}

// --- RENDER TABLE & CHARTS ---
function renderTableAndCharts(data) {
    const pCounts = { High: 0, Medium: 0, Low: 0 };
    const sCounts = { done: 0, pending: 0, other: 0 };

    data.forEach(d => {
        let p = d.priority.toLowerCase();
        if(p.includes('high')) p = 'High';
        else if(p.includes('low')) p = 'Low';
        else p = 'Medium';
        if (pCounts[p] !== undefined) pCounts[p]++;

        let s = d.status.toLowerCase();
        if(s === 'done') sCounts.done++;
        else if(s === 'pending') sCounts.pending++;
        else sCounts.other++;
    });

    updateCharts(pCounts, sCounts);

    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = '';

    if (data.length === 0) {
        document.getElementById('noDataMessage').style.display = 'block';
    } else {
        document.getElementById('noDataMessage').style.display = 'none';
        data.forEach(row => {
            const tr = document.createElement('tr');
            tr.className = "bg-white border-b hover:bg-gray-50";

            let sClass = row.status.toLowerCase() === 'done' ? 'bg-green-100 text-green-800' : 
                         row.status.toLowerCase() === 'pending' ? 'bg-yellow-100 text-yellow-800' : 'bg-blue-100 text-blue-800';

            let pClass = row.priority.toLowerCase().includes('high') ? 'bg-red-100 text-red-800' : 
                         row.priority.toLowerCase().includes('low') ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800';

            // --- USE MEDIA RENDERER ---
            const refContent = renderMediaContent(row.refUrl, row.ref);

            tr.innerHTML = `
                <td class="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">${row.id}</td>
                <td class="px-4 py-3">${row.module}</td>
                <td class="px-4 py-3 truncate max-w-xs" title="${row.desc}">${row.desc}</td>
                <td class="px-4 py-3">${refContent}</td>
                <td class="px-4 py-3"><span class="${pClass} text-xs font-medium px-2 py-0.5 rounded">${row.priority}</span></td>
                <td class="px-4 py-3">${row.assign}</td>
                <td class="px-4 py-3 text-xs italic text-gray-500">${row.dev}</td>
                <td class="px-4 py-3 text-xs italic text-gray-500">${row.qa}</td>
                <td class="px-4 py-3"><span class="${sClass} text-xs font-medium px-2 py-0.5 rounded">${row.status}</span></td>
                <td class="px-4 py-3 text-xs whitespace-nowrap">${row.date}</td>
            `;
            tbody.appendChild(tr);
        });
    }
}

// --- CHARTS ---
function updateCharts(pData, sData) {
    const ctxP = document.getElementById('priorityChart').getContext('2d');
    const ctxS = document.getElementById('statusChart').getContext('2d');

    if (priorityChartInstance) priorityChartInstance.destroy();
    if (statusChartInstance) statusChartInstance.destroy();

    priorityChartInstance = new Chart(ctxP, {
        type: 'bar',
        data: {
            labels: ['High', 'Medium', 'Low'],
            datasets: [{
                label: 'Priority',
                data: [pData.High, pData.Medium, pData.Low],
                backgroundColor: ['#ef4444', '#eab308', '#22c55e'],
                borderWidth: 1
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    statusChartInstance = new Chart(ctxS, {
        type: 'doughnut',
        data: {
            labels: ['Done', 'Pending', 'Other'],
            datasets: [{
                data: [sData.done, sData.pending, sData.other],
                backgroundColor: ['#22c55e', '#eab308', '#3b82f6'], 
                hoverOffset: 4
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    fetchSheetData();
    document.getElementById('filterSearch').addEventListener('input', applyFilters);
    document.getElementById('filterModule').addEventListener('change', applyFilters);
    document.getElementById('filterPriority').addEventListener('change', applyFilters);
    document.getElementById('filterDateFrom').addEventListener('change', applyFilters);
    document.getElementById('filterDateTo').addEventListener('change', applyFilters);
});
