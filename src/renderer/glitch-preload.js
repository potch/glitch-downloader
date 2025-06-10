const { ipcRenderer } = require("electron");

window.addEventListener("load", () => {
  const backButton = document.createElement("button");

  const checkBackButton = () => {
    if (history.length > 1) {
      backButton.style.display = "block";
    }
  };

  backButton.innerText = "⬅️ Back";
  backButton.setAttribute(
    "style",
    "position:fixed;top:1rem;left:1rem;font-size:1.2rem;display:none;"
  );
  backButton.onclick = () => {
    history.back();
  };
  document.body.append(backButton);
  window.addEventListener("hashchange", checkBackButton);
  checkBackButton();
  if (window.location.origin === "https://glitch.com") {
    const poll = () => {
      const cachedUser = JSON.parse(localStorage.getItem("cachedUser") || "{}");
      if (cachedUser && cachedUser.login) {
        const { id, persistentToken } = cachedUser;
        ipcRenderer.invoke("getProjects", { id, persistentToken });
      } else {
        setTimeout(poll, 500);
      }
    };
    poll();
  }
});
