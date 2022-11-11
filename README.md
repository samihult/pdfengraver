# PDFEngraver

Yet another headless Chrome PDF generator.

## Running

In docker:

```shell
docker run --rm -it -p 5045:5045 --name pe samihult/pdfengraver
```

## Convert HTML

```shell
cat <<EOF | curl -X POST localhost:5045/conv \
  -H "Content-Type: text/html" -o hello.pdf -d @-
<html>
  <head>
    <!-- See https://pagedjs.org/ -->
    <script src="https://unpkg.com/pagedjs/dist/paged.polyfill.js"></script>
    <style>
      @page {
        size: A4 portrait;
        margin: 2cm 2cm 4cm 3cm;
        @bottom-center {
          content: counter(page);
        }
      }
    </style>
  </head>
  <body>
    <p>Hello, friend!</p>
    <img src="https://upload.wikimedia.org/wikipedia/commons/5/51/Mr._Smiley_Face.svg"/>
  </body>
</html>
EOF

# Server-Timing: init;dur=61.684, load;dur=1884.020, rend;dur=30.269, tot;dur=1976.196
# Content-Type: application/pdf
# Content-Length: 18904
```

Server-Timing headers can be interpreted as follows:

| name | Time spent (ms)                           |
| ---- | ----------------------------------------- |
| tmpl | Executing a template                      |
| init | Opening connection to the headless Chrome |
| load | Loading the document                      |
| rend | Rendering PDF                             |
| tot  | Total time                                |

## Local assets

Assets can be mounted at `/assets`. You can imagine then your HTML payload to be served at
the server root and the assets next to it. The HTML is, in fact, virtually served at `file:///`,
so all of these point to the same file:

- `img/picture.png`
- `/img/picture.png`
- `file:/img/picture.png`
- `file:///img/picture.png`

Mounting the volume:

```shell
docker run --rm -it -p 5045:5045 \
  --volume "$(pwd)/assets":/assets \
  --name pe samihult/pdfengraver
```

Then, for example, having `picture.png` in the mounted `assets` directory, it can be referenced
like this in HTML.

```html
<img src="picture.png" />
```

## Install templates

[Handlebars](https://handlebarsjs.com/) templates are supported. They will be placed on the asset
volume with a naming scheme of your choosing.

For example, a file named `report.html` could reside on the asset volume. It could look like this:

```html
<html>
  <body>
    <h1>{{title}}</h1>
    <p>{{author}}</p>
  </body>
</html>
```

You can then execute the template by sending the data to the server at `/tmpl/report.html`:

```shell
cat <<EOF | curl -X POST localhost:5045/tmpl/report.html \
  -H "Content-Type: application/json" -o hello.pdf -d @-
{
  "title": "Very important report",
  "author": "Yours truly"
}
EOF
```

Because you lack full control of Handlebars, this is not going to work in all cases, but the
option could come in handy for some applications.

## Configuration

You can pass the following environment variables to configure the service:

| Variable              | Description                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------- |
| PE_QUIET              | Minimal noise                                                                                           |
| PE_SILENT             | Only errors and specifically enabled noise                                                              |
| PE_BASE_URL           | Base URL for linking, defaults to `http://localhost:5045`                                               |
| PE_DISABLE_PLAYGROUND | Disable playground at /                                                                                 |
| PE_PAYLOAD_LIMIT      | Maximum acceptable payload size. For format, see https://www.npmjs.com/package/bytes. Defaults to 10MB. |
| PE_TRACE_CONSOLE      | Log all console events                                                                                  |
| PE_TRACE_REQ          | Log all requests                                                                                        |
