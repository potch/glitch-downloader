import "./index.css";

const _ = (tag, props, ...children) => {
  const el = Object.assign(document.createElement(tag), props);
  el.append(...children);
  return el;
};

document.querySelector("#openGlitch").addEventListener("click", (e) => {
  API.openGlitchWindow();
});

document.querySelector("#openDownloadFolder").addEventListener("click", (e) => {
  API.openDownloadFolder();
});

API.onGotProjects((projects) => {
  let downloading = false;
  const downloadAllProjects = async () => {
    const status = document.querySelector("#download-status");
    status.style.display = "block";
    const logs = document.querySelector("#download-logs");
    const progress = document.querySelector("#download-progress");
    progress.max = projects.length;
    const log = (o) => {
      logs.innerText += o + "\n";
      logs.scrollTop = logs.scrollHeight;
    };

    downloading = true;
    document.body.classList.add("downloading");

    for (let i = 0; i < projects.length; i++) {
      const project = projects[i];
      progress.value = i;
      log("downloading project " + project.domain);
      const result = await downloadProject(project);
      log(JSON.stringify(result));
      if (!downloading) {
        document.body.classList.remove("downloading");
        log("downloads stopped");
        return;
      }
    }
    document.body.classList.remove("downloading");
    progress.value = projects.length;
    log("download complete!");
  };

  const downloadProject = async (project) => {
    console.log("downloading project", project.id);
    const el = document.querySelector(`[data-project="${project.id}"]`);
    const button = el.querySelector("button");
    button.disabled = true;
    button.innerText = "Downloading...";

    const result = await API.downloadProject(project);
    console.log("download result", result);
    if (result.success) {
      el.querySelector(".project_status").innerText = " ✅";
    } else {
      button.disabled = false;
      button.innerText = "Download Project";
      el.querySelector("button").disabled = false;
    }
    document.querySelector("#openDownloadFolder").style.display = "block";
    return result;
  };

  console.log("got projects", projects);
  const projectList = _("ul", { className: "projects" });
  const results = _(
    "div",
    { className: "results" },
    "found ",
    _("b", {}, projects.length),
    " projects",
    _(
      "div",
      { id: "download-all" },
      _(
        "button",
        { id: "download-start", onclick: () => downloadAllProjects() },
        "Download All Projects"
      ),
      _(
        "button",
        { id: "download-stop", onclick: () => (downloading = false) },
        "Stop Download"
      ),
      _(
        "div",
        { id: "download-status" },
        _("progress", { id: "download-progress" }),
        _("pre", { id: "download-logs" })
      )
    ),
    projectList
  );
  document.body.append(results);

  for (const project of projects) {
    const projectEl = _(
      "li",
      { className: "project" },
      _(
        "h3",
        {},
        project.domain,
        _("span", { className: "pill" }, project.appType)
      ),
      _("p", { className: "project__desc" }, project.description),
      _(
        "button",
        {
          className: "project_download",
          onclick: (e) => downloadProject(project),
        },
        "Download Project"
      ),
      _("span", { className: "project_status" })
    );
    projectEl.setAttribute("data-project", project.id);
    projectList.append(projectEl);
  }
});
