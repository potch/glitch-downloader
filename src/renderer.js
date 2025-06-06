import "./index.css";

const _ = (tag, props, ...children) => {
  const el = Object.assign(document.createElement(tag), props);
  el.append(...children);
  return el;
};

document.querySelector("#openGlitch").addEventListener("click", (e) => {
  API.openGlitchWindow();
});

API.onGotProjects((projects) => {
  console.log("got projects", projects);
  const projectList = _("ul", {});
  const results = _(
    "div",
    { className: "results" },
    "found ",
    _("b", {}, projects.length),
    " projects",
    projectList
  );
  document.body.append(results);

  const downloadProject = async (project) => {
    console.log("downloading project", project.id);
    const result = await API.downloadProject(project);
    console.log("download result", result);
  };

  for (const project of projects) {
    const projectEl = _(
      "li",
      { className: "project", "data-project": project.id },
      _("h3", {}, project.domain),
      _("p", { className: "project__desc" }, project.description),
      _(
        "button",
        {
          className: "project_download",
          onclick: () => downloadProject(project),
        },
        "Download Project"
      )
    );
    projectList.append(projectEl);
  }
});
