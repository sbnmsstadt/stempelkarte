export default {
    async fetch(request, env) {
        // ── WEATHER SYNC HELPER (Hallein: 47.68, 13.17) ──────────────────
        // ── STORAGE HELPERS (Migrating from KV to D1) ─────────────────
        async function getKV(key) {
            // Try D1 first
            const res = await env.DB.prepare("SELECT value FROM kv_data WHERE id = ?").bind(key).first("value");
            if (res) return res;
            
            // Fallback to KV for migration (if it exists and is not 429'd for reads)
            if (env.DATABASE) {
                try {
                    return await env.DATABASE.get(key);
                } catch (e) { console.error("KV read failed:", e); }
            }
            return null;
        }

        async function putKV(key, value) {
            await env.DB.prepare("INSERT OR REPLACE INTO kv_data (id, value) VALUES (?, ?)").bind(key, value).run();
        }

        // ── TAMAGOTCHI DECAY HELPER ──────────────────────────────────
        function applyTamagotchiDecay(settings, now) {
            if (!settings.tamagotchi || settings.tamagotchi.status !== "hatched") return false;

            const last = settings.tamagotchi.lastUpdate || now;
            const ignoreFreeze = settings.tamagotchi.ignoreWeekendFreeze || false;
            const activeHours = calculateActiveHours(last, now, ignoreFreeze);

            if (activeHours > 0) {
                // Base decay: 20% per 30 mins = 40% per hour
                const baseDecay = activeHours * 40;
                
                // Poop penalty: each poop increases LOVE decay by 50%
                const poopCount = settings.tamagotchi.poopCount || 0;
                const lovePenaltyFactor = 1 + (poopCount * 0.5);
                const loveDecay = baseDecay * lovePenaltyFactor;

                settings.tamagotchi.stats.hunger = Math.max(0, settings.tamagotchi.stats.hunger - baseDecay);
                settings.tamagotchi.stats.thirst = Math.max(0, settings.tamagotchi.stats.thirst - baseDecay);
                settings.tamagotchi.stats.love = Math.max(0, settings.tamagotchi.stats.love - loveDecay);
                settings.tamagotchi.stats.fun = Math.max(0, (settings.tamagotchi.stats.fun || 100) - baseDecay);
                
                // Hygiene: decay faster if brushing is needed
                const hygieneDecay = settings.tamagotchi.needsBrushing ? (baseDecay * 1.5) : (baseDecay * 0.5);
                settings.tamagotchi.stats.hygiene = Math.max(0, (settings.tamagotchi.stats.hygiene || 100) - hygieneDecay);

                // --- Death Logic: If hunger AND thirst reach 0, pet dies ---
                if (settings.tamagotchi.stats.hunger <= 0 && settings.tamagotchi.stats.thirst <= 0) {
                    settings.tamagotchi.status = "dead";
                }

                // --- Sugar Crash Logic (Donut effect) ---
                if (settings.tamagotchi.sugarCrashTime && now > settings.tamagotchi.sugarCrashTime) {
                    settings.tamagotchi.stats.hunger = Math.max(0, settings.tamagotchi.stats.hunger - 30);
                    settings.tamagotchi.stats.fun = Math.max(0, settings.tamagotchi.stats.fun - 30);
                    settings.tamagotchi.sugarCrashTime = null; // Reset crash
                }

                // Auto-Sleep if Fun is critically low
                if (settings.tamagotchi.stats.fun < 15 && !settings.tamagotchi.isSleeping) {
                    // Check if an interaction just happened (within last 10 seconds)
                    const lastAction = settings.tamagotchi.lastActionTime ? new Date(settings.tamagotchi.lastActionTime).getTime() : 0;
                    if (Date.now() - lastAction > 10000) {
                        settings.tamagotchi.isSleeping = true;
                    }
                }

                // Poop & Trash Chance: 250% per active hour (avg 2.5 events/hour)
                if (Math.random() < 2.5 * activeHours) {
                    const type = Math.random();
                    if (type < 0.7) { // 70% Poop, 30% Trash
                        settings.tamagotchi.poopCount = Math.min(20, (settings.tamagotchi.poopCount || 0) + 1);
                    } else {
                        settings.tamagotchi.trashCount = Math.min(20, (settings.tamagotchi.trashCount || 0) + 1);
                    }
                }

                // --- Hat Expiration ---
                if (settings.tamagotchi.currentHat && settings.tamagotchi.hatExpires) {
                    if (now > settings.tamagotchi.hatExpires) {
                        settings.tamagotchi.currentHat = null;
                        settings.tamagotchi.hatExpires = null;
                    }
                }

                settings.tamagotchi.lastUpdate = now;
                return true; // Something changed
            }
            return false;
        }

        async function updateWeather(settings, env) {
            const now = Date.now();
            const lastSync = settings.weather?.lastSync || 0;
            if (now - lastSync < 30 * 60 * 1000) return settings.weather;

            try {
                const resp = await fetch("https://api.open-meteo.com/v1/forecast?latitude=47.68&longitude=13.17&current=weather_code,temperature_2m");
                if (resp.ok) {
                    const data = await resp.json();
                    settings.weather = {
                        code: data.current.weather_code,
                        temp: data.current.temperature_2m,
                        lastSync: now
                    };
                    await putKV("settings", JSON.stringify(settings));
                }
            } catch (e) { console.error("Weather fetch failed", e); }
            return settings.weather;
        }

        const url = new URL(request.url);
        const path = url.pathname.replace(/\/$/, ""); 
        const method = request.method;

        const corsHeaders = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        };

        if (method === "OPTIONS") {
            return new Response(null, { headers: corsHeaders });
        }

        if (!env.DB) {
            return new Response("D1 Datenbank-Bindung 'DB' fehlt. Bitte im Dashboard nachholen!", {
                status: 500,
                headers: corsHeaders
            });
        }

        try {
            const DEFAULT_REWARDS = [
                    { threshold: 8, title: "Eis essen", icon: "🍦", desc: "Ein Eis deiner Wahl", active: true },
                    { threshold: 24, title: "Kino Nachmittag", icon: "🎬", desc: "Film schauen mit Popcorn", active: true },
                    { threshold: 40, title: "Große Überraschung", icon: "🎁", desc: "Etwas ganz Besonderes", active: true },
                    { threshold: 60, title: "3 Volle Karten Bonus", icon: "🏆", desc: "Spezial-Belohnung für 3 volle Karten!", active: true },
                    { threshold: 40, icon: "🎮", title: "Level 2: Extra-Spielzeit", desc: "15 Min an der Konsole/Spiel." },
                    { threshold: 60, icon: "👑", title: "Level 3: VIP Woche", desc: "Entscheide über die Spiele!" }
                ];

            // ── MIGRATION ENDPOINT ───────────────────────────────────────
            if (path === "/api/migrate-kv-to-d1" && method === "GET") {
                if (!env.DATABASE) return new Response("KV nicht gefunden", { status: 404, headers: corsHeaders });
                const keys = ["settings", "students", "rewards", "projects", "badges"];
                let count = 0;
                for (const k of keys) {
                    const val = await env.DATABASE.get(k);
                    if (val) {
                        await putKV(k, val);
                        count++;
                    }
                }
                return new Response(`Migration abgeschlossen! ${count} Keys von KV nach D1 kopiert. 🎉`, { headers: corsHeaders });
            }

            // DEBUG: Test Telegram
            if (path === "/api/debug/test-telegram") {
                const success = await sendTelegramMessage(env, "Test-Nachricht vom Stempelkarten-System! ✅\n\nDein Bot ist richtig konfiguriert.");
                return new Response(JSON.stringify({ success, message: success ? "Test gesendet!" : "Fehler beim Senden. Prüfe deine Secrets!" }), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }

            if (path === "/api/settings" && method === "GET") {
                const settingsRaw = await getKV("settings");
                const defaultActivities = [
                    { label: "Sport-AG", emoji: "🏀" },
                    { label: "Hausaufgaben", emoji: "📝" },
                    { label: "Hilfe", emoji: "🤝" },
                    { label: "Lesen", emoji: "📚" },
                    { label: "Kreativ", emoji: "🎨" },
                    { label: "Spielen", emoji: "🎲" },
                    { label: "Projekt", emoji: "🚀" },
                    { label: "Sonstiges", emoji: "✨" }
                ];
                
                let settings = settingsRaw ? JSON.parse(settingsRaw) : { 
                    communityTarget: 500, 
                    communityTitle: "Pizza-Party",
                    communityGoalVisible: true,
                    activities: defaultActivities,
                    groupReward: { title: "Filmtag", target: 8, current: 0, icon: "🎬", active: false },
                    dailyNotes: "",
                    currentProjects: "",
                    upcomingProjects: "",
                    todayPlan: "",
                    studentOfWeek: null
                };

                await updateWeather(settings, env);

                if (!settings.tamagotchi) {
                    settings.tamagotchi = {
                        status: "egg",
                        name: "Pixelino",
                        hatchDate: null,
                        lastUpdate: Date.now(),
                        stats: { hunger: 100, thirst: 100, love: 100, fun: 100, hygiene: 100 },
                        stage: "egg",
                        poopCount: 0,
                        trashCount: 0,
                        needsBrushing: false,
                        isSleeping: false,
                        visible: true,
                        lastAction: null,
                        lastActionTime: null
                    };
                }

                // IMPORTANT: If decay happened (stats changed or poop generated), SAVE to DB!
                // This prevents "flickering" or items disappearing between polls.
                if (applyTamagotchiDecay(settings, Date.now())) {
                    await putKV("settings", JSON.stringify(settings));
                }
                
                return new Response(JSON.stringify(settings), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }

            if (path === "/api/settings" && method === "PUT") {
                const settings = await request.json();
                await putKV("settings", JSON.stringify(settings));
                return new Response(JSON.stringify(settings), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }

            if (path === "/api/settings/group-approve" && method === "POST") {
                const settingsRaw = await getKV("settings");
                let settings = JSON.parse(settingsRaw || "{}");
                
                if (settings.groupReward) {
                    settings.groupReward.isApproved = true;
                    settings.groupReward.active = false; // Hide donation button after final approval
                    
                    // Trigger Celebration
                    settings.celebration = {
                        id: Date.now(),
                        title: settings.groupReward.title || "Filmtag",
                        active: true
                    };

                    await putKV("settings", JSON.stringify(settings));
                }

                // Update all donors (Milestone achieved!)
                const studentsRaw = await getKV("students");
                let students = JSON.parse(studentsRaw || "[]");
                const today = new Date().toISOString().split('T')[0];
                let changed = false;

                students.forEach(s => {
                    if (s.contributedToCurrent) {
                        if (!s.history) s.history = [];
                        s.history.push({ date: today, reason: `${settings.groupReward?.title || 'Filmtag'} genehmigt ✅` });
                        s.contributedToCurrent = false;
                        changed = true;
                    }
                });

                if (changed) {
                    await putKV("students", JSON.stringify(students));
                }

                return new Response(JSON.stringify({ settings }), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }

            if (path === "/api/settings/group-reset" && method === "POST") {
                const settingsRaw = await getKV("settings");
                let settings = JSON.parse(settingsRaw || "{}");
                
                if (settings.groupReward) {
                    settings.groupReward.current = 0;
                    settings.groupReward.isApproved = false;
                    settings.groupReward.active = false; // Zurücksetzen auf inaktiv nach Reset
                    
                    // Celebration deaktivieren
                    if (settings.celebration) {
                        settings.celebration.active = false;
                    }
                    
                    await putKV("settings", JSON.stringify(settings));
                }
                
                return new Response(JSON.stringify({ settings }), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }

            if (path === "/api/rewards" && method === "GET") {
                const rewardsRaw = await getKV("rewards");
                const rewards = rewardsRaw ? JSON.parse(rewardsRaw) : DEFAULT_REWARDS;
                return new Response(JSON.stringify(rewards), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }

            if (path === "/api/rewards" && method === "PUT") {
                const rewards = await request.json();
                // Sort by threshold automatically
                rewards.sort((a, b) => a.threshold - b.threshold);
                await putKV("rewards", JSON.stringify(rewards));
                return new Response(JSON.stringify(rewards), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }

            // --- Projects (Content Calendar) ---
            if (path === "/api/projects" && method === "GET") {
                const projectsRaw = await getKV("projects");
                const projects = projectsRaw ? JSON.parse(projectsRaw) : [];
                return new Response(JSON.stringify(projects), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }

            if (path === "/api/projects" && method === "POST") {
                const body = await request.json();
                const projectsRaw = await getKV("projects");
                let projects = projectsRaw ? JSON.parse(projectsRaw) : [];
                
                const newProject = {
                    id: Date.now().toString(),
                    title: body.title || "Ohne Titel",
                    description: body.description || "",
                    materials: body.materials || "",
                    planText: body.planText || "",
                    status: "library",
                    createdAt: new Date().toISOString()
                };
                
                projects.push(newProject);
                
                await putKV("projects", JSON.stringify(projects));
                return new Response(JSON.stringify(newProject), {
                    status: 201,
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }

            if (path.startsWith("/api/projects/") && method === "PUT") {
                const parts = path.split("/").filter(Boolean);
                const id = parts[parts.length - 1];
                const updateData = await request.json();
                const projectsRaw = await getKV("projects");
                let projects = JSON.parse(projectsRaw || "[]");

                const idx = projects.findIndex(p => String(p.id) === String(id));
                if (idx !== -1) {
                    projects[idx] = { ...projects[idx], ...updateData };
                    await putKV("projects", JSON.stringify(projects));
                    return new Response(JSON.stringify(projects[idx]), {
                        headers: { ...corsHeaders, "Content-Type": "application/json" }
                    });
                }
                return new Response("Not Found", { status: 404, headers: corsHeaders });
            }

            if (path.startsWith("/api/projects/") && method === "DELETE") {
                const parts = path.split("/").filter(Boolean);
                const id = parts[parts.length - 1];
                const projectsRaw = await getKV("projects");
                let projects = JSON.parse(projectsRaw || "[]");

                projects = projects.filter(p => String(p.id) !== String(id));
                await putKV("projects", JSON.stringify(projects));
                return new Response(null, { status: 204, headers: corsHeaders });
            }

            // --- Badges ---
            if (path === "/api/badges" && method === "GET") {
                const badgesRaw = await getKV("badges");
                const badges = badgesRaw ? JSON.parse(badgesRaw) : [];
                return new Response(JSON.stringify(badges), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }

            if (path === "/api/badges" && method === "POST") {
                const body = await request.json();
                const badgesRaw = await getKV("badges");
                let badges = badgesRaw ? JSON.parse(badgesRaw) : [];
                const newBadge = {
                    id: Date.now().toString(),
                    emoji: body.emoji || "🏅",
                    name: body.name || "Abzeichen",
                    description: body.description || "",
                    color: body.color || "#f59e0b"
                };
                badges.push(newBadge);
                await putKV("badges", JSON.stringify(badges));
                return new Response(JSON.stringify(newBadge), {
                    status: 201,
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }

            if (path.startsWith("/api/badges/") && method === "DELETE") {
                const parts = path.split("/").filter(Boolean);
                const id = parts[parts.length - 1];
                const badgesRaw = await getKV("badges");
                let badges = JSON.parse(badgesRaw || "[]");
                badges = badges.filter(b => String(b.id) !== String(id));
                await putKV("badges", JSON.stringify(badges));
                return new Response(null, { status: 204, headers: corsHeaders });
            }

            // PUT /api/students/:id/badges — assign/remove badges on a student
            if (path.match(/^\/api\/students\/[^/]+\/badges$/) && method === "PUT") {
                const parts = path.split("/").filter(Boolean);
                const studentId = parts[2]; // ["api","students","luk","badges"] → index 2
                const { badges } = await request.json(); // array of badge IDs
                const studentsRaw = await getKV("students");
                let students = JSON.parse(studentsRaw || "[]");
                const idx = students.findIndex(s => String(s.id) === String(studentId));
                if (idx === -1) return new Response("Not Found", { status: 404, headers: corsHeaders });

                const prevBadges = students[idx].badges || [];
                const currentBadges = badges || [];
                const newlyAdded = currentBadges.filter(id => !prevBadges.includes(id));
                const newlyRemoved = prevBadges.filter(id => !currentBadges.includes(id));

                const badgesRaw = await getKV("badges");
                const allBadges = JSON.parse(badgesRaw || "[]");
                const today = new Date().toISOString().split("T")[0];

                if (!students[idx].history) students[idx].history = [];

                // Handle additions
                if (newlyAdded.length > 0) {
                    newlyAdded.forEach(badgeId => {
                        const badgeDef = allBadges.find(b => String(b.id) === String(badgeId));
                        const label = badgeDef ? `${badgeDef.emoji} Abzeichen "${badgeDef.name}" erhalten!` : "🏅 Abzeichen erhalten!";
                        students[idx].history.push({ date: today, reason: label, emoji: badgeDef?.emoji || "🏅" });
                    });
                }

                // Handle removals
                if (newlyRemoved.length > 0) {
                    newlyRemoved.forEach(badgeId => {
                        const badgeDef = allBadges.find(b => String(b.id) === String(badgeId));
                        if (badgeDef) {
                            const labelDetail = `Abzeichen "${badgeDef.name}" erhalten!`;
                            students[idx].history = students[idx].history.filter(h => !h.reason.includes(labelDetail));
                        }
                    });
                }

                students[idx].badges = currentBadges;
                await putKV("students", JSON.stringify(students));
                return new Response(JSON.stringify(students[idx]), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }

            if (path === "/api/students" && method === "GET") {
                const studentsRaw = await getKV("students");
                const students = studentsRaw ? JSON.parse(studentsRaw) : [];
                return new Response(JSON.stringify(students), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }

            if (path.startsWith("/api/students/") && method === "GET") {
                const parts = path.split("/").filter(Boolean);
                const id = parts[parts.length - 1];
                const studentsRaw = await getKV("students");
                const students = JSON.parse(studentsRaw || "[]");
                const student = students.find(s => String(s.id) === String(id));

                if (!student) return new Response("Not Found", { status: 404, headers: corsHeaders });
                return new Response(JSON.stringify(student), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }

            if (path === "/api/students" && method === "POST") {
                const { name, birthday, attendance, pickupTime } = await request.json();
                const studentsRaw = await getKV("students");
                let students = studentsRaw ? JSON.parse(studentsRaw) : [];

                // Generate 3-letter ID from name
                let baseId = name.toLowerCase().replace(/[^a-z]/g, '').substring(0, 3);
                if (baseId.length < 3) baseId = name.toLowerCase().substring(0, 3);

                // Ensure uniqueness (add number if needed)
                let finalId = baseId;
                let counter = 1;
                while (students.some(s => s.id === finalId)) {
                    finalId = baseId + counter;
                    counter++;
                }

                const newStudent = { 
                    id: finalId, 
                    name: name, 
                    stamps: 0, 
                    usedStamps: 0, 
                    birthday: birthday || null, 
                    avatar: null,
                    badges: [],
                    history: [],
                    redemptions: {},
                    attendance: attendance || { mon: false, tue: false, wed: false, thu: false, fri: false },
                    pickupTime: pickupTime || "15:30"
                };
                students.push(newStudent);
                await putKV("students", JSON.stringify(students));

                return new Response(JSON.stringify(newStudent), {
                    status: 201,
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }

            if (path.startsWith("/api/students/") && method === "PATCH") {
                const pathParts = path.split("/");

                // Handle normal student patch
                if (pathParts.length === 4) {
                    const id = pathParts[3];
                    const body = await request.json();
                    const { stamps, avatar, badges, reason, attendance, pickupTime } = body;
                    const studentsRaw = await getKV("students");
                    let students = JSON.parse(studentsRaw || "[]");

                    const index = students.findIndex(s => String(s.id) === String(id));
                    if (index === -1) return new Response("Not Found", { status: 404, headers: corsHeaders });

                    // Migration / Initialization
                    if (students[index].avatar === undefined) students[index].avatar = null;
                    if (students[index].badges === undefined) students[index].badges = [];
                    if (students[index].history === undefined) students[index].history = [];
                    if (students[index].attendance === undefined) {
                        students[index].attendance = { mon: false, tue: false, wed: false, thu: false, fri: false };
                    }
                    if (students[index].pickupTime === undefined) {
                        students[index].pickupTime = "15:30";
                    }

                    if (stamps !== undefined) {
                        // If stamps increased, track history
                        if (stamps > students[index].stamps) {
                            const today = new Date().toISOString().split('T')[0];
                            students[index].history.push({ 
                                date: today, 
                                reason: reason || "Stempel" 
                            });
                        }
                        students[index].stamps = stamps;
                    }
                    if (avatar !== undefined) students[index].avatar = avatar;
                    if (pickupTime !== undefined) students[index].pickupTime = pickupTime;
                    if (attendance !== undefined) {
                        students[index].attendance = { 
                            ...students[index].attendance, 
                            ...attendance 
                        };
                    }
                    if (badges !== undefined) {
                        const prevB = students[index].badges || [];
                        const currentB = badges || [];
                        const added = currentB.filter(id => !prevB.includes(id));
                        const removed = prevB.filter(id => !currentB.includes(id));

                        if (added.length > 0 || removed.length > 0) {
                            const badgesRaw = await getKV("badges");
                            const allBadges = JSON.parse(badgesRaw || "[]");
                            const today = new Date().toISOString().split("T")[0];

                            if (added.length > 0) {
                                added.forEach(bid => {
                                    const bDef = allBadges.find(b => String(b.id) === String(bid));
                                    const label = bDef ? `${bDef.emoji} Abzeichen "${bDef.name}" erhalten!` : "🏅 Abzeichen erhalten!";
                                    students[index].history.push({ date: today, reason: label, emoji: bDef?.emoji || "🏅" });
                                });
                            }
                            if (removed.length > 0) {
                                removed.forEach(bid => {
                                    const bDef = allBadges.find(b => String(b.id) === String(bid));
                                    if (bDef) {
                                        const pattern = `Abzeichen "${bDef.name}" erhalten!`;
                                        students[index].history = students[index].history.filter(h => !h.reason.includes(pattern));
                                    }
                                });
                            }
                        }
                        students[index].badges = currentB;
                    }

                    await putKV("students", JSON.stringify(students));
                    return new Response(JSON.stringify(students[index]), {
                        headers: { ...corsHeaders, "Content-Type": "application/json" }
                    });
                }
            }

            // POST /api/students/:id/logs — add a pedagogical log entry
            if (path.match(/^\/api\/students\/[^/]+\/logs$/) && method === "POST") {
                const parts = path.split("/").filter(Boolean);
                const id = parts[2];
                const { type, text, date } = await request.json();
                const studentsRaw = await getKV("students");
                let students = JSON.parse(studentsRaw || "[]");

                const index = students.findIndex(s => String(s.id) === String(id));
                if (index === -1) return new Response("Not Found", { status: 404, headers: corsHeaders });

                if (!students[index].pedagogical_logs) students[index].pedagogical_logs = [];
                
                students[index].pedagogical_logs.push({
                    id: Date.now().toString(),
                    type: type || "neutral",
                    text: text || "",
                    date: date || new Date().toISOString().split('T')[0],
                    timestamp: new Date().toISOString()
                });

                await putKV("students", JSON.stringify(students));
                return new Response(JSON.stringify(students[index]), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }

            // Handle Redeem Endpoints
            if (path.includes("/redeem") && (method === "POST" || method === "PATCH")) {
                const pathParts = path.split("/");
                const id = pathParts[3];
                const { threshold, status } = await request.json();
                const studentsRaw = await getKV("students");
                let students = JSON.parse(studentsRaw || "[]");

                const index = students.findIndex(s => String(s.id) === String(id));
                if (index === -1) return new Response("Not Found", { status: 404, headers: corsHeaders });

                if (!students[index].redemptions) students[index].redemptions = {};

                if (method === "POST") {
                    // Request a redemption (student)
                    const stamps = students[index].stamps || 0;
                    const usedStamps = students[index].usedStamps || 0;
                    const freeStamps = stamps - usedStamps;
                    const reqThreshold = parseInt(threshold);

                    if (reqThreshold >= 60) {
                        // Milestone based on total stamps
                        if (stamps < reqThreshold) {
                            return new Response("Noch nicht genug Gesamt-Stempel für diesen Meilenstein.", { status: 400, headers: corsHeaders });
                        }
                    } else {
                        // Normal reward based on free stamps
                        if (freeStamps < reqThreshold) {
                            return new Response("Zu wenig freie Stempel für diese Belohnung.", { status: 400, headers: corsHeaders });
                        }
                    }

                    students[index].redemptions[threshold] = "pending";

                    // TELEGRAM NOTIFICATION
                    const rewardsRaw = await getKV("rewards");
                    const rewards = rewardsRaw ? JSON.parse(rewardsRaw) : DEFAULT_REWARDS;
                    const reward = rewards.find(r => r.threshold === parseInt(threshold));
                    const rewardName = reward ? reward.title : `Belohnung (${threshold} Stempel)`;

                    await sendTelegramMessage(env, `🎁 NEUE ANFRAGE!\n\nSchüler: ${students[index].name}\nBelohnung: ${rewardName}\n\nBitte im Admin-Dashboard bestätigen.`);

                } else if (method === "PATCH") {
                    // Confirm a redemption (admin) — mark as completed so stamp card stays checked
                    students[index].redemptions[threshold] = "completed";

                    const reqThreshold = parseInt(threshold);
                    const isMilestone = reqThreshold >= 60;

                    if (!isMilestone) {
                        // Migration/Initialization for usedStamps (Normal Rewards only)
                        if (students[index].usedStamps === undefined) {
                            let sum = 0;
                            for (const [t, s] of Object.entries(students[index].redemptions)) {
                                if (s === "completed" && parseInt(t) < 60) sum += parseInt(t);
                            }
                            students[index].usedStamps = sum;
                        } else {
                            // Already initialized, just increment for normal rewards
                            students[index].usedStamps = students[index].usedStamps + reqThreshold;
                        }
                    } else if (students[index].usedStamps === undefined) {
                         // Initialize to 0 if not exists (Milestones don't count)
                         students[index].usedStamps = 0;
                    }

                    // --- NEW: If reward title is "Filmtag", activate/increment group progress ---
                    const rewardsRaw = await getKV("rewards");
                    const rewards = rewardsRaw ? JSON.parse(rewardsRaw) : DEFAULT_REWARDS;
                    const reward = rewards.find(r => r.threshold === parseInt(threshold));
                    const rewardName = reward ? reward.title : `Belohnung (${threshold} Stempel)`;

                    if (rewardName.toLowerCase().includes("filmtag")) {
                        const settingsRaw = await getKV("settings");
                        let settings = JSON.parse(settingsRaw || "{}");
                        if (settings.groupReward) {
                            settings.groupReward.current = 1; // Der Initiator zählt als erster Spender
                            settings.groupReward.active = true; // Spendenrunde starten
                            settings.groupReward.isApproved = false; // Reset approval state
                            students[index].contributedToCurrent = true; // Initiator als Spender markieren
                            await putKV("settings", JSON.stringify(settings));
                        }
                    }
                }

                await putKV("students", JSON.stringify(students));
                return new Response(JSON.stringify(students[index]), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }

            // Handle Group Contribution
            if (path.includes("/group-contribute") && method === "POST") {
                const pathParts = path.split("/");
                const id = pathParts[3];
                const studentsRaw = await getKV("students");
                let students = JSON.parse(studentsRaw || "[]");
                const index = students.findIndex(s => String(s.id) === String(id));

                if (index !== -1) {
                    const student = students[index];
                    // Calculate free stamps
                    let usedStamps = student.usedStamps || 0;
                    if (usedStamps === 0 && student.redemptions) {
                         Object.entries(student.redemptions).forEach(([t, s]) => {
                            if (s === 'completed') usedStamps += parseInt(t);
                         });
                    }
                    const freeStamps = student.stamps - usedStamps;

                    // NEW: Check if group reward is ACTIVE
                    const settingsRaw = await getKV("settings");
                    let settings = JSON.parse(settingsRaw || "{}");
                    
                    if (!settings.groupReward || !settings.groupReward.active) {
                        return new Response("Gruppen-Belohnung ist aktuell nicht aktiv (muss erst gestartet werden)", { status: 400, headers: corsHeaders });
                    }

                    if (settings.groupReward.current >= settings.groupReward.target) {
                        return new Response("Ziel bereits erreicht! Es können keine weiteren Stempel gespendet werden.", { status: 400, headers: corsHeaders });
                    }

                    if (freeStamps >= 1) {
                        // Deduct from student (increase usedStamps)
                        student.usedStamps = usedStamps + 1;
                        student.contributedToCurrent = true; // Mark as donor

                        if (!student.history) student.history = [];
                        student.history.push({ date: new Date().toISOString().split('T')[0], reason: `Spende für ${settings.groupReward.title}` });
                        
                        settings.groupReward.current = (settings.groupReward.current || 0) + 1;
                        
                        // NEW: Auto-approve and trigger celebration if goal reached
                        if (settings.groupReward.current >= settings.groupReward.target) {
                            settings.groupReward.isApproved = true;
                            settings.groupReward.active = false; // Hide donation button
                            
                            settings.celebration = {
                                id: Date.now(),
                                title: settings.groupReward.title || "Filmtag",
                                active: true
                            };

                            // Update history for all contributors
                            const today = new Date().toISOString().split('T')[0];
                            students.forEach(s => {
                                if (s.contributedToCurrent) {
                                    if (!s.history) s.history = [];
                                    s.history.push({ 
                                        date: today, 
                                        reason: `${settings.groupReward.title || 'Filmtag'} Ziel erreicht! 🎉`,
                                        emoji: "🎬"
                                    });
                                    s.contributedToCurrent = false;
                                }
                            });
                        }
                        
                        await putKV("students", JSON.stringify(students));
                        await putKV("settings", JSON.stringify(settings));
                        
                        return new Response(JSON.stringify(student), {
                            headers: { ...corsHeaders, "Content-Type": "application/json" }
                        });
                    }
                    return new Response("Nicht genügend Stempel", { status: 400, headers: corsHeaders });
                }
                return new Response("Schüler nicht gefunden", { status: 404, headers: corsHeaders });
            }

            // POST /api/tamagotchi/care — Deduct 1 stamp and care for the pet
            if (path === "/api/tamagotchi/care" && method === "POST") {
                const body = await request.json();
                const studentId = body.studentId;
                const action = body.action;
                const subAction = (body.subAction || "").toLowerCase(); // Normalize!

                const studentsRaw = await getKV("students");
                let students = JSON.parse(studentsRaw || "[]");
                const idx = students.findIndex(s => String(s.id) === String(studentId));
                if (idx === -1) return new Response("Student not found", { status: 404, headers: corsHeaders });

                const student = students[idx];
                const today = new Date().toISOString().split('T')[0];

                // ... (rest of the action count logic) ...
                if (!student.tamaActions) student.tamaActions = { count: 0, date: "" };
                if (student.tamaActions.date !== today) {
                    student.tamaActions.count = 0;
                    student.tamaActions.date = today;
                }

                if (student.tamaActions.count >= 5) {
                    return new Response("Du hast dich heute schon 5x um das Tier gekümmert!", { status: 403, headers: corsHeaders });
                }

                const settingsRaw = await getKV("settings");
                let settings = JSON.parse(settingsRaw || "{}");
                if (!settings.tamagotchi || (settings.tamagotchi.status !== "hatched" && settings.tamagotchi.status !== "dead")) {
                    return new Response("Tamagotchi schläft noch oder existiert nicht.", { status: 400, headers: corsHeaders });
                }

                if (settings.tamagotchi.status === "dead") {
                    return new Response("Dein Tamagotchi ist verstorben... 👻 Melde dich beim Admin.", { status: 403, headers: corsHeaders });
                }

                // Increment action count (Free interaction)
                student.tamaActions.count++;
                
                if (!student.history) student.history = [];
                
                // Apply decay before interaction to ensure boosts are applied to current state
                applyTamagotchiDecay(settings, Date.now());

                // Interaction wakes up the Tamagotchi AND gives a fun boost to keep it awake
                settings.tamagotchi.isSleeping = false;
                settings.tamagotchi.lastActionTime = Date.now();
                settings.tamagotchi.lastAction = action;
                settings.tamagotchi.stats.fun = Math.max(settings.tamagotchi.stats.fun || 0, 20); // Force out of low-fun zone

                // Record Student Name for Greeting
                settings.tamagotchi.lastActionStudentName = student.name;

                let logMsg = "";
                if (action === "feed") { 
                    const currentFood = subAction || 'apple'; 
                    settings.tamagotchi.lastSubAction = currentFood; // Store for the Infoboard to display correctly
                    
                    // Check for Hand Wash (must be within last 60 seconds)
                    const now = Date.now();
                    const lastWash = student.lastHandWash || 0;
                    if (now - lastWash > 60000) {
                        return new Response(`${student.name}, vor dem Essen erst Hände Waschen! 🧼`, { status: 403, headers: corsHeaders });
                    }

                    if (subAction === 'donut') {
                        settings.tamagotchi.stats.hunger = Math.min(100, (settings.tamagotchi.stats.hunger || 0) + 15);
                        settings.tamagotchi.stats.fun = Math.min(100, (settings.tamagotchi.stats.fun || 0) + 40);
                        settings.tamagotchi.sugarCrashTime = Date.now() + 5 * 60000; // Crash after 5 mins
                        logMsg = "Donut gegessen! 🍩 (Zuckerschub!)";
                    } else {
                        // Healthy Apple
                        settings.tamagotchi.stats.hunger = Math.min(100, (settings.tamagotchi.stats.hunger || 0) + 30);
                        settings.tamagotchi.stats.fun = Math.min(100, (settings.tamagotchi.stats.fun || 0) + 10);
                        logMsg = "Gesunden Apfel gegessen! 🍎";
                    }

                    settings.tamagotchi.needsBrushing = true;
                    settings.tamagotchi.lastAction = 'feed';
                    settings.tamagotchi.lastActionTime = Date.now();
                }
                else if (action === "brush") {
                    settings.tamagotchi.needsBrushing = false;
                    settings.tamagotchi.stats.hygiene = Math.min(100, (settings.tamagotchi.stats.hygiene || 0) + 30);
                    settings.tamagotchi.lastAction = 'brush';
                    settings.tamagotchi.lastActionTime = Date.now();
                    logMsg = "Zähne blitzblank geputzt! 🪥";
                }
                else if (action === "recycle") {
                    settings.tamagotchi.trashCount = 0;
                    settings.tamagotchi.stats.xp = (settings.tamagotchi.stats.xp || 0) + 20;
                    settings.tamagotchi.lastAction = 'recycle';
                    settings.tamagotchi.lastActionTime = Date.now();
                    logMsg = "Müll gesammelt und getrennt! 🌍";
                }
                else if (action === "water") { 
                    settings.tamagotchi.stats.thirst = Math.min(100, (settings.tamagotchi.stats.thirst || 0) + 25); 
                    settings.tamagotchi.lastAction = 'water';
                    settings.tamagotchi.lastActionTime = Date.now();
                    logMsg = "Tamagotchi getränkt 💧"; 
                }
                else if (action === "play") { 
                    settings.tamagotchi.stats.fun = Math.min(100, (settings.tamagotchi.stats.fun || 0) + 25); 
                    settings.tamagotchi.stats.love = Math.min(100, (settings.tamagotchi.stats.love || 0) + 5); 
                    settings.tamagotchi.lastAction = 'play';
                    settings.tamagotchi.lastActionTime = Date.now();
                    logMsg = "Mit Tamagotchi gespielt 🧶"; 
                }
                else if (action === "love") { 
                    settings.tamagotchi.stats.love = Math.min(100, (settings.tamagotchi.stats.love || 0) + 25); 
                    settings.tamagotchi.lastAction = 'love';
                    settings.tamagotchi.lastActionTime = Date.now();
                    logMsg = "Tamagotchi gestreichelt ❤️"; 
                }
                else if (action === "clean") {
                    settings.tamagotchi.stats.hygiene = Math.min(100, (settings.tamagotchi.stats.hygiene || 0) + 40);
                    settings.tamagotchi.poopCount = 0;
                    settings.tamagotchi.lastAction = 'clean';
                    settings.tamagotchi.lastActionTime = Date.now();
                    logMsg = "Tamagotchi Display geputzt 🧼";
                }
                else if (action === "train") {
                    settings.tamagotchi.stats.intelligence = Math.min(100, (settings.tamagotchi.stats.intelligence || 0) + 5);
                    settings.tamagotchi.stats.xp = (settings.tamagotchi.stats.xp || 0) + 10;
                    
                    // Level Up Logic
                    const nextLevelXp = (settings.tamagotchi.stats.level || 1) * 100;
                    if (settings.tamagotchi.stats.xp >= nextLevelXp) {
                        settings.tamagotchi.stats.level = (settings.tamagotchi.stats.level || 1) + 1;
                        settings.tamagotchi.stats.xp = 0;
                    }

                    settings.tamagotchi.lastAction = 'train';
                    settings.tamagotchi.lastActionTime = Date.now();
                    logMsg = "Mit Tamagotchi gelernt 📚";
                }
                else if (action === "poop") {
                    settings.tamagotchi.poopCount = Math.min(20, (settings.tamagotchi.poopCount || 0) + 1);
                    settings.tamagotchi.lastAction = 'poop';
                    settings.tamagotchi.lastActionTime = Date.now();
                    logMsg = "Häufchen gemacht 💩";
                }
                else if (action === "style") {
                    const hats = [
                        'hat_party', 'hat_crown', 'hat_cool', 'hat_detective', 
                        'hat_top', 'hat_wizard', 'hat_ninja', 'hat_bow',
                        'hat_viking', 'hat_santahat', 'hat_cowboy', 'hat_chef',
                        'hat_headphones', 'hat_straw', 'hat_graduation', 'hat_eyepatch'
                    ];
                    settings.tamagotchi.currentHat = hats[Math.floor(Math.random() * hats.length)];
                    settings.tamagotchi.hatExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 Hours
                    settings.tamagotchi.lastAction = 'style';
                    settings.tamagotchi.lastActionTime = Date.now();
                    logMsg = "Tamagotchi neu gestylt 🎩";
                }
                else if (action === "read") {
                    settings.tamagotchi.stats.readCount = (settings.tamagotchi.stats.readCount || 0) + 1;
                    settings.tamagotchi.stats.intelligence = Math.min(100, (settings.tamagotchi.stats.intelligence || 0) + 2);
                    settings.tamagotchi.lastAction = 'read';
                    settings.tamagotchi.lastActionTime = Date.now();
                    logMsg = "Gemeinsam ein Buch gelesen 📖";
                }
                else if (action === "homework") {
                    const readCount = settings.tamagotchi.stats.readCount || 0;
                    // Probability of success: starts at 20%, goes up to 90% after 15 reads
                    const successProb = Math.min(0.9, 0.2 + (readCount * 0.05));
                    const isSuccessful = Math.random() < successProb;
                    
                    // Generate Simple Math Problem (Addition up to 20)
                    const a = Math.floor(Math.random() * 10) + 1;
                    const b = Math.floor(Math.random() * 10) + 1;
                    const realResult = a + b;
                    const displayResult = isSuccessful ? realResult : (realResult + (Math.random() < 0.5 ? 1 : -1) * (Math.floor(Math.random() * 3) + 1));
                    
                    settings.tamagotchi.lastHomework = {
                        a, b, op: '+',
                        result: displayResult,
                        isCorrect: isSuccessful
                    };
                    
                    if (isSuccessful) {
                        settings.tamagotchi.stats.intelligence = Math.min(100, (settings.tamagotchi.stats.intelligence || 0) + 5);
                        settings.tamagotchi.stats.xp = (settings.tamagotchi.stats.xp || 0) + 15;
                        logMsg = "Hausaufgaben gelöst! 📝✨";
                    } else {
                        // Fail decreases fun because it's frustrating
                        settings.tamagotchi.stats.fun = Math.max(0, (settings.tamagotchi.stats.fun || 0) - 15);
                        logMsg = "Hausaufgaben waren zu schwer... 😵‍💫";
                    }
                    
                    settings.tamagotchi.lastAction = 'homework';
                    settings.tamagotchi.lastActionTime = Date.now();
                }
                else if (action === "handwash") {
                    student.lastHandWash = Date.now();
                    settings.tamagotchi.lastAction = 'handwash';
                    settings.tamagotchi.lastActionTime = Date.now();
                    logMsg = "Hände gewaschen 🧼";
                }
                
                student.history.push({ date: today, reason: logMsg, emoji: "🐣" });
                settings.tamagotchi.lastUpdate = Date.now();

                await Promise.all([
                    putKV("students", JSON.stringify(students)),
                    putKV("settings", JSON.stringify(settings))
                ]);

                return new Response(JSON.stringify({ student, tamagotchi: settings.tamagotchi }), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }

            // POST /api/tamagotchi/hatch — Start the pet lifecycle
            if (path === "/api/tamagotchi/hatch" && method === "POST") {
                const { name } = await request.json();
                const settingsRaw = await getKV("settings");
                let settings = JSON.parse(settingsRaw || "{}");
                
                settings.tamagotchi = {
                    name,
                    status: "hatched",
                    stage: "baby", // Fix for "(undefined)" in admin
                    born: Date.now(),
                    lastUpdate: Date.now(),
                    stats: { hunger: 80, thirst: 80, love: 50, fun: 50, hygiene: 100, intelligence: 1, xp: 0, level: 1 },
                    lastAction: 'hatch',
                    lastActionTime: new Date().toISOString(),
                    poopCount: 0,
                    currentHat: null
                };

                await putKV("settings", JSON.stringify(settings));
                return new Response(JSON.stringify(settings.tamagotchi), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }

            if (path.startsWith("/api/students/") && method === "DELETE") {
                const id = path.split("/").pop();
                const studentsRaw = await getKV("students");
                let students = JSON.parse(studentsRaw || "[]");

                students = students.filter(s => String(s.id) !== String(id));
                await putKV("students", JSON.stringify(students));
                return new Response(null, { status: 204, headers: corsHeaders });
            }

            // VIP Status toggle
            if (path.includes("/vip") && method === "PATCH") {
                const id = path.split("/")[3];
                const { active, reason } = await request.json();
                const studentsRaw = await getKV("students");
                let students = JSON.parse(studentsRaw || "[]");
                const index = students.findIndex(s => String(s.id) === String(id));
                if (index === -1) return new Response("Not Found", { status: 404, headers: corsHeaders });

                students[index].vip = {
                    active: !!active,
                    grantedAt: active ? new Date().toISOString().split('T')[0] : null,
                    reason: reason || ""
                };

                if (!students[index].history) students[index].history = [];
                students[index].history.push({
                    date: new Date().toISOString().split('T')[0],
                    reason: active ? `⭐ VIP-Status erhalten${reason ? ': ' + reason : ''}` : "VIP-Status entfernt"
                });

                await putKV("students", JSON.stringify(students));
                return new Response(JSON.stringify(students[index]), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }

            // --- AI Generation Endpoint (Kreative Projekte) ---
            if (path === "/api/ai/generate" && method === "POST") {
                const body = await request.json();
                const promptText = body.promptText;

                if (!promptText) {
                    return new Response("Missing promptText", { status: 400, headers: corsHeaders });
                }

                try {
                    const apiKey = (env.KI_API || "").trim().replace(/^"|"$/g, '');
                    const result = await callGemini(promptText, apiKey, { temperature: 0.7, maxTokens: 4000 });
                    
                    if (result.success) {
                        return new Response(JSON.stringify({ text: result.text, model: result.model }), {
                            headers: { ...corsHeaders, "Content-Type": "application/json" }
                        });
                    } else {
                        return new Response(`Gemini API Error: ${result.error}`, { status: 500, headers: corsHeaders });
                    }
                } catch (err) {
                    return new Response(`Backend Error: ${err.message}`, { status: 500, headers: corsHeaders });
                }
            }

            if (path === "/api/ai/day-summary" && method === "GET") {
                const date = url.searchParams.get("date") || new Date().toISOString().split('T')[0];
                const force = url.searchParams.get("force") === "true";
                const cacheKey = `day_summary_${date}`;

                // --- KV Server-Side Cache Check ---
                if (!force) {
                    // Check older archive format first for backwards compatibility
                    const archived = await getKV(`archived_summary_${date}`);
                    if (archived) return new Response(JSON.stringify({ text: archived, isArchived: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

                    // Check new fast cache
                    const cached = await getKV(cacheKey);
                    if (cached) return new Response(JSON.stringify({ text: cached, isCached: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
                }

                const studentsRaw = await getKV("students");
                const students = JSON.parse(studentsRaw || "[]");

                let dayLogs = [];
                students.forEach(s => {
                    if (s.pedagogical_logs) {
                        const logs = s.pedagogical_logs.filter(l => String(l.date) === String(date));
                        logs.forEach(l => {
                            dayLogs.push({ studentName: s.name, type: l.type, text: l.text });
                        });
                    }
                });

                if (dayLogs.length === 0) {
                    return new Response(JSON.stringify({ text: "Keine Einträge für diesen Tag gefunden." }), {
                        headers: { ...corsHeaders, "Content-Type": "application/json" }
                    });
                }

                const logsText = dayLogs.map(l => {
                    const typeLabel = l.type === 'pos' ? 'Positiv' : (l.type === 'neg' ? 'Negativ' : 'Neutral');
                    return `[${typeLabel}] ${l.studentName}: ${l.text}`;
                }).join('\n');

                const prompt = `Du bist NACHMI, ein erfahrener pädagogischer Assistent. \nHier sind die Beobachtungen für den Tag (${date}):\n${logsText}\n\nErstelle daraus eine strukturierte Zusammenfassung (ca. 100-150 Wörter).\n1. Was war heute besonders positiv?\n2. Welche Herausforderungen gab es?\n3. Ein kurzes Fazit für das Team.\n\nSchreibe professionell, aber herzlich auf Deutsch. Benutze Emojis.`;

                const apiKey = (env.KI_API || "").trim().replace(/^"|"$/g, '');
                if (!apiKey || apiKey.length < 10) return new Response("Ungültiger API Key (KI_API fehlt)", { status: 500, headers: corsHeaders });

                const result = await callGemini(prompt, apiKey, { temperature: 0.7, maxTokens: 2000 });
                
                if (result.success) {
                    // Cache the result
                    await putKV(cacheKey, result.text);

                    // Automatisch an Telegram senden (Logbuch-Kanal)
                    if (env.TELEGRAM_LOGBUCH_TOKEN) {
                        try {
                            const telegramChatId = env.TELEGRAM_LOGBUCH_CHAT_ID || env.TELEGRAM_CHAT_ID;
                            if (telegramChatId) {
                                await sendTelegramMessage(
                                    env, 
                                    `📝 KI-Tageszusammenfassung (${date}):\n\n${result.text}`,
                                    env.TELEGRAM_LOGBUCH_TOKEN,
                                    telegramChatId
                                );
                            }
                        } catch (te) {
                            console.error("Auto-Telegram summary error:", te);
                        }
                    }

                    return new Response(JSON.stringify({ text: result.text, model: result.model }), {
                        headers: { ...corsHeaders, "Content-Type": "application/json" }
                    });
                } else {
                    return new Response(JSON.stringify({ 
                        text: `KI-Fehler: ${result.error}`, 
                        details: result.details 
                    }), { 
                        status: 500, 
                        headers: { ...corsHeaders, "Content-Type": "application/json" } 
                    });
                }
            }
            
            if (path === "/api/ai/day-summary/archive" && method === "POST") {
                const body = await request.json();
                if (!body.date || !body.text) return new Response("Missing date or text", { status: 400, headers: corsHeaders });
                await putKV(`archived_summary_${body.date}`, body.text);
                return new Response(JSON.stringify({ success: true }), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }

            if (path === "/api/ai/day-summary/list" && method === "GET") {
                const list = await env.DATABASE.list({ prefix: "archived_summary_" });
                const dates = list.keys.map(k => k.name.replace("archived_summary_", ""));
                return new Response(JSON.stringify({ dates }), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }

            // --- PERSONAL AI Motivation Endpoint (NEW) ---
            if (path === "/api/ai/student-motivation" && method === "GET") {
                console.log("Personal AI Motivation Request received for path:", path);
                const urlParams = new URLSearchParams(url.search);
                const studentId = urlParams.get('id');
                if (!studentId) return new Response("Missing student id", { status: 400, headers: corsHeaders });

                const [studentsRaw, settingsRaw, badgesRaw] = await Promise.all([
                    getKV("students"),
                    getKV("settings"),
                    getKV("badges")
                ]);

                const students = studentsRaw ? JSON.parse(studentsRaw) : [];
                const settings = settingsRaw ? JSON.parse(settingsRaw) : {};
                const badges = badgesRaw ? JSON.parse(badgesRaw) : [];

                const student = students.find(s => String(s.id).toLowerCase() === studentId.toLowerCase());
                if (!student) return new Response("Student not found", { status: 404, headers: corsHeaders });

                const todayStr = new Date().toISOString().split('T')[0];
                const force = urlParams.get('force') === 'true';
                const cacheKey = `motivation_${student.id}_${todayStr}`;

                // --- KV Server-Side Cache Check ---
                if (!force) {
                    const cached = await getKV(cacheKey);
                    if (cached) {
                        console.log("Serving motivation from KV cache for:", student.id);
                        return new Response(JSON.stringify({ text: cached, isCached: true }), {
                            headers: { ...corsHeaders, "Content-Type": "application/json" }
                        });
                    }
                }

                const planText = settings.todayPlan || "noch kein spezieller Plan";
                const studentName = student.name.split(' ')[0]; // Nur Vorname
                const studentBadges = (student.badges || []).map(bid => {
                    const b = badges.find(x => String(x.id) === String(bid));
                    return b ? b.name : '';
                }).filter(Boolean).join(', ');

                // const todayStr is already defined above
                const logsToday = (student.pedagogical_logs || [])
                    .filter(l => l.date === todayStr)
                    .map(l => l.text)
                    .join('; ');

                const prompt = `Du bist NACHMI, dein cooler KI-Buddy für heute! 😎
Sprich ${studentName} direkt und locker an.
Plan für heute: "${planText}".
Badges: ${studentBadges || "Noch keine am Start (motiviere " + studentName + ", welche zu holen!)"}.
${logsToday ? `WICHTIG! Hier sind frische Insider-Beobachtungen aus dem Admin-Log: "${logsToday}". Beziehe dich unbedingt darauf (Lob, Support, Motivation)!` : "Heute gibt's noch keine Log-Einträge, also sei einfach allgemein extrem motivierend und hype den Tag."}

Deine Aufgabe: Schreibe eine kurze, energiegeladene Message (ca. 40-60 Wörter):
1. Sei locker, benutze coole Emojis (🔥, ✨, 💪, 🚀) und einen modernen Vibe (nicht zu förmlich!).
2. Beziehe dich auf den Plan und pushe ${studentName} für eine Aktivität.
3. Das Wichtigste: Geh auf die Badges und ${logsToday ? "die heutigen Log-Einträge" : "den Vibe"} ein.
4. FORMAT: Antworte NUR mit dem reinen Text. KEINE Sternchen (*), KEINE Backticks (\`\`\`). Nur Text.
5. ABSCHLUSS: Der Text MUSS mit einem vollständigen Satz enden. Brich NIEMALS mittendrin ab!`;

                const apiKey = (env.KI_API || "").trim().replace(/^"|"$/g, '');
                if (!apiKey || apiKey.length < 10) return new Response("Ungültiger API Key (KI_API fehlt)", { status: 500, headers: corsHeaders });

                const result = await callGemini(prompt, apiKey, { temperature: 0.8, maxTokens: 1500 });

                if (result.success) {
                    // --- Store in KV for 24 hours ---
                    await putKV(cacheKey, result.text, { expirationTtl: 86400 });
                    
                    return new Response(JSON.stringify({ text: result.text, model: result.model }), {
                        headers: { ...corsHeaders, "Content-Type": "application/json" }
                    });
                } else {
                    return new Response(JSON.stringify({ 
                        text: "NACHMI macht gerade eine kurze Pause. ✨ Sammle weiter Stempel!",
                        debugError: result.error,
                        debugDetails: result.details
                    }), { 
                        headers: { ...corsHeaders, "Content-Type": "application/json" }
                    });
                }
            }

            // --- AI Generation Endpoint (Tagesplan Motivation - Legacy/Global) ---
            if (path === "/api/ai/day-plan" && method === "POST") {
                const body = await request.json();
                const planText = body.planText || "";
                const studentList = body.students || [];

                if (!planText) {
                    return new Response("Missing planText", { status: 400, headers: corsHeaders });
                }

                // Format ENTIRE student list (even those without badges) for the AI
                const studentsWithBadges = studentList
                    .map(s => {
                        const bText = (s.badges && s.badges.length > 0) ? ` (Badges: ${s.badges.join(', ')})` : " (noch keine Badges)";
                        return `${s.name}${bText}`;
                    })
                    .join('; ');

                const prompt = `[PROMPT-ID: ${Date.now()}] Du bist NACHMI, der herzliche KI-Hort-Assistent für Kinder (6-10 Jahre).
Heute haben wir diesen spannenden Tagesplan: "${planText}".

Hier ist die Liste ALLER Kinder im Hort: ${studentsWithBadges}.

Deine Aufgabe: Schreibe eine ausführliche, begeisterte Nachricht für die Infotafel (ca. 50-70 Wörter):
1. Analysiere den GESAMTEN Tagesplan und nenne mindestens DREI Aktivitäten daraus.
2. Nenne mindestens 3-4 Kinder namentlich aus der Liste oben und beziehe dich auf ihre Abzeichen (falls vorhanden) oder motiviere sie gezielt für heute!
3. Schreibe MINDESTENS 4-5 Sätze. 
4. Sei extrem herzlich, benutze viele Emojis und stelle sicher, dass jeder Satz grammatikalisch vollständig beendet wird. Brich niemals mitten im Satz ab!`;

                const apiKey = (env.KI_API || "").trim().replace(/^"|"$/g, '');
                if (!apiKey || apiKey === "undefined" || apiKey.length < 10) {
                    return new Response("FEHLER: Cloudflare Secret 'KI_API' fehlt! Bitte in der Cloudflare-Konsole unter 'Settings -> Variables -> Secrets' eintragen.", { 
                        status: 401, 
                        headers: corsHeaders 
                    });
                }

                const result = await callGemini(prompt, apiKey, { temperature: 0.9, maxTokens: 600 });
                
                if (result.success) {
                    return new Response(JSON.stringify({ 
                        text: result.text, 
                        model: result.model 
                    }), {
                        headers: { ...corsHeaders, "Content-Type": "application/json" }
                    });
                } else {
                    return new Response(`KI-Verbindungsfehler: ${result.error}`, { status: 500, headers: corsHeaders });
                }
            }

            // --- AI Model Discovery Endpoint ---
            if (path === "/api/ai/models" && method === "GET") {
                const apiKey = (env.KI_API || "").trim().replace(/^"|"$/g, '');
                if (!apiKey) return new Response("Secret KI_API not found", { status: 401, headers: corsHeaders });
                try {
                    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
                    const res = await fetch(url);
                    const data = await res.json();
                    
                    // NEW: Real Generation Test with callGemini
                    const testResult = await callGemini("Hi, this is a diagnostic test.", apiKey, { maxTokens: 10 });

                    return new Response(JSON.stringify({ 
                        success: testResult.success,
                        modelUsed: testResult.model,
                        textReceived: testResult.text,
                        availableModels: data, 
                        fullDiagnostic: testResult
                    }), {
                        headers: { ...corsHeaders, "Content-Type": "application/json" }
                    });
                } catch (err) {
                    return new Response(`Error listing models: ${err.message}`, { status: 500, headers: corsHeaders });
                }
            }

            return new Response(`Not Found: ${method} ${path}`, { status: 404, headers: corsHeaders });
        } catch (err) {
            return new Response(err.message, { status: 500, headers: corsHeaders });
        }
    },

    async scheduled(event, env, ctx) {
        if (!env.DATABASE || !env.TELEGRAM_TOKEN || !env.TELEGRAM_CHAT_ID) {
            console.error("Missing DB or Telegram credentials");
            return;
        }

        try {
            const studentsRaw = await getKV("students");
            if (!studentsRaw) return;
            let students = JSON.parse(studentsRaw);

            const settingsRaw = await getKV("settings");
            const settings = settingsRaw ? JSON.parse(settingsRaw) : {};
            const vipDuration = settings.vipDurationDays || 3;

            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const todayStr = today.toISOString().split('T')[0];

            let events = [];
            let studentsChanged = false;

            // --- 1. Check VIP expiry ---
            for (let i = 0; i < students.length; i++) {
                const s = students[i];
                if (s.vip && s.vip.active && s.vip.grantedAt) {
                    const grantedDate = new Date(s.vip.grantedAt);
                    grantedDate.setHours(0,0,0,0);
                    const daysDiff = Math.floor((today.getTime() - grantedDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                    const daysLeft = vipDuration - daysDiff + 1;

                    if (daysLeft <= 0) {
                        // VIP expired → auto-deactivate
                        students[i].vip.active = false;
                        if (!students[i].history) students[i].history = [];
                        students[i].history.push({ date: todayStr, reason: "VIP-Status abgelaufen ⏰" });
                        events.push({ type: 'vip_expired', name: s.name });
                        studentsChanged = true;
                    } else if (daysLeft === 1) {
                        // Last VIP day warning
                        events.push({ type: 'vip_last_day', name: s.name, day: daysDiff, total: vipDuration });
                    } else {
                        events.push({ type: 'vip_active', name: s.name, day: daysDiff, total: vipDuration });
                    }
                }
            }

            if (studentsChanged) {
                await putKV("students", JSON.stringify(students));
            }

            // --- 2. Check Birthdays (this week) ---
            const day = today.getDay() || 7;
            const monday = new Date(today);
            monday.setDate(today.getDate() - day + 1);
            monday.setHours(0, 0, 0, 0);
            const sunday = new Date(monday);
            sunday.setDate(monday.getDate() + 6);
            sunday.setHours(23, 59, 59, 999);

            for (const s of students) {
                if (!s.birthday) continue;
                const parts = s.birthday.split('-');
                if (parts.length === 3) {
                    const bMonth = parseInt(parts[1], 10) - 1;
                    const bDay = parseInt(parts[2], 10);
                    const thisYearBday = new Date(today.getFullYear(), bMonth, bDay);
                    if (thisYearBday >= monday && thisYearBday <= sunday) {
                        const isToday = thisYearBday.toISOString().split('T')[0] === todayStr;
                        events.push({ type: 'birthday', name: s.name, isToday });
                    }
                }
            }

            // --- 3. Check pending redemptions ---
            let pendingCount = 0;
            students.forEach(s => {
                if (s.redemptions) {
                    Object.values(s.redemptions).forEach(v => {
                        if (v === 'pending') pendingCount++;
                    });
                }
            });
            if (pendingCount > 0) {
                events.push({ type: 'pending_redemptions', count: pendingCount });
            }

            // --- 4. Generate AI summary or send static message ---
            if (events.length > 0) {
                let message;
                const apiKey = (env.KI_API || "").trim().replace(/^"|"$/g, '');
                if (apiKey) {
                    message = await getAISummary(events, apiKey);
                } else {
                    message = buildFallbackMessage(events);
                }
                if (message) await sendTelegramMessage(env, message);
            }

        } catch (err) {
            console.error("Scheduled task error:", err);
        }
    }
};

async function getAISummary(events, apiKey) {
    const eventsText = events.map(e => {
        if (e.type === 'birthday') return `- Geburtstag: ${e.name}${e.isToday ? ' (HEUTE!)' : ' (diese Woche)'}`;
        if (e.type === 'vip_last_day') return `- VIP letzter Tag: ${e.name} (Tag ${e.day}/${e.total})`;
        if (e.type === 'vip_expired') return `- VIP abgelaufen: ${e.name}`;
        if (e.type === 'vip_active') return `- VIP aktiv: ${e.name} (Tag ${e.day}/${e.total})`;
        if (e.type === 'pending_redemptions') return `- Offene Einlösungsanfragen: ${e.count} Stück`;
        return '';
    }).join('\n');

    const prompt = `Du bist ein freundlicher Schulassistent für eine Grundschule. 
Erstelle eine kurze, motivierende tägliche Zusammenfassung für den Betreuer auf Deutsch.
Nutze Emojis passend. Maximal 200 Wörter. Sei herzlich und professionell.

Heutige Ereignisse:
${eventsText}

Schreibe die Zusammenfassung jetzt:`;

    const result = await callGemini(prompt, apiKey, { maxTokens: 300, temperature: 0.7 });
    return result.success ? result.text : buildFallbackMessage(events);
}

/**
 * Universal Gemini API Helper with Model Discovery
 * Ensures compatibility across regions and accounts.
 */
async function callGemini(prompt, apiKey, options = {}) {
    if (!apiKey || apiKey.length < 5) {
        return { success: false, error: "API Key fehlt oder ist ungültig. Bitte prüfe dein Cloudflare Secret (KI_API)." };
    }

    const apiVersions = ['v1beta', 'v1'];
    let discoveredModel = null;
    let errors = [];

    // Step 1: Discover available models
    try {
        const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        if (listRes.ok) {
            const data = await listRes.json();
            const models = data.models || [];
            
            // Preference: flash 2.5 -> flash 2.0 -> flash 1.5 -> flash newest -> pro newer -> anything else
            const best = models.find(m => m.name.includes("gemini-2.5-flash") && m.supportedGenerationMethods.includes("generateContent")) ||
                         models.find(m => m.name.includes("gemini-2.0-flash") && m.supportedGenerationMethods.includes("generateContent")) ||
                         models.find(m => (m.name.includes("gemini-1.5-flash") || m.name.includes("gemini-1.5-flash-8b")) && m.supportedGenerationMethods.includes("generateContent")) ||
                         models.find(m => m.name.includes("gemini-3.1-flash") && m.supportedGenerationMethods.includes("generateContent")) ||
                         models.find(m => m.name.includes("flash") && m.supportedGenerationMethods.includes("generateContent")) ||
                         models.find(m => m.name.includes("pro") && m.supportedGenerationMethods.includes("generateContent")) ||
                         models.find(m => m.supportedGenerationMethods.includes("generateContent"));
            
            if (best) {
                discoveredModel = best.name.startsWith("models/") ? best.name : `models/${best.name}`;
            }
        } else {
            const errTxt = await listRes.text();
            errors.push(`Discovery Failed (${listRes.status}): ${errTxt.substring(0, 100)}`);
        }
    } catch (e) {
        errors.push(`Discovery Fetch Error: ${e.message}`);
    }

    // Step 2: Candidates - Include stable and latest models
    let candidates = [
        "models/gemini-2.5-flash",
        "models/gemini-2.0-flash",
        "models/gemini-1.5-flash-8b", 
        "models/gemini-1.5-flash", 
        "models/gemini-3.1-flash-lite-preview",
        "models/gemini-pro-latest",
        "models/gemini-flash-latest"
    ];
    
    // If discovery found a model, try it FIRST (even if not in hardcoded list)
    if (discoveredModel) {
        // Remove from candidates if already there to avoid duplicates
        candidates = candidates.filter(c => c !== discoveredModel);
        candidates.unshift(discoveredModel);
    }

    for (const ver of apiVersions) {
        for (const modelName of candidates) {
            try {
                const url = `https://generativelanguage.googleapis.com/${ver}/${modelName}:generateContent?key=${apiKey}`;
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: {
                            temperature: options.temperature || 0.7,
                            maxOutputTokens: options.maxTokens || 2000
                        },
                        safetySettings: [
                            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
                        ]
                    })
                });

                if (res.ok) {
                    const data = await res.json();
                    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (text) return { success: true, text: text.trim(), model: `${ver}/${modelName}` };
                    
                    errors.push(`[${ver}/${modelName}] No text in response: ${JSON.stringify(data).substring(0, 100)}`);
                } else {
                    const errTxt = await res.text();
                    errors.push(`[${ver}/${modelName}] ${res.status}: ${errTxt.substring(0, 100)}`);
                }
                
                // If Rate Limited, wait 1s before trying NEXT model to let quota recover
                if (res.status === 429) {
                    await new Promise(r => setTimeout(r, 1000));
                }
            } catch (e) {
                errors.push(`[${ver}/${modelName}] Error: ${e.message}`);
            }
        }
    }

    return { 
        success: false, 
        error: "Keine verfügbare KI-Kombination gefunden. Prüfe deinen API-Key und das Kontingent.", 
        details: errors 
    };
}

function buildFallbackMessage(events) {
    let msg = "📋 Tagesübersicht NACHMI:\n\n";
    events.forEach(e => {
        if (e.type === 'birthday') msg += `🎂 Geburtstag: ${e.name}${e.isToday ? ' — HEUTE! 🎉' : ' (diese Woche)'}\n`;
        if (e.type === 'vip_last_day') msg += `⭐ LETZTER VIP-TAG: ${e.name}!\n`;
        if (e.type === 'vip_expired') msg += `⏰ VIP abgelaufen: ${e.name}\n`;
        if (e.type === 'vip_active') msg += `⭐ VIP aktiv: ${e.name} (Tag ${e.day}/${e.total})\n`;
        if (e.type === 'pending_redemptions') msg += `🎁 ${e.count} offene Einlösungsanfrage(n) ausstehend\n`;
    });
    return msg;
}

async function sendTelegramMessage(env, text, token = null, chatId = null) {
    const t = token || env.TELEGRAM_TOKEN;
    const cid = chatId || env.TELEGRAM_CHAT_ID;
    
    if (!t || !cid) return false;
    try {
        const response = await fetch(`https://api.telegram.org/bot${t}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: cid,
                text: text
            })
        });
        return response.ok;
    } catch (err) {
        console.error("Telegram error:", err);
        return false;
    }
}

// --- Helper for Time-Aware Decay ---
function calculateActiveHours(lastUpdate, now, ignoreFreeze) {
    if (ignoreFreeze) {
        return (now - lastUpdate) / (1000 * 3600);
    }

    let activems = 0;
    let current = new Date(lastUpdate);
    const target = new Date(now);

    // Hourly steps
    while (current < target) {
        const day = current.getDay(); // 0(Sun) - 6(Sat)
        const hour = current.getHours();
        
        const isWeekend = (day === 0 || day === 6);
        // Active from 11:00 to 16:30 (16.5)
        const isActiveHour = (hour >= 11 && hour < 17);

        if (!isWeekend && isActiveHour) {
            const startOfHour = new Date(current);
            startOfHour.setMinutes(0,0,0);
            const endOfHour = new Date(current);
            endOfHour.setMinutes(59,59,999);
            
            const effectiveStart = Math.max(current.getTime(), startOfHour.getTime());
            
            // Limit the end of the active window to 16:30 (16.5 hours)
            let hourEndLimit = endOfHour.getTime();
            if (hour === 16) {
                const limit30 = new Date(current);
                limit30.setMinutes(30, 0, 0);
                hourEndLimit = Math.min(hourEndLimit, limit30.getTime());
            }

            const effectiveEnd = Math.min(target.getTime(), hourEndLimit);
            
            if (effectiveEnd > effectiveStart) {
                activems += (effectiveEnd - effectiveStart);
            }
        }
        
        current.setHours(current.getHours() + 1);
        current.setMinutes(0, 0, 0);
    }
    
    return activems / (1000 * 3600);
}
