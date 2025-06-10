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

  // mainWindow.webContents.openDevTools();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.

let projects = null;
let credentials;

// convert fetch response to readable stream
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

const fetchProjectList = async (type = "projects") => {
  const url = `https://api.glitch.com/v1/users/by/id/${type}?id=${credentials.id}&limit=1000`;
  const result = await fetch(url, {
    headers: {
      Authorization: credentials.persistentToken,
    },
  });
  const response = await result.json();
  return response.items || [];
};

async function getProjects(event, { id, persistentToken }) {
  credentials = { id, persistentToken };
  console.log(credentials);
  console.log("got GP args", id, persistentToken);
  projects = (await fetchProjectList()).concat(
    await fetchProjectList("deletedProjects")
  );
  mainWindow?.webContents.send("gotProjects", projects);
  glitchWindow.close();
  glitchWindow = null;
}

const decodeTar = async (packageStream, appDownloadFolder) =>
  new Promise((done, reject) => {
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

const downloadAssets = async (assetManifestPath, appDownloadFolder) => {
  let gotAllAssets = true;
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
      // old project have an expired domain, skip
      if (url.origin === "https://cdn.hyperdev.com") continue;
      await writeFile(
        path.join(assetOutPath, asset.name),
        responseToReadable(await fetch(asset.url))
      );
    } catch (e) {
      // failing to get some assets isn't a showstopper, so just warn about it
      gotAllAssets = false;
      console.warn("failed to get asset", asset, e);
    }
  }
  return gotAllAssets;
};

const downloadProject = async (project, downloadFolder) => {
  console.log("downloading project", project.id);
  const appDownloadFolder = path.join(
    downloadFolder,
    "glitch-project-downloader",
    project.domain
  );
  try {
    await stat(appDownloadFolder);
    return { success: true, message: "folder already exists" };
  } catch (e) {
    if (e.code !== "ENOENT") {
      console.error(e);
    }
  }

  // get pacakge tarball
  const packageURL = `https://api.glitch.com/project/download/?authorization=${credentials.persistentToken}&projectId=${project.id}`;
  const req = await fetch(packageURL);
  if (req.status === 404) {
    return { error: "project archive not found" };
  }
  if (req.status !== 200) {
    return { error: "failed to fetch archive" };
  }

  try {
    await mkdir(appDownloadFolder, { recursive: true });
  } catch (e) {
    if (e.code !== "EEXIST") {
      console.error(e);
      return { error: "failed to create download folder" };
    }
  }

  const packageStream = responseToReadable(req);

  // extract tar and write individual files
  await decodeTar(packageStream, appDownloadFolder);

  // get assets and download them
  const assetManifestPath = path.join(appDownloadFolder, ".glitch-assets");
  let hasAssets = false;
  let gotAllAssets = true;
  try {
    await stat(assetManifestPath);
    hasAssets = true;
  } catch (e) {
    console.warn(e);
    hasAssets = false;
  }
  try {
    if (hasAssets) {
      gotAllAssets = await downloadAssets(assetManifestPath, appDownloadFolder);
    }
  } catch (e) {
    console.error(e);
    return { error: "failed to download assets" };
  }

  if (!gotAllAssets) {
    return { success: true, warning: "failed to download some assets" };
  }
  return { success: true };
};

app.whenReady().then(() => {
  createWindow();

  const downloadFolder = app.getPath("downloads");

  ipcMain.handle("openDownloadFolder", async () => {
    // deconstructing assignment
    const appDownloadFolder = path.join(
      downloadFolder,
      "glitch-project-downloader"
    );
    shell.showItemInFolder(appDownloadFolder);
  });

  // get project list from glitch
  ipcMain.handle("getProjects", getProjects);

  // launch glitch login window
  ipcMain.handle("openGlitchWindow", async () => {
    glitchWindow = new BrowserWindow({
      width: 1024,
      height: 720,
      webPreferences: {
        preload: path.join(__dirname, "glitch-preload.js"),
      },
    });
    glitchWindow.loadURL("https://glitch.com/dashboard");
  });

  // download single glitch project
  ipcMain.handle("downloadProject", (event, project) => {
    return downloadProject(project, downloadFolder);
  });
});

app.on("window-all-closed", () => {
  app.quit();
});
