// --- CONFIGURATION ---
const API_KEY = 'AIzaSyDxSx1i7pEpjwAK4-LWuoS44crY0xi9HKo'; 
const SPREADSHEET_ID = '1rZJ7Tu-huQi_EVVSjjy7uhUumaxbM08WwsKjtjYJCn0'; 
const SHEET_NAME = 'Website Issue';

// Note: Maine 'RANGE' hata diya hai. Ab ye puri sheet read karega.

let allData = [];
let priorityChartInstance = null;
let statusChartInstance = null;

// --- FETCH DATA FROM GOOGLE SHEETS ---
async function fetchSheetData() {
    document.getElementById('loader').style.display = 'block';
    document.getElementById('lastUpdated').innerText = 'Syncing...';
    
    // URL me ab sirf SHEET_NAME hai, range nahi. Isse pura data aayega.
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${SHEET_NAME}?key=${API_KEY}`;

    try {
        const response = await fetch(url);
        const json = await response.json();

        if (json.error) {
            console.error("API Error:", json.error);
            alert("Error: " + json.error.message + "\n\nTip: Make sure the Sheet is shared as 'Anyone with the link can View'");
            document.getElementById('lastUpdated').innerText = 'Error';
            return;
        }

        // Check agar data khali hai ya sirf header hai
        if (!json.values || json.values.length <= 1) {
            allData = [];
            renderDashboard([]);
            document.getElementById('lastUpdated').innerText = 'No Data Found';
            return;
        }

        // --- MAPPING COLUMNS ---
        // json.values.slice(1) ka use kiya hai taaki Row 1 (Headers) skip ho jaye.
        const dataRows = json.values.slice(1);

        allData = dataRows.map(row => ({
            id: row[0] || "",
            module: row[1] || "Other",
            desc: row[2] || "",
            ref: row[3] || "",
            assign: row[4] || "Unassigned",
            dev: row[5] || "",
            qa: row[6] || "",
            status: (row[7] || "Pending").trim(),
            priority: (row[8] || "Low").trim(),
            date: row[9] || ""
        }));

        renderDashboard(allData);
        document.getElementById('lastUpdated').innerText = 'Updated: ' + new Date().toLocaleTimeString();

    } catch (error) {
        console.error("Fetch failure:", error);
        alert("Failed to connect to Google Sheets.");
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
    const other = total - (pending + done);

    document.getElementById('countTotal').innerText = total;
    document.getElementById('countPending').innerText = pending;
    document.getElementById('countDone').innerText = done;
    document.getElementById('countOther').innerText = other;

    // 2. Prepare Chart Data
    const pCounts = { High: 0, Medium: 0, Low: 0 };
    data.forEach(d => {
        let p = d.priority.charAt(0).toUpperCase() + d.priority.slice(1).toLowerCase();
        
        // Handling variations like 'midium' or spaces
        if(p.includes('High')) p = 'High';
        else if(p.includes('Low')) p = 'Low';
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

            // Styles for badges
            let pClass = row.priority.toLowerCase().includes('high') ? 'bg-red-100 text-red-800' : 
                         row.priority.toLowerCase().includes('low') ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800';
            
            let sClass = row.status.toLowerCase() === 'done' ? 'bg-green-100 text-green-800' : 
                         row.status.toLowerCase() === 'pending' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800';

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
                label: 'Count',
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
                backgroundColor: ['#22c55e', '#eab308', '#6b7280'],
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
