const express = require('express');
const uuidv5 = require('uuid/v5');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;

const _ = require('lodash');

const rp = require('request-promise-native');
const request = rp.defaults();

const ogp = {};

process.on('unhandledRejection', (reason, p) => {
  console.log('Unhandled Rejection at: Promise', p, 'reason:', reason);
});

var app = express();

app.post('/stories', async function(req, res){
    try {
        const page = await retrievePage(req.query.url);
        const dom = new JSDOM(page);
        const canoniaclUrl = findCanoniaclUrl(dom);
        const uuid = uuidv5(canoniaclUrl || req.query.url, uuidv5.URL);
        
        ogp[uuid] = {
            scrape_status: "pending",
            updated_time: new Date(),
            id: uuid
        };
        
        setTimeout(() => parsePage(uuid, dom), 0);
        
        res.send(uuid);
    } catch (e) {
        console.error(e);
        res.status(400).json({error: e.name});
    }
});

app.get('/stories/:id', async function(req, res){
    if (ogp[req.params.id]) {
        res.send(ogp[req.params.id]);
    } else {
        res.status(404).json({error: "id not found"});
    } 
});

function parsePage(uuid, dom) {
    const metas = dom.window.document.querySelectorAll('meta[property*="og"]');

    if (metas.length == 0) {
        ogp[uuid] = {
            scrape_status: "error",
            updated_time: new Date(),
            id: uuid
        }
    } else {
        const data = {
            scrape_status: "done",
            updated_time: new Date(),
            id: uuid
        };

        for (let meta of metas) {
            let key = meta.attributes[0].value.replace('og:', '');
            set(data, key, meta.content);
        }

        ogp[uuid] = data;
    }
}

function set(node, key, value) {    
    if (/\w+:\w+/.test(key)) {
        let keys = key.split(':');
        
        if (!node[keys[0]]) {
            node[keys[0]] = {};
        } else if (!_.isObject(node[keys[0]])) {
            node[keys[0]] = {url: node[keys[0]]}
        }
        
        set(node[keys[0]], keys[1], value);
    } else {
        if (node[key]) {
            if (_.isObject(node[key])) {
                node[key].url = value;
            } else if (_.isArray(node[key])) {
                node[key].push(convertValue(value));
            } else {
                node[key] = [node[key], convertValue(value)];
            }
        } else {
            node[key] = convertValue(value);
        }
    }
}

function convertValue(v) {
    if (isFloat(v)) {
        return parseInt(v);
    } else if (isInt(v)) {
        return parseFloat(v);
    } else if (isBoolean(v)) {
        return v === "true";
    } else {
        return v;
    }
}

function isFloat(n) {
    return !isNaN(parseFloat(n)) && isFinite(n);
}

function isInt(n) {
    return !isNaN(parseInt(n)) && isFinite(n);
}

function isBoolean(b) {
    return b === "false" || b === "true";
}

function findCanoniaclUrl(dom) {   
    let canonical = dom.window.document.querySelector('link[rel=canonical]');
    return canonical ? canonical.href : null;
}

async function retrievePage(url) {
    if (url) {
        return await request({ method: 'GET', url});
    } else {
        throw new Error("url field is missing"); 
    }
}


app.listen(8081);