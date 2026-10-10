const yaml = require('js-yaml');
const fs = require('fs');
const { SHA3 } = require('sha3');
const axios = require('axios');

// Hostnames are case-insensitive and browsers always report them in lowercase, so entries such as
// "JUPUNBOX.com" would never match. Normalize every domain before de-duplicating.
const normalizeDomain = (url) => (typeof url === 'string' ? url.trim().toLowerCase() : url);


;(async () => {
    const remoteBlocklist = yaml.load((await axios.get('https://raw.githubusercontent.com/phantom/blocklist/master/blocklist.yaml')).data).map((item) => { 
        return item.url || null;
    }).filter(Boolean);
    const remoteNftBlocklist = yaml.load((await axios.get('https://raw.githubusercontent.com/phantom/blocklist/master/nft-blocklist.yaml')).data).map((item) => {
        return item.mint || null;
    }).filter(Boolean);

    // mallow verified collections: flat array of collection addresses (legacy collection mints and
    // MPL Core collections). Appended to the whitelist only; the allowlist subtraction below stays
    // local so a third-party list can never unblock anything. Sorted so the content hash only
    // changes when the set of addresses changes.
    //
    // Why cdn2? cdn.mallow.art is their CloudFront, cdn2.mallow.art is Cloudflare -- should be cheaper to hit them there.
    // Nikola disccussed this with sloth from mallow over telegram.
    const remoteMallowWhitelist = (await axios.get('https://cdn2.mallow.art/verified_collections.json')).data
        .filter((item) => typeof item === 'string')
        .sort();

    const localBlocklist = yaml.load(fs.readFileSync('./lists/blocklist.yaml', 'utf8')).map((item) => {
        return item.url || null;
    }).filter(Boolean);
    const localNftBlocklist = yaml.load(fs.readFileSync('./lists/nft-blocklist.yaml', 'utf8')).map((item) => {
        if (item.mint) {
            return item.mint;
        }

        if (item.tree) {
            return item.tree;
        }

        return null;
    }).filter(Boolean);

    const localNftAllowlist = yaml.load(fs.readFileSync('./lists/nft-allowlist.yaml', 'utf8')).map((item) => {
        if (item.mint) {
            return item.mint;
        }

        if (item.tree) {
            return item.tree;
        }

        if (item.collection) {
            return item.collection;
        }

        return null;
    }).filter(Boolean);

    const localTreeFilterList = yaml.load(fs.readFileSync('./lists/tree-filterlist.yaml', 'utf8')).map((item) => {
        if (item.tree) {
            return item.tree;
        }

        return null;
    }).filter(Boolean);

    const localStringFilters = {};
    const possibleFilters = ['symbol', 'symbolStartsWith', 'symbolEndsWith', 'symbolContains', 'name', 'nameStartsWith', 'nameEndsWith', 'nameContains'];

    yaml.load(fs.readFileSync('./lists/token-blocklist.yaml', 'utf8')).map((item) => {
        for (let i = 0; i < possibleFilters.length; i++) {
            const filter = possibleFilters[i];

            if (item[filter]) {
                if (!localStringFilters[filter]) {
                    localStringFilters[filter] = [];
                }

                localStringFilters[filter].push(item[filter]);

                break;
            }
        }
    })

    const combinedBlocklist = [...new Set([...remoteBlocklist, ...localBlocklist].map(normalizeDomain))];
    const combinedNftBlocklist = [...new Set([...remoteNftBlocklist, ...localNftBlocklist])];

    const nftAllowlistSet = new Set(localNftAllowlist);

    const filteredBlocklist = combinedBlocklist.filter(url => !nftAllowlistSet.has(url));
    const filteredNftBlocklist = combinedNftBlocklist.filter(mintOrTree => !nftAllowlistSet.has(mintOrTree));
    const filteredTreeFilterlist = localTreeFilterList.filter(tree => !nftAllowlistSet.has(tree));

    const data = {
        'blocklist': filteredBlocklist,
        'nftBlocklist': filteredNftBlocklist,
        'whitelist': [...new Set([...localNftAllowlist, ...remoteMallowWhitelist])],
        'fuzzylist': [],
        'stringFilters': localStringFilters,
        'treeFilters': filteredTreeFilterlist
    }

    const hash = new SHA3(256);
    hash.update(JSON.stringify(data));
    const contentHash = hash.digest('hex');

    data['contentHash'] = contentHash;

    fs.writeFileSync('./blocklist.json', JSON.stringify(data));
    fs.writeFileSync('./content-hash.json', JSON.stringify(contentHash));
})();
