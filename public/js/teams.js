let teamsData = [];
let updateIntervals = [];
let currentRound = null;
let teamCutoffs = {};

// Utility Functions
function formatDateTime(dateString) {
  return new Date(dateString).toLocaleString();
}

function getTimeRemaining(endTime) {
  const now = new Date();
  const end = new Date(endTime);
  const diff = end - now;

  if (diff <= 0) return "Ended";

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}h ${minutes}m`;
}

// Stats Update Functions
async function updateGameStats() {
  try {
    const response = await fetch("/api/stats/current");
    const data = await response.json();

    if (data.status === "no-game") {
      document.getElementById("game-stats-content").innerHTML =
        '<div class="no-game">No active game</div>';
      return;
    }

    const gameStatsHtml = `
      <div class="game-stats-grid">
        <div class="game-stat-item">
          <div class="stat-label">Game Status</div>
          <div class="stat-value">${data.game.status}</div>
        </div>
        <div class="game-stat-item">
          <div class="stat-label">Total Players</div>
          <div class="stat-value">${data.stats.totalUsers}</div>
        </div>
        <div class="game-stat-item">
          <div class="stat-label">Active Teams</div>
          <div class="stat-value">${data.stats.totalTeams}</div>
        </div>
        <div class="game-stat-item">
          <div class="stat-label">Total Posts</div>
          <div class="stat-value">${data.stats.totalPosts}</div>
        </div>
      </div>
    `;

    document.getElementById("game-stats-content").innerHTML = gameStatsHtml;

    // Update elimination stats if available
    if (data.rounds) {
      updateEliminationStats(data);
    }
  } catch (error) {
    console.error("Error updating game stats:", error);
  }
}

function updateEliminationStats(data) {
  const eliminationHtml = data.rounds
    .map(
      (round) => `
        <div class="elimination-round ${
          round.id === data.currentRound?.id ? "current" : ""
        }">
          <h4>Round ${round.id}</h4>
          <div>Eliminations: ${round.eliminationCount}</div>
          ${
            round.cutoffLikes
              ? `<div>Elimination Threshold: ${round.cutoffLikes} likes</div>`
              : ""
          }
          ${
            round.id === data.currentRound?.id && data.projectedThreshold
              ? `<div class="threshold-warning">
                  Projected Threshold: ${data.projectedThreshold} likes
                 </div>`
              : ""
          }
        </div>
      `,
    )
    .join("");

  document.getElementById("elimination-stats-content").innerHTML =
    eliminationHtml;
}

async function updateRoundStats() {
  const statsContainer = document.getElementById("round-stats-content");
  try {
    statsContainer.innerHTML = '<div class="loading">Updating stats...</div>';
    const response = await fetch("/api/rounds/status");
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const status = await response.json();

    if (!status) return;

    const statsHtml = `
      <div class="stats-grid">
        <div class="stat-item">
          <div class="stat-value">${status.stats.totalTeams}</div>
          <div class="stat-label">Active Teams</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${status.stats.totalUsers}</div>
          <div class="stat-label">Active Users</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${status.stats.totalPosts}</div>
          <div class="stat-label">Round Posts</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${status.stats.totalLikes}</div>
          <div class="stat-label">Round Likes</div>
        </div>
      </div>
      <div class="progress-bar">
        <div class="progress" style="width: ${status.progress}%"></div>
      </div>
    `;

    document.getElementById("round-stats-content").innerHTML = statsHtml;
  } catch (error) {
    console.error("Error updating round stats:", error);
  }
}

// Round Information Functions
function updateRoundInfo(round) {
  if (!round) {
    document.getElementById("round-number").textContent = "-";
    return;
  }

  currentRound = round;
  document.getElementById("round-number").textContent = round.id;
  document.getElementById("start-time").textContent = formatDateTime(
    round.startTime,
  );
  document.getElementById("end-time").textContent = formatDateTime(
    round.endTime,
  );
  document.getElementById("time-remaining").textContent = getTimeRemaining(
    round.endTime,
  );

  const statusElement = document.getElementById("round-status");
  statusElement.textContent = round.status.toUpperCase();
  statusElement.className = `round-status status-${round.status}`;
}

// Team Functions
async function loadTeamCutoffs(roundId) {
  try {
    const response = await fetch(`/api/rounds/${roundId}/cutoffs`);
    if (!response.ok) throw new Error(`Cutoffs API error: ${response.status}`);

    const cutoffs = await response.json();
    teamCutoffs = cutoffs.reduce((acc, curr) => {
      acc[curr.team] = curr.cutoffLikes;
      return acc;
    }, {});
  } catch (error) {
    console.error("Error loading team cutoffs:", error);
  }
}

async function getTeamEliminations(teamId) {
  try {
    const response = await fetch(`/api/teams/${teamId}/eliminations`);
    return await response.json();
  } catch (error) {
    console.error("Error fetching eliminations:", error);
    return [];
  }
}

function formatEliminationHistory(eliminations) {
  if (eliminations.length === 0) return "No eliminations";

  return eliminations
    .sort((a, b) => b.roundId - a.roundId)
    .map((e) => `Round ${e.roundId}: ${e.likeCount} likes`)
    .join("<br>");
}

async function displayTeams(teams) {
  const container = document.getElementById("teams-container");
  container.innerHTML = "";

  for (const team of teams) {
    const teamCard = document.createElement("div");
    teamCard.className = "team-card";

    const eliminations = await getTeamEliminations(team.id);
    const cutoffLikes = teamCutoffs[team.id];

    const survivalInfo =
      currentRound?.status === "active" && cutoffLikes
        ? `<div class="survival-threshold">
            Need ${cutoffLikes + 1}+ likes to survive this round
           </div>`
        : '<div class="survival-threshold">No eliminations yet this round</div>';

    teamCard.innerHTML = `
      <div class="team-id">Team ${team.id}</div>
      <div class="team-stats">
        <div>Members: ${team.memberCount}</div>
        ${survivalInfo}
      </div>
      <div class="elimination-history">
        ${formatEliminationHistory(eliminations)}
      </div>
    `;
    container.appendChild(teamCard);
  }
}

function sortTeams() {
  const sortType = document.getElementById("sort-select").value;
  const sortedTeams = [...teamsData];

  switch (sortType) {
    case "members":
      sortedTeams.sort((a, b) => b.memberCount - a.memberCount);
      break;
    case "cutoff":
      sortedTeams.sort(
        (a, b) => (teamCutoffs[b.id] || 0) - (teamCutoffs[a.id] || 0),
      );
      break;
    default:
      sortedTeams.sort((a, b) => a.id - b.id);
  }

  displayTeams(sortedTeams);
}

// Initial Load and Updates
async function loadData() {
  try {
    const [teamsResponse, roundResponse] = await Promise.all([
      fetch("/api/teams"),
      fetch("/api/rounds/current"),
    ]);

    teamsData = await teamsResponse.json();
    const round = await roundResponse.json();

    if (round) {
      await loadTeamCutoffs(round.id);
    }

    document.getElementById("loading").style.display = "none";
    updateRoundInfo(round);
    await displayTeams(teamsData);
    await updateGameStats();
  } catch (error) {
    console.error("Error loading data:", error);
    document.getElementById("loading").textContent =
      `Error loading data: ${error.message}`;
  }
}

// Update intervals
function startUpdateIntervals() {
  updateIntervals.push(
    setInterval(() => {
      if (currentRound) {
        document.getElementById("time-remaining").textContent =
          getTimeRemaining(currentRound.endTime);
      }
    }, 60000),
  );

  updateIntervals.push(
    setInterval(() => {
      updateRoundStats();
      updateGameStats();
    }, 60000),
  );
}

function cleanup() {
  updateIntervals.forEach(clearInterval);
  updateIntervals = [];
}

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  loadData();
  startUpdateIntervals();
});

window.addEventListener("unload", cleanup);
