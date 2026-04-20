import { sendMessage } from './utils.js';

// Add a new artist
export async function addArtist(env, artistName) {
  const db = env.DB;
  
  try {
    await db.prepare('INSERT INTO artists (name) VALUES (?)').bind(artistName).run();
    return true;
  } catch (error) {
    if (error.message.includes('UNIQUE')) {
      return false;
    }
    throw error;
  }
}

// List all artists
export async function listArtists(env, chatId) {
  const db = env.DB;
  const artists = await db.prepare('SELECT id, name FROM artists ORDER BY name').all();
  
  if (!artists.results || artists.results.length === 0) {
    await sendMessage(env, chatId, 'No artists yet. Use /addartist to add one.');
    return;
  }
  
  let message = '🎤 ARTISTS:\n\n';
  for (const artist of artists.results) {
    const trackCount = await db.prepare('SELECT COUNT(*) as count FROM tracks WHERE artist_id = ?').bind(artist.id).first();
    message += `• ${artist.name} (${trackCount?.count || 0} songs)\n`;
  }
  
  await sendMessage(env, chatId, message);
}

// Show statistics
export async function showStats(env, chatId) {
  const db = env.DB;
  
  const artistCount = await db.prepare('SELECT COUNT(*) as count FROM artists').first();
  const albumCount = await db.prepare('SELECT COUNT(*) as count FROM albums').first();
  const trackCount = await db.prepare('SELECT COUNT(*) as count FROM tracks').first();
  
  await sendMessage(env, chatId, `📊 STATISTICS\n\n🎤 Artists: ${artistCount?.count || 0}\n💿 Albums: ${albumCount?.count || 0}\n🎵 Tracks: ${trackCount?.count || 0}`);
}