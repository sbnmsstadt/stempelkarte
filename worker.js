export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const path = url.pathname;
        const method = request.method;

        const corsHeaders = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        };

        if (method === "OPTIONS") {
            return new Response(null, { headers: corsHeaders });
        }

        if (!env.DATABASE) {
            return new Response("KV Namespace 'DATABASE' is not bound. Please check your Cloudflare settings.", {
                status: 500,
                headers: corsHeaders
            });
        }

        try {
            const DEFAULT_REWARDS = [
                { threshold: 4, icon: "🥨", title: "Snack-Box", desc: "Wähle einen Snack aus." },
                { threshold: 8, icon: "💍", title: "Armband/Anhänger", desc: "Such dir einen Schmuck aus." },
                { threshold: 20, icon: "🍿", title: "Level 1: Filmtag", desc: "Popcorn inklusive!" },
                { threshold: 40, icon: "🎮", title: "Level 2: Extra-Spielzeit", desc: "15 Min an der Konsole/Spiel." },
                { threshold: 60, icon: "👑", title: "Level 3: VIP Woche", desc: "Entscheide über die Spiele!" }
            ];

            // DEBUG: Test Telegram
            if (path === "/api/debug/test-telegram") {
                const success = await sendTelegramMessage(env, "Test-Nachricht vom Stempelkarten-System! ✅\n\nDein Bot ist richtig konfiguriert.");
                return new Response(JSON.stringify({ success, message: success ? "Test gesendet!" : "Fehler beim Senden. Prüfe deine Secrets!" }), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }

            if (path === "/api/settings" && method === "GET") {
                const settingsRaw = await env.DATABASE.get("settings");
                const defaultActivities = [
                    { label: "Sport-AG", emoji: "🏀" },
                    { label: "Hausaufgaben", emoji: "📝" },
                    { label: "Hilfe", emoji: "🤝" },
                    { label: "Lesen", emoji: "📚" },
                    { label: "Kreativ", emoji: "🎨" },
                    { label: "Spielen", emoji: "🎲" },
                    { label: "Projekt", emoji: "🚀" },
                    { label: "Sonstiges", emoji: "🌟" }
                ];
                const settings = settingsRaw ? JSON.parse(settingsRaw) : { 
                    communityTarget: 500, 
                    activities: defaultActivities,
                    groupReward: { title: "Filmtag", target: 8, current: 0, icon: "🎬" }
                };
                return new Response(JSON.stringify(settings), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }

            if (path === "/api/settings" && method === "PUT") {
                const settings = await request.json();
                await env.DATABASE.put("settings", JSON.stringify(settings));
                return new Response(JSON.stringify(settings), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }

            if (path === "/api/settings/group-reset" && method === "POST") {
                const settingsRaw = await env.DATABASE.get("settings");
                let settings = JSON.parse(settingsRaw || "{}");
                if (settings.groupReward) {
                    settings.groupReward.current = 0;
                    await env.DATABASE.put("settings", JSON.stringify(settings));
                }
                return new Response(JSON.stringify(settings), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }

            if (path === "/api/rewards" && method === "GET") {
                const rewardsRaw = await env.DATABASE.get("rewards");
                const rewards = rewardsRaw ? JSON.parse(rewardsRaw) : DEFAULT_REWARDS;
                return new Response(JSON.stringify(rewards), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }

            if (path === "/api/rewards" && method === "PUT") {
                const rewards = await request.json();
                // Sort by threshold automatically
                rewards.sort((a, b) => a.threshold - b.threshold);
                await env.DATABASE.put("rewards", JSON.stringify(rewards));
                return new Response(JSON.stringify(rewards), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }

            if (path === "/api/students" && method === "GET") {
                const studentsRaw = await env.DATABASE.get("students");
                const students = studentsRaw ? JSON.parse(studentsRaw) : [];
                return new Response(JSON.stringify(students), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }

            if (path.startsWith("/api/students/") && method === "GET") {
                const id = path.split("/").pop();
                const studentsRaw = await env.DATABASE.get("students");
                const students = JSON.parse(studentsRaw || "[]");
                const student = students.find(s => String(s.id) === String(id));

                if (!student) return new Response("Not Found", { status: 404, headers: corsHeaders });
                return new Response(JSON.stringify(student), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }

            if (path === "/api/students" && method === "POST") {
                const { name, birthday } = await request.json();
                const studentsRaw = await env.DATABASE.get("students");
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
                    redemptions: {} 
                };
                students.push(newStudent);
                await env.DATABASE.put("students", JSON.stringify(students));

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
                    const { stamps, avatar, badges, reason } = body;
                    const studentsRaw = await env.DATABASE.get("students");
                    let students = JSON.parse(studentsRaw || "[]");

                    const index = students.findIndex(s => String(s.id) === String(id));
                    if (index === -1) return new Response("Not Found", { status: 404, headers: corsHeaders });

                    // Migration / Initialization
                    if (students[index].avatar === undefined) students[index].avatar = null;
                    if (students[index].badges === undefined) students[index].badges = [];
                    if (students[index].history === undefined) students[index].history = [];

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
                    if (badges !== undefined) students[index].badges = badges;

                    await env.DATABASE.put("students", JSON.stringify(students));
                    return new Response(JSON.stringify(students[index]), {
                        headers: { ...corsHeaders, "Content-Type": "application/json" }
                    });
                }
            }

            // Handle Redeem Endpoints
            if (path.includes("/redeem") && (method === "POST" || method === "PATCH")) {
                const pathParts = path.split("/");
                const id = pathParts[3];
                const { threshold, status } = await request.json();
                const studentsRaw = await env.DATABASE.get("students");
                let students = JSON.parse(studentsRaw || "[]");

                const index = students.findIndex(s => String(s.id) === String(id));
                if (index === -1) return new Response("Not Found", { status: 404, headers: corsHeaders });

                if (!students[index].redemptions) students[index].redemptions = {};

                if (method === "POST") {
                    // Request a redemption (student)
                    students[index].redemptions[threshold] = "pending";

                    // TELEGRAM NOTIFICATION
                    const rewardsRaw = await env.DATABASE.get("rewards");
                    const rewards = rewardsRaw ? JSON.parse(rewardsRaw) : DEFAULT_REWARDS;
                    const reward = rewards.find(r => r.threshold === parseInt(threshold));
                    const rewardName = reward ? reward.title : `Belohnung (${threshold} Stempel)`;

                    await sendTelegramMessage(env, `🎁 NEUE ANFRAGE!\n\nSchüler: ${students[index].name}\nBelohnung: ${rewardName}\n\nBitte im Admin-Dashboard bestätigen.`);

                    // --- NEW: If reward title is "Filmtag", increment group progress automatically ---
                    if (rewardName.toLowerCase().includes("filmtag")) {
                        const settingsRaw = await env.DATABASE.get("settings");
                        let settings = JSON.parse(settingsRaw || "{}");
                        if (settings.groupReward) {
                            settings.groupReward.current = (settings.groupReward.current || 0) + parseInt(threshold);
                            await env.DATABASE.put("settings", JSON.stringify(settings));
                        }
                    }

                } else if (method === "PATCH") {
                    // Confirm a redemption (admin) — mark as completed so stamp card stays checked
                    students[index].redemptions[threshold] = "completed";

                    // Migration/Initialization for usedStamps
                    if (students[index].usedStamps === undefined) {
                        let sum = 0;
                        for (const [t, s] of Object.entries(students[index].redemptions)) {
                            if (s === "completed") sum += parseInt(t);
                        }
                        students[index].usedStamps = sum;
                    } else {
                        // Already initialized, just increment
                        students[index].usedStamps = students[index].usedStamps + parseInt(threshold);
                    }
                }

                await env.DATABASE.put("students", JSON.stringify(students));
                return new Response(JSON.stringify(students[index]), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" }
                });
            }

            // Handle Group Contribution
            if (path.includes("/group-contribute") && method === "POST") {
                const pathParts = path.split("/");
                const id = pathParts[3];
                const studentsRaw = await env.DATABASE.get("students");
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

                    if (freeStamps >= 1) {
                        // Deduct from student (increase usedStamps)
                        student.usedStamps = usedStamps + 1;
                        if (!student.history) student.history = [];
                        student.history.push({ date: new Date().toISOString().split('T')[0], reason: "Spende für Gruppen-Ziel" });
                        
                        // Increment settings
                        const settingsRaw = await env.DATABASE.get("settings");
                        let settings = JSON.parse(settingsRaw || "{}");
                        if (!settings.groupReward) settings.groupReward = { title: "Filmtag", target: 8, current: 0, icon: "🎬" };
                        settings.groupReward.current = (settings.groupReward.current || 0) + 1;
                        
                        await env.DATABASE.put("students", JSON.stringify(students));
                        await env.DATABASE.put("settings", JSON.stringify(settings));
                        
                        return new Response(JSON.stringify(student), {
                            headers: { ...corsHeaders, "Content-Type": "application/json" }
                        });
                    }
                    return new Response("Nicht genügend Stempel", { status: 400, headers: corsHeaders });
                }
                return new Response("Schüler nicht gefunden", { status: 404, headers: corsHeaders });
            }

            if (path.startsWith("/api/students/") && method === "DELETE") {
                const id = path.split("/").pop();
                const studentsRaw = await env.DATABASE.get("students");
                let students = JSON.parse(studentsRaw || "[]");

                students = students.filter(s => String(s.id) !== String(id));
                await env.DATABASE.put("students", JSON.stringify(students));
                return new Response(null, { status: 204, headers: corsHeaders });
            }

            return new Response("Not Found", { status: 404, headers: corsHeaders });
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
            const studentsRaw = await env.DATABASE.get("students");
            if (!studentsRaw) return;
            const students = JSON.parse(studentsRaw);

            const today = new Date();
            // Calculate start and end of the current week (Monday to Sunday)
            const day = today.getDay() || 7;
            const monday = new Date(today);
            monday.setDate(today.getDate() - day + 1);
            monday.setHours(0, 0, 0, 0);

            const sunday = new Date(monday);
            sunday.setDate(monday.getDate() + 6);
            sunday.setHours(23, 59, 59, 999);

            let birthdayKids = [];

            for (const s of students) {
                if (!s.birthday) continue;

                const parts = s.birthday.split('-');
                if (parts.length === 3) {
                    const bMonth = parseInt(parts[1], 10) - 1;
                    const bDay = parseInt(parts[2], 10);
                    const thisYearBday = new Date(today.getFullYear(), bMonth, bDay);

                    if (thisYearBday >= monday && thisYearBday <= sunday) {
                        birthdayKids.push(s.name);
                    }
                }
            }

            if (birthdayKids.length > 0) {
                const names = birthdayKids.join(", ");
                const message = `🎂 ACHTUNG! Diese Woche haben folgende Schüler Geburtstag:\n\n🎉 ${names}\n\nBitte nicht vergessen zu gratulieren!`;
                await sendTelegramMessage(env, message);
            }
        } catch (err) {
            console.error("Scheduled task error:", err);
        }
    }
};

async function sendTelegramMessage(env, text) {
    if (!env.TELEGRAM_TOKEN || !env.TELEGRAM_CHAT_ID) return false;
    try {
        const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: env.TELEGRAM_CHAT_ID,
                text: text
            })
        });
        return response.ok;
    } catch (err) {
        console.error("Telegram error:", err);
        return false;
    }
}

