// Define default settings for playerClass
const defaultStats = {
    chickens: 0,
    maxChickens: 250,
    eggsDelivered: 0,
    deflectorPercent: 0,
    siabPercent: 0,
    otherDefl: 0,
    timeToBoost: 0,
    boostingTime: 0,
    numTach: 0,
    numQuant: 0,
    boostMulti: 1,
    btv: 0
};
const defaultRates = {
    ihr: 0,
    deliveryRate: 0,
    baseShip: 0,
    baseELR: 0,
    layRate: 0,
    shipRate: 0,
}
const defaultFlags = {
    needsMirror: false,
    isSink: false,
    isCreator: false,
    maxHab: false,
    siabActive: false
};


class PlayerClass {
    constructor({
        name = "Player",
        tokens = 6,
        stats = {},
        rates = {},
        flags = {}
    } = {}) {
        this.name = name;
        this.tokens = tokens;

        this.stats = { ...defaultStats, ...stats };
        this.rates = { ...defaultRates, ...rates };
        this.flags = { ...defaultFlags, ...flags };
    }
    updateChickens() {
        const increase = this.rates.ihr * 12 * this.stats.boostMulti / 60;

        this.stats.chickens = Math.min(
            this.stats.chickens + increase,
            this.stats.maxChickens
        );
        if (this.stats.chickens === this.stats.maxChickens) {
            this.flags.maxHab = true;
        }
    }
    updateDeliveryRate() {
        this.rates.layRate = this.stats.chickens * 332640 * (1 + this.stats.otherDefl / 100);
        this.rates.shipRate = this.rates.baseShip;
        this.rates.deliveryRate = Math.min(
            this.rates.layRate,
            this.rates.baseShip
        );
    }
    updateEggsDelivered(updateRate) {
        this.stats.eggsDelivered += updateRate * this.rates.deliveryRate / 3600;
    }
    updateEggsDeliveredSIAB(updateRate) {
        this.stats.eggsDelivered += updateRate * this.beforeSwap.rates.deliveryRate / 3600;
    }
    updateBTV(updateRate, new2p0) {
        const { deflectorPercent, siabPercent } = this.stats;
        const btvRate = new2p0 ?
            12.5 * Math.min(deflectorPercent, 12) + 0.75 * Math.min(siabPercent, 50)
            : 7.5 * (deflectorPercent + siabPercent / 10);
        this.stats.btv += updateRate * btvRate / 100;
    }

};

const base62 = {
    charset: '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
        .split(''),
    encode: integer => {
        if (integer === 0) {
            return 0;
        }
        let s = [];
        while (integer > 0) {
            s = [base62.charset[integer % 62], ...s];
            integer = Math.floor(integer / 62);
        }
        return s.join('');
    },
    decode: chars => chars.split('').reverse().reduce((prev, curr, i) =>
        prev + (base62.charset.indexOf(curr) * (62 ** i)), 0)
};

// Define the items
const items = [
    { name: 'Metro/Stone Arti' },
    { name: 'Compass/Stone Arti' },
    { name: 'Gusset/Stone Arti' },
    { name: 'Deflector/Stone Arti' },
    { name: 'Chalice' },
    { name: 'Monocle' },
    { name: 'Deflector/Stone Arti' },
    { name: 'SIAB/Stone Arti' },
];

const itemsCoop = [
    { name: 'Metro/Stone Arti' },
    { name: 'Compass/Stone Arti' },
    { name: 'Gusset/Stone Arti' },
    { name: 'Gusset/Stone Arti' },
    { name: 'Gusset/Stone Arti' },
];

const itemsMetro = [
    { name: 'T4L Metro', image: 'images/Metro4L.png', slots: 3, elrmult: 1.35, srmult: 1, ihrmult: 1, deflectorPercent: 0, siabPercent: 0, chickmult: 1 },
    { name: 'T4E Metro', image: 'images/Metro4E.png', slots: 2, elrmult: 1.3, srmult: 1, ihrmult: 1, deflectorPercent: 0, siabPercent: 0, chickmult: 1 },
    { name: 'T4R Metro', image: 'images/Metro4R.png', slots: 1, elrmult: 1.27, srmult: 1, ihrmult: 1, deflectorPercent: 0, siabPercent: 0, chickmult: 1 },
    { name: 'T4C Metro', image: 'images/Metro4C.png', slots: 0, elrmult: 1.25, srmult: 1, ihrmult: 1, deflectorPercent: 0, siabPercent: 0, chickmult: 1 },
    { name: 'T3E Metro', image: 'images/Metro3E.png', slots: 2, elrmult: 1.2, srmult: 1, ihrmult: 1, deflectorPercent: 0, siabPercent: 0, chickmult: 1 },
    { name: '3 Slot', image: 'images/RandomLeg.png', slots: 3, elrmult: 1, srmult: 1, ihrmult: 1, deflectorPercent: 0, siabPercent: 0, chickmult: 1 },
    { name: 'T3R Metro', image: 'images/Metro3R.png', slots: 1, elrmult: 1.17, srmult: 1, ihrmult: 1, deflectorPercent: 0, siabPercent: 0, chickmult: 1 },
    { name: 'T3C Metro', image: 'images/Metro3C.png', slots: 0, elrmult: 1.15, srmult: 1, ihrmult: 1, deflectorPercent: 0, siabPercent: 0, chickmult: 1 },
    { name: 'T2R Metro', image: 'images/Metro2R.png', slots: 1, elrmult: 1.12, srmult: 1, ihrmult: 1, deflectorPercent: 0, siabPercent: 0, chickmult: 1 },
    { name: 'T2C Metro', image: 'images/Metro2C.png', slots: 0, elrmult: 1.1, srmult: 1, ihrmult: 1, deflectorPercent: 0, siabPercent: 0, chickmult: 1 },
    { name: 'T1C Metro', image: 'images/Metro1C.png', slots: 0, elrmult: 1.05, srmult: 1, ihrmult: 1, deflectorPercent: 0, siabPercent: 0, chickmult: 1 },
    { name: 'T4L SIAB', image: 'images/SIAB4L.png', slots: 2, elrmult: 1, srmult: 1, ihrmult: 1, deflectorPercent: 0, siabPercent: 100, chickmult: 1 },
    { name: 'T4E SIAB', image: 'images/SIAB4E.png', slots: 2, elrmult: 1, srmult: 1, ihrmult: 1, deflectorPercent: 0, siabPercent: 90, chickmult: 1 },
    { name: 'T4R SIAB', image: 'images/SIAB4R.png', slots: 1, elrmult: 1, srmult: 1, ihrmult: 1, deflectorPercent: 0, siabPercent: 80, chickmult: 1 }
];

const itemsComp = [
    { name: 'T4L Compass', image: 'images/Compass4L.png', slots: 2, elrmult: 1, srmult: 1.5, ihrmult: 1, deflectorPercent: 0, siabPercent: 0, chickmult: 1 },
    { name: 'T4E Compass', image: 'images/Compass4E.png', slots: 2, elrmult: 1, srmult: 1.4, ihrmult: 1, deflectorPercent: 0, siabPercent: 0, chickmult: 1 },
    { name: 'T4R Compass', image: 'images/Compass4R.png', slots: 1, elrmult: 1, srmult: 1.35, ihrmult: 1, deflectorPercent: 0, siabPercent: 0, chickmult: 1 },
    { name: 'T4C Compass', image: 'images/Compass4C.png', slots: 0, elrmult: 1, srmult: 1.3, ihrmult: 1, deflectorPercent: 0, siabPercent: 0, chickmult: 1 },
    { name: 'T3R Compass', image: 'images/Compass3R.png', slots: 1, elrmult: 1, srmult: 1.22, ihrmult: 1, deflectorPercent: 0, siabPercent: 0, chickmult: 1 },
    { name: 'T3C Compass', image: 'images/Compass3C.png', slots: 0, elrmult: 1, srmult: 1.2, ihrmult: 1, deflectorPercent: 0, siabPercent: 0, chickmult: 1 },
    { name: 'T2C Compass', image: 'images/Compass2C.png', slots: 0, elrmult: 1, srmult: 1.1, ihrmult: 1, deflectorPercent: 0, siabPercent: 0, chickmult: 1 },
    { name: 'T1C Compass', image: 'images/Compass1C.png', slots: 0, elrmult: 1, srmult: 1.05, ihrmult: 1, deflectorPercent: 0, siabPercent: 0, chickmult: 1 },
    { name: '3 Slot', image: 'images/RandomLeg.png', slots: 3, elrmult: 1, srmult: 1, ihrmult: 1, deflectorPercent: 0, siabPercent: 0, chickmult: 1 },
    { name: 'T4L SIAB', image: 'images/SIAB4L.png', slots: 2, elrmult: 1, srmult: 1, ihrmult: 1, deflectorPercent: 0, siabPercent: 100, chickmult: 1 },
    { name: 'T4E SIAB', image: 'images/SIAB4E.png', slots: 2, elrmult: 1, srmult: 1, ihrmult: 1, deflectorPercent: 0, siabPercent: 90, chickmult: 1 },
    { name: 'T4R SIAB', image: 'images/SIAB4R.png', slots: 1, elrmult: 1, srmult: 1, ihrmult: 1, deflectorPercent: 0, siabPercent: 80, chickmult: 1 }
];

const itemsGusset = [
    { name: 'T4L Gusset', image: 'images/Gusset4L.png', slots: 3, elrmult: 1, srmult: 1, ihrmult: 1, deflectorPercent: 0, siabPercent: 0, chickmult: 1.25 },
    { name: 'T4E Gusset', image: 'images/Gusset4E.png', slots: 2, elrmult: 1, srmult: 1, ihrmult: 1, deflectorPercent: 0, siabPercent: 0, chickmult: 1.22 },
    { name: 'T2E Gusset', image: 'images/Gusset2E.png', slots: 2, elrmult: 1, srmult: 1, ihrmult: 1, deflectorPercent: 0, siabPercent: 0, chickmult: 1.12 },
    { name: '3 Slot', image: 'images/RandomLeg.png', slots: 3, elrmult: 1, srmult: 1, ihrmult: 1, deflectorPercent: 0, siabPercent: 0, chickmult: 1 },
    { name: 'T4C Gusset', image: 'images/Gusset4C.png', slots: 0, elrmult: 1, srmult: 1, ihrmult: 1, deflectorPercent: 0, siabPercent: 0, chickmult: 1.2 },
    { name: 'T3R Gusset', image: 'images/Gusset3R.png', slots: 1, elrmult: 1, srmult: 1, ihrmult: 1, deflectorPercent: 0, siabPercent: 0, chickmult: 1.16 },
    { name: 'T3C Gusset', image: 'images/Gusset3C.png', slots: 0, elrmult: 1, srmult: 1, ihrmult: 1, deflectorPercent: 0, siabPercent: 0, chickmult: 1.15 },
    { name: 'T2C Gusset', image: 'images/Gusset2C.png', slots: 0, elrmult: 1, srmult: 1, ihrmult: 1, deflectorPercent: 0, siabPercent: 0, chickmult: 1.1 },
    { name: 'T1C Gusset', image: 'images/Gusset1C.png', slots: 0, elrmult: 1, srmult: 1, ihrmult: 1, deflectorPercent: 0, siabPercent: 0, chickmult: 1.05 },
    { name: 'T4L SIAB', image: 'images/SIAB4L.png', slots: 2, elrmult: 1, srmult: 1, ihrmult: 1, deflectorPercent: 0, siabPercent: 100, chickmult: 1 },
    { name: 'T4E SIAB', image: 'images/SIAB4E.png', slots: 2, elrmult: 1, srmult: 1, ihrmult: 1, deflectorPercent: 0, siabPercent: 90, chickmult: 1 },
    { name: 'T4R SIAB', image: 'images/SIAB4R.png', slots: 1, elrmult: 1, srmult: 1, ihrmult: 1, deflectorPercent: 0, siabPercent: 80, chickmult: 1 }
];

const itemsDefl = [
    { name: 'T4L Defl.', image: 'images/Deflector4L.png', slots: 2, elrmult: 1, srmult: 1, ihrmult: 1, deflectorPercent: 20, siabPercent: 0, chickmult: 1 },
    { name: 'T4E Defl.', image: 'images/Deflector4E.png', slots: 2, elrmult: 1, srmult: 1, ihrmult: 1, deflectorPercent: 19, siabPercent: 0, chickmult: 1 },
    { name: 'T4R Defl.', image: 'images/Deflector4R.png', slots: 1, elrmult: 1, srmult: 1, ihrmult: 1, deflectorPercent: 17, siabPercent: 0, chickmult: 1 },
    { name: 'T4C Defl.', image: 'images/Deflector4C.png', slots: 0, elrmult: 1, srmult: 1, ihrmult: 1, deflectorPercent: 15, siabPercent: 0, chickmult: 1 },
    { name: 'T3R Defl.', image: 'images/Deflector3R.png', slots: 1, elrmult: 1, srmult: 1, ihrmult: 1, deflectorPercent: 13, siabPercent: 0, chickmult: 1 },
    { name: 'T3C Defl.', image: 'images/Deflector3C.png', slots: 0, elrmult: 1, srmult: 1, ihrmult: 1, deflectorPercent: 12, siabPercent: 0, chickmult: 1 },
    { name: 'T2C Defl.', image: 'images/Deflector2C.png', slots: 0, elrmult: 1, srmult: 1, ihrmult: 1, deflectorPercent: 8, siabPercent: 0, chickmult: 1 },
    { name: 'T1C Defl.', image: 'images/Deflector1C.png', slots: 0, elrmult: 1, srmult: 1, ihrmult: 1, deflectorPercent: 5, siabPercent: 0, chickmult: 1 },
    { name: '3 Slot', image: 'images/RandomLeg.png', slots: 3, elrmult: 1, srmult: 1, ihrmult: 1, deflectorPercent: 0, siabPercent: 0, chickmult: 1 }
];

const itemsChal = [
    { name: 'T4L Chalice', image: 'images/Chalice4L.png', slots: 3, elrmult: 1, srmult: 1, ihrmult: 1.4, deflectorPercent: 0, siabPercent: 0, chickmult: 1 },
    { name: 'T4E Chalice', image: 'images/Chalice4E.png', slots: 2, elrmult: 1, srmult: 1, ihrmult: 1.35, deflectorPercent: 0, siabPercent: 0, chickmult: 1 },
    { name: 'T4C Chalice', image: 'images/Chalice4C.png', slots: 0, elrmult: 1, srmult: 1, ihrmult: 1.3, deflectorPercent: 0, siabPercent: 0, chickmult: 1 },
    { name: 'T3E Chalice', image: 'images/Chalice3E.png', slots: 2, elrmult: 1, srmult: 1, ihrmult: 1.25, deflectorPercent: 0, siabPercent: 0, chickmult: 1 },
    { name: 'T3R Chalice', image: 'images/Chalice3R.png', slots: 1, elrmult: 1, srmult: 1, ihrmult: 1.23, deflectorPercent: 0, siabPercent: 0, chickmult: 1 },
    { name: 'T3C Chalice', image: 'images/Chalice3C.png', slots: 0, elrmult: 1, srmult: 1, ihrmult: 1.2, deflectorPercent: 0, siabPercent: 0, chickmult: 1 },
    { name: 'T2E Chalice', image: 'images/Chalice2E.png', slots: 2, elrmult: 1, srmult: 1, ihrmult: 1.15, deflectorPercent: 0, siabPercent: 0, chickmult: 1 },
    { name: 'T2C Chalice', image: 'images/Chalice2C.png', slots: 0, elrmult: 1, srmult: 1, ihrmult: 1.1, deflectorPercent: 0, siabPercent: 0, chickmult: 1 },
    { name: 'T1C Chalice', image: 'images/Chalice1C.png', slots: 0, elrmult: 1, srmult: 1, ihrmult: 1.05, deflectorPercent: 0, siabPercent: 0, chickmult: 1 }
];

const itemsMonocle = [
    { name: 'T4L Monocle', image: 'images/Monocle4L.png', slots: 3, elrmult: 1, srmult: 1, ihrmult: 1.3, deflectorPercent: 0, siabPercent: 0, chickmult: 1 },
    { name: 'T4E Monocle', image: 'images/Monocle4E.png', slots: 2, elrmult: 1, srmult: 1, ihrmult: 1.25, deflectorPercent: 0, siabPercent: 0, chickmult: 1 },
    { name: 'T4C Monocle', image: 'images/Monocle4C.png', slots: 0, elrmult: 1, srmult: 1, ihrmult: 1.2, deflectorPercent: 0, siabPercent: 0, chickmult: 1 },
    { name: 'T3C Monocle', image: 'images/Monocle3C.png', slots: 0, elrmult: 1, srmult: 1, ihrmult: 1.15, deflectorPercent: 0, siabPercent: 0, chickmult: 1 },
    { name: 'T2C Monocle', image: 'images/Monocle2C.png', slots: 0, elrmult: 1, srmult: 1, ihrmult: 1.1, deflectorPercent: 0, siabPercent: 0, chickmult: 1 },
    { name: 'T1C Monocle', image: 'images/Monocle1C.png', slots: 0, elrmult: 1, srmult: 1, ihrmult: 1.05, deflectorPercent: 0, siabPercent: 0, chickmult: 1 }
];

const itemsIHRDefl = [
    { name: 'T4L Defl.', image: 'images/Deflector4L.png', slots: 2, elrmult: 1, srmult: 1, ihrmult: 1, deflectorPercent: 20, siabPercent: 0, chickmult: 1 },
    { name: 'T4E Defl.', image: 'images/Deflector4E.png', slots: 2, elrmult: 1, srmult: 1, ihrmult: 1, deflectorPercent: 19, siabPercent: 0, chickmult: 1 },
    { name: 'T4R Defl.', image: 'images/Deflector4R.png', slots: 1, elrmult: 1, srmult: 1, ihrmult: 1, deflectorPercent: 17, siabPercent: 0, chickmult: 1 },
    { name: 'T4C Defl.', image: 'images/Deflector4C.png', slots: 0, elrmult: 1, srmult: 1, ihrmult: 1, deflectorPercent: 15, siabPercent: 0, chickmult: 1 },
    { name: 'T3R Defl.', image: 'images/Deflector3R.png', slots: 1, elrmult: 1, srmult: 1, ihrmult: 1, deflectorPercent: 13, siabPercent: 0, chickmult: 1 },
    { name: 'T3C Defl.', image: 'images/Deflector3C.png', slots: 0, elrmult: 1, srmult: 1, ihrmult: 1, deflectorPercent: 12, siabPercent: 0, chickmult: 1 },
    { name: 'T2C Defl.', image: 'images/Deflector2C.png', slots: 0, elrmult: 1, srmult: 1, ihrmult: 1, deflectorPercent: 8, siabPercent: 0, chickmult: 1 },
    { name: 'T1C Defl.', image: 'images/Deflector1C.png', slots: 0, elrmult: 1, srmult: 1, ihrmult: 1, deflectorPercent: 5, siabPercent: 0, chickmult: 1 },
    { name: '3 Slot', image: 'images/RandomLeg.png', slots: 3, elrmult: 1, srmult: 1, ihrmult: 1, deflectorPercent: 0, siabPercent: 0, chickmult: 1 },
    { name: '2 Slot', image: 'images/RandomEpic.png', slots: 2, elrmult: 1, srmult: 1, ihrmult: 1, deflectorPercent: 0, siabPercent: 0, chickmult: 1 }
];

const itemsIHRSIAB = [
    { name: 'T4L SIAB', image: 'images/SIAB4L.png', slots: 2, elrmult: 1, srmult: 1, ihrmult: 1, deflectorPercent: 0, siabPercent: 100, chickmult: 1 },
    { name: 'T4E SIAB', image: 'images/SIAB4E.png', slots: 2, elrmult: 1, srmult: 1, ihrmult: 1, deflectorPercent: 0, siabPercent: 90, chickmult: 1 },
    { name: 'T4R SIAB', image: 'images/SIAB4R.png', slots: 1, elrmult: 1, srmult: 1, ihrmult: 1, deflectorPercent: 0, siabPercent: 80, chickmult: 1 },
    { name: 'T4C SIAB', image: 'images/SIAB4C.png', slots: 0, elrmult: 1, srmult: 1, ihrmult: 1, deflectorPercent: 0, siabPercent: 70, chickmult: 1 },
    { name: 'T3R SIAB', image: 'images/SIAB3R.png', slots: 1, elrmult: 1, srmult: 1, ihrmult: 1, deflectorPercent: 0, siabPercent: 60, chickmult: 1 },
    { name: 'T3C SIAB', image: 'images/SIAB3C.png', slots: 0, elrmult: 1, srmult: 1, ihrmult: 1, deflectorPercent: 0, siabPercent: 50, chickmult: 1 },
    { name: '3 Slot', image: 'images/RandomLeg.png', slots: 3, elrmult: 1, srmult: 1, ihrmult: 1, deflectorPercent: 0, siabPercent: 0, chickmult: 1 },
    { name: '2 Slot', image: 'images/RandomEpic.png', slots: 2, elrmult: 1, srmult: 1, ihrmult: 1, deflectorPercent: 0, siabPercent: 0, chickmult: 1 }
];

const itemLabel1 = [
    { name: 'Boosted Arti. Set:' },
    { name: 'IHR Arti. Set:' }
];
const itemLabel2 = [
    { name: 'Boosted Arti. Set:' },
    { name: 'IHR Artifact Set:' }
];
const tableLabels = [
    { name: 'Player' },
    { name: 'ELR' },
    { name: 'SR' },
    { name: 'Contr. Ratio' },
    { name: 'Boost Order' },
    { name: 'BTV' },
    { name: 'Teamwork' },
    { name: 'Completion Time' },
    { name: 'CS' }
];


const itemLists = [itemLabel1, itemsMetro, itemsComp, itemsGusset, itemsDefl, itemLabel2, itemsChal, itemsMonocle, itemsIHRDefl, itemsIHRSIAB];

const artiQualArray = [[0, 0, 0, 0, 0, 0, 0, 0],
[0, 0, 0, 3, 0, 1, 3, 1],
[1, 1, 1, 3, 1, 2, 3, 3],
[2, 2, 1, 4, 2, 2, 3, 4]];

const scenarios = [
    {
        name: "All T4L Defl. + Leggies",
        apply: () => {
            numPlayers = parseInt(document.getElementById('numPlayers').value, 10);
            document.getElementById('QPlayerInput').value = numPlayers + ' 0';
        }
    },
    {
        name: "All T4E Defl. + Leggies",
        apply: () => {
            numPlayers = parseInt(document.getElementById('numPlayers').value, 10);
            document.getElementById('QPlayerInput').value = '0 ' + numPlayers;
        }
    },
    {
        name: "All T4R Defl. + Leggies",
        apply: () => {
            numPlayers = parseInt(document.getElementById('numPlayers').value, 10);
            document.getElementById('QPlayerInput').value = '0 0 ' + numPlayers;
        }
    },
    {
        name: "All T4C Defl. + Leggies",
        apply: () => {
            numPlayers = parseInt(document.getElementById('numPlayers').value, 10);
            document.getElementById('QPlayerInput').value = '0 0 0 ' + numPlayers;
        }
    },
    {
        name: "Mixed Deflectors",
        apply: () => {
            numPlayers = parseInt(document.getElementById('numPlayers').value, 10);
            b = Math.floor(numPlayers / 4);

            document.getElementById('QPlayerInput').value = b + ' ' + b + ' ' + b + ' ' + (numPlayers - 3 * b);
        }
    }
];

let minCS = 0;
let maxCS = 0;
let curentURLEncodeVer = 'v-5';

function changePlayerArti(artiArray) {
    numPlayers = parseInt(document.getElementById('numPlayers').value, 10);
    for (let i = 0; i < numPlayers; i++) {
        for (let j = 1; j < 5; j++) {
            selectElement = document.getElementById(`player${i}_item${j}`);
            selectElement.selectedIndex = artiArray[j - 1];
        }
        for (let j = 5; j < 9; j++) {
            selectElement = document.getElementById(`player${i}_item${j}`);
            selectElement.selectedIndex = artiArray[j - 1];
        }
    }
}

// Function to generate player inputs
function generatePlayers(artiArray) {
    numPlayers = parseInt(document.getElementById('numPlayers').value, 10);
    const targetEggAmount = parseInt(document.getElementById('targetEggAmount').value, 10);
    const eggUnit = document.getElementById('eggUnit').value;
    const container = document.getElementById('playersContainer');
    const currentPlayers = container.children.length;
    const containerInfo = document.getElementById('infoContainer');
    const containerInfo2 = document.getElementById('info2Container');
    const savedElementArray = document.getElementById('savedPlayerContainer');
    const containerRun = document.getElementById('runContainer');
    const containerOptOrder = document.getElementById('optimizeOrderContainer');
    const containerResults = document.getElementById('resultsContainer');
    const table = document.getElementById('playersTable');
    const tableCoop = document.getElementById('coopTable');
    const run = document.getElementById('run');
    const durUnit = document.getElementById('durUnit').value;
    //const saveButton = document.getElementById('saveButton');
    const btvtargetobj = document.getElementById('btvTarget');
    const artiQual = document.getElementById('artiQual').selectedIndex;
    const cxpToggle = document.getElementById('cxpToggle');
    if (artiArray !== undefined) {
        const artiNumbers = artiArray.split(/\s+/).filter(n => n !== '').map(Number);
        numPlayers = artiNumbers.reduce((acc, curr) => acc + curr, 0);
    }
    if (numPlayers == 0)
        return;

    if (numPlayers > 70) {
        strCoopSize = `<h2>CoopSize too large`;
        containerInfo.innerHTML = (strCoopSize);
        return;
    }

    //saveButton.hidden = false;
    // Remove players
    if (numPlayers < currentPlayers) {
        for (let i = container.children.length - 1; i >= (numPlayers); i--) {
            container.removeChild(container.children[i]);
        }
    }

    // Clear previous content
    if (currentPlayers === 0) {
        container.innerHTML = '';
        containerInfo.innerHTML = '';
        containerRun.innerHTML = '';
        containerResults.innerHTML = '';
        containerOptOrder.innerHTML = '';

        const str = document.createElement('div');
        str.innerHTML = `<h1>Player Information`;
        containerInfo.appendChild(str);
        const strinfo = document.createElement('div');
        strinfo.innerHTML = `Example: If (Mirror is checked & tokens=9) then 1020x tach + 10x beacon + mirror is assumed.`;
        containerInfo.appendChild(strinfo);

        const str2 = document.createElement('div');
        str2.innerHTML = `<h1>Results`;
        const str34 = document.createElement('div');
        str34.innerHTML = `Note: Table should update automatically whenever any change to settings is detected.`;
        containerResults.appendChild(str2);
        containerResults.appendChild(str34);
    }
    table.innerHTML = '';
    tableCoop.innerHTML = '';

    // Change existing players artis, if specified

    if (artiArray !== undefined) {
        for (let i = 0; i < currentPlayers; i++) {
            n = findDeflectorForPlayer(i, artiArray.split(/\s+/).filter(n => n !== '').map(Number));
            defl1El = document.getElementById(`player${i}_item${4}`);
            defl1El.selectedIndex = n;
            defl2El = document.getElementById(`player${i}_item${7}`);
            defl2El.selectedIndex = n;
            setColor(defl1El);
            setColor(defl2El);
        }
    }

    // Generate player sections
    for (let i = currentPlayers; i < numPlayers; i++) {
        const playerDiv = document.createElement('div');
        playerDiv.classList.add('player');

        // New Code: Create Up and Down buttons
        playerDiv.setAttribute("id", `player-${i}`);
        const strBO = document.createElement('label');
        strBO.innerHTML = 'Move boost order:  ';


        const upButton = document.createElement("button");
        upButton.textContent = '\u{02191}';
        upButton.onclick = () => movePlayerUp(i);

        const downButton = document.createElement("button");
        downButton.textContent = '\u{02193}';
        downButton.onclick = () => movePlayerDown(i);

        const quickMoveButton = document.createElement("label");
        quickMoveButton.textContent = 'Quick Move To Postion: ';
        quickMoveButton.style.paddingLeft = '5px';
        quickMoveButton.style.paddingRight = '5px';
        //quickMoveButton.onClick = () => movePlayerQuick(i);

        const movePosition = document.createElement("input");
        movePosition.type = "number";
        movePosition.min = 1;
        movePosition.value = i + 1;
        movePosition.id = `MovePosition${i}`;
        movePosition.style.width = '50px';
        movePosition.onchange = () => movePlayerQuick(i);

        playerDiv.appendChild(strBO);
        playerDiv.appendChild(upButton);
        playerDiv.appendChild(downButton);
        playerDiv.appendChild(quickMoveButton);
        playerDiv.appendChild(movePosition);
        // New Code end

        // Create a container for player information
        const playerInfoDiv = document.createElement('div');
        playerInfoDiv.classList.add('player-info');
        playerInfoDiv.innerHTML = `
            <label for="playerName${i}">Name:</label>
            <input type="text" id="playerName${i}" value="Player ${i}">
            <label for="playerTokens${i}">Tokens:</label>
            <input type="number" id="playerTokens${i}" min="0" value="6" max="12" onkeyup=enforceMinMax(this)>
            <label for="playerMirror${i}">Mirror?:</label>
            <input type="checkbox" id="playerMirror${i}">
            <label for="Shipping-colleggtible${i}">, All colleggtibles?:</label>
            <input type="checkbox" id="Shipping-colleggtible${i}" checked="true">
            <label for="Sink${i}" id="SinkLabel${i}">, Sink?:</label>
            <input type="checkbox" id="Sink${i}">
            <label for="Creator${i}">, Creator?:</label>
            <input type="checkbox" id="Creator${i}">
            <label for="playerTE${i}">, #TE:</label>
            <input type="number" id="playerTE${i}" min="0" value="10" max="999" onkeyup=enforceMinMax(this)>
        `;

        const itemsGrid = document.createElement('div');
        itemsGrid.classList.add('itemsGrid');


        offset = 0;
        itemLists.forEach((itemList, index) => {
            if (index == 0 || index == 5) {
                const itemDiv = document.createElement('div');
                itemDiv.innerHTML = `
                    <label for="player${i}_item${index + 1 - offset}">${itemLabel1[offset].name}</label>
                `;
                itemsGrid.appendChild(itemDiv);
                offset += 1;
            } else {
                const itemDiv = document.createElement('div');
                itemDiv.classList.add('item');
                itemDiv.innerHTML = `
                        <select id="player${i}_item${index + 1 - offset}" name="player${i}_items" onchange="updateImage(${i}, ${index + 1 - offset})">
                        ${itemList.map(item => `<option value="${item.name}">${item.name}</option>`).join('')}
                        
                    </select>
                `;
                itemsGrid.appendChild(itemDiv);
            }

        });

        const imageContainer = document.createElement('div');
        imageContainer.classList.add('imageContainer');
        imageContainer.id = `imageContainer${i}`;
        playerDiv.appendChild(imageContainer);

        playerDiv.appendChild(playerInfoDiv); // Add player info row
        playerDiv.appendChild(itemsGrid);
        container.appendChild(playerDiv);




        // Change color of generated lists. Not sure why it's not working when the list is generated
        for (let j = 1; j <= 4; j++) {
            const selectElement = document.getElementById(`player${i}_item${j}`);
            selectElement.style.backgroundColor = '#fef941';
            selectElement.style.color = '#333';
        }
        for (let j = 5; j <= 8; j++) {
            const selectElement = document.getElementById(`player${i}_item${j}`);
            selectElement.style.backgroundColor = '#fef941';
            selectElement.style.color = '#333';
        }
    }

    // Add or remove sink option depending on seasonal or leggacy
    let cxpVal = cxpToggle.checked;
    if (cxpVal) {
        for (let i = 0; i < numPlayers; i++) {
            document.getElementById(`Sink${i}`).hidden = cxpVal;
            document.getElementById(`SinkLabel${i}`).hidden = cxpVal;
        }
    }

    // GenerateCoopTable
    const tableHeaderCoop = `<tr>
        <th>Production Rate (q/hr)</th>
        <th>Completion Time</th>
        <th>max CS</th>
        <th>mean<sup>**</sup> CS</th>
        <th>Deflector Boost</th>
        <th>Unused Deflector %</th>
    </tr>`;
    const tableRowsCoop = [];

    rowCoop = `<tr>`;
    for (let i = 0; i < 6; i++) {
        rowCoop += `<td></td>`;
    }
    rowCoop += `</tr>`;
    tableRowsCoop.push(rowCoop);

    tableCoop.innerHTML = tableHeaderCoop + tableRowsCoop.join('');

    // Generate table
    const tableHeader = `<tr>
        <th>Player</th>
        <th>elr (q/hr)</th>
        <th>sr (q/hr)</th>
        <th>Population</th>
        <th>Contr. Ratio</th>
        <th>Time to Boost</th>
        <th>BTV / complTime</th>
        <th>Teamwork</th>
        <th>CS</th>
    </tr>`;

    const tableRows = [];
    for (let i = 0; i < numPlayers; i++) {
        const row = `<tr>
        <td id="playerNameTable${i}">Player ${i}</td>
        ${items.map(() => `<td></td>`).join('')}
    </tr>`;
        tableRows.push(row);
    }

    table.innerHTML = tableHeader + tableRows.join('');

    strinfo = "<br />" + '<b><u>Valid for cxp-v0.2.0</u></b>' + "<br />" + 'Current Colleggtibles Assumed (If Checked): +5% Shipping, +5% Shipping, +5% IHR, +5% Layrate, +5% Hab Capacity' + "<br />"
        + '*: Chicken Runs not maxed: coopSize-1 used for CRs. TokenValue not maxed: Sent=0 used. Join Delay is the amount of time between coop creation and player joining. Min/tokenGift/player determines how lucky token farming is: 10 is a pretty lucky run, 13 average'
        + "<br />" + '**: Mean excludes Sinks, and players without deflectors in boosted set' + "<br />"
        + '<b><u>Assumptions:</u></b> 50x tach. boost assumed prior to boost. coopSize = maxCoopSize. All players present for token farming, '
        + 'all players check in immediately when finished boosting and update artis, and check in right at completion. Offline IHR, and token farming always assumed; shiny deflectors are equipped with life stones during boosting, and quant / tach after boosting '
        + '(these will overshoot CS predictions a bit).  ' + "<br />" + '<b><u>Boosting Assumptions(no mirror): </u></b>' + "<br />" + ' < 2 token or > 12 tokens = 50x tach, '
        + '1 token = (40x tach)(2x beacon), 2 token = 140x tach, ' + "<br />" + '3 token = (130x tach) (2x beacon), 4 token = 1040x tach, '
        + "<br />" + '5 token = (1030x tach) (2x beacon), 6 token = (1020x tach) (4x beacon), ' + "<br />" + '7 token = (1010x tach) (6x beacon), 8 token = (1030x tach) (10x beacon), '
        + "<br />" + '9 token = (1020x tach) (12x beacon), 10 token = (1010x tach) (14x beacon), ' + "<br />" + '11 token = (1000x tach) (16x beacon), 12 token = (1030x tach) (50x beacon) '
        + "<br />" + '<b><u>Assumptions with SIAB in Boosted Arti Set:</u></b>'
        + "<br />" + 'SIAB is switched at optimal time to a legendary in the same slot. This does assume that if gusset is swapped in, chickens are immediately maxed which will overshoot projections a bit. It also assumes there is only 1 swap time. That is, if 1 player is using T4L SIAB and another T4E SIAB, the T4E will want to keep theirs in for longer in a real coop, '
        + 'but the simulation will switch theirs when it is optimal for the T4L player'
        + "<br /><b><u>Creator</b></u><br /> Creators do not get btv penalized during Join Delay time. Additionally, if Join Delay time is very long, and the creator(s) is at the top of the boost list, they could boost before Join Delay time is complete. If everyone is a creator, no one loses btv during Join Delay, and Join Delay time is ignored.";
    //+ 'To do list: Fix multiple SIABs being equipped, add arti-check like auditcoop, add version number to URL to allow for additional features in future, '
    //+ 'add checkboxes where kev steals 4 hours worth of eggs, or gifted tokens, from a user at random. '
    containerInfo2.innerHTML = strinfo;

    // Add listeners
    onPlayersGenerated();

    if (artiArray === undefined) {
        // Set default arti Quality
        for (let i = currentPlayers; i < numPlayers; i++) {
            // Add listeners to each player
            document.getElementById(`playerName${i}`).onchange = () => Run();
            document.getElementById(`playerTokens${i}`).onchange = () => Run();
            document.getElementById(`playerMirror${i}`).onchange = () => Run();
            document.getElementById(`Shipping-colleggtible${i}`).onchange = () => Run();
            document.getElementById(`Sink${i}`).onchange = () => Run();
            document.getElementById(`Creator${i}`).onchange = () => Run();
            selectElement = document.getElementById(`playerTE${i}`);
            selectElement.onchange = () => Run();
            selectElement.value = document.getElementById('numTEDefault').value;
            for (let j = 1; j < 5; j++) {
                selectElement = document.getElementById(`player${i}_item${j}`);
                selectElement.onchange = () => Run();
                selectElement.selectedIndex = artiQualArray[artiQual][j - 1];
                setColor(selectElement);
            }
            for (let j = 5; j < 9; j++) {
                selectElement = document.getElementById(`player${i}_item${j}`);
                selectElement.onchange = () => Run();
                selectElement.selectedIndex = artiQualArray[artiQual][j - 1];
                setColor(selectElement);
            }
        }
    } else {
        for (let i = currentPlayers; i < numPlayers; i++) {
            n = findDeflectorForPlayer(i, artiArray.split(/\s+/).filter(n => n !== '').map(Number));
            defl1El = document.getElementById(`player${i}_item${4}`);
            defl1El.selectedIndex = n;
            defl2El = document.getElementById(`player${i}_item${7}`);
            defl2El.selectedIndex = n;
            setColor(defl1El);
            setColor(defl2El);
        }
        // Reset number of players based on number of typed players
        document.getElementById('numPlayers').value = numPlayers;
    }


    // Run
    Run();
}

function findDeflectorForPlayer(n, artiNumbers) {
    let total = 0;
    for (let i = 0; i < artiNumbers.length; i++) {
        total += artiNumbers[i];

        if (n + 1 <= total) {
            return i;
        }
    }
}

function movePlayerUp(i) {
    const playersContainer = document.getElementById("playersContainer");
    if (i > 0) {
        const playerDiv = playersContainer.children[i];
        playersContainer.insertBefore(playerDiv, playersContainer.children[i - 1]);

        const upButton = playerDiv.children[1];//querySelector('button:first-child');
        const downButton = playerDiv.children[2]; //.querySelector('button:last-child');
        const movePosition = playerDiv.children[4];
        upButton.onclick = () => movePlayerUp(i - 1);
        downButton.onclick = () => movePlayerDown(i - 1);
        movePosition.onchange = () => movePlayerQuick(i - 1);


        const playerDiv2 = playersContainer.children[i];
        const upButton2 = playerDiv2.children[1]; //.querySelector('button:first-child');
        const downButton2 = playerDiv2.children[2]; //.querySelector('button:last-child');
        const movePosition2 = playerDiv2.children[4];
        upButton2.onclick = () => movePlayerUp(i);
        downButton2.onclick = () => movePlayerDown(i);
        movePosition2.onchange = () => movePlayerQuick(i);

        // Reset id's
        for (let j = 1; j < 9; j++) {
            swapID(`player${i}_item${j}`, `player${i - 1}_item${j}`);
        }
        swapID(`playerName${i}`, `playerName${i - 1}`);
        swapID(`playerTokens${i}`, `playerTokens${i - 1}`);
        swapID(`playerMirror${i}`, `playerMirror${i - 1}`);
        swapID(`Shipping-colleggtible${i}`, `Shipping-colleggtible${i - 1}`);
        swapID(`Sink${i}`, `Sink${i - 1}`);
        swapID(`Creator${i}`, `Creator${i - 1}`);
        const container = document.getElementById('playersContainer');
        const playerDivs = Array.from(container.children);
        playerDivs[i].id = `player2-${i}`;
        playerDivs[i - 1].id = `player-${i - 1}`;
        playerDivs[i].id = `player-${i}`;
        playerDivs[i].children[4].value = i + 1;
        playerDivs[i - 1].children[4].value = i;

        Run();
    }
}

function swapID(id1, id2) {
    const el1 = document.getElementById(id1);
    const el2 = document.getElementById(id2);
    if (!el1 || !el2) return;

    const tempID = el1.id;
    el1.id = el2.id;
    el2.id = tempID;
}


function movePlayerDown(i) {
    const playersContainer = document.getElementById("playersContainer");
    if (i < playersContainer.children.length - 1) {
        const playerDiv = playersContainer.children[i];
        playersContainer.insertBefore(playerDiv.nextSibling, playerDiv);

        const upButton = playerDiv.children[1];
        const downButton = playerDiv.children[2];
        const movePosition = playerDiv.children[2];
        upButton.onclick = () => movePlayerUp(i + 1);
        downButton.onclick = () => movePlayerDown(i + 1);
        movePosition.onchange = () => movePlayerQuick(i + 1);

        const playerDiv2 = playersContainer.children[i];
        const upButton2 = playerDiv2.children[1];
        const downButton2 = playerDiv2.children[2];
        const movePosition2 = playerDiv.children[2];
        upButton2.onclick = () => movePlayerUp(i);
        downButton2.onclick = () => movePlayerDown(i);
        movePosition2.onchange = () => movePlayerQuick(i);

        // Reset id's
        for (let j = 1; j < 9; j++) {
            swapID(`player${i}_item${j}`, `player${i + 1}_item${j}`);
        }
        swapID(`playerName${i}`, `playerName${i + 1}`);
        swapID(`playerTokens${i}`, `playerTokens${i + 1}`);
        swapID(`playerMirror${i}`, `playerMirror${i + 1}`);
        swapID(`Shipping-colleggtible${i}`, `Shipping-colleggtible${i + 1}`);
        swapID(`Sink${i}`, `Sink${i + 1}`);
        swapID(`Creator${i}`, `Creator${i + 1}`);
        const container = document.getElementById('playersContainer');
        const playerDivs = Array.from(container.children);
        playerDivs[i].id = `player2-${i}`;
        playerDivs[i + 1].id = `player-${i + 1}`;
        playerDivs[i].id = `player-${i}`;
        playerDivs[i + 1].children[4].value = i + 1 + 1;
        playerDivs[i].children[4].value = i + 1;

        Run()
    }
}

function movePlayerQuick(currentIndex) {

    const playersContainer = document.getElementById("playersContainer");
    const playerDiv = playersContainer.children[currentIndex];
    const numPlayers = parseInt(document.getElementById('numPlayers').value, 10);
    desiredIndex = parseInt(playerDiv.children[4].value);
    // Sanitize inputs
    desiredIndex = (desiredIndex < 0) ? 0 : desiredIndex;
    desiredIndex = (desiredIndex > numPlayers) ? (numPlayers) : desiredIndex;
    playerDiv.children[4].value = desiredIndex;
    while (currentIndex < (desiredIndex - 1) && currentIndex < (numPlayers)) {
        movePlayerUp(currentIndex + 1);
        currentIndex++;
    }
    while (currentIndex > (desiredIndex - 1) && currentIndex >= 0) {
        movePlayerUp(currentIndex);
        currentIndex--;
    }

};
// Main simulation after Run button is clicked
function Run() {
    const playersContainer = document.getElementById("playersContainer");
    const playerDivs = Array.from(playersContainer.children);
    const numPlayers = parseInt(document.getElementById('numPlayers').value, 10);
    const consoleElement = document.getElementById('console');
    const crtTime = parseFloat(document.getElementById('crttime').value, 10);
    const timeToTokenGift = parseFloat(document.getElementById('mpft').value, 10) * 60;
    const tokenTimer = parseFloat(document.getElementById('tokenTimer').value, 10) * 60;
    duration = parseFloat(document.getElementById('duration').value, 10); // seconds, duration to finish contract in
    const durUnits = document.getElementById('durUnit').value;
    const eggUnit = document.getElementById('eggUnit').value;
    const containerOptOrder = document.getElementById('optimizeOrderContainer');
    targetEggAmount = parseFloat(document.getElementById('targetEggAmount').value, 10); // Target egg amount to finish contract
    const btvtargetobj = document.getElementById('btvTarget');
    const btvlabel = document.getElementById('btvTargetLabel');
    const btvtarget = parseFloat(btvtargetobj.value, 10);
    const SIABtext = document.getElementById('SIABSwapContainer');
    const cxpToggle = document.getElementById('cxpToggle');
    SIABtext.innerHTML = '';
    btvtargetobj.hidden = true;
    btvlabel.hidden = true;
    new2p0 = cxpToggle.checked;

    //const GGflag = document.getElementById('GGToggle').checked;
    GG = document.getElementById('GGToggle').checked ? 2 : 1;
    /*
    // Make boost order button
    containerOptOrder.innerHTML = '';
    const optOrder = document.createElement('button');
    optOrder.innerHTML = 'Optimize Boost Order (beta)';
    optOrder.addEventListener('click', optimizeOrder);
    containerOptOrder.appendChild(optOrder);
    */
    if (tokenTimer == 0)
        tokenTimer = 1;


    duration = convertUnits(duration, durUnits);
    targetEggAmount = convertUnits(targetEggAmount, eggUnit);



    //Instantiate each player
    players = [];
    totDeflector = 0;
    for (let i = 0; i < numPlayers; i++) {
        const playerNameInput = document.getElementById(`playerName${i}`);
        const playerName = playerNameInput ? playerNameInput.value : `Player ${i}`;
        currentPlayerDefl = getDeflectorPerc(i);
        totDeflector += currentPlayerDefl;
        const player = new PlayerClass({
            name: playerName,
            tokens: parseInt(document.getElementById(`playerTokens${i}`).value, 10),
            stats: {
                boostMulti: calcBoostMulti(0),
                maxChickens: getMaxChickens(i),
                deflectorPercent: currentPlayerDefl,
                siabPercent: getSIABPerc(i),
                timeToBoost: duration,
            },
            rates: {
                ihr: calcIHR(i),
                baseShip: 2978359222414.5 * 2400 * getCollegtibleShip(i) * getSRModifier(),
                baseELR: 332640 * getELRModifier() * getCollegtibleELR(i),
            },
            flags: {
                needsMirror: document.getElementById(`playerMirror${i}`).checked,
                isSink: document.getElementById(`Sink${i}`).checked,
                isCreator: document.getElementById(`Creator${i}`).checked
            }
        })
        players.push(player);
    }




    players.forEach(player => {
        player.stats.otherDefl = totDeflector - player.stats.deflectorPercent;
    });

    const updateRate = 1; // 1/seconds


    eggsDelivered = 0; // Total Eggs delivered by all players
    allMaxHabs = false; // flag if all players haven't fill habs
    allBoosting = false;
    t_elapsed = 0; // Start sim at t=0
    tokensUsed = 0; // Total coop tokens
    numberBoosting = 0; // Total number of players boosting

    // Simulate CRT if first player is creator
    if (players[0].flags.isCreator) {
        while (eggsDelivered < targetEggAmount && t_elapsed < crtTime && allMaxHabs == false) {
            totNotMaxHabs = 0;
            totDeflector2 = 0;
            updateOtherDefl = false;
            players.forEach((player, index) => {
                if (player.flags.maxHab == false && player.flags.isCreator) {
                    player.updateChickens();
                    player.updateELR();
                    totNotMaxHabs++;
                    if (player.flags.maxHab == true) {
                        // Boost Time
                        time = t_elapsed - player.timeToBoost;
                        player.stats.boostingTime = t_elapsed - player.stats.timeToBoost;
                        //Player reached max, swap artis
                        updateArtis(index, player);
                        // Trigger a deflectorchangeto update all rates
                        updateOtherDefl = true;
                    }
                }
                totDeflector2 += player.stats.deflectorPercent;
                player.updateEggsDelivered(updateRate);
                player.updateBTV(updateRate, new2p0);
            });

            if (updateOtherDefl) {
                players.forEach(player => {
                    player.stats.otherDefl = totDeflector2 - player.stats.deflectorPercent;
                });
                players.forEach((player, index) => {
                    if (player.flags.isCreator) {
                        [player.rates.layRate, player.rates.shipRate, player.stats.numTach, player.stats.numQuant] = calcRate(index, player.stats.chickens, players);
                        // Todo: continue from here: add .rates, .stats, and .flags to player
                        player.rates.deliveryRate = Math.min(player.rates.layRate, player.rates.shipRate);
                    }
                });
            }

            // Check if all players have max Habs
            if (totNotMaxHabs == 0)
                allMaxHabs = true;

            // Assume average drop rate of tokens
            totTokens = Math.floor(t_elapsed * numPlayers / timeToTokenGift) * GG;
            totTokens += Math.floor(t_elapsed / tokenTimer) + Math.floor((t_elapsed - crtTime) / tokenTimer) * (numPlayers - 1); // Add Timer tokens

            // Check if next user can boost
            if (allBoosting == false) {
                if (players[numberBoosting].tokens <= (totTokens - tokensUsed) && players[numberBoosting].isCreator) {
                    players = playerBoosting(players, numberBoosting);
                    tokensUsed += players[numberBoosting].tokens;
                    players[numberBoosting].timeToBoost = t_elapsed;
                    numberBoosting++;
                }
                allBoosting = numberBoosting == players.length ? true : false;
            }

            // Update eggsDelivered
            eggsDelivered = 0;
            players.forEach(player => {
                if (player.isCreator) {
                    eggsDelivered += player.eggsDelivered;
                }
            });


            t_elapsed += updateRate;
        }
    } else {
        players.forEach(player => {
            if (player.isCreator) {
                player.updateBTV(t_elapsed, new2p0);
            }
        });
        t_elapsed = crtTime;
    }



    // Simulation of token farming and boosting stage
    while (eggsDelivered < targetEggAmount && t_elapsed < duration && allMaxHabs == false) {
        totNotMaxHabs = 0;
        totDeflector2 = 0;
        updateOtherDefl = false;
        // Update each players, chickens, rate, eggs Delivered, btv at start of each step, assuming player isn't max habs
        players.forEach((player, index) => {
            if (player.flags.maxHab == false) {
                player.updateChickens();
                player.updateDeliveryRate();
                totNotMaxHabs++;
                if (player.flags.maxHab == true) {
                    // Boost Time
                    time = t_elapsed - player.stats.timeToBoost;
                    player.stats.boostingTime = t_elapsed - player.stats.timeToBoost;
                    //Player reached max, swap artis
                    updateArtis(index, player);
                    // Trigger a deflectorchangeto update all rates
                    updateOtherDefl = true;
                }
            }
            totDeflector2 += player.stats.deflectorPercent;
            player.updateEggsDelivered(updateRate);
            player.updateBTV(updateRate, new2p0);
        });

        // change everyone's rate and otherdefl
        if (updateOtherDefl) {
            players.forEach(player => {
                player.stats.otherDefl = totDeflector2 - player.stats.deflectorPercent;
            });
            players.forEach((player, index) => {
                [player.rates.layRate, player.rates.shipRate, player.stats.numTach, player.stats.numQuant] = calcRate(index, player.stats.chickens, players);
                player.rates.deliveryRate = Math.min(player.rates.layRate, player.rates.shipRate);
            });
        }

        // Check if all players have max Habs
        if (totNotMaxHabs == 0)
            allMaxHabs = true;

        // Assume average drop rate of tokens
        totTokens = Math.floor(t_elapsed * numPlayers / timeToTokenGift) * GG;
        totTokens += Math.floor(t_elapsed / tokenTimer) + Math.floor((t_elapsed - crtTime) / tokenTimer) * (numPlayers - 1); // Add Timer tokens

        // Check if next user can boost
        if (allBoosting == false) {
            if (players[numberBoosting].tokens <= (totTokens - tokensUsed)) {
                players = playerBoosting(players, numberBoosting);
                tokensUsed += players[numberBoosting].tokens;
                players[numberBoosting].stats.timeToBoost = t_elapsed;
                numberBoosting++;
            }
            allBoosting = numberBoosting == players.length ? true : false;
        }

        // Update eggsDelivered
        eggsDelivered = 0;
        players.forEach(player => {
            eggsDelivered += player.stats.eggsDelivered;
        });


        t_elapsed += updateRate;


    }

    // Check if there is still time remaining
    if (t_elapsed <= duration) {
        if (eggsDelivered < targetEggAmount) {
            // First, check if anyone has SIAB active
            creatorSIABActive = false;
            siabActive = false;
            btvRateMax = 0;
            players.forEach((player, index) => {
                // todo: start here
                if (player.stats.siabPercent > 0) {
                    if (index == 0 && player.isCreator) {
                        creatorSIABActive = true;
                    }
                    siabActive = true;
                    player.flags.siabActive = true;
                    if (new2p0) {
                        deflRate = 12.5 * Math.min(player.stats.deflectorPercent, 12) / 100;
                        siabRate = 0.75 * Math.min(player.stats.siabPercent, 50) / 100;
                    } else {
                        deflRate = 7.5 * player.stats.deflectorPercent / 100;
                        siabRate = 0.75 * player.stats.siabPercent / 100;
                    }
                    if (btvRateMax < deflRate + siabRate) {
                        btvRateMax = deflRate + siabRate;
                        deflRateMax = deflRate;
                        siabRateMax = siabRate;
                    }
                }
            });

            // Scale rates to completion
            rate = 0;
            players.forEach(player => {
                rate += player.rates.deliveryRate;
            });
            rate = rate == 0 ? 1 : rate;

            rateOld = rate;
            // Handle case where SIAB is active, currently only fixes one player, not all
            if (siabActive) {
                // CHECK IF CRTTIME SHOULD BE = 0 if player swapping is creator and first ===============================================
                // Ratio of time siab needs to be active for maxing teamwork
                //Br = (2 - deflRateMax) / siabRateMax;
                RN = 0;
                players.forEach((player, playerIndex) => {
                    // Save rates before swap
                    saveDataBeforeSwap(player);
                    [player.rates.layRate, player.rates.shipRate, player.stats.chickens, player.stats.maxChickens, player.stats.numTach, player.stats.numQuant] = calcRateSIABRemoved(playerIndex, players[playerIndex].stats.chickens, players);
                    player.rates.deliveryRate = Math.min(player.rates.layRate, player.rates.shipRate);
                    RN += player.rates.deliveryRate / 60 / 60;
                });
                crtFactor = 1;
                if (creatorSIABActive) {
                    crtFactor = 0;
                }

                T0 = t_elapsed - crtTime * crtFactor;
                R1 = rate / 60 / 60;
                num = RN * (btvtarget * crtTime * crtFactor - T0 * (siabRateMax + deflRateMax - btvtarget)) - (deflRateMax - btvtarget) * (targetEggAmount - eggsDelivered);
                den = RN * (siabRateMax + deflRateMax - btvtarget) - (deflRateMax - btvtarget) * R1;
                T1 = num / den;

                T1 = Math.max(T1, 0);
                tCompleteAtCurrentRate = (targetEggAmount - eggsDelivered) / (rate / 60 / 60);
                rateChange = false;
                if (T1 < tCompleteAtCurrentRate) {
                    rateChange = true;
                }
                T1 = Math.min(T1, tCompleteAtCurrentRate);
                // update each players contrib during T1
                players.forEach(player => {
                    //player.updateEggsDelivered(T1);
                    player.updateEggsDeliveredSIAB(T1);
                    player.updateBTV(T1, new2p0);
                });
                eggsDelivered += T1 * rate / 60 / 60;
                players.forEach(player => {
                    if (player.stats.siabPercent > 0) {
                        player.stats.deliveryRate = Math.min(player.stats.layRate, player.stats.shipRate);
                        player.stats.siabPercent = 0;
                    }
                });

                if (rateChange) {
                    rate = RN * 60 * 60;
                }

                t_elapsed += T1;
            }





            completionTime = t_elapsed + (targetEggAmount - eggsDelivered) / (rate / 60 / 60);


            if (completionTime < duration) {
                // update each players contrib.
                players.forEach(player => {
                    player.updateEggsDelivered((targetEggAmount - eggsDelivered) / (rate / 60 / 60));
                    player.updateBTV((targetEggAmount - eggsDelivered) / (rate / 60 / 60), new2p0);
                });
                // Calculate how much deflector% can be dropped
                [defDropPerc2, defDropPerc] = getDeflectorDropPerc(players, totDeflector2);
                if (siabActive) {
                    [meanCS, maxCS, minCS] = fillTable2SIAB(players, completionTime, targetEggAmount, duration, crtTime + T0 + T1);
                    fillTableCoopSIAB(rateOld, rate, completionTime, maxCS, meanCS, totDeflector2, defDropPerc, defDropPerc2, crtTime + T0 + T1);
                } else {
                    [meanCS, maxCS, minCS] = fillTable2(players, completionTime, targetEggAmount, duration, new2p0);
                    fillTableCoop(rate, completionTime, maxCS, meanCS, totDeflector2, defDropPerc);
                }



            }
            else {
                // Mission failed, we'll get 'em next time.
                fillTableFail();
            }
        }
        else {
            // Coop completed before everyone boosted
            completionTime = t_elapsed;
            [meanCS, maxCS] = fillTable2(players, completionTime, targetEggAmount, duration, new2p0);
            [defDropPerc2, defDropPerc] = getDeflectorDropPerc(players, totDeflector2);
            [meanCS, maxCS, minCS] = fillTable2(players, completionTime, targetEggAmount, duration, new2p0);
            fillTableCoop(0, completionTime, maxCS, meanCS, totDeflector2, defDropPerc);

        }

    }
    else {
        fillTableFail();
    }

    // To do: Add checks on arti's (if 2 siabs used), or if possibly sub-optimal rates used
    // To do: images(?)
    // to do: number of players that can switch off deflector


    const [data, data2] = gatherData();
    const base64Data = dataToBase64(data, data2);
    updateUrlWithBase64(curentURLEncodeVer + base64Data);


}

function saveDataBeforeSwap(player) {
    player.beforeSwap = {
        stats: {
            chickens: player.stats.chickens,
            maxChickens: player.stats.maxChickens,
            numTach: player.stats.numTach,
            numQuant: player.stats.numQuant
        },
        rates: {
            layRate: player.rates.layRate,
            shipRate: player.rates.shipRate,
            deliveryRate: player.rates.deliveryRate
        }
    };
}

function getSRModifier() {
    mult = 1;
    // Get Modifier
    const selectMod = document.getElementById(`mod-name`);
    const name = selectMod.value;
    if (name === 'ShipRate') {
        const modMult = document.getElementById(`modifiers`);
        mult *= modMult.value;
    }
    return mult;
}
function getELRModifier() {
    mult = 1;
    // Get Modifier
    const selectMod = document.getElementById(`mod-name`);
    const name = selectMod.value;
    if (name === 'LayRate') {
        const modMult = document.getElementById(`modifiers`);
        mult *= modMult.value;
    }
    return mult;
}

function getCollegtibleShip(playerIndex) {
    return document.getElementById(`Shipping-colleggtible${playerIndex}`).checked ? 1.1025 : 1;
    //return mult;
}

function getCollegtibleELR(playerIndex) {
    return document.getElementById(`Shipping-colleggtible${playerIndex}`).checked ? 1.05 : 1;
    //return mult;
}

function fillTableFail() {
    const table = document.getElementById('playersTable');
    const rows = table.getElementsByTagName('tr');
    for (let i = 1; i < rows.length; i++) {
        const cells = rows[i].getElementsByTagName('td');
        for (let j = 1; j < cells.length; j++) {
            cells[j].textContent = '';
        }
    }
    const cells = rows[1].getElementsByTagName('td');
    cells[1].textContent = 'Mission';
    cells[2].textContent = 'failed,';
    cells[3].textContent = 'we\'ll';
    cells[4].textContent = 'get';
    cells[5].textContent = '\'em';
    cells[6].textContent = 'next';
    cells[7].textContent = 'time!';


    const tableCoop = document.getElementById('coopTable');
    const rowsCoop = tableCoop.getElementsByTagName('tr');
    const cellsCoop = rowsCoop[1].getElementsByTagName('td');
    for (let i = 0; i < cellsCoop.length; i++)
        cellsCoop[i].textConent = '';
}

function fillTable2SIAB(players, completionTime, targetEggAmount, duration, tswap) {
    const numPlayers = parseInt(document.getElementById('numPlayers').value, 10);
    const table = document.getElementById('playersTable');
    const SIABtext = document.getElementById('SIABSwapContainer');
    const strSIAB = document.createElement('div');
    const btvtargetobj = document.getElementById('btvTarget');
    const btvlabel = document.getElementById('btvTargetLabel');
    if (tswap < completionTime - 1) {
        strSIAB.innerHTML = "<br>" + '<b><u>SIAB swapped after:</b></u> ' + secondsToString(tswap).toString();
    } else {
        strSIAB.innerHTML = "<br>" + '<b><u>SIAB active entire contract.</b></u>';
    }
    SIABtext.appendChild(strSIAB);
    btvtargetobj.hidden = false;
    btvlabel.hidden = false;

    if (numPlayers === 0) return; // No players, no action

    const rows = table.getElementsByTagName('tr');
    maxCS = 0;
    meanCS = 0;
    minCS = 1e15;
    numNoDefl = 0;
    defMeanCS = 0;
    durDays = duration / 60 / 60 / 24;
    const BT_txt = '<img src="https://staabass.netlify.app/images/b_icon_token.png" width="15" height="15" alt="Tach" align="center">';
    const CR_txt = '<img src="https://staabass.netlify.app/images/CR.png" width="30" height="15" alt="Tach" align="center">';
    const tachImage = '<img src="https://staabass.netlify.app/images/afx_tachyon_stone_4.png" width="15" height="15" alt="Tach" align="center">';
    const quantImage = '<img src="https://staabass.netlify.app/images/afx_quantum_stone_4.png" width="15" height="15" alt="Tach" align="center">';

    for (let i = 1; i < rows.length; i++) { // Skip header row
        const cells = rows[i].getElementsByTagName('td');
        cells[0].textContent = players[i - 1].name; // Update player name in table
        T = players[i - 1].flags.isSink ? 2 : (document.getElementById('tokenToggle').checked ? 10 : 0);
        T = (numPlayers === 1) ? 0 : T;

        if (players[i - 1].flags.isSink && !new2p0)
            cells[0].innerHTML += "<br> &#x1FAC2;" + "<br>" + calcSinkCR(numPlayers, durDays) + CR_txt + ", " + T + BT_txt;

        if (players[i - 1].flags.siabActive && tswap < completionTime - 1) {
            colels1 = "<span style=\"color: #00CC66\">";
            colele1 = "</span>";
            colsrs1 = "";
            colsre1 = "";
            colels2 = "<span style=\"color: #00CC66\">";
            colele2 = "</span>";
            colsrs2 = "";
            colsre2 = "";
            if (players[i - 1].beforeSwap.rates.shipRate < players[i - 1].beforeSwap.rates.layRate) {
                colsrs1 = "<span style=\"color: #00CC66\">";
                colsre1 = "</span>";
                colels1 = "";
                colele1 = "";
            }
            if (players[i - 1].rates.shipRate < players[i - 1].rates.layRate) {
                colsrs2 = "<span style=\"color: #00CC66\">";
                colsre2 = "</span>";
                colels2 = "";
                colele2 = "";
            }
            // Show players ELR
            cells[1].innerHTML = colels1 + (Math.round((players[i - 1].beforeSwap.rates.layRate / 1e9)) / 1e6).toString() + colele1 + "<br>" + players[i - 1].beforeSwap.stats.numTach + " " + tachImage +
                "<br>" + colels2 + (Math.round((players[i - 1].rates.layRate / 1e9)) / 1e6).toString() + colele2 + "<br>" + players[i - 1].stats.numTach + " " + tachImage;
            // Show players SR
            cells[2].innerHTML = colsrs1 + (Math.round((players[i - 1].beforeSwap.rates.shipRate / 1e9)) / 1e6).toString() + colsre1 + "<br>" + players[i - 1].beforeSwap.stats.numQuant + " " + quantImage +
                "<br>" + colsrs2 + (Math.round((players[i - 1].rates.shipRate / 1e9)) / 1e6).toString() + colsre2 + "<br>" + players[i - 1].stats.numQuant + " " + quantImage;
            // Show players chickens
            cells[3].innerHTML = commafy(players[i - 1].beforeSwap.stats.chickens) + "<br>" + commafy(players[i - 1].stats.chickens);
        } else {
            colels = "<span style=\"color: #00CC66\">";
            colele = "</span>";
            colsrs = "";
            colsre = "";
            if (players[i - 1].beforeSwap.rates.shipRate < players[i - 1].beforeSwap.rates.layRate) {
                colsrs = "<span style=\"color: #00CC66\">";
                colsre = "</span>";
                colels = "";
                colele = "";
            }
            // Show players ELR
            cells[1].innerHTML = colels + (Math.round((players[i - 1].beforeSwap.rates.layRate / 1e9)) / 1e6).toString() + colele + "<br>" + players[i - 1].beforeSwap.stats.numTach + " " + tachImage;
            // Show players SR
            cells[2].innerHTML = colsrs + (Math.round((players[i - 1].beforeSwap.rates.shipRate / 1e9)) / 1e6).toString() + colsre + "<br>" + players[i - 1].beforeSwap.stats.numQuant + " " + quantImage;
            // Show players chickens
            cells[3].textContent = commafy(players[i - 1].beforeSwap.stats.chickens);
            /*
            if (players[i - 1].siabActive)
                cells[3].textContent = commafy(players[i - 1].chick2);
            else
                cells[3].textContent = commafy(players[i - 1].chickens);
                */
        }

        fair_share = targetEggAmount / numPlayers;
        contrib = players[i - 1].stats.eggsDelivered / fair_share;
        // Show players contribution ratio
        cells[4].textContent = (Math.round(contrib * 1e3) / 1e3).toString();
        // show players time to boost
        cells[5].textContent = players[i - 1].stats.timeToBoost == duration ? "N/A" : secondsToString(players[i - 1].stats.timeToBoost);
        // show players BTV
        btvRat = players[i - 1].stats.btv / completionTime;
        cells[6].textContent = (Math.round(btvRat * 1e3) / 1e3).toString();
        // show players teamwork
        crt = players[i - 1].flags.isSink ? calcSinkCR(numPlayers, durDays) : (document.getElementById('crtToggle').checked ? 20 : numPlayers - 1);
        crt = (numPlayers === 1) ? 0 : crt;
        tw = getTeamwork(btvRat, numPlayers, durDays, crt, T, new2p0);
        cells[7].textContent = (Math.round(tw * 1e6) / 1e6).toString();
        // Show players CS
        cs = getCS(contrib, duration, completionTime, tw);
        cells[8].textContent = cs.toString();
        defMeanCS += cs;
        if (players[i - 1].deflPerc > 0 && !players[i - 1].isSink) {
            meanCS += cs;
        } else {
            numNoDefl++;
        }

        if (cs > maxCS)
            maxCS = cs;
        if (cs < minCS)
            minCS = cs;
    }
    // If at least 1 player has deflector, return meanCS minus those without deflector. If all no deflector, just return mean of all
    if (numPlayers > numNoDefl) {
        meanCS /= (numPlayers - numNoDefl);
    } else {
        meanCS = defMeanCS / numPlayers;
    }

    return [meanCS, maxCS, minCS];
}

function fillTable2(players, completionTime, targetEggAmount, duration, new2p0) {
    const numPlayers = parseInt(document.getElementById('numPlayers').value, 10);
    const table = document.getElementById('playersTable');

    if (numPlayers === 0) return; // No players, no action

    const rows = table.getElementsByTagName('tr');
    maxCS = 0;
    meanCS = 0;
    minCS = 1e15;
    numNoDefl = 0;
    defMeanCS = 0;
    durDays = duration / 60 / 60 / 24;
    const BT_txt = '<img src="https://staabass.netlify.app/images/b_icon_token.png" width="15" height="15" alt="Tach" align="center">';
    const CR_txt = '<img src="https://staabass.netlify.app/images/CR.png" width="30" height="15" alt="Tach" align="center">';
    const tachImage = '<img src="https://staabass.netlify.app/images/afx_tachyon_stone_4.png" width="15" height="15" alt="Tach" align="center">';
    const quantImage = '<img src="https://staabass.netlify.app/images/afx_quantum_stone_4.png" width="15" height="15" alt="Tach" align="center">';

    for (let i = 1; i < rows.length; i++) { // Skip header row
        const cells = rows[i].getElementsByTagName('td');
        //const playerNameInput = document.getElementById(`playerName${i - 1}`);
        //const playerName = playerNameInput ? playerNameInput.value : `Player ${i - 1}`;
        cells[0].innerHTML = players[i - 1].name; // Update player name in table
        T = players[i - 1].isSink ? 2 : (document.getElementById('tokenToggle').checked ? 10 : 0);
        T = (numPlayers === 1) ? 0 : T;

        if (players[i - 1].flags.isSink && !new2p0) {
            cells[0].innerHTML += "<br> &#x1FAC2;" + "<br>" + calcSinkCR(numPlayers, durDays) + CR_txt + ", " + T + BT_txt;
        }

        //cells[0].innerHTML += "<br> &#x1FAC2;" + "<br>" + calcSinkCR(numPlayers, durDays) + "&#x1F413," + T + "&#x1FA99";
        colels = "<span style=\"color: #00CC66\">";
        colele = "</span>";
        colsrs = "";
        colsre = "";
        if (players[i - 1].rates.shipRate < players[i - 1].rates.layRate) {
            colsrs = "<span style=\"color: #00CC66\">";
            colsre = "</span>";
            colels = "";
            colele = "";
        }
        // Show players ELR
        cells[1].innerHTML = colels + (Math.round((players[i - 1].rates.layRate / 1e9)) / 1e6).toString() + colele + "<br>" + players[i - 1].stats.numTach + " " + tachImage;
        // Show players SR
        cells[2].innerHTML = colsrs + (Math.round((players[i - 1].rates.shipRate / 1e9)) / 1e6).toString() + colsre + "<br>" + players[i - 1].stats.numQuant + " " + quantImage;
        // Show players chickens
        cells[3].textContent = commafy(players[i - 1].stats.chickens);
        fair_share = targetEggAmount / numPlayers;
        contrib = players[i - 1].stats.eggsDelivered / fair_share;
        // Show players contribtion ratio
        cells[4].textContent = (Math.round(contrib * 1e3) / 1e3).toString();
        // Show players time to boost
        cells[5].textContent = players[i - 1].stats.timeToBoost == duration ? "N/A" : secondsToString(players[i - 1].stats.timeToBoost);
        // Show players BTV
        btvRat = players[i - 1].stats.btv / completionTime;
        cells[6].textContent = (Math.round(btvRat * 1e3) / 1e3).toString();
        // Show players teamwork
        crt = players[i - 1].flags.isSink ? calcSinkCR(numPlayers, durDays) : (document.getElementById('crtToggle').checked ? 20 : numPlayers - 1);
        crt = (numPlayers === 1) ? 0 : crt;
        tw = getTeamwork(btvRat, numPlayers, durDays, crt, T, new2p0);
        cells[7].textContent = (Math.round(tw * 1e6) / 1e6).toString();
        // Show players CS
        cs = getCS(contrib, duration, completionTime, tw);
        cells[8].textContent = cs.toString();
        defMeanCS += cs;
        if (players[i - 1].stats.deflectorPercent > 0 && !players[i - 1].flags.isSink) {
            meanCS += cs;
        } else {
            numNoDefl++;
        }
        if (cs > maxCS)
            maxCS = cs;
        if (cs < minCS)
            minCS = cs;
    }
    // If at least 1 player has deflector, return meanCS minus those without deflector. If all no deflector, just return mean of all
    if (numPlayers > numNoDefl) {
        meanCS /= (numPlayers - numNoDefl);
    } else {
        meanCS = defMeanCS / numPlayers;
    }

    return [meanCS, maxCS, minCS]
}

function calcSinkCR(numPlayers, durDays) {
    // Take care of solo and duo contracts first
    if (numPlayers < 3)
        return (numPlayers - 1);
    // calculate targetCR
    targetCR = Math.ceil(durDays * numPlayers / 2)
    if (targetCR > 20)
        targetCR = 20;
    // Calculate number of kicks needed for others needed to reach max
    runSessions = Math.ceil((targetCR - 1) / (numPlayers - 2)); // -1 for removing sink from equation as can only run once / Number of runs per session (no sink, no selfrun)
    sinkRuns = runSessions * (numPlayers - 1);
    return sinkRuns;
}

// Note: totDeflector is total coop deflector %
function getDeflectorDropPerc(players, totDeflector, rateChanged) {
    // Check if solo
    if (players.length < 2) return [totDeflector, totDeflector];



    // Find player with lowest elr/sr ratio, and save their deflector multiplier
    elrDivSrMin = players[0].rates.layRate / players[0].rates.shipRate;
    def = (totDeflector - players[0].stats.deflectorPercent) / 100 + 1;
    players.forEach((player, index) => {
        currentPlayer = player.rates.layRate / player.rates.shipRate;
        if (currentPlayer < elrDivSrMin) {
            elrDivSrMin = currentPlayer;
            def = (totDeflector - player.stats.deflectorPercent) / 100 + 1;
        }
    });

    val0 = 0;
    // Check rates before swap
    if (rateChanged) {
        elrDivSrMin2 = players[0].beforeSwap.rates.layRate / players[0].beforeSwap.rates.shipRate;
        def2 = (totDeflector - players[0].beforeSwap.stats.deflectorPercent) / 100 + 1;
        players.forEach((player, index) => {
            currentPlayer = player.beforeSwap.rates.layRate / player.beforeSwap.rates.shipRate;
            if (currentPlayer < elrDivSrMin2) {
                elrDivSrMin2 = currentPlayer;
                def2 = (totDeflector - player.beforeSwap.stats.deflectorPercent) / 100 + 1;
            }
        });
        if (elrDivSrMin2 >= 1)
            val0 = (def2 - 1) * 100 - (def2 / elrDivSrMin2 - 1) * 100;

    }

    // Check if anyone is not shipping capped
    if (elrDivSrMin >= 1)
        val1 = (def - 1) * 100 - (def / elrDivSrMin - 1) * 100;
    else
        val1 = 0;


    // Check how much deflector % could be dropped for player with smallest elr/sr
    return [Math.min(Math.floor(val0), Math.round(totDeflector)), Math.min(Math.floor(val1), Math.round(totDeflector))];
}

function fillTableCoop(rate, completionTime, maxCS, meanCS, totDeflector, deflectorDropPerc) {
    const table = document.getElementById('coopTable');
    const rows = table.getElementsByTagName('tr');
    const cells = rows[1].getElementsByTagName('td');
    cells[0].textContent = (Math.round((rate / 1e9)) / 1e6).toString();
    cells[1].textContent = secondsToString(completionTime).toString();
    cells[2].textContent = maxCS.toString();
    cells[3].textContent = (Math.round(meanCS * 1e2) / 1e2).toString();
    cells[4].textContent = totDeflector.toString() + '%';
    cells[5].textContent = deflectorDropPerc + '%';
}

function fillTableCoopSIAB(rate, rate2, completionTime, maxCS, meanCS, totDeflector, deflectorDropPerc, deflectorDropPerc2, tswap) {
    const table = document.getElementById('coopTable');
    const rows = table.getElementsByTagName('tr');
    const cells = rows[1].getElementsByTagName('td');
    if (Math.round(tswap) < Math.round(completionTime))
        cells[0].innerHTML = (Math.round((rate / 1e9)) / 1e6).toString() + "<br>" + (Math.round((rate2 / 1e9)) / 1e6).toString();
    else
        cells[0].innerHTML = (Math.round((rate / 1e9)) / 1e6).toString();
    cells[1].textContent = secondsToString(completionTime).toString();
    cells[2].textContent = maxCS.toString();
    cells[3].textContent = (Math.round(meanCS * 1e2) / 1e2).toString();
    cells[4].textContent = totDeflector.toString() + '%';
    if (Math.round(tswap) >= Math.round(completionTime))
        cells[5].textContent = deflectorDropPerc + '%';
    else
        cells[5].innerHTML = deflectorDropPerc + '%' + "<br>" + deflectorDropPerc2 + '%';
}

function commafy(num) {
    var str = num.toString().split('.');
    if (str[0].length >= 5) {
        str[0] = str[0].replace(/(\d)(?=(\d{3})+$)/g, '$1,');
    }
    if (str[1] && str[1].length >= 5) {
        str[1] = str[1].replace(/(\d{3})/g, '$1 ');
    }
    return str.join('.');
}

function secondsToString(sec) {
    days = Math.floor(sec / 3600 / 24);
    sec %= 3600 * 24;
    hours = Math.floor(sec / 3600);
    sec %= 3600;
    minutes = Math.floor(sec / 60);
    sec %= 60;
    seconds = sec % 60;
    pday = days > 1 ? 's' : '';
    phr = hours > 1 ? 's' : '';
    str = days > 0 ? days + 'day' + pday + ', ' : '';
    str = hours > 0 ? str + hours + 'hr' + phr + ', ' : str;
    str = minutes > 0 ? str + minutes + 'min, ' : str;
    str = str + Math.round(seconds) + 's';

    return str;

    /*
    const date = new Date(null);
    date.setSeconds(sec); // specify value for SECONDS here
    const result = date.toISOString().slice(11-3, 19);
    return result;
    */
}

function getCS(contributionRatio, originalLength, completionTime, tw) {
    cs = 1 + originalLength / 259200;
    cs *= 7;
    fac = contributionRatio > 2.5 ? 0.02221 * Math.min(contributionRatio, 12.5) + 4.386486 : 3 * Math.pow(contributionRatio, 0.15) + 1;
    cs *= fac;
    cs *= 4 * Math.pow((1 - completionTime / originalLength), 3) + 1;
    cs *= (0.19 * tw + 1);
    cs *= 1.05; // Kev Fudge Factor
    cs = Math.ceil(cs * 187.5);
    return cs;
}

function getTeamwork(btvRat, numPlayers, durDays, crt, T, new2p0) {
    B = Math.min(btvRat, 2);
    crt = Math.min(crt, 20);
    fCR = Math.max(12 / numPlayers / durDays, 0.3);
    CR = Math.min(fCR * crt, 6);
    if (new2p0) {
        if (numPlayers > 1) {
            CR = 5;
        } else {
            CR = 0;
        }
        T = 0;
    }
    return (5 * B + CR + T) / 19;
}

function updateArtis(playerIndex, player) {
    defl = 0;
    siab = 0;
    // Get selected arti's
    for (let i = 1; i <= 4; i++) {
        const selectElement = document.getElementById(`player${playerIndex}_item${i}`);
        const name = selectElement.value;
        x = itemLists[i].find(item => item.name === name);
        defl += (x.deflectorPercent);
        siab += (x.siabPercent);
    }
    player.stats.deflectorPercent = defl;
    player.stats.siabPercent = siab;
}

function getMaxChickens(playerIndex) {
    chick = 11340000000;
    // Get selected arti's
    for (let i = 1; i <= 4; i++) {
        const selectElement = document.getElementById(`player${playerIndex}_item${i}`);
        const name = selectElement.value;
        x = itemLists[i].find(item => item.name === name);
        // Multiply chik
        chick *= (x.chickmult);
    }

    // Get Modifier
    const selectMod = document.getElementById(`mod-name`);
    const name = selectMod.value;
    if (name === 'Hab Space') {
        const modMult = document.getElementById(`modifiers`);
        chick *= modMult.value;
    }

    // Get Colleggtibles
    chick *= document.getElementById(`Shipping-colleggtible${playerIndex}`).checked ? 1.05 : 1;


    return Math.floor(chick);
}

function getDeflectorPerc(playerIndex) {
    defl = 0;
    // Get selected arti's
    for (let i = 5; i <= 8; i++) {
        const selectElement = document.getElementById(`player${playerIndex}_item${i}`);
        const name = selectElement.value;
        x = itemLists[i + 1].find(item => item.name === name);
        // Multiply ihr
        defl += (x.deflectorPercent);
    }

    return defl;
}

function getSIABPerc(playerIndex) {
    siab = 0;
    // Get selected arti's
    for (let i = 5; i <= 8; i++) {
        const selectElement = document.getElementById(`player${playerIndex}_item${i}`);
        const name = selectElement.value;
        x = itemLists[i + 1].find(item => item.name === name);
        // Multiply ihr
        siab += (x.siabPercent);
    }

    return siab;
}

function playerBoosting(players, index) {
    offset = players[index].flags.needsMirror == true ? 1 : 0;
    players[index].stats.boostMulti = calcBoostMulti(players[index].tokens - offset);
    return players;
}

function convertUnits(parameter, units) {
    let mult;
    switch (units) {
        case 'seconds':
            mult = 1;
            break;
        case 'minutes':
            mult = 60;
            break;
        case 'hours':
            mult = 60 * 60;
            break;
        case 'days':
            mult = 60 * 60 * 24;
            break;
        case 'T':
            mult = 1e12;
            break;
        case 'q':
            mult = 1e15;
            break;
        case 'Q':
            mult = 1e18;
            break;
        // Add other cases for different categories if needed
        default:
            mult = 1;
    }

    return parameter * mult;
}

function calcIHR(playerIndex) {
    ihr = 7440;
    // Get selected arti's
    for (let i = 5; i <= 8; i++) {
        const selectElement = document.getElementById(`player${playerIndex}_item${i}`);
        const name = selectElement.value;
        x = itemLists[i + 1].find(item => item.name === name);
        // Multiply ihr
        ihr *= (x.ihrmult * Math.pow(1.04, x.slots));
    }
    // Get Modifier
    const selectMod = document.getElementById(`mod-name`);
    const name = selectMod.value;
    if (name === 'IHR') {
        const modMult = document.getElementById(`modifiers`);
        ihr *= modMult.value;
    }
    // add colleggtible
    colleggIHR = document.getElementById(`Shipping-colleggtible${playerIndex}`).checked ? 1.05 : 1;
    ihr *= colleggIHR;
    // add TE
    TEMult = Math.pow(1.01, document.getElementById(`playerTE${playerIndex}`).value);
    ihr *= TEMult;

    return Math.floor(ihr);
}

function calcRateSIABRemoved(playerIndex, chickens, players) {
    elr = chickens * players[playerIndex].rates.baseELR; // eggs/hr
    sr = players[playerIndex].rates.baseShip;
    totDeflector = 0;
    totSlotsAvailable = 0;
    if (players[playerIndex].stats.maxChickens === chickens) {
        for (let i = 1; i <= 4; i++) {
            const name = document.getElementById(`player${playerIndex}_item${i}`).value;
            x = itemLists[i].find(item => item.name === name);
            // Remove SIAB
            if (x.siabPercent > 0) {
                x = itemLists[i][0];
                // Gusset replaced, Max chickens instantly
                if (i == 3) {
                    chickens *= x.chickmult;
                    players[playerIndex].stats.chickens = chickens;
                    players[playerIndex].stats.maxChickens = chickens;
                    elr *= x.chickmult;
                }
            }
            elr *= x.elrmult;
            sr *= x.srmult;
            totSlotsAvailable += x.slots;
        }
    }


    // Get everyones deflectors
    for (let i = 0; i < players.length; i++) {
        if (i != playerIndex) {
            totDeflector += players[i].stats.deflectorPercent;
        }
    }
    elr *= (1 + totDeflector / 100);
    //if (players[playerIndex].stats.maxChickens === chickens) {
        [elr, sr, numTach, numQuant] = optimizeStones(elr, sr, totSlotsAvailable);
   // }


    return [elr, sr, chickens, chickens, numTach, numQuant]; // eggs/hr
}

function calcRate(playerIndex, chickens, players) {
    elr = chickens * players[playerIndex].rates.baseELR; // eggs/hr
    sr = players[playerIndex].rates.baseShip;
    totDeflector = 0;
    totSlotsAvailable = 0;
    if (players[playerIndex].stats.maxChickens === chickens) {
        for (let i = 1; i <= 4; i++) {
            const name = document.getElementById(`player${playerIndex}_item${i}`).value;
            x = itemLists[i].find(item => item.name === name);
            elr *= x.elrmult;
            sr *= x.srmult;
            totSlotsAvailable += x.slots;
        }
    }


    // Get everyones deflectors
    for (let i = 0; i < players.length; i++) {
        if (i != playerIndex) {
            totDeflector += players[i].stats.deflectorPercent;
        }
    }
    elr *= (1 + totDeflector / 100);
    if (players[playerIndex].stats.maxChickens === chickens) {
        [elr, sr, numTach, numQuant] = optimizeStones(elr, sr, totSlotsAvailable);
    }


    return [elr, sr, numTach, numQuant]; // eggs/hr
}

function calcRateNoPopCheck(playerIndex, chickens, players) {
    elr = chickens * players[playerIndex].stats.baseELR; // eggs/hr
    sr = players[playerIndex].stats.baseShip;
    totDeflector = 0;
    totSlotsAvailable = 0;
    for (let i = 1; i <= 4; i++) {
        const name = document.getElementById(`player${playerIndex}_item${i}`).value;
        x = itemLists[i].find(item => item.name === name);
        elr *= x.elrmult;
        sr *= x.srmult;
        totSlotsAvailable += x.slots;
    }


    // Get everyones deflectors
    for (let i = 0; i < players.length; i++) {
        if (i != playerIndex) {
            totDeflector += players[i].stats.deflectorPercent;
        }
    }
    elr *= (1 + totDeflector / 100);
    [elr, sr] = optimizeStones(elr, sr, totSlotsAvailable);



    return [elr, sr]; // eggs/hr
}

function optimizeStones(elr, sr, totSlots) {
    numTach = 0;
    numQuant = 0;
    for (let i = 0; i < totSlots; i++) {
        if (elr < sr) {
            elr *= 1.05;
            numTach++;
        }
        else {
            sr *= 1.05;
            numQuant++;
        }
    }
    return [elr, sr, numTach, numQuant];
}

function calcBoostMulti(tokens) {
    let mult;
    switch (tokens) {
        case 1:
            mult = (4 * 10) * (2);
            break;
        case 2:
            mult = (100 + 4 * 10);
            break;
        case 3:
            mult = (100 + 3 * 10) * (2);
            break;
        case 4:
            mult = (1000 + 4 * 10);
            break;
        case 5:
            mult = (1000 + 3 * 10) * (2);
            break;
        case 6:
            mult = (1000 + 2 * 10) * (2 + 2);
            break;
        case 7:
            mult = (1000 + 10) * (2 + 2 + 2);
            break;
        case 8:
            mult = (1000 + 3 * 10) * (10);
            break;
        case 9:
            mult = (1000 + 2 * 10) * (10 + 2);
            break;
        case 10:
            mult = (1000 + 10) * (10 + 2 + 2);
            break;
        case 11:
            mult = (1000) * (10 + 2 + 2 + 2);
            break;
        case 12:
            mult = (1000 + 3 * 10) * (50);
            break;
        // Add other cases for different categories if needed
        default:
            mult = 50;
    }


    return mult;
}

function updateImage(playerIndex, ItemIndex) {
    // Get dropdown Menu
    const selectElement = document.getElementById(`player${playerIndex}_item${ItemIndex}`);
    // Get new selected value
    const value = selectElement.value;
    if (value[2] === 'L') {
        tmp = 0;
    }
    const imageContainer = document.getElementById(`imageContainer${playerIndex}`);
    const selectedItemObj = itemLists[ItemIndex].find(item => item.name === ItemIndex);

    if (selectedItemObj) {
        imageContainer.innerHTML = `<img src="${selectedItemObj.image}" alt="${selectedItemObj.name}">`;
    } else {
        imageContainer.innerHTML = '';
    }
}

// Dark/Light Mode Toggle
document.getElementById('modeToggle').addEventListener('change', (event) => {
    if (event.target.checked) {
        document.body.classList.add('dark-mode');
        document.body.classList.remove('light-mode');
    } else {
        document.body.classList.remove('dark-mode');
        document.body.classList.add('light-mode');
    }
});

// Enable dark mode by default on page load
document.addEventListener('DOMContentLoaded', () => {
    document.body.classList.add('dark-mode');
    document.getElementById('modeToggle').checked = true;
});

// Function to gather all input data
function gatherData() {
    //SEPARATOR = '\u2023'; // Unique Unicode separator character
    SEPARATOR = '-'; // Unique Unicode separator character
    const data = [];
    const singleStr = [];
    data2 = [];
    singleStr.push(convertBool(document.getElementById('crtToggle').checked));
    singleStr.push(convertBool(document.getElementById('tokenToggle').checked));
    singleStr.push(convertBool(document.getElementById('GGToggle').checked));
    singleStr.push(document.getElementById('eggUnit').selectedIndex);
    singleStr.push(document.getElementById('durUnit').selectedIndex);
    singleStr.push(document.getElementById('mod-name').selectedIndex);
    singleStr.push(convertBool(document.getElementById('cxpToggle').checked));
    data.push(singleStr.join(''));

    data.push(convertString(document.getElementById('crttime').value));
    data.push(convertString(document.getElementById('mpft').value));
    data.push(convertString(document.getElementById('duration').value));
    data.push(convertString(document.getElementById('targetEggAmount').value));
    data.push(convertString(document.getElementById('tokenTimer').value));
    data.push(convertString(document.getElementById('modifiers').value));
    numPlayers = convertString(document.getElementById('numPlayers').value);
    data.push(numPlayers);
    data.push(convertString(document.getElementById('btvTarget').value));



    // Gather data from playerDiv
    const playersContainer = document.getElementById('playersContainer');
    const playerDivs = Array.from(playersContainer.children);
    let orderedPlayers = playerDivs.map(playerDiv => {
        const index = parseInt(playerDiv.id.split('-')[1]); // Get the index from the ID
        return index;
    });

    const singleStr2 = [];
    // Start with leading 1 to avoid losing leading 0's
    singleStr2.push('1');

    for (let i = 0; i < numPlayers; i++) {
        k = orderedPlayers[i];
        /*
        <label for="playerShipCollegg${i}">, 10.25% Ship & 5% IHR colleggtible?:</label>
            <input type="checkbox" id="Shipping-colleggtible${i}" checked="true">
            <label for="Sink${i}">, Sink?:</label>
            <input type="checkbox" id="Sink${i}">
            */
        // ADd up down indices/callbacks HERE, or maybe not?
        data.push(remDash(document.getElementById(`playerName${k}`).value));
        data.push(remDash(document.getElementById(`playerTokens${k}`).value));
        data.push(remDash(document.getElementById(`playerTE${k}`).value));
        singleStr2.push(convertBool(document.getElementById(`playerMirror${k}`).checked));
        singleStr2.push(convertBool(document.getElementById(`Shipping-colleggtible${k}`).checked));
        singleStr2.push(convertBool(document.getElementById(`Sink${k}`).checked));
        singleStr2.push(convertBool(document.getElementById(`Creator${k}`).checked));
        for (let j = 1; j <= 4; j++) {
            //index = itemLists[j].findIndex((element) => element.name === tmp);
            index = document.getElementById(`player${k}_item${j}`).selectedIndex;
            // Append 0 to always make length=2 string
            singleStr2.push(index < 10 ? '0' + index : index);
        }
        for (let j = 5; j <= 8; j++) {
            //tmp = document.getElementById(`player${k}_item${j}`).value;
            //index = itemLists[j+1].findIndex((element) => element.name === tmp);
            index = document.getElementById(`player${k}_item${j}`).selectedIndex;
            // Append 0 to always make length=2 string
            singleStr2.push(index < 10 ? '0' + index : index);
        }
        // Convert to base36

    }

    // Break into chunks of 16
    data2.push(chunk16(singleStr2.join('')));

    //y = x.toString(36);
    //data2.push(y);

    // Join all data into a single string separated by the unique separator
    return [data.join(SEPARATOR), data2.join(SEPARATOR)];

}

function chunk16(x) {
    y = '';
    if (x.length < 16)
        return base62.encode(parseInt(x));
    else {
        n = Math.floor(x.length / 15);
        for (let i = 0; i < n; i++) {
            //y += parseInt('1' + x.slice(i*15, 15 + i*15)).toString(36);
            // 8 is needed to force all chunks of 16 to length of base64=9
            tmp = '8' + x.slice(i * 15, 15 + i * 15);
            yy = tmp.length;
            y += base62.encode(parseInt(tmp));
        }
        tmp = x.slice(n * 15);

        //y += parseInt('1' + tmp).toString(36);
        y += base62.encode(parseInt('8' + tmp));
    }
    tmp2 = y.length;
    return y;
}

function unchunk16(x) {
    y = '';
    len = 9;
    if (x.length < 10)
        return base62.decode(x).toString();
    else {
        n = Math.floor(x.length / len);
        for (let i = 0; i < n; i++) {
            // Convert back to integer, remove the first '8'
            y += base62.decode(x.slice(i * len, len + i * len)).toString().slice(1);
        }
        tmp = x.slice(n * len, x.length);
        // Convert back to integer, remove the first '8'
        //y += parseInt(tmp, 36).toString().slice(1);
        y += base62.decode(tmp).toString().slice(1);
    }
    return y;
}



// Function to populate the form with data
function populateData(data, ver) {
    data = data.split('-');
    document.getElementById('crtToggle').checked = convertBoolBack(data[0]);
    document.getElementById('tokenToggle').checked = convertBoolBack(data[1]);
    document.getElementById('crttime').value = convertStringBack(data[2]);
    document.getElementById('mpft').value = convertStringBack(data[3]);
    document.getElementById('GGToggle').checked = convertBoolBack(data[4]);
    document.getElementById('duration').value = convertStringBack(data[5]);
    document.getElementById('durUnit').selectedIndex = convertStringBack(data[6]);
    document.getElementById('targetEggAmount').value = convertStringBack(data[7]);
    document.getElementById('eggUnit').selectedIndex = convertStringBack(data[8]);
    document.getElementById('tokenTimer').value = convertStringBack(data[9]);
    document.getElementById('modifiers').value = convertStringBack(data[10]);
    document.getElementById('mod-name').selectedIndex = convertStringBack(data[11]);
    numPlayers = convertStringBack(data[12]);
    document.getElementById('numPlayers').value = numPlayers;
    if (ver !== 'v-1')
        document.getElementById('btvTarget').value = convertStringBack(data[13]);

    generatePlayers();

    cnt = 13;
    // Populate playersContainer data
    const playersContainer = document.getElementById('playersContainer');
    for (let i = 0; i < numPlayers; i++) {
        // Add up down indices/callbacks HERE, or maybe not?
        document.getElementById(`playerName${i}`).value = addDash(data[cnt]);
        cnt++;
        document.getElementById(`playerTokens${i}`).value = addDash(data[cnt]);
        cnt++;
        document.getElementById(`playerMirror${i}`).checked = convertBoolBack(data[cnt]);
        cnt++;
        document.getElementById(`Shipping-colleggtible${i}`).checked = convertBoolBack(data[cnt]);
        cnt++;
        if (ver !== 'v-1') {
            document.getElementById(`Sink${i}`).checked = convertBoolBack(data[cnt]);
            cnt++;
        }

        for (let j = 1; j <= 4; j++) {
            element = document.getElementById(`player${i}_item${j}`);
            element.selectedIndex = data[cnt];
            setColor(element);
            cnt++;
            //data.push(document.getElementById(`player${i}_item${j}`).selectedIndex);
        }
        for (let j = 5; j <= 8; j++) {
            element = document.getElementById(`player${i}_item${j}`);
            element.selectedIndex = data[cnt];
            setColor(element);
            cnt++;
            //data.push(document.getElementById(`player${i}_item${j}`).selectedIndex);
        }
    }
    populateTable();
}

function populateData2(data, data2, ver) {
    data2 = unchunk16(data2);

    data = data.split('-');
    singleStr = data[0].split('');
    document.getElementById('crtToggle').checked = convertBoolBack(singleStr[0]);
    document.getElementById('tokenToggle').checked = convertBoolBack(singleStr[1]);
    document.getElementById('GGToggle').checked = convertBoolBack(singleStr[2]);
    document.getElementById('eggUnit').selectedIndex = convertStringBack(singleStr[3]);
    document.getElementById('durUnit').selectedIndex = convertStringBack(singleStr[4]);
    document.getElementById('mod-name').selectedIndex = convertStringBack(singleStr[5]);
    factor = 60;
    if (ver === 'v-5') {
        document.getElementById('cxpToggle').checked = convertBoolBack(singleStr[6]);
        factor = 1;
    }

    document.getElementById('crttime').value = convertStringBack(data[1]) * factor;
    document.getElementById('mpft').value = convertStringBack(data[2]);
    document.getElementById('duration').value = convertStringBack(data[3]);
    document.getElementById('targetEggAmount').value = convertStringBack(data[4]);
    document.getElementById('tokenTimer').value = convertStringBack(data[5]);
    document.getElementById('modifiers').value = convertStringBack(data[6]);
    numPlayers = convertStringBack(data[7]);
    document.getElementById('numPlayers').value = numPlayers;
    cnt = 8;
    if (ver !== 'v-1') {
        document.getElementById('btvTarget').value = convertStringBack(data[cnt]);
        cnt++;
    }

    //1.69797
    generatePlayers();


    // Separate player selections and remove 1st 1
    singleStr2 = data2.slice(1).split('');
    cnt2 = 0;
    // Populate playersContainer data
    const playersContainer = document.getElementById('playersContainer');
    for (let i = 0; i < numPlayers; i++) {
        // Add up down indices/callbacks HERE, or maybe not?
        document.getElementById(`playerName${i}`).value = addDash(data[cnt]);
        cnt++;
        document.getElementById(`playerTokens${i}`).value = addDash(data[cnt]);
        cnt++;
        if (ver === 'v-4' || ver === 'v-5') {
            document.getElementById(`playerTE${i}`).value = addDash(data[cnt]);
            cnt++;
        }
        document.getElementById(`playerMirror${i}`).checked = convertBoolBack(singleStr2[cnt2]);
        cnt2++;
        document.getElementById(`Shipping-colleggtible${i}`).checked = convertBoolBack(singleStr2[cnt2]);
        cnt2++;
        if (ver !== 'v-1') {
            document.getElementById(`Sink${i}`).checked = convertBoolBack(singleStr2[cnt2]);
            cnt2++;
            if (ver !== 'v-2') {
                document.getElementById(`Creator${i}`).checked = convertBoolBack(singleStr2[cnt2]);
                cnt2++;
            }
        }
        for (let j = 1; j <= 4; j++) {
            element = document.getElementById(`player${i}_item${j}`);
            element.selectedIndex = parseInt(singleStr2[cnt2] + singleStr2[cnt2 + 1]);
            setColor(element);
            cnt2++;
            cnt2++;
            //data.push(document.getElementById(`player${i}_item${j}`).selectedIndex);
        }
        for (let j = 5; j <= 8; j++) {
            element = document.getElementById(`player${i}_item${j}`);
            element.selectedIndex = parseInt(singleStr2[cnt2] + singleStr2[cnt2 + 1]);
            setColor(element);
            cnt2++;
            cnt2++;
            //data.push(document.getElementById(`player${i}_item${j}`).selectedIndex);
        }
    }
    populateTable();
}

function populateTable() {
    const table = document.getElementById('playersTable');
    const rows = table.getElementsByTagName('tr');
    for (let i = 0; i < rows.length - 1; i++) { // Skip header row
        pn = document.getElementById(`playerName${i}`).value;
        const cells = rows[i + 1].getElementsByTagName('td');
        cells[0].textContent = pn; // Update player name in table
    }
}

function convertBool(bool) {
    return bool ? 1 : 0;
}

function convertBoolBack(val) {
    return val == 1 ? true : false;
}
function convertString(data) {
    return data.toString().replace(/\./g, 'p');
}

function convertStringBack(data) {
    return data.replace('p', '.');
}

function remDash(data) {
    return data.toString().replace('-', 'axJEFi');
}

function addDash(data) {
    return data.replace('axJEFi', '-');
}




// Function to convert data to base64 string
function dataToBase64(data, data2) {
    dataB64 = btoa(encodeURIComponent(data));
    // Remove all '=' as they often occur many times
    dataB64 = dataB64.split('=');
    dataEncoded = dataB64[0] + "=" + data2;
    //x = data2.length - data.length - tmp.length;
    return dataEncoded;
}

// Function to decode base64 string to data
function base64ToData(base64) {
    return decodeURIComponent(atob(base64));
}

// Function to update the URL with the base64 data
function updateUrlWithBase64(base64Data) {
    const newUrl = `${window.location.origin}${window.location.pathname}?data=${base64Data}`;
    window.history.replaceState({}, '', newUrl);
}

// Load data from URL if available
function loadDataFromUrl(dataOverride = null) {
    let base64Data;
    if (dataOverride) {
        base64Data = dataOverride;
    } else {
        const params = new URLSearchParams(window.location.search);
        base64Data = params.get('data');
    }



    if (base64Data) {
        ver = base64Data.slice(0, 3);
        // Check version
        if (ver === 'v-1' || ver === 'v-2' || ver === 'v-3' || ver === 'v-4' || ver === 'v-5') {
            splitData = base64Data.slice(3, base64Data.length);
            splitData = splitData.split('=');
            splitData.forEach((dat, index) => {
                if (index === 0) {
                    datap = base64ToData(dat);
                }

                if (index === splitData.length - 1)
                    data2p = dat;
            });
            populateData2(datap, data2p, ver);
        } else {
            alert('URL not recognized! Remove the ?data= and everyting after from URL and try again');
        }

    } else {
        generatePlayers();

    }
    cxpToggleRun();
}

// Load data from URL on page load
window.onload = loadDataFromUrl();


// New code
function getRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

// Function to add event listeners to all dropdowns in playersContainer
function addDropdownListeners() {
    const playersContainer = document.getElementById('playersContainer');
    const dropdowns = playersContainer.querySelectorAll('select');

    dropdowns.forEach(dropdown => {
        dropdown.addEventListener('change', function () {
            const randomColor = getRandomColor();
            dropdown.style.backgroundColor = randomColor;
        });
    });
}

function setColor(element) {
    if (element.value[2] === 'L') {
        element.style.backgroundColor = '#fef941';
        element.style.color = '#333';
        return;
    }
    if (element.value[2] === 'E') {
        element.style.backgroundColor = '#fa40fc';
        element.style.color = '#f4f4f4';
        return;
    }
    if (element.value[2] === 'R') {
        element.style.backgroundColor = '#9de9ff';
        element.style.color = '#333';
        return;
    }
    if (element.value[2] === 'C' || element.value[2] === 'S') {
        element.style.backgroundColor = '#555';
        element.style.color = '#f4f4f4';
        return;
    }
    return;
}

// Call the function to add listeners after players generated
function onPlayersGenerated() {
    const playersContainer = document.getElementById('playersContainer');
    const numPlayers = parseInt(document.getElementById('numPlayers').value, 10);

    document.getElementById('crtToggle').onchange = () => Run();
    document.getElementById('tokenToggle').onchange = () => Run();
    document.getElementById('GGToggle').onchange = () => Run();
    document.getElementById('crttime').onchange = () => Run();
    document.getElementById('mpft').onchange = () => Run();
    document.getElementById('duration').onchange = () => Run();
    document.getElementById('durUnit').onchange = () => Run();
    document.getElementById('targetEggAmount').onchange = () => Run();
    document.getElementById('eggUnit').onchange = () => Run();
    document.getElementById('tokenTimer').onchange = () => Run();
    document.getElementById('modifiers').onchange = () => Run();
    document.getElementById('mod-name').onchange = () => Run();
    document.getElementById('numPlayers').onchange = () => generatePlayers();
    document.getElementById('btvTarget').onchange = () => Run();
    document.getElementById('cxpToggle').onchange = () => cxpToggleRun(numPlayers);
    document.getElementById('QPlayerInput').input = () => QPInRun();



    for (let i = 0; i < numPlayers; i++) {
        for (let j = 1; j <= 4; j++) {
            const selectElement = document.getElementById(`player${i}_item${j}`);
            selectElement.style.borderRadius = '5px';
            selectElement.style.width = '130px';
            selectElement.style.textAlign = 'center';
            selectElement.style.alignSelf = 'center';
            selectElement.addEventListener('change', function () {
                // Change the background color of the specific dropdown that triggered the event
                setColor(this);
            });
        }
        for (let j = 5; j <= 8; j++) {
            const selectElement = document.getElementById(`player${i}_item${j}`);
            selectElement.style.borderRadius = '5px';
            selectElement.style.width = '130px';
            selectElement.style.textAlign = 'center';
            selectElement.style.alignSelf = 'center';
            selectElement.addEventListener('change', function () {
                // Change the background color of the specific dropdown that triggered the event
                setColor(this);
            });
        }

    }

}

function cxpToggleRun() {
    cxpVal = document.getElementById('cxpToggle').checked;
    if (cxpVal) {
        document.getElementById('tokenToggle').closest(".controls").classList.add("hidden");
        document.getElementById('tokenToggleLabel').closest(".controls").classList.add("hidden");
        document.getElementById('crtToggle').closest(".controls").classList.add("hidden");
        document.getElementById('crtToggleLbl').closest(".controls").classList.add("hidden");
    } else {
        document.getElementById('tokenToggle').closest(".controls").classList.remove("hidden");
        document.getElementById('tokenToggleLabel').closest(".controls").classList.remove("hidden");
        document.getElementById('crtToggle').closest(".controls").classList.remove("hidden");
        document.getElementById('crtToggleLbl').closest(".controls").classList.remove("hidden");
    }

    for (let i = 0; i < numPlayers; i++) {
        document.getElementById(`Sink${i}`).hidden = cxpVal;
        document.getElementById(`SinkLabel${i}`).hidden = cxpVal;
    }

    Run();
}

function QPInRun() {
    const artiArray = document.getElementById("QPlayerInput").value.trim();
    artiNumbers = artiArray;
    artiNumbers = artiArray.split(/\s+/).filter(n => n !== '').map(Number)
    document.getElementById('numPlayers').value = artiNumbers.reduce((acc, curr) => acc + curr, 0);
    generatePlayers();
    generatePlayers(artiArray);
}

function enforceMinMax(el) {
    if (el.value != "") {
        if (parseInt(el.value) < parseInt(el.min)) {
            el.value = el.min;
        }
        if (parseInt(el.value) > parseInt(el.max)) {
            el.value = el.max;
        }
        el.value = Math.round(el.value);
    }
}

function enforceMinMaxDec(el) {
    if (el.value != "") {
        if (parseInt(el.value) < parseInt(el.min)) {
            el.value = el.min;
        }
        if (parseInt(el.value) > parseInt(el.max)) {
            el.value = el.max;
        }
    }
}


function generatePermutations(arr) {
    if (arr.length === 0) return [[]];
    const result = [];
    for (let i = 0; i < arr.length; i++) {
        const rest = arr.slice(0, i).concat(arr.slice(i + 1));
        const restPermutations = generatePermutations(rest);
        for (const perm of restPermutations) {
            result.push([arr[i]].concat(perm));
        }
    }
    return result;
}

function integrateRate(player, tTok, players, index, totTime) {
    delivered = 0;

    [pB, r, c] = preBoost(player, tTok);
    delivered += pB;
    [B, t] = boosting(player, r, c);
    delivered += B;
    delivered += postBoost(players, index, t + tTok, totTime);
    return delivered;
}
// Eggs delivered is area of triangle with base timeToBoost, and height= rate at timeToBoost
function preBoost(player, t) {
    chickens = player.ihr * 12 * player.boostMulti / 60 * t;
    rate = Math.min(chickens * 332640 * (1 + player.otherDefl / 100), player.baseShip) / 60 / 60;
    return [(t) * (rate) / 2, rate, chickens];
}

// Eggs delivered is area of triangle with time boosting, and height= (rate at maxChickens before artiswap-initial rate)
function boosting(player, r, c) {
    x = player.maxChickens * 332640 * (1 + player.otherDefl / 100);
    rate = Math.min(x, player.baseShip) / 60 / 60; // Check min???
    t = (player.maxChickens - c) / player.ihr / 12 / calcBoostMulti(player.tokens - parseInt(convertBool(player.needsMirror))) * 60;
    return [(t) * (rate - r) / 2 + r * t, t];
}
// Eggs delivered is area of rectangle with base totaltime-timeToMaxHabs, and height = rate
function postBoost(players, index, t, totTime) {
    [elr, sr] = calcRateNoPopCheck(index, players[index].maxChickens, players);
    rate = Math.min(elr, sr) / 60 / 60;
    return rate * (totTime - t);
}

const btn = document.getElementById("toggleInfo2Btn");
const info2 = document.getElementById("info2Container");

btn.addEventListener("click", () => {
    const isHidden = info2.classList.toggle("hidden");
    btn.textContent = isHidden ? "Show Assumptions" : "Hide Assumptions";
});


document.getElementById("runScenariosBtn").addEventListener("click", runScenarios);

function runScenarios() {
    //[data, data2] = gatherData();
    //const baselineData = dataToBase64(data, data2);
    //info2.innerHTML = baselineData;
    const params = new URLSearchParams(window.location.search);
    const base64Data = params.get('data');
    //info2.innerHTML = baselineData;
    const results = [];

    scenarios.forEach(scenario => {
        changePlayerArti([0, 0, 0, 0, 0, 0, 0, 0]);
        scenario.apply();
        QPInRun();
        Run();
        const data = collectScenarioResults();
        results.push({
            name: scenario.name,
            ...data
        });
    });
    displayScenarioResults(results);

    loadDataFromUrl(base64Data);
    //populateData2(data, data2, curentURLEncodeVer);
}

function collectScenarioResults() {
    const coopTable = document.getElementById("coopTable");
    const cells = coopTable.querySelectorAll("td");
    const playerTable = document.getElementById("playersTable");
    const cells2 = playerTable.querySelectorAll("td");
    tmp = getSecondLineWithImages(cells2[1], ':afx_tachyon_stone_4:');
    tmp2 = getSecondLineWithImages(cells2[2], ':afx_quantum_stone_4:');
    stones = tmp + ', ' + tmp2;
    return {
        maxCS,
        minCS,
        stones
    };
}
function getSecondLineWithImages(cell, s) {
    if (!cell) return "";

    // Clone so we don't touch the real DOM
    const clone = cell.cloneNode(true);

    // Replace images with text
    clone.querySelectorAll("img").forEach(img => {
        img.replaceWith(document.createTextNode(s));
    });

    // Find the <br>
    const br = clone.querySelector("br");
    if (!br) return "";

    // Collect all nodes AFTER the <br>
    let text = "";
    let node = br.nextSibling;

    while (node) {
        if (node.nodeType === Node.TEXT_NODE) {
            text += node.textContent;
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            text += node.textContent;
        }
        node = node.nextSibling;
    }

    return text.trim();
}


function displayScenarioResults(results) {
    const container = document.getElementById("scenarioOutputContainer");
    const textarea = document.getElementById("scenarioOutput");

    const lines = [];

    results.forEach((r, index) => {
        lines.push(`- ${(r.minCS / 1e3).toFixed(1)}k - ${(r.maxCS / 1e3).toFixed(1)}k (${r.name})`);
        /*
        if (index < results.length - 1)
            lines.push(`- ${Math.round(r.minCS / 1e2) / 10}k - ${Math.round(r.maxCS / 1e2) / 10}k, [${r.stones}], (${r.name})`);
        else
            lines.push(`- ${Math.round(r.minCS / 1e2) / 10}k - ${Math.round(r.maxCS / 1e2) / 10}k (${r.name})`);
    */
    });

    textarea.value = lines.join("\n");
    container.classList.remove("hidden");
}

document.getElementById("copyScenarioBtn").addEventListener("click", () => {
    const textarea = document.getElementById("scenarioOutput");
    textarea.select();
    navigator.clipboard.writeText(textarea.value);
});

function hideScenarioOutput() {
    document.getElementById("scenarioOutputContainer")
        .classList.add("hidden");
}

document.addEventListener("input", hideScenarioOutput);
document.addEventListener("change", hideScenarioOutput);