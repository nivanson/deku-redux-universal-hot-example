import Express from 'express';
import {element, deku, tree, renderString} from 'deku';
import crossroads from 'crossroads';
import {AppRouter} from './router';
import config from './config';
import favicon from 'serve-favicon';
import compression from 'compression';
import httpProxy from 'http-proxy';
import url from 'url';
import path from 'path';
import createRedux from './redux/create';
import {App} from './components/index';
import api from './api/api';
import ApiClient from './ApiClient';

const server = new Express();
const webserver = process.env.NODE_ENV === 'production' ? '' : '//localhost:8080';
const proxy = httpProxy.createProxyServer({
    target: 'http://localhost:' + config.apiPort
});

server.use(compression());
server.use(require('serve-static')(path.join(__dirname, '..', 'static')));
server.use(favicon(path.join(__dirname, '..', 'favicon.ico')));

// Proxy to API server
server.use('/api', (req, res) => {
    proxy.web(req, res);
});

server.use((req, res, next) => {
    const redux = createRedux(new ApiClient(req));
    const router = crossroads.create();
    const appTree = deku().use(AppRouter(router));
    appTree.option('validateProps', false);
    appTree.set('currentRedux', redux);
    appTree.set('currentReduxState', redux.getState());
    appTree.mount(<App />);

    // routing should be in redux but i made this
    // hack for now to just pass in the router object
    // on the app tree and add some extra methods
    // routes cannot change on server so these handlers are empty
    router.go = function () {};
    router.generateGo = function () {};

    // now that the tree is mounted we can parse the path
    // see AppRouter for more information on how routes are changed
    router.parse(req.path);

    // inject some materialize css constructs
    let stylesheets = `
        #slide-out a {
            height: 40px;
            line-height: 40px;
        }

        header, main, footer {
            padding-left: 240px;
        }

        @media only screen and (max-width : 992px) {
            header, main, footer {
                padding-left: 0;
            }
        }
    `;

    // and some materialize css js too
    let javascripts = `
        // Initialize collapse button
        $(function() {
            $(".button-collapse").sideNav();
            // Initialize collapsible (uncomment the line below if you use the dropdown variation)
            //$('.collapsible').collapsible();
        });
    `;

    // TODO: somehow make sure all components have their data before proceeding

    let state = redux.getState();

    // TODO: implement handler for 404 with status code
    // TODO: implement handler for 500 with status code

    let htmlTree = tree(
            <html>
            <head>
                <title>Deku Redux Universal Hot Example</title>
                <meta name="viewport"
                      content="width=device-width, initial-scale=1.0"/>
                <link rel="stylesheet"
                      href="https://cdnjs.cloudflare.com/ajax/libs/materialize/0.97.0/css/materialize.min.css"
                      media="screen,projection"/>
                <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet"/>
                <script type="text/javascript"
                        src="https://code.jquery.com/jquery-2.1.1.min.js"></script>
                <script src="https://cdnjs.cloudflare.com/ajax/libs/materialize/0.97.0/js/materialize.min.js"></script>
                <script innerHTML={javascripts}></script>
                <style innerHTML={stylesheets}/>
            </head>
            <body class="teal">
            <div id="content" innerHTML={renderString(appTree)}/>
            <script innerHTML={`window.__state=${JSON.stringify(state)};`}/>
            <script src={`${webserver}/dist/client.js`}/>
            </body>
            </html>
    );

    res.send('<!doctype html>\n' + renderString(htmlTree));
});

if (config.port) {
    server.listen(config.port, function (err) {
        if (err) {
            console.error(err);
        } else {
            api().then(function () {
                console.info('==> [OK]  Server is listening');
                console.info('==> [OK]  %s running on port %s, API on port %s', config.server.name, config.port, config.apiPort);
            });
        }
    });
} else {
    console.error('==> [ERROR]  No PORT environment variable has been specified');
}
