// --- CONFIGURATION ---
const API_KEY = 'AIzaSyA5X1MEweP0WvQbJ2uqG1NQON_fFyPm-lY'; 
const SPREADSHEET_ID = '1rZJ7Tu-huQi_EVVSjjy7uhUumaxbM08WwsKjtjYJCn0'; 
const SHEET_NAME = 'Website Issues'; 

let allData = [];
let priorityChartInstance = null;
let statusChartInstance = null;

// --- FETCH DATA FROM GOOGLE SHEETS ---
async function fetchSheetData() {
    document.getElementById('loader').style.display = 'block';
    document.getElementById('lastUpdated').innerText = 'Syncing...';
    
    // URL Encoding for Sheet Name
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(SHEET_NAME)}?key=${API_KEY}`;

    try {
        const response = await fetch(url);
        const json = await response.json();

        if (json.error) {
            console.error("API Error:", json.error);
            alert("Error: " + json.error.message + "\n\nTip: Check Sheet Name and Permissions.");
            document.getElementById('lastUpdated').innerText = 'Error';
            return;
        }

        if (!json.values || json.values.length <= 1) {
            allData = [];
            renderDashboard([]);
            document.getElementById('lastUpdated').innerText = 'No Data Found';
            return;
        }

        // --- MAPPING COLUMNS ---
        // Skipping Row 1 (Headers)
        const dataRows = json.values.slice(1);

        allData = dataRows.map(row => ({
            id: row[0] || "",
            module: row[1] || "Other",
            desc: row[2] || "",
            ref: row[3] || "",
            assign: row[4] || "Unassigned",
            dev: row[5] || "",
            qa: row[6] || "",
            status: (row[7] || "Other").trim(), // Column H
            priority: (row[8] || "Low").trim(),  // Column I
            date: row[9] || ""
        }))
        // 1. Blank ID हटाना
        .filter(item => item.id.trim() !== "")
        // 2. NEW CHANGE: Sort by ID Descending (Latest First)
        // numeric: true ensures TW-10 comes before TW-2 correctly
        .sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true }));

        renderDashboard(allData);
        document.getElementById('lastUpdated').innerText = 'Updated: ' + new Date().toLocaleTimeString();

    } catch (error) {
        console.error("Fetch failure:", error);
        alert("Failed to connect. Check internet or API Key.");
    } finally {
        document.getElementById('loader').style.display = 'none';
    }
}

// --- RENDER DASHBOARD ---
function renderDashboard(data) {
    // 1. Calculate Summary Cards
    const total = data.length;
    
    const pending = data.filter(d => d.status.toLowerCase() === 'pending').length;
    const done = data.filter(d => d.status.toLowerCase() === 'done').length;
    
    const other = data.filter(d => {
        const s = d.status.toLowerCase();
        return s !== 'pending' && s !== 'done';
    }).length;

    // Update Cards
    document.getElementById('countTotal').innerText = total;
    document.getElementById('countPending').innerText = pending;
    document.getElementById('countDone').innerText = done;
    document.getElementById('countOther').innerText = other;

    // 2. Prepare Chart Data
    const pCounts = { High: 0, Medium: 0, Low: 0 };
    data.forEach(d => {
        let p = d.priority.toLowerCase();
        if(p.includes('high')) p = 'High';
        else if(p.includes('low')) p = 'Low';
        else p = 'Medium';
        
        if (pCounts[p] !== undefined) pCounts[p]++;
    });

    // 3. Update Charts
    updateCharts(pCounts, { pending, done, other });

    // 4. Render Table
    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = '';

    if (data.length === 0) {
        document.getElementById('noDataMessage').style.display = 'block';
    } else {
        document.getElementById('noDataMessage').style.display = 'none';
        data.forEach(row => {
            const tr = document.createElement('tr');
            tr.className = "bg-white border-b hover:bg-gray-50";

            // Status Badge
            let sClass = 'bg-gray-100 text-gray-800'; 
            let sText = row.status.toLowerCase();
            if(sText === 'done') sClass = 'bg-green-100 text-green-800';
            else if(sText === 'pending') sClass = 'bg-yellow-100 text-yellow-800';
            else sClass = 'bg-blue-100 text-blue-800';

            // Priority Badge
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

// --- CHART CONFIG ---
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

// --- FILTER LOGIC ---
function applyFilters() {
    const search = document.getElementById('filterSearch').value.toLowerCase();
    const module = document.getElementById('filterModule').value;
    const priority = document.getElementById('filterPriority').value;
    const dateFrom = document.getElementById('filterDateFrom').value;
    const dateTo = document.getElementById('filterDateTo').value;

    const filtered = allData.filter(item => {
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

    renderDashboard(filtered);
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
