const yaml = require('js-yaml');
const fs = require('fs');
const { SHA3 } = require('sha3');
const axios = require('axios');


;(async () => {
    const remoteBlocklist = yaml.load((await axios.get('https://raw.githubusercontent.com/phantom/blocklist/master/blocklist.yaml')).data).map((item) => { 
        return item.url || null;
    }).filter(Boolean);
    const remoteNftBlocklist = yaml.load((await axios.get('https://raw.githubusercontent.com/phantom/blocklist/master/nft-blocklist.yaml')).data).map((item) => {
        if (item.mint) {
            return item.mint;
        }

        if (item.tree) {
            return item.tree;
        }

        return null;
    }).filter(Boolean);

    const localBlocklist = yaml.load(fs.readFileSync('./lists/blocklist.yaml', 'utf8')).map((item) => { return item.url });
    const localNftBlocklist = yaml.load(fs.readFileSync('./lists/nft-blocklist.yaml', 'utf8')).map((item) => { return item.mint });

    const data = {
        'blocklist': [...new Set([...remoteBlocklist, ...localBlocklist])],
        'nftBlocklist': [...new Set([...remoteNftBlocklist, ...localNftBlocklist])],
        'whitelist': [],
        'fuzzylist': [],
    }

    const hash = new SHA3(256);
    hash.update(JSON.stringify(data));
    const contentHash = hash.digest('hex');

    data['contentHash'] = contentHash;

    fs.writeFileSync('./blocklist.json', JSON.stringify(data));
    fs.writeFileSync('./content-hash.json', JSON.stringify(contentHash));
})();
