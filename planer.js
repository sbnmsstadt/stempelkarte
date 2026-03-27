const API_URL = "https://stempelkarte.sb-nmsstadt.workers.dev/api";
const PIN_ADMIN = "8520"; 

// --- Auth & Setup ---
const appContainer = document.getElementById('app-container');
const loginOverlay = document.getElementById('login-overlay');

function checkAuth() {
    if (sessionStorage.getItem('admin_auth') === PIN_ADMIN) {
        if (loginOverlay) loginOverlay.style.display = 'none';
        if (appContainer) appContainer.style.display = 'block';
        loadProjects();
    } else {
        if (loginOverlay) loginOverlay.style.display = 'flex';
        if (appContainer) appContainer.style.display = 'none';
        document.getElementById('admin-pin-input')?.focus();
    }
}

function verifyAdminPin() {
    const input = document.getElementById('admin-pin-input');
    if (input.value === PIN_ADMIN) {
        sessionStorage.setItem('admin_auth', PIN_ADMIN);
        checkAuth();
    } else {
        alert("Falscher PIN!");
        input.value = "";
        input.focus();
    }
}

checkAuth();

function showToast(msg, isError = false) {
    const toast = document.getElementById('toast');
    toast.innerText = msg;
    toast.style.background = isError ? '#ff6b6b' : 'var(--success)';
    toast.style.bottom = '20px';
    setTimeout(() => {
        toast.style.bottom = '-100px';
    }, 3000);
}

// Helper utility
function escapeHtml(unsafe) {
    if (!unsafe) return "";
    return String(unsafe)
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

// --- Project Loading & UI ---

async function loadProjects() {
    try {
        const res = await fetch(`${API_URL}/projects`);
        if (!res.ok) throw new Error("Fehler beim Laden der Projekte");
        const projects = await res.json();
        renderProjects(projects);
    } catch (err) {
        console.error(err);
        showToast("Fehler beim Laden: " + err.message, true);
    }
}

function renderProjects(projects) {
    const container = document.getElementById('projects-container');
    container.innerHTML = '';

    if (projects.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                <h3 style="margin-bottom: 10px; color: white;">Noch keine Projekte gespeichert</h3>
                <p>Gehe ins "AI Content Lab" und generiere neue, magische Ideen!</p>
                <button class="add-stamp-btn" style="margin-top: 20px;" onclick="window.location.href='kreativ.html'">Jetzt Ideen finden ✨</button>
            </div>
        `;
        return;
    }

    // Zeige die neuesten zuerst
    projects.reverse().forEach((project, index) => {
        const card = document.createElement('div');
        card.className = 'ai-result-card glass-card';
        card.style.background = 'rgba(255, 255, 255, 0.05)';
        
        const dateStr = new Date(project.createdAt).toLocaleDateString();

        card.innerHTML = `
            <h4 class="ai-result-title">
                ${escapeHtml(project.title)}
                <button class="delete-btn" onclick="deleteProject('${project.id}')" title="Projekt löschen">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                </button>
            </h4>
            <div class="ai-result-date">Gespeichert am ${dateStr}</div>
            <p class="ai-result-desc">${escapeHtml(project.description)}</p>
            <div class="ai-material-list" style="background: rgba(56, 189, 248, 0.1); border-color: var(--highlight);">
                <strong>Benötigt:</strong> ${escapeHtml(project.materials)}
            </div>
            <div style="background: rgba(0,0,0,0.3); padding: 10px; border-radius: 8px; font-family: monospace; color: var(--accent); margin-bottom: 15px; font-size: 0.85rem;">
                <strong>Infoboard Text:</strong><br>${escapeHtml(project.planText)}
            </div>
            <div class="ai-action-buttons" style="flex-direction: column;">
                <button class="btn-outline btn-outline-accent" onclick="addToPlan('${escapeHtml(project.planText)}', 'setting-today-plan')" style="width: 100%;">
                    📅 Heute umsetzen (Tagesplan)
                </button>
                <button class="btn-outline" onclick="addToPlan('${escapeHtml(project.title)}', 'setting-current-projects')" style="width: 100%;">
                    📌 Als aktuelles Projekt markieren
                </button>
            </div>
        `;
        
        card.style.animation = `bounceIn 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55) ${index * 0.05}s backwards`;
        container.appendChild(card);
    });
}

// --- Delete Project ---

async function deleteProject(id) {
    if (!confirm("Möchtest du dieses Projekt wirklich löschen?")) return;

    try {
        const res = await fetch(`${API_URL}/projects/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error("Fehler beim Löschen");
        showToast("Projekt gelöscht.");
        loadProjects(); // Reload list
    } catch (err) {
        console.error(err);
        showToast("Löschen fehlgeschlagen.", true);
    }
}

// --- Modal & Apply Logic (re-used from old kreativ.js) ---

let pendingSaveData = null;

async function addToPlan(textToAdd, targetField) {
    try {
        const getRes = await fetch(`${API_URL}/settings`, { cache: 'no-store' });
        if (!getRes.ok) throw new Error("Konnte Einstellungen nicht laden");
        
        const settings = await getRes.json();
        
        let propertyName = "";
        let modalTitle = "";
        
        if (targetField === 'setting-today-plan') {
            propertyName = 'todayPlan';
            modalTitle = 'Heutigen Plan bearbeiten';
        } else if (targetField === 'setting-current-projects') {
            propertyName = 'currentProjects';
            modalTitle = 'Aktuelle Projekte bearbeiten';
        } else {
            throw new Error("Unknown target field");
        }

        const currentText = settings[propertyName] || "";
        const combinedText = currentText ? currentText + "\n\n" + textToAdd : textToAdd;
        
        pendingSaveData = {
            settings: settings,
            propertyName: propertyName,
            targetField: targetField
        };
        
        document.getElementById('edit-plan-title').innerHTML = `<span>✏️</span> ${modalTitle}`;
        document.getElementById('edit-plan-textarea').value = combinedText;
        document.getElementById('edit-plan-modal').style.display = 'flex';
        
    } catch (err) {
        console.error("Speicherfehler:", err);
        showToast("Fehler beim Vorbereiten: " + err.message, true);
    }
}

function closePlanModal() {
    document.getElementById('edit-plan-modal').style.display = 'none';
    pendingSaveData = null;
}

async function savePlanEdit() {
    if (!pendingSaveData) return;
    
    const newText = document.getElementById('edit-plan-textarea').value.trim();
    const btn = document.getElementById('save-plan-btn');
    const originalBtnHtml = btn.innerHTML;
    
    try {
        btn.innerHTML = '<div class="loading-spinner" style="width:16px; height:16px; border-width:2px; vertical-align: middle;"></div> Speichere...';
        btn.disabled = true;
        
        const payload = { ...pendingSaveData.settings };
        payload[pendingSaveData.propertyName] = newText;
        
        const putRes = await fetch(`${API_URL}/settings`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (putRes.ok) {
            const successMsg = pendingSaveData.targetField === 'setting-today-plan' 
                ? "Zum heutigen Plan hinzugefügt!" 
                : "Zu aktuellen Projekten hinzugefügt!";
            closePlanModal();
            showToast(successMsg);
        } else {
            throw new Error("HTTP Fehler " + putRes.status);
        }
    } catch (err) {
        console.error("Speichern fehlgeschlagen:", err);
        alert("Speichern fehlgeschlagen: " + err.message);
    } finally {
        if (btn) {
            btn.innerHTML = originalBtnHtml;
            btn.disabled = false;
        }
    }
}
