$(document).ready(function () {
  setupHtmlEditor();
  setupHostInput();
  setupSplitView();
});

function setupHtmlEditor() {
  require.config({
    paths: {
      vs: "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.26.1/min/vs",
    },
  });

  require(["vs/editor/editor.main"], () => {
    window.peHtmlEditor = monaco.editor.create(
      document.querySelector("#html-editor-container .inner-container"),
      {
        value: getDefaultHtml(),
        language: "html",
        theme: "vs-dark",
        automaticLayout: true,
      }
    );

    window.peHtmlEditor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
      sendHtml
    );
  });

  document.addEventListener(
    "keydown",
    function (event) {
      if (
        (window.navigator.platform.match("Mac")
          ? event.metaKey
          : event.ctrlKey) &&
        event.keyCode === 13
      ) {
        event.preventDefault();
        sendHtml();
      }
    },
    false
  );

  document.getElementById("send-html").addEventListener("click", sendHtml);
}

function setupHostInput() {
  const hostForm = document.getElementById("server-host-input");
  const hostInput = hostForm.querySelector('[name="host"]');

  const isFileProtocol = window.location.protocol === "file:";
  const currentHost = !isFileProtocol
    ? window.location.protocol + "//" + window.location.host
    : "file:///";

  const storedHost = localStorage.getItem("pe-host");
  hostInput.value = storedHost || currentHost;

  function setDefaultHost(event) {
    event.preventDefault();
    localStorage.setItem("pe-host", hostInput.value);
  }

  hostForm.addEventListener("submit", setDefaultHost);
  hostInput.addEventListener("blur", setDefaultHost);
}

function getPeHost() {
  const hostForm = document.getElementById("server-host-input");
  const hostInput = hostForm.querySelector('[name="host"]');
  return hostInput.value;
}

function getContentLocation() {
  const contentLocationForm = document.getElementById("content-location-input");
  const contentLocationInput = contentLocationForm.querySelector(
    '[name="content-location"]'
  );
  return contentLocationInput.value || undefined;
}

function setupSplitView() {
  Split(["#control", "#result"], {
    sizes: [35, 65],
  });
}

function sendHtml() {
  const html = window.peHtmlEditor.getValue();
  const host = getPeHost();
  const location = getContentLocation();

  const url = new URL("/conv", host);

  const headers = [["Content-Type", "text/html"]];
  if (location) {
    headers.push(["Content-Location", location]);
  }

  fetch(url.toString(), {
    method: "POST",
    headers,
    body: html,
  })
    .then((response) => {
      setServerTimingString(response.headers.get("Server-Timing"));
      return response.blob();
    })
    .then((myBlob) => {
      document.getElementById("pdf-viewer").src = URL.createObjectURL(myBlob);
    });
}

function setServerTimingString(serverTiming) {
  const container = document.getElementById("server-timing-string");

  if (serverTiming && container) {
    const timings = Object.fromEntries(
      serverTiming
        .split(",")
        .map((item) => item.trim().split(";"))
        .map(([name, ...parts]) => [
          name,
          Object.fromEntries(parts.map((part) => part.split("="))),
        ])
    );

    container.querySelector(".init").innerText = timings.init
      ? timings.init.dur
      : "–";
    container.querySelector(".load").innerText = timings.load
      ? timings.load.dur
      : "–";
    container.querySelector(".rend").innerText = timings.rend
      ? timings.rend.dur
      : "–";
    container.querySelector(".tot").innerText = timings.tot
      ? timings.tot.dur
      : "–";
  }
}

function getDefaultHtml() {
  return atob(
    "PGh0bWw+Cgo8aGVhZD4KICAgIDxzY3JpcHQgc3JjPSJodHRwczovL3VucGtnLmNvbS9wYWdlZGpzL2Rpc3QvcGFnZWQucG9seWZpbGwuan" +
      "MiPjwvc2NyaXB0PgogICAgPHN0eWxlPgogICAgICAgIEBwYWdlIHsKICAgICAgICAgICAgc2l6ZTogQTQgcG9ydHJhaXQ7CiAgICAgICAgICAgIG" +
      "1hcmdpbjogMmNtOwoKICAgICAgICAgICAgQGJvdHRvbS1jZW50ZXIgewogICAgICAgICAgICAgICAgY29udGVudDogY291bnRlcihwYWdlKSIgKC" +
      "Jjb3VudGVyKHBhZ2VzKSIpIjsKICAgICAgICAgICAgfQogICAgICAgIH0KICAgIDwvc3R5bGU+CjwvaGVhZD4KCjxib2R5PgogICAgPHA+SGVsbG" +
      "8sIGZyaWVuZCE8L3A+CiAgICA8cCBzdHlsZT0idGV4dC1hbGlnbjogY2VudGVyIj4KICAgICAgICA8aW1nIHNyYz0iaHR0cHM6Ly91cGxvYWQud2" +
      "lraW1lZGlhLm9yZy93aWtpcGVkaWEvY29tbW9ucy81LzUxL01yLl9TbWlsZXlfRmFjZS5zdmciLz4KICAgIDwvcD4KPC9ib2R5PgoKPC9odG1sPg=="
  );
}
