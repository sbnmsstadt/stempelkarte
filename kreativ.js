/**
 * Kreativ-Labor Logic for Nachmittagsbetreuung
 */

// Replace with actual production URL if hosted elsewhere, otherwise absolute or relative path
const API_URL = 'https://stempelkarte.sb-nmsstadt.workers.dev';

async function generateIdeas() {
    const topic = document.getElementById('ai-topic').value;
    const ageGroup = document.getElementById('ai-age').value;
    const interests = document.getElementById('ai-interest').value;
    
    if (!topic && !interests) {
        alert("Bitte gib ein Thema ein.");
        return;
    }

    const btn = document.getElementById('gen-btn');
    const originalContent = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span> <span>Generiere...</span>';
    btn.disabled = true;

    try {
        const res = await fetch(`${API_URL}/api/generate-ideas`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topic, ageGroup, interests })
        });

        if (!res.ok) {
            let errText = await res.text();
            throw new Error(`Server Error: ${res.status} - ${errText}`);
        }

        const data = await res.json();
        
        if (data.ideas && data.ideas.length > 0) {
            renderIdeas(data.ideas);
        } else {
            alert("Die KI konnte leider keine Ideen generieren.");
        }
    } catch (e) {
        console.error("Error generating ideas:", e);
        alert("Fehler bei der Anfrage: " + e.message);
    } finally {
        btn.innerHTML = originalContent;
        btn.disabled = false;
    }
}

function renderIdeas(ideas) {
    const container = document.getElementById('ideas-container');
    container.innerHTML = '';

    ideas.forEach((idea, index) => {
        const card = document.createElement('div');
        card.className = 'glass-card idea-card';
        card.style.animationDelay = `${index * 0.15}s`;
        
        // Build card HTML
        card.innerHTML = `
            <div class="idea-tag">${idea.type || 'Kreativprojekt'}</div>
            <h3 class="idea-title">${idea.title}</h3>
            
            <div class="idea-meta">
                <span>⏱️ ${idea.duration || 'ca. 45 Min'}</span>
            </div>
            
            <p class="idea-desc">${idea.description}</p>
            
            <div style="background: rgba(0,0,0,0.2); padding: 10px; border-radius: 8px; margin-bottom: 1.5rem; font-size: 0.85rem; border: 1px solid rgba(255,255,255,0.05);">
                <strong style="color:var(--primary-light);">📦 Material:</strong><br>
                ${idea.materials}
            </div>
            
            <div class="action-row">
                <button class="add-stamp-btn" style="flex:1; background: rgba(255,255,255,0.1);" onclick="copyToClipboard('${idea.description.replace(/'/g, "\\'")}')">Text Kopieren</button>
            </div>
        `;
        
        container.appendChild(card);
    });
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast("Text in die Zwischenablage kopiert!");
    }).catch(err => {
        console.error('Failed to copy!', err);
    });
}

function showToast(msg) {
    document.getElementById('toast-text').innerText = msg;
    document.getElementById('toast').classList.remove('hidden');
}

function closeToast() {
    document.getElementById('toast').classList.add('hidden');
}

// Optional enter key listener on topic
document.getElementById('ai-topic').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        generateIdeas();
    }
});
