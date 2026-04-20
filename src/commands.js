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

// Add a new album
export async function addAlbum(env, albumName, artistId) {
  const db = env.DB;
  
  try {
    await db.prepare('INSERT INTO albums (name, artist_id) VALUES (?, ?)').bind(albumName, artistId).run();
    return true;
  } catch (error) {
    if (error.message.includes('UNIQUE')) {
      return false;
    }
    throw error;
  }
}

// Add a new track
export async function addTrack(env, fileId, title, artistId, albumId, duration) {
  const db = env.DB;
  
  try {
    await db.prepare(`
      INSERT INTO tracks (file_id, title, artist_id, album_id, duration)
      VALUES (?, ?, ?, ?, ?)
    `).bind(fileId, title, artistId, albumId || null, duration).run();
    return true;
  } catch (error) {
    console.error('Add track error:', error);
    return false;
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

// List albums for an artist
export async function listAlbums(env, chatId, artistId, artistName) {
  const db = env.DB;
  const albums = await db.prepare('SELECT id, name FROM albums WHERE artist_id = ? ORDER BY name').bind(artistId).all();
  
  if (!albums.results || albums.results.length === 0) {
    await sendMessage(env, chatId, `No albums found for ${artistName}. Use /addalbum to add one.`);
    return;
  }
  
  let message = `💿 ALBUMS by ${artistName}:\n\n`;
  for (const album of albums.results) {
    const trackCount = await db.prepare('SELECT COUNT(*) as count FROM tracks WHERE album_id = ?').bind(album.id).first();
    message += `• ${album.name} (${trackCount?.count || 0} tracks)\n`;
  }
  
  await sendMessage(env, chatId, message);
}

// Show statistics
export async function showStats(env, chatId) {
  const db = env.DB;
  
  const artistCount = await db.prepare('SELECT COUNT(*) as count FROM artists').first();
  const albumCount = await db.prepare('SELECT COUNT(*) as count FROM albums').first();
  const trackCount = await db.prepare('SELECT COUNT(*) as count FROM tracks').first();
  const userCount = await db.prepare('SELECT COUNT(*) as count FROM users').first();
  
  await sendMessage(env, chatId, `📊 STATISTICS\n\n🎤 Artists: ${artistCount?.count || 0}\n💿 Albums: ${albumCount?.count || 0}\n🎵 Tracks: ${trackCount?.count || 0}\n👥 Users: ${userCount?.count || 0}`);
}

// Get simple list of artists (for admin steps)
export async function getArtistsList(env) {
  const db = env.DB;
  const artists = await db.prepare('SELECT id, name FROM artists ORDER BY name').all();
  return artists.results || [];
}

// Get simple list of albums for an artist (for admin steps)
export async function getAlbumsList(env, artistId) {
  const db = env.DB;
  const albums = await db.prepare('SELECT id, name FROM albums WHERE artist_id = ? ORDER BY name').bind(artistId).all();
  return albums.results || [];
}