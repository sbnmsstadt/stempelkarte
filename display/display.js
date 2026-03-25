const API_URL = "https://stempelkarte.sb-nmsstadt.workers.dev/api";

let students = [];
let settings = {};
let rewards = [];

// ── PARTICLES ──────────────────────────────────
function createParticles() {
    const colors = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ec4899'];
    for (let i = 0; i < 16; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        const size = Math.random() * 5 + 3;
        p.style.cssText = `
            width:${size}px; height:${size}px;
            background:${colors[i % colors.length]};
            left:${Math.random() * 100}vw;
            animation-duration:${Math.random() * 18 + 14}s;
            animation-delay:${Math.random() * 14}s;`;
        document.body.appendChild(p);
    }
}

// ── CLOCK ──────────────────────────────────────
function updateClock() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2,'0');
    const m = String(now.getMinutes()).padStart(2,'0');
    document.getElementById('clock').textContent = `${h}:${m}`;
}

// ── FETCH ──────────────────────────────────────
async function fetchData() {
    try {
        const [sRes, stRes, rRes] = await Promise.all([
            fetch(`${API_URL}/students`),
            fetch(`${API_URL}/settings`),
            fetch(`${API_URL}/rewards`)
        ]);
        students = sRes.ok ? await sRes.json() : [];
        settings = stRes.ok ? await stRes.json() : {};
        rewards  = rRes.ok ? await rRes.json() : [];

        renderAll();

        const now = new Date();
        document.getElementById('last-updated').textContent =
            `Zuletzt: ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
    } catch (err) {
        console.error('Fetch error:', err);
    }
}

function renderAll() {
    renderKids();
    renderCountdown();
    renderFilmtag();
    renderEnergy();
    renderRedemptions();
    renderVIPs();
    renderTicker();
}

// ── KIDS: BOUNCING PHYSICS ─────────────────────
let kidPhysics = [];
let physicsRunning = false;
let physicsRAF = null;

function initKidPhysics() {
    const zone = document.getElementById('bubble-zone');
    if (!zone || students.length === 0) return;

    zone.innerHTML = '';
    // Measure zone
    const W = zone.clientWidth;
    const H = zone.clientHeight;
    const ITEM_W = 76; // approximate rendered width of each kid widget
    const ITEM_H = 96;

    const today = new Date();
    today.setHours(0,0,0,0);
    const wDay = today.getDay() || 7;
    const monday = new Date(today);
    monday.setDate(today.getDate() - wDay + 1);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23,59,59,999);

    kidPhysics = students.map((s, idx) => {
        let isToday = false, isThisWeek = false, dateStr = '';
        if (s.birthday) {
            const [,m,d] = s.birthday.split('-').map(Number);
            const bday = new Date(today.getFullYear(), m-1, d);
            isToday    = bday.toDateString() === today.toDateString();
            isThisWeek = bday >= monday && bday <= sunday;
            dateStr    = `${String(d).padStart(2,'0')}.${String(m).padStart(2,'0')}.`;
        }

        // Create DOM element
        const el = document.createElement('div');
        el.className = 'float-kid';
        el.style.position = 'absolute';
        el.style.animation = 'none'; // disable CSS drift; we control position

        const avatarClass = isToday ? 'today' : isThisWeek ? 'upcoming' : '';
        const nameClass   = isToday ? 'today' : '';
        const bdayClass   = isToday ? 'today' : isThisWeek ? 'upcoming' : '';
        const todayTag    = isToday ? `<div class="today-tag">🎂 HEUTE!</div>` : '';

        el.innerHTML = `
            <div class="float-avatar ${avatarClass}">${s.avatar || s.name.charAt(0)}</div>
            ${todayTag}
            <div class="float-name ${nameClass}">${s.name.split(' ')[0]}</div>
            ${dateStr ? `<div class="float-bday ${bdayClass}">${dateStr}</div>` : ''}`;

        zone.appendChild(el);

        // Random start position spread across screen
        const x = Math.random() * Math.max(1, W - ITEM_W);
        const y = Math.random() * Math.max(1, H - ITEM_H);

        // Speed — slight variation per kid, slow & gentle
        const baseSpeed = 0.4 + Math.random() * 0.5;
        const angle = Math.random() * Math.PI * 2;
        const vx = Math.cos(angle) * baseSpeed;
        const vy = Math.sin(angle) * baseSpeed;

        return { el, x, y, vx, vy, w: ITEM_W, h: ITEM_H };
    });

    // Start physics loop if not already running
    if (!physicsRunning) {
        physicsRunning = true;
        physicsLoop();
    }
}

function physicsLoop() {
    const zone = document.getElementById('bubble-zone');
    if (!zone) { physicsRunning = false; return; }

    const W = zone.clientWidth;
    const H = zone.clientHeight;

    for (const k of kidPhysics) {
        k.x += k.vx;
        k.y += k.vy;

        // Bounce X
        if (k.x <= 0) { k.x = 0; k.vx = Math.abs(k.vx); }
        if (k.x + k.w >= W) { k.x = W - k.w; k.vx = -Math.abs(k.vx); }

        // Bounce Y
        if (k.y <= 0) { k.y = 0; k.vy = Math.abs(k.vy); }
        if (k.y + k.h >= H) { k.y = H - k.h; k.vy = -Math.abs(k.vy); }

        k.el.style.left = `${k.x}px`;
        k.el.style.top  = `${k.y}px`;
    }

    physicsRAF = requestAnimationFrame(physicsLoop);
}

function renderKids() {
    // Cancel old loop and rebuild
    if (physicsRAF) cancelAnimationFrame(physicsRAF);
    physicsRunning = false;
    kidPhysics = [];
    initKidPhysics();
}

// ── COUNTDOWN ──────────────────────────────────
function renderCountdown() {
    const pill = document.getElementById('countdown-text');
    if (!pill) return;

    const today = new Date();
    today.setHours(0,0,0,0);

    const upcoming = students
        .filter(s => s.birthday)
        .map(s => {
            const [,m,d] = s.birthday.split('-').map(Number);
            let bday = new Date(today.getFullYear(), m-1, d);
            if (bday < today) bday = new Date(today.getFullYear()+1, m-1, d);
            const days = Math.round((bday - today) / 86400000);
            return { name: s.name.split(' ')[0], days, isToday: days === 0 };
        })
        .sort((a,b) => a.days - b.days);

    if (upcoming.length === 0) {
        pill.textContent = 'Keine Geburtstage';
        return;
    }

    const next = upcoming[0];
    if (next.isToday) {
        pill.innerHTML = `<strong>${next.name}</strong> hat heute Geburtstag! 🎉`;
    } else {
        pill.innerHTML = `<strong>${next.name}</strong> in <span class="days">${next.days}</span> Tagen`;
    }
}

// ── FILMTAG ────────────────────────────────────
function renderFilmtag() {
    const gr = settings.groupReward;
    if (!gr) {
        document.getElementById('filmtag-status').textContent = 'Kein Gruppen-Ziel aktiv.';
        return;
    }
    document.getElementById('filmtag-title').textContent  = `${gr.icon||'🎬'} ${gr.title||'Filmtag'}`;
    document.getElementById('filmtag-current').textContent = gr.current||0;
    document.getElementById('filmtag-target').textContent  = gr.target||'?';
    const pct = Math.min(100,((gr.current||0)/(gr.target||1))*100);
    document.getElementById('filmtag-bar').style.width = `${pct}%`;
    const left = (gr.target||0)-(gr.current||0);
    document.getElementById('filmtag-status').innerHTML = left <= 0
        ? `<span style="color:#10b981">🎉 Ziel erreicht! Genehmigung ausstehend.</span>`
        : `Noch <strong>${left}</strong> Stempel bis zum Ziel 🎯`;
}

// ── KLASSEN-ENERGIE ────────────────────────────
function renderEnergy() {
    const today = new Date();
    today.setHours(23,59,59,999);
    const wday = today.getDay() || 7;

    // Build 7 day buckets (Mon–today)
    const buckets = Array(7).fill(0);
    const labels  = ['Mo','Di','Mi','Do','Fr','Sa','So'];

    let weekTotal = 0;
    students.forEach(s => {
        (s.history || []).forEach(h => {
            if (!h.date) return;
            const hDate = new Date(h.date);
            const daysAgo = Math.floor((today - hDate) / 86400000);
            if (daysAgo >= 0 && daysAgo < 7) {
                // Which weekday slot?
                const hWday = (hDate.getDay() || 7) - 1; // 0=Mon
                buckets[hWday]++;
                weekTotal++;
            }
        });
    });

    document.getElementById('energy-number').textContent = weekTotal;

    const max = Math.max(...buckets, 1);
    const barsEl = document.getElementById('energy-bars');
    barsEl.innerHTML = buckets.map((v, i) => {
        const h = Math.max(8, Math.round((v / max) * 32));
        const lit = v > 0 ? 'lit' : '';
        return `<div class="energy-bar-seg ${lit}" style="height:${h}px;" title="${labels[i]}: ${v}"></div>`;
    }).join('');
}

// ── REDEMPTIONS ────────────────────────────────
function renderRedemptions() {
    const el = document.getElementById('redemption-list');
    const pending = [];
    students.forEach(s => {
        if (!s.redemptions) return;
        Object.entries(s.redemptions).forEach(([thr, status]) => {
            if (status !== 'pending') return;
            const r = rewards.find(x => x.threshold === parseInt(thr));
            pending.push({
                student: s,
                rewardName: r ? `${r.icon||'🎁'} ${r.title}` : `Belohnung (${thr})`
            });
        });
    });

    if (pending.length === 0) {
        el.innerHTML = `<div class="empty-state"><div class="empty-icon">✅</div><span>Alles erledigt!</span></div>`;
        return;
    }

    el.innerHTML = pending.map((p,i) => `
        <div class="redemption-item fade-in" style="animation-delay:${i*0.07}s">
            <div class="redemption-avatar">${p.student.avatar||p.student.name.charAt(0)}</div>
            <div>
                <div class="redemption-name">${p.student.name}</div>
                <div class="redemption-reward">${p.rewardName}</div>
            </div>
        </div>`).join('');
}

// ── VIP ────────────────────────────────────────
function renderVIPs() {
    const el = document.getElementById('vip-list');
    const vipDuration = settings.vipDurationDays || 3;
    const today = new Date();
    today.setHours(0,0,0,0);

    const vips = students.filter(s => s.vip && s.vip.active);

    if (vips.length === 0) {
        el.innerHTML = `<div class="empty-state"><div class="empty-icon">⭐</div><span>Kein aktiver VIP</span></div>`;
        return;
    }

    el.innerHTML = vips.map(s => {
        let dayText = '';
        if (s.vip.grantedAt) {
            const g = new Date(s.vip.grantedAt);
            g.setHours(0,0,0,0);
            const diff = Math.floor((today - g) / 86400000) + 1;
            const left = vipDuration - diff + 1;
            dayText = left <= 1 ? '🔴 Letzter Tag!' : `Tag ${diff} / ${vipDuration}`;
        }
        return `
            <div class="vip-big fade-in">
                <div class="vip-star">⭐</div>
                <div class="vip-avatar-big">${s.avatar||s.name.charAt(0)}</div>
                <div class="vip-name-big">${s.name}</div>
                ${dayText ? `<div class="vip-days-big">${dayText}</div>` : ''}
            </div>`;
    }).join('');
}

// ── TICKER ─────────────────────────────────────
function renderTicker() {
    const scroll = document.getElementById('ticker-scroll');
    const items = [];

    // All recent history across students (last 48h)
    const cutoff = Date.now() - 48 * 3600 * 1000;
    students.forEach(s => {
        (s.history || []).forEach(h => {
            if (!h.date || !h.reason) return;
            const ts = new Date(h.date).getTime();
            if (ts >= cutoff - 86400000) { // last 2 days loosely
                items.push({ name: s.name.split(' ')[0], reason: h.reason, date: h.date });
            }
        });
    });

    // Sort newest first, take last 20
    items.sort((a,b) => new Date(b.date) - new Date(a.date));
    const display = items.slice(0, 20);

    // Add VIP info
    students.filter(s => s.vip && s.vip.active).forEach(s => {
        display.unshift({ name: s.name.split(' ')[0], reason: '⭐ VIP-Status aktiv', date: s.vip.grantedAt||'' });
    });

    if (display.length === 0) {
        display.push({ name: 'NACHMI', reason: '🌟 Noch keine Aktivitäten', date: '' });
    }

    // Duplicate for seamless loop
    const html = [...display, ...display].map(it => `
        <div class="ticker-item">
            <span class="t-icon">▸</span>
            <span class="t-name">${it.name}</span>
            <span>${it.reason}</span>
        </div>`).join('');

    scroll.innerHTML = html;

    // Adjust animation speed by length
    const duration = Math.max(20, display.length * 4);
    scroll.style.animationDuration = `${duration}s`;
}

// ── INIT ───────────────────────────────────────
createParticles();
updateClock();
setInterval(updateClock, 1000);

fetchData();
setInterval(fetchData, 30000);

// Re-layout kids on resize
window.addEventListener('resize', () => {
    if (students.length) renderKids();
});
