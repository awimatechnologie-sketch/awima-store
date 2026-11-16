import { adminMisses, adminMissAct } from '../../../server/handlers.js';
export const onRequestGet = ({ request, env }) => adminMisses(request, env);
export const onRequestPost = ({ request, env }) => adminMissAct(request, env);
