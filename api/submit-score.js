const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function redis(command, ...args) {
  const res = await fetch(`${REDIS_URL}/${command}/${args.map(encodeURIComponent).join("/")}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  });
  const json = await res.json();
  return json.result;
}

async function redisSet(key, value) {
  const res = await fetch(`${REDIS_URL}/set/${encodeURIComponent(key)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(value),
  });
  return res.json();
}

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
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: "Invalid JSON" }); }
  }

  const { walletAddress, score, gozoBurned } = body;

  if (!walletAddress || typeof score !== "number") {
    return res.status(400).json({ error: "Missing walletAddress or score" });
  }

  const addr = walletAddress.toLowerCase();

  // --- Update global stats ---
  const stats = (await redisGet("stats")) || {
    players: 0,
    gamesPlayed: 0,
    gozoBurned: 0,
    topScore: 0,
  };

  // Track unique players
  const players = (await redisGet("players-set")) || [];
  if (!players.includes(addr)) {
    players.push(addr);
    await redisSet("players-set", JSON.stringify(players));
  }

  stats.players = players.length;
  stats.gamesPlayed += 1;
  stats.gozoBurned += typeof gozoBurned === "number" ? gozoBurned : 0;
  if (score > stats.topScore) stats.topScore = score;

  await redisSet("stats", JSON.stringify(stats));

  // --- Update leaderboard ---
  const leaderboard = (await redisGet("leaderboard")) || [];

  const existingIdx = leaderboard.findIndex(
    (e) => e.wallet.toLowerCase() === addr
  );

  if (existingIdx >= 0) {
    if (score > leaderboard[existingIdx].score) {
      leaderboard[existingIdx].score = score;
    }
    leaderboard[existingIdx].games = (leaderboard[existingIdx].games || 0) + 1;
  } else {
    leaderboard.push({ wallet: walletAddress, score, games: 1 });
  }

  leaderboard.sort((a, b) => b.score - a.score);
  const trimmedLeaderboard = leaderboard.slice(0, 50);

  await redisSet("leaderboard", JSON.stringify(trimmedLeaderboard));

  return res.status(200).json({ stats, leaderboard: trimmedLeaderboard });
}
