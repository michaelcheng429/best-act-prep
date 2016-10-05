import express from 'express';
import bodyParser from 'body-parser';
import session from 'express-session';
import path from 'path';
import React from 'react';
import { Provider } from 'react-redux';
import { renderToString } from 'react-dom/server';
import { RouterContext, match } from 'react-router';
import createLocation from 'history/lib/createLocation';

import routes from 'routes';
import serverRoutes from 'server/routes';
import { User } from 'server/db/users';
import { makeStore } from 'helpers';
import moduleMappings from 'registries/module-mappings';
import { handleError } from 'server/utils';

import { setActiveTab, setEmail, setPasswordResetHash } from 'actions/app';
import { setAdminUser } from 'actions/admin';

const mailgun = require('mailgun-js')({ apiKey: process.env.MAILGUN_API, domain: 'bestactprep.co' });

process.on('uncaughtException', err => {
    handleError(null, 'uncaughtException', err);
});

var app = express();

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: 'blah blah',
    resave: false,
    saveUninitialized: false,
    cookie: {
        // Recommended for HTTPS
        // secure: true,
    }
}));

serverRoutes(app);

app.use((req, res) => {
    let url = req.url;
    if (url.length > 1 && url.slice(url.length - 1) === '/') {
        url = url.slice(0,url.length - 1);
        res.redirect(url);
    }

    const { user, adminUser } = req.session;
    const location = createLocation(req.url);
    const store = makeStore();

    if (url.indexOf('password-reset/') !== -1) {
        const passwordResetHash = url.split('password-reset/')[1];

        User.findOne({ passwordResetHash }, (err, result) => {
            if (!result) {
                url = '/password-reset';
                res.redirect(url);
            } else {
                req.session.passwordResetHashForStore = passwordResetHash;
                req.session.passwordResetEmail = result.email;

                url = '/password-reset';
                res.redirect(url);
            }
        });

        return;
    }

    match({ routes, location }, (err, redirectLocation, renderProps) => {
        if (err) {
            console.log(err);
            return res.status(500).end('Internal server error');
        }

        if (!renderProps) {
            return res.status(404).end('Not found.');
        }

        const InitialComponent = (
            <Provider store={store}>
                <RouterContext {...renderProps} />
            </Provider>
        );

        if (moduleMappings[req.url.slice(1)]) {
            req.url = '/course';
        }

        store.dispatch(setActiveTab(req.url));

        if (adminUser) {
            store.dispatch(setAdminUser(adminUser));
        }
        if (user) {
            store.dispatch(setEmail(user));
        }

        const { passwordResetHashForStore, passwordResetEmail } = req.session;
        if (passwordResetHashForStore) {
            store.dispatch(setPasswordResetHash(passwordResetHashForStore, passwordResetEmail));
        }

        const initialState = store.getState();

        const componentHTML = renderToString(InitialComponent);

        const HTML = `
            <!DOCTYPE html>
            <html>
                <head>
                    <meta charset="utf-8">
                    <script src="https://cdnjs.cloudflare.com/ajax/libs/jquery/3.0.0-beta1/jquery.min.js"></script>
                    <link rel="stylesheet" href="https://maxcdn.bootstrapcdn.com/bootstrap/3.3.6/css/bootstrap.min.css" />
                    <link rel="stylesheet" href="/style.css" />
                    <link rel="icon" type="image/png" href="/images/favicon.png" />

                    <title>Online ACT Prep Course - Higher Score Guaranteed</title>

                    <script>
                        window.__INITIAL_STATE__ = ${JSON.stringify(initialState)}
                    </script>

                    <script>
                      (function(i,s,o,g,r,a,m){i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){
                      (i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o),
                      m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m)
                      })(window,document,'script','https://www.google-analytics.com/analytics.js','ga');

                      ga('create', 'UA-76974805-1', 'auto');
                      ga('send', 'pageview');
                    </script>
                </head>
                <body>
                    <div id="app">${componentHTML}</div>
                    <script src="https://checkout.stripe.com/checkout.js"></script>
                    <script src="/bundle.js"></script>
                </body>
            </html>
        `;

        res.end(HTML);
    });
});

export default app;
