/**
 * Logbook Module for Admin Dashboard
 * Handles pedagogical logs and AI summaries.
 */

const Logbook = {
    currentDate: new Date().toISOString().split('T')[0],
    selectedTypes: {}, // studentId -> type ('pos', 'neg', 'neu')

    init() {
        console.log("Logbook initialized");
        this.renderBaseLayout();
        this.updateDateDisplay();
    },

    renderBaseLayout() {
        const container = document.getElementById('logbook-view');
        if (!container) return;

        container.innerHTML = `
            <div class="logbook-container">
                <div class="logbook-header">
                    <div>
                        <h2 style="font-size: 1.8rem; margin-bottom: 0.5rem;">📖 Pädagogisches Logbuch</h2>
                        <p class="subtitle">Tägliche Beobachtungen und Dokumentation</p>
                    </div>
                    <div class="logbook-controls">
                        <div style="display: flex; align-items: center; gap: 10px; background: rgba(255,255,255,0.05); padding: 8px 15px; border-radius: 12px; border: 1px solid var(--glass-border);">
                            <label style="font-size: 0.8rem; font-weight: 700; color: var(--text-muted);">DATUM:</label>
                            <input type="date" id="logbook-date-picker" value="${this.currentDate}" onchange="Logbook.setDate(this.value)" style="background:transparent; border:none; color:white; font-weight:700; cursor:pointer;">
                        </div>
                        <button onclick="Logbook.generateAISummary()" class="add-stamp-btn" style="background: linear-gradient(135deg, #f59e0b, #d97706); border: none; box-shadow: 0 4px 15px rgba(245,158,11,0.3);">
                            ✨ KI Zusammenfassung
                        </button>
                    </div>
                </div>

                <div id="logbook-student-grid" class="logbook-student-grid">
                    <div class="glass-card" style="text-align:center; grid-column: 1/-1;">Lade Schüler...</div>
                </div>
            </div>

            <!-- Summary Overlay -->
            <div id="summary-overlay" class="summary-overlay hidden">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:1rem;">
                    <h3 style="color:var(--accent); margin:0;">✨ KI Tages-Bericht</h3>
                    <button onclick="Logbook.closeSummary()" style="background:transparent; border:none; color:white; cursor:pointer; font-size:1.5rem;">&times;</button>
                </div>
                <div id="summary-content" class="summary-content">
                    <div style="text-align:center; padding:2rem;">
                        <div class="spinner-small" style="margin:0 auto 10px;"></div>
                        <p>KI analysiert den Tag...</p>
                    </div>
                </div>
                <button onclick="Logbook.closeSummary()" class="log-save-btn" style="width:100%; margin-top:1.5rem; background:rgba(255,255,255,0.1);">Schließen</button>
            </div>

            <!-- History Modal -->
            <div id="history-modal" class="history-modal-overlay hidden">
                <div class="history-card">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
                        <h2 id="history-student-name">Schüler-Archiv</h2>
                        <button onclick="Logbook.closeHistory()" style="background:transparent; border:none; color:white; cursor:pointer; font-size:1.8rem;">&times;</button>
                    </div>
                    <div id="history-list" class="history-list">
                        <!-- History items go here -->
                    </div>
                </div>
            </div>
        `;
    },

    async renderStudents() {
        const grid = document.getElementById('logbook-student-grid');
        if (!grid) return;

        if (!window.students || window.students.length === 0) {
            grid.innerHTML = '<div class="glass-card" style="text-align:center; grid-column: 1/-1;">Keine Schüler gefunden.</div>';
            return;
        }

        grid.innerHTML = '';
        window.students.forEach(student => {
            const hasLogsToday = student.pedagogical_logs && student.pedagogical_logs.some(l => l.date === this.currentDate);
            const card = document.createElement('div');
            card.className = `logbook-card ${hasLogsToday ? 'has-logs' : ''}`;
            card.dataset.id = student.id;

            const currentType = this.selectedTypes[student.id] || 'neu';

            card.innerHTML = `
                <div class="logbook-card-header">
                    <div class="avatar" style="width:40px; height:40px; font-size:1rem;">${student.avatar || student.name.charAt(0)}</div>
                    <div style="flex:1">
                        <div class="logbook-student-name">${student.name}</div>
                        <div class="subtitle" style="font-size:0.7rem">${hasLogsToday ? '✅ Eintrag vorhanden' : 'Kein Eintrag für heute'}</div>
                    </div>
                    <button class="icon-btn-small" onclick="Logbook.showHistory('${student.id}')" title="Archiv öffnen">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    </button>
                </div>

                <div class="log-input-area">
                    <textarea id="note-${student.id}" class="log-textarea" placeholder="Beobachtung eingeben..."></textarea>
                    
                    <div style="display:flex; gap:10px; align-items:center;">
                        <div class="log-type-buttons" style="flex:1">
                            <button onclick="Logbook.setType('${student.id}', 'pos')" id="btn-pos-${student.id}" class="type-btn btn-pos ${currentType === 'pos' ? 'active' : ''}" title="Positiv">👍</button>
                            <button onclick="Logbook.setType('${student.id}', 'neu')" id="btn-neu-${student.id}" class="type-btn btn-neu ${currentType === 'neu' ? 'active' : ''}" title="Neutral">💬</button>
                            <button onclick="Logbook.setType('${student.id}', 'neg')" id="btn-neg-${student.id}" class="type-btn btn-neg ${currentType === 'neg' ? 'active' : ''}" title="Negativ">👎</button>
                        </div>
                        <button id="save-btn-${student.id}" onclick="Logbook.saveEntry('${student.id}')" class="log-save-btn">
                            Speichern
                        </button>
                    </div>
                </div>
            `;
            grid.appendChild(card);
        });
    },

    setDate(date) {
        this.currentDate = date;
        this.renderStudents();
    },

    updateDateDisplay() {
        const picker = document.getElementById('logbook-date-picker');
        if (picker) picker.value = this.currentDate;
    },

    setType(studentId, type) {
        this.selectedTypes[studentId] = type;
        // Update UI
        ['pos', 'neg', 'neu'].forEach(t => {
            const btn = document.getElementById(`btn-${t}-${studentId}`);
            if (btn) btn.classList.toggle('active', t === type);
        });
    },

    async saveEntry(studentId) {
        const text = document.getElementById(`note-${studentId}`).value;
        const type = this.selectedTypes[studentId] || 'neu';
        const btn = document.getElementById(`save-btn-${studentId}`);
        
        if (!text.trim()) {
            alert("Bitte einen Text eingeben.");
            return;
        }

        btn.disabled = true;
        btn.innerHTML = `<div class="spinner-small"></div>`;

        try {
            const response = await fetch(`${API_URL}/students/${studentId}/logs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type,
                    text,
                    date: this.currentDate
                })
            });

            if (response.ok) {
                // Update local student data
                const updatedStudent = await response.json();
                const idx = window.students.findIndex(s => s.id === studentId);
                if (idx !== -1) window.students[idx] = updatedStudent;
                
                // Reset UI for this card
                document.getElementById(`note-${studentId}`).value = '';
                this.renderStudents(); // Re-render to show "✅"
            } else {
                alert("Fehler beim Speichern.");
                btn.disabled = false;
                btn.innerText = "Speichern";
            }
        } catch (err) {
            alert("Verbindungsfehler.");
            btn.disabled = false;
            btn.innerText = "Speichern";
        }
    },

    async generateAISummary() {
        const modal = document.getElementById('summary-overlay');
        const content = document.getElementById('summary-content');
        modal.classList.remove('hidden');
        content.innerHTML = `
            <div style="text-align:center; padding:2rem;">
                <div class="spinner-small" style="margin:0 auto 10px; width:40px; height:40px; border-width:4px;"></div>
                <p style="font-weight:700;">KI analysiert den Tag...</p>
                <p class="subtitle">Das kann einige Sekunden dauern.</p>
            </div>
        `;

        try {
            const response = await fetch(`${API_URL}/ai/day-summary?date=${this.currentDate}`);
            const data = await response.json();
            
            if (response.ok) {
                content.innerHTML = data.text;
            } else {
                content.innerHTML = `<p style='color:#ff6b6b'><b>Fehler bei der KI-Generierung:</b><br>${data.text || response.statusText}</p>`;
            }
        } catch (err) {
            content.innerHTML = "<p style='color:#ff6b6b'>Verbindungsfehler zur KI.</p>";
        }
    },

    closeSummary() {
        document.getElementById('summary-overlay').classList.add('hidden');
    },

    showHistory(studentId) {
        const student = window.students.find(s => s.id === studentId);
        if (!student) return;

        const modal = document.getElementById('history-modal');
        const nameEl = document.getElementById('history-student-name');
        const listEl = document.getElementById('history-list');

        nameEl.innerText = `Archiv: ${student.name}`;
        modal.classList.remove('hidden');

        const logs = student.pedagogical_logs || [];
        if (logs.length === 0) {
            listEl.innerHTML = '<p class="subtitle" style="text-align:center; padding:2rem;">Noch keine Beobachtungen dokumentiert.</p>';
            return;
        }

        // Sort logs by date descending
        const sortedLogs = [...logs].sort((a, b) => new Date(b.timestamp || b.date) - new Date(a.timestamp || a.date));

        listEl.innerHTML = sortedLogs.map(log => {
            const dateStr = new Date(log.timestamp || log.date).toLocaleDateString('de-DE', {
                day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
            });
            const typeLabel = log.type === 'pos' ? 'Positiv' : (log.type === 'neg' ? 'Negativ' : 'Neutral');
            const typeClass = log.type || 'neu';
            
            return `
                <div class="history-item ${typeClass}">
                    <div class="history-date">
                        <span>${dateStr}</span>
                        <span class="badge-log badge-${typeClass}">${typeLabel}</span>
                    </div>
                    <div style="font-size:0.95rem; line-height:1.4;">${log.text}</div>
                </div>
            `;
        }).join('');
    },

    closeHistory() {
        document.getElementById('history-modal').classList.add('hidden');
    }
};

// Hook into the global student list update
const originalFetchStudents = window.fetchStudents;
window.fetchStudents = async function() {
    if (originalFetchStudents) await originalFetchStudents();
    if (document.getElementById('logbook-view') && !document.getElementById('logbook-view').classList.contains('hidden')) {
        Logbook.renderStudents();
    }
};
