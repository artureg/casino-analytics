import process from 'node:process';
import ExcelJS from 'exceljs';
import { promises as fs } from "fs";

const BASE_URL = process.env.PAYADMIT_BASE_URL;

function buildQuery(updatedgte, updatedlte, offset, limit) {
  const params = new URLSearchParams();
  params.set('offset', String(offset));
  params.set('updated.gte', String(updatedgte));
  if (updatedlte) {
    params.set('updated.lte', String(updatedlte));
  }
  params.set('limit', String(limit));
  return params;
}

async function fetchJSON(url, apiKey, options = {}, retries = 0) {
  let res = {}
  try {
    console.log(`Fetching ${apiKey?.slice(0, 6)}...${apiKey?.slice(-6)} ${url}, retries left: ${retries}`);
    res = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
        ...options.headers
      }
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${apiKey?.slice(0, 6)}...${apiKey?.slice(-6)} ${res.status} ${res.statusText} — ${text || 'no body'}`);
    }
    return await res.json();
  } catch (err) {
    if (retries > 0) {
      if (res.status === 429) {
        const PAUSE = 75000;
        console.log(`Rate limited, waiting ${PAUSE / 1000} seconds...`);
        await new Promise(r => setTimeout(r, PAUSE));
      } else if (res.status === 401) {
        console.log(err.message || err, `skip...`);
        return;
      } else {
        console.log(err.message || err, `waiting ${(3 - retries) * 10} seconds...`);
        await new Promise(r => setTimeout(r, (3 - retries) * 10000));
      }
      return fetchJSON(url, apiKey, options, retries - 1);
    }
    console.error(err)
  }
}


async function fetchAllPayments(merchant, shop, apiKey, updatetgte, updatedlte, retries) {
  const LIMIT = 1000;
  const all = [];
  let offset = 0;
  for (; ;) {
    const qp = buildQuery(updatetgte, updatedlte, offset, LIMIT);
    const url = `${BASE_URL}/payments?${qp.toString()}`;

    const data = await fetchJSON(url, apiKey, {}, retries);
    if (!data || !Array.isArray(data.result)) {
      throw new Error(data);
    }
    //console.log(data)
    all.push(...data.result.map(p => ({...p, merchant, shop})));

    const got = data.result.length;
    const hasMore = Boolean(data.hasMore);
    if (!hasMore || got === 0) break;
    offset += got;
    const PAUSE = 25000;
    console.log(`Waiting next page ${offset}...${offset + LIMIT} ${all.length}, pause ${PAUSE / 1000}s...`);
    await new Promise(resolve => setTimeout(resolve, PAUSE));
  }
  console.log(`Fetched total ${all.length} payments for ${merchant} / ${shop}`);
  return all;
}

const get = (obj, pathStr, def = undefined) =>
  pathStr.split('.').reduce((acc, k) => (acc && acc[k] != null ? acc[k] : undefined), obj) ?? def;

function replacePaymentMethod(method){
  switch (method) {
    case 'BASIC_CARD':
      return 'Basic Card';
    case 'MANUAL_OPERATION':
      return 'Manual Operation';
    default:
      return method;
  }
}

function replaceType(type){
  switch (type) {
    case 'DEPOSIT':
      return 'Deposit';
    case 'WITHDRAWAL':
      return 'Withdrawal';
    default:
      return method;
  }
}

function flattenPayment(p) {
  return {
    id: p.id ?? '',
    created: p.created ? p.created.replace("T", " "):'',
    updated: p.updated ? p.updated.replace("T", " "):'',
    referenceId: p.referenceId ?? '',
    paymentType: p.paymentType ? replaceType(p.paymentType) : '',
    state: p.state ?? '',
    description: p.description ?? '',
    parentPaymentId: p.parentPaymentId ?? '',
    paymentMethod: p.paymentMethod ? replacePaymentMethod(p.paymentMethod) : '',
    amount: p.amount ?? '',
    currency: p.currency ?? '',
    customerAmount: p.customerAmount ?? '',
    customerCurrency: p.customerCurrency ?? '',
    errorCode: p.errorCode ?? '',
    externalResultCode: p.externalResultCode ?? '',
    terminalName: p.terminalName ?? '',
    startRecurring: p.startRecurring ?? '',
    recurringToken: p.recurringToken ?? '',
    redirectUrl: p.redirectUrl ?? '',
    merchant: p.merchant ?? '',
    shop: p.shop ?? '',
    cardBrand: p.cardBrand ?? get(p, 'paymentMethodDetails.cardBrand', '-'),
    externalRefs: JSON.stringify(p.externalRefs || {}),
    paymentMethodDetails: JSON.stringify(p.paymentMethodDetails || {}),
    customer_id: get(p, 'customer.id', ''),
    customer_email: get(p, 'customer.email', ''),
    customer_phone: get(p, 'customer.phone', ''),
    billing_country: get(p, 'billingAddress.country', ''),
    billing_city: get(p, 'billingAddress.city', ''),
    billing_zip: get(p, 'billingAddress.postalCode', ''),
    billing_line1: get(p, 'billingAddress.addressLine1', ''),
    billing_line2: get(p, 'billingAddress.addressLine2', ''),
  };
}

async function saveToExcel(rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Payments');


  const columns = [
    {header: 'Id', key: 'id', width: 20},
    {header: 'Parent Payment Id', key: 'parentPaymentId', width: 22},
    {header: 'Created', key: 'created', width: 22},
    {header: 'Updated', key: 'updated', width: 22},
    {header: 'Type', key: 'paymentType', width: 16},
    {header: 'State', key: 'state', width: 14},
    {header: 'Method', key: 'paymentMethod', width: 20},
    {header: 'Error Code', key: 'errorCode', width: 16},
    {header: 'External Result Code', key: 'externalResultCode', width: 20},
    {header: 'Amount', key: 'amount', width: 12},
    {header: 'Currency', key: 'currency', width: 10},
    {header: 'Terminal', key: 'terminalName', width: 20},
    {header: 'Merchant', key: 'merchant', width: 20},
    {header: 'Shop', key: 'shop', width: 20},
    {header: 'Card Brand', key: 'cardBrand', width: 20},
    {header: 'Description', key: 'description', width: 40},
    {header: 'customer_id', key: 'customer_id', width: 18}, //??? Customer Account Number
    {header: 'Customer Email', key: 'customer_email', width: 28},
    {header: 'External References', key: 'externalRefs', width: 30},
    {header: 'Reference Id', key: 'referenceId', width: 28},

    // { header: 'customerAmount', key: 'customerAmount', width: 16 },
    // { header: 'customerCurrency', key: 'customerCurrency', width: 16 },
    // { header: 'startRecurring', key: 'startRecurring', width: 16 },
    // { header: 'recurringToken', key: 'recurringToken', width: 24 },
    // { header: 'redirectUrl', key: 'redirectUrl', width: 40 },
    // { header: 'externalRefs', key: 'externalRefs', width: 30 },
    // { header: 'paymentMethodDetails', key: 'paymentMethodDetails', width: 30 },
    // { header: 'customer_id', key: 'customer_id', width: 18 },
    // { header: 'customer_email', key: 'customer_email', width: 28 },
    // { header: 'customer_phone', key: 'customer_phone', width: 18 },
    // { header: 'billing_country', key: 'billing_country', width: 10 },
    // { header: 'billing_city', key: 'billing_city', width: 16 },
    // { header: 'billing_zip', key: 'billing_zip', width: 12 },
    // { header: 'billing_line1', key: 'billing_line1', width: 28 },
    // { header: 'billing_line2', key: 'billing_line2', width: 28 },
  ];
  ws.columns = columns;
  ws.addRows(rows);
  ws.getRow(1).font = {bold: true};
  ws.autoFilter = {
    from: {row: 1, column: 1},
    to: {row: 1, column: columns.length}
  };

  return await wb.xlsx.writeBuffer();
}

async function loadCsvWithKeys(){
  const filePath = process.env.PAYADMIT_API_KEY_CSV_LINK;
  const content = await fs.readFile(filePath, 'utf8');
  const lines = content.trim().split(/\r?\n/);
  const headers = lines.shift().split(',');
  const expected = ['shop_name', 'shop_id', 'merchant_name', 'merchant_id', 'api_token'];
  if (headers.join() !== expected.join()) {
    console.error('Wrong CSV headers:', headers);
  }

  return lines.map(line => {
    const [shop_name, shop_id, merchant_name, merchant_id, api_token] = line.split(',').map(s => s.trim());
    return {
      shop: shop_name,
      shopId: shop_id,
      merchant: merchant_name,
      merchantId: merchant_id,
      key: api_token
    };
  }).filter(item => !!item.key && item.key.length === 32);
}

export async function createReport(fromDate, toDate, retries = 3) {
  const startTs = Date.now();

  const keys = await loadCsvWithKeys();
  //console.log(keys)

  let rows = [];
  for (const {merchant, shop, key} of keys) {
    try {
      const raw = await fetchAllPayments(merchant, shop, key, fromDate, toDate, retries);
      rows.push(...raw.map(flattenPayment));
      const ms = Date.now() - startTs;
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (e) {
      console.error(e?.message || e);
    }
  }

  rows.sort((a, b) => new Date(b.updated) - new Date(a.updated));
  //console.log(rows);
  return await saveToExcel(rows);
}

