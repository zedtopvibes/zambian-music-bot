// Single file bot - Zambian Music Updates
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // Homepage - redirect to bot
    if (path === '/' || path === '/index.html') {
      return new Response(null, {
        status: 302,
        headers: { 'Location': 'https://t.me/zambianmusicupdatesbot' }
      });
    }
    
    // Album page
    if (path === '/album') {
      const albumId = url.searchParams.get('id');
      if (albumId) {
        return await serveAlbumPage(env, albumId);
      }
      return new Response('Album ID required', { status: 400 });
    }
    
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

// Serve single album page
async function serveAlbumPage(env, albumId) {
  const db = env.DB;
  
  const album = await db.prepare(`
    SELECT albums.id, albums.name, artists.name as artist_name
    FROM albums
    JOIN artists ON albums.artist_id = artists.id
    WHERE albums.id = ?
  `).bind(albumId).first();
  
  if (!album) {
    return new Response('Album not found', { status: 404 });
  }
  
  const tracks = await db.prepare(`
    SELECT title, duration
    FROM tracks
    WHERE album_id = ?
    ORDER BY id
  `).bind(albumId).all();
  
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${album.name} - ${album.artist_name}</title>
  <meta name="telegram:bot" content="@zambianmusicupdatesbot">
  <style>
    body {
      font-family: Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
      margin: 0;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
    }
    .album-card {
      background: white;
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 10px 30px rgba(0,0,0,0.2);
    }
    .album-header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 30px;
      text-align: center;
      color: white;
    }
    .album-icon { font-size: 4rem; }
    .album-name { font-size: 1.8rem; font-weight: bold; margin: 10px 0; }
    .artist-name { font-size: 1.2rem; opacity: 0.9; }
    .tracklist { padding: 20px; }
    .tracklist h3 { margin-bottom: 15px; color: #333; }
    .track-item {
      padding: 10px 0;
      border-bottom: 1px solid #eee;
      display: flex;
      justify-content: space-between;
    }
    .track-title { color: #333; }
    .track-duration { color: #999; }
    .ad-container {
      margin: 20px;
      padding: 15px;
      background: #f5f5f5;
      text-align: center;
      border-radius: 10px;
    }
    .telegram-btn {
      display: block;
      background: #0088cc;
      color: white;
      text-align: center;
      text-decoration: none;
      padding: 15px;
      margin: 20px;
      border-radius: 10px;
      font-weight: bold;
      font-size: 1.1rem;
    }
    .telegram-btn:hover { background: #006699; }
  </style>
</head>
<body>
  <div class="container">
    <div class="album-card">
      <div class="album-header">
        <div class="album-icon">💿</div>
        <div class="album-name">${escapeHtml(album.name)}</div>
        <div class="artist-name">${escapeHtml(album.artist_name)}</div>
      </div>
      <div class="tracklist">
        <h3>🎧 Tracklist (${tracks.results.length} tracks)</h3>
        ${tracks.results.map((track, i) => `
          <div class="track-item">
            <span class="track-title">${i+1}. ${escapeHtml(track.title)}</span>
            <span class="track-duration">${formatDuration(track.duration)}</span>
          </div>
        `).join('')}
      </div>
      <div class="ad-container">
        📢 Advertisement Space<br>
        <small>Your ad here</small>
      </div>
      <a href="https://t.me/zambianmusicupdatesbot?start=album_${album.id}" class="telegram-btn">
        📀 Get all tracks on Telegram
      </a>
    </div>
  </div>
</body>
</html>`;
  
  return new Response(html, {
    headers: { 'Content-Type': 'text/html' }
  });
}

// ========== TELEGRAM BOT FUNCTIONS ==========

const pending = new Map();

async function handleUpdate(update, env) {
  if (!update.message) return;
  
  const msg = update.message;
  const chatId = msg.chat.id;
  const text = msg.text || '';
  const userId = msg.from.id.toString();
  
  const adminIds = env.ADMIN_IDS ? env.ADMIN_IDS.split(',') : [];
  const isAdmin = adminIds.includes(userId);
  
  // Handle /start with album
  if (text && text.startsWith('/start')) {
    const param = text.split(' ')[1];
    if (param && param.startsWith('album_')) {
      const albumId = param.split('_')[1];
      await sendAlbumToUser(env, chatId, albumId);
      return;
    }
    
    if (isAdmin) {
      await sendMessage(env, chatId, '🎵 Admin Menu\n\n/addartist - Add artist\n/addalbum - Add album\n/multitrack - Bulk upload\n/listartists - Show artists\n/listalbums - Show albums\n/stats - Statistics\n/cancel - Cancel');
    } else {
      await sendMessage(env, chatId, '🎵 Welcome! Visit our website to get music:\nhttps://requests.zedtopvibes.com');
    }
    return;
  }
  
  if (!isAdmin) {
    await sendMessage(env, chatId, 'You are not authorized.');
    return;
  }
  
  // Cancel command
  if (text === '/cancel') {
    pending.delete(userId);
    await sendMessage(env, chatId, 'Cancelled.');
    return;
  }
  
  // List artists
  if (text === '/listartists') {
    const db = env.DB;
    const artists = await db.prepare('SELECT id, name FROM artists ORDER BY name').all();
    
    if (!artists.results || artists.results.length === 0) {
      await sendMessage(env, chatId, 'No artists yet.');
      return;
    }
    
    let list = '🎤 ARTISTS:\n\n';
    for (const artist of artists.results) {
      list += `• ${artist.name}\n`;
    }
    await sendMessage(env, chatId, list);
    return;
  }
  
  // List albums with new domain
  if (text === '/listalbums') {
    const db = env.DB;
    const albums = await db.prepare('SELECT id, name, artist_id FROM albums ORDER BY id').all();
    
    if (!albums.results || albums.results.length === 0) {
      await sendMessage(env, chatId, 'No albums yet.');
      return;
    }
    
    let list = '💿 ALBUMS:\n\n';
    for (const album of albums.results) {
      const artist = await db.prepare('SELECT name FROM artists WHERE id = ?').bind(album.artist_id).first();
      const artistName = artist ? artist.name : 'Unknown';
      list += `ID: ${album.id} | ${artistName} - ${album.name}\n`;
    }
    list += '\n🔗 Link: https://requests.zedtopvibes.com/album?id=ID';
    await sendMessage(env, chatId, list);
    return;
  }
  
  // Stats
  if (text === '/stats') {
    const db = env.DB;
    const artistCount = await db.prepare('SELECT COUNT(*) as count FROM artists').first();
    const albumCount = await db.prepare('SELECT COUNT(*) as count FROM albums').first();
    const trackCount = await db.prepare('SELECT COUNT(*) as count FROM tracks').first();
    
    await sendMessage(env, chatId, `📊 STATS\n\nArtists: ${artistCount?.count || 0}\nAlbums: ${albumCount?.count || 0}\nTracks: ${trackCount?.count || 0}`);
    return;
  }
  
  // Add artist
  if (text === '/addartist') {
    pending.set(userId, { step: 'artist_name' });
    await sendMessage(env, chatId, 'Send ARTIST NAME:');
    return;
  }
  
  // Add album
  if (text === '/addalbum') {
    const db = env.DB;
    const artists = await db.prepare('SELECT id, name FROM artists ORDER BY name').all();
    
    if (!artists.results || artists.results.length === 0) {
      await sendMessage(env, chatId, 'No artists. Use /addartist first.');
      return;
    }
    
    let list = 'Select artist:\n\n';
    for (let i = 0; i < artists.results.length; i++) {
      list += `${i+1}. ${artists.results[i].name}\n`;
    }
    
    pending.set(userId, { step: 'album_artist', artists: artists.results });
    await sendMessage(env, chatId, list);
    return;
  }
  
  // Multitrack bulk upload
  if (text === '/multitrack') {
    const db = env.DB;
    const artists = await db.prepare('SELECT id, name FROM artists ORDER BY name').all();
    
    if (!artists.results || artists.results.length === 0) {
      await sendMessage(env, chatId, 'No artists. Use /addartist first.');
      return;
    }
    
    let list = 'Select artist:\n\n';
    for (let i = 0; i < artists.results.length; i++) {
      list += `${i+1}. ${artists.results[i].name}\n`;
    }
    
    pending.set(userId, { step: 'multitrack_artist', artists: artists.results, tracks: [] });
    await sendMessage(env, chatId, list);
    return;
  }
  
  // Handle pending steps
  if (pending.has(userId)) {
    const action = pending.get(userId);
    
    // Add artist step
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
    
    // Add album - select artist
    if (action.step === 'album_artist') {
      const choice = parseInt(text);
      if (isNaN(choice) || choice < 1 || choice > action.artists.length) {
        await sendMessage(env, chatId, `Send number 1-${action.artists.length}`);
        return;
      }
      
      const selected = action.artists[choice - 1];
      pending.set(userId, { step: 'album_name', artistId: selected.id, artistName: selected.name });
      await sendMessage(env, chatId, `Selected: ${selected.name}\n\nSend ALBUM NAME:`);
      return;
    }
    
    // Add album - get name
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
    
    // Multitrack - select artist
    if (action.step === 'multitrack_artist') {
      const choice = parseInt(text);
      if (isNaN(choice) || choice < 1 || choice > action.artists.length) {
        await sendMessage(env, chatId, `Send number 1-${action.artists.length}`);
        return;
      }
      
      const selected = action.artists[choice - 1];
      const db = env.DB;
      const albums = await db.prepare('SELECT id, name FROM albums WHERE artist_id = ?').bind(selected.id).all();
      
      pending.set(userId, {
        step: 'multitrack_album',
        artistId: selected.id,
        artistName: selected.name,
        albums: albums.results || [],
        tracks: []
      });
      
      let albumList = 'Select album (or "new"):\n\n';
      for (let i = 0; i < albums.results.length; i++) {
        albumList += `${i+1}. ${albums.results[i].name}\n`;
      }
      albumList += '\n"new" - Create new album\n"cancel" - Stop';
      await sendMessage(env, chatId, albumList);
      return;
    }
    
    // Multitrack - select album
    if (action.step === 'multitrack_album') {
      const input = text.toLowerCase();
      
      if (input === 'cancel') {
        pending.delete(userId);
        await sendMessage(env, chatId, 'Cancelled.');
        return;
      }
      
      let albumId = null;
      let albumName = null;
      
      if (input === 'new') {
        pending.set(userId, { step: 'multitrack_new_album', artistId: action.artistId, artistName: action.artistName, tracks: [] });
        await sendMessage(env, chatId, 'Send NEW ALBUM NAME:');
        return;
      }
      
      const choice = parseInt(input);
      if (isNaN(choice) || choice < 1 || choice > action.albums.length) {
        await sendMessage(env, chatId, `Send number 1-${action.albums.length}, "new", or "cancel"`);
        return;
      }
      
      albumId = action.albums[choice - 1].id;
      albumName = action.albums[choice - 1].name;
      
      pending.set(userId, {
        step: 'multitrack_upload',
        artistId: action.artistId,
        artistName: action.artistName,
        albumId: albumId,
        albumName: albumName,
        tracks: []
      });
      
      await sendMessage(env, chatId, `Album: ${albumName}\n\nSend MP3 files. Send /done when finished.`);
      return;
    }
    
    // Multitrack - new album name
    if (action.step === 'multitrack_new_album') {
      const albumName = text.trim();
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
        
        await sendMessage(env, chatId, `✅ Album "${albumName}" created!\n\nSend MP3 files. Send /done when finished.`);
      } catch (error) {
        await sendMessage(env, chatId, `❌ Error: ${error.message}`);
      }
      return;
    }
    
    // Multitrack - upload files
    if (action.step === 'multitrack_upload') {
      if (text === '/done') {
        await sendMessage(env, chatId, `✅ Bulk upload complete!\n\nAlbum: ${action.albumName}\nTracks: ${action.tracks.length} added`);
        pending.delete(userId);
        return;
      }
      
      if (msg.audio) {
        await processBulkAudio(msg, env, chatId, userId, action);
        return;
      }
      
      await sendMessage(env, chatId, 'Send MP3 files or /done');
      return;
    }
  }
}

// Send album to user
async function sendAlbumToUser(env, chatId, albumId) {
  const db = env.DB;
  
  const album = await db.prepare('SELECT id, name, artist_id FROM albums WHERE id = ?').bind(albumId).first();
  if (!album) {
    await sendMessage(env, chatId, '❌ Album not found.');
    return;
  }
  
  const artist = await db.prepare('SELECT name FROM artists WHERE id = ?').bind(album.artist_id).first();
  const artistName = artist ? artist.name : 'Unknown';
  
  const tracks = await db.prepare('SELECT title, file_id FROM tracks WHERE album_id = ?').bind(albumId).all();
  
  if (!tracks.results || tracks.results.length === 0) {
    await sendMessage(env, chatId, '❌ No tracks found.');
    return;
  }
  
  await sendMessage(env, chatId, `🎵 ${album.name} - ${artistName}\n\nSending ${tracks.results.length} tracks...`);
  
  for (const track of tracks.results) {
    try {
      await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendAudio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          audio: track.file_id,
          caption: `${track.title}\n${artistName}`
        })
      });
    } catch (error) {
      console.error('Send error:', error);
    }
  }
  
  await sendMessage(env, chatId, '✅ All tracks sent! Enjoy! 🎧');
}

// Process bulk audio
async function processBulkAudio(msg, env, chatId, userId, action) {
  const audio = msg.audio;
  const fileId = audio.file_id;
  const duration = audio.duration;
  let title = audio.title || audio.file_name?.replace(/\.mp3$/i, '') || 'Unknown';
  
  await sendMessage(env, chatId, `Processing: ${title}`);
  
  const channelId = env.PRIVATE_CHANNEL_ID;
  const token = env.TELEGRAM_BOT_TOKEN;
  
  try {
    const forwardResponse = await fetch(`https://api.telegram.org/bot${token}/sendAudio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: channelId,
        audio: fileId,
        caption: `${action.artistName} - ${title}`
      })
    });
    
    const forwardResult = await forwardResponse.json();
    
    if (forwardResult.ok) {
      const permanentFileId = forwardResult.result.audio.file_id;
      
      const db = env.DB;
      await db.prepare(`
        INSERT INTO tracks (file_id, title, artist_id, album_id, duration)
        VALUES (?, ?, ?, ?, ?)
      `).bind(permanentFileId, title, action.artistId, action.albumId, duration).run();
      
      action.tracks.push(title);
      pending.set(userId, action);
      await sendMessage(env, chatId, `✅ ${title} saved! (${action.tracks.length} total)`);
    } else {
      await sendMessage(env, chatId, `❌ Failed: ${title}`);
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
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: text })
  });
}
