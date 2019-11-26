"use strict";
/// <reference path="./index.d.ts" />
Object.defineProperty(exports, "__esModule", { value: true });
var getDisplayName_1 = require("./getDisplayName");
// having weak reference to styles prevents garbage collection
// and "losing" styles when the next test starts
var stylesCache = new Map();
var setXMLHttpRequest = function (w) {
    // by grabbing the XMLHttpRequest from app's iframe
    // and putting it here - in the test iframe
    // we suddenly get spying and stubbing 😁
    // @ts-ignore
    window.XMLHttpRequest = w.XMLHttpRequest;
    return w;
};
var setAlert = function (w) {
    window.alert = w.alert;
    return w;
};
var documentEventListeners = [];
function restoreDocumentEventListeners(document) {
    if (documentEventListeners && documentEventListeners.length) {
        documentEventListeners.forEach(function (documentEventListener) {
            document.addEventListener(documentEventListener.event, documentEventListener.listener);
        });
    }
}
/** Initialize an empty document w/ ReactDOM and DOM events.
    @function   cy.injectReactDOM
**/
Cypress.Commands.add('injectReactDOM', function () {
    return cy.log('Injecting ReactDOM for Unit Testing').then(function () {
        // Generate inline script tags for UMD modules
        var scripts = Cypress.modules
            .map(function (module) { return "<script>" + module.source + "</script>"; })
            .join('');
        // include React and ReactDOM to force DOM to register all DOM event listeners
        // otherwise the component will NOT be able to dispatch any events
        // when it runs the second time
        // https://github.com/bahmutov/cypress-react-unit-test/issues/3
        var html = "\n    <head>\n      <meta charset=\"utf-8\">\n    </head>\n    <body>\n    <div id=\"cypress-jsdom\"></div>\n    " + scripts + "\n    </body>";
        var document = cy.state('document');
        document.write(html);
        document.close();
    });
});
Cypress.stylesCache = stylesCache;
/** Caches styles from previously compiled components for reuse
    @function   cy.copyComponentStyles
    @param      {Object}  component
**/
Cypress.Commands.add('copyComponentStyles', function (component) {
    // need to find same component when c`omponent is recompiled
    // by the JSX preprocessor. Thus have to use something else,
    // like component name
    var parentDocument = window.parent.document;
    // @ts-ignore
    var specDocument = parentDocument.querySelector('iframe.spec-iframe').contentDocument;
    // @ts-ignore
    var appDocument = parentDocument.querySelector('iframe.aut-iframe').contentDocument;
    var hash = component.type.name;
    var styles = specDocument.querySelectorAll('head style');
    if (styles.length) {
        cy.log("injected " + styles.length + " style(s)");
        Cypress.stylesCache.set(hash, styles);
    }
    else {
        cy.log('No styles injected for this component, checking cache');
        if (Cypress.stylesCache.has(hash)) {
            styles = Cypress.stylesCache.get(hash);
        }
        else {
            styles = null;
        }
    }
    if (!styles) {
        return;
    }
    var head = appDocument.querySelector('head');
    styles.forEach(function (style) {
        head.appendChild(style);
    });
});
/**
 * Mount a React component in a blank document; register it as an alias
 * To access: use an alias or original component reference
 *  @function   cy.mount
 *  @param      {Object}  jsx - component to mount
 *  @param      {string}  [Component] - alias to use later
 *  @example
 ```
 import Hello from './hello.jsx'
 // mount and access by alias
 cy.mount(<Hello />, 'Hello')
 // using default alias
 cy.get('@Component')
 // using specified alias
 cy.get('@Hello').its('state').should(...)
 // using original component
 cy.get(Hello)
 ```
 **/
exports.mount = function (jsx, alias) {
    // Get the display name property via the component constructor
    var displayname = getDisplayName_1.default(jsx.type, alias);
    var cmd;
    cy.injectReactDOM()
        .window({ log: false })
        .then(function () {
        cmd = Cypress.log({
            name: 'mount',
            // @ts-ignore
            message: ["ReactDOM.render(<" + displayname + " ... />)"],
            consoleProps: function () {
                return {
                    props: jsx.props
                };
            }
        });
    })
        .then(function (win) {
        var document = win.document;
        restoreDocumentEventListeners(document);
        var originalAddEventListener = document.addEventListener;
        cy.stub(document, "addEventListener", function (event, listener) {
            documentEventListeners.push({ event: event, listener: listener });
            originalAddEventListener(event, listener);
        });
        return win;
    })
        .then(setXMLHttpRequest)
        .then(setAlert)
        .then(function (win) {
        var ReactDOM = win.ReactDOM;
        var document = cy.state('document');
        var component = ReactDOM.render(jsx, document.getElementById('cypress-jsdom'));
        cy.wrap(component, { log: false }).as(alias || displayname);
    });
    cy.copyComponentStyles(jsx)
        .then(function () {
        cmd.snapshot().end();
    });
};
Cypress.Commands.add('mount', exports.mount);
/** Get one or more DOM elements by selector or alias.
    Features extended support for JSX and React.Component
    @function   cy.get
    @param      {string|object|function}  selector
    @param      {object}                  options
    @example    cy.get('@Component')
    @example    cy.get(<Component />)
    @example    cy.get(Component)
**/
Cypress.Commands.overwrite('get', function (originalFn, selector, options) {
    switch (typeof selector) {
        case 'object':
            // If attempting to use JSX as a selector, reference the displayname
            if (selector.$$typeof &&
                selector.$$typeof.toString().startsWith('Symbol(react')) {
                var displayname_1 = selector.type.prototype.constructor.name;
                return originalFn("@" + displayname_1, options);
            }
        case 'function':
            // If attempting to use the component name without JSX (testing in .js/.ts files)
            // const displayname = selector.prototype.constructor.name
            var displayname = getDisplayName_1.default(selector);
            return originalFn("@" + displayname, options);
        default:
            return originalFn(selector, options);
    }
});
/*
Before All
- Load and cache UMD modules specified in fixtures/modules.json
  These scripts are inlined in the document during unit tests
  modules.json should be an array, which implicitly sets the loading order
  Format: [{name, type, location}, ...]
*/
before(function () {
    var settings = Cypress.env('cypress-react-unit-test') || {};
    var moduleNames = [
        {
            name: 'react',
            type: 'file',
            location: settings.react || 'node_modules/react/umd/react.development.js'
        },
        {
            name: 'react-dom',
            type: 'file',
            location: settings['react-dom'] || 'node_modules/react-dom/umd/react-dom.development.js'
        }
    ];
    Cypress.modules = [];
    cy.log('Initializing UMD module cache').then(function () {
        var _loop_1 = function (module) {
            var name_1 = module.name, type = module.type, location_1 = module.location;
            cy.readFile(location_1, { log: false })
                .then(function (source) { return Cypress.modules.push({ name: name_1, type: type, location: location_1, source: source }); });
        };
        for (var _i = 0, moduleNames_1 = moduleNames; _i < moduleNames_1.length; _i++) {
            var module = moduleNames_1[_i];
            _loop_1(module);
        }
    });
});
