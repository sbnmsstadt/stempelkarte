const API_URL = "https://stempelkarte.sb-nmsstadt.workers.dev/api";

let students = [];
let settings = {};
let rewards = [];

// --- Particles ---
function createParticles() {
    const colors = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899'];
    for (let i = 0; i < 18; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        const size = Math.random() * 6 + 3;
        p.style.cssText = `
            width: ${size}px;
            height: ${size}px;
            background: ${colors[Math.floor(Math.random() * colors.length)]};
            left: ${Math.random() * 100}vw;
            animation-duration: ${Math.random() * 20 + 15}s;
            animation-delay: ${Math.random() * 15}s;
        `;
        document.body.appendChild(p);
    }
}

// --- Clock ---
function updateClock() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    document.getElementById('clock').textContent = `${h}:${m}`;
}

// --- Data Fetch ---
async function fetchData() {
    try {
        const [studRes, settRes, rewRes] = await Promise.all([
            fetch(`${API_URL}/students`),
            fetch(`${API_URL}/settings`),
            fetch(`${API_URL}/rewards`)
        ]);
        students = studRes.ok ? await studRes.json() : [];
        settings = settRes.ok ? await settRes.json() : {};
        rewards = rewRes.ok ? await rewRes.json() : [];

        renderAll();

        const now = new Date();
        document.getElementById('last-updated').textContent =
            `Zuletzt aktualisiert: ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
    } catch (err) {
        console.error('Fetch error:', err);
    }
}

function renderAll() {
    renderBirthdays();
    renderVIPs();
    renderFilmtag();
    renderRedemptions();
}

// --- Birthdays ---
function renderBirthdays() {
    const container = document.getElementById('birthday-list');
    if (students.length === 0) {
        container.innerHTML = `<div class="empty-state"><div class="empty-icon">🎂</div><span>Keine Schüler eingetragen</span></div>`;
        return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const day = today.getDay() || 7;
    const monday = new Date(today);
    monday.setDate(today.getDate() - day + 1);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    const items = students.map((s, idx) => {
        let isToday = false;
        let isThisWeek = false;

        if (s.birthday) {
            const [, m, d] = s.birthday.split('-').map(Number);
            const bday = new Date(today.getFullYear(), m - 1, d);
            isToday = bday.toDateString() === today.toDateString();
            isThisWeek = bday >= monday && bday <= sunday;
        }

        // Each kid floats at a slightly different speed & delay for organic feel
        const speed = (3.5 + (idx % 5) * 0.7).toFixed(1);
        const delay = ((idx * 0.4) % 4).toFixed(1);
        const avatarClass = isToday ? 'today' : isThisWeek ? 'upcoming' : '';
        const nameClass = isToday ? 'today' : '';
        const todayTag = isToday ? '<div style="font-size:0.5rem; color:#f472b6; font-weight:900; letter-spacing:0.05em;">🎂 HEUTE</div>' : '';

        return `
            <div class="float-kid" style="animation-duration:${speed}s; animation-delay:-${delay}s;">
                <div class="float-avatar ${avatarClass}">${s.avatar || s.name.charAt(0)}</div>
                ${todayTag}
                <div class="float-name ${nameClass}">${s.name.split(' ')[0]}</div>
            </div>`;
    }).join('');

    container.innerHTML = `<div class="float-grid">${items}</div>`;
}

// --- VIPs ---
function renderVIPs() {
    const container = document.getElementById('vip-list');
    const vipDuration = settings.vipDurationDays || 3;
    const today = new Date();
    today.setHours(0,0,0,0);

    const vips = students.filter(s => s.vip && s.vip.active);

    if (vips.length === 0) {
        container.innerHTML = `<div class="empty-state"><div class="empty-icon">⭐</div><span>Kein aktiver VIP-Status</span></div>`;
        return;
    }

    const items = vips.map((s, i) => {
        let dayText = '';
        if (s.vip.grantedAt) {
            const granted = new Date(s.vip.grantedAt);
            granted.setHours(0,0,0,0);
            const daysDiff = Math.floor((today - granted) / (1000*60*60*24)) + 1;
            const daysLeft = vipDuration - daysDiff + 1;
            dayText = daysLeft <= 1 ? '🔴 Letzter Tag!' : `Tag ${daysDiff} / ${vipDuration}`;
        }
        return `
            <div class="vip-item fade-item" style="animation-delay:${i * 0.1}s">
                <div class="vip-avatar">${s.avatar || s.name.charAt(0)}</div>
                <div class="vip-name">${s.name}</div>
                ${dayText ? `<div class="vip-days">${dayText}</div>` : ''}
            </div>`;
    }).join('');

    container.innerHTML = `<div class="scroll-list-inner">${items}</div>`;
}

// --- Filmtag ---
function renderFilmtag() {
    const gr = settings.groupReward;
    const titleEl = document.getElementById('filmtag-title');
    const currentEl = document.getElementById('filmtag-current');
    const targetEl = document.getElementById('filmtag-target');
    const barEl = document.getElementById('filmtag-bar');
    const statusEl = document.getElementById('filmtag-status');

    if (!gr) {
        statusEl.textContent = 'Kein Gruppen-Ziel aktiv.';
        return;
    }

    titleEl.textContent = `${gr.icon || '🎬'} ${gr.title || 'Filmtag'} Stand`;
    currentEl.textContent = gr.current || 0;
    targetEl.textContent = gr.target || '?';

    const progress = Math.min(100, ((gr.current || 0) / (gr.target || 1)) * 100);
    barEl.style.width = `${progress}%`;

    const remaining = (gr.target || 0) - (gr.current || 0);
    if (remaining <= 0) {
        statusEl.innerHTML = `<span style="color:#10b981; font-size:1.2rem;">🎉 Ziel erreicht! Genehmigung ausstehend.</span>`;
    } else if (gr.active) {
        statusEl.textContent = `Noch ${remaining} Stempel bis zum Ziel 🎯`;
    } else {
        statusEl.textContent = `Spenden-Modus noch nicht aktiv`;
    }
}

// --- Redemptions ---
function renderRedemptions() {
    const container = document.getElementById('redemption-list');
    const pending = [];

    for (const s of students) {
        if (!s.redemptions) continue;
        for (const [threshold, status] of Object.entries(s.redemptions)) {
            if (status === 'pending') {
                const reward = rewards.find(r => r.threshold === parseInt(threshold));
                pending.push({
                    student: s,
                    threshold,
                    rewardName: reward ? `${reward.icon || '🎁'} ${reward.title}` : `Belohnung (${threshold} Stempel)`
                });
            }
        }
    }

    if (pending.length === 0) {
        container.innerHTML = `<div class="empty-state"><div class="empty-icon">✅</div><span>Keine offenen Anfragen</span></div>`;
        return;
    }

    const items = pending.map((p, i) => `
        <div class="redemption-item fade-item" style="animation-delay:${i * 0.08}s">
            <div class="redemption-avatar">${p.student.avatar || p.student.name.charAt(0)}</div>
            <div class="redemption-info">
                <div class="redemption-name">${p.student.name}</div>
                <div class="redemption-reward">${p.rewardName}</div>
            </div>
            <div class="redemption-badge">⏳ Ausstehend</div>
        </div>`).join('');

    container.innerHTML = `<div class="scroll-list-inner">${items}</div>`;
}

// --- Init ---
createParticles();
updateClock();
setInterval(updateClock, 1000);

fetchData();
setInterval(fetchData, 30000);
