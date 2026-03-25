const API_URL = "https://stempelkarte.sb-nmsstadt.workers.dev/api";
const PIN_ADMIN = "0000"; 
const PIN_STAMP = "1234"; 
const PIN_SUPERVISOR = "1234"; 

const MAX_STAMPS = 60;
const STAMPS_PER_LEVEL = 20;

let REWARDS = [];

async function fetchRewards() {
    try {
        const response = await fetch(`${API_URL}/rewards`);
        if (response.ok) {
            const raw = await response.json();
            // Filter inactive rewards (true if undefined or true)
            REWARDS = raw.filter(r => r.active !== false);
            // ensure sorted by threshold
            REWARDS.sort((a,b) => a.threshold - b.threshold);
        }
    } catch (err) {
        console.error("Fehler beim Laden der Belohnungen", err);
    }
}

let students = [];
let currentStudent = null;
let enteredPin = "";
let pinCallback = null;
let isSupervisor = false;
let isDirectLink = false;
let syncInterval = null;

document.addEventListener('DOMContentLoaded', async () => {
    await fetchRewards();

    const urlParams = new URLSearchParams(window.location.search);
    const idParam = urlParams.get('id');
    
    if (idParam) {
        isDirectLink = true;
        loginWithId(idParam);
    } else {
        const savedId = localStorage.getItem('studentId');
        if (savedId) {
            loginWithId(savedId);
        }
    }
});

function toggleRules() {
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    document.getElementById('view-rules').classList.remove('hidden');
}

function startSync() {
    stopSync();
    syncInterval = setInterval(() => {
        if (document.visibilityState === 'visible' && currentStudent && !isSupervisor) {
            silentSync();
        }
    }, 5000);
}

function stopSync() {
    if (syncInterval) clearInterval(syncInterval);
}

async function silentSync() {
    if (!currentStudent) return;
    try {
        const response = await fetch(`${API_URL}/students/${currentStudent.id}`);
        if (response.ok) {
            const freshData = await response.json();
            if (freshData.stamps !== currentStudent.stamps || 
                freshData.usedStamps !== currentStudent.usedStamps ||
                JSON.stringify(freshData.redemptions) !== JSON.stringify(currentStudent.redemptions)) {
                currentStudent = freshData;
                updateStampDisplay(currentStudent);
                renderRewards(currentStudent);
            }
        }
    } catch (err) {
        console.error("Sync error:", err);
    }
}

async function loginWithId(id = null) {
    const idInput = document.getElementById('student-id-input');
    const studentId = (id || (idInput ? idInput.value.trim() : "")).toLowerCase();
    
    if (!studentId) {
        if (!id) alert("Bitte dein Kürzel eingeben.");
        return;
    }

    try {
        const response = await fetch(`${API_URL}/students/${studentId}`);
        if (response.ok) {
            currentStudent = await response.json();
            localStorage.setItem('studentId', currentStudent.id);
            showDetail(currentStudent);
        } else {
            if (!id && idInput) alert("Kürzel nicht gefunden.");
            localStorage.removeItem('studentId');
        }
    } catch (err) {
        console.error("Fetch error:", err);
    }
}

function logout() {
    localStorage.removeItem('studentId');
    stopSync();
    showHome();
}

function showHome() {
    isSupervisor = false;
    isDirectLink = false;
    stopSync();
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    document.getElementById('view-home').classList.remove('hidden');
}

function showList() {
    if (!isSupervisor) return;
    stopSync();
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    document.getElementById('view-list').classList.remove('hidden');
    fetchStudents();
}

async function fetchStudents() {
    try {
        const response = await fetch(`${API_URL}/students`);
        if (response.ok) {
            students = await response.json();
            renderStudentList();
        }
    } catch (err) {
        console.error("API error:", err);
    }
}

function renderStudentList() {
    const container = document.getElementById('student-container');
    container.innerHTML = '';

    students.forEach((s, index) => {
        const card = document.createElement('div');
        card.className = 'glass-card student-item';
        card.onclick = () => showDetail(s);
        card.innerHTML = `
            <div class="student-info">
                <div class="avatar">${s.name.charAt(0)}</div>
                <div class="student-name">${s.name}</div>
            </div>
            <div class="stamp-count">${s.stamps} / ${MAX_STAMPS}</div>
        `;
        container.appendChild(card);
    });
}

function showDetail(student) {
    currentStudent = student;
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    document.getElementById('view-detail').classList.remove('hidden');
    
    document.getElementById('detail-name').innerText = student.name;
    document.getElementById('detail-avatar').innerText = student.name.charAt(0);
    
    const addBtn = document.getElementById('add-stamp-button');
    const logoutBtn = document.getElementById('logout-btn');
    const backBtn = document.querySelector('.supervisor-back');

    if (isSupervisor) {
        addBtn.classList.remove('hidden');
        logoutBtn.classList.add('hidden');
        backBtn.classList.remove('hidden');
        stopSync();
    } else {
        addBtn.classList.add('hidden');
        logoutBtn.classList.remove('hidden');
        backBtn.classList.add('hidden');
        startSync();
    }

    updateStampDisplay(student);
    renderRewards(student);
}

function renderRewards(student) {
    const list = document.getElementById('reward-list');
    if (!list) return;
    list.innerHTML = '';
    
    const stamps = student.stamps;
    const redemptions = student.redemptions || {};
    
    // Compute total "used" stamps (how many were spent)
    // Preference: student.usedStamps from server, Fallback: sum of all confirmed thresholds
    let usedStamps = student.usedStamps || 0;
    if (usedStamps === 0 && student.redemptions) {
        Object.entries(redemptions).forEach(([t, s]) => {
            if (s === 'completed') usedStamps += parseInt(t);
        });
    }
    const freeStamps = stamps - usedStamps;

    REWARDS.forEach(reward => {
        const item = document.createElement('div');
        const isReached = freeStamps >= reward.threshold;
        const progress = Math.min(100, (freeStamps / reward.threshold) * 100);
        
        const status = redemptions[reward.threshold]; // undefined, 'pending', 'completed'
        
        item.className = `glass-card reward-item ${isReached ? 'unlocked' : ''} ${status === 'completed' ? 'redeemed' : ''}`;
        
        let actionHTML = '';
        if (isReached) {
            if (status === 'pending') {
                actionHTML = '<span class="reward-status warning">Angefragt ⏳</span>';
            } else if (status === 'completed') {
                // Only allow re-redemption if student has enough free (blue) stamps
                if (freeStamps >= reward.threshold) {
                    actionHTML = `<button class="redeem-btn" onclick="requestRedemption(${reward.threshold})">Nochmal einlösen</button>`;
                } else {
                    actionHTML = '<span class="reward-status success">Eingelöst ✅</span>';
                }
            } else {
                actionHTML = `<button class="redeem-btn" onclick="requestRedemption(${reward.threshold})">Einlösen</button>`;
            }
        } else {
            actionHTML = `<span class="reward-status">${reward.threshold} Stempel</span>`;
        }

        item.innerHTML = `
            <div class="reward-icon">${reward.icon}</div>
            <div style="flex:1">
                <div class="reward-title">${reward.title}</div>
                <div class="reward-desc">${reward.desc}</div>
                <div class="reward-progress-bg">
                    <div class="reward-progress-bar" style="width: ${progress}%"></div>
                </div>
            </div>
            <div style="text-align:right;">
                ${actionHTML}
            </div>
        `;
        list.appendChild(item);
    });
}

async function requestRedemption(threshold) {
    if (!currentStudent) return;
    try {
        const response = await fetch(`${API_URL}/students/${currentStudent.id}/redeem`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ threshold: threshold })
        });
        if (response.ok) {
            currentStudent = await response.json();
            renderRewards(currentStudent);
            alert("Einlösung angefragt! Der Admin wird es bald bestätigen.");
        } else {
            alert("Fehler: Server hat den Befehl nicht erkannt. Hast du die neue worker.js schon auf Cloudflare hochgeladen?");
        }
    } catch (err) {
        alert("Fehler bei der Anfrage. Keine Verbindung zum Server.");
    }
}

function goBack() {
    if (isDirectLink) return;
    if (isSupervisor) {
        showList();
    } else {
        showHome();
    }
}

function updateStampDisplay(student) {
    const mainGrid = document.getElementById('stamp-grid');
    const text = document.getElementById('detail-stamps-text');
    if (!mainGrid) return;
    mainGrid.innerHTML = '';
    text.innerText = `${student.stamps} von ${MAX_STAMPS} Stempel gesammelt`;

    // Checkmarks: based on TOTAL stamps ever spent (used)
    let usedStamps = student.usedStamps || 0;
    
    // If usedStamps is 0 (old data or start), try to reconstruct it from redemptions
    if (usedStamps === 0 && student.redemptions) {
        let sum = 0;
        Object.entries(student.redemptions).forEach(([t, s]) => {
            if (s === 'completed') sum += parseInt(t);
        });
        usedStamps = sum;
    }
    const maxCompletedRedemption = usedStamps;

    // Create 3 levels
    const dotsContainer = document.getElementById('carousel-dots');
    dotsContainer.innerHTML = '';

    for (let l = 1; l <= 3; l++) {
        const levelContainer = document.createElement('div');
        levelContainer.className = 'level-group';
        levelContainer.dataset.level = l;
        
        const start = (l - 1) * STAMPS_PER_LEVEL + 1;
        const end = l * STAMPS_PER_LEVEL;
        const isUnlocked = student.stamps >= (l - 1) * STAMPS_PER_LEVEL;

        levelContainer.innerHTML = `
            <div class="level-header ${isUnlocked ? 'active' : ''}">
                <span>Karte ${l}</span>
                <span class="level-range">${start}-${end}</span>
            </div>
            <div class="stamp-grid-20"></div>
        `;

        const grid = levelContainer.querySelector('.stamp-grid-20');
        for (let i = start; i <= end; i++) {
            const slot = document.createElement('div');
            let isFilled = i <= student.stamps;
            let isChecked = i <= maxCompletedRedemption;
            
            slot.className = `stamp-slot ${isFilled ? 'filled' : ''} ${isChecked ? 'checked' : ''}`;
            if (isChecked) {
                slot.innerText = '✔';
            } else if (isFilled) {
                slot.innerText = '★';
            } else {
                slot.innerText = '';
            }
            grid.appendChild(slot);
        }
        mainGrid.appendChild(levelContainer);

        // Add Dot
        const dot = document.createElement('div');
        dot.className = 'dot';
        dot.dataset.target = l;
        dotsContainer.appendChild(dot);
    }

    // Scroll listener for dots
    mainGrid.onscroll = () => {
        const scrollPos = mainGrid.scrollLeft;
        const width = mainGrid.offsetWidth;
        const activeIdx = Math.round(scrollPos / width);
        document.querySelectorAll('.dot').forEach((d, i) => {
            d.classList.toggle('active', i === activeIdx);
        });
    };

    // Auto-scroll to current level
    const currentLevel = Math.min(3, Math.floor(student.stamps / STAMPS_PER_LEVEL) + 1);
    
    // Glitter Explosion (Confetti) Logic
    const milestones = [20, 40, 60];
    milestones.forEach(m => {
        if (student.stamps >= m) {
            const key = `confetti_${student.id}_${m}`;
            if (!localStorage.getItem(key)) {
                fireConfetti();
                localStorage.setItem(key, 'true');
            }
        }
    });

    setTimeout(() => {
        const target = mainGrid.querySelector(`.level-group[data-level="${currentLevel}"]`);
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            // Initial dot update
            document.querySelectorAll('.dot').forEach((d, i) => {
                d.classList.toggle('active', i === (currentLevel - 1));
            });
        }
    }, 100);
}

function fireConfetti() {
    const duration = 3 * 1000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

    function randomInRange(min, max) {
      return Math.random() * (max - min) + min;
    }

    const interval = setInterval(function() {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        return clearInterval(interval);
      }

      const particleCount = 50 * (timeLeft / duration);
      // since particles fall down, start a bit higher than random
      confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } }));
      confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } }));
    }, 250);
}

// PIN Overlay
function openPinOverlay(callback, title = "PIN") {
    document.getElementById('pin-overlay').classList.add('active');
    document.querySelector('#pin-overlay h3').innerText = title;
    enteredPin = "";
    pinCallback = callback;
    updatePinDisplay();
}

function openSupervisorPin() {
    openPinOverlay((pin) => {
        if (pin === PIN_SUPERVISOR) {
            isSupervisor = true;
            showList();
            return true;
        }
        return false;
    }, "Betreuer Login");
}

function openAdminPin() {
    openPinOverlay((pin) => {
        if (pin === PIN_ADMIN) {
            window.location.href = 'admin/index.html';
            return true;
        }
        return false;
    }, "Admin-PIN");
}

function openStampPin() {
    openPinOverlay((pin) => {
        if (pin === PIN_STAMP) {
            addStamp();
            return true;
        }
        return false;
    }, "Stempel vergeben");
}

function closePinOverlay() {
    document.getElementById('pin-overlay').classList.remove('active');
}

function addPin(num) {
    if (enteredPin.length < 4) {
        enteredPin += num;
        updatePinDisplay();
        if (enteredPin.length === 4) {
            setTimeout(validatePin, 200);
        }
    }
}

function clearPin() {
    enteredPin = "";
    updatePinDisplay();
}

function updatePinDisplay() {
    const display = document.getElementById('pin-display');
    display.innerText = "•".repeat(enteredPin.length);
}

function validatePin() {
    if (typeof pinCallback !== 'function') return;
    const success = pinCallback(enteredPin);
    if (success) {
        closePinOverlay();
    } else {
        alert("Falscher PIN!");
        clearPin();
    }
}

async function addStamp() {
    if (!currentStudent) return;
    if (currentStudent.stamps < MAX_STAMPS) {
        const newCount = currentStudent.stamps + 1;
        try {
            const response = await fetch(`${API_URL}/students/${currentStudent.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ stamps: newCount })
            });
            if (response.ok) {
                currentStudent = await response.json();
                updateStampDisplay(currentStudent);
                renderRewards(currentStudent);
            }
        } catch (err) {
            alert("Fehler beim Speichern.");
        }
    }
}
