import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { mkdir, writeFile, stat, readFile } from "node:fs/promises";
import started from "electron-squirrel-startup";
import { Readable } from "node:stream";
import unzip from "gunzip-maybe";
import tar from "tar-stream";
import { shell } from "electron";
import { URL } from "node:url";

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

let glitchWindow;
let mainWindow;

const createWindow = () => {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }

  // Open the DevTools.
  mainWindow.webContents.openDevTools();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.

let projects = null;
let credentials;

const responseToReadable = (response) => {
  const reader = response.body.getReader();
  const rs = new Readable();
  rs._read = async () => {
    const result = await reader.read();
    if (!result.done) {
      rs.push(Buffer.from(result.value));
    } else {
      rs.push(null);
      return;
    }
  };
  return rs;
};

app.whenReady().then(() => {
  createWindow();

  const downloadFolder = app.getPath("downloads");

  ipcMain.handle("openDownloadFolder", async (event) => {
    // deconstructing assignment
    const appDownloadFolder = path.join(
      downloadFolder,
      "glitch-project-downloader"
    );
    shell.showItemInFolder(appDownloadFolder);
  });

  ipcMain.handle("getProjects", async (event, { id, persistentToken }) => {
    credentials = { id, persistentToken };
    console.log("got GP args", id, persistentToken);
    const url = `https://api.glitch.com/v1/users/by/id/projects?id=${id}&limit=1000`;
    const result = await fetch(url, {
      headers: {
        Authorization: persistentToken,
      },
    });
    const response = await result.json();
    projects = response.items;
    mainWindow?.webContents.send("gotProjects", projects);
    glitchWindow.close();
    glitchWindow = null;
    return response;
  });

  ipcMain.handle("openGlitchWindow", async () => {
    if (!glitchWindow) {
      glitchWindow = new BrowserWindow({
        width: 1024,
        height: 720,
        webPreferences: {
          preload: path.join(__dirname, "preload.js"),
        },
      });
    }
    glitchWindow.loadURL("https://glitch.com");
  });

  ipcMain.handle("downloadProject", async (event, project) => {
    console.log("downloading project", project.id);
    const appDownloadFolder = path.join(
      downloadFolder,
      "glitch-project-downloader",
      project.domain
    );
    try {
      let s = await stat(appDownloadFolder);
      return { success: true, message: "folder already exists" };
    } catch (e) {
      if (e.code !== "ENOENT") {
        console.error(e);
      }
    }
    try {
      await mkdir(appDownloadFolder, { recursive: true });
    } catch (e) {
      if (e.code !== "EEXIST") {
        console.error(e);
        return { error: "failed to create download folder" };
      }
    }

    const packageURL = `https://api.glitch.com/project/download/?authorization=${credentials.persistentToken}&projectId=${project.id}`;
    const packageStream = responseToReadable(await fetch(packageURL));

    await new Promise((done, reject) => {
      const extract = tar.extract();

      extract.on("entry", async function (header, stream, next) {
        const filePath = header.name;
        const relativePath = path.relative("app", filePath);
        const outPath = path.join(appDownloadFolder, relativePath);

        stream.on("end", function () {
          next(); // ready for next entry
        });

        try {
          if (header.type === "directory") {
            await mkdir(outPath, { recursive: true });
          } else {
            await writeFile(outPath, stream);
          }
        } catch (e) {
          console.error(e);
          reject(e);
        }

        stream.resume(); // just auto drain the stream
      });

      extract.on("finish", function () {
        done();
      });

      packageStream.pipe(unzip()).pipe(extract);
    });

    const assetManifestPath = path.join(appDownloadFolder, ".glitch-assets");
    let hasAssets = false;
    let gotAllAssets = true;
    try {
      await stat(assetManifestPath);
      hasAssets = true;
    } catch (e) {}
    try {
      if (hasAssets) {
        console.log("fetching assets");
        const assetOutPath = path.join(appDownloadFolder, "glitch-assets");
        await mkdir(assetOutPath, { recursive: true });
        // load, split lines, remove blank lines, parse json
        let assets = (await readFile(assetManifestPath))
          .toString("utf8")
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l.length)
          .map((s) => JSON.parse(s));
        // remove assets flagged as deleted
        assets
          .filter((a) => a.deleted)
          .forEach((a) => {
            assets = assets.filter((b) => b.uuid !== a.uuid);
          });
        for (let asset of assets) {
          console.log(asset.name);
          try {
            const url = new URL(asset.url);
            if (url.origin === "https://cdn.hyperdev.com") continue;
            await writeFile(
              path.join(assetOutPath, asset.name),
              responseToReadable(await fetch(asset.url))
            );
          } catch (e) {
            gotAllAssets = false;
            console.warn("failed to get asset", asset, e);
          }
        }
      }
    } catch (e) {
      console.error(e);
      return { error: "failed to download assets" };
    }

    if (!gotAllAssets) {
      return { success: true, warning: "failed to download some assets" };
    }
    return { success: true };
  });

  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

/*https://api.glitch.com/v1/users/by/id/projects?id={user_id}&limit=1000*/

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
