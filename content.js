// Debug test
console.log("[Content Script] Injecté et actif.");

// Lorsque le service worker demande le timer
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[Content Script] Message reçu : ", message);
  
  if (message.action === 'getVoteTimer') {
    console.log("[Content Script] Demande de récupération du timer reçue.");
    
    const voteTimer = document.querySelector('.vote-timer');
    
    // Si le timer existe, renvoyer le texte du timer
    if (voteTimer) {
      console.log("[Content Script] Timer trouvé : ", voteTimer.textContent);
      sendResponse({ timeString: voteTimer.textContent });
    } else {
      console.log("[Content Script] Pas de timer trouvé.");
      sendResponse({ timeString: '' });
    }
  } else {
    console.log("[Content Script] Action non reconnue.");
  }

  // Retourner 'true' pour indiquer que la réponse est asynchrone
  return true;
});