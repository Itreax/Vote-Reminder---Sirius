console.log("[VoteNotifier] Service Worker lancé !");

// URLs à surveiller
const voteUrls = [
  'https://sirius-game.fr/vote',
  'https://www.sirius-game.fr/vote'
];

// Durée du cooldown en ms (1h30)
const VOTE_COOLDOWN_MS = 90 * 60 * 1000; // 5400000 ms

// Nombre maximal de notifications quand la page est fermée
const MAX_CLOSED_PAGE_NOTIFICATIONS = 5;

// Nom de l'alarme pour la vérification périodique
const ALARM_NAME = "voteCheckAlarm";
// Intervalle de l'alarme en minutes (10 secondes = 10/60 minutes)
const ALARM_INTERVAL_MINUTES = 20 / 60; // Environ 0.166 minutes

// Fonction utilitaire pour formater les secondes en HH:MM:SS
function formatSecondsToHMS(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (num) => num.toString().padStart(2, '0');

  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

// Lors de l'installation de l'extension
chrome.runtime.onInstalled.addListener(() => {
  console.log("[VoteNotifier] Extension installée et prête !");

  // Recharger la page de vote si elle est ouverte
  reloadVotePageIfOpen();

  // Vérifie immédiatement le timer après le rechargement (après 1s)
  setTimeout(checkIfVoted, 1000);

  // Créer ou mettre à jour l'alarme pour la vérification périodique
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: ALARM_INTERVAL_MINUTES });
  console.log(`[VoteNotifier] Alarme '${ALARM_NAME}' créée pour une vérification toutes les ${ALARM_INTERVAL_MINUTES * 60} secondes.`);

  // Initialise le compteur de notifications
  chrome.storage.local.set({ notificationCount: 0 });
});

// Écouteur pour les alarmes déclenchées
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    console.log("[VoteNotifier] Alarme déclenchée, vérification du vote...");
    checkIfVoted();
  }
});

// Fonction pour envoyer une notification
async function sendVoteNotification() {
  console.log("[VoteNotifier] Envoi de la notification..."); // Ce log doit apparaître si la fonction est appelée

  const data = await chrome.storage.local.get('notificationCount');
  let count = data.notificationCount || 0;

  // Récupère l'état de l'onglet pour savoir si la page est ouverte ou fermée
  const tabs = await chrome.tabs.query({ url: voteUrls.map(url => url + '*') });
  const isPageOpen = tabs.length > 0;

  if (!isPageOpen && count >= MAX_CLOSED_PAGE_NOTIFICATIONS) {
    console.log(`[VoteNotifier] Limite de ${MAX_CLOSED_PAGE_NOTIFICATIONS} notifications atteinte pour la page fermée. Pas d'envoi.`);
    return;
  }

  chrome.notifications.create({
    type: "basic",
    iconUrl: "icon.png",
    title: "Vote disponible !",
    message: "Vous pouvez voter à nouveau sur Sirius.",
    priority: 2,
  }, (notificationId) => {
    if (chrome.runtime.lastError) {
      console.log("[VoteNotifier] Erreur lors de la création de la notification :", chrome.runtime.lastError);
    } else {
      console.log(`[VoteNotifier] Notification créée avec l'ID : ${notificationId}`); // Ce log doit apparaître si la notif est créée
      if (!isPageOpen) { // Incrémente le compteur seulement si la page est fermée
        count++;
        chrome.storage.local.set({ notificationCount: count });
        console.log(`[VoteNotifier] Compteur de notifications (page fermée) : ${count}`);
      }
    }
  });
}

// Réinitialiser le compteur de notifications lorsque l'utilisateur clique sur la notification
chrome.notifications.onClicked.addListener(async (notificationId) => {
  console.log("[VoteNotifier] Notification cliquée, réinitialisation du compteur.");
  await chrome.storage.local.set({ notificationCount: 0 });
  // Optionnel : Ouvrir la page de vote quand la notification est cliquée
  chrome.tabs.create({ url: voteUrls[0] });
});

// Stocker la date du début du cooldown
async function storeVoteCooldownStartTime(secondsRemaining) {
  const now = Date.now();
  // Calculate the estimated start time of the cooldown based on current time and remaining seconds.
  const estimatedStartTime = now - (VOTE_COOLDOWN_MS - (secondsRemaining * 1000));
  await chrome.storage.local.set({ voteTime: estimatedStartTime });
  console.log("[VoteNotifier] Date de début de cooldown enregistrée (estimée) :", new Date(estimatedStartTime).toLocaleString());

  // Quand un nouveau cooldown est détecté (la page est ouverte avec un timer actif),
  // on réinitialise le compteur de notifications.
  await chrome.storage.local.set({ notificationCount: 0 });
  console.log("[VoteNotifier] Compteur de notifications réinitialisé (nouveau cooldown détecté).");
}

// Fonction principale pour vérifier le vote
function checkIfVoted() {
  // Recherche d'onglets avec la page vote ouverte
  chrome.tabs.query({ url: voteUrls.map(url => url + '*') }, async (tabs) => {
    if (tabs.length > 0) {
      // Page vote ouverte : demander le timer au content script
      const tabId = tabs[0].id;
      console.log("[VoteNotifier] Onglet vote trouvé (id:", tabId, ") - demande timer au content script.");

      chrome.tabs.sendMessage(tabId, { action: "getVoteTimer" }, async (response) => {
        if (chrome.runtime.lastError) {
          console.log("[VoteNotifier] Erreur de communication avec content script :", chrome.runtime.lastError.message);
          return;
        }

        if (response && typeof response.timeString === 'string') {
          const timeString = response.timeString.trim();
          console.log("[VoteNotifier] Timer reçu :", timeString === '' ? '[vide]' : timeString);

          if (!timeString || timeString === '00:00:10') {
            console.log("[VoteNotifier] Timer vide ou 00:00:10, envoi notif.");
            sendVoteNotification();
            await chrome.storage.local.remove('voteTime');
            await chrome.storage.local.set({ notificationCount: 0 });
            console.log("[VoteNotifier] Compteur de notifications réinitialisé (vote disponible sur page ouverte).");
          } else {
            const parts = timeString.split(":");
            if (parts.length !== 3) {
              console.log("[VoteNotifier] Format timer invalide.");
              return;
            }
            const hours = parseInt(parts[0]);
            const minutes = parseInt(parts[1]);
            const seconds = parseInt(parts[2]);
            const secondsRemaining = hours * 3600 + minutes * 60 + seconds;

            if (secondsRemaining <= 1) {
              console.log("[VoteNotifier] Cooldown fini, envoi notif.");
              sendVoteNotification();
              await chrome.storage.local.remove('voteTime');
              await chrome.storage.local.set({ notificationCount: 0 });
              console.log("[VoteNotifier] Compteur de notifications réinitialisé (cooldown fini sur page ouverte).");
            } else {
              await storeVoteCooldownStartTime(secondsRemaining);
              console.log(`[VoteNotifier] Cooldown actif: ${secondsRemaining}s restants.`);
            }
          }
        } else {
          console.log("[VoteNotifier] Réponse du content script invalide ou timeString manquant/non-string.");
          const data = await chrome.storage.local.get('voteTime');
          if (!data.voteTime) {
             sendVoteNotification();
             await chrome.storage.local.set({ notificationCount: 0 });
             console.log("[VoteNotifier] Compteur de notifications réinitialisé (pas de timer trouvé, potentiellement dispo).");
          }
        }
      });

    } else {
      // Page vote fermée : vérifier le timer stocké pour envoyer notif si cooldown fini
      const data = await chrome.storage.local.get('voteTime');
      const voteTime = data.voteTime || 0;
      const now = Date.now();

      if (voteTime && (now - voteTime) >= VOTE_COOLDOWN_MS) {
        console.log("[VoteNotifier] Page fermée, cooldown terminé, envoi notification.");
        sendVoteNotification();
      } else if (voteTime) {
        const remaining = Math.floor((VOTE_COOLDOWN_MS - (now - voteTime)) / 1000);
        const formattedRemaining = formatSecondsToHMS(remaining);
        console.log(`[VoteNotifier] Page fermée, cooldown en cours, temps restant: ${remaining}s (${formattedRemaining})`);
      } else {
        // Si la page est fermée et qu'aucun voteTime n'est enregistré, cela signifie que le vote est disponible.
        console.log("[VoteNotifier] Page fermée, pas de vote enregistré (ou cooldown déjà terminé et cleared). Envoi de notification.");
        sendVoteNotification(); // <-- Cette ligne doit maintenant s'exécuter.
      }
    }
  });
}

// Fonction pour recharger la page de vote si elle est ouverte
function reloadVotePageIfOpen() {
  chrome.tabs.query({ url: voteUrls.map(url => url + '*') }, (tabs) => {
    if (tabs.length > 0) {
      console.log("[VoteNotifier] Onglet de vote trouvé, rechargement...");
      chrome.tabs.reload(tabs[0].id);
    } else {
      console.log("[VoteNotifier] Pas d'onglet de vote ouvert.");
    }
  });
}