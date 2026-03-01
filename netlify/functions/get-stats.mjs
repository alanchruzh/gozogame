import { getStore } from "@netlify/blobs";

export default async (req) => {
  const store = getStore({ name: "game-data", consistency: "strong" });

  // Get global stats
  const stats = await store.get("stats", { type: "json" });

  // Get leaderboard entries
  const leaderboard = await store.get("leaderboard", { type: "json" });

  const defaultStats = {
    players: 0,
    gamesPlayed: 0,
    gozoBurned: 0,
    topScore: 0,
  };

  return Response.json({
    stats: stats || defaultStats,
    leaderboard: leaderboard || [],
  });
};

export const config = {
  path: "/api/stats",
  method: "GET",
};
