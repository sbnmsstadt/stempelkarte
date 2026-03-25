const API_URL = "https://stempelkarte.sb-nmsstadt.workers.dev/api";
let students = [];
let REWARDS = [];
let lastStudentsSnapshot = "";

document.addEventListener('DOMContentLoaded', async () => {
    await fetchRewards();
    fetchStudents();
    
    // Poll every 5 seconds for new redemptions/stamps
    setInterval(fetchStudentsSilent, 5000);
    
    document.getElementById('add-btn').addEventListener('click', createNewStudent);
    document.getElementById('add-reward-btn').addEventListener('click', createNewReward);
});

async function fetchRewards() {
    try {
        const response = await fetch(`${API_URL}/rewards`);
        if (response.ok) {
            REWARDS = await response.json();
            REWARDS.sort((a,b) => a.threshold - b.threshold);
            renderRewardDashboard();
        }
    } catch (err) {
        console.error("Fehler beim Laden der Belohnungen", err);
    }
}

async function fetchStudents() {
    const container = document.getElementById('admin-student-list');
    try {
        const response = await fetch(`${API_URL}/students`);
        if (response.ok) {
            const raw = await response.text();
            lastStudentsSnapshot = raw;
            students = JSON.parse(raw);
            renderAdminList();
            renderBirthdayDashboard();
            renderRedemptionDashboard();
        } else {
            showStatus("Fehler beim Laden der Schüler.", "error");
        }
    } catch (err) {
        showStatus("Verbindung zum Server fehlgeschlagen.", "error");
    }
}

async function fetchStudentsSilent() {
    // Only fetch if tab is visible to save requests
    if (document.hidden) return;
    
    try {
        const response = await fetch(`${API_URL}/students`);
        if (response.ok) {
            const raw = await response.text();
            if (raw !== lastStudentsSnapshot) {
                lastStudentsSnapshot = raw;
                students = JSON.parse(raw);
                renderAdminList();
                renderBirthdayDashboard();
                renderRedemptionDashboard();
            }
        }
    } catch (err) {
        // silent fail
    }
}

function renderRedemptionDashboard() {
    const db = document.getElementById('redemption-dashboard');
    if (!db) return;
    
    db.innerHTML = '';
    
    let requests = [];
    students.forEach(s => {
        if (s.redemptions) {
            for (const [threshold, status] of Object.entries(s.redemptions)) {
                if (status === 'pending') {
                    let rewardName = getRewardNameByThreshold(parseInt(threshold));
                    requests.push({ id: s.id, name: s.name, threshold: parseInt(threshold), rewardName });
                }
            }
        }
    });

    if (requests.length === 0) {
        db.innerHTML = '<i>Keine offenen Anfragen.</i>';
        return;
    }

    requests.forEach(req => {
        const el = document.createElement('div');
        el.style.display = 'flex';
        el.style.justifyContent = 'space-between';
        el.style.alignItems = 'center';
        el.style.marginBottom = '8px';
        el.style.padding = '8px';
        el.style.background = 'rgba(255,255,255,0.05)';
        el.style.borderRadius = '8px';
        
        el.innerHTML = `
            <div>
                <span style="color:white; font-weight:600;">${req.name}</span> möchte 
                <span style="color:var(--accent); font-weight:600;">${req.rewardName}</span> einlösen
            </div>
            <button onclick="confirmRedemption('${req.id}', ${req.threshold})" style="background:var(--success); border:none; color:white; padding:6px 12px; border-radius:8px; cursor:pointer; font-weight:600;">
                Bestätigen
            </button>
        `;
        db.appendChild(el);
    });
}

function getRewardNameByThreshold(threshold) {
    const r = REWARDS.find(x => x.threshold === parseInt(threshold));
    return r ? r.title : `Level ${threshold} Belohnung`;
}

async function confirmRedemption(studentId, threshold) {
    try {
        const response = await fetch(`${API_URL}/students/${studentId}/redeem`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ threshold: threshold, status: 'completed' })
        });
        if (response.ok) {
            showStatus("Belohnung bestätigt!", "success");
            await fetchStudents(); // Refresh data
        } else {
            alert("Bestätigung fehlgeschlagen.");
        }
    } catch (err) {
        alert("Netzwerkfehler beim Bestätigen.");
    }
}

function renderBirthdayDashboard() {
    const db = document.getElementById('birthday-dashboard');
    if (!db) return;
    
    db.innerHTML = '';
    
    const today = new Date();
    today.setHours(0,0,0,0);
    
    // Look 14 days ahead
    const twoWeeksLater = new Date(today);
    twoWeeksLater.setDate(today.getDate() + 14);
    
    let upcoming = [];
    
    students.forEach(s => {
        if (!s.birthday) return;
        const parts = s.birthday.split('-');
        if (parts.length === 3) {
            const bMonth = parseInt(parts[1], 10) - 1;
            const bDay = parseInt(parts[2], 10);
            
            // Check birthday for this year
            let bDateThisYear = new Date(today.getFullYear(), bMonth, bDay);
            
            // If birthday already passed this year, check next year
            if (bDateThisYear < today) {
                bDateThisYear = new Date(today.getFullYear() + 1, bMonth, bDay);
            }
            
            if (bDateThisYear >= today && bDateThisYear <= twoWeeksLater) {
                // Calculate age
                const bYear = parseInt(parts[0], 10);
                const age = bDateThisYear.getFullYear() - bYear;
                
                upcoming.push({
                    name: s.name,
                    date: bDateThisYear,
                    age: age,
                    originalDateStr: `${parts[2]}.${parts[1]}.${parts[0]}`
                });
            }
        }
    });
    
    upcoming.sort((a,b) => a.date - b.date);
    
    if (upcoming.length === 0) {
        db.innerHTML = '<i>Keine Geburtstage in den nächsten 2 Wochen.</i>';
        return;
    }
    
    upcoming.forEach(u => {
        const diffTime = Math.abs(u.date - today);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        let relativeDay = `In ${diffDays} Tagen`;
        if (diffDays === 0) relativeDay = '<b>Heute! 🎉</b>';
        else if (diffDays === 1) relativeDay = 'Morgen';
        
        const el = document.createElement('div');
        el.style.marginBottom = '6px';
        el.innerHTML = `<span style="color:white; font-weight:600;">${u.name}</span> wird ${u.age} (${u.originalDateStr}) - <span style="color:var(--primary-light);">${relativeDay}</span>`;
        db.appendChild(el);
    });
}

let editingRewardThreshold = null;

function renderRewardDashboard() {
    const list = document.getElementById('admin-reward-list');
    if (!list) return;
    list.innerHTML = '';

    if (REWARDS.length === 0) {
        list.innerHTML = '<i>Keine Belohnungen vorhanden.</i>';
        return;
    }

    REWARDS.forEach(reward => {
        const item = document.createElement('div');
        item.style.display = 'flex';
        item.style.justifyContent = 'space-between';
        item.style.alignItems = 'center';
        item.style.background = 'rgba(255,255,255,0.05)';
        item.style.padding = '10px';
        item.style.borderRadius = '8px';
        item.style.flexWrap = 'wrap';
        item.style.gap = '10px';
        
        if (editingRewardThreshold === reward.threshold) {
            // Edit Mode UI
            item.innerHTML = `
                <div style="display:flex; gap:10px; width:100%; flex-wrap: wrap;">
                    <input type="number" id="edit-req-thresh" value="${reward.threshold}" placeholder="Stempel" style="flex:1; min-width:80px; padding: 6px; border-radius: 6px; border: 1px solid var(--glass-border); background: rgba(0,0,0,0.3); color: white;">
                    <input type="text" id="edit-req-icon" value="${reward.icon}" placeholder="Emoji" style="flex:1; min-width:60px; padding: 6px; border-radius: 6px; border: 1px solid var(--glass-border); background: rgba(0,0,0,0.3); color: white;">
                    <input type="text" id="edit-req-title" value="${reward.title}" placeholder="Titel" style="flex:2; min-width:120px; padding: 6px; border-radius: 6px; border: 1px solid var(--glass-border); background: rgba(0,0,0,0.3); color: white;">
                    <input type="text" id="edit-req-desc" value="${reward.desc}" placeholder="Beschreibung" style="flex:3; min-width:140px; padding: 6px; border-radius: 6px; border: 1px solid var(--glass-border); background: rgba(0,0,0,0.3); color: white;">
                    <div style="display:flex; gap:5px;">
                        <button class="add-stamp-btn" onclick="saveEditReward(${reward.threshold})" style="width:auto; padding: 6px 12px; background:var(--success);">Speichern</button>
                        <button class="icon-btn-small" onclick="cancelEditReward()" style="background: hsla(0, 80%, 60%, 0.2); border: 1px solid hsla(0, 80%, 60%, 0.5); color: #ff6b6b; padding: 6px 12px; border-radius:6px;">Abbrechen</button>
                    </div>
                </div>
            `;
        } else {
            // View Mode UI
            item.innerHTML = `
                <div style="flex:1; min-width: 250px;">
                    <strong>${reward.threshold} Stempel:</strong> ${reward.icon} ${reward.title}
                    <div style="font-size:0.8rem; color:var(--text-muted);">${reward.desc}</div>
                </div>
                <div style="display:flex; gap:8px;">
                    <button class="icon-btn-small" onclick="startEditReward(${reward.threshold})" title="Bearbeiten" style="background: hsla(210, 80%, 60%, 0.2); border: 1px solid hsla(210, 80%, 60%, 0.5); color: #60a5fa;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                    </button>
                    <button class="icon-btn-small" onclick="deleteReward(${reward.threshold})" title="Löschen" style="background: hsla(0, 80%, 60%, 0.2); border: 1px solid hsla(0, 80%, 60%, 0.5); color: #ff6b6b;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                </div>
            `;
        }
        list.appendChild(item);
    });
}

function startEditReward(threshold) {
    editingRewardThreshold = parseInt(threshold, 10);
    renderRewardDashboard();
}

function cancelEditReward() {
    editingRewardThreshold = null;
    renderRewardDashboard();
}

async function saveEditReward(oldThreshold) {
    const threshInput = document.getElementById('edit-req-thresh');
    const iconInput = document.getElementById('edit-req-icon');
    const titleInput = document.getElementById('edit-req-title');
    const descInput = document.getElementById('edit-req-desc');

    const newThreshold = parseInt(threshInput.value, 10);
    const newIcon = iconInput.value.trim() || "🎁";
    const newTitle = titleInput.value.trim();
    const newDesc = descInput.value.trim();

    if (isNaN(newThreshold) || newThreshold <= 0 || !newTitle) {
        alert("Bitte eine gültige Stempelanzahl und einen Titel eingeben.");
        return;
    }

    // Check if new threshold conflicts with an existing reward (that is NOT the one we are editing)
    if (newThreshold !== oldThreshold && REWARDS.find(r => r.threshold === newThreshold)) {
        alert(`Es gibt bereits eine Belohnung für ${newThreshold} Stempel! Bitte wähle eine andere Anzahl.`);
        return;
    }

    // Create updated array
    const updatedArray = REWARDS.map(r => {
        if (r.threshold === oldThreshold) {
            return { threshold: newThreshold, icon: newIcon, title: newTitle, desc: newDesc };
        }
        return r;
    });

    const success = await saveRewardsAPI(updatedArray);
    if (success) {
        editingRewardThreshold = null;
        renderRewardDashboard();
    } else {
        alert("Fehler beim Speichern der Änderungen.");
    }
}

async function saveRewardsAPI(newRewardsArray) {
    try {
        const response = await fetch(`${API_URL}/rewards`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newRewardsArray)
        });
        if (response.ok) {
            REWARDS = await response.json();
            renderRewardDashboard();
            return true;
        }
    } catch (err) {
        console.error(err);
    }
    return false;
}

async function createNewReward() {
    const thresholdInput = document.getElementById('new-reward-threshold');
    const iconInput = document.getElementById('new-reward-icon');
    const titleInput = document.getElementById('new-reward-title');
    const descInput = document.getElementById('new-reward-desc');
    const btn = document.getElementById('add-reward-btn');

    const threshold = parseInt(thresholdInput.value);
    const icon = iconInput.value.trim() || "🎁";
    const title = titleInput.value.trim();
    const desc = descInput.value.trim();

    if (isNaN(threshold) || threshold <= 0 || !title) {
        alert("Bitte eine gültige Stempelanzahl und einen Titel eingeben.");
        return;
    }

    // Check if threshold already exists
    if (REWARDS.find(r => r.threshold === threshold)) {
        alert(`Es gibt bereits eine Belohnung für ${threshold} Stempel! Bitte lösche diese zuerst.`);
        return;
    }

    btn.disabled = true;
    
    const newDoc = { threshold, icon, title, desc };
    const updatedArray = [...REWARDS, newDoc];
    
    const success = await saveRewardsAPI(updatedArray);
    
    if (success) {
        thresholdInput.value = '';
        iconInput.value = '';
        titleInput.value = '';
        descInput.value = '';
        document.getElementById('reward-status-msg').innerText = "Belohnung gespeichert!";
        document.getElementById('reward-status-msg').style.display = "block";
        document.getElementById('reward-status-msg').style.color = "var(--success)";
        setTimeout(() => document.getElementById('reward-status-msg').style.display = "none", 3000);
    } else {
        alert("Fehler beim Speichern der Belohnung.");
    }
    btn.disabled = false;
}

async function deleteReward(thresholdStr) {
    const threshold = parseInt(thresholdStr, 10);
    if (!confirm(`Belohnung für ${threshold} Stempel wirklich löschen?`)) return;
    
    const updatedArray = REWARDS.filter(r => r.threshold !== threshold);
    
    const success = await saveRewardsAPI(updatedArray);
    if (!success) {
        alert("Fehler beim Löschen. Möglicherweise keine Verbindung.");
    } else {
        showStatus("Belohnung erfolgreich gelöscht.", "success");
    }
}

function renderAdminList() {
    const container = document.getElementById('admin-student-list');
    container.innerHTML = '';

    if (students.length === 0) {
        container.innerHTML = '<div class="glass-card" style="text-align:center">Keine Schüler gefunden.</div>';
        return;
    }

    students.forEach(student => {
        const item = document.createElement('div');
        item.className = 'glass-card admin-student-item';
        item.style.cursor = 'default';
        
        item.innerHTML = `
            <div class="student-info" style="margin-bottom: 1rem;">
                <div class="avatar">${student.name.charAt(0)}</div>
                <div>
                    <div class="student-name" style="font-size: 1.2rem;">${student.name}</div>
                    <div class="stamp-count" style="display:inline-block; margin-top:5px; padding: 4px 10px; font-size:0.75rem;">ID: ${student.id}</div>
                    ${student.birthday ? `<div style="font-size:0.75rem; color:var(--text-muted); margin-top:4px;">🎂 ${formatDateString(student.birthday)}</div>` : ''}
                </div>
            </div>
            <div class="admin-row-actions" style="background: rgba(0,0,0,0.2); padding: 1rem; border-radius: 16px;">
                <div class="admin-stamp-control" style="flex: 1;">
                    <span class="subtitle" style="margin-right: 10px; color: white; font-weight: 600;">Stempel:</span>
                    <input type="number" class="admin-stamp-input" value="${student.stamps}" onchange="updateStudentStamps('${student.id}', this.value)" style="width: 80px; font-size: 1.2rem; padding: 8px;">
                </div>
                <div class="admin-button-group">
                    <button class="icon-btn-small" onclick="copyShareLink('${student.id}')" title="Link kopieren" style="background: var(--primary); border: none; color: white;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                    </button>
                    <button class="icon-btn-small" onclick="deleteStudent('${student.id}')" title="Schüler löschen" style="background: hsla(0, 80%, 60%, 0.2); border: 1px solid hsla(0, 80%, 60%, 0.5); color: #ff6b6b;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                </div>
            </div>
        `;
        container.appendChild(item);
    });
}

function copyShareLink(id) {
    const baseUrl = window.location.href.replace('admin.html', 'index.html');
    const shareLink = `${baseUrl}?id=${id}`;
    
    navigator.clipboard.writeText(shareLink).then(() => {
        alert("Persönlicher Link für Schüler kopiert:\n" + shareLink);
    }).catch(err => {
        console.error('Could not copy text: ', err);
        prompt("Link für Schüler manuell kopieren:", shareLink);
    });
}

async function createNewStudent() {
    const nameInput = document.getElementById('new-student-name');
    const bdayInput = document.getElementById('new-student-birthday');
    const name = nameInput.value.trim();
    const birthday = bdayInput.value; // YYYY-MM-DD
    const btn = document.getElementById('add-btn');
    
    if (!name) {
        showStatus("Bitte einen Namen eingeben.", "error");
        return;
    }

    btn.disabled = true;
    showStatus("Wird gespeichert...", "info");

    try {
        const response = await fetch(`${API_URL}/students`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, birthday })
        });
        
        if (response.ok) {
            nameInput.value = '';
            bdayInput.value = '';
            showStatus("Schüler erfolgreich angelegt!", "success");
            await fetchStudents();
        } else {
            const errText = await response.text();
            showStatus("Fehler: " + errText, "error");
        }
    } catch (err) {
        showStatus("Netzwerkfehler. Ist der Worker online?", "error");
    } finally {
        btn.disabled = false;
    }
}

async function deleteStudent(id) {
    if (!confirm("Schüler wirklich löschen?")) return;

    try {
        const response = await fetch(`${API_URL}/students/${id}`, { method: 'DELETE' });
        if (response.ok) {
            await fetchStudents();
        } else {
            alert("Löschen fehlgeschlagen.");
        }
    } catch (err) {
        alert("Netzwerkfehler beim Löschen.");
    }
}

async function updateStudentStamps(id, count) {
    count = parseInt(count);
    if (isNaN(count) || count < 0) return;

    try {
        const response = await fetch(`${API_URL}/students/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stamps: count })
        });
        if (response.ok) {
            const student = students.find(s => s.id === id);
            if (student) student.stamps = count;
        } else {
            alert("Update fehlgeschlagen.");
        }
    } catch (err) {
        alert("Netzwerkfehler beim Update.");
    }
}

function showStatus(msg, type) {
    const status = document.getElementById('status-msg');
    status.innerText = msg;
    status.style.display = 'block';
    status.style.color = type === 'error' ? '#ff4d4d' : (type === 'success' ? '#10b981' : '#60a5fa');
    
    if (type === 'success' || type === 'info') {
        setTimeout(() => { if (status) status.style.display = 'none'; }, 3000);
    }
}

function formatDateString(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
}
