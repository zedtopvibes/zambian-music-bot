// Single file bot - Zambian Music Updates with Metadata Extraction
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
    await sendMessage(env, chatId, '🎵 Admin Menu\n\n/addartist - Add artist\n/addalbum - Add album\n/addtrack - Add track\n/listartists - Show artists\n/listalbums - Show albums\n/stats - Statistics\n/cancel - Cancel operation');
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
    
    // ========== ADD TRACK ==========
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
      // Check if user sent audio directly instead of title
      if (msg.audio) {
        // Jump directly to audio processing
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
  }
  
  // Handle audio sent without going through /addtrack
  if (msg.audio && pending.has(userId)) {
    // Already handled above
    return;
  }
  
  // Unknown command
  if (text && text.startsWith('/')) {
    await sendMessage(env, chatId, 'Unknown command. Send /start for menu.');
  }
}

// Process audio file with metadata extraction
async function processAudioFile(msg, env, chatId, userId, action) {
  if (!msg.audio) {
    await sendMessage(env, chatId, 'Please send an AUDIO file (MP3).');
    return;
  }
  
  const audio = msg.audio;
  const fileId = audio.file_id;
  const duration = audio.duration;
  
  // EXTRACT METADATA FROM AUDIO FILE
  let extractedArtist = audio.performer || null;
  let extractedTitle = audio.title || null;
  let fileName = audio.file_name || '';
  
  // Try to extract from filename if no metadata
  if (!extractedTitle && fileName) {
    const extracted = extractFromFilename(fileName);
    if (extracted) {
      if (!extractedArtist) extractedArtist = extracted.artist;
      if (!extractedTitle) extractedTitle = extracted.title;
    }
    
    // If still no title, use filename without extension
    if (!extractedTitle) {
      extractedTitle = fileName.replace(/\.mp3$/i, '');
    }
  }
  
  // Use extracted values or fallback to user-provided
  let trackTitle = action.trackTitle || extractedTitle;
  let artistName = action.artistName;
  let artistId = action.artistId;
  let albumId = action.albumId;
  
  // If metadata found, show what was detected
  let metadataMsg = '';
  if (extractedArtist && extractedTitle) {
    metadataMsg = `\n\n📀 Detected from file: ${extractedArtist} - ${extractedTitle}`;
    
    // Optional: Check if detected artist matches selected artist
    if (extractedArtist.toLowerCase() !== artistName.toLowerCase()) {
      metadataMsg += `\n⚠️ Warning: Detected artist "${extractedArtist}" differs from selected "${artistName}"`;
    }
  } else if (extractedTitle) {
    metadataMsg = `\n\n📀 Detected title: ${extractedTitle}`;
  } else if (fileName) {
    metadataMsg = `\n\n📀 Filename: ${fileName}`;
  }
  
  await sendMessage(env, chatId, `Processing audio file...${metadataMsg}\n\nArtist: ${artistName}\nTitle: ${trackTitle || extractedTitle}\n\nSaving...`);
  
  const channelId = env.PRIVATE_CHANNEL_ID;
  const token = env.TELEGRAM_BOT_TOKEN;
  
  try {
    const forwardResponse = await fetch(`https://api.telegram.org/bot${token}/sendAudio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: channelId,
        audio: fileId,
        caption: `${artistName} - ${trackTitle || extractedTitle}\nDuration: ${duration}s`
      })
    });
    
    const forwardResult = await forwardResponse.json();
    
    if (forwardResult.ok) {
      const permanentFileId = forwardResult.result.audio.file_id;
      const finalTitle = trackTitle || extractedTitle || 'Unknown Title';
      
      const db = env.DB;
      await db.prepare(`
        INSERT INTO tracks (file_id, title, artist_id, album_id, duration)
        VALUES (?, ?, ?, ?, ?)
      `).bind(permanentFileId, finalTitle, artistId, albumId || null, duration).run();
      
      await sendMessage(env, chatId, `✅ Track saved!\n\n🎵 ${finalTitle}\n🎤 ${artistName}\n⏱️ ${duration} seconds`);
    } else {
      await sendMessage(env, chatId, `❌ Failed: ${forwardResult.description || 'Unknown error'}`);
    }
  } catch (error) {
    await sendMessage(env, chatId, `❌ Error: ${error.message}`);
  }
  
  pending.delete(userId);
}

// Extract metadata from filename
function extractFromFilename(filename) {
  // Pattern: Artist - Title.mp3
  const match = filename.match(/^(.+?)\s*-\s*(.+?)\.mp3$/i);
  if (match) {
    return {
      artist: match[1].trim(),
      title: match[2].trim()
    };
  }
  
  // Pattern: Track Number - Title.mp3 (no artist)
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