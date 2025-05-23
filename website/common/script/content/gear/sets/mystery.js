import defaults from 'lodash/defaults';
import forEach from 'lodash/forEach';
import t from '../../translation';

const armor = {
  201402: { },
  201403: { },
  201405: { },
  201406: { },
  201407: { },
  201408: { },
  201409: { },
  201410: { },
  201412: { },
  201501: { },
  201503: { },
  201504: { },
  201506: { },
  201508: { },
  201509: { },
  201511: { },
  201512: { },
  201603: { },
  201604: { },
  201605: { },
  201606: { },
  201607: { },
  201609: { },
  201610: { },
  201612: { },
  201703: { },
  201704: { },
  201707: { },
  201710: { },
  201711: { },
  201712: { },
  201802: { },
  201806: { },
  201807: { },
  201808: { },
  201809: { },
  201810: { },
  201903: { },
  201904: { },
  201906: { },
  201907: { },
  201908: { },
  201909: { },
  201910: { },
  202006: { },
  202007: { },
  202101: { },
  202102: { },
  202103: { },
  202104: { },
  202106: { },
  202110: { },
  202112: { },
  202204: { },
  202207: { },
  202210: { },
  202212: { },
  202304: { },
  202306: { },
  202307: { },
  202310: { },
  202401: { },
  202406: { },
  202407: { },
  202412: { },
  202502: { },
  202504: { },
  301404: { },
  301703: { },
  301704: { },
};

const back = {
  201402: { },
  201404: { },
  201410: { },
  201504: { },
  201507: { },
  201510: { },
  201602: { },
  201608: { },
  201702: { },
  201704: { },
  201706: { },
  201709: { },
  201801: { },
  201803: { },
  201804: { },
  201805: { },
  201812: { },
  201905: { },
  201912: { },
  202001: { },
  202004: { },
  202005: { },
  202009: { },
  202010: { },
  202012: { },
  202105: { },
  202109: { },
  202203: { },
  202205: { },
  202206: { },
  202301: { },
  202302: { },
  202305: { },
  202309: { },
  202401: { },
  202402: { },
  202405: { },
  202410: { },
  202505: { },
};

const body = {
  201705: { },
  201706: { },
  201711: { },
  201901: { },
  202002: { },
  202003: { },
  202008: { },
  202107: { },
  202411: { },
};

const eyewear = {
  201503: { },
  201506: { },
  201507: { },
  201701: { },
  201902: { },
  201907: { },
  202108: { },
  202201: { },
  202202: { },
  '202204A': { mystery: '202204' },
  '202204B': { mystery: '202204' },
  202208: { },
  202303: { },
  202308: { },
  202312: { },
  202406: { },
  202503: { },
  301404: { },
  301405: { },
  301703: { },
};

const head = {
  201402: { },
  201405: { },
  201406: { },
  201407: { },
  201408: { },
  201411: { },
  201412: { },
  201501: { },
  201505: { },
  201508: { },
  201509: { },
  201511: { },
  201512: { },
  201601: { },
  201602: { },
  201603: { },
  201604: { },
  201605: { },
  201606: { },
  201607: { },
  201608: { },
  201609: { },
  201610: { },
  201611: { },
  201612: { },
  201702: { },
  201703: { },
  201705: { },
  201707: { },
  201710: { },
  201712: { },
  201802: { },
  201803: { },
  201805: { },
  201806: { },
  201807: { },
  201808: { },
  201809: { },
  201810: { },
  201811: { },
  201901: { },
  201903: { },
  201904: { },
  201907: { },
  201909: { },
  201910: { },
  201911: { },
  201912: { },
  202001: { },
  202003: { },
  202006: { },
  202007: { },
  202008: { },
  202010: { },
  202011: { },
  202012: { },
  202101: { },
  202103: { },
  202106: { },
  202107: { },
  202108: { },
  202110: { },
  202111: { },
  202112: { },
  202202: { },
  202206: { },
  202207: { },
  202208: { },
  202210: { },
  202211: { },
  202301: { },
  202303: { },
  202304: { },
  202308: { },
  202310: { },
  202311: { },
  202312: { },
  202402: { },
  202403: { },
  202404: { },
  202406: { },
  202407: { },
  202409: { },
  202411: { },
  202412: { },
  202501: { },
  202502: { },
  202503: { },
  202504: { },
  301404: { },
  301405: { },
  301703: { },
  301704: { },
};

const headAccessory = {
  201403: { },
  201404: { },
  201409: { },
  201502: { },
  201510: { },
  201801: { },
  201804: { },
  201812: { },
  201905: { },
  201906: { },
  201908: { },
  202004: { },
  202005: { },
  202009: { },
  202102: { },
  202105: { },
  202109: { },
  202203: { },
  202212: { },
  202205: { },
  202307: { },
  202302: { },
  202305: { },
  202309: { },
  202310: { },
  202405: { },
  202410: { },
  202505: { },
  301405: { },
};

const shield = {
  201601: { },
  201701: { },
  201708: { },
  201709: { },
  201802: { },
  201902: { },
  202011: { },
  202209: { },
  202408: { },
  202409: { },
  202501: { },
  202502: { },
  301405: { },
  301704: { },
};

const weapon = {
  201411: { },
  201502: { },
  201505: { },
  201611: { },
  201708: { },
  201811: { },
  201911: { },
  202002: { },
  202102: { },
  202104: { twoHanded: true },
  202111: { twoHanded: true },
  202211: { twoHanded: true },
  202201: { },
  202212: { },
  202209: { },
  202306: { },
  202311: { },
  202403: { },
  202404: { twoHanded: true },
  202408: { },
  301404: { },
};

forEach({
  armor,
  back,
  body,
  eyewear,
  head,
  headAccessory,
  shield,
  weapon,
}, (gearType, typeKey) => {
  forEach(gearType, (gearItem, itemKey) => {
    defaults(gearItem, {
      text: (t(`${typeKey}Mystery${itemKey}Text`)),
      notes: (t(`${typeKey}Mystery${itemKey}Notes`)),
      mystery: itemKey,
      value: 0,
    });
  });
});

export {
  armor,
  back,
  body,
  eyewear,
  head,
  headAccessory,
  shield,
  weapon,
};
