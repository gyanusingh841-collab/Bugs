// --- CONFIGURATION ---
const API_KEY = 'AIzaSyA5X1MEweP0WvQbJ2uqG1NQON_fFyPm-lY'; 
const SPREADSHEET_ID = '1rZJ7Tu-huQi_EVVSjjy7uhUumaxbM08WwsKjtjYJCn0'; 
const SHEET_NAME = 'Website Issues'; 

let allData = [];
let currentFilteredData = []; // Data after filters applied
let priorityChartInstance = null;
let statusChartInstance = null;
let activeTab = 'All';

// PAGINATION STATE
let currentPage = 1;
let rowsPerPage = 10;

// --- TAB SELECTION ---
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

// --- HELPER: RENDER MEDIA (LIGHTWEIGHT CHIP STYLE) ---
function renderMediaContent(url, text) {
    if (!url) {
        if (text && (text.startsWith('http') || text.startsWith('www'))) url = text;
        else return text || "-"; 
    }
    
    const cleanUrl = url.trim();
    const cleanText = text || "View File";
    
    // Check for Google Drive Links
    if (cleanUrl.includes('drive.google.com') || cleanUrl.includes('docs.google.com')) {
        let icon = 'fa-google-drive';
        let colorClass = 'bg-gray-100 text-gray-700 border-gray-300';
        
        // Smart Icon Logic (Based on text/keywords)
        const lowerText = cleanText.toLowerCase();
        if (lowerText.includes('video') || lowerText.includes('.mp4') || lowerText.includes('.mov')) {
            icon = 'fa-file-video text-red-500';
            colorClass = 'bg-red-50 text-red-700 border-red-200';
        } else if (lowerText.includes('image') || lowerText.includes('img') || lowerText.includes('screenshot') || lowerText.includes('.png') || lowerText.includes('.jpg')) {
            icon = 'fa-file-image text-purple-500';
            colorClass = 'bg-purple-50 text-purple-700 border-purple-200';
        } else if (lowerText.includes('sheet') || lowerText.includes('xls')) {
            icon = 'fa-file-excel text-green-600';
            colorClass = 'bg-green-50 text-green-700 border-green-200';
        }

        // Return a clean clickable Chip
        return `<a href="${cleanUrl}" target="_blank" class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium hover:shadow-md transition-all ${colorClass}" title="${cleanText}">
                    <i class="fab ${icon}"></i> 
                    <span class="truncate max-w-[100px]">${cleanText}</span>
                </a>`;
    }

    // Standard Link
    return `<a href="${cleanUrl}" target="_blank" class="text-blue-600 hover:underline flex items-center gap-1 text-xs">
                <i class="fas fa-link"></i> ${cleanText.substring(0, 15)}...
            </a>`;
}

// --- FETCH DATA ---
async function fetchSheetData() {
    document.getElementById('loader').style.display = 'block';
    document.getElementById('lastUpdated').innerText = 'Syncing...';
    
    // Using standard fields to avoid errors and keep it fast
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

        // Header Detection
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

        // Map Data
        const dataRows = sheetData.slice(1);
        allData = dataRows.map(row => {
            const cells = row.values || [];
            const getVal = (idx) => cells[idx]?.formattedValue || "";
            
            const getLink = (idx) => {
                const cell = cells[idx];
                if (!cell) return "";
                if (cell.hyperlink) return cell.hyperlink;
                const formula = cell.userEnteredValue?.formulaValue;
                if (formula && formula.includes('HYPERLINK("')) return formula.split('"')[1];
                const txt = cell.formattedValue || "";
                if(txt.startsWith('http')) return txt;
                return "";
            };

            return {
                id: getVal(IDX_ID),
                module: getVal(IDX_MODULE) || "Other",
                desc: getVal(IDX_DESC),
                ref: getVal(IDX_REF),      
                refUrl: getLink(IDX_REF),
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

    // 1. Base Filter (Global)
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

    // Update Counts (Always based on base filters, ignoring tabs)
    updateCardCounts(baseData);

    // 2. Tab Filter
    const finalData = baseData.filter(item => {
        if (activeTab === 'All') return true;
        const s = item.status.toLowerCase();
        if (activeTab === 'Pending') return s === 'pending';
        if (activeTab === 'Done') return s === 'done';
        if (activeTab === 'Other') return s !== 'pending' && s !== 'done';
        return true;
    });

    // 3. Update Global Data & Reset Page
    currentFilteredData = finalData;
    currentPage = 1; // Reset to page 1 on filter change
    
    // Render
    updateCharts(baseData); // Charts use base data (optional: can use finalData if preferred)
    renderTablePage(); // Call Pagination Renderer
}

// --- PAGINATION RENDERER ---
function renderTablePage() {
    const totalRows = currentFilteredData.length;
    const startIndex = (currentPage - 1) * rowsPerPage;
    const endIndex = Math.min(startIndex + rowsPerPage, totalRows);
    
    // Slice Data for current page
    const pageData = currentFilteredData.slice(startIndex, endIndex);

    // Update Info Text
    document.getElementById('startRow').innerText = totalRows === 0 ? 0 : startIndex + 1;
    document.getElementById('endRow').innerText = endIndex;
    document.getElementById('totalRows').innerText = totalRows;
    document.getElementById('pageIndicator').innerText = `Page ${currentPage}`;

    // Update Buttons
    document.getElementById('btnPrev').disabled = currentPage === 1;
    document.getElementById('btnNext').disabled = endIndex >= totalRows;

    // Render Table Rows
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = '';

    if (totalRows === 0) {
        document.getElementById('noDataMessage').style.display = 'block';
        document.getElementById('paginationControls').style.display = 'none';
    } else {
        document.getElementById('noDataMessage').style.display = 'none';
        document.getElementById('paginationControls').style.display = 'flex';
        
        pageData.forEach(row => {
            const tr = document.createElement('tr');
            tr.className = "bg-white border-b hover:bg-gray-50";

            let sClass = row.status.toLowerCase() === 'done' ? 'bg-green-100 text-green-800' : 
                         row.status.toLowerCase() === 'pending' ? 'bg-yellow-100 text-yellow-800' : 'bg-blue-100 text-blue-800';

            let pClass = row.priority.toLowerCase().includes('high') ? 'bg-red-100 text-red-800' : 
                         row.priority.toLowerCase().includes('low') ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800';

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

// --- PAGINATION CONTROLS ---
function changeRowsPerPage() {
    rowsPerPage = parseInt(document.getElementById('rowsPerPage').value);
    currentPage = 1;
    renderTablePage();
}

function prevPage() {
    if (currentPage > 1) {
        currentPage--;
        renderTablePage();
    }
}

function nextPage() {
    if ((currentPage * rowsPerPage) < currentFilteredData.length) {
        currentPage++;
        renderTablePage();
    }
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

// --- CHARTS ---
function updateCharts(data) {
    // Prep Data
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
                data: [pCounts.High, pCounts.Medium, pCounts.Low],
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
                data: [sCounts.done, sCounts.pending, sCounts.other],
                backgroundColor: ['#22c55e', '#eab308', '#3b82f6'], 
                hoverOffset: 4
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

// --- EVENTS ---
document.addEventListener('DOMContentLoaded', () => {
    fetchSheetData();
    
    // Pagination Listeners
    document.getElementById('rowsPerPage').addEventListener('change', changeRowsPerPage);
    document.getElementById('btnPrev').addEventListener('click', prevPage);
    document.getElementById('btnNext').addEventListener('click', nextPage);

    // Filter Listeners
    document.getElementById('filterSearch').addEventListener('input', applyFilters);
    document.getElementById('filterModule').addEventListener('change', applyFilters);
    document.getElementById('filterPriority').addEventListener('change', applyFilters);
    document.getElementById('filterDateFrom').addEventListener('change', applyFilters);
    document.getElementById('filterDateTo').addEventListener('change', applyFilters);
});
