import puppeteer from 'puppeteer';
import {authenticator} from 'otplib';
import {writeFileSync} from 'fs';

export async function betconstructLoadReport(url, delayAfterGenerationMs = 60 * 1000) {
  const browser = await puppeteer.launch({headless: true,   args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-notifications',
      '--disable-popup-blocking',
      '--disable-save-password-bubble',
      '--no-first-run',
      '--no-default-browser-check'
    ]});
  const page = await browser.newPage();


  page.setDefaultTimeout(6000000);
  page.setDefaultNavigationTimeout(6000000)

  // === 1. Заходим на страницу логина ===
  await page.goto(url);

  // Вводим логин/пароль
  await page.waitForSelector('input[data-key="email"]');
  await page.type('input[data-key="email"]', 'paliashcuk.a@ns.cards');
  await page.type('input[data-key="password"]', 'PAdmin-25925!');
  await page.click('li.c-footer > button');

  // Ждём перехода после логина
  await page.waitForNavigation();

  // === 2. 2FA ===
  await page.waitForSelector('input[type="number"][placeholder="Pin code"]');
  const code = authenticator.generate("HWEGQ6CS4WF3EDR3R3UIC354NWWI3GWF");
  await page.type('input[type="number"][placeholder="Pin code"]', code);
  await page.click('li.c-footer > button');

  //maintenance popup
  await page.waitForSelector('button:has(i.icon.bc-icon-status-play)');
  try {
    await new Promise(r => setTimeout(r, 3000));
    await page.click('div.modal-footer > button.btn.a-minimal.s-default.f-default.c-default.id-start.cr-round');
  } catch (e) {
    console.log('No maintenance popup', e);
  }

  // Ждём появления кнопки запуска отчёта
  console.log('wait for ', 'run button button:has(i.icon.bc-icon-status-play)');
  await page.waitForSelector('button:has(i.icon.bc-icon-status-play)');
  await page.click('button:has(i.icon.bc-icon-status-play)');

  console.log('wait for ', 'approve button div.modal-footer > button.btn.a-default.s-default.f-default.c-primary.id-start.cr-round');
  await page.waitForSelector('div.modal-footer > button.btn.a-default.s-default.f-default.c-primary.id-start.cr-round');
  await page.click('div.modal-footer > button.btn.a-default.s-default.f-default.c-primary.id-start.cr-round');

  console.log('Report generation started, waiting for completion...');
  // === 3. Ждём последнюю свежую запись со статусом Done ===
  async function checkLatestRow() {
    return await page.evaluate(() => {
      const rows = document.querySelectorAll('.ta-body .ta-row');
      if (!rows.length) return null;

      const row = rows[0]; // предположим, что самая свежая сверху
      const dateEl = row.querySelector('[data-id*="CreatedDate"] .ellipsis-text').textContent;
      const statusEl = row.querySelector('[data-id*="Status"] .ellipsis-text div').textContent;
      if (!dateEl || statusEl !== 'Done') return null;
      console.log('dateEl', dateEl, 'statusEl', statusEl);

      const dateStr = dateEl.trim(); // 26.09.2025 13:34:01
      const [day, month, rest] = dateStr.split('.');
      const [year, time] = rest.split(' ');
      const iso = `${year}-${month}-${day}T${time}`;
      const created = new Date(iso);
      const diffMinutes = (Date.now() - created.getTime()) / 60000;
      console.log(diffMinutes)

      return {
        fresh: diffMinutes <= 0,
        status: statusEl.trim(),
      };
    });
  }

  const waitDeadline = Date.now() + 15 * 60 * 1000;
  let ready = false;

  while (Date.now() < waitDeadline && !ready) {
    await new Promise(r => setTimeout(r, 5000));
    console.log('wait for ', 'refresh button button:has(i.icon.bc-icon-reset)');
    await page.waitForSelector('button:has(i.icon.bc-icon-reset)');
    await page.click('button:has(i.icon.bc-icon-reset)');
    await new Promise(r => setTimeout(r, 5000));

    const info = await checkLatestRow();
    console.log('Latest row info:', info);
    if (info && info.fresh && info.status === 'Done') {
      ready = true;
      break;
    }
  }
  if (!ready) throw new Error('Не дождались статуса Done');

  console.log('Строка готова, начинаем загрузку файла...');

  // === 4. Перехватываем ответ скачивания ===
  const [response] = await Promise.all([
    page.waitForResponse(resp =>
      resp.headers()['content-disposition']?.includes('attachment')
    ),
    page.evaluate(() => {
      const row = document.querySelector('.ta-body .ta-row');
      const btn = row.querySelector('.bc-icon-download');
      if (btn) {
        btn.closest('button').click();
      }
    })
  ]);

  // === 5. Получаем буфер и сохраняем ===
  const buffer = await response.buffer();
  //writeFileSync('report.xlsx', buffer);
  //console.log('Файл сохранён как report.xlsx');

  await browser.disconnect();
  browser.process()?.kill('SIGKILL');
  return buffer
}
