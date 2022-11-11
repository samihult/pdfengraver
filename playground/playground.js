$(document).ready(function () {
  require.config({
    paths: {
      vs: "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.26.1/min/vs",
    },
  });

  let htmlEditor;

  function sendHtml() {
    const html = htmlEditor.getValue();
    fetch("/conv", {
      method: "POST",
      headers: [["Content-Type", "text/html"]],
      body: html,
    })
      .then((response) => response.blob())
      .then((myBlob) => {
        document.getElementById("pdf-viewer").src = URL.createObjectURL(myBlob);
      });
  }

  require(["vs/editor/editor.main"], () => {
    htmlEditor = monaco.editor.create(
      document.querySelector("#html-editor-container .inner-container"),
      {
        value: getDefaultHtml(),
        language: "html",
        theme: "vs-dark",
        automaticLayout: true,
      }
    );

    htmlEditor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KEY_S,
      sendHtml
    );
  });

  document.addEventListener(
    "keydown",
    function (e) {
      if (
        (window.navigator.platform.match("Mac") ? e.metaKey : e.ctrlKey) &&
        e.keyCode == 83
      ) {
        e.preventDefault();
        sendHtml();
      }
    },
    false
  );

  $("#send-html").click(sendHtml);

  Split(["#control", "#result"], {
    sizes: [35, 65],
  });
});

function getDefaultHtml() {
  return `
<html>

<head>
    <script src="https://unpkg.com/pagedjs/dist/paged.polyfill.js"></script>
    <style>
        @page {
            size: A4 portrait;
            margin: 2cm;

            @bottom-center {
                content: counter(page)" ("counter(pages)")";
            }
        }
    </style>
</head>

<body>
    <p>Hello, friend!</p>
    <p style="text-align: center">
        <img src="https://upload.wikimedia.org/wikipedia/commons/5/51/Mr._Smiley_Face.svg"/>
    </p>
</body>

</html>
`;
}
