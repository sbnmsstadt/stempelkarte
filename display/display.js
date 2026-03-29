const API_URL = "https://stempelkarte.sb-nmsstadt.workers.dev/api";

let students = [];
let settings = {};
let rewards = [];
let planFlipInterval = null; 
let _celebrationSignaled = false; // Prevents repeated popups
let _lastCelebrationId = null;   // Tracks last seen celebration event
let _isBlinking = false;         // Global blink state for Tamagotchi
let _blinkStarted = false;       // Flag to prevent multiple blink loops

// ── PARTICLES ──────────────────────────────────
function createParticles() {
    const colors = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899'];
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
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
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
        rewards = rRes.ok ? await rRes.json() : [];
        badges = bRes.ok ? await bRes.json() : [];

        renderAll();

        const now = new Date();
        document.getElementById('last-updated').textContent =
            `Zuletzt: ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
        // Start Blinking Cycle for Tamagotchi (Once)
        if (!_blinkStarted) {
            _blinkStarted = true;
            startBlinkingCycle();
        }

    } catch (err) {
        console.error('Fetch error:', err);
    }
}

// ── BLINK LOGIC ────────────────────────────────
function startBlinkingCycle() {
    const blink = () => {
        _isBlinking = true;
        renderTamagotchi();
        setTimeout(() => {
            _isBlinking = false;
            renderTamagotchi();
        }, 200); // 200ms blink duration

        // Schedule next blink (3-7s random)
        setTimeout(blink, 3000 + Math.random() * 4000);
    };
    setTimeout(blink, 2000);
}

// ── SMOOTH UPDATE HELPER ───────────────────────
// Skips DOM update if content unchanged (keeps scroll running).
// If changed: update content, only reset animation if duration changed.
async function smoothUpdate(el, newHTML, { animDuration = null, scrolling = false } = {}) {
    if (!el) return;
    const key = newHTML.replace(/\s+/g, '');
    if (el._contentKey === key) return; // no change → don't touch
    el._contentKey = key;

    if (!scrolling) {
        // Fade out ONLY for static elements
        el.style.transition = 'opacity 0.3s ease';
        el.style.opacity = '0';
        await new Promise(r => setTimeout(r, 320));
    }

    // Update content natively
    el.innerHTML = newHTML;

    if (scrolling) {
        // For scrolling elements: ONLY reset the CSS animation if the duration changed.
        // If only content changed, leave the animation completely untouched so the
        // scroll continues from its current position without any visual jump/reset.
        const oldDur = el.style.animationDuration;
        if (animDuration && oldDur !== animDuration) {
            // Duration changed → need a clean restart
            el.style.animation = 'none';
            void el.offsetWidth; // force reflow
            el.style.animation = '';
            el.style.animationDuration = animDuration;
        } else if (animDuration && !oldDur) {
            // First time: just set the duration, CSS animation name already applies
            el.style.animationDuration = animDuration;
        }
        // If duration unchanged → do nothing, animation keeps running seamlessly
    } else {
        // Reset animation cleanly for static elements
        if (el.style.animationName || el.classList.contains('scrolling')) {
            el.style.animation = 'none';
            void el.offsetWidth;
            el.style.animation = '';
            if (animDuration) el.style.animationDuration = animDuration;
        }
        el.style.opacity = '1';
    }
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
    renderBadgeGalerie();
    renderTamagotchi(); // NEW: Digital Pet logic
    checkBirthdayMode();
    checkCelebrationMode(); // NEW: Check for group milestone celebrations
}

// ── CELEBRATION MODE ───────────────────────────
function checkCelebrationMode() {
    if (!settings || !settings.celebration || !settings.celebration.active) return;
    
    const celebId = settings.celebration.id;
    if (celebId && celebId !== _lastCelebrationId) {
        console.log("New Celebration detected!", celebId);
        showGoalCelebration(settings.celebration.title);
        _lastCelebrationId = celebId;
    }
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

// ── BADGE GALLERY (Motivation) ─────────────────
const MOTIVATIONAL_BADGES = [
    { icon: "🤝", name: "Ehren-Buddy", desc: "Ich helfe anderen ohne Aufforderung!" },
    { icon: "💎", name: "Vibe-Master", desc: "Ich sorge für gute Stimmung!" },
    { icon: "🛡️", name: "Fairness-Wächter", desc: "Ich bin fair und ehrlich!" },
    { icon: "🎨", name: "Pixel-Picasso", desc: "Ich erschaffe kreative Meisterwerke!" },
    { icon: "🚀", name: "Master-Engineer", desc: "Ich baue die krassesten Konstruktionen!" },
    { icon: "🧠", name: "Brainiac", desc: "Ich löse jedes Rätsel blitzschnell!" },
    { icon: "⚡", name: "High-Speed", desc: "Ich erledige Aufgaben besonders effizient!" },
    { icon: "🧘", name: "Zen-Meister", desc: "Ich bleibe auch bei Trubel entspannt!" },
    { icon: "🔥", name: "Goat", desc: "Ich gebe heute alles für die Gruppe!" },
    { icon: "🏅", name: "Abzeichen-Tipp", desc: "Zeig dich positiv und hol dir coole Badges!" }
];
let badgeIndex = 0;

function renderBadgeGalerie() {
    const iconEl = document.getElementById('badge-display-icon');
    const nameEl = document.getElementById('badge-display-name');
    const descEl = document.getElementById('badge-display-desc');
    if (!iconEl || !nameEl || !descEl) return;

    // Use actual badges from DB if available, otherwise fallback to defaults
    const sourceBadges = (badges && badges.length > 0) ? badges : [
        { emoji: "🤝", name: "Ehren-Buddy", desc: "Ich helfe anderen ohne Aufforderung!" },
        { emoji: "💎", name: "Vibe-Master", desc: "Ich sorge für gute Stimmung!" },
        { emoji: "🛡️", name: "Fairness-Wächter", desc: "Ich bin fair und ehrlich!" },
        { emoji: "🎨", name: "Pixel-Picasso", desc: "Ich erschaffe kreative Meisterwerke!" },
        { emoji: "🚀", name: "Master-Engineer", desc: "Ich baue die krassesten Konstruktionen!" },
        { emoji: "🧠", name: "Brainiac", desc: "Ich löse jedes Rätsel blitzschnell!" },
        { icon: "⚡", name: "High-Speed", desc: "Ich erledige Aufgaben besonders effizient!" },
        { icon: "🧘", name: "Zen-Meister", desc: "Ich bleibe auch bei Trubel entspannt!" },
        { icon: "🔥", name: "Goat", desc: "Ich gebe heute alles für die Gruppe!" }
    ];

    // Combine with a static tip item
    const galleryItems = [...sourceBadges, { emoji: "💡", name: "Pro-Tipp", desc: "Hilf anderen und sammle EHRE!" }];

    // Pick next item
    const item = galleryItems[badgeIndex % galleryItems.length];
    badgeIndex++;

    // Smooth update with fade
    const parent = document.getElementById('badge-refresh-area');
    if (parent) {
        parent.style.opacity = '0';
        setTimeout(() => {
            iconEl.textContent = item.emoji || item.icon;
            nameEl.textContent = item.name;
            descEl.textContent = item.description || item.desc || "-";
            parent.style.opacity = '1';
        }, 600);
    }
}

// ── BIRTHDAY MODE ──────────────────────────────
let birthdayModeActive = false;
let birthdayInterval = null;
let goalInterval = null;

function checkBirthdayMode() {
    const today = new Date();
    const todayMD = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

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
        if (titleEl) titleEl.textContent = 'HEUTE GEBURTSTAG!';
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

function startConfetti(isGoal = false) {
    const colors = isGoal ? ['#3b82f6', '#8b5cf6', '#3b82f6', '#8b5cf6', '#ffffff'] : ['#ec4899', '#f59e0b', '#10b981', '#8b5cf6', '#3b82f6', '#ef4444'];
    
    // Stop previous of same type
    if (isGoal) { if (goalInterval) clearInterval(goalInterval); }
    else { if (birthdayInterval) clearInterval(birthdayInterval); }

    const interval = setInterval(() => {
        const el = document.createElement('div');
        el.className = 'birthday-confetti'; // CSS is generic enough
        el.style.left = Math.random() * 100 + 'vw';
        el.style.background = colors[Math.floor(Math.random() * colors.length)];
        const dur = (Math.random() * 2 + 2).toFixed(1) + 's';
        el.style.animationDuration = dur;
        el.style.width = el.style.height = (Math.random() * 8 + 8) + 'px';
        document.body.appendChild(el);
        setTimeout(() => el.remove(), parseFloat(dur) * 1000 + 100);
    }, isGoal ? 150 : 250); // Goal is faster!

    if (isGoal) goalInterval = interval;
    else birthdayInterval = interval;
}

function stopConfetti(isGoal = false) {
    if (isGoal) {
        if (goalInterval) { clearInterval(goalInterval); goalInterval = null; }
    } else {
        if (birthdayInterval) { clearInterval(birthdayInterval); birthdayInterval = null; }
    }
}


// ── KIDS: SCROLL BAND ─────────────────────────
function renderKids() {
    const inner = document.getElementById('scroll-band-inner');
    if (!inner || students.length === 0) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const wDay = today.getDay() || 7;
    const monday = new Date(today);
    monday.setDate(today.getDate() - wDay + 1);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    // Sort by: today first → this week → upcoming birthday order
    const sorted = [...students].sort((a, b) => {
        const getScore = (s) => {
            if (!s.birthday) return Infinity;
            const [, m, d] = s.birthday.split('-').map(Number);
            let bday = new Date(today.getFullYear(), m - 1, d);
            if (bday < today) bday = new Date(today.getFullYear() + 1, m - 1, d);
            return Math.round((bday - today) / 86400000);
        };
        const sA = getScore(a);
        const sB = getScore(b);
        if (sA !== sB) return sA - sB;
        return a.name.localeCompare(b.name);
    });

    const makeCard = (s) => {
        let isToday = false, isThisWeek = false, dateStr = '', daysLabel = '';
        if (s.birthday) {
            const [, m, d] = s.birthday.split('-').map(Number);
            let bday = new Date(today.getFullYear(), m - 1, d);
            isToday = bday.toDateString() === today.toDateString();
            isThisWeek = bday >= monday && bday <= sunday;
            dateStr = `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.`;
            if (bday < today) bday = new Date(today.getFullYear() + 1, m - 1, d);
            const days = Math.round((bday - today) / 86400000);
            daysLabel = isToday ? '🎂 HEUTE!' : `in ${days} Tagen`;
        }
        const cls = isToday ? 'today' : isThisWeek ? 'upcoming' : '';
        const badgePill = isToday
            ? `<div class="kid-card-badge today-badge">HEUTE!</div>`
            : isThisWeek
                ? `<div class="kid-card-badge" style="background:rgba(236,72,153,0.1);color:#f9a8d4;border:1px solid rgba(236,72,153,0.3);">diese Woche</div>`
                : '';

        const studentBadgeEmojis = (s.badges || [])
            .map(bid => { const b = badges.find(x => x.id === bid); return b ? b.emoji : ''; })
            .filter(Boolean).join(' ');

        return `
            <div class="kid-card ${cls}" style="margin-bottom:10px;">
                <div class="kid-card-avatar">${s.avatar || s.name.charAt(0)}</div>
                <div class="kid-card-info">
                    <div class="kid-card-name">${s.name}${studentBadgeEmojis ? ' <span style="font-size:0.85em;">' + studentBadgeEmojis + '</span>' : ''}</div>
                    <div class="kid-card-date">${dateStr}${dateStr && daysLabel ? ' · ' + daysLabel : daysLabel}</div>
                </div>
                ${badgePill}
            </div>`;
    };

    // Ensure we have enough copies to fill the screen for a perfect seamless loop!
    const copiesNeeded = Math.ceil(15 / Math.max(1, sorted.length));
    let halfItems = [];
    for (let i = 0; i < copiesNeeded; i++) halfItems.push(...sorted);

    const halfHtml = halfItems.map(makeCard).join('');
    // html contains EXACTLY two identical DOM halves
    const html = halfHtml + halfHtml;

    // Total duration for one half to scroll
    const duration = `${halfItems.length * 3.5}s`;
    smoothUpdate(inner, html, { animDuration: duration, scrolling: true });
}


// ── COUNTDOWN ──────────────────────────────────
function renderCountdown() {
    const pill = document.getElementById('countdown-text');
    if (!pill) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const upcoming = students
        .filter(s => s.birthday)
        .map(s => {
            const [, m, d] = s.birthday.split('-').map(Number);
            let bday = new Date(today.getFullYear(), m - 1, d);
            if (bday < today) bday = new Date(today.getFullYear() + 1, m - 1, d);
            const days = Math.round((bday - today) / 86400000);
            return { name: s.name.split(' ')[0], days, isToday: days === 0 };
        })
        .sort((a, b) => a.days - b.days);

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
    const centerCol = document.getElementById('center-column');

    // Hide if no reward or progress is 0 (and not yet approved)
    if (!gr || (gr.current === 0 && !gr.isApproved)) {
        if (centerCol) centerCol.classList.add('filmtag-hidden');
        return;
    }

    // Show and update
    if (centerCol) centerCol.classList.remove('filmtag-hidden');

    const titleEl = document.getElementById('filmtag-title');
    const currentEl = document.getElementById('filmtag-current');
    const targetEl = document.getElementById('filmtag-target');
    const barEl = document.getElementById('filmtag-bar');
    const statusEl = document.getElementById('filmtag-status');

    if (titleEl) titleEl.textContent = `${gr.icon || '🎬'} ${gr.title || 'Filmtag'}`;
    if (currentEl) currentEl.textContent = gr.current || 0;
    if (targetEl) targetEl.textContent = gr.target || '?';
    
    const pct = Math.min(100, ((gr.current || 0) / (gr.target || 1)) * 100);
    if (barEl) barEl.style.width = `${pct}%`;
    
    const left = (gr.target || 0) - (gr.current || 0);

    let statusHtml = '';
    if (gr.isApproved) {
        statusHtml = `<span style="color:#10b981; font-size:1.1rem; font-weight:900;">🎉 Juhuuu! Filmtag genehmigt! 🍿</span>`;
    } else if (left <= 0) {
        statusHtml = `<span style="color:#10b981">🎉 Ziel erreicht! Genehmigung ausstehend.</span>`;
    } else {
        statusHtml = `Noch <strong>${left}</strong> Stempel bis zum Ziel 🎯`;
    }

    if (statusEl) statusEl.innerHTML = statusHtml;
}

function showGoalCelebration(title = "Filmtag") {
    const overlay = document.getElementById('celebration-overlay');
    if (!overlay) return;

    const phrases = [
        "ABSOLUTE EHRE! 🏆🎬🍿",
        "MACHER-MODUS AKTIVIERT! 🔥📽️",
        "WIR SIND DIE GOATS! 🐐👑🎞️",
        "LÄUFT BEI UNS! 👟🎞️🍿",
        "KOMPLETT WILD! 🌪️🎬✨",
        "BODENLOS GUT! 📉🎬🍿",
        "SIUUU! DAS ZIEL IST DA! ⚽🎥",
        "WIRKLICH GEHOBEN! 🛰️🎞️🍿",
        "KEINE CAP! LEGENDÄR! 🧢🏆"
    ];
    const randomPhrase = phrases[Math.floor(Math.random() * phrases.length)];

    // Update text
    const textEl = overlay.querySelector('.celebration-text');
    if (textEl) {
        textEl.textContent = `${title.toUpperCase()}: ${randomPhrase}`;
    }

    // Show overlay
    overlay.classList.add('active');
    
    // Intense Confetti (type: Goal)
    startConfetti(true);
    
    // Auto-hide after 20 seconds
    setTimeout(() => {
        overlay.classList.remove('active');
        stopConfetti(true); // Stop only goal confetti
    }, 20000);
}



// ── PROJECTS ──────────────────────────────────
function renderProjects() {
    const el = document.getElementById('projects-list');
    if (!el) return;
    const txt = settings.currentProjects || "Keine aktuellen Projekte.";
    el.innerHTML = formatList(txt);
}

// ── UPCOMING PROJECTS ─────────────────────────
function renderUpcomingProjects() {
    const el = document.getElementById('upcoming-projects-list');
    if (!el) return;
    const txt = settings.upcomingProjects || "Keine kommenden Projekte geplant.";
    el.innerHTML = formatList(txt);
}

// ── DAILY NOTES ───────────────────────────────
function renderDailyNotes() {
    const el = document.getElementById('daily-notes-list');
    if (!el) return;
    const txt = settings.dailyNotes || "Keine besonderen Notizen für heute.";
    el.innerHTML = formatList(txt);
}

// ── TODAY PLAN ────────────────────────────────
function renderTodayPlan() {
    const el = document.getElementById('today-plan-list');
    if (!el) return;

    const txt = settings.todayPlan || "Noch kein Plan für heute eingetragen.";
    el.innerHTML = formatList(txt);
}


// ── VIP ────────────────────────────────────────
function renderVIPs() {
    const el = document.getElementById('vip-list');
    const vipDuration = settings.vipDurationDays || 3;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const vips = students.filter(s => s.vip && s.vip.active);

    if (vips.length === 0) {
        el.innerHTML = `<div class="empty-state"><div class="empty-icon">⭐</div><span>Kein aktiver VIP</span></div>`;
        return;
    }

    el.innerHTML = vips.map(s => {
        let dayText = '';
        if (s.vip.grantedAt) {
            const g = new Date(s.vip.grantedAt);
            g.setHours(0, 0, 0, 0);
            const diff = Math.floor((today - g) / 86400000) + 1;
            const left = vipDuration - diff + 1;
            dayText = left <= 1 ? '🔴 Letzter Tag!' : `Tag ${diff} / ${vipDuration}`;
        }
        return `
            <div class="vip-big fade-in">
                <div class="vip-star">⭐</div>
                <div class="vip-avatar-big">${s.avatar || s.name.charAt(0)}</div>
                <div class="vip-info-horizontal">
                    <div class="vip-name-big">${s.name}</div>
                    ${dayText ? `<div class="vip-days-big" style="width:fit-content;">${dayText}</div>` : ''}
                </div>
            </div>`;
    }).join('');
}

// ── LIST FORMATTER HELPER ──────────────────────
function formatList(txt) {
    if (!txt || typeof txt !== 'string') return txt;
    return txt.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map(line => (line.startsWith('•') || line.startsWith('-') || line.startsWith('*')) ? line : `• ${line}`)
        .join('<br>');
}

// ── TICKER (RAF-based, never resets) ───────────────────────────────
// Pixel position for the ticker scroll — persists across content updates.
let _tickerPos = 0;
let _tickerRAF = null;
let _tickerHash = null;

// Build ticker display items from current data
function buildTickerItems() {
    const items = [];
    const cutoff = Date.now() - 72 * 3600 * 1000; // last 3 days
    students.forEach(s => {
        (s.history || []).forEach(h => {
            if (!h.date || !h.reason) return;
            if (new Date(h.date).getTime() < cutoff) return;
            items.push({
                name: s.name.split(' ')[0],
                reason: h.reason,
                date: h.date,
                emoji: h.emoji || '▸'
            });
        });
    });
    items.sort((a, b) => {
        const d = new Date(b.date) - new Date(a.date);
        return d !== 0 ? d : (a.name + a.reason).localeCompare(b.name + b.reason);
    });

    const display = items
        .filter(it => it.reason !== 'Admin-Korrektur' && !it.reason.toLowerCase().includes('entfernt'))
        .slice(0, 20);

    const stable = [...students].sort((a, b) => a.name.localeCompare(b.name));
    stable.filter(s => s.vip && s.vip.active).forEach(s => {
        display.unshift({ name: s.name.split(' ')[0], reason: '⭐ VIP-Status aktiv', emoji: '👑' });
    });
    stable.forEach(s => {
        if (s.badges && s.badges.length > 0) {
            [...s.badges].sort().forEach(bid => {
                const bDef = badges.find(b => String(b.id) === String(bid));
                if (bDef) display.push({ name: s.name.split(' ')[0], reason: `Abzeichen "${bDef.name}"`, emoji: bDef.emoji });
            });
        }
    });
    if (display.length === 0) display.push({ name: 'NACHMI', reason: '🌟 Noch keine Aktivitäten', emoji: '📢' });
    return display;
}

// Stable hash — only re-render DOM when data actually changed
function getTickerHash() {
    return students.map(s => {
        const hist = (s.history || []).filter(h => h.date && h.reason && h.reason !== 'Admin-Korrektur' && !h.reason.toLowerCase().includes('entfernt')).map(h => `${h.date}|${h.reason}`).join(',');
        return `${s.id}:${hist}:${(s.vip && s.vip.active) ? 1 : 0}:${[...(s.badges || [])].sort().join(',')}`;
    }).join(';');
}

// RAF loop — runs forever, pixel-perfect, no CSS animation involved
function tickerLoop() {
    const scroll = document.getElementById('ticker-scroll');
    if (!scroll) { _tickerRAF = requestAnimationFrame(tickerLoop); return; }

    const halfW = scroll.scrollWidth / 2;
    if (halfW > 0) {
        _tickerPos += 0.7; // px per frame (~42px/s at 60fps)
        if (_tickerPos >= halfW) _tickerPos -= halfW; // seamless modulo wrap
        scroll.style.transform = `translateX(-${_tickerPos}px)`;
    }
    _tickerRAF = requestAnimationFrame(tickerLoop);
}

function renderTicker() {
    const scroll = document.getElementById('ticker-scroll');
    if (!scroll) return;

    // Only rebuild DOM if data actually changed
    const hash = getTickerHash();
    if (hash === _tickerHash) return;
    _tickerHash = hash;

    const display = buildTickerItems();

    // Enough copies so the total width >> viewport width for seamless wrap
    const copies = Math.ceil(20 / Math.max(1, display.length)) + 1;
    const half = [];
    for (let i = 0; i < copies; i++) half.push(...display);

    const halfHtml = half.map(it => `
        <div class="ticker-item" style="font-size:1.15em;">
            <span class="t-icon">${it.emoji}</span>
            <span class="t-name">${it.name}</span>
            <span>${it.reason}</span>
        </div>`).join('');

    // Two identical halves — _tickerPos modulo halfW keeps the loop invisible
    scroll.innerHTML = halfHtml + halfHtml;
    // NOTE: we do NOT touch scroll.style.transform here — the RAF loop handles it
}

// Start the RAF loop once (never stops)
function startTickerLoop() {
    if (_tickerRAF) return;
    _tickerRAF = requestAnimationFrame(tickerLoop);
}

// ── INIT ───────────────────────────────────────
createParticles();
updateClock();
setInterval(updateClock, 1000);

fetchData();
setInterval(fetchData, 5000); // Poll every 5 seconds for responsive Tamagotchi village

// Start the ticker RAF loop immediately (it runs forever)
startTickerLoop();

// ── FILMTAG LIVE POLL (every 5s) ───────────────
async function fetchFilmtagLive() {
    try {
        const res = await fetch(`${API_URL}/settings`);
        if (!res.ok) return;
        const newSettings = await res.json();

        const oldCurrent = settings?.groupReward?.current;
        const newCurrent = newSettings?.groupReward?.current;
        const oldCelebId = settings?.celebration?.id;
        const newCelebId = newSettings?.celebration?.id;

        if (oldCurrent !== newCurrent || oldCelebId !== newCelebId) {
            settings = newSettings;
            renderFilmtag();
            checkCelebrationMode();
        }
    } catch (_) { /* silent fail */ }
}

setInterval(fetchFilmtagLive, 5000);

window.addEventListener('resize', () => {
    if (students.length) renderKids();
});

// ── TAMAGOTCHI: PIXEL ART DATA ─────────────────
const TAMA_SIZE = 24; // 24x24 now (doubled resolution)
const PET_FRAMES = {
    baby: {
        neutral: [
            "........................",
            "........................",
            "....PPPP........PPPP....",
            "...PPPPPP......PPPPPP...",
            "...PPPPPP......PPPPPP...",
            "....PPPP........PPPP....",
            "........................",
            "....BBBBBBBBBBBBBBBB....",
            "...BBBBBBBBBBBBBBBBBB...",
            "..BBBBBBBBBBBBBBBBBBBB..",
            ".BBBBBBBBBBBBBBBBBBBBBB.",
            ".BBBBBBBBBBBBBBBBBBBBBB.",
            ".BBEEEEEEBBBBBBEEEEEEBB.",
            ".BBEEEEEEBBBBBBEEEEEEBB.",
            ".BBEEEEEEBBBBBBEEEEEEBB.",
            ".BBBBBBBBBBBBBBBBBBBBBB.",
            ".BBBBBBBBBBBBBBBBBBBBBB.",
            ".DBBBBBBBBBMMBBBBBBBBBD.",
            ".DBBBBBBBBMMMMBBBBBBBBD.",
            "..DDBBBBBBMMMMBBBBBBDD..",
            "...DDDDDDDDDDDDDDDDDD...",
            "....DDDDDDDDDDDDDDDD....",
            "......BBBB....BBBB......",
            "......BBBB....BBBB......"
        ],
        blink: [
            "........................",
            "........................",
            "....PPPP........PPPP....",
            "...PPPPPP......PPPPPP...",
            "...PPPPPP......PPPPPP...",
            "....PPPP........PPPP....",
            "........................",
            "....BBBBBBBBBBBBBBBB....",
            "...BBBBBBBBBBBBBBBBBB...",
            "..BBBBBBBBBBBBBBBBBBBB..",
            ".BBBBBBBBBBBBBBBBBBBBBB.",
            ".BBBBBBBBBBBBBBBBBBBBBB.",
            ".BBDDDDDDBBBBBBDDDDDDBB.",
            ".BBDDDDDDBBBBBBDDDDDDBB.",
            ".BBDDDDDDBBBBBBDDDDDDBB.",
            ".BBBBBBBBBBBBBBBBBBBBBB.",
            ".BBBBBBBBBBBBBBBBBBBBBB.",
            ".DBBBBBBBBBMMBBBBBBBBBD.",
            ".DBBBBBBBBMMMMBBBBBBBBD.",
            "..DDBBBBBBMMMMBBBBBBDD..",
            "...DDDDDDDDDDDDDDDDDD...",
            "....DDDDDDDDDDDDDDDD....",
            "......BBBB....BBBB......",
            "......BBBB....BBBB......"
        ],
        sad: [
            "........................",
            "........................",
            "....PPPP........PPPP....",
            "...PPPPPP......PPPPPP...",
            "...PPPPPP......PPPPPP...",
            "....PPPP........PPPP....",
            "........................",
            "....BBBBBBBBBBBBBBBB....",
            "...BBBBBBBBBBBBBBBBBB...",
            "..BBBBBBBBBBBBBBBBBBBB..",
            ".BBBBBBBBBBBBBBBBBBBBBB.",
            ".BBBBBBBBBBBBBBBBBBBBBB.",
            ".BBEEEEEEBBBBBBEEEEEEBB.",
            ".BBEEEEEEBBBBBBEEEEEEBB.",
            ".BBEEEEEEBBBBBBEEEEEEBB.",
            ".BBBBBBBBBBBBBBBBBBBBBB.",
            ".BBBBBBBBBBBBBBBBBBBBBB.",
            ".DBBBMMMMMMMMMMMMMMBBBD.",
            ".DBBBMMMMMMMMMMMMMMBBBD.",
            "..DDBBBBMMMMMMMMBBBBBDD..",
            "...DDDDDDDDDDDDDDDDDD...",
            "....DDDDDDDDDDDDDDDD....",
            "......BBBB....BBBB......",
            "......BBBB....BBBB......"
        ],
        sleep: [
            "........................",
            "........................",
            "....PPPP........PPPP....",
            "...PPPPPP......PPPPPP...",
            "...PPPPPP......PPPPPP...",
            "....PPPP........PPPP....",
            "........................",
            "....BBBBBBBBBBBBBBBB....",
            "...BBBBBBBBBBBBBBBBBB...",
            "..BBBBBBBBBBBBBBBBBBBB..",
            ".BBBBBBBBBBBBBBBBBBBBBB.",
            ".BBBBBBBBBBBBBBBBBBBBBB.",
            ".BBDDDDDDBBBBBBDDDDDDBB.",
            ".BBDDDDDDBBBBBBDDDDDDBB.",
            ".BBDDDDDDBBBBBBDDDDDDBB.",
            ".BBBBBBBBBBBBBBBBBBBBBB.",
            ".BBBBBBBBBBBBBBBBBBBBBB.",
            ".DBBBBBBBBBBBBBBBBBBBBD.",
            ".DBBBBBBBBBBBBBBBBBBBBD.",
            "..DDBBBBBBBBBBBBBBBBDD..",
            "...DDDDDDDDDDDDDDDDDD...",
            "....DDDDDDDDDDDDDDDD....",
            "......BBBB....BBBB......",
            "......BBBB....BBBB......"
        ],
        bored: [
            "........................",
            "........................",
            "....PPPP........PPPP....",
            "...PPPPPP......PPPPPP...",
            "...PPPPPP......PPPPPP...",
            "....PPPP........PPPP....",
            "........................",
            "....BBBBBBBBBBBBBBBB....",
            "...BBBBBBBBBBBBBBBBBB...",
            "..BBBBBBBBBBBBBBBBBBBB..",
            ".BBBBBBBBBBBBBBBBBBBBBB.",
            ".BBBBBBBBBBBBBBBBBBBBBB.",
            ".BBEEEEEEBBBBBBEEEEEEBB.",
            ".BBEEEEEEBBBBBBEEEEEEBB.",
            ".BBEEEEEEBBBBBBEEEEEEBB.",
            ".BBBBBBBBBBBBBBBBBBBBBB.",
            ".BBBBBBBBBBBBBBBBBBBBBB.",
            ".DBBBBBBBBBBBBBBBBBBBBD.",
            ".DBBBBBBBMMMMMMBBBBBBDD.",
            "..DDBBBBBMMMMMMBBBBBBDD..",
            "...DDDDDDDDDDDDDDDDDD...",
            "....DDDDDDDDDDDDDDDD....",
            "......BBBB....BBBB......",
            "......BBBB....BBBB......"
        ]
    },
    egg: {
        neutral: [
            "........................",
            "........................",
            "........................",
            "........WWWWWWWW........",
            "......WWWWWWWWWWWW......",
            ".....WWWWWWWWWWWWWW.....",
            "....WWWWWWWWWWWWWWWW....",
            "....WWWWWWWWWWWWWWWW....",
            "....WWWWWWWWWWWWWWWW....",
            "....WWWWWWWWWWWWWWWW....",
            "....WWWWWWWWWWWWWWWW....",
            "....WWWWWWWWWWWWWWWW....",
            "....WWWWWWWWWWWWWWWW....",
            "....WWWWWWWWWWWWWWWW....",
            "....WWWWWWWWWWWWWWWW....",
            "....WWWWWWWWWWWWWWWW....",
            "....WWWWWWWWWWWWWWWW....",
            "....WWWWWWWWWWWWWWWW....",
            ".....WWWWWWWWWWWWWW.....",
            "......WWWWWWWWWWWW......",
            "........WWWWWWWW........",
            "........................",
            "........................",
            "........................"
        ]
    }
};

// ── TAMAGOTCHI INTERACTION HELPERS ────────────────
let _isInteractionActive = false;
let _zzzInterval = null;
let _lastActionTimeSeen = null; // Track fresh interactions village

function spawnZzz() {
    const container = document.getElementById('tama-zzz-container');
    if (!container) return;
    const z = document.createElement('div');
    z.className = 'zzz-particle';
    z.textContent = 'Z';
    // Offset from head
    z.style.left = (Math.random() * 20 + 45) + '%';
    z.style.bottom = '90px';
    container.appendChild(z);
    setTimeout(() => z.remove(), 3000);
}

function triggerPlayAnimation() {
    if (_isInteractionActive) return;
    _isInteractionActive = true;
    
    const itemContainer = document.getElementById('tama-item-container');
    const gridEl = document.getElementById('tama-pixel-grid');
    if (!itemContainer || !gridEl) return;

    // Add Ball
    const items = ['⚽', '🧶', '🎾'];
    const item = document.createElement('div');
    item.className = 'tama-play-item';
    item.textContent = items[Math.floor(Math.random() * items.length)];
    itemContainer.appendChild(item);

    // Start Chase
    gridEl.classList.add('chasing');

    setTimeout(() => {
        item.remove();
        gridEl.classList.remove('chasing');
        _isInteractionActive = false;
    }, 12000); // Play for 12 seconds
}

function triggerLoveAnimation() {
    if (_isInteractionActive) return;
    _isInteractionActive = true;

    const container = document.getElementById('tama-heart-container');
    if (!container) return;

    const spawnHeart = () => {
        const h = document.createElement('div');
        h.className = 'heart-particle';
        h.textContent = '❤️';
        h.style.left = (Math.random() * 40 + 30) + '%';
        h.style.bottom = (Math.random() * 20 + 40) + 'px';
        container.appendChild(h);
        setTimeout(() => h.remove(), 4000);
    };

    // Spawn multiple hearts over time
    let count = 0;
    const interval = setInterval(() => {
        spawnHeart();
        count++;
        if (count >= 12) clearInterval(interval);
    }, 400);

    setTimeout(() => {
        _isInteractionActive = false;
    }, 6000); // Love effect for 6 seconds
}

function renderTamagotchi() {
    const card = document.getElementById('tamagotchi-card');
    const tama = settings.tamagotchi;
    if (!tama || !card) return;

    const gridEl = document.getElementById('tama-pixel-grid');
    const nameEl = document.getElementById('tama-name');
    const statusEl = document.getElementById('tama-status-text');
    const bgImg = document.getElementById('tama-bg-img');

    // Ensure Background
    if (bgImg && !bgImg.src.includes('assets/')) {
        bgImg.src = 'assets/tama_bg.png';
        bgImg.onerror = () => { bgImg.style.display = 'none'; };
    }

    // 1. Initialize Grid if empty
    if (gridEl && gridEl.children.length === 0) {
        for (let i = 0; i < TAMA_SIZE * TAMA_SIZE; i++) {
            const px = document.createElement('div');
            px.className = 'pixel px-transparent';
            gridEl.appendChild(px);
        }
    }

    // 2. Determine Frame
    let stage = tama.stage || "baby";
    if (tama.status === "egg") stage = "egg";
    
    let mood = "neutral";
    if (tama.status === "hatched") {
        if (tama.isSleeping) mood = "sleep";
        else if (tama.stats.hunger < 30 || tama.stats.thirst < 30 || tama.stats.love < 30) mood = "sad";
        else if (tama.stats.fun < 30) mood = "bored";
        else if (_isBlinking) mood = "blink";
    }

    const frame = (PET_FRAMES[stage] && PET_FRAMES[stage][mood]) || PET_FRAMES.baby.neutral;

    // 3. Render Frame to Grid
    if (gridEl) {
        const pixels = gridEl.children;
        for (let r = 0; r < TAMA_SIZE; r++) {
            for (let c = 0; c < TAMA_SIZE; c++) {
                const char = frame[r][c];
                const idx = r * TAMA_SIZE + c;
                let cls = "px-transparent";
                if (char === 'B') cls = "px-body";
                if (char === 'D') cls = "px-body-dark";
                if (char === 'E') cls = "px-eye";
                if (char === 'M') cls = "px-mouth";
                if (char === 'W') cls = "px-white";
                if (char === 'R') cls = "px-red";
                if (char === 'P') cls = "px-pink";
                if (char === 'N') cls = "px-white"; // Nose/Mouth detail
                
                const targetCls = `pixel ${cls}`;
                if (pixels[idx] && pixels[idx].className !== targetCls) {
                    pixels[idx].className = targetCls;
                }
            }
        }
    }

    // 4. Update UI Text & Bars
    if (tama.status === "egg") {
        card.style.display = 'block';
        if (nameEl) nameEl.textContent = "MYSTERY EGG";
        if (statusEl) statusEl.textContent = "WACKELT...";
        gridEl.style.animation = 'tamaEggWiggle 3s ease-in-out infinite';
    } else {
        card.style.display = 'block';
        
        // Interaction logic moved to change detector below for better reliability


        // Handle Sleep (No float, Zzz)
        if (tama.isSleeping) {
            gridEl.classList.add('no-float');
            if (!_zzzInterval) {
                _zzzInterval = setInterval(spawnZzz, 2000);
            }
        } else {
            gridEl.classList.remove('no-float');
            if (_zzzInterval) {
                clearInterval(_zzzInterval);
                _zzzInterval = null;
            }
        }

        if (!gridEl.classList.contains('no-float') && !gridEl.classList.contains('chasing')) {
            gridEl.style.animation = 'pixelFloat 3.5s ease-in-out infinite, pixelGlow 2s ease-in-out infinite';
        } else if (gridEl.classList.contains('no-float')) {
            gridEl.style.animation = 'pixelGlow 2s ease-in-out infinite';
        }

        const hungerEl = document.getElementById('tama-hunger');
        const thirstEl = document.getElementById('tama-thirst');
        const loveEl = document.getElementById('tama-love');
        const funEl = document.getElementById('tama-fun');
        const hungerVal = document.getElementById('tama-hunger-val');
        const thirstVal = document.getElementById('tama-thirst-val');
        const loveVal = document.getElementById('tama-love-val');
        const funVal = document.getElementById('tama-fun-val');

        const stats = tama.stats || { hunger: 50, thirst: 50, love: 50, fun: 50 };

        if (hungerEl) hungerEl.style.width = `${stats.hunger}%`;
        if (thirstEl) thirstEl.style.width = `${stats.thirst}%`;
        if (loveEl) loveEl.style.width = `${stats.love}%`;
        if (funEl) funEl.style.width = `${stats.fun || 0}%`;

        if (hungerVal) hungerVal.textContent = `${stats.hunger}%`;
        if (thirstVal) thirstVal.textContent = `${stats.thirst}%`;
        if (loveVal) loveVal.textContent = `${stats.love}%`;
        if (funVal) funVal.textContent = `${stats.fun || 0}%`;

        let statusText = "Glücklich ✨";
        if (tama.isSleeping) statusText = "Schläft... 💤";
        else if (stats.hunger < 30) statusText = "Hungrig! 🍏";
        else if (stats.thirst < 30) statusText = "Durstig! 💧";
        else if (stats.fun < 30) statusText = "Langweilig... 🥱";
        else if (stats.love < 50) statusText = "Braucht Liebe ❤️";
        const now = Date.now();
        const actionTime = tama.lastActionTime ? new Date(tama.lastActionTime).getTime() : 0;
        const lastUpdate = tama.lastUpdate ? new Date(tama.lastUpdate).getTime() : now;
        const referenceTime = Math.max(actionTime, lastUpdate);
        const inactiveSeconds = (now - referenceTime) / 1000;

        // Fresh action detected? Hop back and trigger animation!
        if (tama.lastActionTime && tama.lastActionTime !== _lastActionTimeSeen) {
            _lastActionTimeSeen = tama.lastActionTime;
            
            // 1. Hop back if away
            if (gridEl.classList.contains('walking-away')) {
                gridEl.classList.remove('walking-away');
                gridEl.classList.add('hopping-back');
                setTimeout(() => gridEl.classList.remove('hopping-back'), 1200);
            }

            // 2. Trigger Specific Animation
            if (tama.lastAction === 'play') {
                triggerPlayAnimation();
            } else if (tama.lastAction === 'love') {
                triggerLoveAnimation();
            }
        }

        // Walk away after 60s of silence
        if (inactiveSeconds > 60 && !tama.isSleeping && !gridEl.classList.contains('chasing') && !gridEl.classList.contains('hopping-back')) {
            gridEl.classList.add('walking-away');
        } else if (inactiveSeconds < 15) {
            // Ensure we are not stuck "far away" if an action happened
            gridEl.classList.remove('walking-away');
        }
        
        if (statusEl) statusEl.textContent = statusText;
    }
}



