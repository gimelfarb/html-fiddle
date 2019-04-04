/**
 * @module html-fiddle
 * Middleware (connect) for modifying response html.
 */

const zlib = require('zlib');
const stream = require('stream');

// Decoding transform streams for unpacking raw binary
// content based on Content-Encoding header:
// https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Encoding
const DECODERS = {
    'gzip': () => zlib.createGunzip(),
    'deflate': () => zlib.createInflate(),
    'br': () => zlib.createBrotliDecompress()
};

/**
 * @callback throughFactory
 * @returns {stream.Duplex} transform stream
 */

/**
 * @typedef {Object} Options
 * @property {throughFactory} through Function that returns a transform stream, through which HTML is piped
 */

/**
 * Factory method that creates the connect middleware function (req, res, next) => {...}.
 * @param {Options} opts Transform options
 */
module.exports = (opts) => {
    // Check we have the transform function factory. Without it, there is no point
    // doing anything.
    let { through } = opts || {};
    if (!through) {
        // No-op middleware
        return (_req, _res, next) => (next && next());
    }

    // Helper function to preserve previous member function,
    // so that it can be overridden. Binds to the object so that
    // it can be invoked as a plain function call
    const _savefunc = (obj, func) => {
        if (typeof func === 'string') func = obj[func];
        return func ? func.bind(obj) : (()=>{});
    };

    // Helper to pipe stream to another, and chain destroy on error
    const _pipe = (src, dst) => {
        // Following '_destroy' override is quite subtle, so warrants an explanation. By default, 
        // destroying a Writable/Transform stream will .end() it first. Ending a stream will cause
        // response output to flush, and in case of 'upstream' - actually be written to the socket. 
        // This is bad for error handling scenario - we actually want to abort the piping chain, and
        // have a chance to either abort HTTP response or change it to an HTTP 500. We have better 
        // chance of doing it when nothing yet has been flushed.
        dst._destroy = (err, cb) => cb(err);
        // In case of an error from source, we destroy destination, which in turn
        // causes it raise 'error' for streams it is piping into
        return src
            .on('error', (err) => dst.destroy(err))
            .pipe(dst);
    };

    // Create the connect middleware function
    return (_req, res, next) => {
        // We will overwrite res.writeHead()
        const _writeHead = _savefunc(res, 'writeHead');
        // Create an upstream writeable stream, to which we will pipe the final transformed output. 
        // This stream will delegate writing to the upstream response ('res')
        const upstream = new stream.Writable({
            write: _savefunc(res, 'write'),
            final: _savefunc(res, 'end')
        });
        // 'xformstream' is the head of the stream chain, to which he overwritten 'res.write' method is 
        // writing. Downstream code will be passing raw response through 'res.write', and we will process 
        // it through 'xformstream'.
        //
        // Flow: downstream raw response -> xformstream -> upstream
        let xformstream = upstream;
        
        // In case of an error during transform, we will call unbind() to return ServerResponse
        // methods to the original ones. If other middleware (or default handling) is generating
        // an error response, we don't want it to go through the transform.
        const unbind = () => {
            res.writeHead = _writeHead;
            res.write = upstream._write;
            res.end = upstream._final;
        };

        // If piping chain forwards 'error' event to the 'upstream', then we want to give
        // HTTP/Express framework a chance to handle it. We abort trying to write a response,
        // and call next(err) - this should have default error handling, which will generate
        // an HTTP 500 response (if headers are not yet sent), or abort the response connection
        upstream.on('error', (err) => {
            unbind();
            next(err);
        });

        // Overwriting 'res.writeHead' to intercept the moment just
        // before HTTP output is actually being committed
        res.writeHead = (...args) => {
            // Support both signatures (statusCode, headers) and (statusCode, statusMessage, headers)
            const headers = args.length > 2 ? args[2] : args[1];

            // Helpers to get/remove header info from 'res' itself, or the passed in headers object
            const get_header = (n) => res.getHeader(n) || (headers && headers[n]);
            const remove_header = (n) => {
                res.removeHeader(n);
                if (headers && headers[n]) { delete headers[n]; }
            };

            const contentType = get_header('content-type');
            const contentEncoding = get_header('content-encoding');

            // Check if raw input is compressed, and if we can decompress it (just check for now)
            const decoder = contentEncoding && DECODERS[contentEncoding];
            const canDecode = !contentEncoding || !!decoder;

            // Only care about the HTML content, and only if we know how to decompress it
            if (contentType && contentType.indexOf('text/html') === 0 && canDecode) {
                // Must remove Content-Length, as we are modifying the output. By default, Node will
                // process HTTP response through chunked transfer encoding, so length is not needed
                remove_header('content-length');

                // Create the 'xformstream' through which raw input is passed
                xformstream = new stream.PassThrough();
                let htmlConverted = xformstream;
                
                // If raw input is compressed, then we must uncompress it first
                if (decoder) {
                    remove_header('content-encoding');
                    htmlConverted = _pipe(htmlConverted, decoder());
                }

                // Create the configured transform stream, which will modify the HTML
                const convertstream = through();
                if (convertstream && typeof convertstream.pipe === 'function') {
                    htmlConverted = _pipe(htmlConverted, convertstream);
                }

                // Just before writing transformed data to upstream, we ensure that
                // original _writeHead(...) is invoked
                let writeHeadCalled = false;
                const commitstream = new stream.Transform({
                    transform(chunk, _encoding, cb) {
                        if (!writeHeadCalled) {
                            _writeHead(args);
                            writeHeadCalled = true;
                        }
                        cb(null, chunk);
                    }
                });
                htmlConverted = _pipe(htmlConverted, commitstream);

                // Pipe final converted result to the upstream
                _pipe(htmlConverted, upstream);
            }
            else
            {
                // Not forgetting to call the overridden implementation, if we are not
                // doing anything to transform the response. Otherwise _writeHead is
                // going to be deferred, until first transformed chunk is written above
                _writeHead(args);
            }
        };

        // If headers have not been sent yet, we need to force it just before we write to the
        // stream. This will call overridden writeHead above, and setup the 'xformstream'.
        // Avoid calling writeHead again, if we have already setup a transforming 'xformstream' chain.
        const ensureWriteHead = () => res.headersSent || (xformstream !== upstream) || res.writeHead(res.statusCode);

        // Override 'res.write' to pass raw input to 'xformstream'
        res.write = (...args) => {
            ensureWriteHead();
            xformstream.write(...args);
        };

        // Override 'res.end' to pass raw input to 'xformstream',
        // and signal end to it
        res.end = (...args) => {
            ensureWriteHead();
            xformstream.end(...args);
        };

        // If next is given, call it, like the good middleware should!
        if (next) { next(); }
    };
};