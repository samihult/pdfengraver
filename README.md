# PdfEngraver

Yet another headless Chrome PDF generator.

## Running

In docker:

```shell
# Run the server
docker run --rm -it -p 5045:5045 --name pe samihult/pdfengraver

# Open the playground
open http://localhost:5045
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

| name  | Time spent (ms)                           |
|-------| ----------------------------------------- |
| tmpl  | Executing a template                      |
| init  | Opening connection to the headless Chrome |
| load  | Loading the document                      |
| rend  | Rendering PDF                             |
| total | Total time                                |

## Location

The page to be rendered is virtually served at `file:///`, unless the location is
overridden by passing a `Content-Location` header. For example:

```shell
curl -X POST localhost:5045/conv \
  -H "Content-Type: text/html" \
  -H "Content-Location: https://en.wikipedia.org/wiki/" \
  ...
```

This affects what resources you will be able to use and how the links look like.

NOTE! The URL needs to have a directory path. If it doesn't end with a slash, then
`/` will be appended.

## Performance budgeting

Time budgets for different phases can be set using `Performance-Budget` header on the
request. The budgeting follows the same naming as `Server-Timing` header, explained
about. The maximum timeout can be set by the environment variable `PE_MAX_BUDGET`.

| name  | Default (ms) | Minimum (ms) | Maximum (ms)  |
| ----- | ------------ | ------------ | ------------- |
| tmpl  | 2 \* 000     | 50           | PE_MAX_BUDGET |
| init  | 200          | 10           | PE_MAX_BUDGET |
| load  | 30 \* 1000   | 200          | PE_MAX_BUDGET |
| rend  | 30 \* 1000   | 100          | PE_MAX_BUDGET |
| total | 60 \* 1000   | 1000         | PE_MAX_BUDGET |

The format is a key-value pair list:

```http request
Performance-Budget: load=60, total=120000
```

## Local assets

Assets can be mounted at `/assets`. They will be accessible as if they were served
next to your html page; see the chapter about "Location" above.

Mounting the volume:

```shell
docker run --rm -it -p 5045:5045 \
  --volume "$(pwd)/assets":/assets \
  --name pe samihult/pdfengraver:latest
```

Then, for example, having `picture.png` in the mounted `assets/img` directory, it can
be referenced like this in HTML.

```html
<img src="img/picture.png" />
```

## Templates

[Handlebars](https://handlebarsjs.com/) templates are supported. They will be placed
on the asset volume with a naming scheme of your choosing.

For example, a file named `report.html` could reside on the asset volume. It could look
like this:

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

PdfEngraver provides helpers to include templates from other files.

```handlebars
{{include "header.html"}}
{{register "reusable-block.handlebars" as="reusableBlock"}}
...
{{> reusableBlock}}
```

## Configuration

You can pass the following environment variables to configure the service:

| Variable              | Description                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------- |
| PE_QUIET              | Minimal noise                                                                                           |
| PE_SILENT             | Only errors and specifically enabled noise                                                              |
| PE_BASE_URL           | Base URL for linking, defaults to `http://localhost:5045`                                               |
| PE_DISABLE_PLAYGROUND | Disable playground at /                                                                                 |
| PE_PAYLOAD_LIMIT      | Maximum acceptable payload size. For format, see https://www.npmjs.com/package/bytes. Defaults to 10MB. |
| PE_MAX_BUDGET         | Maximum acceptable time budget value in ms. Minimum value is 1000. Defaults to 5 \* 60 \* 1000.         |
| PE_TRACE_CONSOLE      | Log all console events                                                                                  |
| PE_TRACE_REQ          | Log all requests                                                                                        |
