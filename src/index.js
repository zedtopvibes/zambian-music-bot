// Single file bot - Zambian Music Updates with Metadata Extraction & Bulk Upload
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    if (path === '/') {
      return new Response('✅ Zambian Music Bot is running!', {
        headers: { 'Content-Type': 'text/plain' }
      });
    }
    
    if (path === '/webhook' && request.method === 'POST') {
      const update = await request.json();
      await handleUpdate(update, env);
      return new Response('OK');
    }
    
    if (path === '/setup') {
      const webhookUrl = `https://${url.hostname}/webhook`;
      const token = env.TELEGRAM_BOT_TOKEN;
      
      const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: webhookUrl })
      });
      
      const result = await response.json();
      return new Response(JSON.stringify(result, null, 2), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response('Not found', { status: 404 });
  }
};

// Store pending actions
const pending = new Map();

async function handleUpdate(update, env) {
  if (!update.message) return;
  
  const msg = update.message;
  const chatId = msg.chat.id;
  const text = msg.text || '';
  const userId = msg.from.id.toString();
  
  // Check admin
  const adminIds = env.ADMIN_IDS ? env.ADMIN_IDS.split(',') : [];
  const isAdmin = adminIds.includes(userId);
  
  if (!isAdmin) {
    await sendMessage(env, chatId, 'You are not authorized to use this bot.');
    return;
  }
  
  // Handle /start
  if (text === '/start') {
    await sendMessage(env, chatId, '🎵 Admin Menu\n\n/addartist - Add artist\n/addalbum - Add album\n/addtrack - Add single track\n/multitrack - Bulk upload multiple tracks\n/listartists - Show artists\n/listalbums - Show albums\n/stats - Statistics\n/cancel - Cancel operation');
    return;
  }
  
  // Handle /addartist
  if (text === '/addartist') {
    pending.set(userId, { step: 'artist_name' });
    await sendMessage(env, chatId, 'Send me the ARTIST NAME:');
    return;
  }
  
  // Handle /addalbum
  if (text === '/addalbum') {
    const db = env.DB;
    const artists = await db.prepare('SELECT id, name FROM artists ORDER BY name').all();
    
    if (!artists.results || artists.results.length === 0) {
      await sendMessage(env, chatId, 'No artists. Use /addartist first.');
      return;
    }
    
    let list = 'Select artist by number:\n\n';
    for (let i = 0; i < artists.results.length; i++) {
      list += `${i + 1}. ${artists.results[i].name}\n`;
    }
    
    pending.set(userId, { 
      step: 'album_artist', 
      artists: artists.results 
    });
    await sendMessage(env, chatId, list);
    return;
  }
  
  // Handle /addtrack
  if (text === '/addtrack') {
    const db = env.DB;
    const artists = await db.prepare('SELECT id, name FROM artists ORDER BY name').all();
    
    if (!artists.results || artists.results.length === 0) {
      await sendMessage(env, chatId, 'No artists. Use /addartist first.');
      return;
    }
    
    let list = 'Select artist by number:\n\n';
    for (let i = 0; i < artists.results.length; i++) {
      list += `${i + 1}. ${artists.results[i].name}\n`;
    }
    
    pending.set(userId, { 
      step: 'track_artist', 
      artists: artists.results 
    });
    await sendMessage(env, chatId, list);
    return;
  }
  
  // Handle /multitrack - Bulk upload multiple files
  if (text === '/multitrack') {
    const db = env.DB;
    const artists = await db.prepare('SELECT id, name FROM artists ORDER BY name').all();
    
    if (!artists.results || artists.results.length === 0) {
      await sendMessage(env, chatId, 'No artists. Use /addartist first.');
      return;
    }
    
    let list = 'Select artist by number:\n\n';
    for (let i = 0; i < artists.results.length; i++) {
      list += `${i + 1}. ${artists.results[i].name}\n`;
    }
    
    pending.set(userId, { 
      step: 'multitrack_artist', 
      artists: artists.results,
      tracks: []
    });
    await sendMessage(env, chatId, list);
    return;
  }
  
  // Handle /listartists
  if (text === '/listartists') {
    const db = env.DB;
    const artists = await db.prepare('SELECT id, name FROM artists ORDER BY name').all();
    
    if (!artists.results || artists.results.length === 0) {
      await sendMessage(env, chatId, 'No artists yet.');
      return;
    }
    
    let list = '🎤 ARTISTS:\n\n';
    for (const artist of artists.results) {
      const trackCount = await db.prepare('SELECT COUNT(*) as count FROM tracks WHERE artist_id = ?').bind(artist.id).first();
      list += `• ${artist.name} (${trackCount?.count || 0} songs)\n`;
    }
    await sendMessage(env, chatId, list);
    return;
  }
  
  // Handle /listalbums
  if (text === '/listalbums') {
    const db = env.DB;
    const albums = await db.prepare(`
      SELECT albums.id, albums.name, artists.name as artist_name 
      FROM albums 
      JOIN artists ON albums.artist_id = artists.id 
      ORDER BY artists.name, albums.name
    `).all();
    
    if (!albums.results || albums.results.length === 0) {
      await sendMessage(env, chatId, 'No albums yet.');
      return;
    }
    
    let list = '💿 ALBUMS:\n\n';
    for (const album of albums.results) {
      const trackCount = await db.prepare('SELECT COUNT(*) as count FROM tracks WHERE album_id = ?').bind(album.id).first();
      list += `• ${album.artist_name} - ${album.name} (${trackCount?.count || 0} tracks)\n`;
    }
    await sendMessage(env, chatId, list);
    return;
  }
  
  // Handle /stats
  if (text === '/stats') {
    const db = env.DB;
    
    const artistCount = await db.prepare('SELECT COUNT(*) as count FROM artists').first();
    const albumCount = await db.prepare('SELECT COUNT(*) as count FROM albums').first();
    const trackCount = await db.prepare('SELECT COUNT(*) as count FROM tracks').first();
    
    await sendMessage(env, chatId, `📊 STATISTICS\n\n🎤 Artists: ${artistCount?.count || 0}\n💿 Albums: ${albumCount?.count || 0}\n🎵 Tracks: ${trackCount?.count || 0}`);
    return;
  }
  
  // Handle /cancel
  if (text === '/cancel') {
    pending.delete(userId);
    await sendMessage(env, chatId, 'Operation cancelled.');
    return;
  }
  
  // Handle pending steps
  if (pending.has(userId)) {
    const action = pending.get(userId);
    
    // ========== ADD ARTIST ==========
    if (action.step === 'artist_name') {
      const artistName = text.trim();
      const db = env.DB;
      
      try {
        await db.prepare('INSERT INTO artists (name) VALUES (?)').bind(artistName).run();
        await sendMessage(env, chatId, `✅ Artist "${artistName}" added!`);
      } catch (error) {
        await sendMessage(env, chatId, `❌ Error: ${error.message}`);
      }
      
      pending.delete(userId);
      return;
    }
    
    // ========== ADD ALBUM ==========
    if (action.step === 'album_artist') {
      const choice = parseInt(text);
      const artists = action.artists;
      
      if (isNaN(choice) || choice < 1 || choice > artists.length) {
        await sendMessage(env, chatId, `Send number between 1 and ${artists.length}`);
        return;
      }
      
      const selected = artists[choice - 1];
      
      pending.set(userId, {
        step: 'album_name',
        artistId: selected.id,
        artistName: selected.name
      });
      
      await sendMessage(env, chatId, `Selected: ${selected.name}\n\nSend ALBUM NAME:`);
      return;
    }
    
    if (action.step === 'album_name') {
      const albumName = text.trim();
      const db = env.DB;
      
      try {
        await db.prepare('INSERT INTO albums (name, artist_id) VALUES (?, ?)').bind(albumName, action.artistId).run();
        await sendMessage(env, chatId, `✅ Album "${albumName}" added to ${action.artistName}!`);
      } catch (error) {
        await sendMessage(env, chatId, `❌ Error: ${error.message}`);
      }
      
      pending.delete(userId);
      return;
    }
    
    // ========== ADD TRACK (SINGLE) ==========
    if (action.step === 'track_artist') {
      const choice = parseInt(text);
      const artists = action.artists;
      
      if (isNaN(choice) || choice < 1 || choice > artists.length) {
        await sendMessage(env, chatId, `Send number between 1 and ${artists.length}`);
        return;
      }
      
      const selected = artists[choice - 1];
      
      const db = env.DB;
      const albums = await db.prepare('SELECT id, name FROM albums WHERE artist_id = ? ORDER BY name').bind(selected.id).all();
      
      pending.set(userId, {
        step: 'track_album',
        artistId: selected.id,
        artistName: selected.name,
        albums: albums.results || []
      });
      
      if (albums.results && albums.results.length > 0) {
        let albumList = 'Select album (or send "none"):\n\n';
        for (let i = 0; i < albums.results.length; i++) {
          albumList += `${i + 1}. ${albums.results[i].name}\n`;
        }
        albumList += '\nSend "none" for no album';
        await sendMessage(env, chatId, albumList);
      } else {
        await sendMessage(env, chatId, 'No albums found. Send "none" to continue without album.');
      }
      return;
    }
    
    if (action.step === 'track_album') {
      const input = text.trim().toLowerCase();
      let albumId = null;
      
      if (input !== 'none') {
        const choice = parseInt(input);
        const albums = action.albums;
        
        if (isNaN(choice) || choice < 1 || choice > albums.length) {
          await sendMessage(env, chatId, `Send number between 1 and ${albums.length}, or "none"`);
          return;
        }
        
        albumId = albums[choice - 1].id;
        await sendMessage(env, chatId, `Selected album: ${albums[choice - 1].name}`);
      } else {
        await sendMessage(env, chatId, 'No album selected.');
      }
      
      pending.set(userId, {
        step: 'track_title',
        artistId: action.artistId,
        artistName: action.artistName,
        albumId: albumId
      });
      
      await sendMessage(env, chatId, 'Send me the SONG TITLE (or send audio file directly):');
      return;
    }
    
    if (action.step === 'track_title') {
      if (msg.audio) {
        await processAudioFile(msg, env, chatId, userId, {
          artistId: action.artistId,
          artistName: action.artistName,
          albumId: action.albumId,
          trackTitle: text.trim() || null
        });
        return;
      }
      
      const trackTitle = text.trim();
      
      if (!trackTitle) {
        await sendMessage(env, chatId, 'Send a valid song title or send audio file directly.');
        return;
      }
      
      pending.set(userId, {
        step: 'track_audio',
        artistId: action.artistId,
        artistName: action.artistName,
        albumId: action.albumId,
        trackTitle: trackTitle
      });
      
      await sendMessage(env, chatId, `Title: "${trackTitle}"\n\nNow send me the AUDIO FILE (MP3):`);
      return;
    }
    
    if (action.step === 'track_audio') {
      await processAudioFile(msg, env, chatId, userId, action);
      return;
    }
    
    // ========== MULTI TRACK BULK UPLOAD ==========
    if (action.step === 'multitrack_artist') {
      const choice = parseInt(text);
      const artists = action.artists;
      
      if (isNaN(choice) || choice < 1 || choice > artists.length) {
        await sendMessage(env, chatId, `Send number between 1 and ${artists.length}`);
        return;
      }
      
      const selected = artists[choice - 1];
      
      const db = env.DB;
      const albums = await db.prepare('SELECT id, name FROM albums WHERE artist_id = ? ORDER BY name').bind(selected.id).all();
      
      pending.set(userId, {
        step: 'multitrack_album',
        artistId: selected.id,
        artistName: selected.name,
        albums: albums.results || [],
        tracks: []
      });
      
      let albumList = 'Select album (or send "new" to create one):\n\n';
      for (let i = 0; i < albums.results.length; i++) {
        albumList += `${i + 1}. ${albums.results[i].name}\n`;
      }
      albumList += '\nSend "new" to create a new album\nSend "cancel" to stop';
      
      await sendMessage(env, chatId, albumList);
      return;
    }
    
    if (action.step === 'multitrack_album') {
      const input = text.trim().toLowerCase();
      
      if (input === 'cancel') {
        pending.delete(userId);
        await sendMessage(env, chatId, 'Bulk upload cancelled.');
        return;
      }
      
      let albumId = null;
      let albumName = null;
      
      if (input === 'new') {
        pending.set(userId, {
          step: 'multitrack_new_album',
          artistId: action.artistId,
          artistName: action.artistName,
          tracks: []
        });
        await sendMessage(env, chatId, 'Send me the NEW ALBUM NAME:');
        return;
      }
      
      const choice = parseInt(input);
      const albums = action.albums;
      
      if (isNaN(choice) || choice < 1 || choice > albums.length) {
        await sendMessage(env, chatId, `Send number between 1 and ${albums.length}, "new", or "cancel"`);
        return;
      }
      
      albumId = albums[choice - 1].id;
      albumName = albums[choice - 1].name;
      
      pending.set(userId, {
        step: 'multitrack_upload',
        artistId: action.artistId,
        artistName: action.artistName,
        albumId: albumId,
        albumName: albumName,
        tracks: []
      });
      
      await sendMessage(env, chatId, `📀 Album: ${albumName}\n\nNow send me ALL audio files for this album.\nYou can send multiple files at once.\n\nSend /done when finished.\nSend /cancel to stop.`);
      return;
    }
    
    if (action.step === 'multitrack_new_album') {
      const albumName = text.trim();
      
      if (!albumName) {
        await sendMessage(env, chatId, 'Send a valid album name.');
        return;
      }
      
      const db = env.DB;
      
      try {
        await db.prepare('INSERT INTO albums (name, artist_id) VALUES (?, ?)').bind(albumName, action.artistId).run();
        
        const newAlbum = await db.prepare('SELECT id FROM albums WHERE name = ? AND artist_id = ?').bind(albumName, action.artistId).first();
        
        pending.set(userId, {
          step: 'multitrack_upload',
          artistId: action.artistId,
          artistName: action.artistName,
          albumId: newAlbum.id,
          albumName: albumName,
          tracks: []
        });
        
        await sendMessage(env, chatId, `✅ Album "${albumName}" created!\n\nNow send me ALL audio files for this album.\n\nSend /done when finished.\nSend /cancel to stop.`);
      } catch (error) {
        await sendMessage(env, chatId, `❌ Error: ${error.message}`);
      }
      return;
    }
    
    if (action.step === 'multitrack_upload') {
      if (text === '/done') {
        const trackCount = action.tracks.length;
        await sendMessage(env, chatId, `✅ Bulk upload complete!\n\n📀 ${action.albumName}\n🎤 ${action.artistName}\n🎵 ${trackCount} tracks added.`);
        pending.delete(userId);
        return;
      }
      
      if (text === '/cancel') {
        await sendMessage(env, chatId, `Bulk upload cancelled. ${action.tracks.length} tracks were saved.`);
        pending.delete(userId);
        return;
      }
      
      if (msg.audio) {
        await processBulkAudio(msg, env, chatId, userId, action);
        return;
      }
      
      await sendMessage(env, chatId, 'Send audio files, /done when finished, or /cancel to stop.');
      return;
    }
  }
  
  // Handle audio sent directly
  if (msg.audio && pending.has(userId)) {
    return;
  }
  
  // Unknown command
  if (text && text.startsWith('/')) {
    await sendMessage(env, chatId, 'Unknown command. Send /start for menu.');
  }
}

// Process single audio file with metadata extraction
async function processAudioFile(msg, env, chatId, userId, action) {
  if (!msg.audio) {
    await sendMessage(env, chatId, 'Please send an AUDIO file (MP3).');
    return;
  }
  
  const audio = msg.audio;
  const fileId = audio.file_id;
  const duration = audio.duration;
  
  let extractedArtist = audio.performer || null;
  let extractedTitle = audio.title || null;
  let fileName = audio.file_name || '';
  
  if (!extractedTitle && fileName) {
    const extracted = extractFromFilename(fileName);
    if (extracted) {
      if (!extractedArtist) extractedArtist = extracted.artist;
      if (!extractedTitle) extractedTitle = extracted.title;
    }
    
    if (!extractedTitle) {
      extractedTitle = fileName.replace(/\.mp3$/i, '');
    }
  }
  
  let trackTitle = action.trackTitle || extractedTitle || 'Unknown Title';
  
  let metadataMsg = '';
  if (extractedArtist && extractedTitle) {
    metadataMsg = `\n\n📀 Detected: ${extractedArtist} - ${extractedTitle}`;
  } else if (extractedTitle) {
    metadataMsg = `\n\n📀 Detected title: ${extractedTitle}`;
  }
  
  await sendMessage(env, chatId, `Processing audio...${metadataMsg}\n\nArtist: ${action.artistName}\nTitle: ${trackTitle}\n\nSaving...`);
  
  const channelId = env.PRIVATE_CHANNEL_ID;
  const token = env.TELEGRAM_BOT_TOKEN;
  
  try {
    const forwardResponse = await fetch(`https://api.telegram.org/bot${token}/sendAudio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: channelId,
        audio: fileId,
        caption: `${action.artistName} - ${trackTitle}\nDuration: ${duration}s`
      })
    });
    
    const forwardResult = await forwardResponse.json();
    
    if (forwardResult.ok) {
      const permanentFileId = forwardResult.result.audio.file_id;
      
      const db = env.DB;
      await db.prepare(`
        INSERT INTO tracks (file_id, title, artist_id, album_id, duration)
        VALUES (?, ?, ?, ?, ?)
      `).bind(permanentFileId, trackTitle, action.artistId, action.albumId || null, duration).run();
      
      await sendMessage(env, chatId, `✅ Track saved!\n\n🎵 ${trackTitle}\n🎤 ${action.artistName}\n⏱️ ${duration} seconds`);
    } else {
      await sendMessage(env, chatId, `❌ Failed: ${forwardResult.description || 'Unknown error'}`);
    }
  } catch (error) {
    await sendMessage(env, chatId, `❌ Error: ${error.message}`);
  }
  
  pending.delete(userId);
}

// Process bulk audio files
async function processBulkAudio(msg, env, chatId, userId, action) {
  const audio = msg.audio;
  const fileId = audio.file_id;
  const duration = audio.duration;
  
  let extractedArtist = audio.performer || null;
  let extractedTitle = audio.title || null;
  let fileName = audio.file_name || '';
  
  if (!extractedTitle && fileName) {
    const extracted = extractFromFilename(fileName);
    if (extracted) {
      if (!extractedArtist) extractedArtist = extracted.artist;
      if (!extractedTitle) extractedTitle = extracted.title;
    }
    
    if (!extractedTitle) {
      extractedTitle = fileName.replace(/\.mp3$/i, '');
    }
  }
  
  let trackTitle = extractedTitle || 'Unknown Title';
  
  let detectionMsg = '';
  if (extractedArtist && extractedTitle) {
    detectionMsg = `📀 ${extractedArtist} - ${extractedTitle}`;
  } else if (extractedTitle) {
    detectionMsg = `📀 ${extractedTitle}`;
  } else {
    detectionMsg = `📀 ${fileName}`;
  }
  
  await sendMessage(env, chatId, `Processing: ${detectionMsg}`);
  
  const channelId = env.PRIVATE_CHANNEL_ID;
  const token = env.TELEGRAM_BOT_TOKEN;
  
  try {
    const forwardResponse = await fetch(`https://api.telegram.org/bot${token}/sendAudio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: channelId,
        audio: fileId,
        caption: `${action.artistName} - ${trackTitle}\nAlbum: ${action.albumName}\nDuration: ${duration}s`
      })
    });
    
    const forwardResult = await forwardResponse.json();
    
    if (forwardResult.ok) {
      const permanentFileId = forwardResult.result.audio.file_id;
      
      const db = env.DB;
      await db.prepare(`
        INSERT INTO tracks (file_id, title, artist_id, album_id, duration)
        VALUES (?, ?, ?, ?, ?)
      `).bind(permanentFileId, trackTitle, action.artistId, action.albumId, duration).run();
      
      action.tracks.push({ title: trackTitle });
      pending.set(userId, action);
      
      await sendMessage(env, chatId, `✅ ${trackTitle} saved! (${action.tracks.length} total)`);
    } else {
      await sendMessage(env, chatId, `❌ Failed: ${trackTitle} - ${forwardResult.description || 'Unknown error'}`);
    }
  } catch (error) {
    await sendMessage(env, chatId, `❌ Error: ${error.message}`);
  }
}

// Extract metadata from filename
function extractFromFilename(filename) {
  const match = filename.match(/^(.+?)\s*-\s*(.+?)\.mp3$/i);
  if (match) {
    return {
      artist: match[1].trim(),
      title: match[2].trim()
    };
  }
  
  const match2 = filename.match(/^\d+\s*-\s*(.+?)\.mp3$/i);
  if (match2) {
    return {
      artist: null,
      title: match2[1].trim()
    };
  }
  
  return null;
}

async function sendMessage(env, chatId, text) {
  const token = env.TELEGRAM_BOT_TOKEN;
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: text })
    });
  } catch (error) {
    console.error('Send error:', error);
  }
}