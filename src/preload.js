// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("API", {
  getProjects: ({ username, persistentToken }) =>
    ipcRenderer.invoke("getProjects", { username, persistentToken }),
  openGlitchWindow: () => ipcRenderer.invoke("openGlitchWindow"),
  onGotProjects: (callback) =>
    ipcRenderer.on("gotProjects", (_event, projects) => callback(projects)),
  downloadProject: (project) => ipcRenderer.invoke("downloadProject", project),
  openDownloadFolder: () => ipcRenderer.invoke("openDownloadFolder"),
});

window.onload = () => {
  if (window.location.origin === "https://glitch.com") {
    const cachedUser = localStorage.getItem("cachedUser");
    if (cachedUser) {
      const { id, persistentToken } = JSON.parse(cachedUser);
      console.log("got creds", id, persistentToken);
      ipcRenderer.invoke("getProjects", { id, persistentToken });
    }
  }
};
