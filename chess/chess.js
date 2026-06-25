// Chess Tournament Controller for Stempelkarte System
const API_URL = "https://stempelkarte.sb-nmsstadt.workers.dev/api";
const PIN_SUPERVISOR = "1591";
const PIN_ADMIN = "8520";

let students = [];
let selectedPlayers = [];
let currentSettings = {};
let tournamentState = null;
let syncInterval = null;
let isEditingUnlocked = false;

document.addEventListener("DOMContentLoaded", async () => {
    checkAuthStatus();
    await loadInitialData();
    startSilentSync();

    // Event Listeners for Setup View
    document.getElementById("search-players")?.addEventListener("input", (e) => {
        renderPlayerSelection(e.target.value.toLowerCase());
    });
    
    document.getElementById("custom-player-add")?.addEventListener("click", addCustomPlayer);
    document.getElementById("custom-player-name")?.addEventListener("keypress", (e) => {
        if (e.key === "Enter") addCustomPlayer();
    });

    document.getElementById("start-tournament-btn")?.addEventListener("click", startTournament);
    document.getElementById("reset-tournament-btn")?.addEventListener("click", resetTournament);
    document.getElementById("unlock-edit-btn")?.addEventListener("click", toggleEditLock);
});

// Auth & Access Mode
function checkAuthStatus() {
    const adminAuth = sessionStorage.getItem("admin_auth");
    const supervisorAuth = sessionStorage.getItem("chess_supervisor_auth");
    if (adminAuth === PIN_ADMIN || supervisorAuth === PIN_SUPERVISOR) {
        isEditingUnlocked = true;
    }
    updateLockUI();
}

function updateLockUI() {
    const btn = document.getElementById("unlock-edit-btn");
    const statusLabel = document.getElementById("edit-status-label");
    if (!btn) return;

    if (isEditingUnlocked) {
        btn.classList.add("active");
        btn.innerHTML = "🔓 Bearbeitungs-Modus";
        if (statusLabel) statusLabel.innerText = "Modus: Betreuer (Aktiv)";
    } else {
        btn.classList.remove("active");
        btn.innerHTML = "🔒 Schreibgeschützt";
        if (statusLabel) statusLabel.innerText = "Modus: Schüler (Ansicht)";
    }

    // Toggle visibility of setup items and reset button
    const setupControls = document.getElementById("setup-controls");
    if (setupControls) {
        // We always show the select panels, but disable start button or editing action.
    }
    
    const resetBtns = [document.getElementById("reset-tournament-btn"), document.getElementById("podium-reset-btn")];
    resetBtns.forEach(btn => {
        if (btn) {
            if (isEditingUnlocked && tournamentState) {
                btn.classList.remove("hidden");
            } else {
                btn.classList.add("hidden");
            }
        }
    });

    // Re-render brackets to apply/remove hover effects and clickability
    if (tournamentState) {
        renderBracket();
    }
}

async function toggleEditLock() {
    if (isEditingUnlocked) {
        sessionStorage.removeItem("chess_supervisor_auth");
        isEditingUnlocked = false;
        updateLockUI();
    } else {
        const pin = prompt("Bitte Betreuer-PIN eingeben:");
        if (pin === PIN_SUPERVISOR || pin === PIN_ADMIN) {
            sessionStorage.setItem("chess_supervisor_auth", PIN_SUPERVISOR);
            isEditingUnlocked = true;
            updateLockUI();
            alert("Erfolgreich freigeschaltet!");
        } else if (pin !== null) {
            alert("Falsche PIN!");
        }
    }
}

// Initial Data Load
async function loadInitialData() {
    try {
        const [studResp, setResp] = await Promise.all([
            fetch(`${API_URL}/students`),
            fetch(`${API_URL}/settings`)
        ]);

        if (studResp.ok) {
            students = await studResp.json();
            // Sort alphabetically
            students.sort((a, b) => a.name.localeCompare(b.name));
        }

        if (setResp.ok) {
            currentSettings = await setResp.json();
            if (currentSettings.chessTournament) {
                tournamentState = currentSettings.chessTournament;
            }
        }

        renderView();
    } catch (err) {
        console.error("Initial load failed:", err);
    }
}

// Silent Sync every 10 seconds (only if visible and not typing)
function startSilentSync() {
    syncInterval = setInterval(async () => {
        if (document.hidden) return;
        
        // Skip sync if user is active in setup input
        const searchInput = document.getElementById("search-players");
        if (searchInput && document.activeElement === searchInput) return;
        const customInput = document.getElementById("custom-player-name");
        if (customInput && document.activeElement === customInput) return;

        try {
            const res = await fetch(`${API_URL}/settings`);
            if (res.ok) {
                const freshSettings = await res.json();
                
                // Check if tournament state changed on server
                const localStr = JSON.stringify(tournamentState);
                const serverStr = JSON.stringify(freshSettings.chessTournament || null);
                
                if (localStr !== serverStr) {
                    currentSettings = freshSettings;
                    tournamentState = freshSettings.chessTournament || null;
                    renderView();
                }
            }
        } catch (e) {
            console.warn("Silent sync failed:", e);
        }
    }, 10000);
}

// Route to appropriate UI View
function renderView() {
    const viewSetup = document.getElementById("view-setup");
    const viewBracket = document.getElementById("view-bracket");

    // Hide all
    viewSetup.classList.add("hidden");
    viewBracket.classList.add("hidden");

    if (!tournamentState || tournamentState.status === "setup") {
        viewSetup.classList.remove("hidden");
        renderPlayerSelection();
        renderSelectedPlayers();
    } else {
        // Status is active or finished
        viewBracket.classList.remove("hidden");
        renderBracket();
        
        // Show/hide podium container inside bracket view
        const podiumContainer = document.getElementById("bracket-podium-container");
        if (podiumContainer) {
            if (tournamentState.status === "finished") {
                podiumContainer.classList.remove("hidden");
                renderPodium();
            } else {
                podiumContainer.classList.add("hidden");
            }
        }
    }

    updateLockUI();
}

// SETUP VIEW: Render student lists
function renderPlayerSelection(filter = "") {
    const container = document.getElementById("available-players-list");
    if (!container) return;
    container.innerHTML = "";

    const filtered = filter 
        ? students.filter(s => s.name.toLowerCase().includes(filter))
        : students;

    filtered.forEach(s => {
        const isAdded = selectedPlayers.some(p => p.id === s.id);
        const card = document.createElement("div");
        card.className = `player-select-card ${isAdded ? 'selected' : ''}`;
        card.onclick = () => togglePlayerSelection(s);
        card.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px;">
                <span style="font-size:1.2rem;">${s.avatar || '♟'}</span>
                <span style="font-size:0.9rem; font-weight:600;">${s.name}</span>
            </div>
            <span style="font-weight:800; font-size:1rem; color:${isAdded ? 'var(--primary-light)' : 'rgba(255,255,255,0.2)'};">
                ${isAdded ? '✓' : '＋'}
            </span>
        `;
        container.appendChild(card);
    });
}

// Toggle selection
function togglePlayerSelection(student) {
    const idx = selectedPlayers.findIndex(p => p.id === student.id);
    if (idx > -1) {
        selectedPlayers.splice(idx, 1);
    } else {
        selectedPlayers.push({
            id: student.id,
            name: student.name,
            avatar: student.avatar || "♟"
        });
    }
    renderPlayerSelection(document.getElementById("search-players")?.value.toLowerCase());
    renderSelectedPlayers();
}

// Add custom guest player
function addCustomPlayer() {
    const input = document.getElementById("custom-player-name");
    const name = input.value.trim();
    if (!name) return;

    // Check duplicate
    if (selectedPlayers.some(p => p.name.toLowerCase() === name.toLowerCase())) {
        alert("Dieser Name ist bereits im Turnier.");
        return;
    }

    const customId = "custom-" + Date.now();
    const chessAvatars = ["♟", "♞", "♝", "♜", "♛", "♚", "🏆", "⚔"];
    const avatar = chessAvatars[Math.floor(Math.random() * chessAvatars.length)];

    selectedPlayers.push({
        id: customId,
        name: name,
        avatar: avatar
    });

    input.value = "";
    renderSelectedPlayers();
}

function removeSelectedPlayer(id) {
    selectedPlayers = selectedPlayers.filter(p => p.id !== id);
    renderPlayerSelection(document.getElementById("search-players")?.value.toLowerCase());
    renderSelectedPlayers();
}

function renderSelectedPlayers() {
    const container = document.getElementById("selected-players-list");
    const countBadge = document.getElementById("selected-count");
    if (!container) return;
    container.innerHTML = "";

    if (countBadge) countBadge.innerText = selectedPlayers.length;

    if (selectedPlayers.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:2rem; color:var(--text-muted); font-style:italic;">Noch keine Spieler ausgewählt.</div>`;
        return;
    }

    selectedPlayers.forEach(p => {
        const item = document.createElement("div");
        item.className = "selected-player-item";
        item.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px;">
                <span>${p.avatar}</span>
                <span style="font-weight:600; font-size:0.9rem;">${p.name}</span>
            </div>
            <button class="btn-remove-player" onclick="removeSelectedPlayer('${p.id}')">✕</button>
        `;
        container.appendChild(item);
    });
}

// Start Tournament & Generate Bracket
async function startTournament() {
    if (!isEditingUnlocked) {
        alert("Bitte schalte zuerst den Bearbeitungs-Modus freischalten (PIN erforderlich).");
        toggleEditLock();
        return;
    }

    if (selectedPlayers.length < 2) {
        alert("Bitte mindestens 2 Spieler auswählen!");
        return;
    }

    // Shuffle players to random seeding if checked; otherwise use the selection order
    const randomizeCheckbox = document.getElementById("randomize-seeding");
    const shouldRandomize = randomizeCheckbox ? randomizeCheckbox.checked : true;
    const players = shouldRandomize 
        ? [...selectedPlayers].sort(() => Math.random() - 0.5)
        : [...selectedPlayers];
    const N = players.length;

    // Determine rounds count R
    const R = Math.ceil(Math.log2(N));
    const M = Math.pow(2, R); // size of full bracket leaves

    const rounds = [];

    // Initialize the structure from Round 0 to Round R-1
    for (let r = 0; r < R; r++) {
        const numMatches = Math.pow(2, R - 1 - r);
        const roundMatches = [];
        for (let j = 0; j < numMatches; j++) {
            roundMatches.push({
                id: `match-${r}-${j}`,
                player1: null,
                player2: null,
                winner: null,
                score1: null,
                score2: null
            });
        }
        rounds.push(roundMatches);
    }

    // Populate Round 0
    let playerIdx = 0;
    const numMatchesRound0 = M / 2;
    for (let j = 0; j < numMatchesRound0; j++) {
        const match = rounds[0][j];
        if (playerIdx < N) {
            match.player1 = players[playerIdx++];
        }
        if (playerIdx < N) {
            match.player2 = players[playerIdx++];
        }
    }

    // Propagate byes (iterative upward advancement)
    propagateByesAndDownstream(rounds);

    tournamentState = {
        status: "active",
        players: players,
        rounds: rounds,
        thirdPlaceMatch: N >= 4 ? {
            id: "match-3rd",
            player1: null,
            player2: null,
            winner: null
        } : null,
        podium: {
            first: null,
            second: null,
            third: null
        }
    };

    await saveStateToServer();
    renderView();
}

// Bye Propagation Helper
function propagateByesAndDownstream(rounds) {
    const numRounds = rounds.length;

    for (let r = 0; r < numRounds; r++) {
        const currentRound = rounds[r];
        const nextRound = rounds[r + 1]; // Undefined for Final (r = R-1)

        for (let j = 0; j < currentRound.length; j++) {
            const match = currentRound[j];

            // A bye match has only 1 player and no winner declared yet
            if (match.player1 && !match.player2 && !match.winner) {
                match.winner = match.player1;
            }

            // Propagate winner to next round
            if (match.winner && nextRound) {
                const nextMatchIdx = Math.floor(j / 2);
                const nextMatch = nextRound[nextMatchIdx];

                if (j % 2 === 0) {
                    nextMatch.player1 = match.winner;
                } else {
                    nextMatch.player2 = match.winner;
                }
            }
        }
    }
}

// Cascading winner propagation and clearing downstream matches if changed
function setMatchWinner(roundIdx, matchIdx, winnerNum) {
    if (!isEditingUnlocked) return;

    const round = tournamentState.rounds[roundIdx];
    const match = round[matchIdx];

    const player = winnerNum === 1 ? match.player1 : match.player2;
    if (!player) return; // Empty slot clicked

    // Check if clicked player is already the winner (Toggle Off/Undo)
    if (match.winner && match.winner.id === player.id) {
        match.winner = null;
    } else {
        match.winner = player;
    }

    // Recalculate everything downstream from this match
    recalculateDownstream(roundIdx, matchIdx);
    saveStateToServer();
    renderView();
}

function recalculateDownstream(startRoundIdx, startMatchIdx) {
    const rounds = tournamentState.rounds;
    const numRounds = rounds.length;

    // Clear and propagate starting from the next round
    let currentMatchesToUpdate = [{ r: startRoundIdx, j: startMatchIdx }];

    while (currentMatchesToUpdate.length > 0) {
        const nextUpdates = [];
        
        currentMatchesToUpdate.forEach(({ r, j }) => {
            const currentMatch = rounds[r][j];
            const nextRoundIdx = r + 1;
            
            if (nextRoundIdx < numRounds) {
                const nextMatchIdx = Math.floor(j / 2);
                const nextMatch = rounds[nextRoundIdx][nextMatchIdx];
                const isSlot1 = (j % 2 === 0);

                // If current match has a winner, update next match slot. Else clear it.
                const expectedPlayer = currentMatch.winner || null;
                const existingPlayer = isSlot1 ? nextMatch.player1 : nextMatch.player2;

                if (JSON.stringify(existingPlayer) !== JSON.stringify(expectedPlayer)) {
                    // Update slot
                    if (isSlot1) {
                        nextMatch.player1 = expectedPlayer;
                    } else {
                        nextMatch.player2 = expectedPlayer;
                    }

                    // If existing player was previously a winner, clear that winner since player changed
                    if (nextMatch.winner && (!expectedPlayer || nextMatch.winner.id !== expectedPlayer.id)) {
                        nextMatch.winner = null;
                    }

                    // Schedule next match for downstream update
                    nextUpdates.push({ r: nextRoundIdx, j: nextMatchIdx });
                }
            } else {
                // Final match reached (r === R-1)
                // If final match has winner/loser, update 1st and 2nd podium spots
                if (currentMatch.winner) {
                    tournamentState.podium.first = currentMatch.winner;
                    tournamentState.podium.second = (currentMatch.winner.id === currentMatch.player1.id) ? currentMatch.player2 : currentMatch.player1;
                } else {
                    tournamentState.podium.first = null;
                    tournamentState.podium.second = null;
                }
            }
        });

        currentMatchesToUpdate = nextUpdates;
    }

    // Handle Third Place Play-off (Spiel um Platz 3)
    if (numRounds >= 2 && tournamentState.thirdPlaceMatch) {
        const semiRoundIdx = numRounds - 2;
        const semiMatches = rounds[semiRoundIdx];
        
        // Semi match 0 loser
        let loser0 = null;
        if (semiMatches[0].winner && semiMatches[0].player1 && semiMatches[0].player2) {
            loser0 = (semiMatches[0].winner.id === semiMatches[0].player1.id) ? semiMatches[0].player2 : semiMatches[0].player1;
        }
        
        // Semi match 1 loser
        let loser1 = null;
        if (semiMatches[1].winner && semiMatches[1].player1 && semiMatches[1].player2) {
            loser1 = (semiMatches[1].winner.id === semiMatches[1].player1.id) ? semiMatches[1].player2 : semiMatches[1].player1;
        }

        const tpm = tournamentState.thirdPlaceMatch;
        
        // Update 3rd place play-off players
        if (JSON.stringify(tpm.player1) !== JSON.stringify(loser0)) {
            tpm.player1 = loser0;
            tpm.winner = null;
        }
        if (JSON.stringify(tpm.player2) !== JSON.stringify(loser1)) {
            tpm.player2 = loser1;
            tpm.winner = null;
        }

        if (tpm.winner) {
            tournamentState.podium.third = tpm.winner;
        } else {
            // Fallback for 3 players (where semi loser is automatic 3rd place)
            if (tournamentState.players.length === 3) {
                tournamentState.podium.third = loser0;
            } else {
                tournamentState.podium.third = null;
            }
        }
    } else if (tournamentState.players.length === 3) {
        // Special case: 3 players
        const semiMatch = rounds[0][0];
        if (semiMatch.winner && semiMatch.player1 && semiMatch.player2) {
            tournamentState.podium.third = (semiMatch.winner.id === semiMatch.player1.id) ? semiMatch.player2 : semiMatch.player1;
        } else {
            tournamentState.podium.third = null;
        }
    }

    checkTournamentCompletion();
}

function setThirdPlaceWinner(winnerNum) {
    if (!isEditingUnlocked || !tournamentState.thirdPlaceMatch) return;
    
    const tpm = tournamentState.thirdPlaceMatch;
    const player = winnerNum === 1 ? tpm.player1 : tpm.player2;
    if (!player) return;

    if (tpm.winner && tpm.winner.id === player.id) {
        tpm.winner = null;
        tournamentState.podium.third = null;
    } else {
        tpm.winner = player;
        tournamentState.podium.third = player;
    }

    checkTournamentCompletion();
    saveStateToServer();
    renderView();
}

function checkTournamentCompletion() {
    const finalMatch = tournamentState.rounds[tournamentState.rounds.length - 1][0];
    const hasFinalWinner = finalMatch.winner !== null;
    
    let hasThirdPlaceWinner = true;
    if (tournamentState.thirdPlaceMatch && tournamentState.players.length >= 4) {
        hasThirdPlaceWinner = tournamentState.thirdPlaceMatch.winner !== null;
    }

    if (hasFinalWinner && hasThirdPlaceWinner) {
        tournamentState.status = "finished";
        setTimeout(() => {
            fireConfettiAnimation();
        }, 300);
    }
}

// BRACKET VIEW: Rendering
function renderBracket() {
    const container = document.getElementById("bracket-columns-container");
    if (!container) return;
    container.innerHTML = "";

    const rounds = tournamentState.rounds;
    const R = rounds.length;

    // Create column for each round
    for (let r = 0; r < R; r++) {
        const col = document.createElement("div");
        col.className = "round-column";
        
        // Round header
        const header = document.createElement("div");
        header.className = "round-header";
        
        let roundName = `Runde ${r + 1}`;
        if (r === R - 1) roundName = "Finale";
        else if (r === R - 2) roundName = "Halbfinale";
        else if (r === R - 3) roundName = "Viertelfinale";
        
        header.innerText = roundName;
        col.appendChild(header);

        // Add matches
        const matches = rounds[r];
        matches.forEach((match, mIdx) => {
            const card = document.createElement("div");
            
            // Check if active
            const isReady = match.player1 !== null && match.player2 !== null;
            const hasWinner = match.winner !== null;
            const cardClass = `match-card ${isReady ? 'active-match' : ''} ${isEditingUnlocked && isReady ? 'editable-match' : ''} ${hasWinner ? 'has-winner' : ''}`;
            card.className = cardClass;

            const p1Winner = match.winner && match.player1 && match.winner.id === match.player1.id;
            const p2Winner = match.winner && match.player2 && match.winner.id === match.player2.id;
            
            card.innerHTML = `
                <div class="match-info-tag">
                    <span>Spiel ${mIdx + 1}</span>
                    <span>${match.player2 === null && match.player1 ? 'Freilos ⭐️' : ''}</span>
                </div>
                
                <!-- Player 1 -->
                <div class="match-player-row ${p1Winner ? 'winner' : ''} ${hasWinner && !p1Winner ? 'loser' : ''} ${!match.player1 ? 'bye-row' : ''}" 
                     onclick="${isEditingUnlocked && isReady ? `setMatchWinner(${r}, ${mIdx}, 1)` : ''}">
                     <div class="avatar-mini">${match.player1 ? match.player1.avatar : '♟'}</div>
                     <div class="player-name">${match.player1 ? match.player1.name : 'Offen'}</div>
                     ${p1Winner ? '<span class="winner-check">✓</span>' : ''}
                </div>
                
                <div class="match-divider"></div>
                
                <!-- Player 2 -->
                <div class="match-player-row ${p2Winner ? 'winner' : ''} ${hasWinner && !p2Winner ? 'loser' : ''} ${!match.player2 ? 'bye-row' : ''}"
                     onclick="${isEditingUnlocked && isReady ? `setMatchWinner(${r}, ${mIdx}, 2)` : ''}">
                     <div class="avatar-mini">${match.player2 ? match.player2.avatar : '♟'}</div>
                     <div class="player-name">${match.player2 ? (match.player2.name) : (match.player1 ? 'Freilos' : 'Offen')}</div>
                     ${p2Winner ? '<span class="winner-check">✓</span>' : ''}
                </div>
            `;
            col.appendChild(card);
        });

        container.appendChild(col);
    }

    // Render Consolation Area (Spiel um Platz 3)
    const consolationContainer = document.getElementById("consolation-match-container");
    if (consolationContainer) {
        consolationContainer.innerHTML = "";
        
        if (tournamentState.thirdPlaceMatch && tournamentState.players.length >= 4) {
            const tpm = tournamentState.thirdPlaceMatch;
            const isReady = tpm.player1 !== null && tpm.player2 !== null;
            const p1Winner = tpm.winner && tpm.player1 && tpm.winner.id === tpm.player1.id;
            const p2Winner = tpm.winner && tpm.player2 && tpm.winner.id === tpm.player2.id;
            const hasWinner = tpm.winner !== null;

            const card = document.createElement("div");
            card.className = `match-card ${isReady ? 'active-match' : ''} ${isEditingUnlocked && isReady ? 'editable-match' : ''} ${hasWinner ? 'has-winner' : ''}`;
            card.style.width = "280px";
            card.innerHTML = `
                <div class="match-info-tag">
                    <span>Spiel um Platz 3 🥉</span>
                </div>
                
                <!-- Player 1 -->
                <div class="match-player-row ${p1Winner ? 'winner' : ''} ${hasWinner && !p1Winner ? 'loser' : ''} ${!tpm.player1 ? 'bye-row' : ''}" 
                     onclick="${isEditingUnlocked && isReady ? `setThirdPlaceWinner(1)` : ''}">
                    <div class="avatar-mini">${tpm.player1 ? tpm.player1.avatar : '♟'}</div>
                    <div class="player-name">${tpm.player1 ? tpm.player1.name : 'Warten auf Verlierer Halbfinale 1'}</div>
                    ${p1Winner ? '<span class="winner-check">✓</span>' : ''}
                </div>
                
                <div class="match-divider"></div>
                
                <!-- Player 2 -->
                <div class="match-player-row ${p2Winner ? 'winner' : ''} ${hasWinner && !p2Winner ? 'loser' : ''} ${!tpm.player2 ? 'bye-row' : ''}"
                     onclick="${isEditingUnlocked && isReady ? `setThirdPlaceWinner(2)` : ''}">
                    <div class="avatar-mini">${tpm.player2 ? tpm.player2.avatar : '♟'}</div>
                    <div class="player-name">${tpm.player2 ? tpm.player2.name : 'Warten auf Verlierer Halbfinale 2'}</div>
                    ${p2Winner ? '<span class="winner-check">✓</span>' : ''}
                </div>
            `;
            
            const area = document.createElement("div");
            area.className = "consolation-area";
            area.innerHTML = `<h3 style="font-size:0.9rem; font-weight:800; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em; margin:0;">Kleines Finale</h3>`;
            area.appendChild(card);
            consolationContainer.appendChild(area);
        }
    }
}

// FINISHED VIEW: Render Podium
function renderPodium() {
    const p1 = tournamentState.podium.first;
    const p2 = tournamentState.podium.second;
    const p3 = tournamentState.podium.third;

    document.getElementById("winner-name-1").innerText = p1 ? p1.name : "Unbekannt";
    document.getElementById("winner-avatar-1").innerText = p1 ? p1.avatar : "🥇";

    document.getElementById("winner-name-2").innerText = p2 ? p2.name : "Unbekannt";
    document.getElementById("winner-avatar-2").innerText = p2 ? p2.avatar : "🥈";

    const p3Container = document.getElementById("podium-step-3");
    if (p3 && p3Container) {
        p3Container.style.display = "flex";
        document.getElementById("winner-name-3").innerText = p3.name;
        document.getElementById("winner-avatar-3").innerText = p3.avatar;
    } else if (p3Container) {
        p3Container.style.display = "none";
    }
}

// Reset Tournament
async function resetTournament() {
    if (!isEditingUnlocked) {
        alert("Schalte den Bearbeitungs-Modus freischalten, um das Turnier zurückzusetzen.");
        toggleEditLock();
        return;
    }

    if (!confirm("Bist du sicher, dass du das aktuelle Turnier löschen und ein neues starten möchtest? Alle Runden werden gelöscht!")) {
        return;
    }

    tournamentState = null;
    selectedPlayers = [];
    
    await saveStateToServer();
    renderView();
}

// Server API Sync
async function saveStateToServer() {
    try {
        const payload = {
            ...currentSettings,
            chessTournament: tournamentState
        };

        const res = await fetch(`${API_URL}/settings`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            currentSettings = payload;
        } else {
            console.error("Failed to save tournament state to worker database.");
        }
    } catch (err) {
        console.error("Connection error while saving tournament state:", err);
    }
}

// Confetti triggers
function fireConfettiAnimation() {
    if (typeof confetti === "function") {
        confetti({
            particleCount: 150,
            spread: 80,
            origin: { y: 0.6 }
        });
        
        // Extra fireworks effect
        let duration = 3 * 1000;
        let end = Date.now() + duration;

        (function frame() {
            confetti({
                particleCount: 5,
                angle: 60,
                spread: 55,
                origin: { x: 0 }
            });
            confetti({
                particleCount: 5,
                angle: 120,
                spread: 55,
                origin: { x: 1 }
            });

            if (Date.now() < end) {
                requestAnimationFrame(frame);
            }
        }());
    }
}
