// --- CONFIGURATION ---
const API_KEY = 'AIzaSyA5X1MEweP0WvQbJ2uqG1NQON_fFyPm-lY'; 
const SPREADSHEET_ID = '1rZJ7Tu-huQi_EVVSjjy7uhUumaxbM08WwsKjtjYJCn0'; 
const SHEET_NAME = 'Website Issues'; 

// *** IMPORTANT: PASTE YOUR APPS SCRIPT URL HERE AFTER DEPLOYMENT ***
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbygwQ3CkPeqoajM_CEe7AQ0xxwuwH4fkpvmoHrCaImRY7qV0CLbmG_BIg38XPiFN5Ag/exec'; 

let allData = [];
let currentFilteredData = [];
let priorityChartInstance = null;
let assignChartInstance = null;
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

// --- ADD ISSUE MODAL LOGIC ---
function openAddModal() {
    // 1. Calculate Next ID
    let maxId = 0;
    allData.forEach(d => {
        // Extract number from TW-123
        const match = d.id.match(/TW-(\d+)/);
        if (match) {
            const num = parseInt(match[1]);
            if (num > maxId) maxId = num;
        }
    });
    const nextId = 'TW-' + (maxId + 1);
    
    // 2. Set Default Values
    document.getElementById('inputId').value = nextId;
    document.getElementById('inputDate').valueAsDate = new Date();
    document.getElementById('inputModule').value = "";
    document.getElementById('inputPriority').value = "Low";
    document.getElementById('inputAssign').value = "";
    document.getElementById('inputDesc').value = "";
    document.getElementById('inputRefLink').value = "";
    
    // 3. Show Modal
    document.getElementById('addIssueModal').classList.remove('hidden');
}

function closeAddModal() {
    document.getElementById('addIssueModal').classList.add('hidden');
}

async function submitIssue(e) {
    e.preventDefault();
    
    const btn = document.getElementById('btnSubmit');
    const spinner = document.getElementById('submitSpinner');
    const text = document.getElementById('submitText');
    
    // Check if URL is configured
    if (APPS_SCRIPT_URL.includes('YOUR_WEB_APP_URL')) {
        alert("Please configure the Apps Script URL in script.js first!");
        return;
    }

    // Loading State
    btn.disabled = true;
    text.innerText = "Saving...";
    spinner.classList.remove('hidden');

    // Prepare Data
    const refLink = document.getElementById('inputRefLink').value;
    const refType = document.getElementById('inputRefType').value;
    let refFormula = "";
    
    if (refLink) {
        const label = refType === 'Video' ? 'Video' : (refType === 'Image' ? 'Snapshot' : 'Link');
        // Excel Formula for Hyperlink
        refFormula = `=HYPERLINK("${refLink}", "${label}")`;
    }

    const payload = {
        id: document.getElementById('inputId').value,
        date: document.getElementById('inputDate').value,
        module: document.getElementById('inputModule').value,
        priority: document.getElementById('inputPriority').value,
        assign: document.getElementById('inputAssign').value,
        desc: document.getElementById('inputDesc').value,
        ref: refFormula
    };

    try {
        const res = await fetch(APPS_SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        
        const result = await res.json();
        
        if (result.status === 'success') {
            alert("Issue Added Successfully!");
            closeAddModal();
            fetchSheetData(); // Refresh Data
        } else {
            alert("Failed to save.");
        }
    } catch (err) {
        console.error(err);
        alert("Error connecting to server.");
    } finally {
        btn.disabled = false;
        text.innerText = "Submit Issue";
        spinner.classList.add('hidden');
    }
}

// --- HELPER: RENDER MEDIA ---
function renderMediaContent(url, text) {
    if (!url) {
        if (text && (text.startsWith('http') || text.startsWith('www'))) url = text;
        else return text || "-"; 
    }
    const cleanUrl = url.trim();
    const cleanText = text || "View File";
    
    if (cleanUrl.includes('drive.google.com') || cleanUrl.includes('docs.google.com')) {
        let icon = 'fa-google-drive';
        let colorClass = 'bg-gray-100 text-gray-700 border-gray-300';
        const lowerText = cleanText.toLowerCase();
        
        if (lowerText.includes('video') || lowerText.includes('.mp4')) {
            icon = 'fa-file-video text-purple-500';
            colorClass = 'bg-purple-50 text-purple-700 border-purple-200';
        } else if (lowerText.includes('snapshot') || lowerText.includes('image') || lowerText.includes('png') || lowerText.includes('jpg')) {
            icon = 'fa-file-image text-purple-500';
            colorClass = 'bg-purple-50 text-purple-700 border-purple-200';
        } else if (lowerText.includes('sheet') || lowerText.includes('xls')) {
            icon = 'fa-file-excel text-green-600';
            colorClass = 'bg-green-50 text-green-700 border-green-200';
        }

        return `<a href="${cleanUrl}" target="_blank" class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium hover:shadow-md transition-all ${colorClass}" title="${cleanText}">
                    <i class="fab ${icon}"></i> <span class="truncate max-w-[100px]">${cleanText}</span>
                </a>`;
    }

    return `<a href="${cleanUrl}" target="_blank" class="text-blue-600 hover:underline flex items-center gap-1 text-xs">
                <i class="fas fa-link"></i> ${cleanText.substring(0, 15)}...
            </a>`;
}

// --- FETCH DATA ---
async function fetchSheetData() {
    document.getElementById('loader').style.display = 'block';
    document.getElementById('lastUpdated').innerText = 'Syncing...';
    
    try {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}?includeGridData=true&ranges=${encodeURIComponent(SHEET_NAME)}&fields=sheets(data(rowData(values(hyperlink,formattedValue,userEnteredValue))))&key=${API_KEY}`;
        const response = await fetch(url);
        const json = await response.json();

        if (json.error) throw new Error(json.error.message);
        const sheetData = json.sheets?.[0]?.data?.[0]?.rowData;
        if (!sheetData) throw new Error("No data");

        processData(sheetData);
    } catch (error) {
        console.warn("Advanced Fetch Failed, trying Simple...");
        try {
            const urlSimple = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(SHEET_NAME)}?key=${API_KEY}`;
            const res = await fetch(urlSimple);
            const json = await res.json();
            if(!json.values) throw new Error("Empty Sheet");
            processSimpleData(json.values);
        } catch (e) {
            alert("Failed to connect.");
            document.getElementById('lastUpdated').innerText = 'Error';
        }
    } finally {
        document.getElementById('loader').style.display = 'none';
    }
}

function processData(rows) {
    const headers = (rows[0].values || []).map(c => (c.formattedValue || '').toLowerCase());
    const idx = getColumnIndices(headers);
    allData = rows.slice(1).map(row => {
        const cells = row.values || [];
        const getVal = (i) => cells[i]?.formattedValue || "";
        const getLink = (i) => {
            const c = cells[i];
            if (!c) return "";
            if (c.hyperlink) return c.hyperlink;
            const f = c.userEnteredValue?.formulaValue;
            if (f && f.includes('HYPERLINK("')) return f.split('"')[1];
            const t = c.formattedValue || "";
            return t.startsWith('http') ? t : "";
        };
        return createRowObject(getVal, getLink, idx);
    }).filter(d => d.id !== "");
    finishLoad();
}

function processSimpleData(rows) {
    const headers = rows[0].map(h => h.toLowerCase());
    const idx = getColumnIndices(headers);
    allData = rows.slice(1).map(cells => {
        const getVal = (i) => cells[i] || "";
        const getLink = (i) => cells[i]?.startsWith('http') ? cells[i] : "";
        return createRowObject(getVal, getLink, idx);
    }).filter(d => d.id !== "");
    finishLoad();
}

function getColumnIndices(headers) {
    const getIdx = (k, def) => {
        const i = headers.findIndex(h => k.some(w => h.includes(w)));
        return i > -1 ? i : def;
    };
    return {
        id: getIdx(['id', 'issue'], 0),
        module: getIdx(['module'], 1),
        desc: getIdx(['description', 'desc'], 2),
        ref: getIdx(['reference', 'ref'], 3),
        assign: getIdx(['assign'], 4),
        status: getIdx(['status', 'overall'], 7),
        priority: getIdx(['priority'], 8),
        date: getIdx(['date'], 9),
        reported: getIdx(['report', 'raised', 'founder'], 10)
    };
}

function createRowObject(getVal, getLink, idx) {
    return {
        id: getVal(idx.id),
        module: getVal(idx.module) || "Other",
        desc: getVal(idx.desc),
        ref: getVal(idx.ref),
        refUrl: getLink(idx.ref),
        assign: getVal(idx.assign) || "Unassigned",
        reported: getVal(idx.reported) || "-",
        status: (getVal(idx.status) || "Other").trim(),
        priority: (getVal(idx.priority) || "Low").trim(),
        date: getVal(idx.date)
    };
}

function finishLoad() {
    allData.sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true }));
    populateReportedFilter(allData);
    applyFilters();
    document.getElementById('lastUpdated').innerText = 'Updated: ' + new Date().toLocaleTimeString();
}

function populateReportedFilter(data) {
    const select = document.getElementById('filterReported');
    if(!select) return;
    const reporters = [...new Set(data.map(item => item.reported))].sort();
    select.innerHTML = '<option value="All">All Reporters</option>';
    reporters.forEach(rep => {
        if(rep && rep !== '-') {
            const opt = document.createElement('option');
            opt.value = rep;
            opt.innerText = rep;
            select.appendChild(opt);
        }
    });
}

function applyFilters() {
    const search = document.getElementById('filterSearch').value.toLowerCase();
    const module = document.getElementById('filterModule').value;
    const reported = document.getElementById('filterReported')?.value || 'All';
    const priority = document.getElementById('filterPriority').value;
    const dateFrom = document.getElementById('filterDateFrom').value;
    const dateTo = document.getElementById('filterDateTo').value;

    const baseData = allData.filter(item => {
        const inSearch = (item.id.toLowerCase().includes(search) || item.desc.toLowerCase().includes(search));
        const inModule = module === 'All' || item.module === module;
        const inReported = reported === 'All' || item.reported === reported;
        
        let itemP = item.priority.toLowerCase();
        let filterP = priority.toLowerCase();
        let inPriority = priority === 'All';
        if (filterP === 'medium' && (itemP.includes('medium') || itemP.includes('midium'))) inPriority = true;
        else if (filterP !== 'all' && itemP.includes(filterP)) inPriority = true;

        let inDate = true;
        if (dateFrom && item.date < dateFrom) inDate = false;
        if (dateTo && item.date > dateTo) inDate = false;

        return inSearch && inModule && inReported && inPriority && inDate;
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

    currentFilteredData = finalData;
    currentPage = 1;
    
    updateCharts(finalData); 
    renderTablePage();
}

function updateCardCounts(data) {
    const total = data.length;
    const pending = data.filter(d => d.status.toLowerCase() === 'pending').length;
    const done = data.filter(d => d.status.toLowerCase() === 'done').length;
    const other = total - (pending + done);

    document.getElementById('countTotal').innerText = total;
    document.getElementById('countPending').innerText = pending;
    document.getElementById('countDone').innerText = done;
    document.getElementById('countOther').innerText = other;
}

function renderTablePage() {
    const totalRows = currentFilteredData.length;
    const startIndex = (currentPage - 1) * rowsPerPage;
    const endIndex = Math.min(startIndex + rowsPerPage, totalRows);
    const pageData = currentFilteredData.slice(startIndex, endIndex);

    document.getElementById('startRow').innerText = totalRows === 0 ? 0 : startIndex + 1;
    document.getElementById('endRow').innerText = endIndex;
    document.getElementById('totalRows').innerText = totalRows;
    document.getElementById('pageIndicator').innerText = `Page ${currentPage}`;
    document.getElementById('btnPrev').disabled = currentPage === 1;
    document.getElementById('btnNext').disabled = endIndex >= totalRows;

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

            // UPDATED ORDER
            tr.innerHTML = `
                <td class="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">${row.id}</td>
                <td class="px-4 py-3">${row.module}</td>
                <td class="px-4 py-3 text-xs whitespace-nowrap text-gray-500">${row.date}</td>
                <td class="px-4 py-3 truncate max-w-xs" title="${row.desc}">${row.desc}</td>
                <td class="px-4 py-3">${refContent}</td>
                <td class="px-4 py-3"><span class="${pClass} text-xs font-medium px-2 py-0.5 rounded">${row.priority}</span></td>
                <td class="px-4 py-3 text-gray-700 font-medium">${row.assign}</td>
                <td class="px-4 py-3"><span class="${sClass} text-xs font-medium px-2 py-0.5 rounded">${row.status}</span></td>
            `;
            tbody.appendChild(tr);
        });
    }
}

function updateCharts(data) {
    const pCounts = { High: 0, Medium: 0, Low: 0 };
    const assignCounts = {}; 

    data.forEach(d => {
        let p = d.priority.toLowerCase();
        if(p.includes('high')) p = 'High';
        else if(p.includes('low')) p = 'Low';
        else p = 'Medium';
        if (pCounts[p] !== undefined) pCounts[p]++;

        let assignee = (d.assign || "Unassigned").trim();
        if (!assignee) assignee = "Unassigned";
        assignCounts[assignee] = (assignCounts[assignee] || 0) + 1;
    });

    const ctxP = document.getElementById('priorityChart').getContext('2d');
    const ctxA = document.getElementById('assignChart').getContext('2d');

    if (priorityChartInstance) priorityChartInstance.destroy();
    if (assignChartInstance) assignChartInstance.destroy();

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

    const assignLabels = Object.keys(assignCounts);
    const assignData = Object.values(assignCounts);
    const bgColors = assignLabels.map(() => `hsl(${Math.random() * 360}, 70%, 50%)`);

    assignChartInstance = new Chart(ctxA, {
        type: 'bar',
        data: {
            labels: assignLabels,
            datasets: [{
                label: 'Issues Assigned',
                data: assignData,
                backgroundColor: bgColors,
                borderWidth: 1
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
    });
}

function changeRowsPerPage() { rowsPerPage = parseInt(document.getElementById('rowsPerPage').value); currentPage = 1; renderTablePage(); }
function prevPage() { if (currentPage > 1) { currentPage--; renderTablePage(); } }
function nextPage() { if ((currentPage * rowsPerPage) < currentFilteredData.length) { currentPage++; renderTablePage(); } }

document.addEventListener('DOMContentLoaded', () => {
    fetchSheetData();
    document.getElementById('rowsPerPage').addEventListener('change', changeRowsPerPage);
    document.getElementById('btnPrev').addEventListener('click', prevPage);
    document.getElementById('btnNext').addEventListener('click', nextPage);
    document.getElementById('filterSearch').addEventListener('input', applyFilters);
    document.getElementById('filterModule').addEventListener('change', applyFilters);
    document.getElementById('filterReported').addEventListener('change', applyFilters);
    document.getElementById('filterPriority').addEventListener('change', applyFilters);
    document.getElementById('filterDateFrom').addEventListener('change', applyFilters);
    document.getElementById('filterDateTo').addEventListener('change', applyFilters);
});
            
