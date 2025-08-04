console.log("[popup.js] Chargé !");

// Bouton notification
document.getElementById("testNotificationButton").addEventListener("click", function () {
  // Utilisez l'API chrome.notifications.create pour que le service worker puisse gérer le clic
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icon.png", // Assurez-vous que le chemin est correct pour votre extension
    title: "Notification de Test",
    message: "Ceci est une notification de test. Cliquez pour ouvrir la page de vote.",
    priority: 2,
  }, (notificationId) => {
    if (chrome.runtime.lastError) {
      console.error("[VoteNotifier] Erreur lors de la création de la notification de test :", chrome.runtime.lastError);
    } else {
      console.log(`[VoteNotifier] Notification de test créée avec l'ID : ${notificationId}`);
    }
  });
});