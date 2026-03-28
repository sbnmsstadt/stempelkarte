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
let badges = [];

async function fetchData() {
    try {
        const [sRes, stRes, rRes, bRes] = await Promise.all([
            fetch(`${API_URL}/students`),
            fetch(`${API_URL}/settings`),
            fetch(`${API_URL}/rewards`),
            fetch(`${API_URL}/badges`)
        ]);
        students = sRes.ok ? await sRes.json() : [];
        settings = stRes.ok ? await stRes.json() : {};
        rewards  = rRes.ok ? await rRes.json() : [];
        badges   = bRes.ok ? await bRes.json() : [];

        renderAll();

        const now = new Date();
        document.getElementById('last-updated').textContent =
            `Zuletzt: ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
    } catch (err) {
        console.error('Fetch error:', err);
    }
}

// ── SMOOTH UPDATE HELPER ───────────────────────
// Skips DOM update if content unchanged (keeps scroll running).
// If changed: fade out → update → reset animation → fade in.
async function smoothUpdate(el, newHTML, { animDuration = null, scrolling = false } = {}) {
    if (!el) return;
    const key = newHTML.replace(/\s+/g, '');
    if (el._contentKey === key) return; // no change → don't touch
    el._contentKey = key;

    // Fade out
    el.style.transition = 'opacity 0.35s ease';
    el.style.opacity = '0';
    await new Promise(r => setTimeout(r, 380));

    // Update
    el.innerHTML = newHTML;

    // Reset animation cleanly
    if (scrolling || el.style.animationName || el.classList.contains('scrolling')) {
        el.style.animation = 'none';
        void el.offsetWidth; // force reflow
        el.style.animation = '';
        if (animDuration) el.style.animationDuration = animDuration;
    }

    // Fade in
    el.style.opacity = '1';
}

function renderAll() {
    renderKids();
    renderCountdown();
    renderFilmtag();
    renderProjects();
    renderUpcomingProjects();
    renderTodayPlan();
    renderDailyNotes();
    renderVIPs();
    renderTicker();
    renderStudentOfWeek();
    checkBirthdayMode();
}

// ── STUDENT OF THE WEEK ────────────────────────
function renderStudentOfWeek() {
    const card = document.getElementById('sotw-card');
    const content = document.getElementById('sotw-content');
    if (!card || !content) return;

    const sotw = settings && settings.studentOfWeek;
    if (!sotw || !sotw.studentId) {
        card.style.display = 'none';
        return;
    }

    const student = students.find(s => String(s.id) === String(sotw.studentId));
    if (!student) {
        // Student might not be loaded yet — show with only the name stored in sotw
        card.style.display = 'block';
        content.innerHTML = `
            <div class="sotw-avatar">⭐</div>
            <div class="sotw-info">
                <div class="sotw-name">${sotw.studentId}</div>
                ${sotw.reason ? `<div class="sotw-reason">"${sotw.reason}"</div>` : ''}
            </div>
            <div style="font-size:2.5rem; animation: vipPulse 2s ease-in-out infinite;">⭐</div>
        `;
        return;
    }

    const avatar = student.avatar || student.name.charAt(0).toUpperCase();
    card.style.display = 'block';
    content.innerHTML = `
        <div class="sotw-avatar">${avatar}</div>
        <div class="sotw-info">
            <div class="sotw-name">${student.name.split(' ')[0]}</div>
            ${sotw.reason ? `<div class="sotw-reason">"${sotw.reason}"</div>` : ''}
        </div>
        <div style="font-size:2.5rem; animation: vipPulse 2s ease-in-out infinite;">⭐</div>
    `;
}

// ── BIRTHDAY MODE ──────────────────────────────
let birthdayModeActive = false;
let confettiInterval = null;

function checkBirthdayMode() {
    const today = new Date();
    const todayMD = `${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

    const hasToday = students.some(s => {
        if (!s.birthday) return false;
        const bMD = s.birthday.substring(5); // MM-DD
        return bMD === todayMD;
    });

    const titleEl = document.getElementById('bday-title');
    const iconEl = document.getElementById('bday-icon');

    if (hasToday && !birthdayModeActive) {
        birthdayModeActive = true;
        document.body.classList.add('birthday-mode');
        if (titleEl) titleEl.textContent = '🎂 HEUTE GEBURTSTAG!';
        if (iconEl) iconEl.textContent = '🎂';
        startConfetti();
    } else if (!hasToday && birthdayModeActive) {
        birthdayModeActive = false;
        document.body.classList.remove('birthday-mode');
        if (titleEl) titleEl.textContent = 'GEBURTSTAGE';
        if (iconEl) iconEl.textContent = '🎈';
        stopConfetti();
    }
}

function startConfetti() {
    const colors = ['#ec4899','#f59e0b','#10b981','#8b5cf6','#3b82f6','#ef4444'];
    stopConfetti();
    confettiInterval = setInterval(() => {
        const el = document.createElement('div');
        el.className = 'birthday-confetti';
        el.style.left = Math.random() * 100 + 'vw';
        el.style.background = colors[Math.floor(Math.random() * colors.length)];
        const dur = (Math.random() * 2 + 2).toFixed(1) + 's';
        el.style.animationDuration = dur;
        el.style.width = el.style.height = (Math.random() * 8 + 8) + 'px';
        document.body.appendChild(el);
        setTimeout(() => el.remove(), parseFloat(dur) * 1000 + 100);
    }, 250);
}

function stopConfetti() {
    if (confettiInterval) { clearInterval(confettiInterval); confettiInterval = null; }
}


// ── KIDS: SCROLL BAND ─────────────────────────
function renderKids() {
    const inner = document.getElementById('scroll-band-inner');
    if (!inner || students.length === 0) return;

    const today = new Date();
    today.setHours(0,0,0,0);
    const wDay = today.getDay() || 7;
    const monday = new Date(today);
    monday.setDate(today.getDate() - wDay + 1);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23,59,59,999);

    // Sort by: today first → this week → upcoming birthday order
    const sorted = [...students].sort((a, b) => {
        const getScore = (s) => {
            if (!s.birthday) return Infinity;
            const [,m,d] = s.birthday.split('-').map(Number);
            let bday = new Date(today.getFullYear(), m-1, d);
            if (bday < today) bday = new Date(today.getFullYear()+1, m-1, d);
            const days = Math.round((bday - today) / 86400000);
            return days;
        };
        return getScore(a) - getScore(b);
    });

    const makeCard = (s) => {
        let isToday = false, isThisWeek = false, dateStr = '', daysLabel = '';
        if (s.birthday) {
            const [,m,d] = s.birthday.split('-').map(Number);
            let bday = new Date(today.getFullYear(), m-1, d);
            isToday    = bday.toDateString() === today.toDateString();
            isThisWeek = bday >= monday && bday <= sunday;
            dateStr    = `${String(d).padStart(2,'0')}.${String(m).padStart(2,'0')}.`;
            if (bday < today) bday = new Date(today.getFullYear()+1, m-1, d);
            const days = Math.round((bday - today) / 86400000);
            daysLabel  = isToday ? '🎂 HEUTE!' : `in ${days} Tagen`;
        }
        const cls = isToday ? 'today' : isThisWeek ? 'upcoming' : '';
        const badgePill = isToday
            ? `<div class="kid-card-badge today-badge">🎂 HEUTE!</div>`
            : isThisWeek
                ? `<div class="kid-card-badge" style="background:rgba(236,72,153,0.1);color:#f9a8d4;border:1px solid rgba(236,72,153,0.3);">diese Woche</div>`
                : '';

        // Show assigned badge emojis
        const studentBadgeEmojis = (s.badges || [])
            .map(bid => { const b = badges.find(x => x.id === bid); return b ? b.emoji : ''; })
            .filter(Boolean).join(' ');

        return `
            <div class="kid-card ${cls}">
                <div class="kid-card-avatar">${s.avatar || s.name.charAt(0)}</div>
                <div class="kid-card-info">
                    <div class="kid-card-name">${s.name}${studentBadgeEmojis ? ' <span style="font-size:0.85em;">' + studentBadgeEmojis + '</span>' : ''}</div>
                    <div class="kid-card-date">${dateStr}${dateStr && daysLabel ? ' · ' + daysLabel : daysLabel}</div>
                </div>
                ${badgePill}
            </div>`;
    };

    // Duplicate for seamless infinite scroll
    const html = [...sorted, ...sorted].map(makeCard).join('');
    const duration = `${Math.max(20, sorted.length * 3.5)}s`;
    smoothUpdate(inner, html, { animDuration: duration, scrolling: true });
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
    
    let statusHtml = '';
    if (gr.isApproved) {
        statusHtml = `<span style="color:#10b981; font-size:1.1rem; font-weight:900;">🎉 Juhuuu! Filmtag genehmigt! 🍿</span>`;
    } else if (left <= 0) {
        statusHtml = `<span style="color:#10b981">🎉 Ziel erreicht! Genehmigung ausstehend.</span>`;
    } else {
        statusHtml = `Noch <strong>${left}</strong> Stempel bis zum Ziel 🎯`;
    }
    
    document.getElementById('filmtag-status').innerHTML = statusHtml;
}



// ── PROJECTS ──────────────────────────────────
function renderProjects() {
    const el = document.getElementById('projects-list');
    if (!el) return;
    const txt = settings.currentProjects || "Keine aktuellen Projekte.";
    el.innerHTML = txt;
}

// ── UPCOMING PROJECTS ─────────────────────────
function renderUpcomingProjects() {
    const el = document.getElementById('upcoming-projects-list');
    if (!el) return;
    const txt = settings.upcomingProjects || "Keine kommenden Projekte geplant.";
    el.innerHTML = txt;
}

// ── DAILY NOTES ───────────────────────────────
function renderDailyNotes() {
    const el = document.getElementById('daily-notes-list');
    if (!el) return;
    const txt = settings.dailyNotes || "Keine besonderen Notizen für heute.";
    el.innerHTML = txt;
}

// ── TODAY PLAN ────────────────────────────────
function renderTodayPlan() {
    const el = document.getElementById('today-plan-list');
    if (!el) return;
    const txt = settings.todayPlan || "Noch kein Plan für heute eingetragen.";
    el.innerHTML = txt;
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
                <div class="vip-info-horizontal">
                    <div class="vip-name-big">${s.name}</div>
                    ${dayText ? `<div class="vip-days-big" style="width:fit-content;">${dayText}</div>` : ''}
                </div>
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
                items.push({ 
                    name: s.name.split(' ')[0], 
                    reason: h.reason, 
                    date: h.date,
                    emoji: h.emoji || '▸' 
                });
            }
        });
    });
    // Sort newest first, filter out "Admin-Korrektur", take last 20
    items.sort((a,b) => new Date(b.date) - new Date(a.date));
    const display = items
        .filter(it => it.reason !== "Admin-Korrektur" && !it.reason.toLowerCase().includes("entfernt"))
        .slice(0, 20);

    // Add VIP info
    students.filter(s => s.vip && s.vip.active).forEach(s => {
        display.unshift({ 
            name: s.name.split(' ')[0], 
            reason: '⭐ VIP-Status aktiv', 
            emoji: '👑'
        });
    });

    // Add current badge holders (permanent items)
    students.forEach(s => {
        if (s.badges && s.badges.length > 0) {
            s.badges.forEach(bid => {
                const bDef = badges.find(b => String(b.id) === String(bid));
                if (bDef) {
                    display.push({
                        name: s.name.split(' ')[0],
                        reason: `Abzeichen "${bDef.name}"`,
                        emoji: bDef.emoji
                    });
                }
            });
        }
    });

    if (display.length === 0) {
        display.push({ name: 'NACHMI', reason: '🌟 Noch keine Aktivitäten', emoji: '📢' });
    }

    // Duplicate for seamless loop
    const html = [...display, ...display].map(it => `
        <div class="ticker-item" style="font-size: 1.15em;">
            <span class="t-icon">${it.emoji}</span>
            <span class="t-name">${it.name}</span>
            <span>${it.reason}</span>
        </div>`).join('');

    const duration = `${Math.max(12, display.length * 2.5)}s`;
    smoothUpdate(scroll, html, { animDuration: duration, scrolling: true });
}

// ── INIT ───────────────────────────────────────
createParticles();
updateClock();
setInterval(updateClock, 1000);

fetchData();
setInterval(fetchData, 30000);

// ── FILMTAG LIVE POLL (every 5s) ───────────────
// Only fetches /settings — lightweight, for near-realtime Filmtag updates.
async function fetchFilmtagLive() {
    try {
        const res = await fetch(`${API_URL}/settings`);
        if (!res.ok) return;
        const newSettings = await res.json();

        // Compare groupReward.current to detect change
        const oldCurrent = settings?.groupReward?.current;
        const newCurrent = newSettings?.groupReward?.current;

        if (oldCurrent !== newCurrent) {
            settings = newSettings;
            renderFilmtag(); // only re-render Filmtag bar
        }
    } catch (_) { /* silent fail */ }
}

setInterval(fetchFilmtagLive, 5000);

// Re-layout kids on resize
window.addEventListener('resize', () => {
    if (students.length) renderKids();
});
