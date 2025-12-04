// --- CONFIGURATION ---
const API_KEY = 'AIzaSyA5X1MEweP0WvQbJ2uqG1NQON_fFyPm-lY'; 
const SPREADSHEET_ID = '1rZJ7Tu-huQi_EVVSjjy7uhUumaxbM08WwsKjtjYJCn0'; 
const SHEET_NAME = 'Website Issues'; 

let allData = [];
let priorityChartInstance = null;
let statusChartInstance = null;

// Default Active Tab
let activeTab = 'All';

// --- TAB SELECTION LOGIC ---
function setTab(tabName) {
    activeTab = tabName;
    
    // UI Update: Highlight active card
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

    // Re-apply filters
    applyFilters();
}

// --- FETCH DATA FROM GOOGLE SHEETS ---
async function fetchSheetData() {
    document.getElementById('loader').style.display = 'block';
    document.getElementById('lastUpdated').innerText = 'Syncing...';
    
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(SHEET_NAME)}?key=${API_KEY}`;

    try {
        const response = await fetch(url);
        const json = await response.json();

        if (json.error) {
            console.error("API Error:", json.error);
            alert("Error: " + json.error.message);
            document.getElementById('lastUpdated').innerText = 'Error';
            return;
        }

        if (!json.values || json.values.length <= 1) {
            allData = [];
            applyFilters();
            document.getElementById('lastUpdated').innerText = 'No Data Found';
            return;
        }

        // --- SMART COLUMN DETECTION (Dynamic Mapping) ---
        // Row 1 (Headers) को पढ़कर सही Index पता करेंगे
        const headers = json.values[0].map(h => h.toLowerCase());
        
        // Helper to find column index by name keyword
        const getIdx = (keywords, defaultIdx) => {
            const idx = headers.findIndex(h => keywords.some(k => h.includes(k)));
            return idx > -1 ? idx : defaultIdx;
        };

        // Mapping Indices dynamically (अगर हेडर नाम मैच न हो तो डिफ़ॉल्ट इंडेक्स यूज़ होगा)
        const IDX_ID = getIdx(['id', 'issue'], 0);
        const IDX_MODULE = getIdx(['module'], 1);
        const IDX_DESC = getIdx(['description', 'desc'], 2);
        const IDX_REF = getIdx(['reference', 'ref'], 3);
        const IDX_ASSIGN = getIdx(['assign'], 4);
        const IDX_DEV = getIdx(['dev'], 5);
        const IDX_QA = getIdx(['qa', 'quality'], 6);
        const IDX_STATUS = getIdx(['status', 'overall'], 7); // यह "Status" या "Overall" को ढूंढेगा
        const IDX_PRIORITY = getIdx(['priority'], 8);
        const IDX_DATE = getIdx(['date'], 9);

        console.log("Detected Columns:", { Status: IDX_STATUS, QA: IDX_QA, Priority: IDX_PRIORITY });

        // --- MAPPING DATA ROWS ---
        const dataRows = json.values.slice(1);

        allData = dataRows.map(row => ({
            id: row[IDX_ID] || "",
            module: row[IDX_MODULE] || "Other",
            desc: row[IDX_DESC] || "",
            ref: row[IDX_REF] || "",
            assign: row[IDX_ASSIGN] || "Unassigned",
            dev: row[IDX_DEV] || "",
            qa: row[IDX_QA] || "",
            status: (row[IDX_STATUS] || "Other").trim(), // अब यह सही कॉलम से आएगा
            priority: (row[IDX_PRIORITY] || "Low").trim(),
            date: row[IDX_DATE] || ""
        }))
        .filter(item => item.id.trim() !== "")
        // Sort: Latest ID First
        .sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true }));

        applyFilters();
        document.getElementById('lastUpdated').innerText = 'Updated: ' + new Date().toLocaleTimeString();

    } catch (error) {
        console.error("Fetch failure:", error);
        alert("Failed to connect. Check internet or API Key.");
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

    // 1. Base Filter (For Counts)
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

    // 2. Tab Filter (For Table/Charts)
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
    // Chart Data Prep
    const pCounts = { High: 0, Medium: 0, Low: 0 };
    const sCounts = { done: 0, pending: 0, other: 0 };

    data.forEach(d => {
        // Priority
        let p = d.priority.toLowerCase();
        if(p.includes('high')) p = 'High';
        else if(p.includes('low')) p = 'Low';
        else p = 'Medium';
        if (pCounts[p] !== undefined) pCounts[p]++;

        // Status
        let s = d.status.toLowerCase();
        if(s === 'done') sCounts.done++;
        else if(s === 'pending') sCounts.pending++;
        else sCounts.other++;
    });

    updateCharts(pCounts, sCounts);

    // Table Render
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = '';

    if (data.length === 0) {
        document.getElementById('noDataMessage').style.display = 'block';
    } else {
        document.getElementById('noDataMessage').style.display = 'none';
        data.forEach(row => {
            const tr = document.createElement('tr');
            tr.className = "bg-white border-b hover:bg-gray-50";

            // Status Badge Colors
            let sClass = 'bg-gray-100 text-gray-800'; 
            let sText = row.status.toLowerCase();
            if(sText === 'done') sClass = 'bg-green-100 text-green-800';
            else if(sText === 'pending') sClass = 'bg-yellow-100 text-yellow-800';
            else sClass = 'bg-blue-100 text-blue-800';

            // Priority Badge Colors
            let pClass = 'bg-gray-100 text-gray-800';
            let pText = row.priority.toLowerCase();
            if(pText.includes('high')) pClass = 'bg-red-100 text-red-800';
            else if(pText.includes('low')) pClass = 'bg-green-100 text-green-800';
            else pClass = 'bg-yellow-100 text-yellow-800';

            tr.innerHTML = `
                <td class="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">${row.id}</td>
                <td class="px-4 py-3">${row.module}</td>
                <td class="px-4 py-3 truncate max-w-xs" title="${row.desc}">${row.desc}</td>
                <td class="px-4 py-3">${row.ref}</td>
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

// --- CHARTS CONFIG ---
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

// --- EVENTS ---
document.addEventListener('DOMContentLoaded', () => {
    fetchSheetData();
    document.getElementById('filterSearch').addEventListener('input', applyFilters);
    document.getElementById('filterModule').addEventListener('change', applyFilters);
    document.getElementById('filterPriority').addEventListener('change', applyFilters);
    document.getElementById('filterDateFrom').addEventListener('change', applyFilters);
    document.getElementById('filterDateTo').addEventListener('change', applyFilters);
});
