# Babel Plugin: METALOG!!

[Babel](https://babeljs.io/) that uses labeled statements to pass call-site meta data to a global logging function. also lets you totally remove logging statements from production builds.

free context! free logging! come and get it!

based on the great work by [Charles Pick](https://github.com/phpnode) from [codemix](http://codemix.com/) on [babel-plugin-trace][].

[babel-plugin-trace]: https://github.com/codemix/babel-plugin-trace

# Status

**alpha-as-fuck**. like as in 4-5 hours work. but i couldn't find anything else that worked the way it seemed loggers should in the babel / js environment and i'm pretty happy with it so far.

use with caution. like you always should when running some random dude you don't know's code.

# Motivation

1.  make **call-site meta data** (filename, class/function, line number) as well as `this` binding **automatically available** to a logging function.
    -   logging calls automatically have context information available so you can just log the important stuff and not worry about keeping log statements in sync with file / function / class names or creating different logger instances for different contexts.
    
    -   i.e. **no more of this crap**:
        
        ```js
        // src/index.js
        
        const logger = new Logger(__filename);
        
        logger.debug("i'm at the file level!");
        // => DEBUG [src/index.js] i'm at the file level!
        
        function doSomething() {
          // pain-in-the-ass and has a performance cost even if logging 
          // is disabled: 
          const logger = new Logger(__filename, "doSomething");
          
          logger.debug("i'm doing something!");
          // => DEBUG [src/index.js:doSomething] i'm doing something!
        }
        
        class Dude {
          constructor(name) {
            this.name = name;
          }
          
          doSomethingElse() {
            const logger = new Logger(
              __filename,
              `<Dude name=${ this.name }>`,
              'doSomethingElse'
            );
            
            logger.debug(`I'm doing something else!`);
          }
        }
        
        (new Dude('NRSER')).doSomethingElse();
        // => DEBUG [src/index.js:<Dude name=NRSER>:doSomethingElse] I'm doing something else!
        ```
        
    -   just do this:
        
        ```js
        // src/index.js
        
        debug: "i'm at the file level!";
        // => DEBUG [src/index.js:3] i'm at the file level!
        
        function doSomething() {
          debug: "i'm doing something!";
          // => DEBUG [src/index.js:doSomething:7] i'm doing something!
        }
        
        class Dude {
          constructor(name) {
            this.name = name;
          }
          
          __logContext() {
            return `<Dude name=${ this.name }>`;
          }
          
          doSomethingElse() {
            debug: `I'm doing something else!`;
          }
        }
        
        (new Dude('NRSER')).doSomethingElse();
        // => DEBUG [src/index.js:<Dude name=NRSER>:doSomethingElse] I'm doing something else!
        ```
        
2.  pay **no performance penalty** for logging in production by completely removing logging statements during compilation.
    -   configure the plugin in `.babelrc` to remove logging statements when `NODE_ENV=production`:
        
        ```JSON
        {
          ...
          "plugins": [
            ["metalog", {
              "strip": {
                "production": true
              }
            }],
            ...
          ],
          ...
        }
        ```
        
    -   go crazy. log it up. everywhere. and leave them there. won't affect production performance at all.
        
    -   you can of course strip them out of all builds to see the difference with `{"strip": true}` in the above, and there is a bunch of functionality inherited from [babel-plugin-trace][] that should help you be more fine-grained about it, but i haven't tried it out yet (keep scrolling for details).
        
3.  use **any logging package** you like.
    -   metalog just replaces `error:`, `warn:`, `info:`, `debug:` and `trace:` statements with calls to a global function. define that function and send the data to whatever logger you prefer.
        
    -   compiles
        
        ```js
        // src/index.js

        debug: "i'm at the file level!";

        function doSomething() {
          trace: "i'm doing something!";
        }
        ```
        
    -   to
        
        ```js
        "use strict";
        
        // src/index.js
        
        METALOG({
          label: "debug",
          filename: "/Users/nrser/dev/gh/nrser/nrser.js/src/blah.js",
          filepath: "/Users/nrser/dev/gh/nrser/nrser.js/src/blah.js",
          content: ["i'm at the file level!"],
          line: 1,
          parentPath: [],
          binding: undefined
        });

        function doSomething() {
          METALOG({
            label: "trace",
            filename: "/Users/nrser/dev/gh/nrser/nrser.js/src/blah.js",
            filepath: "/Users/nrser/dev/gh/nrser/nrser.js/src/blah.js",
            content: ["i'm doing something!"],
            line: 4,
            parentPath: ["doSomething"],
            binding: this
          });
        }
        ```
        
    -   you just define `METALOG()` at global scope and handle the data in the javascript runtime however you like. pass it to your favorite logging library and filter logs using levels / hierarchy / patterns / whatever! or handle it yourself!
        
        a simple implementation (doesn't deal with `binding`):
        
        ```js
        function METALOG({
          values, // boolean, see below
          level, // "error" | "warn" | "info" | "debug" | "trace"
          filename, // string, filename as babel sees it
          filepath, // string, resolved path to file
          content, // Array<any>, the stuff that was logged
          line, // number, line number of the call site
          parentPath, // Array<string>, class / function ancestry
          binding, // `this` in current scope, undefined at file-level
        }) {
          console.log(
            `${ level } [${ filename }:${ parentPath.join(':') }:${ line }]`,
            ...content
          );
        }
        ```
        
    -   you can change the global function name (default `METALOG`) in the `.babelrc` plugin options:
        
        ```JSON
        {
          ...
          "plugins": [
            ["metalog", {
              "strip": {
                "production": true
              },
              "logFunction": "myMetalogHandler"
            }],
            ...
          ],
          ...
        }
        ```
        
# Installation

## TODO

i haven't put it up on npm yet, so you need to point npm at this repo or fork/clone it and link it yourself... which you'll probably want to do because it's almost certain to have bugs and issues that you'll need to go muck around in the source to sort out. you also have to add the plugin to `.babelrc` or wherever you define your babel plugins.

if this sounds confusing this package is probably way too early for your needs. if someone's actually reading this and really wants it published and doc'd open an issue and i'll try and find some time for it.

# filtering stuff inherited from babel-plugin-trace

i haven't tried any of this stuff, but i didn't go out of my way to break it either. let me know how it goes!

### Enable by filename
Enable logging for any file with `login.js` in the path.
```
TRACE_FILE=login.js babel -d ./lib ./src
```

Enable logging for any file with `db/models` or `components/login` in the path.
```
TRACE_FILE=db/models,components/login babel -d ./lib ./src
```

### Enable for specific functions
Enable logging for any function called `login()` or `logout()`.
```
TRACE_CONTEXT=:login,:logout babel -d ./lib ./src
```

Enable logging for any function in a class called `User`.
```
TRACE_CONTEXT=:User: babel -d ./lib ./src
```

### Enable only specific logging levels
Log only `warn` statements.
```
TRACE_LEVEL=warn babel -d ./lib ./src
```

Log `trace` and `warn` statements.
```
TRACE_LEVEL=trace,warn babel -d ./lib ./src
```

# License

MIT
