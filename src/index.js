// Single file bot - Zambian Music Updates with Website Album Page
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // ========== WEBSITE PAGES ==========
    
    // Homepage - redirect to bot (no album list)
    if (path === '/' || path === '/index.html') {
      return await serveHomepage(env);
    }
    
    // Album page - show single album (only when id is provided)
    if (path === '/album') {
      const albumId = url.searchParams.get('id');
      if (albumId) {
        return await serveAlbumPage(env, albumId);
      }
      // No id provided, redirect to bot
      return new Response(null, {
        status: 302,
        headers: { 'Location': 'https://t.me/zambianmusicupdatesbot' }
      });
    }
    
    // API endpoint - get album data as JSON
    if (path === '/api/album') {
      const albumId = url.searchParams.get('id');
      if (albumId) {
        return await getAlbumJSON(env, albumId);
      }
      return new Response('Album ID required', { status: 400 });
    }
    
    // API endpoint - get album cover image
    if (path === '/api/cover') {
      const albumId = url.searchParams.get('id');
      if (albumId) {
        return await getAlbumCover(env, albumId);
      }
      return new Response('Album ID required', { status: 400 });
    }
    
    // ========== TELEGRAM BOT ==========
    
    // Telegram webhook
    if (path === '/webhook' && request.method === 'POST') {
      const update = await request.json();
      await handleUpdate(update, env);
      return new Response('OK');
    }
    
    // Setup webhook
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

// ========== WEBSITE FUNCTIONS ==========

// Serve homepage - redirect to bot
async function serveHomepage(env) {
  // Redirect directly to bot
  return new Response(null, {
    status: 302,
    headers: { 'Location': 'https://t.me/zambianmusicupdatesbot' }
  });
}

// Serve single album page
async function serveAlbumPage(env, albumId) {
  const db = env.DB;
  
  const album = await db.prepare(`
    SELECT albums.id, albums.name, artists.name as artist_name,
           albums.release_year, albums.cover_file_id
    FROM albums
    JOIN artists ON albums.artist_id = artists.id
    WHERE albums.id = ?
  `).bind(albumId).first();
  
  if (!album) {
    return new Response('Album not found', { status: 404 });
  }
  
  const tracks = await db.prepare(`
    SELECT id, track_number, title, duration
    FROM tracks
    WHERE album_id = ?
    ORDER BY track_number, id
  `).bind(albumId).all();
  
  // Ad placeholder - replace with your Adsterra code
  const adCode = `
    <div class="ad-container">
      <!-- Replace with your Adsterra banner code -->
      <div style="background: #f0f0f0; padding: 20px; text-align: center; border-radius: 8px;">
        📢 Advertisement Space<br>
        <small>Your ad here</small>
      </div>
    </div>
  `;
  
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(album.name)} - ${escapeHtml(album.artist_name)}</title>
  <meta name="telegram:bot" content="@zambianmusicupdatesbot">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
    }
    
    .container {
      max-width: 800px;
      margin: 0 auto;
    }
    
    .album-card {
      background: white;
      border-radius: 24px;
      overflow: hidden;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
    }
    
    .album-header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 30px;
      text-align: center;
      color: white;
    }
    
    .album-icon {
      font-size: 4rem;
      margin-bottom: 15px;
    }
    
    .album-name {
      font-size: 1.8rem;
      font-weight: bold;
      margin-bottom: 10px;
    }
    
    .artist-name {
      font-size: 1.2rem;
      opacity: 0.9;
      margin-bottom: 10px;
    }
    
    .release-year {
      font-size: 0.9rem;
      opacity: 0.8;
    }
    
    .tracklist {
      padding: 20px;
    }
    
    .tracklist h3 {
      margin-bottom: 15px;
      color: #333;
    }
    
    .track-item {
      display: flex;
      align-items: center;
      padding: 12px 0;
      border-bottom: 1px solid #eee;
    }
    
    .track-number {
      width: 40px;
      color: #999;
      font-weight: bold;
    }
    
    .track-title {
      flex: 1;
      color: #333;
    }
    
    .track-duration {
      color: #999;
      font-size: 0.85rem;
    }
    
    .ad-container {
      margin: 20px;
    }
    
    .telegram-btn {
      display: block;
      background: #0088cc;
      color: white;
      text-align: center;
      text-decoration: none;
      padding: 15px;
      margin: 20px;
      border-radius: 12px;
      font-weight: bold;
      font-size: 1.1rem;
      transition: background 0.2s;
    }
    
    .telegram-btn:hover {
      background: #006699;
    }
    
    footer {
      text-align: center;
      color: white;
      margin-top: 20px;
      opacity: 0.8;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="album-card">
      <div class="album-header">
        <div class="album-icon">💿</div>
        <div class="album-name">${escapeHtml(album.name)}</div>
        <div class="artist-name">${escapeHtml(album.artist_name)}</div>
        ${album.release_year ? `<div class="release-year">📅 ${album.release_year}</div>` : ''}
      </div>
      
      <div class="tracklist">
        <h3>🎧 Tracklist (${tracks.results.length} tracks)</h3>
        ${tracks.results.map((track, index) => `
          <div class="track-item">
            <div class="track-number">${track.track_number || (index + 1)}</div>
            <div class="track-title">${escapeHtml(track.title)}</div>
            <div class="track-duration">${formatDuration(track.duration)}</div>
          </div>
        `).join('')}
      </div>
      
      ${adCode}
      
      <a href="https://t.me/zambianmusicupdatesbot?start=album_${album.id}" class="telegram-btn">
        📀 Get all tracks on Telegram
      </a>
    </div>
    
    <footer>
      <p>Click the button above to receive all tracks via Telegram</p>
    </footer>
  </div>
</body>
</html>`;
  
  return new Response(html, {
    headers: { 'Content-Type': 'text/html' }
  });
}

// API: Get album as JSON
async function getAlbumJSON(env, albumId) {
  const db = env.DB;
  
  const album = await db.prepare(`
    SELECT albums.id, albums.name, artists.name as artist_name,
           albums.release_year, albums.cover_file_id
    FROM albums
    JOIN artists ON albums.artist_id = artists.id
    WHERE albums.id = ?
  `).bind(albumId).first();
  
  if (!album) {
    return new Response(JSON.stringify({ error: 'Album not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const tracks = await db.prepare(`
    SELECT id, track_number, title, duration
    FROM tracks
    WHERE album_id = ?
    ORDER BY track_number, id
  `).bind(albumId).all();
  
  return new Response(JSON.stringify({
    ...album,
    tracks: tracks.results
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

// API: Get album cover image
async function getAlbumCover(env, albumId) {
  const db = env.DB;
  
  const album = await db.prepare('SELECT cover_file_id FROM albums WHERE id = ?').bind(albumId).first();
  
  if (!album || !album.cover_file_id) {
    return new Response('Cover not found', { status: 404 });
  }
  
  const token = env.TELEGRAM_BOT_TOKEN;
  const fileUrl = `https://api.telegram.org/bot${token}/getFile?file_id=${album.cover_file_id}`;
  
  const fileInfo = await fetch(fileUrl);
  const fileData = await fileInfo.json();
  
  if (fileData.ok) {
    const imageUrl = `https://api.telegram.org/file/bot${token}/${fileData.result.file_path}`;
    const image = await fetch(imageUrl);
    return new Response(image.body, {
      headers: { 'Content-Type': 'image/jpeg' }
    });
  }
  
  return new Response('Cover not found', { status: 404 });
}

// ========== TELEGRAM BOT FUNCTIONS ==========

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
  
  // Handle /start with album parameter (for user delivery)
  if (text && text.startsWith('/start')) {
    const param = text.split(' ')[1];
    
    if (param && param.startsWith('album_')) {
      // User wants to receive an album
      const albumId = param.split('_')[1];
      await sendAlbumToUser(env, chatId, albumId);
      return;
    }
    
    // Normal /start
    if (isAdmin) {
      await sendMessage(env, chatId, '🎵 Admin Menu\n\n/addartist - Add artist\n/addalbum - Add album\n/addtrack - Add single track\n/multitrack - Bulk upload multiple tracks\n/listartists - Show artists\n/listalbums - Show albums (with IDs)\n/stats - Statistics\n/cancel - Cancel operation');
    } else {
      await sendMessage(env, chatId, '🎵 Welcome to Zambian Music Updates!\n\nClick the button on our website to get music.');
    }
    return;
  }
  
  if (!isAdmin) {
    await sendMessage(env, chatId, 'You are not authorized to use this bot.');
    return;
  }
  
  // Handle /cancel and /done FIRST
  if (text === '/cancel') {
    pending.delete(userId);
    await sendMessage(env, chatId, 'Operation cancelled.');
    return;
  }
  
  if (text === '/done') {
    const action = pending.get(userId);
    if (action && action.step === 'multitrack_upload') {
      // Let pending handler process
    } else {
      await sendMessage(env, chatId, 'No active bulk upload. Use /multitrack to start.');
      return;
    }
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
  
  // Handle /multitrack
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
  
  // Handle /listalbums - FIXED to show IDs
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
      list += `ID: ${album.id} | ${album.artist_name} - ${album.name} (${trackCount?.count || 0} tracks)\n`;
    }
    list += '\n📎 Use link: https://music.zedtopvibes.com/album?id=ID';
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
  
  // Handle pending steps
  if (pending.has(userId)) {
    const action = pending.get(userId);
    
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
      
      await sendMessage(env, chatId, `📀 Album: ${albumName}\n\nNow send me ALL audio files for this album.\n\nSend /done when finished.\nSend /cancel to stop.`);
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
  
  // Unknown command
  if (text && text.startsWith('/')) {
    await sendMessage(env, chatId, 'Unknown command. Send /start for menu.');
  }
}

// Send album to user (for non-admin users)
async function sendAlbumToUser(env, chatId, albumId) {
  const db = env.DB;
  
  const album = await db.prepare(`
    SELECT albums.id, albums.name, artists.name as artist_name
    FROM albums
    JOIN artists ON albums.artist_id = artists.id
    WHERE albums.id = ?
  `).bind(albumId).first();
  
  if (!album) {
    await sendMessage(env, chatId, '❌ Album not found.');
    return;
  }
  
  const tracks = await db.prepare(`
    SELECT title, file_id, duration
    FROM tracks
    WHERE album_id = ?
    ORDER BY track_number, id
  `).bind(albumId).all();
  
  if (!tracks.results || tracks.results.length === 0) {
    await sendMessage(env, chatId, '❌ No tracks found for this album.');
    return;
  }
  
  await sendMessage(env, chatId, `🎵 ${album.name} - ${album.artist_name}\n\n📀 Found ${tracks.results.length} tracks. Sending now...`);
  
  for (const track of tracks.results) {
    try {
      await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendAudio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          audio: track.file_id,
          caption: `${track.title}\n${album.artist_name}`
        })
      });
    } catch (error) {
      console.error('Send track error:', error);
    }
  }
  
  await sendMessage(env, chatId, `✅ All tracks sent! Enjoy the music! 🎧`);
}

// Process single audio file
async function processAudioFile(msg, env, chatId, userId, action) {
  if (!msg.audio) {
    await sendMessage(env, chatId, 'Please send an AUDIO file (MP3).');
    return;
  }
  
  const audio = msg.audio;
  const fileId = audio.file_id;
  const duration = audio.duration;
  
  let extractedTitle = audio.title || null;
  let fileName = audio.file_name || '';
  
  if (!extractedTitle && fileName) {
    extractedTitle = fileName.replace(/\.mp3$/i, '');
  }
  
  let trackTitle = action.trackTitle || extractedTitle || 'Unknown Title';
  
  await sendMessage(env, chatId, `Processing: ${trackTitle}\n\nArtist: ${action.artistName}\n\nSaving...`);
  
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

// Process bulk audio
async function processBulkAudio(msg, env, chatId, userId, action) {
  const audio = msg.audio;
  const fileId = audio.file_id;
  const duration = audio.duration;
  
  let extractedTitle = audio.title || null;
  let fileName = audio.file_name || '';
  
  if (!extractedTitle && fileName) {
    extractedTitle = fileName.replace(/\.mp3$/i, '');
  }
  
  let trackTitle = extractedTitle || 'Unknown Title';
  
  await sendMessage(env, chatId, `Processing: ${trackTitle}`);
  
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
      await sendMessage(env, chatId, `❌ Failed: ${trackTitle}`);
    }
  } catch (error) {
    await sendMessage(env, chatId, `❌ Error: ${error.message}`);
  }
}

// Helper functions
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

function formatDuration(seconds) {
  if (!seconds) return '';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
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