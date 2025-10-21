import axios from "axios";
import { ConfidentialClientApplication } from "@azure/msal-node";
import * as XLSX from "xlsx";

const {
  MSAL_SP_URL,
  MSAL_CLIENT_ID,
  MSAL_CLIENT_SECRET,
  MSAL_TENANT_ID,
  MSAL_FOLDER_PATH,
} = process.env;

const msalApp = new ConfidentialClientApplication({
  auth: {
    clientId: MSAL_CLIENT_ID,
    clientSecret: MSAL_CLIENT_SECRET,
    authority: `https://login.microsoftonline.com/${MSAL_TENANT_ID}`,
  },
});

export default async function uploadToSharePoint(fileName, buffer) {
  if (!MSAL_SP_URL || !MSAL_CLIENT_ID || !MSAL_CLIENT_SECRET || !MSAL_TENANT_ID || !MSAL_FOLDER_PATH) {
    throw new Error("Сheck vars: MSAL_SP_URL, MSAL_CLIENT_ID, MSAL_CLIENT_SECRET, MSAL_TENANT_ID, MSAL_FOLDER_PATH");
  }
  if (!fileName || !buffer) {
    throw new Error("fileName и buffer");
  }
  const { accessToken } = await msalApp.acquireTokenByClientCredential({
    scopes: ["https://graph.microsoft.com/.default"],
  });
  const { hostname, pathname } = new URL(MSAL_SP_URL);
  const sitePath = pathname.replace(/^\/+/, ""); // например: "sites/next-on"
  const siteResp = await axios.get(
    `https://graph.microsoft.com/v1.0/sites/${hostname}:/${sitePath}?$select=id`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const siteId = siteResp.data.id;

  const sessionResp = await axios.post(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${encodeURI(MSAL_FOLDER_PATH)}/${encodeURIComponent(fileName)}:/createUploadSession`,
    { item: { "@microsoft.graph.conflictBehavior": "replace" } },
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const uploadUrl = sessionResp.data.uploadUrl;

  const total = buffer.length ?? buffer.byteLength;
  const chunkSize = 5 * 1024 * 1024; // 5MB
  let offset = 0;
  let lastItem = null;

  while (offset < total) {
    const end = Math.min(offset + chunkSize, total);
    const chunk = buffer.subarray
      ? buffer.subarray(offset, end)
      : buffer.slice(offset, end);

    const resp = await axios.put(uploadUrl, chunk, {
      headers: {
        "Content-Length": end - offset,
        "Content-Range": `bytes ${offset}-${end - 1}/${total}`,
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
    if (resp && resp.data && resp.data.id) {
      lastItem = resp.data;
    }
    offset = end;
  }

  if (lastItem) return lastItem;

  const itemResp = await axios.get(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${encodeURI(MSAL_FOLDER_PATH)}/${encodeURIComponent(fileName)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  return itemResp.data;
}

export async function readAllXlsxFromSharePointFolder(from, to) {
  if (!MSAL_FOLDER_PATH || !MSAL_SP_URL) {
    throw new Error("Не заданы MSAL_SP_URL или MSAL_FOLDER_PATH");
  }

  const { accessToken } = await msalApp.acquireTokenByClientCredential({
    scopes: ["https://graph.microsoft.com/.default"],
  });

  const { hostname, pathname } = new URL(MSAL_SP_URL);
  const sitePath = pathname.replace(/^\/+/, "");

  // Получаем siteId
  const siteResp = await axios.get(
    `https://graph.microsoft.com/v1.0/sites/${hostname}:/${sitePath}?$select=id`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const siteId = siteResp.data.id;

  // Получаем список файлов в папке
  const listResp = await axios.get(
    `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${encodeURI(MSAL_FOLDER_PATH)}:/children`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  const files = listResp.data.value.filter((item) => item.name.endsWith(".xlsx") && !item.folder);

  // --- Фильтр по дате ---
  let filtered = files;
  if (from || to) {
    const fromDate = from ? new Date(from) : new Date("1970-01-01");
    const toDate = to ? new Date(to) : new Date();
    filtered = files.filter((f) => {
      const modified = new Date(f.lastModifiedDateTime);
      return modified >= fromDate && modified <= toDate;
    });
  }

  if (filtered.length === 0) {
    throw new Error("Нет .xlsx файлов, удовлетворяющих условиям даты");
  }

  let allData = [];
  let columns = [];

  for (const file of filtered) {
    console.log(`Загружаем и парсим файл ${file.name}...`);
    const fileResp = await axios.get(file["@microsoft.graph.downloadUrl"], {
      responseType: "arraybuffer",
    });
    const workbook = XLSX.read(fileResp.data, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json(sheet, { defval: null });

    if (columns.length === 0 && json.length > 0) {
      columns = Object.keys(json[0]);
    }

    allData = allData.concat(json);
  }

  return { columns, data: allData };
}
