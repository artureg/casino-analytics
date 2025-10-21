import  parser from "otpauth-migration-parser";
import { authenticator } from 'otplib';

const url = 'otpauth-migration://offline?data=CkkKFD2IaHhS5YuyDjuO6IFvvG2sjZrFEhVwYWxpYXNoY3VrLmFAbnMuY2FyZHMaFEJldENvbnN0cnVjdC1EZXYtU1NPIAEoATACEAIYASAA'; // твоя ссылка
const migration = await parser(url);

console.log(migration[0]);

migration.forEach(account => {
  const secretBase32 = account.secret.toString('base32'); // Base32 ключ
  console.log(`Имя: ${account.name}`);
  console.log(`Issuer: ${account.issuer}`);
  console.log(`Секрет: ${secretBase32}`);

  // Генерация TOTP-кода
  const code = authenticator.generate(secretBase32);
  console.log(`Код: ${code}`);
});
