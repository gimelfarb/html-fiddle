# html-fiddle [![Build Status][travis-badge]][travis-href] [![Coverage Status][codecov-badge]][codecov-href] [![Semantic Versioning][semrel-badge]][semrel-href]

[travis-href]: https://travis-ci.org/gimelfarb/html-fiddle
[codecov-href]: https://codecov.io/gh/gimelfarb/html-fiddle
[semrel-href]: https://github.com/semantic-release/semantic-release

[travis-badge]: https://img.shields.io/travis/gimelfarb/html-fiddle/master.svg
[codecov-badge]: https://img.shields.io/codecov/c/gh/gimelfarb/html-fiddle.svg
[semrel-badge]: https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg

`html-fiddle` is a connect middleware for modifying response html. It can be useful with `http-proxy` to modify HTML returned from the remote target.

## Getting Started

### Installation

```bash
$ npm i --save html-fiddle
```

### Basic Usage

Use as connect middleware in your server. Provide a `through` function which returns a transform stream for HTML.

```javascript
const fiddle = require('html-fiddle');
const replaceStream = require('replacestream');

app.use(fiddle({
    through: () => replaceStream('Original', 'Replaced')
}));
```

Above example uses [`replacestream`](https://github.com/eugeneware/replacestream) library to create a stream which
will transform the HTML. This will cause all text matching `"Original"` to be replaced with `"Replaced"`.

Given: `<html><body>Original!</body></html>`
Result: `<html><body>Replaced!</body></html>`

## Examples

### Use with `http-proxy` to modify proxied HTML

This library is most useful when used in conjunction with [`http-proxy`](https://github.com/nodejitsu/node-http-proxy)
and [node-trumpet2](https://github.com/gofunky/node-trumpet2).

Following code launches a local proxy on http://localhost:8008/ which serves contents of Google homepage, but injects
a script at the bottom, that replaces Google logo image with "Boogle".

```javascript
const express = require('express');
const fiddle = require('html-fiddle');
const trumpet = require('node-trumpet2');
const httpProxy = require('http-proxy');

const app = express();

// html-fiddle middleware has to be added before the proxy
app.use(fiddle({
    // we use trumpet() to parse and modify html elements
    // in a streaming fashion
    through: () => {
        const tr = trumpet();
        tr.select('body', (el) => {
            const es = el.createStream();
            // at the end, add extra markup
            es.on('end', () => es.write(
                `<script>
                    document.querySelector("#main img").removeAttribute("srcset");
                    document.querySelector("#main img").src = "https://booglebookclub.com/images/logo.png";
                </script>`
            ));
            // keep the rest of element contents
            es.pipe(es);
        });
        return tr;
    }
}));

// Proxy to Google homepage
const proxy = httpProxy.createProxyServer({
    target: "https://www.google.com/",
    changeOrigin: true
});

app.use((req, res) => proxy.web(req, res));

// If you visit http://localhost:8008/, you'll see Google search, with
// a modified image (because of the extra injected script)
app.listen(8008, () => console.log('Listening on http://localhost:8008/ ...'));
```

## Contributing

Please read [CONTRIBUTING.md](./CONTRIBUTING.md) for details on our code of conduct, and the process for submitting pull requests to us.

## Versioning

We use [SemVer](http://semver.org/) for versioning. For the versions available, see the [tags on this repository](../../tags). 

## Authors

* **Lev Gimelfarb** - *Initial work* - [@gimelfarb](https://github.com/gimelfarb)

See also the list of [contributors](https://github.com/gimelfarb/html-fiddle/contributors) who participated in this project.

## License

This project is licensed under the ISC License - see the [LICENSE.md](LICENSE.md) file for details

## Acknowledgments

* [harmon](https://github.com/No9/harmon) - Initial inspiration to improve upon
* [http-proxy](https://github.com/nodejitsu/node-http-proxy) - Proxying content that prompted development of html-fiddle
* [node-trumpet2](https://github.com/gofunky/node-trumpet2) - Maintained version of 'trumpet' that I wanted to use, hence the need to improve upon 'harmon'

Also, thanks [@PurpleBooth](https://github.com/PurpleBooth), for the [README template](https://gist.github.com/PurpleBooth/109311bb0361f32d87a2) you created for all of us to use!
