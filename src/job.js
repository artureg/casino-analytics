import {betconstructLoadReport} from "./betconstruct.js";
import * as XLSX from 'xlsx';
import {getEarlyChurnYandexReport, getUsersFromYandexReport} from "./yandex.js";
import {generateXlsxBuffer} from "./utils/xlsx.js";
import {sendReportToTelegram} from "./telegram.js";
import {readAllXlsxFromSharePointFolder} from "./sharepoints.js";


async function reg2depReport() {
   const bcReport = await betconstructLoadReport("https://crm.betconstruct.com/crm/report/executed/0/609718/list");
   const workbook = XLSX.read(bcReport, { type: 'buffer' });
   const sheetName = workbook.SheetNames[0];
   const sheet = workbook.Sheets[sheetName];
   const data = XLSX.utils.sheet_to_json(sheet);

   const players_registered = data.length;

   const unique_users_visited = await getUsersFromYandexReport();
   console.log(`unique_users_visited: ${unique_users_visited}, players_registered: ${players_registered}`);

   const xlxs = await generateXlsxBuffer(
     ["Date","Unique_users_visited", "Players_registered"],
     [[new Date(), unique_users_visited, players_registered]]
   );

   await sendReportToTelegram(xlxs, `reg2dep_${new Date().toISOString().split('T')[0]}.xlsx`, "reg2depReport");
}

export function dedupeAndToValues(data) {
   const map = new Map();

   for (const item of data) {
      const id = item.Id;
      if (!id) continue;

      const existing = map.get(id);
      const updatedTime = new Date(item.Updated).getTime();

      if (!existing || updatedTime > new Date(existing.Updated).getTime()) {
         map.set(id, item);
      }
   }
   const uniqueObjects = Array.from(map.values());
   const columns = uniqueObjects.length > 0 ? Object.keys(uniqueObjects[0]) : [];
   const values = uniqueObjects.map(obj => columns.map(col => obj[col]));

   return values;
}

async function earlyChurn() {
    //const bcReport = await betconstructLoadReport("https://crm.betconstruct.com/crm/report/executed/0/609754/list");
   // const workbook = XLSX.read(bcReport, { type: 'buffer' });
   // const sheetName = workbook.SheetNames[0];
   // const sheet = workbook.Sheets[sheetName];
   // const data = XLSX.utils.sheet_to_json(sheet);
   //
   // console.log(data)

   // //const ydata = await getEarlyChurnYandexReport();
   // const yreport = await generateXlsxBuffer([
   //   "Дата",
   //   "Визиты",
   //   "Посетители",
   //   "Просмотры",
   //   "Доля новых посетителей (%)",
   //   "Отказы (%)",
   //   "Глубина просмотра",
   //   "Время на сайте (сек)"
   // ], ydata)

   const padmit =  await readAllXlsxFromSharePointFolder("2025-10-01");
   console.log(padmit.data);
   const preport = await generateXlsxBuffer(padmit.columns, dedupeAndToValues(padmit.data), "padmit");
   await sendReportToTelegram(preport, `yreport_${new Date().toISOString().split('T')[0]}.xlsx`, "yreport");

}

export default async function runJob() {
   //await reg2depReport();
   //await earlyChurn();
}


