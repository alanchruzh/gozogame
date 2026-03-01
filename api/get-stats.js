const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function redisGet(key) {
  const res = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  });
  const json = await res.json();
  if (!json.result) return null;
  try {
    return JSON.parse(json.result);
  } catch {
    return json.result;
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const stats = (await redisGet("stats")) || {
    players: 0,
    gamesPlayed: 0,
    gozoBurned: 0,
    topScore: 0,
  };

  const leaderboard = (await redisGet("leaderboard")) || [];

  return res.status(200).json({ stats, leaderboard });
}
