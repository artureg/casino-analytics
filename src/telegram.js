import TelegramBot from "node-telegram-bot-api";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID;


export async function sendReportToTelegram(buffer, filename, caption) {
  const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, {polling: false});
  return bot.sendDocument(TELEGRAM_CHANNEL_ID, buffer, {caption}, {
      filename,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    }
  );
}
