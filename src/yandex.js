import process from 'node:process';
import ExcelJS from 'exceljs';
import { promises as fs } from "fs";

const YANDEX_COUNTER_ID = process.env.YANDEX_COUNTER_ID;
const YANDEX_CLIENT_ID = process.env.YANDEX_CLIENT_ID;
const YANDEX_SECRET = process.env.YANDEX_SECRET;
const YANDEX_CODE = process.env.YANDEX_CODE;
const YANDEX_ACCESS_TOKEN = process.env.YANDEX_ACCESS_TOKEN;
const YANDEX_REFRESH_TOKEN = process.env.YANDEX_REFRESH_TOKEN;



/**
 * Обновляет access_token Яндекса с помощью refresh_token
 *
 * @param {string} clientId - Client ID из настроек приложения
 * @param {string} clientSecret - Client Secret из настроек приложения
 * @param {string} refreshToken - refresh_token, полученный ранее
 * @returns {Promise<Object>} Новый токен (access_token, expires_in, refresh_token и т.д.)
 */
async function refreshYandexAccessToken() {
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: YANDEX_REFRESH_TOKEN,
    client_id: YANDEX_CLIENT_ID,
    client_secret: YANDEX_SECRET,
  });

  const res = await fetch("https://oauth.yandex.ru/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Ошибка при обновлении токена: ${res.status} ${errorText}`);
  }

  return res.json();
}


/**
 * Обменивает authorization code на OAuth токен Яндекса
 * @param {string} clientId - идентификатор приложения (Client ID)
 * @param {string} clientSecret - секрет приложения (Client Secret)
 * @param {string} code - код авторизации, полученный от Яндекс OAuth
 * @param {string} [redirectUri] - redirect URI, если использовался при авторизации
 * @returns {Promise<Object>} - объект с токенами (access_token, refresh_token, expires_in и т.д.)
 */
async function getYandexOAuthToken() {

  //
  // const code = await fetch("https://oauth.yandex.ru/authorize?response_type=code&client_id=" + YANDEX_CLIENT_ID, {
  //   method: "GET",
  //   headers: {
  //     "Content-Type": "application/json",
  //   },
  // });
  // console.log(await code.json())
  //
  // if (!code.ok) {
  //   const errorText = await code.text();
  //   throw new Error(`Ошибка при получении кода: ${code.status} ${errorText}`);
  // }

  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code: YANDEX_CODE,
    client_id: YANDEX_CLIENT_ID,
    client_secret: YANDEX_SECRET,
  });

  const res = await fetch("https://oauth.yandex.ru/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Ошибка при получении токена: ${res.status} ${errorText}`);
  }

  return res.json();
}

async function getYandexMetrikaReport(options = {}) {
  const params = new URLSearchParams({
    ids: YANDEX_COUNTER_ID,
    metrics: options.metrics,
    date1: options.date1,
    date2: options.date2,
    dimensions: options.dimensions,
    // limit: options.limit || "100",
    accuracy: "full",
  });

  const res = await fetch(`https://api-metrika.yandex.net/stat/v1/data?${params.toString()}`, {
    method: "GET",
    headers: {
      "Authorization": `OAuth ${YANDEX_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ошибка при запросе отчёта: ${res.status} ${text}`);
  }

  return res.json();
}

export async function getUsersFromYandexReport(){
 //console.log(await getYandexOAuthToken())
 //console.log(await refreshYandexAccessToken())
 const report = await getYandexMetrikaReport({
    metrics: "ym:s:users",
    date1: "yesterday",
    date2: "yesterday",
    dimensions: "ym:s:date",
 });
 // console.log(report.data)
 // console.log(report.data[0].metrics[0])
 return report.data[0].metrics[0]
}

const formatDate = (d) => d.toISOString().split("T")[0];

export async function getEarlyChurnYandexReport(){
  //console.log(await getYandexOAuthToken())
  //console.log(await refreshYandexAccessToken())
  const report = await getYandexMetrikaReport({
    metrics: [
      "ym:s:visits",                     // Визиты
      "ym:s:users",                      // Посетители
      "ym:s:pageviews",                  // Просмотры
      "ym:s:percentNewVisitors",         // Доля новых посетителей
      "ym:s:bounceRate",                 // Отказы
      "ym:s:pageDepth",                  // Глубина просмотра
      "ym:s:avgVisitDurationSeconds"     // Время на сайте
    ].join(","),
    date1: formatDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
    date2: "yesterday",
    dimensions: "ym:s:date",
    group: "day",
    attribution: "lastsign", // из attr
    accuracy: "full", // эквивалентно isMinSamplingEnabled=false
  });
  // console.log(report.data)
  // console.log(report.data[0].metrics[0])
  return report.data.map((row) => [row.dimensions[0].name, ...row.metrics]);
}
