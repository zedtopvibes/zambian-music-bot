import { pendingActions } from './bot.js';
import { sendMessage } from './utils.js';
import { addArtist, addAlbum, addTrack, listArtists, listAlbums, showStats } from './commands.js';

export async function handleAdminCommand(env, chatId, userId, text, msg) {
  // /addartist
  if (text === '/addartist') {
    pendingActions.set(userId, { step: 'waiting_artist_name' });
    await sendMessage(env, chatId, 'Send me the ARTIST NAME.\n\nExample: Michael Jackson');
    return;
  }
  
  // /addalbum
  if (text === '/addalbum') {
    // First get list of artists
    const artists = await listArtistsSimple(env);
    if (!artists || artists.length === 0) {
      await sendMessage(env, chatId, 'No artists found. Use /addartist first.');
      return;
    }
    
    let artistList = 'Select artist by number:\n\n';
    for (let i = 0; i < artists.length; i++) {
      artistList += `${i + 1}. ${artists[i].name}\n`;
    }
    
    pendingActions.set(userId, { step: 'waiting_album_artist', artists: artists });
    await sendMessage(env, chatId, artistList);
    return;
  }
  
  // /addtrack
  if (text === '/addtrack') {
    // First get list of artists
    const artists = await listArtistsSimple(env);
    if (!artists || artists.length === 0) {
      await sendMessage(env, chatId, 'No artists found. Use /addartist first.');
      return;
    }
    
    let artistList = 'Select artist by number:\n\n';
    for (let i = 0; i < artists.length; i++) {
      artistList += `${i + 1}. ${artists[i].name}\n`;
    }
    
    pendingActions.set(userId, { step: 'waiting_track_artist', artists: artists });
    await sendMessage(env, chatId, artistList);
    return;
  }
  
  // /listartists
  if (text === '/listartists') {
    await listArtists(env, chatId);
    return;
  }
  
  // /stats
  if (text === '/stats') {
    await showStats(env, chatId);
    return;
  }
  
  // /cancel
  if (text === '/cancel') {
    pendingActions.delete(userId);
    await sendMessage(env, chatId, 'Operation cancelled.');
    return;
  }
}

export async function handleAdminSteps(env, chatId, userId, text, msg) {
  const action = pendingActions.get(userId);
  
  // Step: Waiting for artist name (/addartist)
  if (action.step === 'waiting_artist_name') {
    const artistName = text.trim();
    
    if (!artistName) {
      await sendMessage(env, chatId, 'Please send a valid artist name.');
      return;
    }
    
    const success = await addArtist(env, artistName);
    
    if (success) {
      await sendMessage(env, chatId, `✅ Artist "${artistName}" added!`);
    } else {
      await sendMessage(env, chatId, `❌ Artist "${artistName}" already exists.`);
    }
    
    pendingActions.delete(userId);
    return;
  }
  
  // Step: Waiting for album artist selection (/addalbum)
  if (action.step === 'waiting_album_artist') {
    const choice = parseInt(text.trim());
    const artists = action.artists;
    
    if (isNaN(choice) || choice < 1 || choice > artists.length) {
      await sendMessage(env, chatId, `Please send a number between 1 and ${artists.length}.`);
      return;
    }
    
    const selectedArtist = artists[choice - 1];
    
    pendingActions.set(userId, { 
      step: 'waiting_album_name', 
      artistId: selectedArtist.id,
      artistName: selectedArtist.name
    });
    
    await sendMessage(env, chatId, `Selected: ${selectedArtist.name}\n\nSend me the ALBUM NAME.`);
    return;
  }
  
  // Step: Waiting for album name
  if (action.step === 'waiting_album_name') {
    const albumName = text.trim();
    
    if (!albumName) {
      await sendMessage(env, chatId, 'Please send a valid album name.');
      return;
    }
    
    const success = await addAlbum(env, albumName, action.artistId);
    
    if (success) {
      await sendMessage(env, chatId, `✅ Album "${albumName}" added to ${action.artistName}!`);
    } else {
      await sendMessage(env, chatId, `❌ Album "${albumName}" already exists.`);
    }
    
    pendingActions.delete(userId);
    return;
  }
  
  // Step: Waiting for track artist selection (/addtrack)
  if (action.step === 'waiting_track_artist') {
    const choice = parseInt(text.trim());
    const artists = action.artists;
    
    if (isNaN(choice) || choice < 1 || choice > artists.length) {
      await sendMessage(env, chatId, `Please send a number between 1 and ${artists.length}.`);
      return;
    }
    
    const selectedArtist = artists[choice - 1];
    
    // Now get albums for this artist
    const albums = await listAlbumsSimple(env, selectedArtist.id);
    
    pendingActions.set(userId, { 
      step: 'waiting_track_album', 
      artistId: selectedArtist.id,
      artistName: selectedArtist.name,
      albums: albums
    });
    
    if (albums && albums.length > 0) {
      let albumList = 'Select album by number (or send "none"):\n\n';
      for (let i = 0; i < albums.length; i++) {
        albumList += `${i + 1}. ${albums[i].name}\n`;
      }
      albumList += '\nSend "none" if no album.';
      await sendMessage(env, chatId, albumList);
    } else {
      await sendMessage(env, chatId, `No albums found for ${selectedArtist.name}. Send "none" to continue without album, or use /addalbum first.`);
    }
    
    return;
  }
  
  // Step: Waiting for track album selection
  if (action.step === 'waiting_track_album') {
    const input = text.trim().toLowerCase();
    let albumId = null;
    
    if (input !== 'none') {
      const choice = parseInt(input);
      const albums = action.albums;
      
      if (isNaN(choice) || choice < 1 || choice > albums.length) {
        await sendMessage(env, chatId, `Please send a number between 1 and ${albums.length}, or "none".`);
        return;
      }
      
      albumId = albums[choice - 1].id;
      const albumName = albums[choice - 1].name;
      await sendMessage(env, chatId, `Selected album: ${albumName}`);
    } else {
      await sendMessage(env, chatId, 'No album selected. Track will be added without album.');
    }
    
    pendingActions.set(userId, {
      step: 'waiting_track_title',
      artistId: action.artistId,
      artistName: action.artistName,
      albumId: albumId
    });
    
    await sendMessage(env, chatId, 'Send me the SONG TITLE.\n\nExample: Wanna Be Startin Somethin');
    return;
  }
  
  // Step: Waiting for track title
  if (action.step === 'waiting_track_title') {
    const trackTitle = text.trim();
    
    if (!trackTitle) {
      await sendMessage(env, chatId, 'Please send a valid song title.');
      return;
    }
    
    pendingActions.set(userId, {
      step: 'waiting_track_audio',
      artistId: action.artistId,
      artistName: action.artistName,
      albumId: action.albumId,
      trackTitle: trackTitle
    });
    
    await sendMessage(env, chatId, `Title: "${trackTitle}"\n\nNow send me the AUDIO FILE.`);
    return;
  }
  
  // Step: Waiting for audio file
  if (action.step === 'waiting_track_audio') {
    if (!msg.audio) {
      await sendMessage(env, chatId, 'Please send an AUDIO file (MP3).');
      return;
    }
    
    const audio = msg.audio;
    const fileId = audio.file_id;
    const duration = audio.duration;
    const fileName = audio.file_name || `${action.trackTitle}.mp3`;
    
    // Forward to private channel
    const channelId = env.PRIVATE_CHANNEL_ID;
    const token = env.TELEGRAM_BOT_TOKEN;
    
    try {
      // Forward to private channel
      const forwardResponse = await fetch(`https://api.telegram.org/bot${token}/sendAudio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: channelId,
          audio: fileId,
          caption: `${action.artistName} - ${action.trackTitle}\nDuration: ${duration}s`
        })
      });
      
      const forwardResult = await forwardResponse.json();
      
      if (forwardResult.ok) {
        const permanentFileId = forwardResult.result.audio.file_id;
        
        // Save to database
        const success = await addTrack(env, permanentFileId, action.trackTitle, action.artistId, action.albumId, duration);
        
        if (success) {
          await sendMessage(env, chatId, `✅ Track saved!\n\n🎵 ${action.trackTitle}\n🎤 ${action.artistName}\n⏱️ ${duration} seconds`);
        } else {
          await sendMessage(env, chatId, '❌ Failed to save to database.');
        }
      } else {
        await sendMessage(env, chatId, `❌ Failed to save audio.\n\nError: ${forwardResult.description || 'Unknown error'}\n\nMake sure bot is admin in private channel.`);
      }
    } catch (error) {
      await sendMessage(env, chatId, `❌ Error: ${error.message}`);
    }
    
    pendingActions.delete(userId);
    return;
  }
  
  pendingActions.delete(userId);
}

async function listArtistsSimple(env) {
  const db = env.DB;
  const artists = await db.prepare('SELECT id, name FROM artists ORDER BY name').all();
  return artists.results || [];
}

async function listAlbumsSimple(env, artistId) {
  const db = env.DB;
  const albums = await db.prepare('SELECT id, name FROM albums WHERE artist_id = ? ORDER BY name').bind(artistId).all();
  return albums.results || [];
}