import { sendMessage } from './utils.js';

// Store pending album actions
const pendingAlbum = new Map();

export async function handleAlbumCommand(env, chatId, userId, text) {
  // Start add album
  if (text === '/addalbum') {
    const db = env.DB;
    const artists = await db.prepare('SELECT id, name FROM artists ORDER BY name').all();
    
    if (!artists.results || artists.results.length === 0) {
      await sendMessage(env, chatId, 'No artists found. Use /addartist first.');
      return;
    }
    
    let artistList = '🎤 SELECT ARTIST:\n\n';
    for (let i = 0; i < artists.results.length; i++) {
      artistList += `${i + 1}. ${artists.results[i].name}\n`;
    }
    
    pendingAlbum.set(userId, { step: 'waiting_artist', artists: artists.results });
    await sendMessage(env, chatId, artistList);
    return;
  }
  
  // Handle pending album creation
  if (pendingAlbum.has(userId)) {
    const action = pendingAlbum.get(userId);
    
    // Step: Waiting for artist selection
    if (action.step === 'waiting_artist') {
      const choice = parseInt(text);
      const artists = action.artists;
      
      if (isNaN(choice) || choice < 1 || choice > artists.length) {
        await sendMessage(env, chatId, `Send a number between 1 and ${artists.length}`);
        return;
      }
      
      const selectedArtist = artists[choice - 1];
      
      pendingAlbum.set(userId, {
        step: 'waiting_album_name',
        artistId: selectedArtist.id,
        artistName: selectedArtist.name
      });
      
      await sendMessage(env, chatId, `Selected: ${selectedArtist.name}\n\nSend me the ALBUM NAME:`);
      return;
    }
    
    // Step: Waiting for album name
    if (action.step === 'waiting_album_name') {
      const albumName = text.trim();
      
      if (!albumName) {
        await sendMessage(env, chatId, 'Send a valid album name.');
        return;
      }
      
      const db = env.DB;
      
      try {
        await db.prepare('INSERT INTO albums (name, artist_id) VALUES (?, ?)').bind(albumName, action.artistId).run();
        await sendMessage(env, chatId, `✅ Album "${albumName}" added to ${action.artistName}!`);
      } catch (error) {
        await sendMessage(env, chatId, `❌ Error: ${error.message}`);
      }
      
      pendingAlbum.delete(userId);
      return;
    }
  }
  
  return false;
}