import { getStore } from "@netlify/blobs";

export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { walletAddress, score, gozoBurned } = body;

  if (!walletAddress || typeof score !== "number") {
    return new Response("Missing walletAddress or score", { status: 400 });
  }

  const store = getStore({ name: "game-data", consistency: "strong" });

  // --- Update global stats ---
  const currentStats = await store.get("stats", { type: "json" });
  const stats = currentStats || {
    players: 0,
    gamesPlayed: 0,
    gozoBurned: 0,
    topScore: 0,
  };

  // Track unique players
  const playersSet = await store.get("players-set", { type: "json" });
  const players = playersSet || [];
  const addr = walletAddress.toLowerCase();
  if (!players.includes(addr)) {
    players.push(addr);
    await store.setJSON("players-set", players);
  }

  stats.players = players.length;
  stats.gamesPlayed += 1;
  stats.gozoBurned += typeof gozoBurned === "number" ? gozoBurned : 0;
  if (score > stats.topScore) {
    stats.topScore = score;
  }

  await store.setJSON("stats", stats);

  // --- Update leaderboard ---
  const currentLeaderboard = await store.get("leaderboard", { type: "json" });
  const leaderboard = currentLeaderboard || [];

  // Find existing entry for this wallet
  const existingIdx = leaderboard.findIndex(
    (e) => e.wallet.toLowerCase() === addr
  );

  if (existingIdx >= 0) {
    // Update only if new score is higher
    if (score > leaderboard[existingIdx].score) {
      leaderboard[existingIdx].score = score;
    }
    leaderboard[existingIdx].games =
      (leaderboard[existingIdx].games || 0) + 1;
  } else {
    leaderboard.push({
      wallet: walletAddress,
      score: score,
      games: 1,
    });
  }

  // Sort by score descending, keep top 50
  leaderboard.sort((a, b) => b.score - a.score);
  const trimmedLeaderboard = leaderboard.slice(0, 50);

  await store.setJSON("leaderboard", trimmedLeaderboard);

  return Response.json({
    stats,
    leaderboard: trimmedLeaderboard,
  });
};

export const config = {
  path: "/api/submit-score",
  method: "POST",
};
