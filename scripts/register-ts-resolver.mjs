// يسمح لاختبارات Node بتحميل ملفات src/*.ts التي تستورد بلا امتداد (كما يفعل Vite/Astro):
// './hours' ← './hours.ts' و'../i18n' ← '../i18n/index.ts'
import { register } from 'node:module';
register('./ts-resolver-hooks.mjs', import.meta.url);
