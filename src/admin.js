import { pendingActions } from './bot.js';
import { sendMessage } from './utils.js';
import { addArtist, addAlbum, addTrack, listArtists, showStats } from './commands.js';

export async function handleAdminCommand(env, chatId, userId, text, msg) {
  // /addartist
  if (text === '/addartist') {
    pendingActions.set(userId, { step: 'waiting_artist_name' });
    await sendMessage(env, chatId, 'Send me the ARTIST NAME.\n\nExample: Michael Jackson');
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
  
  // Step: Waiting for artist name
  if (action.step === 'waiting_artist_name') {
    const artistName = text.trim();
    
    if (!artistName) {
      await sendMessage(env, chatId, 'Please send a valid artist name.');
      return;
    }
    
    const success = await addArtist(env, artistName);
    
    if (success) {
      await sendMessage(env, chatId, `✅ Artist "${artistName}" added!\n\nUse /addalbum to add albums or /addtrack to upload songs.`);
    } else {
      await sendMessage(env, chatId, `❌ Artist "${artistName}" already exists.`);
    }
    
    pendingActions.delete(userId);
    return;
  }
  
  pendingActions.delete(userId);
}