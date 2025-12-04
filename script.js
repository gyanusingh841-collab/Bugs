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
    // Basic Cleanup
    if (!url) {
        if (text && (text.startsWith('http') || text.startsWith('www'))) url = text;
        else return text || "-"; 
    }
    
    const cleanUrl = url.trim();
    const cleanText = text || "View File";
    
    // --- EXTRACT DRIVE FILE ID ---
    let driveId = null;
    const driveRegex = /\/d\/([a-zA-Z0-9_-]+)|id=([a-zA-Z0-9_-]+)/;
    const match = cleanUrl.match(driveRegex);
    if (match) {
        driveId = match[1] || match[2];
    }

    // A. GOOGLE DRIVE CONTENT (Video, Image, or File)
    if (driveId) {
        // Construct Preview URL
        const embedUrl = `https://drive.google.com/file/d/${driveId}/preview`;
        
        // Guess Type based on Text or Extension
        const isVideo = cleanText.toLowerCase().includes('video') || cleanText.match(/\.(mp4|mov|mkv)$/i);
        const isImage = cleanText.toLowerCase().includes('image') || cleanText.match(/\.(jpg|png|jpeg|webp)$/i);

        // 1. Video Embed
        if (isVideo) {
            return `<div class="w-32 h-20 rounded overflow-hidden border shadow-sm relative group bg-black">
                        <iframe src="${embedUrl}" class="w-full h-full" allow="autoplay" style="border:none;"></iframe>
                        <a href="${cleanUrl}" target="_blank" class="absolute top-1 right-1 text-white bg-black/50 rounded-full p-1 hover:bg-red-600 transition-colors" title="Open Fullscreen">
                            <i class="fas fa-external-link-alt text-[10px]"></i>
                        </a>
                    </div>`;
        }
        
        // 2. Image Thumbnail
        if (isImage) {
            const imgUrl = `https://drive.google.com/thumbnail?id=${driveId}&sz=w200`; // Fetch Thumbnail
            return `<div class="group relative w-16 h-16">
                        <img src="${imgUrl}" class="w-full h-full object-cover rounded border shadow-sm cursor-pointer hover:scale-110 transition-transform" 
                             onclick="window.open('${cleanUrl}', '_blank')" 
                             onerror="this.onerror=null; this.src='https://ssl.gstatic.com/docs/doclist/images/icon_11_image_list.png'">
                    </div>`;
        }

        // 3. Default Drive Chip (Document/Folder/Unknown)
        let icon = 'fa-google-drive';
        let color = 'text-gray-700 bg-gray-100 border-gray-300';
        
        if (cleanUrl.includes('spreadsheets')) { icon = 'fa-file-excel'; color = 'text-green-700 bg-green-50 border-green-200'; }
        else if (cleanUrl.includes('document')) { icon = 'fa-file-word'; color = 'text-blue-700 bg-blue-50 border-blue-200'; }
        else if (cleanUrl.includes('folder')) { icon = 'fa-folder'; color = 'text-yellow-700 bg-yellow-50 border-yellow-200'; }

        return `<a href="${cleanUrl}" target="_blank" class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${color} text-xs font-medium border hover:shadow-md transition-all">
                    <i class="fab ${icon}"></i> 
                    <span class="truncate max-w-[80px]">${cleanText}</span>
                </a>`;
    }

    // B. DIRECT IMAGE LINKS
    if (cleanUrl.match(/\.(jpeg|jpg|gif|png|webp)$/i)) {
        return `<img src="${cleanUrl}" class="w-12 h-12 object-cover rounded border hover:scale-150 transition-transform cursor-pointer" onclick="window.open('${cleanUrl}', '_blank')">`;
    }

    // C. YOUTUBE
    if (cleanUrl.includes('youtube.com') || cleanUrl.includes('youtu.be')) {
        let videoId = '';
        if (cleanUrl.includes('v=')) videoId = cleanUrl.split('v=')[1].split('&')[0];
        else if (cleanUrl.includes('youtu.be/')) videoId = cleanUrl.split('youtu.be/')[1];
        if (videoId) {
            return `<iframe class="w-24 h-16 rounded" src="https://www.youtube.com/embed/${videoId}" frameborder="0" allowfullscreen></iframe>`;
        }
    }

    // D. FALLBACK LINK
    return `<a href="${cleanUrl}" target="_blank" class="text-blue-600 hover:underline flex items-center gap-1 text-xs">
                <i class="fas fa-link"></i> ${cleanText.substring(0, 15)}...
            </a>`;
}

// --- FETCH DATA ---
async function fetchSheetData() {
    document.getElementById('loader').style.display = 'block';
    document.getElementById('lastUpdated').innerText = 'Syncing...';
    
    // FIX: Removed 'smartChip' from fields to prevent INVALID_ARGUMENT error
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
            
            // --- ROBUST LINK EXTRACTION ---
            const getLink = (idx) => {
                const cell = cells[idx];
                if (!cell) return "";
                
                // 1. Direct Hyperlink
                if (cell.hyperlink) return cell.hyperlink;
                
                // 2. Formula (Handles Chips inserted as formulas)
                const formula = cell.userEnteredValue?.formulaValue;
                if (formula && formula.includes('HYPERLINK("')) {
                    return formula.split('"')[1]; 
                }
                
                // 3. Text Fallback (Smart Chips often degrade to text URL in API)
                const txt = cell.formattedValue || "";
                if(txt.startsWith('http') || txt.startsWith('www')) return txt;
                
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
