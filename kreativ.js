const API_URL = "https://stempelkarte.sb-nmsstadt.workers.dev/api";
const PIN_ADMIN = "8520"; 

// --- Auth & Setup ---
const appContainer = document.getElementById('app-container');
const loginOverlay = document.getElementById('login-overlay');

function checkAuth() {
    if (sessionStorage.getItem('admin_auth') === PIN_ADMIN) {
        if (loginOverlay) loginOverlay.style.display = 'none';
        if (appContainer) appContainer.style.display = 'block';
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

// --- AI Generation Logic ---

const DEFAULT_PROMPT_TEMPLATE = `Du bist ein erfahrener Pädagoge in einer schulischen Nachmittagsbetreuung für Kinder zwischen 10 und 14 Jahren (Mittelschule). 
Generiere 3 kreative, motivierende und gut durchführbare Projekt-Ideen basierend auf folgenden Vorgaben:

Thema: {thema}
Altersgruppe: {alter}
Dauer: {dauer} Minuten
Zusätzliche Vorgaben: {extra}

Deine Antwort MUSS zwingend im folgenden JSON-Format sein, ohne Markdown Code-Blöcke (kein \`\`\`json etc.):
[
  {
    "title": "Titel der Idee (mit einem passenden Emoji am Anfang)",
    "description": "Kurze, spannende Beschreibung der Idee (2-3 Sätze)",
    "materials": "Was wird benötigt? (Kurz in einem Satz)",
    "planText": "Der kurze Text, der auf dem Infoboard angezeigt werden soll (z.B. '🎨 14:00 - 15:00: Osterbasteln')"
  }
]
`;

async function generateIdeas() {
    const thema = document.getElementById('prompt-thema').value.trim();
    const alter = document.getElementById('prompt-alter').value;
    const dauer = document.getElementById('prompt-dauer').value;
    const extra = document.getElementById('prompt-extra').value.trim();

    if (!thema) {
        alert("Bitte ein Thema eingeben!");
        document.getElementById('prompt-thema').focus();
        return;
    }

    // UI Updates
    document.getElementById('generate-btn').style.display = 'none';
    document.getElementById('loading-indicator').style.display = 'block';
    
    // Construct Prompt
    const promptText = DEFAULT_PROMPT_TEMPLATE
        .replace('{thema}', thema)
        .replace('{alter}', alter)
        .replace('{dauer}', dauer)
        .replace('{extra}', extra || "Keine besonderen Vorgaben.");

    try {
        const url = `${API_URL}/ai/generate`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ promptText })
        });

        if (!response.ok) {
            const errBody = await response.text();
            throw new Error(`API Fehler: ${response.status} - ${errBody}`);
        }

        const data = await response.json();
        
        if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts[0]) {
            let jsonText = data.candidates[0].content.parts[0].text;
            
            // Cleanup just in case the model ignored the instructions
            jsonText = jsonText.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '').trim();
            
            const ideas = JSON.parse(jsonText);
            renderIdeas(ideas);
        } else {
            throw new Error("Unerwartete Antwortstruktur der API");
        }

    } catch (err) {
        console.error("Generierungsfehler:", err);
        alert("Fehler bei der Generierung: " + err.message);
        
        // Fallback for demonstration if API fails or key is invalid
        if (err.message.includes('400') || err.message.includes('403')) {
            renderIdeas([
                {
                    title: "🎨 Kreativ-Werkstatt: " + thema,
                    description: "Eine entspannte Bastelrunde zum genannten Thema. Die Schüler können ihrer Kreativität freien Lauf lassen.",
                    materials: "Standard Bastelmaterial (Papier, Stifte, Schere, Kleber)",
                    planText: "\uD83C\uDFA8 " + thema + " (" + dauer + " Min)"
                },
                {
                    title: "🏆 " + thema + " - Challenge",
                    description: "Wir machen aus dem Thema einen kleinen Wettbewerb. Wer hat die kreativste Idee oder ist am schnellsten?",
                    materials: "Nach Bedarf",
                    planText: "🏆 Challenge: " + thema
                }
            ]);
        }
    } finally {
        document.getElementById('generate-btn').style.display = 'flex';
        document.getElementById('loading-indicator').style.display = 'none';
    }
}

function renderIdeas(ideas) {
    const container = document.getElementById('results-container');
    container.innerHTML = '';

    ideas.forEach((idea, index) => {
        const card = document.createElement('div');
        card.className = 'ai-result-card';
        card.innerHTML = `
            <h4 class="ai-result-title">${idea.title}</h4>
            <p class="ai-result-desc">${idea.description}</p>
            <div class="ai-material-list"><strong>Benötigt:</strong> ${idea.materials}</div>
            <div style="background: rgba(0,0,0,0.3); padding: 10px; border-radius: 8px; font-family: monospace; color: var(--accent); margin-bottom: 15px; font-size: 0.85rem;">
                <strong>Infoboard Vorschau:</strong><br>${idea.planText}
            </div>
            <div class="ai-action-buttons">
                <button class="btn-outline btn-outline-accent" onclick="addToPlan('${escapeHtml(idea.planText)}', 'setting-today-plan')" style="flex:1">
                    📅 In "Heutigen Plan"
                </button>
                <button class="btn-outline" onclick="addToPlan('${escapeHtml(idea.title)}', 'setting-current-projects')" style="flex:1">
                    📌 In "Aktuelle Projekte"
                </button>
            </div>
        `;
        
        // Staggered animation
        card.style.animation = `bounceIn 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55) ${index * 0.1}s backwards`;
        container.appendChild(card);
    });
}

// --- Integration with Admin Settings ---

async function addToPlan(textToAdd, targetField) {
    try {
        // 1. Fetch current settings
        const getRes = await fetch(`${API_URL}/settings`, { cache: 'no-store' });
        if (!getRes.ok) throw new Error("Konnte Einstellungen nicht laden");
        
        const settings = await getRes.json();
        
        // 2. Identify the field we want to update.
        // The API returns camelCase properties usually, but let's map our UI IDs to the correct properties.
        let propertyName = "";
        let currentText = "";
        
        if (targetField === 'setting-today-plan') {
            propertyName = 'todayPlan';
        } else if (targetField === 'setting-current-projects') {
            propertyName = 'currentProjects';
        } else {
            throw new Error("Unknown target field");
        }

        currentText = settings[propertyName] || "";
        
        // Avoid duplicate appends
        if (currentText.includes(textToAdd)) {
            showToast("Dieser Eintrag existiert bereits im Plan.");
            return;
        }

        // 3. Append the text
        const newText = currentText ? currentText + "\\n" + textToAdd : textToAdd;
        
        // 4. Update the payload
        const payload = { ...settings };
        payload[propertyName] = newText;
        
        // 5. Save back to API
        const putRes = await fetch(`${API_URL}/settings`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (putRes.ok) {
            showToast(targetField === 'setting-today-plan' ? "Zum heutigen Plan hinzugefügt!" : "Zu aktuellen Projekten hinzugefügt!");
        } else {
            throw new Error("Speichern fehlgeschlagen");
        }

    } catch (err) {
        console.error(err);
        showToast("Fehler beim Übernehmen in den Plan", true);
    }
}

// Helper utility
function escapeHtml(unsafe) {
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}
