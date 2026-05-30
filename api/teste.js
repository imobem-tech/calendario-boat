export default async function handler(req, res) {
  const { Client } = require('pg');

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();

    const result = await client.query(
      'SELECT * FROM "P_BOAT_z_10_Saida_Emb" LIMIT 5'
    );

    await client.end();

    res.status(200).json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
