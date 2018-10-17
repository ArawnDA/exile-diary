const logger = require('./Log').getLogger(__filename);
const DB = require('./DB').getDB();
const EventEmitter = require('events');
const Parser = require('./FilterParser');
const ClientTxtWatcher = require('./ClientTxtWatcher');
const RateGetter = require('./RateGetter');

class MapRun extends EventEmitter {

  constructor(mapID) {
    super();
    this.init(mapID);
  }

  async init(mapID) {
    this.id = mapID;
    this.parser = await Parser.get(mapID);
    this.rates = await RateGetter.getFor(mapID);
    this.nav = {
      prev : await getPrevMap(mapID),
      next : await getNextMap(mapID),
    }
    this.info = await getInfo(mapID);
    this.mods = await getMods(mapID);
    this.events = await getEvents(mapID);
    this.items = await getItems(mapID);
    this.emit("MapRunReady", mapID);
  }

}

async function getPrevMap(mapID) {
  return new Promise((resolve, reject) => {
    DB.get("select id from mapruns where id < ? order by id desc limit 1", [mapID], (err, row) => {
      if (err) {
        logger.error(`Unable to get previous map: ${err}`);
        resolve(null);
      } else {
        resolve (row && row.id !== -1 ? row.id : null);
      }
    });
  });
}

async function getNextMap(mapID) {
  return new Promise((resolve, reject) => {
    DB.get("select id from mapruns where id > ? order by id limit 1", [mapID], (err, row) => {
      if (err) {
        logger.error(`Unable to get next map: ${err}`);
        resolve(null);
      } else {
        resolve (row && row.id !== -1 ? row.id : null);
      }
    });
  });
}

async function getInfo(mapID) {
  return new Promise((resolve, reject) => {
    DB.get(`
      select name, level, depth, iiq, iir, packsize, xp,
      (select xp from mapruns m where m.id < mapruns.id and xp is not null order by m.id desc limit 1) prevxp
      from areainfo, mapruns where mapruns.id = ? and areainfo.id = ?
    `, [mapID, mapID], (err, row) => {
      if (err) {
        logger.error(`Unable to get next map: ${err}`);
        resolve(null);
      } else {
        resolve({
          name: row.name,
          level: row.level,
          depth: row.depth,
          iiq: row.iiq,
          iir: row.iir,
          packsize: row.packsize,
          xp: row.xp,
          prevxp: row.prevxp
        });
      }
    });
  });
}

async function getMods(mapID) {
  return new Promise((resolve, reject) => {
    var arr = [];
    DB.all("select mod from mapmods where area_id = ? order by cast(id as integer)", [mapID], (err, rows) => {
      if (err) {
        logger.error(`Unable to get next map: ${err}`);
        resolve(null);
      } else {
        rows.forEach(row => arr.push(row.mod));
        resolve(arr);
      }
    });
  });
}

async function getEvents(mapID) {
  return new Promise((resolve, reject) => {
    var events = {};
    DB.all(`
            select events.* from mapruns, events 
            where mapruns.id = ?
            and events.id between mapruns.firstevent and mapruns.lastevent 
            order by events.id;
          `, [mapID], (err, rows) => {
      if (err) {
        logger.info(`Failed to get run events: ${err}`);
      } else {
        rows.forEach(row => {
          if(row.event_type !== "chat") {
            events[row.id] = {
              event_type: row.event_type,
              event_text: row.event_text
            };
          }
        });
        resolve(events);
      }
    });
  });

}

async function getItems(mapID) {
  return new Promise((resolve, reject) => {
    var items = {};
    DB.all(`
            select events.id, items.rawdata from mapruns, events, items
            where mapruns.id = ?
            and events.id between mapruns.firstevent and mapruns.lastevent
            and items.event_id = events.id;
          `, [mapID], (err, rows) => {
      if (err) {
        logger.info(`Failed to get run events: ${err}`);
      } else {
        rows.forEach(row => {
          if(!items[row.id]) {
            items[row.id] = [];
          }
          items[row.id].push(row.rawdata);
        });
        resolve(items);
      }
    });
  });

}

module.exports = MapRun;